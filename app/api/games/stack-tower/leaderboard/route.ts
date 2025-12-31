import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STACK_TOWER_CONTRACT = "0x3704C7C71cDd1b37669aa5f1d366Dc0121E1e6fF";
const DONUT_TOKEN = "0x6A89a13068C73C883044048D409C8214802a8258";

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

// Week calculation - matches Friday 11PM UTC epoch
function getCurrentWeekNumber(): number {
  const now = new Date();
  const epoch = new Date('2025-01-03T23:00:00Z');
  const diffMs = now.getTime() - epoch.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

// ABI for reading prize pool
const prizePoolAbi = [
  {
    name: "getPrizePool",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week");
    const weekNumber = weekParam ? parseInt(weekParam) : getCurrentWeekNumber();

    // Get leaderboard - best score per player for the week
    const { data: games, error } = await supabase
      .from("stack_tower_games")
      .select("fid, wallet_address, username, pfp_url, score, created_at")
      .eq("week_number", weekNumber)
      .order("score", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    // Deduplicate - keep only best score per player
    const bestScores = new Map<number, {
      fid: number;
      wallet_address: string;
      username: string | null;
      pfp_url: string | null;
      score: number;
      created_at: string;
    }>();

    games?.forEach((game) => {
      const existing = bestScores.get(game.fid);
      if (!existing || game.score > existing.score) {
        bestScores.set(game.fid, game);
      }
    });

    // Sort by score and add ranks
    const leaderboard = Array.from(bestScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((entry, index) => ({
        rank: index + 1,
        fid: entry.fid,
        walletAddress: entry.wallet_address,
        username: entry.username || `fid:${entry.fid}`,
        pfpUrl: entry.pfp_url,
        score: entry.score,
      }));

    // Get prize pool from contract
    let prizePool = "0";
    try {
      const poolBalance = await publicClient.readContract({
        address: STACK_TOWER_CONTRACT as `0x${string}`,
        abi: prizePoolAbi,
        functionName: "getPrizePool",
      });
      prizePool = formatUnits(poolBalance, 18);
    } catch (contractError) {
      console.error("Contract read error:", contractError);
    }

    // Get most recent player for the "last play" display
    const { data: recentGame } = await supabase
      .from("stack_tower_games")
      .select("fid, username, pfp_url, score")
      .eq("week_number", weekNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      weekNumber,
      currentWeek: getCurrentWeekNumber(),
      prizePool,
      leaderboard,
      totalPlayers: bestScores.size,
      recentPlayer: recentGame ? {
        fid: recentGame.fid,
        username: recentGame.username || `fid:${recentGame.fid}`,
        pfpUrl: recentGame.pfp_url,
        score: recentGame.score,
      } : null,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}