import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get("week");
    const limitParam = searchParams.get("limit");
    const fidParam = searchParams.get("fid");

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    const currentWeek = config?.current_week || 1;
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

      const baseEntryFee = BigInt("1000000000000000000");
      const entryIncrement = BigInt("100000000000000000");
      const nextEntryFee = baseEntryFee + BigInt(playCount || 0) * entryIncrement;

      userStats = {
        fid,
        bestScore: userBest?.score || 0,
        rank,
        playCount: playCount || 0,
        nextEntryFee: nextEntryFee.toString(),
        nextEntryFeeFormatted: (Number(nextEntryFee) / 1e18).toFixed(1),
      };
    }

    const prizeDistribution = [
      { rank: 1, percentage: 30 },
      { rank: 2, percentage: 20 },
      { rank: 3, percentage: 15 },
      { rank: 4, percentage: 10 },
      { rank: 5, percentage: 8 },
      { rank: 6, percentage: 6 },
      { rank: 7, percentage: 5 },
      { rank: 8, percentage: 3 },
      { rank: 9, percentage: 2 },
      { rank: 10, percentage: 1 },
    ];

    return NextResponse.json({
      success: true,
      week,
      currentWeek,
      isCurrentWeek: week === currentWeek,
      leaderboard,
      userStats,
      prizeDistribution,
      contractAddress: "0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40",
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}