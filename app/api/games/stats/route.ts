// Place in: app/api/games/stats/route.ts

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
  
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function GET(request: NextRequest) {
  try {
    const currentWeek = getCurrentWeek();

    // Count Flappy Bird games this week
    const { count: flappyCount } = await supabase
      .from("flappy_games")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek);

    // Count Stack Tower games this week
    const { count: stackCount } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true })
      .eq("week_number", currentWeek);

    // Count Donut Dash games this week
    const { count: dashCount } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("week", currentWeek);

    const totalGamesThisWeek = (flappyCount || 0) + (stackCount || 0) + (dashCount || 0);

    return NextResponse.json({
      success: true,
      currentWeek,
      totalGamesThisWeek,
      breakdown: {
        flappy: flappyCount || 0,
        stack: stackCount || 0,
        dash: dashCount || 0,
      },
    });
  } catch (error) {
    console.error("Games stats error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", totalGamesThisWeek: 0 },
      { status: 500 }
    );
  }
}