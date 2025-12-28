// app/api/miners/update-amount/route.ts
// Updates the amount for a mining event when we calculate the correct value client-side

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { address, mineType, amount } = await request.json();

    if (!address || !mineType || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Only update if the current amount is 0 or empty
    const { data: existing, error: fetchError } = await supabase
      .from("mining_events")
      .select("amount")
      .eq("address", address.toLowerCase())
      .eq("mine_type", mineType)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      console.error("Error fetching mining event:", fetchError);
      return NextResponse.json(
        { success: false, error: "Record not found" },
        { status: 404 }
      );
    }

    // Only update if current amount is 0 or empty
    if (existing.amount && existing.amount !== "0") {
      return NextResponse.json({
        success: true,
        message: "Amount already set",
        updated: false,
      });
    }

    // Update the record
    const { error: updateError } = await supabase
      .from("mining_events")
      .update({ amount })
      .eq("address", address.toLowerCase())
      .eq("mine_type", mineType)
      .eq("amount", existing.amount); // Only update the specific record with 0/empty

    if (updateError) {
      console.error("Error updating mining event:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to update" },
        { status: 500 }
      );
    }

    console.log("Updated mining amount:", { address, mineType, amount });

    return NextResponse.json({
      success: true,
      message: "Amount updated",
      updated: true,
    });
  } catch (error) {
    console.error("Error in update-amount API:", error);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}