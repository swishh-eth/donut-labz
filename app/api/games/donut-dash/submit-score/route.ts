import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entryId, score, fid } = body;

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { error: "Missing required fields: entryId, score, fid" },
        { status: 400 }
      );
    }

    if (score < 0 || score > 10000) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }

    const { data: entry, error: fetchError } = await supabase
      .from("donut_dash_scores")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ error: "Entry not found or unauthorized" }, { status: 404 });
    }

    if (entry.score > 0) {
      return NextResponse.json({ error: "Score already submitted for this entry" }, { status: 400 });
    }

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    const currentWeek = config?.current_week || 1;

    if (entry.week !== currentWeek) {
      return NextResponse.json({ error: "Entry is from a previous week" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("donut_dash_scores")
      .update({ score })
      .eq("id", entryId);

    if (updateError) {
      console.error("Error updating score:", updateError);
      return NextResponse.json({ error: "Failed to submit score" }, { status: 500 });
    }

    const { count: betterScores } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("week", currentWeek)
      .gt("score", score);

    const rank = (betterScores || 0) + 1;

    const { data: bestScore } = await supabase
      .from("donut_dash_scores")
      .select("score")
      .eq("fid", fid)
      .eq("week", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      score,
      rank,
      week: currentWeek,
      isPersonalBest: score === bestScore?.score,
      bestScore: bestScore?.score || score,
    });
  } catch (error) {
    console.error("Error submitting score:", error);
    return NextResponse.json({ error: "Failed to submit score" }, { status: 500 });
  }
}