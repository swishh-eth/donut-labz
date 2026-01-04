import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get Friday 6PM EST as the start of the week
function getWeekStart(): Date {
  const now = new Date();
  const estOffset = -5 * 60;
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

    // Check flappy_games
    const { count: flappyTotal } = await supabase
      .from("flappy_games")
      .select("*", { count: "exact", head: true });

    const { count: flappyWeek } = await supabase
      .from("flappy_games")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    const { data: flappySample } = await supabase
      .from("flappy_games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    // Check stack_tower_games
    const { count: stackTotal } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true });

    const { count: stackWeek } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    const { data: stackSample } = await supabase
      .from("stack_tower_games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    // Check donut_dash_scores
    const { count: dashTotal } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true });

    const { count: dashWeek } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    const { data: dashSample } = await supabase
      .from("donut_dash_scores")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      weekStart: weekStartISO,
      currentTime: new Date().toISOString(),
      flappy: {
        totalAllTime: flappyTotal || 0,
        thisWeek: flappyWeek || 0,
        latestRow: flappySample?.[0] || null,
      },
      stack: {
        totalAllTime: stackTotal || 0,
        thisWeek: stackWeek || 0,
        latestRow: stackSample?.[0] || null,
      },
      dash: {
        totalAllTime: dashTotal || 0,
        thisWeek: dashWeek || 0,
        latestRow: dashSample?.[0] || null,
      },
    });
  } catch (error: any) {
    console.error("[Games Debug] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}