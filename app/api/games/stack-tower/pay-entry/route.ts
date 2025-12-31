import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseUnits } from "viem";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const STACK_TOWER_CONTRACT = "0x3704C7C71cDd1b37669aa5f1d366Dc0121E1e6fF";
export const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";

// Get current "day" based on 6PM EST (11PM UTC) reset
function getCurrentDay(): string {
  const now = new Date();
  // Subtract 23 hours to align with 11PM UTC boundary
  const adjusted = new Date(now.getTime() - 23 * 60 * 60 * 1000);
  return adjusted.toISOString().split('T')[0];
}

// Calculate time until next 6PM EST reset
function getTimeUntilCostReset(): { hours: number; minutes: number } {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  
  // Target: 23:00 UTC (6PM EST)
  let hoursUntil = 23 - utcHour;
  let minutesUntil = 0 - utcMinute;
  
  if (minutesUntil < 0) {
    hoursUntil -= 1;
    minutesUntil += 60;
  }
  
  if (hoursUntil < 0) {
    hoursUntil += 24;
  }
  
  return { hours: hoursUntil, minutes: minutesUntil };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid parameter" },
        { status: 400 }
      );
    }

    const currentDay = getCurrentDay();

    // Get today's attempts for this player
    const { data: attempts } = await supabase
      .from("stack_tower_daily_attempts")
      .select("attempt_count")
      .eq("fid", parseInt(fid))
      .eq("reset_day", currentDay)
      .single();

    const attemptCount = attempts?.attempt_count || 0;
    const entryCost = 1 + (attemptCount * 0.1); // 1.0 DONUT for first, 1.1 for second, etc.
    const resetTime = getTimeUntilCostReset();

    return NextResponse.json({
      fid: parseInt(fid),
      attemptsToday: attemptCount,
      entryCost,
      entryCostWei: parseUnits(entryCost.toFixed(1), 18).toString(),
      resetIn: `${resetTime.hours}h ${resetTime.minutes}m`,
      contractAddress: STACK_TOWER_CONTRACT,
      tokenAddress: DONUT_TOKEN,
    });
  } catch (error) {
    console.error("Get entry cost error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, txHash } = body;

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    const currentDay = getCurrentDay();

    // Get current attempts
    const { data: existing } = await supabase
      .from("stack_tower_daily_attempts")
      .select("attempt_count")
      .eq("fid", fid)
      .eq("reset_day", currentDay)
      .single();

    let newCount = 1;
    
    if (existing) {
      // Increment existing
      newCount = existing.attempt_count + 1;
      await supabase
        .from("stack_tower_daily_attempts")
        .update({ 
          attempt_count: newCount,
          updated_at: new Date().toISOString(),
        })
        .eq("fid", fid)
        .eq("reset_day", currentDay);
    } else {
      // Insert new
      await supabase
        .from("stack_tower_daily_attempts")
        .insert({
          fid,
          reset_day: currentDay,
          attempt_count: 1,
        });
    }

    return NextResponse.json({
      success: true,
      fid,
      attemptsToday: newCount,
      nextEntryCost: 1 + (newCount * 0.1),
      txHash,
    });
  } catch (error) {
    console.error("Record entry error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}