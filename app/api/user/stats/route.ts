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
    // Get user's wallet address from fid via profile_cache
    const { data: userData } = await supabase
      .from("profile_cache")
      .select("address")
      .eq("fid", parseInt(fid))
      .single();

    const userAddress = userData?.address?.toLowerCase();

    let flappyCount = 0;
    let stackCount = 0;
    let dashCount = 0;

    // Flappy games - uses player_address column (no fid)
    if (userAddress) {
      const { count } = await supabase
        .from("flappy_games")
        .select("*", { count: "exact", head: true })
        .ilike("player_address", userAddress);
      flappyCount = count || 0;
    }

    // Stack tower games - uses fid column
    const { count: stackByFid } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true })
      .eq("fid", parseInt(fid));
    stackCount = stackByFid || 0;

    // Donut dash scores - uses fid column
    const { count: dashByFid } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("fid", parseInt(fid));
    dashCount = dashByFid || 0;

    const totalGamesPlayed = flappyCount + stackCount + dashCount;

    // Determine favorite game
    const gameCounts = [
      { game: "Flappy Donut", count: flappyCount },
      { game: "Glaze Stack", count: stackCount },
      { game: "Donut Dash", count: dashCount },
    ];
    const favoriteGame = gameCounts.reduce((max, g) => g.count > max.count ? g : max, gameCounts[0]);

    // Calculate total winnings from prize distribution history
    let totalWinnings = 0;
    if (userAddress) {
      // Check weekly_winners table
      const { data: weeklyWins } = await supabase
        .from("weekly_winners")
        .select("*");

      if (weeklyWins) {
        for (const win of weeklyWins) {
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

      // Check donut dash prize distributions
      const { data: dashWins } = await supabase
        .from("donut_dash_prize_distributions")
        .select("*");

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

      // Check flappy_distributions table too
      const { data: flappyDist } = await supabase
        .from("flappy_distributions")
        .select("*");

      if (flappyDist) {
        for (const win of flappyDist) {
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

    // Get tips received - chat_tips uses to_address column
    let tipsReceived = 0;
    if (userAddress) {
      const { data: tipsData } = await supabase
        .from("chat_tips")
        .select("amount")
        .ilike("to_address", userAddress);

      tipsReceived = tipsData?.reduce((sum, tip) => sum + (parseFloat(tip.amount) || 0), 0) || 0;
    }

    // Get chat sprinkles earned from chat_points table
    // Uses address column and total_points column
    let chatSprinklesEarned = 0;
    if (userAddress) {
      const { data: chatPointsData } = await supabase
        .from("chat_points")
        .select("total_points")
        .ilike("address", userAddress)
        .single();

      chatSprinklesEarned = chatPointsData?.total_points || 0;
    }

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