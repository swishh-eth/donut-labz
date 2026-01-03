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

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
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
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        message: "Rewards have ended" 
      });
    }

    // Check SPRINKLES balance
    let hasEnoughSprinkles = false;
    try {
      const balance = await publicClient.readContract({
        address: SPRINKLES_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [senderAddress as `0x${string}`],
      });
      hasEnoughSprinkles = balance >= MIN_SPRINKLES_BALANCE;
    } catch (e) {
      console.error("Failed to check SPRINKLES balance:", e);
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        message: "Could not verify balance" 
      });
    }

    // If user doesn't have enough SPRINKLES, no points
    if (!hasEnoughSprinkles) {
      return NextResponse.json({ 
        success: true, 
        points: 0, 
        message: "Must hold 100,000 SPRINKLES to earn" 
      });
    }

    // Calculate points: base rate * halving multiplier
    const points = BASE_POINTS_PER_MESSAGE * multiplier;

    // Record points in database
    const { error } = await supabase.from("chat_points").insert({
      address: senderAddress.toLowerCase(),
      points,
      message: message?.slice(0, 280) || "",
      multiplier,
      timestamp: Math.floor(Date.now() / 1000),
    });

    if (error) {
      console.error("Failed to record points:", error);
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
    });
  } catch (error) {
    console.error("Record error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}