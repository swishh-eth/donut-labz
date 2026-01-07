// app/api/miners/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatEther, formatUnits } from "viem";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Profile cache helper
async function getProfile(address: string): Promise<{
  username: string | null;
  pfpUrl: string | null;
  fid: number | null;
} | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://sprinkles.wtf'}/api/profiles?addresses=${encodeURIComponent(address)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const profile = data.profiles?.[address.toLowerCase()];
    if (profile) {
      return {
        username: profile.username,
        pfpUrl: profile.pfpUrl,
        fid: profile.fid || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "donut"; // "donut" or "sprinkles"
    const limit = Math.min(parseInt(searchParams.get("limit") || "3"), 10);

    // Query the mining_events table for recent mines
    const { data: events, error } = await supabase
      .from("mining_events")
      .select("*")
      .eq("mine_type", type)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching recent miners:", error);
      return NextResponse.json({ miners: [] });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ miners: [] });
    }

    // Fetch profiles for all addresses
    const miners = await Promise.all(
      events.map(async (event) => {
        const profile = await getProfile(event.address);
        
        // Format amount based on type
        let formattedAmount: string;
        const amountStr = event.amount || "0";
        
        if (type === "donut") {
          // ETH amount - format with 4-6 decimals
          const ethAmount = parseFloat(formatEther(BigInt(amountStr)));
          formattedAmount = ethAmount < 0.001 
            ? ethAmount.toFixed(6) 
            : ethAmount < 1 
              ? ethAmount.toFixed(4) 
              : ethAmount.toFixed(2);
        } else {
          // SPRINKLES/DONUT token amount
          // Check if amount is stored as wei (large number, >10 digits) or whole tokens (small number)
          if (amountStr.length > 10) {
            // Old format: stored as wei, need to convert
            const donutAmount = parseFloat(formatUnits(BigInt(amountStr), 18));
            formattedAmount = Math.floor(donutAmount).toLocaleString();
          } else {
            // New format: already stored as whole tokens
            formattedAmount = parseInt(amountStr, 10).toLocaleString();
          }
        }

        return {
          address: event.address,
          username: profile?.username || null,
          pfpUrl: profile?.pfpUrl || null,
          fid: profile?.fid || null,
          amount: formattedAmount,
          message: event.message || "",
          imageUrl: event.image_url || null,
          timestamp: new Date(event.created_at).getTime(),
        };
      })
    );

    return NextResponse.json({ miners });
  } catch (error) {
    console.error("Error in recent miners API:", error);
    return NextResponse.json({ miners: [] });
  }
}