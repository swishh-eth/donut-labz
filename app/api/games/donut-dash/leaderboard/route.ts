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

export async function GET(req: NextRequest) {
  console.log("Donut Dash Leaderboard API called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const fidParam = searchParams.get("fid");

    const currentWeek = getCurrentWeek();
    const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 100;

    console.log("Fetching scores for week:", currentWeek);

    // Simple query - get top scores
    const { data: scores, error } = await supabase
      .from("donut_dash_scores")
      .select("fid, wallet_address, username, display_name, pfp_url, score, created_at")
      .eq("week", currentWeek)
      .gt("score", 0)
      .order("score", { ascending: false })
      .limit(limit * 2);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log("Got scores:", scores?.length || 0);

    // Deduplicate by fid, keeping best score
    const seenFids = new Set<number>();
    const leaderboard: any[] = [];
    
    for (const score of scores || []) {
      if (!seenFids.has(score.fid)) {
        seenFids.add(score.fid);
        leaderboard.push({
          rank: leaderboard.length + 1,
          fid: score.fid,
          walletAddress: score.wallet_address,
          username: score.username,
          displayName: score.display_name,
          pfpUrl: score.pfp_url,
          score: score.score,
        });
        if (leaderboard.length >= limit) break;
      }
    }

    // User stats (simple version)
    let userStats = null;
    if (fidParam) {
      const fid = parseInt(fidParam);
      const userEntry = leaderboard.find(e => e.fid === fid);
      if (userEntry) {
        userStats = {
          fid,
          bestScore: userEntry.score,
          rank: userEntry.rank,
          gamesPlayed: 0,
        };
      }
    }

    // Prize distribution
    const totalPrize = 5;
    const prizePercentages = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];
    const prizeStructure = prizePercentages.map((percent, i) => ({
      rank: i + 1,
      percent,
      amount: ((totalPrize * percent) / 100).toFixed(2),
    }));

    console.log("Returning leaderboard with", leaderboard.length, "entries");

    return NextResponse.json({
      success: true,
      week: currentWeek,
      currentWeek,
      leaderboard,
      userStats,
      prizeStructure,
      totalPrize,
    });
  } catch (error: any) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}