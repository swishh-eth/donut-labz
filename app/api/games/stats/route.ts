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
  
  // Find the most recent Friday 6PM EST
  const dayOfWeek = estTime.getDay();
  const hourOfDay = estTime.getHours();
  
  // Days since last Friday (0 = Sunday, 5 = Friday)
  let daysSinceFriday = (dayOfWeek + 2) % 7; // Convert to days since Friday
  
  // If it's Friday but before 6PM, count back to previous Friday
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

    // Get Flappy Donut plays this week
    const { count: flappyCount, error: flappyError } = await supabase
      .from("flappy_scores")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    // Get Glaze Stack plays this week
    const { count: stackCount, error: stackError } = await supabase
      .from("stack_tower_scores")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    // Get Donut Dash plays this week
    const { count: dashCount, error: dashError } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    const flappyGamesThisWeek = flappyCount || 0;
    const stackGamesThisWeek = stackCount || 0;
    const dashGamesThisWeek = dashCount || 0;
    const totalGamesThisWeek = flappyGamesThisWeek + stackGamesThisWeek + dashGamesThisWeek;

    return NextResponse.json({
      totalGamesThisWeek,
      flappyGamesThisWeek,
      stackGamesThisWeek,
      dashGamesThisWeek,
      weekStart: weekStartISO,
    });
  } catch (error: any) {
    console.error("[Games Stats] Error:", error);
    return NextResponse.json(
      { error: error.message, totalGamesThisWeek: 0 },
      { status: 500 }
    );
  }
}