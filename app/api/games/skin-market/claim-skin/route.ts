// app/api/games/skin-market/claim-skin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Achievement requirements matching the frontend
const ACHIEVEMENT_REQUIREMENTS: Record<string, { gameId: string; type: string; value: number }> = {
  'flappy-bronze': { gameId: 'flappy-donut', type: 'games_played', value: 25 },
  'flappy-silver': { gameId: 'flappy-donut', type: 'games_played', value: 50 },
  'flappy-epic': { gameId: 'flappy-donut', type: 'games_played', value: 100 },
  'flappy-gold': { gameId: 'flappy-donut', type: 'high_score', value: 300 },
  'stack-bronze': { gameId: 'glaze-stack', type: 'games_played', value: 25 },
  'stack-silver': { gameId: 'glaze-stack', type: 'games_played', value: 50 },
  'stack-epic': { gameId: 'glaze-stack', type: 'games_played', value: 100 },
  'stack-gold': { gameId: 'glaze-stack', type: 'high_score', value: 100 },
  'dash-bronze': { gameId: 'donut-dash', type: 'games_played', value: 25 },
  'dash-silver': { gameId: 'donut-dash', type: 'games_played', value: 50 },
  'dash-epic': { gameId: 'donut-dash', type: 'games_played', value: 100 },
  'dash-gold': { gameId: 'donut-dash', type: 'high_score', value: 1000 },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, skinId } = body;

    if (!address || !skinId) {
      return NextResponse.json({ error: "Address and skinId required" }, { status: 400 });
    }

    const walletAddress = address.toLowerCase();

    // Check if user is premium
    const { data: premiumData } = await supabase
      .from("premium_users")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single();

    if (!premiumData) {
      return NextResponse.json({ error: "Premium required to claim skins" }, { status: 403 });
    }

    // Check if skin already claimed
    const { data: existingSkin } = await supabase
      .from("user_skins")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("skin_id", skinId)
      .single();

    if (existingSkin) {
      return NextResponse.json({ success: true, message: "Already claimed" });
    }

    // Verify achievement requirements are met
    const requirement = ACHIEVEMENT_REQUIREMENTS[skinId];
    if (!requirement) {
      return NextResponse.json({ error: "Invalid skin ID" }, { status: 400 });
    }

    // Get user's stats for the required game
    let current = 0;

    if (requirement.gameId === 'flappy-donut') {
      const { data: flappyGames } = await supabase
        .from("flappy_games")
        .select("score")
        .eq("wallet_address", walletAddress);

      if (flappyGames) {
        if (requirement.type === 'games_played') {
          current = flappyGames.length;
        } else if (requirement.type === 'high_score') {
          current = Math.max(...flappyGames.map(g => g.score || 0), 0);
        }
      }
    } else if (requirement.gameId === 'glaze-stack') {
      const { data: stackGames } = await supabase
        .from("stack_tower_games")
        .select("score")
        .eq("wallet_address", walletAddress);

      if (stackGames) {
        if (requirement.type === 'games_played') {
          current = stackGames.length;
        } else if (requirement.type === 'high_score') {
          current = Math.max(...stackGames.map(g => g.score || 0), 0);
        }
      }
    } else if (requirement.gameId === 'donut-dash') {
      // Check config table for total plays
      const { data: dashConfig } = await supabase
        .from("donut_dash_config")
        .select("total_plays")
        .eq("wallet_address", walletAddress)
        .single();

      const { data: dashScores } = await supabase
        .from("donut_dash_scores")
        .select("score")
        .eq("wallet_address", walletAddress);

      if (requirement.type === 'games_played') {
        current = dashConfig?.total_plays || dashScores?.length || 0;
      } else if (requirement.type === 'high_score' && dashScores) {
        current = Math.max(...dashScores.map(g => g.score || 0), 0);
      }
    }

    // Check if requirement is met
    if (current < requirement.value) {
      return NextResponse.json({ 
        error: "Requirement not met", 
        current, 
        required: requirement.value 
      }, { status: 403 });
    }

    // Claim the skin
    const { error } = await supabase
      .from("user_skins")
      .insert({
        wallet_address: walletAddress,
        skin_id: skinId,
        claimed_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error claiming skin:", error);
      return NextResponse.json({ error: "Failed to claim skin" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in claim-skin:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}