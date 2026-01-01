import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get("week");
    const limitParam = searchParams.get("limit");
    const fidParam = searchParams.get("fid");

    const currentWeek = getCurrentWeek();
    const week = weekParam ? parseInt(weekParam) : currentWeek;
    const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 100;

    const { data: scores, error } = await supabase
      .from("donut_dash_scores")
      .select("fid, wallet_address, username, display_name, pfp_url, score, created_at")
      .eq("week", week)
      .gt("score", 0)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit * 2);

    if (error) {
      console.error("Error fetching leaderboard:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }

    // Deduplicate by fid, keeping best score
    const seenFids = new Set<number>();
    const leaderboard = [];
    
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

    let userStats = null;
    if (fidParam) {
      const fid = parseInt(fidParam);
      
      const { data: userBest } = await supabase
        .from("donut_dash_scores")
        .select("score")
        .eq("fid", fid)
        .eq("week", week)
        .gt("score", 0)
        .order("score", { ascending: false })
        .limit(1)
        .single();

      const { count: playCount } = await supabase
        .from("donut_dash_scores")
        .select("*", { count: "exact", head: true })
        .eq("fid", fid)
        .eq("week", week);

      let rank = null;
      if (userBest?.score) {
        const { count: betterScores } = await supabase
          .from("donut_dash_scores")
          .select("*", { count: "exact", head: true })
          .eq("week", week)
          .gt("score", userBest.score);
        rank = (betterScores || 0) + 1;
      }

      userStats = {
        fid,
        bestScore: userBest?.score || 0,
        rank,
        playCount: playCount || 0,
      };
    }

    // Prize distribution in USDC
    const prizeDistribution = [
      { rank: 1, amount: "4.00" },
      { rank: 2, amount: "2.00" },
      { rank: 3, amount: "1.50" },
      { rank: 4, amount: "0.80" },
      { rank: 5, amount: "0.50" },
      { rank: 6, amount: "0.40" },
      { rank: 7, amount: "0.30" },
      { rank: 8, amount: "0.20" },
      { rank: 9, amount: "0.20" },
      { rank: 10, amount: "0.10" },
    ];

    return NextResponse.json({
      success: true,
      week,
      currentWeek,
      isCurrentWeek: week === currentWeek,
      leaderboard,
      userStats,
      prizeDistribution,
      totalPrize: 10,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}