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
// USDC and SPRINKLES are FIXED amounts
// DONUT uses the bot wallet's ENTIRE balance (accumulates from 0.5% SPRINKLES miner fee)
const WEEKLY_DISTRIBUTION = {
  USDC: 50,           // Fixed USDC to distribute this week
  SPRINKLES: 200000,  // Fixed SPRINKLES to distribute this week
  // DONUT: uses full wallet balance - not configured here
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
function getWeekToDistribute(): number {
  return Math.max(1, getCurrentWeek());
}

// Calculate prize amount for a given rank
function getPrizeForRank(rank: number, totalAmount: number): number {
  const prizeInfo = PRIZE_PERCENTAGES.find((p) => p.rank === rank);
  if (!prizeInfo) return 0;
  return (totalAmount * prizeInfo.percent) / 100;
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
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    // Get bot wallet balances
    const [usdcBalance, donutBalance, sprinklesBalance] = await Promise.all([
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
    ]);

    const walletUsdcBalance = parseFloat(formatUnits(usdcBalance, USDC_DECIMALS));
    const walletDonutBalance = parseFloat(formatUnits(donutBalance, DONUT_DECIMALS));
    const walletSprinklesBalance = parseFloat(formatUnits(sprinklesBalance, SPRINKLES_DECIMALS));

    // DONUT distribution = ENTIRE wallet balance (accumulated from 0.5% miner fee)
    const donutToDistribute = walletDonutBalance;

    console.log(`[Miners Distribution] Wallet balances - USDC: ${walletUsdcBalance}, DONUT: ${walletDonutBalance}, SPRINKLES: ${walletSprinklesBalance}`);
    console.log(`[Miners Distribution] Will distribute - USDC: ${WEEKLY_DISTRIBUTION.USDC} (fixed), DONUT: ${donutToDistribute} (full balance), SPRINKLES: ${WEEKLY_DISTRIBUTION.SPRINKLES} (fixed)`);

    // Check sufficient balances for FIXED amounts (USDC and SPRINKLES)
    const insufficientFunds: string[] = [];
    if (walletUsdcBalance < WEEKLY_DISTRIBUTION.USDC) {
      insufficientFunds.push(`USDC (need ${WEEKLY_DISTRIBUTION.USDC}, have ${walletUsdcBalance})`);
    }
    if (walletSprinklesBalance < WEEKLY_DISTRIBUTION.SPRINKLES) {
      insufficientFunds.push(`SPRINKLES (need ${WEEKLY_DISTRIBUTION.SPRINKLES}, have ${walletSprinklesBalance})`);
    }
    // DONUT: just warn if zero, but don't fail - it's variable
    if (donutToDistribute <= 0) {
      console.warn("[Miners Distribution] Warning: No DONUT to distribute");
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
        requiredAmounts: {
          usdc: WEEKLY_DISTRIBUTION.USDC,
          donut: "full balance",
          sprinkles: WEEKLY_DISTRIBUTION.SPRINKLES,
        },
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

      // Calculate prizes:
      // - USDC: fixed configured amount
      // - DONUT: full wallet balance distributed across percentages
      // - SPRINKLES: fixed configured amount
      const usdcAmount = getPrizeForRank(rank, WEEKLY_DISTRIBUTION.USDC).toFixed(USDC_DECIMALS);
      const donutAmount = getPrizeForRank(rank, donutToDistribute).toFixed(4);
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
        configuredDistribution: {
          USDC: WEEKLY_DISTRIBUTION.USDC,
          DONUT: donutToDistribute, // Show actual amount to distribute
          SPRINKLES: WEEKLY_DISTRIBUTION.SPRINKLES,
        },
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
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    // Send prizes
    const errors: { rank: number; token: string; error: string }[] = [];

    for (const dist of distributions) {
      // Send USDC
      if (parseFloat(dist.usdcAmount) > 0) {
        try {
          const hash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.usdcAmount, USDC_DECIMALS),
            ],
          });
          dist.txHashes.push(hash);
          console.log(`[Miners Distribution] Sent ${dist.usdcAmount} USDC to rank ${dist.rank}: ${hash}`);
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`Failed to send USDC to rank ${dist.rank}:`, err);
          errors.push({ rank: dist.rank, token: "USDC", error: err.message });
        }
      }

      // Send DONUT (full balance distributed)
      if (parseFloat(dist.donutAmount) > 0) {
        try {
          const hash = await walletClient.writeContract({
            address: DONUT_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.donutAmount, DONUT_DECIMALS),
            ],
          });
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
          const hash = await walletClient.writeContract({
            address: SPRINKLES_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              dist.address as `0x${string}`,
              parseUnits(dist.sprinklesAmount, SPRINKLES_DECIMALS),
            ],
          });
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
      configuredDistribution: {
        USDC: WEEKLY_DISTRIBUTION.USDC,
        DONUT: donutToDistribute,
        SPRINKLES: WEEKLY_DISTRIBUTION.SPRINKLES,
      },
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
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
  });

  // Get wallet balances
  const [usdcBalance, donutBalance, sprinklesBalance] = await Promise.all([
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
  ]);

  const walletDonutBalance = parseFloat(formatUnits(donutBalance, DONUT_DECIMALS));

  const walletBalances = {
    usdc: formatUnits(usdcBalance, USDC_DECIMALS),
    donut: formatUnits(donutBalance, DONUT_DECIMALS),
    sprinkles: formatUnits(sprinklesBalance, SPRINKLES_DECIMALS),
  };

  // If no week specified, return current config
  if (!week) {
    return NextResponse.json({
      currentWeek,
      // configuredDistribution shows what WILL be distributed
      // DONUT = full wallet balance (dynamic), USDC & SPRINKLES = fixed
      configuredDistribution: {
        USDC: WEEKLY_DISTRIBUTION.USDC,
        DONUT: walletDonutBalance, // Current balance - this grows throughout the week
        SPRINKLES: WEEKLY_DISTRIBUTION.SPRINKLES,
      },
      walletBalances,
      prizePercentages: PRIZE_PERCENTAGES,
      note: "DONUT distribution uses full wallet balance (accumulates from 0.5% SPRINKLES miner fee). USDC and SPRINKLES are fixed amounts.",
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
    configuredDistribution: {
      USDC: WEEKLY_DISTRIBUTION.USDC,
      DONUT: walletDonutBalance,
      SPRINKLES: WEEKLY_DISTRIBUTION.SPRINKLES,
    },
    walletBalances,
  });
}