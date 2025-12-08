// app/api/sprinkles-claim/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: "Address required" },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Reset user's points to 0
    const { error } = await supabase
      .from("chat_points")
      .update({ 
        total_points: 0,
        last_reset_at: new Date().toISOString(),
      })
      .eq("address", normalizedAddress);

    if (error) {
      console.error("Error resetting points:", error);
      return NextResponse.json(
        { error: "Failed to reset points" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Points reset successfully",
    });
  } catch (error: any) {
    console.error("Error in reset endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset points" },
      { status: 500 }
    );
  }
}