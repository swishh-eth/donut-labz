import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - fetch tip counts and amounts for messages
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hashesParam = searchParams.get("hashes");

  if (!hashesParam) {
    return NextResponse.json({ tips: {}, tipAmounts: {} });
  }

  const hashes = hashesParam.split(",").map(h => h.trim().toLowerCase());

  try {
    // Query tips with amount and token
    const { data, error } = await supabase
      .from("chat_tips")
      .select("message_hash, amount, token")
      .in("message_hash", hashes);

    if (error) {
      console.error("Failed to fetch tip counts:", error);
      return NextResponse.json({ tips: {}, tipAmounts: {} });
    }

    // Count tips and aggregate amounts per message hash
    const tips: Record<string, number> = {};
    const tipAmounts: Record<string, { sprinkles: number; donut: number }> = {};
    
    for (const row of data || []) {
      const hash = row.message_hash;
      const amount = parseFloat(row.amount) || 0;
      const token = row.token || "sprinkles"; // Default to sprinkles for old tips
      
      // Initialize if not exists
      if (!tips[hash]) {
        tips[hash] = 0;
      }
      if (!tipAmounts[hash]) {
        tipAmounts[hash] = { sprinkles: 0, donut: 0 };
      }
      
      // Increment count
      tips[hash]++;
      
      // Add to token-specific amount
      if (token === "donut") {
        tipAmounts[hash].donut += amount;
      } else {
        tipAmounts[hash].sprinkles += amount;
      }
    }

    return NextResponse.json({ tips, tipAmounts });
  } catch (error) {
    console.error("Failed to fetch tip counts:", error);
    return NextResponse.json({ tips: {}, tipAmounts: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageHash, fromAddress, toAddress, amount, txHash, token } = body;

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
        token: token || "sprinkles",
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