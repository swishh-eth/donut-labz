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
  console.log("Submit score called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { entryId, score, fid } = body;

    console.log("Submit score body:", { entryId, score, fid });

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: entryId, score, fid" },
        { status: 400 }
      );
    }

    if (score < 0 || score > 10000) {
      return NextResponse.json({ success: false, error: "Invalid score" }, { status: 400 });
    }

    const currentWeek = getCurrentWeek();

    // Fetch the player's entry for this week
    const { data: entries, error: fetchError } = await supabase
      .from("donut_dash_scores")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .eq("week", currentWeek)
      .limit(1);

    console.log("Entry fetch result:", { entries, fetchError });

    if (fetchError) {
      console.error("Error fetching entry:", fetchError);
      return NextResponse.json({ success: false, error: "Database error" }, { status: 500 });
    }

    const entry = entries?.[0];
    if (!entry) {
      return NextResponse.json({ success: false, error: "Entry not found or unauthorized" }, { status: 404 });
    }

    // Only update if new score is higher than existing score
    const currentBestScore = entry.score || 0;
    const isNewBest = score > currentBestScore;

    if (isNewBest) {
      const { error: updateError } = await supabase
        .from("donut_dash_scores")
        .update({ 
          score, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", entryId);

      if (updateError) {
        console.error("Error updating score:", updateError);
        return NextResponse.json({ success: false, error: "Failed to submit score" }, { status: 500 });
      }

      console.log("Score updated from", currentBestScore, "to", score);
    } else {
      console.log("Score", score, "not higher than current best", currentBestScore, "- not updating");
    }

    // Get rank (count of players with higher scores + 1)
    const bestScore = isNewBest ? score : currentBestScore;
    
    const { count: betterScores } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("week", currentWeek)
      .gt("score", bestScore);

    const rank = (betterScores || 0) + 1;

    return NextResponse.json({
      success: true,
      score,
      bestScore,
      isPersonalBest: isNewBest,
      rank,
      week: currentWeek,
    });
  } catch (error: any) {
    console.error("Submit score error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}