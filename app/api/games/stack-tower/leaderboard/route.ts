// Place in: app/api/games/stack-tower/leaderboard/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
// Matches the prize distribution week calculation
function getCurrentWeekNumber(): number {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");
    const limit = parseInt(searchParams.get("limit") || "10");

    const currentWeek = getCurrentWeekNumber();

    // Get all games for current week
    const { data: games, error } = await supabase
      .from("stack_tower_games")
      .select("fid, wallet_address, username, pfp_url, score")
      .eq("week_number", currentWeek)
      .gt("score", 0)
      .order("score", { ascending: false });

    if (error) {
      console.error("Leaderboard fetch error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch leaderboard" },
        { status: 500 }
      );
    }

    // Build leaderboard with best score per player
    const playerBests = new Map<number, {
      fid: number;
      walletAddress: string;
      username: string;
      pfpUrl: string | null;
      score: number;
    }>();

    games?.forEach((game) => {
      const existing = playerBests.get(game.fid);
      if (!existing || game.score > existing.score) {
        playerBests.set(game.fid, {
          fid: game.fid,
          walletAddress: game.wallet_address,
          username: game.username || `fid:${game.fid}`,
          pfpUrl: game.pfp_url,
          score: game.score,
        });
      }
    });

    // Sort by score and add ranks
    const leaderboard = Array.from(playerBests.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        fid: entry.fid,
        walletAddress: entry.walletAddress,
        username: entry.username,
        displayName: entry.username,
        pfpUrl: entry.pfpUrl,
        score: entry.score,
      }));

    // Get user stats if fid provided
    let userStats = null;
    if (fid) {
      const fidNum = parseInt(fid);

      // Get user's games this week
      const { data: userGames, count } = await supabase
        .from("stack_tower_games")
        .select("score", { count: "exact" })
        .eq("fid", fidNum)
        .eq("week_number", currentWeek);

      const bestScore = userGames?.reduce((max, g) => Math.max(max, g.score || 0), 0) || 0;

      // Find user's rank
      const allPlayers = Array.from(playerBests.values())
        .sort((a, b) => b.score - a.score);
      const userRankIndex = allPlayers.findIndex((p) => p.fid === fidNum);

      userStats = {
        rank: userRankIndex >= 0 ? userRankIndex + 1 : null,
        bestScore,
        gamesPlayed: count || 0,
      };
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      currentWeek,
      userStats,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}