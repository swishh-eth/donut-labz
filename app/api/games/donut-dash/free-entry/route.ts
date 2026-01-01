import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
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

    const currentWeek = getCurrentWeek();

    // Create game entry with wallet_address (same as paid version)
    const { data: entry, error: entryError } = await supabase
      .from("donut_dash_scores")
      .insert({
        fid,
        wallet_address: walletAddress.toLowerCase(),
        username,
        display_name: displayName,
        pfp_url: pfpUrl,
        tx_hash: txHash,
        entry_fee: "0",
        week: currentWeek,
        score: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (entryError) {
      console.error("Error inserting entry:", entryError);
      return NextResponse.json(
        { success: false, error: "Failed to record entry" },
        { status: 500 }
      );
    }

    // Get games played count for this week
    const { count: gamesThisWeek } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("fid", fid)
      .eq("week", currentWeek);

    return NextResponse.json({
      success: true,
      entryId: entry.id,
      week: currentWeek,
      gamesThisWeek: gamesThisWeek || 1,
    });
  } catch (error: any) {
    console.error("Free entry error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get("fid");

  if (!fid) {
    return NextResponse.json(
      { success: false, error: "Missing fid" },
      { status: 400 }
    );
  }

  const currentWeek = getCurrentWeek();

  // Get games played count for this week
  const { count: gamesThisWeek } = await supabase
    .from("donut_dash_scores")
    .select("*", { count: "exact", head: true })
    .eq("fid", parseInt(fid))
    .eq("week", currentWeek);

  return NextResponse.json({
    success: true,
    week: currentWeek,
    gamesThisWeek: gamesThisWeek || 0,
    isFreePlay: true,
  });
}