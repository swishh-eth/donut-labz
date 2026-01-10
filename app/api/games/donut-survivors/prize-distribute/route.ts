// Place in: app/api/games/donut-survivors/prize-distribute/route.ts

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
    const currentWeek = getCurrentWeek();
    const weekStart = getWeekStart();
    const weekStartISO = weekStart.toISOString();

    // Fixed prize pool for free arcade games
    const totalPrize = 5;
    
    // Prize distribution percentages
    const prizePercentages = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];
    const prizeStructure = prizePercentages.map((percent, i) => ({
      rank: i + 1,
      percent,
      amount: ((totalPrize * percent) / 100).toFixed(2),
    }));

    // Get games played this week
    const { count: gamesThisWeek } = await supabase
      .from("donut_survivors_scores")
      .select("*", { count: "exact", head: true })
      .eq("week", currentWeek);

    // Get unique players this week
    const { data: uniquePlayers } = await supabase
      .from("donut_survivors_scores")
      .select("fid")
      .eq("week", currentWeek)
      .gt("score", 0);

    const uniquePlayerCount = new Set(uniquePlayers?.map(p => p.fid) || []).size;

    return NextResponse.json({
      success: true,
      totalPrize,
      prizeStructure,
      week: currentWeek,
      gamesThisWeek: gamesThisWeek || 0,
      uniquePlayers: uniquePlayerCount,
    });
  } catch (error: any) {
    console.error("[Donut Survivors] Prize distribute error:", error);
    return NextResponse.json(
      { success: false, error: error.message, totalPrize: 5 },
      { status: 500 }
    );
  }
}