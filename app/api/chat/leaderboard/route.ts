import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-leaderboard";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    // Get leaderboard
    const { data: leaderboard, error: leaderboardError } = await supabase
      .from("chat_points")
      .select("address, neynar_score, total_messages, total_points, last_message_at")
      .order("total_points", { ascending: false })
      .limit(limit);

    if (leaderboardError) throw leaderboardError;

    // Get total stats
    const { data: statsData, error: statsError } = await supabase
      .from("chat_points")
      .select("total_messages, total_points");

    if (statsError) throw statsError;

    const stats = {
      total_users: statsData?.length || 0,
      total_messages: statsData?.reduce((sum, row) => sum + (row.total_messages || 0), 0) || 0,
      total_points: statsData?.reduce((sum, row) => sum + (row.total_points || 0), 0) || 0,
    };

    return NextResponse.json({
      leaderboard: leaderboard || [],
      stats,
    });
  } catch (error) {
    console.error("Error fetching chat leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}