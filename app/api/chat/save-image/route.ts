import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { transactionHash, imageUrl } = await request.json();

    if (!transactionHash || !imageUrl) {
      return NextResponse.json(
        { error: "Missing transactionHash or imageUrl" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }

    // Always store in pending table first (as backup)
    await supabase
      .from("chat_pending_images")
      .upsert({
        transaction_hash: transactionHash,
        image_url: imageUrl,
        created_at: new Date().toISOString(),
        processed: false,
      }, { onConflict: "transaction_hash" });

    // Also try to update existing message if it exists
    const { error: updateError } = await supabase
      .from("chat_messages")
      .update({ image_url: imageUrl })
      .eq("transaction_hash", transactionHash);

    // If update succeeded (message existed), mark pending as processed
    if (!updateError) {
      await supabase
        .from("chat_pending_images")
        .update({ processed: true })
        .eq("transaction_hash", transactionHash);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}