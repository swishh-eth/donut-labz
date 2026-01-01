// app/api/games/skin-market/equip-skin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, skinId } = body;

    if (!address || !skinId) {
      return NextResponse.json({ error: "Address and skinId required" }, { status: 400 });
    }

    const walletAddress = address.toLowerCase();

    // Verify user owns the skin
    const { data: ownedSkin } = await supabase
      .from("user_skins")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("skin_id", skinId)
      .single();

    if (!ownedSkin) {
      return NextResponse.json({ error: "You don't own this skin" }, { status: 403 });
    }

    // Upsert equipped skin (one per user)
    const { error } = await supabase
      .from("user_equipped_skin")
      .upsert({
        wallet_address: walletAddress,
        skin_id: skinId,
        equipped_at: new Date().toISOString(),
      }, {
        onConflict: 'wallet_address',
      });

    if (error) {
      console.error("Error equipping skin:", error);
      return NextResponse.json({ error: "Failed to equip skin" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in equip-skin:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}