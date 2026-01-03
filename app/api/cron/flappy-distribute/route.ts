import { NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { supabase } from '@/lib/supabase-leaderboard';

// Use Alchemy RPC for reliability (public RPC has strict rate limits)
const ALCHEMY_RPC_URL = process.env.ALCHEMY_API_KEY 
  ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

// Contract address - UPDATE AFTER DEPLOYMENT
const FLAPPY_POOL_ADDRESS = process.env.FLAPPY_POOL_ADDRESS as `0x${string}`;
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY as `0x${string}`;

const FLAPPY_POOL_ABI = [
  {
    inputs: [{ name: "winners", type: "address[10]" }],
    name: "distribute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "canDistribute",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "currentWeek",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getPrizePool",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getPrizeShares",
    outputs: [{ type: "uint16[10]" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Prize share percentages (must match contract - 100% of prize pool)
const PRIZE_SHARES = [3000, 2000, 1500, 1000, 800, 600, 500, 300, 200, 100];

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
// Matches the backend week calculation, not the contract
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

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`[Flappy Distribution] Starting...`);
    console.log(`[Flappy Distribution] Using RPC: ${ALCHEMY_RPC_URL.replace(/\/v2\/.*/, '/v2/***')}`);

    const publicClient = createPublicClient({
      chain: base,
      transport: http(ALCHEMY_RPC_URL),
    });

    // Check if distribution is allowed (still use contract for time window)
    const canDistribute = await withRetry(() => publicClient.readContract({
      address: FLAPPY_POOL_ADDRESS,
      abi: FLAPPY_POOL_ABI,
      functionName: 'canDistribute',
    }));

    if (!canDistribute) {
      return NextResponse.json({ 
        success: false, 
        message: 'Not distribution time or already distributed this week' 
      });
    }

    // Use calculated week (matches database), not contract week
    const weekNumber = getWeekToDistribute();
    console.log(`[Flappy Distribution] Distributing week ${weekNumber}`);

    // Check if we already distributed this week
    const { data: existingDist } = await supabase
      .from('flappy_distributions')
      .select('id')
      .eq('week_number', weekNumber)
      .single();

    if (existingDist) {
      return NextResponse.json({ 
        success: false, 
        message: `Week ${weekNumber} already distributed` 
      });
    }

    // Get top 10 scores for this week from database
    // Best score per player, then top 10 of those
    const { data: allScores, error: scoresError } = await supabase
      .from('flappy_games')
      .select('player_address, username, pfp_url, score')
      .eq('week_number', weekNumber)
      .order('score', { ascending: false });

    if (scoresError) {
      throw new Error(`Failed to fetch scores: ${scoresError.message}`);
    }

    // Get best score per player (dedup by address)
    const playerBestScores = new Map<string, { 
      address: string; 
      username: string | null;
      pfpUrl: string | null;
      score: number;
    }>();
    
    for (const row of allScores || []) {
      const addr = row.player_address.toLowerCase();
      if (!playerBestScores.has(addr) || row.score > playerBestScores.get(addr)!.score) {
        playerBestScores.set(addr, { 
          address: row.player_address, 
          username: row.username,
          pfpUrl: row.pfp_url,
          score: row.score 
        });
      }
    }

    // Sort by score and take top 10
    const top10 = Array.from(playerBestScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    console.log(`[Flappy Distribution] Found ${top10.length} winners`);

    // Check if there are any players
    if (top10.length === 0) {
      // No games played this week - skip distribution
      // Optionally advance week anyway
      console.log(`Week ${weekNumber}: No games played, skipping distribution`);
      
      await supabase.from('flappy_distributions').insert({
        week_number: weekNumber,
        total_pot: 0,
        treasury_fee: 0,
        tx_hash: null,
        winners: [],
      });

      return NextResponse.json({ 
        success: true, 
        message: `Week ${weekNumber}: No games played, skipped distribution`,
        week: weekNumber,
        winners: []
      });
    }

    // Pad to 10 addresses (contract expects exactly 10 as a tuple)
    const winnersArray: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] = [
      (top10[0]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[1]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[2]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[3]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[4]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[5]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[6]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[7]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[8]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
      (top10[9]?.address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
    ] as const;

    // Get prize pool size (fees already taken on entry, this is 100% for winners)
    const prizePoolSize = await withRetry(() => publicClient.readContract({
      address: FLAPPY_POOL_ADDRESS,
      abi: FLAPPY_POOL_ABI,
      functionName: 'getPrizePool',
    }));

    const potSizeFormatted = Number(formatUnits(prizePoolSize, 18));

    if (prizePoolSize === BigInt(0)) {
      console.log(`Week ${weekNumber}: Pot is empty, skipping distribution`);
      
      await supabase.from('flappy_distributions').insert({
        week_number: weekNumber,
        total_pot: 0,
        treasury_fee: 0,
        tx_hash: null,
        winners: top10.map((w, i) => ({
          rank: i + 1,
          address: w.address,
          username: w.username,
          score: w.score,
          amount: 0
        })),
      });

      return NextResponse.json({ 
        success: true, 
        message: `Week ${weekNumber}: Pot empty, recorded winners but no payout`,
        week: weekNumber,
        winners: top10
      });
    }

    // Create wallet client and send transaction
    const account = privateKeyToAccount(BOT_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(ALCHEMY_RPC_URL),
    });

    console.log(`Distributing week ${weekNumber} pot: ${potSizeFormatted} DONUT to ${top10.length} winners`);

    const hash = await withRetry(() => walletClient.writeContract({
      address: FLAPPY_POOL_ADDRESS,
      abi: FLAPPY_POOL_ABI,
      functionName: 'distribute',
      args: [winnersArray],
    }));

    console.log(`[Flappy Distribution] Tx sent: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Transaction failed');
    }

    // Calculate prize amounts for logging (100% of prize pool)
    const winnersWithAmounts = top10.map((w, i) => ({
      rank: i + 1,
      address: w.address,
      username: w.username,
      pfpUrl: w.pfpUrl,
      score: w.score,
      amount: (potSizeFormatted * PRIZE_SHARES[i]) / 10000
    }));

    // Log to database
    await supabase.from('flappy_distributions').insert({
      week_number: weekNumber,
      prize_pool: potSizeFormatted,
      tx_hash: hash,
      winners: winnersWithAmounts,
    });

    console.log(`Week ${weekNumber} distribution complete. Tx: ${hash}`);
    console.log(`Prize Pool: ${potSizeFormatted} DONUT (100% to winners, fees taken on entry)`);

    return NextResponse.json({
      success: true,
      week: weekNumber,
      txHash: hash,
      prizePool: potSizeFormatted,
      winners: winnersWithAmounts,
    });

  } catch (error) {
    console.error('Flappy distribution failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Also support POST for manual triggers (with auth)
export async function POST(request: Request) {
  return GET(request);
}