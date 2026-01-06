// Place in: app/api/games/donut-jump/recent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function GET(request: NextRequest) {
  try {
    const currentWeek = getCurrentWeek();

    // Get most recent player
    const { data: recentScore, error: recentError } = await supabase
      .from("donut_jump_scores")
      .select("username, score, pfp_url")
      .gt("score", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get games played this week
    const { count: gamesThisWeek, error: countError } = await supabase
      .from("donut_jump_scores")
      .select("*", { count: "exact", head: true })
      .eq("week", currentWeek);

    // Get top score this week
    const { data: topScore } = await supabase
      .from("donut_jump_scores")
      .select("username, score, pfp_url")
      .eq("week", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      recentPlayer: recentScore ? {
        username: recentScore.username,
        score: recentScore.score,
        pfpUrl: recentScore.pfp_url,
      } : null,
      topPlayer: topScore ? {
        username: topScore.username,
        score: topScore.score,
        pfpUrl: topScore.pfp_url,
      } : null,
      gamesThisWeek: gamesThisWeek || 0,
    });
  } catch (error: any) {
    console.error("[Donut Jump Recent] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message, recentPlayer: null, gamesThisWeek: 0 },
      { status: 500 }
    );
  }
}