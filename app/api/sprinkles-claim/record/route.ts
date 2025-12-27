import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { address, epoch } = await request.json();

    if (!address || !epoch) {
      return NextResponse.json(
        { error: "Missing address or epoch" },
        { status: 400 }
      );
    }

    // Check if already claimed
    const { data: existing } = await supabase
      .from("sprinkles_claims")
      .select("*")
      .eq("address", address.toLowerCase())
      .eq("epoch", epoch)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Already claimed for this epoch" },
        { status: 400 }
      );
    }

    // Record the claim
    const { error } = await supabase
      .from("sprinkles_claims")
      .insert({
        address: address.toLowerCase(),
        epoch: epoch,
        claimed_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error recording claim:", error);
      return NextResponse.json(
        { error: "Failed to record claim" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Error recording claim:", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}