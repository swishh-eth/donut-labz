import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get Friday 6PM EST as the start of the week
function getWeekStart(): Date {
  const now = new Date();
  const estOffset = -5 * 60; // EST offset in minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const estTime = new Date(utc + estOffset * 60000);
  
  const dayOfWeek = estTime.getDay();
  const hourOfDay = estTime.getHours();
  
  let daysSinceFriday = (dayOfWeek + 2) % 7;
  
  if (dayOfWeek === 5 && hourOfDay < 18) {
    daysSinceFriday = 7;
  }
  
  const weekStart = new Date(estTime);
  weekStart.setDate(estTime.getDate() - daysSinceFriday);
  weekStart.setHours(18, 0, 0, 0);
  
  return weekStart;
}

export async function GET(request: NextRequest) {
  try {
    const weekStart = getWeekStart();
    const weekStartISO = weekStart.toISOString();

    // Get most recent player - using flappy_games table
    const { data: recentScore, error: recentError } = await supabase
      .from("flappy_games")
      .select("username, score, pfp_url")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get games played this week
    const { count: gamesThisWeek, error: countError } = await supabase
      .from("flappy_games")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    // Get prize pool (sum of to_prize_pool this week)
    const { data: prizeData, error: prizeError } = await supabase
      .from("flappy_games")
      .select("to_prize_pool")
      .gte("created_at", weekStartISO);

    let prizePool = 0;
    if (prizeData) {
      prizePool = prizeData.reduce((sum, row) => sum + (row.to_prize_pool || 0), 0);
    }

    return NextResponse.json({
      recentPlayer: recentScore ? {
        username: recentScore.username,
        score: recentScore.score,
        pfpUrl: recentScore.pfp_url,
      } : null,
      gamesThisWeek: gamesThisWeek || 0,
      prizePool: prizePool.toFixed(2),
    });
  } catch (error: any) {
    console.error("[Flappy Recent] Error:", error);
    return NextResponse.json(
      { error: error.message, recentPlayer: null, gamesThisWeek: 0, prizePool: "0" },
      { status: 500 }
    );
  }
}