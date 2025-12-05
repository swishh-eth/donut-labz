import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-leaderboard";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { senderAddress } = body;

    if (!senderAddress) {
      return NextResponse.json(
        { error: "Missing sender address" },
        { status: 400 }
      );
    }

    const address = senderAddress.toLowerCase();

    // Fetch neynar score for the sender
    let neynarScore = 0;
    try {
      const neynarRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
        {
          headers: {
            accept: "application/json",
            api_key: process.env.NEYNAR_API_KEY || "",
          },
        }
      );

      if (neynarRes.ok) {
        const neynarData = await neynarRes.json();
        const users = neynarData[address];
        if (users && users.length > 0) {
          neynarScore = users[0].experimental?.neynar_user_score || 0;
        }
      }
    } catch (e) {
      console.error("Failed to fetch neynar score:", e);
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from("chat_points")
      .select("*")
      .eq("address", address)
      .single();

    if (existing) {
      // Update existing user
      const { error } = await supabase
        .from("chat_points")
        .update({
          neynar_score: neynarScore,
          total_messages: existing.total_messages + 1,
          total_points: existing.total_points + neynarScore,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("address", address);

      if (error) throw error;
    } else {
      // Insert new user
      const { error } = await supabase.from("chat_points").insert({
        address,
        neynar_score: neynarScore,
        total_messages: 1,
        total_points: neynarScore,
        last_message_at: new Date().toISOString(),
      });

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: neynarScore,
    });
  } catch (error) {
    console.error("Error recording points:", error);
    return NextResponse.json(
      { error: "Failed to record points" },
      { status: 500 }
    );
  }
}