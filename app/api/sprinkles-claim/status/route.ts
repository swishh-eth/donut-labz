import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const epoch = searchParams.get("epoch");

  if (!address || !epoch) {
    return NextResponse.json(
      { error: "Missing address or epoch" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("sprinkles_claims")
      .select("*")
      .eq("address", address.toLowerCase())
      .eq("epoch", parseInt(epoch))
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine
      console.error("Error checking claim status:", error);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hasClaimed: !!data,
      claimedAt: data?.claimed_at || null,
    });
  } catch (e) {
    console.error("Error checking claim status:", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}