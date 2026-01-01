import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawAddress = searchParams.get("address");
  const fid = searchParams.get("fid");

  if (!rawAddress) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  const address = rawAddress.toLowerCase();
  const userFid = fid ? parseInt(fid) : null;

  try {
    // Check premium status
    const { data: premiumData } = await supabase
      .from("premium_users")
      .select("*")
      .eq("wallet_address", address)
      .maybeSingle();

    const isPremium = !!premiumData;

    // Get unlocked skins
    const { data: skinsData } = await supabase
      .from("user_skins")
      .select("skin_id")
      .eq("wallet_address", address);

    const unlockedSkins = skinsData?.map((s) => s.skin_id) || [];

    // Get equipped skin
    const { data: equippedData } = await supabase
      .from("user_equipped_skin")
      .select("skin_id")
      .eq("wallet_address", address)
      .maybeSingle();

    const equippedSkin = equippedData?.skin_id || null;

    // Get stats for each game
    const stats: Record<string, { gamesPlayed: number; highScore: number; totalScore: number }> = {
      "flappy-donut": { gamesPlayed: 0, highScore: 0, totalScore: 0 },
      "glaze-stack": { gamesPlayed: 0, highScore: 0, totalScore: 0 },
      "donut-dash": { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    };

    // Flappy Donut stats - from flappy_games table (uses player_address)
    const { data: flappyGames, error: flappyErr } = await supabase
      .from("flappy_games")
      .select("score")
      .eq("player_address", address);

    if (flappyErr) {
      console.error("Flappy query error:", flappyErr);
    }

    if (flappyGames && flappyGames.length > 0) {
      stats["flappy-donut"].gamesPlayed = flappyGames.length;
      stats["flappy-donut"].highScore = Math.max(...flappyGames.map((g) => g.score || 0));
      stats["flappy-donut"].totalScore = flappyGames.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    // Glaze Stack stats - uses wallet_address
    const { data: stackGames, error: stackErr } = await supabase
      .from("stack_tower_games")
      .select("score")
      .eq("wallet_address", address);

    if (stackErr) {
      console.error("Stack query error:", stackErr);
    }

    if (stackGames && stackGames.length > 0) {
      stats["glaze-stack"].gamesPlayed = stackGames.length;
      stats["glaze-stack"].highScore = Math.max(...stackGames.map((g) => g.score || 0));
      stats["glaze-stack"].totalScore = stackGames.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    // Donut Dash stats (uses fid, not wallet_address)
    let dashScores = null;
    if (userFid) {
      const { data, error: dashErr } = await supabase
        .from("donut_dash_scores")
        .select("score")
        .eq("fid", userFid)
        .gt("score", 0);

      if (dashErr) {
        console.error("Dash query error:", dashErr);
      }
      dashScores = data;
    }

    if (dashScores && dashScores.length > 0) {
      stats["donut-dash"].gamesPlayed = dashScores.length;
      stats["donut-dash"].highScore = Math.max(...dashScores.map((g) => g.score || 0));
      stats["donut-dash"].totalScore = dashScores.reduce((sum, g) => sum + (g.score || 0), 0);
    }

    return NextResponse.json({
      isPremium,
      unlockedSkins,
      equippedSkin,
      stats,
      debug: {
        address,
        fid: userFid,
        flappyCount: flappyGames?.length || 0,
        stackCount: stackGames?.length || 0,
        dashCount: dashScores?.length || 0,
      }
    });
  } catch (error) {
    console.error("Error fetching user skin data:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}