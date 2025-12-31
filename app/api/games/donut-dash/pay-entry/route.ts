import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Donut Dash Contract: 0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40
// DONUT Token: 0xAE4a37d554C6D6F3E398546d8566B25052e0169C

const BASE_ENTRY_FEE = BigInt("1000000000000000000"); // 1 DONUT
const ENTRY_INCREMENT = BigInt("100000000000000000"); // 0.1 DONUT

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
    }

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    const currentWeek = config?.current_week || 1;

    const { count } = await supabase
      .from("donut_dash_scores")
      .select("*", { count: "exact", head: true })
      .eq("fid", fid)
      .eq("week", currentWeek);

    const playCount = count || 0;
    const entryFee = BASE_ENTRY_FEE + BigInt(playCount) * ENTRY_INCREMENT;

    return NextResponse.json({
      success: true,
      fid: parseInt(fid),
      week: currentWeek,
      playCount,
      entryFee: entryFee.toString(),
      entryFeeFormatted: (Number(entryFee) / 1e18).toFixed(1),
      contractAddress: "0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40",
      tokenAddress: "0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
    });
  } catch (error) {
    console.error("Error getting entry fee:", error);
    return NextResponse.json({ error: "Failed to get entry fee" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, walletAddress, username, displayName, pfpUrl, txHash, entryFee } = body;

    if (!fid || !walletAddress || !txHash || !entryFee) {
      return NextResponse.json(
        { error: "Missing required fields: fid, walletAddress, txHash, entryFee" },
        { status: 400 }
      );
    }

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    const currentWeek = config?.current_week || 1;

    const { data: existingTx } = await supabase
      .from("donut_dash_scores")
      .select("id")
      .eq("tx_hash", txHash)
      .single();

    if (existingTx) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 400 });
    }

    const { data: entry, error } = await supabase
      .from("donut_dash_scores")
      .insert({
        fid,
        wallet_address: walletAddress.toLowerCase(),
        username,
        display_name: displayName,
        pfp_url: pfpUrl,
        score: 0,
        week: currentWeek,
        entry_fee: entryFee,
        tx_hash: txHash,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating entry:", error);
      return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      entryId: entry.id,
      week: currentWeek,
      message: "Entry recorded. Play your game!",
    });
  } catch (error) {
    console.error("Error recording entry:", error);
    return NextResponse.json({ error: "Failed to record entry" }, { status: 500 });
  }
}