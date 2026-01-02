import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use Alchemy RPC for reliability (public RPC has strict rate limits)
const ALCHEMY_RPC_URL = process.env.ALCHEMY_API_KEY 
  ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

// Token addresses on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as const;

// Bot wallet that holds prize pool
const BOT_WALLET = "0xCcb3D6c0F171CB68D5521a483e9Fb223a8adB94b" as const;

// Decimals
const USDC_DECIMALS = 6;
const DONUT_DECIMALS = 18;
const SPRINKLES_DECIMALS = 18;

// ============================================
// CONFIGURE WEEKLY DISTRIBUTION AMOUNTS HERE
// ============================================
const WEEKLY_DISTRIBUTION = {
  USDC: 10,          // Total USDC to distribute this week
  DONUT: 200,       // Total DONUT to distribute this week
  SPRINKLES: 100000, // Total SPRINKLES to distribute this week
};

// Prize distribution percentages for top 10
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

const ERC20_ABI = [
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
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  // Epoch: Friday Dec 5, 2025 23:00 UTC (6PM EST)
  const epoch = new Date(Date.UTC(2025, 11, 5, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  const weeksSinceEpoch = Math.floor(
    (now.getTime() - epoch.getTime()) / msPerWeek
  );
  return weeksSinceEpoch + 1;
}

// Get the week that just ended (for distribution)
// Cron fires at 23:03 UTC, week resets at 23:00 UTC, so we want the previous week
function getWeekToDistribute(): number {
  return Math.max(1, getCurrentWeek() - 1);
}

// Calculate prize amount for a given rank
function getPrizeForRank(rank: number, totalAmount: number): number {
  const prizeInfo = PRIZE_PERCENTAGES.find((p) => p.rank === rank);
  if (!prizeInfo) return 0;
  return (totalAmount * prizeInfo.percent) / 100;
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
      await new Promise((r) => setTimeout(r, delay * (i + 1))); // Exponential backoff
    }
  }
  throw new Error("Max retries exceeded");
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const weekNumber = body.week || getWeekToDistribute();
    const dryRun = body.dryRun === true;

    console.log(`[Miners Distribution] Starting for week ${weekNumber}, dryRun: ${dryRun}`);
    console.log(`[Miners Distribution] Using RPC: ${ALCHEMY_RPC_URL.replace(/\/v2\/.*/, '/v2/***')}`);

    // Check if already distributed for this week
    const { data: existingDistribution } = await supabase
      .from("weekly_winners")
      .select("id")
      .eq("week_number", weekNumber)
      .single();

    if (existingDistribution) {
      return NextResponse.json({
        success: false,
        error: "Prizes already distributed for this week",
        weekNumber,
      });
    }

    // Aggregate leaderboard from glaze_transactions for this week
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from("glaze_transactions")
      .select("address, points")
      .eq("week_number", weekNumber);

    if (leaderboardError) {
      console.error("Error fetching glaze_transactions:", leaderboardError);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard data" },
        { status: 500 }
      );
    }

    if (!leaderboardData || leaderboardData.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No mining activity found for this week",
        weekNumber,
      });
    }

    // Aggregate points by address
    const pointsByAddress: Record<string, number> = {};
    for (const tx of leaderboardData) {
      const addr = tx.address.toLowerCase();
      pointsByAddress[addr] = (pointsByAddress[addr] || 0) + (tx.points || 0);
    }

    // Sort by points descending and take top 10
    const sortedLeaderboard = Object.entries(pointsByAddress)
      .map(([address, total_points]) => ({ address, total_points }))
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, 10);

    if (sortedLeaderboard.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid entries found for distribution",
        weekNumber,
      });
    }

    console.log(`[Miners Distribution] Found ${sortedLeaderboard.length} winners`);

    // Setup public client to check balances
    const publicClient = createPublicClient({
      chain: base,
      transport: http(ALCHEMY_RPC_URL),
    });

    // Check bot wallet has enough funds for the configured distribution (with retry)
    const [usdcBalance, donutBalance, sprinklesBalance] = await withRetry(() => 
      Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [BOT_WALLET],
        }),
        publicClient.readContract({
          address: DONUT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [BOT_WALLET],
        }),
        publicClient.readContract({
          address: SPRINKLES_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [BOT_WALLET],
        }),
      ])
    );

    const walletUsdcBalance = parseFloat(formatUnits(usdcBalance, USDC_DECIMALS));
    const walletDonutBalance = parseFloat(formatUnits(donutBalance, DONUT_DECIMALS));
    const walletSprinklesBalance = parseFloat(formatUnits(sprinklesBalance, SPRINKLES_DECIMALS));

    console.log(`[Miners Distribution] Wallet balances - USDC: ${walletUsdcBalance}, DONUT: ${walletDonutBalance}, SPRINKLES: ${walletSprinklesBalance}`);
    console.log(`[Miners Distribution] Configured distribution - USDC: ${WEEKLY_DISTRIBUTION.USDC}, DONUT: ${WEEKLY_DISTRIBUTION.DONUT}, SPRINKLES: ${WEEKLY_DISTRIBUTION.SPRINKLES}`);

    // Check sufficient balances
    const insufficientFunds: string[] = [];
    if (walletUsdcBalance < WEEKLY_DISTRIBUTION.USDC) {
      insufficientFunds.push(`USDC (need ${WEEKLY_DISTRIBUTION.USDC}, have ${walletUsdcBalance.toFixed(2)})`);
    }
    if (walletDonutBalance < WEEKLY_DISTRIBUTION.DONUT) {
      insufficientFunds.push(`DONUT (need ${WEEKLY_DISTRIBUTION.DONUT}, have ${walletDonutBalance.toFixed(2)})`);
    }
    if (walletSprinklesBalance < WEEKLY_DISTRIBUTION.SPRINKLES) {
      insufficientFunds.push(`SPRINKLES (need ${WEEKLY_DISTRIBUTION.SPRINKLES}, have ${walletSprinklesBalance.toFixed(2)})`);
    }

    if (insufficientFunds.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Insufficient funds: ${insufficientFunds.join(", ")}`,
        weekNumber,
        walletBalances: {
          usdc: walletUsdcBalance,
          donut: walletDonutBalance,
          sprinkles: walletSprinklesBalance,
        },
        requiredAmounts: WEEKLY_DISTRIBUTION,
      });
    }

    // Calculate prize amounts for each winner
    type Distribution = {
      rank: number;
      address: string;
      points: number;
      usdcAmount: string;
      donutAmount: string;
      sprinklesAmount: string;
      txHashes: string[];
    };

    const distributions: Distribution[] = [];

    for (let i = 0; i < sortedLeaderboard.length; i++) {
      const rank = i + 1;
      const entry = sortedLeaderboard[i];

      // Calculate prizes based on configured amounts
      const usdcAmount = getPrizeForRank(rank, WEEKLY_DISTRIBUTION.USDC).toFixed(USDC_DECIMALS);
      const donutAmount = getPrizeForRank(rank, WEEKLY_DISTRIBUTION.DONUT).toFixed(4);
      const sprinklesAmount = getPrizeForRank(rank, WEEKLY_DISTRIBUTION.SPRINKLES).toFixed(4);

      distributions.push({
        rank,
        address: entry.address,
        points: entry.total_points,
        usdcAmount,
        donutAmount,
        sprinklesAmount,
        txHashes: [],
      });
    }

    // If dry run, return what would be distributed
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        weekNumber,
        configuredDistribution: WEEKLY_DISTRIBUTION,
        walletBalances: {
          usdc: walletUsdcBalance,
          donut: walletDonutBalance,
          sprinkles: walletSprinklesBalance,
        },
        distributions,
        totals: {
          usdc: distributions.reduce((sum, d) => sum + parseFloat(d.usdcAmount), 0).toFixed(2),
          donut: distributions.reduce((sum, d) => sum + parseFloat(d.donutAmount), 0).toFixed(4),
          sprinkles: distributions.reduce((sum, d) => sum + parseFloat(d.sprinklesAmount), 0).toFixed(4),
        },
      });
    }

    // Setup wallet for sending
    const botPrivateKey = process.env.BOT_PRIVATE_KEY;
    if (!botPrivateKey) {
      return NextResponse.json(
        { error: "Bot wallet not configured" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(ALCHEMY_RPC_URL),
    });

    // Send prizes
    const errors: { rank: number; token: string; error: string }[] = [];

    for (const dist of distributions) {
      // Send USDC
      if (parseFloat(dist.usdcAmount) > 0) {
        try {
          const hash = await withRetry(() => walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.usdcAmount, USDC_DECIMALS),
            ],
          }));
          dist.txHashes.push(hash);
          console.log(`[Miners Distribution] Sent ${dist.usdcAmount} USDC to rank ${dist.rank}: ${hash}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`Failed to send USDC to rank ${dist.rank}:`, err);
          errors.push({ rank: dist.rank, token: "USDC", error: err.message });
        }
      }

      // Send DONUT
      if (parseFloat(dist.donutAmount) > 0) {
        try {
          const hash = await withRetry(() => walletClient.writeContract({
            address: DONUT_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.donutAmount, DONUT_DECIMALS),
            ],
          }));
          dist.txHashes.push(hash);
          console.log(`[Miners Distribution] Sent ${dist.donutAmount} DONUT to rank ${dist.rank}: ${hash}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`Failed to send DONUT to rank ${dist.rank}:`, err);
          errors.push({ rank: dist.rank, token: "DONUT", error: err.message });
        }
      }

      // Send SPRINKLES
      if (parseFloat(dist.sprinklesAmount) > 0) {
        try {
          const hash = await withRetry(() => walletClient.writeContract({
            address: SPRINKLES_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.sprinklesAmount, SPRINKLES_DECIMALS),
            ],
          }));
          dist.txHashes.push(hash);
          console.log(`[Miners Distribution] Sent ${dist.sprinklesAmount} SPRINKLES to rank ${dist.rank}: ${hash}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`Failed to send SPRINKLES to rank ${dist.rank}:`, err);
          errors.push({ rank: dist.rank, token: "SPRINKLES", error: err.message });
        }
      }
    }

    // Get first place tx hash for record (or first successful tx)
    const primaryTxHash =
      distributions[0]?.txHashes[0] ||
      distributions.find((d) => d.txHashes.length > 0)?.txHashes[0] ||
      "";

    // Record to weekly_winners table
    const first = distributions[0];
    const second = distributions[1];
    const third = distributions[2];

    const { error: insertError } = await supabase.from("weekly_winners").insert({
      week_number: weekNumber,
      first_place: first?.address || null,
      second_place: second?.address || null,
      third_place: third?.address || null,
      first_amount: first?.usdcAmount || "0",
      second_amount: second?.usdcAmount || "0",
      third_amount: third?.usdcAmount || "0",
      first_donut_amount: first?.donutAmount || "0",
      second_donut_amount: second?.donutAmount || "0",
      third_donut_amount: third?.donutAmount || "0",
      first_sprinkles_amount: first?.sprinklesAmount || "0",
      second_sprinkles_amount: second?.sprinklesAmount || "0",
      third_sprinkles_amount: third?.sprinklesAmount || "0",
      tx_hash: primaryTxHash,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to record to weekly_winners:", insertError);
    }

    return NextResponse.json({
      success: true,
      weekNumber,
      configuredDistribution: WEEKLY_DISTRIBUTION,
      distributions,
      errors: errors.length > 0 ? errors : undefined,
      totals: {
        usdc: distributions.reduce((sum, d) => sum + parseFloat(d.usdcAmount), 0).toFixed(2),
        donut: distributions.reduce((sum, d) => sum + parseFloat(d.donutAmount), 0).toFixed(4),
        sprinkles: distributions.reduce((sum, d) => sum + parseFloat(d.sprinklesAmount), 0).toFixed(4),
      },
    });
  } catch (error: any) {
    console.error("[Miners Distribution] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to check distribution status and config
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  const currentWeek = getCurrentWeek();

  // Setup public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(ALCHEMY_RPC_URL),
  });

  // Get wallet balances (with retry)
  const [usdcBalance, donutBalance, sprinklesBalance] = await withRetry(() =>
    Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [BOT_WALLET],
      }),
      publicClient.readContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [BOT_WALLET],
      }),
      publicClient.readContract({
        address: SPRINKLES_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [BOT_WALLET],
      }),
    ])
  );

  const walletBalances = {
    usdc: formatUnits(usdcBalance, USDC_DECIMALS),
    donut: formatUnits(donutBalance, DONUT_DECIMALS),
    sprinkles: formatUnits(sprinklesBalance, SPRINKLES_DECIMALS),
  };

  // If no week specified, return current config
  if (!week) {
    return NextResponse.json({
      currentWeek,
      configuredDistribution: WEEKLY_DISTRIBUTION,
      walletBalances,
      prizePercentages: PRIZE_PERCENTAGES,
    });
  }

  // Check if week was distributed
  const { data, error } = await supabase
    .from("weekly_winners")
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
    currentWeek,
    configuredDistribution: WEEKLY_DISTRIBUTION,
    walletBalances,
  });
}