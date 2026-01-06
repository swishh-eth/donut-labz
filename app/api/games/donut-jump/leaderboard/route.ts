// Place in: app/api/games/donut-jump/leaderboard/route.ts

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
  console.log("[Donut Jump] Leaderboard API called");
  
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

    console.log("[Donut Jump] Fetching scores for week:", currentWeek);

    // Fetch more scores to ensure we get enough unique players after deduplication
    const { data: scores, error } = await supabase
      .from("donut_jump_scores")
      .select("fid, wallet_address, username, display_name, pfp_url, score, created_at")
      .eq("week", currentWeek)
      .gt("score", 0)
      .order("score", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[Donut Jump] Supabase error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log("[Donut Jump] Got scores:", scores?.length || 0);

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

    // User stats
    let userStats = null;
    if (fidParam) {
      const fid = parseInt(fidParam);
      const userEntry = leaderboard.find(e => e.fid === fid);
      
      // Get games played count
      const { count: gamesPlayed } = await supabase
        .from("donut_jump_scores")
        .select("*", { count: "exact", head: true })
        .eq("fid", fid)
        .eq("week", currentWeek);

      if (userEntry) {
        userStats = {
          fid,
          bestScore: userEntry.score,
          rank: userEntry.rank,
          gamesPlayed: gamesPlayed || 0,
        };
      } else {
        userStats = {
          fid,
          bestScore: 0,
          rank: null,
          gamesPlayed: gamesPlayed || 0,
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

    console.log("[Donut Jump] Returning leaderboard with", leaderboard.length, "entries");

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
    console.error("[Donut Jump] Leaderboard error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}