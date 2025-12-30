import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST - Record a game score announcement
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      playerAddress, 
      username, 
      pfpUrl, 
      gameId, 
      gameName, 
      score, 
      skinId, 
      skinColor 
    } = body;

    if (!playerAddress || !gameId || score === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Insert the game announcement
    const { data, error } = await supabase
      .from("game_announcements")
      .insert({
        player_address: playerAddress.toLowerCase(),
        username: username || null,
        pfp_url: pfpUrl || null,
        game_id: gameId,
        game_name: gameName || gameId,
        score: score,
        skin_id: skinId || "classic",
        skin_color: skinColor || "#FF69B4",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to insert game announcement:", error);
      return NextResponse.json({ error: "Failed to record announcement" }, { status: 500 });
    }

    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error("Game announce error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET - Fetch recent game announcements
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const gameId = searchParams.get("gameId");

    let query = supabase
      .from("game_announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (gameId) {
      query = query.eq("game_id", gameId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch announcements:", error);
      return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
    }

    return NextResponse.json({ announcements: data || [] });
  } catch (error) {
    console.error("Game announcements fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}