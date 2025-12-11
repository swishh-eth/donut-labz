import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hashesParam = searchParams.get("hashes");

  if (!hashesParam) {
    return NextResponse.json({ tips: {} });
  }

  const hashes = hashesParam.split(",").map(h => h.trim().toLowerCase());

  try {
    // Query tip counts grouped by message hash
    const { data, error } = await supabase
      .from("chat_tips")
      .select("message_hash")
      .in("message_hash", hashes);

    if (error) {
      console.error("Failed to fetch tip counts:", error);
      return NextResponse.json({ tips: {} });
    }

    // Count tips per message hash
    const tips: Record<string, number> = {};
    for (const row of data || []) {
      const hash = row.message_hash;
      tips[hash] = (tips[hash] || 0) + 1;
    }

    return NextResponse.json({ tips });
  } catch (error) {
    console.error("Failed to fetch tip counts:", error);
    return NextResponse.json({ tips: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageHash, fromAddress, toAddress, amount, txHash } = body;

    if (!messageHash || !fromAddress || !toAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Insert a new tip record (each tip is a separate row for full history)
    const { error } = await supabase
      .from("chat_tips")
      .insert({
        message_hash: messageHash.toLowerCase(),
        from_address: fromAddress.toLowerCase(),
        to_address: toAddress.toLowerCase(),
        amount: amount || "1",
        tx_hash: txHash || null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Failed to record tip:", error);
      return NextResponse.json({ error: "Failed to record tip" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to record tip:", error);
    return NextResponse.json({ error: "Failed to record tip" }, { status: 500 });
  }
}