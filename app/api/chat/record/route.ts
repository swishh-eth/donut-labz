import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { createClient } from "@supabase/supabase-js";

const SPRINKLES_TOKEN = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";
const MIN_SPRINKLES_BALANCE = 100000n * 10n ** 18n; // 100,000 SPRINKLES

// Points calculation constants
const CHAT_REWARDS_START_TIME = 1765159200; // December 8th, 2025 2:00 AM UTC (aligned with SPRINKLES miner halving)
const HALVING_PERIOD = 30 * 24 * 60 * 60;
const MULTIPLIER_SCHEDULE = [2, 1, 0.5, 0.25, 0];
const BASE_POINTS_PER_MESSAGE = 1; // Flat rate for holding 100k SPRINKLES

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Primary RPC client (Alchemy)
const alchemyClient = createPublicClient({
  chain: base,
  transport: http("https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g"),
});

// Fallback RPC client (public Base RPC)
const publicRpcClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const getCurrentMultiplier = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  
  // If rewards haven't started yet, return the initial multiplier
  if (elapsed < 0) return MULTIPLIER_SCHEDULE[0];
  
  const halvings = Math.floor(elapsed / HALVING_PERIOD);
  if (halvings >= MULTIPLIER_SCHEDULE.length) return 0;
  return MULTIPLIER_SCHEDULE[halvings];
};

// Helper to get balance with fallback
async function getSprinklesBalance(address: string): Promise<bigint> {
  // Try Alchemy first
  try {
    const balance = await alchemyClient.readContract({
      address: SPRINKLES_TOKEN as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    console.log(`[chat-record] Alchemy RPC returned balance: ${formatUnits(balance, 18)} for ${address}`);
    return balance;
  } catch (alchemyError) {
    console.error(`[chat-record] Alchemy RPC failed for ${address}:`, alchemyError);
  }

  // Fallback to public RPC
  try {
    const balance = await publicRpcClient.readContract({
      address: SPRINKLES_TOKEN as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    console.log(`[chat-record] Public RPC returned balance: ${formatUnits(balance, 18)} for ${address}`);
    return balance;
  } catch (publicError) {
    console.error(`[chat-record] Public RPC also failed for ${address}:`, publicError);
    throw new Error("All RPC endpoints failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { senderAddress, message } = await request.json();

    if (!senderAddress) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const addressLower = senderAddress.toLowerCase();
    console.log(`[chat-record] Processing record for address: ${addressLower}`);

    const multiplier = getCurrentMultiplier();
    console.log(`[chat-record] Current multiplier: ${multiplier}x`);
    
    // If rewards have ended, don't record points
    if (multiplier === 0) {
      console.log(`[chat-record] Rewards ended for ${addressLower}`);
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        message: "Rewards have ended" 
      });
    }

    // Check SPRINKLES balance
    let balance: bigint = 0n;
    let hasEnoughSprinkles = false;
    
    try {
      balance = await getSprinklesBalance(addressLower);
      hasEnoughSprinkles = balance >= MIN_SPRINKLES_BALANCE;
      
      // Debug logging
      const balanceFormatted = formatUnits(balance, 18);
      const minRequired = formatUnits(MIN_SPRINKLES_BALANCE, 18);
      console.log(`[chat-record] Balance check for ${addressLower}: ${balanceFormatted} SPRINKLES (need ${minRequired}, eligible: ${hasEnoughSprinkles})`);
      
    } catch (e) {
      console.error(`[chat-record] All RPC calls failed for ${addressLower}:`, e);
      // On RPC failure, be generous and allow points (don't punish users for RPC issues)
      console.log(`[chat-record] RPC failed - granting points anyway to ${addressLower}`);
      hasEnoughSprinkles = true;
      balance = MIN_SPRINKLES_BALANCE;
    }

    // If user doesn't have enough SPRINKLES, no points
    if (!hasEnoughSprinkles) {
      const balanceFormatted = formatUnits(balance, 18);
      console.log(`[chat-record] ${addressLower} has ${balanceFormatted} SPRINKLES - not enough to earn (need 100,000)`);
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        balance: formatUnits(balance, 18),
        message: "Must hold 100,000 SPRINKLES to earn" 
      });
    }

    // Calculate points: base rate * halving multiplier
    const points = BASE_POINTS_PER_MESSAGE * multiplier;

    console.log(`[chat-record] Awarding ${points} points to ${addressLower} (multiplier: ${multiplier}x)`);

    // Check if user exists in chat_points table
    const { data: existing, error: fetchError } = await supabase
      .from("chat_points")
      .select("total_points, total_messages")
      .eq("address", addressLower)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine for new users
      console.error("[chat-record] Error fetching existing record:", fetchError);
    }

    if (existing) {
      // Update existing record
      const newTotalPoints = (existing.total_points || 0) + points;
      const newTotalMessages = (existing.total_messages || 0) + 1;
      
      const { error: updateError } = await supabase
        .from("chat_points")
        .update({ 
          total_points: newTotalPoints,
          total_messages: newTotalMessages,
          last_message_at: new Date().toISOString(),
          last_message: message?.slice(0, 280) || "",
          updated_at: new Date().toISOString(),
        })
        .eq("address", addressLower);
      
      if (updateError) {
        console.error("[chat-record] Failed to update chat_points:", updateError);
      } else {
        console.log(`[chat-record] Updated chat_points for ${addressLower}: ${existing.total_points} -> ${newTotalPoints} points, ${existing.total_messages} -> ${newTotalMessages} messages`);
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from("chat_points")
        .insert({
          address: addressLower,
          total_points: points,
          total_messages: 1,
          last_message_at: new Date().toISOString(),
          last_message: message?.slice(0, 280) || "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      
      if (insertError) {
        console.error("[chat-record] Failed to insert into chat_points:", insertError);
      } else {
        console.log(`[chat-record] Created chat_points entry for ${addressLower} with ${points} points`);
      }
    }

    // Also update chat_leaderboard for backward compatibility
    const { data: leaderboardExisting } = await supabase
      .from("chat_leaderboard")
      .select("total_points")
      .eq("address", addressLower)
      .single();

    if (leaderboardExisting) {
      const newTotal = leaderboardExisting.total_points + points;
      await supabase
        .from("chat_leaderboard")
        .update({ 
          total_points: newTotal,
          last_message_at: new Date().toISOString(),
        })
        .eq("address", addressLower);
      console.log(`[chat-record] Updated chat_leaderboard for ${addressLower}: ${newTotal} points`);
    } else {
      await supabase.from("chat_leaderboard").insert({
        address: addressLower,
        total_points: points,
        last_message_at: new Date().toISOString(),
      });
      console.log(`[chat-record] Created chat_leaderboard entry for ${addressLower}`);
    }

    return NextResponse.json({ 
      success: true, 
      points,
      multiplier,
      balance: formatUnits(balance, 18),
    });
  } catch (error) {
    console.error("[chat-record] Record error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}