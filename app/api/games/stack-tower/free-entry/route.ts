// Place in: app/api/games/stack-tower/free-entry/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
// Matches the prize distribution week calculation
function getCurrentWeekNumber(): number {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  const weeksSinceEpoch = Math.floor((utcNow.getTime() - epoch.getTime()) / msPerWeek);
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

    const currentWeek = getCurrentWeekNumber();
    const entryId = uuidv4();

    // Check if this txHash was already used
    const { data: existingEntry } = await supabase
      .from("stack_tower_games")
      .select("id")
      .eq("tx_hash", txHash)
      .single();

    if (existingEntry) {
      return NextResponse.json(
        { success: false, error: "Transaction already used" },
        { status: 400 }
      );
    }

    // Create the game entry
    const { error: insertError } = await supabase
      .from("stack_tower_games")
      .insert({
        id: entryId,
        fid,
        wallet_address: walletAddress.toLowerCase(),
        username: username || displayName || null,
        pfp_url: pfpUrl || null,
        week_number: currentWeek,
        score: 0,
        tx_hash: txHash,
        entry_cost: 0, // Free to play
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Failed to create entry:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to create entry" },
        { status: 500 }
      );
    }

    // Get games played this week for this user
    const { count } = await supabase
      .from("stack_tower_games")
      .select("*", { count: "exact", head: true })
      .eq("fid", fid)
      .eq("week_number", currentWeek);

    return NextResponse.json({
      success: true,
      entryId,
      weekNumber: currentWeek,
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