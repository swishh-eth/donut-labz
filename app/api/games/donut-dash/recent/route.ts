// app/api/games/donut-dash/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://donutlabs.vercel.app'}/api/profiles?addresses=${encodeURIComponent(address)}`,
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
    // Get the most recent score entry with score > 0 (filter out unfinished games)
    const { data: recentScores, error } = await supabase
      .from("donut_dash_scores")
      .select("*")
      .gt("score", 0)  // Only show completed games with actual scores
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error fetching recent Donut Dash score:", error);
      return NextResponse.json({ recentPlayer: null, prizePool: "0" });
    }

    let recentPlayer = null;
    
    if (recentScores && recentScores.length > 0) {
      const recent = recentScores[0];
      const profile = recent.wallet_address ? await getProfile(recent.wallet_address) : null;
      
      recentPlayer = {
        username: profile?.username || recent.username || (recent.wallet_address ? `${recent.wallet_address.slice(0, 6)}...${recent.wallet_address.slice(-4)}` : 'Unknown'),
        score: recent.score,
        pfpUrl: profile?.pfpUrl || recent.pfp_url || null,
        address: recent.wallet_address,
      };
    }

    // Prize pool is now USDC from bot wallet, not from contract
    // The games page fetches prize info from prize-distribute endpoint
    // This endpoint just returns recent player info
    return NextResponse.json({
      recentPlayer,
    });
  } catch (error) {
    console.error("Error in Donut Dash recent API:", error);
    return NextResponse.json({ recentPlayer: null });
  }
}