import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STACK_TOWER_CONTRACT = "0x3704C7C71cDd1b37669aa5f1d366Dc0121E1e6fF" as const;

const PRIZE_POOL_ABI = [
  {
    name: "distribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "winners", type: "address[10]" }],
    outputs: [],
  },
  {
    name: "canDistribute",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getPrizePool",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Week calculation - matches Friday 11PM UTC epoch
function getCurrentWeekNumber(): number {
  const now = new Date();
  const epoch = new Date('2025-01-03T23:00:00Z');
  const diffMs = now.getTime() - epoch.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const botPrivateKey = process.env.BOT_PRIVATE_KEY;
    if (!botPrivateKey) {
      return NextResponse.json({ error: "Bot wallet not configured" }, { status: 500 });
    }

    const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    // Check if distribution is allowed
    const canDistribute = await publicClient.readContract({
      address: STACK_TOWER_CONTRACT,
      abi: PRIZE_POOL_ABI,
      functionName: "canDistribute",
    });

    if (!canDistribute) {
      return NextResponse.json({ 
        success: false, 
        message: "Distribution not allowed at this time" 
      });
    }

    // Check prize pool
    const prizePool = await publicClient.readContract({
      address: STACK_TOWER_CONTRACT,
      abi: PRIZE_POOL_ABI,
      functionName: "getPrizePool",
    });

    if (prizePool === 0n) {
      return NextResponse.json({ 
        success: false, 
        message: "No prize pool to distribute" 
      });
    }

    const weekNumber = getCurrentWeekNumber();

    // Get leaderboard - best score per player for the week
    const { data: games, error } = await supabase
      .from("stack_tower_games")
      .select("fid, wallet_address, username, score")
      .eq("week_number", weekNumber)
      .order("score", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }

    // Deduplicate - keep only best score per player
    const bestScores = new Map<number, { wallet_address: string; score: number }>();
    games?.forEach((game) => {
      const existing = bestScores.get(game.fid);
      if (!existing || game.score > existing.score) {
        bestScores.set(game.fid, { wallet_address: game.wallet_address, score: game.score });
      }
    });

    // Sort by score and get top 10
    const topPlayers = Array.from(bestScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Build winners array (pad with zero addresses if < 10)
    const zeroAddress = "0x0000000000000000000000000000000000000000" as `0x${string}`;
    const winnersArray = [
      topPlayers[0]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[1]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[2]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[3]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[4]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[5]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[6]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[7]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[8]?.wallet_address as `0x${string}` || zeroAddress,
      topPlayers[9]?.wallet_address as `0x${string}` || zeroAddress,
    ] as const;
    
    type WinnersTuple = readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];
    const winners = winnersArray as unknown as WinnersTuple;

    console.log("Stack Tower Distribution - Week:", weekNumber);
    console.log("Winners:", winnersArray);
    console.log("Prize Pool:", prizePool.toString());

    // Call distribute on the contract
    const txHash = await walletClient.writeContract({
      address: STACK_TOWER_CONTRACT,
      abi: PRIZE_POOL_ABI,
      functionName: "distribute",
      args: [winners],
    });

    console.log("Distribution tx:", txHash);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json({
      success: true,
      weekNumber,
      txHash,
      winners: topPlayers.map((p, i) => ({ 
        rank: i + 1, 
        wallet: winnersArray[i], 
        score: p.score 
      })),
      prizePool: prizePool.toString(),
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (error: any) {
    console.error("Stack Tower distribution error:", error);
    return NextResponse.json(
      { error: error.message || "Distribution failed" },
      { status: 500 }
    );
  }
}