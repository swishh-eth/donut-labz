import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Week calculation - matches Friday 11PM UTC epoch
function getCurrentWeekNumber(): number {
  const now = new Date();
  const epoch = new Date('2025-01-03T23:00:00Z'); // First Friday 11PM UTC of 2025
  const diffMs = now.getTime() - epoch.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, walletAddress, username, pfpUrl, score, txHash } = body;

    if (!fid || !walletAddress || score === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: fid, walletAddress, score" },
        { status: 400 }
      );
    }

    if (typeof score !== "number" || score < 0 || score > 9999) {
      return NextResponse.json(
        { error: "Invalid score" },
        { status: 400 }
      );
    }

    const weekNumber = getCurrentWeekNumber();

    // Insert game record
    const { data, error } = await supabase
      .from("stack_tower_games")
      .insert({
        fid,
        wallet_address: walletAddress.toLowerCase(),
        username: username || null,
        pfp_url: pfpUrl || null,
        score,
        week_number: weekNumber,
        tx_hash: txHash || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to save score" },
        { status: 500 }
      );
    }

    // Get player's best score this week
    const { data: bestScore } = await supabase
      .from("stack_tower_games")
      .select("score")
      .eq("fid", fid)
      .eq("week_number", weekNumber)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    // Get player's rank
    const { data: leaderboard } = await supabase
      .from("stack_tower_games")
      .select("fid, score")
      .eq("week_number", weekNumber)
      .order("score", { ascending: false });

    // Calculate rank based on best scores per player
    let rank = null;
    if (leaderboard) {
      const bestScores = new Map<number, number>();
      leaderboard.forEach((entry: { fid: number; score: number }) => {
        if (!bestScores.has(entry.fid) || entry.score > bestScores.get(entry.fid)!) {
          bestScores.set(entry.fid, entry.score);
        }
      });
      
      const sortedPlayers = Array.from(bestScores.entries())
        .sort((a, b) => b[1] - a[1]);
      
      rank = sortedPlayers.findIndex(([playerFid]) => playerFid === fid) + 1;
    }

    return NextResponse.json({
      success: true,
      game: data,
      weekNumber,
      bestScore: bestScore?.score || score,
      rank,
    });
  } catch (error) {
    console.error("Submit score error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}