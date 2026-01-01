// app/api/games/skin-market/user-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  try {
    // Check premium status
    const { data: premiumData } = await supabase
      .from("premium_users")
      .select("*")
      .eq("wallet_address", address)
      .single();

    const isPremium = !!premiumData;

    // Get unlocked skins
    const { data: skinsData } = await supabase
      .from("user_skins")
      .select("skin_id")
      .eq("wallet_address", address);

    const unlockedSkins = skinsData?.map(s => s.skin_id) || [];

    // Get equipped skin
    const { data: equippedData } = await supabase
      .from("user_equipped_skin")
      .select("skin_id")
      .eq("wallet_address", address)
      .single();

    const equippedSkin = equippedData?.skin_id || null;

    // Get game stats for achievement progress
    const stats: Record<string, { gamesPlayed: number; highScore: number; totalScore: number }> = {
      'flappy-donut': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
      'glaze-stack': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
      'donut-dash': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    };

    // Flappy Donut stats
    const { data: flappyGames } = await supabase
      .from("flappy_games")
      .select("score")
      .eq("wallet_address", address);

    if (flappyGames && flappyGames.length > 0) {
      stats['flappy-donut'].gamesPlayed = flappyGames.length;
      stats['flappy-donut'].highScore = Math.max(...flappyGames.map(g => g.score || 0));
      stats['flappy-donut'].totalScore = flappyGames.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    // Glaze Stack stats
    const { data: stackGames } = await supabase
      .from("stack_tower_games")
      .select("score")
      .eq("wallet_address", address);

    if (stackGames && stackGames.length > 0) {
      stats['glaze-stack'].gamesPlayed = stackGames.length;
      stats['glaze-stack'].highScore = Math.max(...stackGames.map(g => g.score || 0));
      stats['glaze-stack'].totalScore = stackGames.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    // Donut Dash stats - count entries as games played
    const { data: dashScores } = await supabase
      .from("donut_dash_scores")
      .select("score")
      .eq("wallet_address", address);

    // For Donut Dash, we need to count total entries (games played)
    // Since scores table only has best scores, we might need a separate games table
    // For now, estimate based on scores existing
    if (dashScores && dashScores.length > 0) {
      // If they have a score entry, count as at least 1 game
      // TODO: Add donut_dash_games table to track individual plays
      stats['donut-dash'].gamesPlayed = dashScores.length; // This is per-week entries
      stats['donut-dash'].highScore = Math.max(...dashScores.map(g => g.score || 0));
      stats['donut-dash'].totalScore = dashScores.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    // Alternative: Check donut_dash_config for play counts if available
    const { data: dashConfig } = await supabase
      .from("donut_dash_config")
      .select("total_plays")
      .eq("wallet_address", address)
      .single();

    if (dashConfig?.total_plays) {
      stats['donut-dash'].gamesPlayed = dashConfig.total_plays;
    }

    return NextResponse.json({
      isPremium,
      unlockedSkins,
      equippedSkin,
      stats,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}