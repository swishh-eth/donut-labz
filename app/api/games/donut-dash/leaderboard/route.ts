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
      
      // Get user's best score - use maybeSingle() instead of single() to avoid errors
      const { data: userScores } = await supabase
        .from("donut_dash_scores")
        .select("score")
        .eq("fid", fid)
        .eq("week", week)
        .gt("score", 0)
        .order("score", { ascending: false })
        .limit(1);

      const userBestScore = userScores?.[0]?.score || 0;

      // Get play count
      const { count: gamesPlayed } = await supabase
        .from("donut_dash_scores")
        .select("*", { count: "exact", head: true })
        .eq("fid", fid)
        .eq("week", week);

      // Find rank from leaderboard array (more accurate than count query)
      let rank = null;
      if (userBestScore > 0) {
        const userInLeaderboard = leaderboard.find(e => e.fid === fid);
        if (userInLeaderboard) {
          rank = userInLeaderboard.rank;
        } else {
          // User not in top results, count how many unique users have better scores
          rank = leaderboard.filter(e => e.score > userBestScore).length + 1;
        }
      }

      userStats = {
        fid,
        bestScore: userBestScore,
        rank,
        gamesPlayed: gamesPlayed || 0,
      };
    }

    // Prize distribution - percentages (amounts calculated from totalPrize)
    const totalPrize = 5; // Keep in sync with prize-distribute route
    const prizePercentages = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];
    const prizeDistribution = prizePercentages.map((percent, i) => ({
      rank: i + 1,
      percent,
      amount: ((totalPrize * percent) / 100).toFixed(2),
    }));

    return NextResponse.json({
      success: true,
      week,
      currentWeek,
      isCurrentWeek: week === currentWeek,
      leaderboard,
      userStats,
      prizeDistribution,
      totalPrize,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}