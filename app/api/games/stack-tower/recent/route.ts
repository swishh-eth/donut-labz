// Place in: app/api/games/stack-tower/recent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function GET(request: NextRequest) {
  try {
    const currentWeek = getCurrentWeek();

    // Get most recent game with a score > 0
    const { data: recentGame, error } = await supabase
      .from("stack_tower_games")
      .select("fid, username, pfp_url, score, created_at")
      .eq("week_number", currentWeek)
      .gt("score", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching recent game:", error);
    }

    // Get total games this week
    const { count: gamesThisWeek } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek);

    const recentPlayer = recentGame ? {
      username: recentGame.username || `fid:${recentGame.fid}`,
      score: recentGame.score,
      pfpUrl: recentGame.pfp_url,
    } : null;

    return NextResponse.json({
      success: true,
      recentPlayer,
      gamesThisWeek: gamesThisWeek || 0,
      currentWeek,
    });
  } catch (error) {
    console.error("Recent endpoint error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}