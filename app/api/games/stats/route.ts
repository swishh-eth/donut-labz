// API Route: /api/games/stats/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get start of current week (Friday 6PM EST)
function getWeekStart(): Date {
  const now = new Date();
  const estOffset = -5;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const estTime = new Date(utc + 3600000 * estOffset);
  
  // Find the most recent Friday at 6PM EST
  const dayOfWeek = estTime.getDay();
  const hourOfDay = estTime.getHours();
  
  let daysToSubtract = (dayOfWeek + 2) % 7; // Days since Friday
  if (dayOfWeek === 5 && hourOfDay < 18) {
    daysToSubtract = 7; // Before Friday 6PM, go to previous Friday
  }
  
  const weekStart = new Date(estTime);
  weekStart.setDate(estTime.getDate() - daysToSubtract);
  weekStart.setHours(18, 0, 0, 0);
  
  return weekStart;
}

export async function GET() {
  try {
    const weekStart = getWeekStart();
    
    // Count games from all game tables since week start
    const [flappyResult, stackResult, dashResult] = await Promise.all([
      supabase
        .from("flappy_scores")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStart.toISOString()),
      supabase
        .from("stack_tower_scores")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStart.toISOString()),
      supabase
        .from("donut_dash_scores")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStart.toISOString()),
    ]);

    const totalGamesThisWeek = 
      (flappyResult.count || 0) + 
      (stackResult.count || 0) + 
      (dashResult.count || 0);

    return NextResponse.json({
      totalGamesThisWeek,
      breakdown: {
        flappy: flappyResult.count || 0,
        stack: stackResult.count || 0,
        dash: dashResult.count || 0,
      },
      weekStart: weekStart.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching games stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch games stats", totalGamesThisWeek: 0 },
      { status: 500 }
    );
  }
}