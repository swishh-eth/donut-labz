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

// Use Alchemy RPC for reliability (same as other routes)
const publicClient = createPublicClient({
  chain: base,
  transport: http("https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g"),
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

export async function POST(request: NextRequest) {
  try {
    const { senderAddress, message } = await request.json();

    if (!senderAddress) {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const multiplier = getCurrentMultiplier();
    
    // If rewards have ended, don't record points
    if (multiplier === 0) {
      console.log(`[chat-record] Rewards ended for ${senderAddress}`);
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
      balance = await publicClient.readContract({
        address: SPRINKLES_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [senderAddress as `0x${string}`],
      });
      hasEnoughSprinkles = balance >= MIN_SPRINKLES_BALANCE;
      
      // Debug logging
      const balanceFormatted = formatUnits(balance, 18);
      const minRequired = formatUnits(MIN_SPRINKLES_BALANCE, 18);
      console.log(`[chat-record] Balance check for ${senderAddress}: ${balanceFormatted} SPRINKLES (need ${minRequired}, eligible: ${hasEnoughSprinkles})`);
      
    } catch (e) {
      console.error(`[chat-record] Failed to check SPRINKLES balance for ${senderAddress}:`, e);
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        message: "Could not verify balance - RPC error" 
      });
    }

    // If user doesn't have enough SPRINKLES, no points
    if (!hasEnoughSprinkles) {
      const balanceFormatted = formatUnits(balance, 18);
      console.log(`[chat-record] ${senderAddress} has ${balanceFormatted} SPRINKLES - not enough to earn`);
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        balance: formatUnits(balance, 18),
        message: "Must hold 100,000 SPRINKLES to earn" 
      });
    }

    // Calculate points: base rate * halving multiplier
    const points = BASE_POINTS_PER_MESSAGE * multiplier;

    console.log(`[chat-record] Awarding ${points} points to ${senderAddress} (multiplier: ${multiplier}x)`);

    // Record points in database
    const { error } = await supabase.from("chat_points").insert({
      address: senderAddress.toLowerCase(),
      points,
      message: message?.slice(0, 280) || "",
      multiplier,
      timestamp: Math.floor(Date.now() / 1000),
    });

    if (error) {
      console.error("[chat-record] Failed to record points:", error);
    }

    // Update leaderboard
    const { data: existing } = await supabase
      .from("chat_leaderboard")
      .select("total_points")
      .eq("address", senderAddress.toLowerCase())
      .single();

    if (existing) {
      await supabase
        .from("chat_leaderboard")
        .update({ 
          total_points: existing.total_points + points,
          last_message_at: new Date().toISOString(),
        })
        .eq("address", senderAddress.toLowerCase());
    } else {
      await supabase.from("chat_leaderboard").insert({
        address: senderAddress.toLowerCase(),
        total_points: points,
        last_message_at: new Date().toISOString(),
      });
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