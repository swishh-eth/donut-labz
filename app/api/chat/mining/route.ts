import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, type, amount, txHash } = body;

    if (!address || !type || !txHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const validTypes = ["mine_donut", "mine_sprinkles"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid type" },
        { status: 400 }
      );
    }

    // Check if we already recorded this transaction
    const { data: existing } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("transaction_hash", txHash.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json({ success: true, message: "Already recorded" });
    }

    // Create the message text
    const tokenName = type === "mine_donut" ? "DONUT" : "SPRINKLES";
    const formattedAmount = amount ? parseFloat(amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
    const message = formattedAmount 
      ? `mined ${formattedAmount} ${tokenName}!`
      : `is mining ${tokenName}!`;

    // Insert system message
    const { error } = await supabase
      .from("chat_messages")
      .insert({
        sender: address.toLowerCase(),
        message: message,
        timestamp: Math.floor(Date.now() / 1000),
        transaction_hash: txHash.toLowerCase(),
        block_number: 0, // System messages don't have a real block number
        is_system_message: true,
        system_type: type,
      });

    if (error) {
      console.error("Failed to insert mining message:", error);
      return NextResponse.json(
        { error: "Failed to record mining activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error recording mining activity:", error);
    return NextResponse.json(
      { error: "Failed to record mining activity" },
      { status: 500 }
    );
  }
}