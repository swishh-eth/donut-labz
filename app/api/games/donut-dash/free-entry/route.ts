import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  console.log("Free entry called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { fid, walletAddress, username, displayName, pfpUrl, txHash } = body;

    console.log("Free entry body:", { fid, walletAddress, txHash });

    if (!fid || !walletAddress || !txHash) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const currentWeek = getCurrentWeek();

    // Check if player already has a row for this week
    const { data: existing } = await supabase
      .from("donut_dash_scores")
      .select("id, score")
      .eq("fid", fid)
      .eq("week", currentWeek)
      .limit(1);

    if (existing && existing.length > 0) {
      // Player already has a row this week - return existing entry
      console.log("Existing entry found:", existing[0].id);
      return NextResponse.json({
        success: true,
        entryId: existing[0].id,
        week: currentWeek,
        currentBestScore: existing[0].score,
        isExisting: true,
      });
    }

    // Create new entry for this week
    const { data: entries, error: entryError } = await supabase
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
      .select();

    console.log("Insert result:", { entries, entryError });

    if (entryError) {
      console.error("Error inserting entry:", entryError);
      return NextResponse.json(
        { success: false, error: "Failed to record entry: " + entryError.message },
        { status: 500 }
      );
    }

    const entry = entries?.[0];
    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Entry not created" },
        { status: 500 }
      );
    }

    console.log("New entry created with id:", entry.id);

    return NextResponse.json({
      success: true,
      entryId: entry.id,
      week: currentWeek,
      currentBestScore: 0,
      isExisting: false,
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
  console.log("Free entry GET called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(request.url);
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { success: false, error: "Missing fid" },
        { status: 400 }
      );
    }

    const currentWeek = getCurrentWeek();

    // Get player's current best score for this week
    const { data: existing } = await supabase
      .from("donut_dash_scores")
      .select("id, score")
      .eq("fid", parseInt(fid))
      .eq("week", currentWeek)
      .limit(1);

    return NextResponse.json({
      success: true,
      week: currentWeek,
      currentBestScore: existing?.[0]?.score || 0,
      hasEntry: existing && existing.length > 0,
      isFreePlay: true,
    });
  } catch (error: any) {
    console.error("Free entry GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}