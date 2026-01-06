// Place in: app/api/games/donut-jump/submit-score/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function POST(req: NextRequest) {
  console.log("[Donut Jump] Submit score called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { entryId, score, fid } = body;

    console.log("[Donut Jump] Submit score body:", { entryId, score, fid });

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: entryId, score, fid" },
        { status: 400 }
      );
    }

    // Score validation - donuts collected only
    if (score < 0 || score > 10000) {
      return NextResponse.json({ success: false, error: "Invalid score" }, { status: 400 });
    }

    const currentWeek = getCurrentWeek();

    // Fetch the specific entry
    const { data: entry, error: fetchError } = await supabase
      .from("donut_jump_scores")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .single();

    console.log("[Donut Jump] Entry fetch result:", { entry, fetchError });

    if (fetchError || !entry) {
      console.error("[Donut Jump] Error fetching entry:", fetchError);
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    // Check if score was already submitted for THIS entry
    if (entry.score > 0) {
      console.log("[Donut Jump] Score already submitted for this entry:", entry.score);
      return NextResponse.json(
        { success: false, error: "Score already submitted for this entry" },
        { status: 400 }
      );
    }

    // ALWAYS update this entry with the score
    const { error: updateError } = await supabase
      .from("donut_jump_scores")
      .update({ 
        score, 
        updated_at: new Date().toISOString() 
      })
      .eq("id", entryId);

    if (updateError) {
      console.error("[Donut Jump] Error updating score:", updateError);
      return NextResponse.json({ success: false, error: "Failed to submit score" }, { status: 500 });
    }

    console.log("[Donut Jump] Score submitted:", score, "for entry:", entryId);

    // Get user's best score this week (across all their entries)
    const { data: userBestEntry } = await supabase
      .from("donut_jump_scores")
      .select("score")
      .eq("fid", fid)
      .eq("week", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    const bestScore = userBestEntry?.score || score;
    const isPersonalBest = score >= bestScore;

    // Get rank (count of players with higher best scores + 1)
    // First get best score per player
    const { data: allScores } = await supabase
      .from("donut_jump_scores")
      .select("fid, score")
      .eq("week", currentWeek)
      .gt("score", 0);

    // Calculate best score per player
    const playerBests = new Map<number, number>();
    allScores?.forEach((s) => {
      if (!playerBests.has(s.fid) || s.score > playerBests.get(s.fid)!) {
        playerBests.set(s.fid, s.score);
      }
    });

    // Count how many players have a better best score
    let betterCount = 0;
    playerBests.forEach((playerBest, playerFid) => {
      if (playerFid !== fid && playerBest > bestScore) {
        betterCount++;
      }
    });

    const rank = betterCount + 1;

    return NextResponse.json({
      success: true,
      score,
      bestScore,
      isPersonalBest,
      rank,
      week: currentWeek,
    });
  } catch (error: any) {
    console.error("[Donut Jump] Submit score error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}