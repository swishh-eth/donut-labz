import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PREMIUM_PRICE = 1000;

export async function GET() {
  try {
    const { count, error } = await supabase
      .from("premium_users")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Error counting premium users:", error);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    const premiumCount = count || 0;
    const totalBurned = premiumCount * PREMIUM_PRICE;

    return NextResponse.json({
      totalBurned,
      premiumUsers: premiumCount,
    });
  } catch (error) {
    console.error("Burn stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}