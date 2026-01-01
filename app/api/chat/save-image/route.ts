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

    // Update the message with the image URL
    // The message might not exist yet since blockchain confirmation can be faster than sync
    // So we'll try a few times with a delay, or insert a pending record

    // First try to update existing message
    const { data: existingMessage, error: selectError } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("transaction_hash", transactionHash)
      .single();

    if (existingMessage) {
      // Update existing message
      const { error: updateError } = await supabase
        .from("chat_messages")
        .update({ image_url: imageUrl })
        .eq("transaction_hash", transactionHash);

      if (updateError) {
        console.error("Error updating message with image:", updateError);
        return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
      }
    } else {
      // Message doesn't exist yet, store in pending table
      const { error: pendingError } = await supabase
        .from("chat_pending_images")
        .upsert({
          transaction_hash: transactionHash,
          image_url: imageUrl,
          created_at: new Date().toISOString(),
        });

      if (pendingError) {
        console.error("Error saving pending image:", pendingError);
        // Don't fail - the sync process will pick it up
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}