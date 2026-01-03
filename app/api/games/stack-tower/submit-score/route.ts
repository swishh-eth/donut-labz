// Place in: app/api/games/stack-tower/submit-score/route.ts

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entryId, score, fid, walletAddress, username, pfpUrl } = body;

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the entry exists and belongs to this user
    const { data: entry, error: fetchError } = await supabase
      .from("stack_tower_games")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    // Check if score was already submitted
    if (entry.score > 0) {
      return NextResponse.json(
        { success: false, error: "Score already submitted" },
        { status: 400 }
      );
    }

    // Update the entry with the score
    const { error: updateError } = await supabase
      .from("stack_tower_games")
      .update({
        score,
        username: username || entry.username,
        pfp_url: pfpUrl || entry.pfp_url,
      })
      .eq("id", entryId);

    if (updateError) {
      console.error("Failed to update score:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to submit score" },
        { status: 500 }
      );
    }

    const currentWeek = getCurrentWeekNumber();

    // Get user's best score this week
    const { data: userBest } = await supabase
      .from("stack_tower_games")
      .select("score")
      .eq("fid", fid)
      .eq("week_number", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    const isPersonalBest = userBest?.score === score;

    // Get user's rank (based on best score per player)
    const { data: rankings } = await supabase
      .from("stack_tower_games")
      .select("fid, score")
      .eq("week_number", currentWeek)
      .order("score", { ascending: false });

    // Calculate unique player rankings by best score
    const playerBests = new Map<number, number>();
    rankings?.forEach((r) => {
      if (!playerBests.has(r.fid) || r.score > playerBests.get(r.fid)!) {
        playerBests.set(r.fid, r.score);
      }
    });

    const sortedPlayers = Array.from(playerBests.entries())
      .sort((a, b) => b[1] - a[1]);

    const userRank = sortedPlayers.findIndex(([f]) => f === fid) + 1;

    return NextResponse.json({
      success: true,
      score,
      rank: userRank || null,
      isPersonalBest,
      bestScore: userBest?.score || score,
    });
  } catch (error) {
    console.error("Submit score error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}