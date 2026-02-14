// Place in: app/api/cron/flappy-distribute/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use Alchemy RPC for reliability (public RPC has strict rate limits)
const ALCHEMY_RPC_URL = "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_DECIMALS = 6;

// Prize distribution: percentages for top 10
const TOTAL_PRIZE_USD = 1; // $5 USDC weekly prize pool
const PRIZE_PERCENTAGES = [
  { rank: 1, percent: 40 },   // 40%
  { rank: 2, percent: 20 },   // 20%
  { rank: 3, percent: 15 },   // 15%
  { rank: 4, percent: 8 },    // 8%
  { rank: 5, percent: 5 },    // 5%
  { rank: 6, percent: 4 },    // 4%
  { rank: 7, percent: 3 },    // 3%
  { rank: 8, percent: 2 },    // 2%
  { rank: 9, percent: 2 },    // 2%
  { rank: 10, percent: 1 },   // 1%
]; // Total: 100%

// Calculate actual amounts from percentages
function getPrizeDistribution() {
  return PRIZE_PERCENTAGES.map(p => ({
    rank: p.rank,
    percent: p.percent,
    amount: ((TOTAL_PRIZE_USD * p.percent) / 100).toFixed(2),
  }));
}

const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
// Epoch: Friday Jan 3, 2025 23:00 UTC
// MUST match how flappy_games stores week_number
function getCurrentWeek(): number {
  const now = new Date();
  const epoch = new Date('2025-01-03T23:00:00Z');
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

// Get previous week (for distribution after week ends)
function getPreviousWeek(): number {
  return Math.max(1, getCurrentWeek() - 1);
}

// Retry wrapper for RPC calls
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes("429") || error?.message?.includes("rate limit");
      if (i === retries - 1) throw error;
      console.log(`[Retry ${i + 1}/${retries}] ${isRateLimit ? "Rate limited" : "Error"}, waiting ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

// Main distribution logic
async function runDistribution(week: number, dryRun: boolean) {
  console.log(`[Flappy Distribution] Starting for week ${week}, dryRun: ${dryRun}`);
  console.log(`[Flappy Distribution] Current week: ${getCurrentWeek()}, distributing week: ${week}`);

  // Check if already distributed for this week
  const { data: existingDistribution } = await supabase
    .from("flappy_distributions")
    .select("id")
    .eq("week_number", week)
    .single();

  if (existingDistribution) {
    return {
      success: false,
      error: "Prizes already distributed for this week",
      week,
    };
  }

  // Get all scores for the week to find best score per player
  const { data: allScores, error: scoresError } = await supabase
    .from("flappy_games")
    .select("player_address, username, pfp_url, score")
    .eq("week_number", week)
    .gt("score", 0)
    .order("score", { ascending: false });

  if (scoresError) {
    console.error("Error fetching scores:", scoresError);
    return { error: "Failed to fetch scores" };
  }

  if (!allScores || allScores.length === 0) {
    return {
      success: false,
      error: "No scores found for this week",
      week,
    };
  }

  // Get best score per player (dedup by address)
  const playerBestScores = new Map<string, {
    address: string;
    username: string | null;
    pfpUrl: string | null;
    score: number;
  }>();

  for (const row of allScores) {
    if (!row.player_address) continue;
    const addr = row.player_address.toLowerCase();
    if (!playerBestScores.has(addr) || row.score > playerBestScores.get(addr)!.score) {
      playerBestScores.set(addr, {
        address: row.player_address.toLowerCase(),
        username: row.username,
        pfpUrl: row.pfp_url,
        score: row.score,
      });
    }
  }

  // Sort by score and get top 10
  const topScores = Array.from(playerBestScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (topScores.length === 0) {
    return {
      success: false,
      error: "No valid wallet addresses found for winners",
      week,
    };
  }

  // Prepare distribution list
  const distributions: {
    rank: number;
    address: string;
    amount: string;
    score: number;
    username?: string | null;
    pfpUrl?: string | null;
    txHash?: string;
  }[] = [];

  const prizeDistribution = getPrizeDistribution();

  for (let i = 0; i < Math.min(topScores.length, prizeDistribution.length); i++) {
    const winner = topScores[i];
    const prize = prizeDistribution[i];

    distributions.push({
      rank: prize.rank,
      address: winner.address,
      amount: prize.amount,
      score: winner.score,
      username: winner.username,
      pfpUrl: winner.pfpUrl,
    });
  }

  console.log(`[Flappy Distribution] Found ${distributions.length} winners`);

  // If dry run, just return what would be distributed
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      week,
      currentWeek: getCurrentWeek(),
      distributions,
      totalPrize: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2),
    };
  }

  // Setup wallet client for sending
  const botPrivateKey = process.env.BOT_PRIVATE_KEY;
  if (!botPrivateKey) {
    return { error: "Bot wallet not configured" };
  }

  const account = privateKeyToAccount(botPrivateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(ALCHEMY_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(ALCHEMY_RPC_URL),
  });

  // Send prizes - wait for each tx to confirm before sending next
  const results: { rank: number; txHash: string; error?: string }[] = [];

  for (const dist of distributions) {
    try {
      const amountInUnits = parseUnits(dist.amount, USDC_DECIMALS);

      const hash = await withRetry(() => walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [dist.address as `0x${string}`, amountInUnits],
      }));

      dist.txHash = hash;
      results.push({ rank: dist.rank, txHash: hash });
      console.log(`[Flappy Distribution] Sent $${dist.amount} USDC to rank ${dist.rank}: ${hash}`);

      // Wait for confirmation before next tx
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    } catch (err: any) {
      console.error(`Failed to send prize to rank ${dist.rank}:`, err);
      results.push({ rank: dist.rank, txHash: "", error: err.message });
    }
  }

  // Record distribution in database
  const winnersForDb = distributions.map((d) => ({
    rank: d.rank,
    address: d.address,
    username: d.username,
    pfpUrl: d.pfpUrl,
    score: d.score,
    amount: parseFloat(d.amount),
  }));

  const { error: insertError } = await supabase.from("flappy_distributions").insert({
    week_number: week,
    prize_pool: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0),
    tx_hash: results[0]?.txHash || null,
    winners: winnersForDb,
  });

  if (insertError) {
    console.error("Failed to record distribution:", insertError);
  }

  return {
    success: true,
    week,
    distributions,
    results,
    totalPrize: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2),
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const week = body.week || getPreviousWeek();
    const dryRun = body.dryRun === true;

    const result = await runDistribution(week, dryRun);

    if (result.error && !result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Prize distribution error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint - Vercel crons use GET requests
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  // If authorized (cron job), run distribution
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    try {
      const weekNumber = week ? parseInt(week) : getPreviousWeek();
      const result = await runDistribution(weekNumber, false);

      if (result.error && !result.success) {
        return NextResponse.json(result, { status: 500 });
      }

      return NextResponse.json(result);
    } catch (error: any) {
      console.error("[Flappy Distribution] Cron error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Otherwise return status info (no auth required for status check)
  const currentWeek = getCurrentWeek();
  const previousWeek = getPreviousWeek();

  // If no week specified, just return current prize info
  if (!week) {
    return NextResponse.json({
      totalPrize: TOTAL_PRIZE_USD,
      prizeStructure: getPrizeDistribution(),
      currentWeek,
      weekToDistribute: previousWeek,
    });
  }

  // Check if specific week was distributed
  const { data, error } = await supabase
    .from("flappy_distributions")
    .select("*")
    .eq("week_number", parseInt(week))
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    week: parseInt(week),
    distributed: !!data,
    distribution: data || null,
    totalPrize: TOTAL_PRIZE_USD,
    prizeStructure: getPrizeDistribution(),
    currentWeek,
    weekToDistribute: previousWeek,
  });
}