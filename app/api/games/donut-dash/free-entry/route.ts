// Place in: app/api/games/donut-dash/free-entry/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, walletAddress, username, displayName, pfpUrl, txHash } = body;

    if (!fid || !walletAddress || !txHash) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const currentWeek = getCurrentWeek();

    // Check if this txHash was already used (prevent replay)
    const { data: existingTx } = await supabase
      .from("donut_dash_scores")
      .select("id")
      .eq("tx_hash", txHash)
      .single();

    if (existingTx) {
      return NextResponse.json(
        { success: false, error: "Transaction already used" },
        { status: 400 }
      );
    }

    // Always create a NEW entry for each game
    const entryId = uuidv4();

    const { error: insertError } = await supabase
      .from("donut_dash_scores")
      .insert({
        id: entryId,
        fid,
        wallet_address: walletAddress.toLowerCase(),
        username: username || displayName || null,
        display_name: displayName || username || null,
        pfp_url: pfpUrl || null,
        week: currentWeek,
        score: 0,
        entry_fee: 0,
        tx_hash: txHash,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Failed to create entry:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to create entry" },
        { status: 500 }
      );
    }

    console.log("New entry created:", entryId, "for fid:", fid, "week:", currentWeek);

    // Get games played this week for this user
    const { count } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("fid", fid)
      .eq("week", currentWeek);

    return NextResponse.json({
      success: true,
      entryId,
      week: currentWeek,
      gamesPlayedThisWeek: count || 1,
    });
  } catch (error) {
    console.error("Free entry error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}