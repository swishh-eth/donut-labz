// API Route: /api/user/stats/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get("fid");

  if (!fid) {
    return NextResponse.json({ error: "FID required" }, { status: 400 });
  }

  try {
    // Get user's wallet address from fid
    const { data: userData } = await supabase
      .from("users")
      .select("address")
      .eq("fid", fid)
      .single();

    const userAddress = userData?.address?.toLowerCase();

    // Count total games played across all game tables
    const [flappyCount, stackCount, dashCount] = await Promise.all([
      supabase
        .from("flappy_scores")
        .select("id", { count: "exact", head: true })
        .eq("fid", fid),
      supabase
        .from("stack_tower_scores")
        .select("id", { count: "exact", head: true })
        .eq("fid", fid),
      supabase
        .from("donut_dash_scores")
        .select("id", { count: "exact", head: true })
        .eq("fid", fid),
    ]);

    const totalGamesPlayed = 
      (flappyCount.count || 0) + 
      (stackCount.count || 0) + 
      (dashCount.count || 0);

    // Determine favorite game
    const gameCounts = [
      { game: "Flappy Donut", count: flappyCount.count || 0 },
      { game: "Glaze Stack", count: stackCount.count || 0 },
      { game: "Donut Dash", count: dashCount.count || 0 },
    ];
    const favoriteGame = gameCounts.reduce((max, g) => g.count > max.count ? g : max, gameCounts[0]);

    // Calculate total winnings from prize distribution history
    let totalWinnings = 0;
    if (userAddress) {
      // Check flappy prize history
      const { data: flappyWins } = await supabase
        .from("flappy_prize_history")
        .select("first_amount, second_amount, third_amount, first_place, second_place, third_place")
        .or(`first_place.ilike.${userAddress},second_place.ilike.${userAddress},third_place.ilike.${userAddress}`);

      if (flappyWins) {
        for (const win of flappyWins) {
          if (win.first_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.first_amount || '0');
          }
          if (win.second_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.second_amount || '0');
          }
          if (win.third_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.third_amount || '0');
          }
        }
      }

      // Check stack prize history
      const { data: stackWins } = await supabase
        .from("stack_tower_prize_history")
        .select("first_amount, second_amount, third_amount, first_place, second_place, third_place")
        .or(`first_place.ilike.${userAddress},second_place.ilike.${userAddress},third_place.ilike.${userAddress}`);

      if (stackWins) {
        for (const win of stackWins) {
          if (win.first_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.first_amount || '0');
          }
          if (win.second_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.second_amount || '0');
          }
          if (win.third_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.third_amount || '0');
          }
        }
      }

      // Check donut dash prize history (USDC)
      const { data: dashWins } = await supabase
        .from("donut_dash_prize_history")
        .select("first_amount, second_amount, third_amount, first_place, second_place, third_place")
        .or(`first_place.ilike.${userAddress},second_place.ilike.${userAddress},third_place.ilike.${userAddress}`);

      if (dashWins) {
        for (const win of dashWins) {
          if (win.first_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.first_amount || '0');
          }
          if (win.second_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.second_amount || '0');
          }
          if (win.third_place?.toLowerCase() === userAddress) {
            totalWinnings += parseFloat(win.third_amount || '0');
          }
        }
      }
    }

    // Get tips received (sprinkles tipped to this user in chat)
    const { data: tipsData } = await supabase
      .from("chat_tips")
      .select("amount")
      .eq("recipient_fid", fid);

    const tipsReceived = tipsData?.reduce((sum, tip) => sum + (tip.amount || 0), 0) || 0;

    // Get chat sprinkles earned (points accumulated from chatting)
    const { data: chatPointsData } = await supabase
      .from("chat_points")
      .select("points")
      .eq("fid", fid)
      .single();

    const chatSprinklesEarned = chatPointsData?.points || 0;

    return NextResponse.json({
      totalGamesPlayed,
      totalWinnings,
      favoriteGame: favoriteGame.count > 0 ? favoriteGame.game : null,
      tipsReceived,
      chatSprinklesEarned,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch user stats",
        totalGamesPlayed: 0,
        totalWinnings: 0,
        favoriteGame: null,
        tipsReceived: 0,
        chatSprinklesEarned: 0,
      },
      { status: 500 }
    );
  }
}