// app/api/games/skin-market/purchase-premium/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, txHash, fid, username } = body;

    if (!address || !txHash) {
      return NextResponse.json({ error: "Address and txHash required" }, { status: 400 });
    }

    const walletAddress = address.toLowerCase();

    // Check if already premium
    const { data: existing } = await supabase
      .from("premium_users")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, message: "Already premium" });
    }

    // Record premium purchase
    const { error } = await supabase
      .from("premium_users")
      .insert({
        wallet_address: walletAddress,
        tx_hash: txHash,
        fid: fid || null,
        username: username || null,
        purchased_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error recording premium:", error);
      return NextResponse.json({ error: "Failed to record purchase" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in purchase-premium:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}