import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWalletClient, http, parseUnits, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_DECIMALS = 6;

// Prize distribution: percentages for top 10
const TOTAL_PRIZE_USD = 5; // Change this to adjust total prize pool
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
function getCurrentWeek(): number {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

// Get previous week (for distribution after week ends)
function getPreviousWeek(): number {
  return Math.max(1, getCurrentWeek() - 1);
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const week = body.week || getPreviousWeek(); // Default to previous week
    const dryRun = body.dryRun === true; // For testing without sending

    // Check if already distributed for this week
    const { data: existingDistribution } = await supabase
      .from("donut_dash_prize_distributions")
      .select("id")
      .eq("week", week)
      .single();

    if (existingDistribution) {
      return NextResponse.json({
        success: false,
        error: "Prizes already distributed for this week",
        week,
      });
    }

    // Get top 10 scores for the week
    const { data: topScores, error: scoresError } = await supabase
      .from("donut_dash_scores")
      .select("fid, wallet_address, score, username, display_name")
      .eq("week", week)
      .gt("score", 0)
      .order("score", { ascending: false })
      .limit(10);

    if (scoresError) {
      console.error("Error fetching scores:", scoresError);
      return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 });
    }

    if (!topScores || topScores.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No scores found for this week",
        week,
      });
    }

    // Prepare distribution list
    const distributions: {
      rank: number;
      address: string;
      amount: string;
      score: number;
      username?: string;
      txHash?: string;
    }[] = [];

    const prizeDistribution = getPrizeDistribution();

    for (let i = 0; i < Math.min(topScores.length, prizeDistribution.length); i++) {
      const winner = topScores[i];
      const prize = prizeDistribution[i];

      if (!winner.wallet_address) {
        console.warn(`No wallet address for rank ${i + 1}, fid: ${winner.fid}`);
        continue;
      }

      distributions.push({
        rank: prize.rank,
        address: winner.wallet_address,
        amount: prize.amount,
        score: winner.score,
        username: winner.username || winner.display_name,
      });
    }

    if (distributions.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid wallet addresses found for winners",
        week,
      });
    }

    // If dry run, just return what would be distributed
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        week,
        distributions,
        totalPrize: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2),
      });
    }

    // Setup wallet client for sending
    const botPrivateKey = process.env.BOT_PRIVATE_KEY;
    if (!botPrivateKey) {
      return NextResponse.json({ error: "Bot wallet not configured" }, { status: 500 });
    }

    const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    // Send prizes
    const results: { rank: number; txHash: string; error?: string }[] = [];

    for (const dist of distributions) {
      try {
        const amountInUnits = parseUnits(dist.amount, USDC_DECIMALS);

        const hash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [dist.address as `0x${string}`, amountInUnits],
        });

        dist.txHash = hash;
        results.push({ rank: dist.rank, txHash: hash });

        // Small delay between transactions
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err: any) {
        console.error(`Failed to send prize to rank ${dist.rank}:`, err);
        results.push({ rank: dist.rank, txHash: "", error: err.message });
      }
    }

    // Record distribution in database
    const { error: insertError } = await supabase.from("donut_dash_prize_distributions").insert({
      week,
      total_prize_usd: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0),
      distributions: distributions,
      results: results,
      distributed_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to record distribution:", insertError);
    }

    return NextResponse.json({
      success: true,
      week,
      distributions,
      results,
      totalPrize: distributions.reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2),
    });
  } catch (error: any) {
    console.error("Prize distribution error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to check distribution status and prize info
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  // If no week specified, just return current prize info
  if (!week) {
    const currentWeek = getCurrentWeek();
    return NextResponse.json({
      totalPrize: TOTAL_PRIZE_USD,
      prizeStructure: getPrizeDistribution(),
      currentWeek,
    });
  }

  const { data, error } = await supabase
    .from("donut_dash_prize_distributions")
    .select("*")
    .eq("week", parseInt(week))
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
  });
}