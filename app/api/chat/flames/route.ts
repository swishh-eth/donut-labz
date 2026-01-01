import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Fetch flame counts for game announcements
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");
    const userAddress = searchParams.get("userAddress")?.toLowerCase();

    if (!ids) {
      return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
    }

    const idList = ids.split(",").map(id => parseInt(id)).filter(id => !isNaN(id));

    if (idList.length === 0) {
      return NextResponse.json({ flames: {}, userFlamed: [] });
    }

    // Get flame counts per announcement
    const { data: flameCounts, error: countError } = await supabase
      .from("game_announcement_flames")
      .select("game_announcement_id")
      .in("game_announcement_id", idList);

    if (countError) {
      console.error("Failed to fetch flame counts:", countError);
      return NextResponse.json({ error: "Failed to fetch flames" }, { status: 500 });
    }

    // Count flames per announcement
    const flames: Record<number, number> = {};
    for (const flame of flameCounts || []) {
      flames[flame.game_announcement_id] = (flames[flame.game_announcement_id] || 0) + 1;
    }

    // Get which ones the user has flamed
    let userFlamed: number[] = [];
    if (userAddress) {
      const { data: userFlames, error: userError } = await supabase
        .from("game_announcement_flames")
        .select("game_announcement_id")
        .eq("user_address", userAddress)
        .in("game_announcement_id", idList);

      if (!userError && userFlames) {
        userFlamed = userFlames.map(f => f.game_announcement_id);
      }
    }

    return NextResponse.json({ flames, userFlamed });
  } catch (error) {
    console.error("Flames fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Add or remove a flame
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameAnnouncementId, userAddress, action } = body;

    if (!gameAnnouncementId || !userAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalizedAddress = userAddress.toLowerCase();

    if (action === "remove") {
      // Remove flame
      const { error } = await supabase
        .from("game_announcement_flames")
        .delete()
        .eq("game_announcement_id", gameAnnouncementId)
        .eq("user_address", normalizedAddress);

      if (error) {
        console.error("Failed to remove flame:", error);
        return NextResponse.json({ error: "Failed to remove flame" }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "removed" });
    } else {
      // Add flame (check if already exists first)
      const { data: existing } = await supabase
        .from("game_announcement_flames")
        .select("id")
        .eq("game_announcement_id", gameAnnouncementId)
        .eq("user_address", normalizedAddress)
        .single();

      if (existing) {
        return NextResponse.json({ success: true, action: "already_flamed" });
      }

      const { error } = await supabase
        .from("game_announcement_flames")
        .insert({
          game_announcement_id: gameAnnouncementId,
          user_address: normalizedAddress,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error("Failed to add flame:", error);
        return NextResponse.json({ error: "Failed to add flame" }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "added" });
    }
  } catch (error) {
    console.error("Flame error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}