// app/api/games/donut-dash/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatUnits } from "viem";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Donut Dash contract address for prize pool
const DONUT_DASH_CONTRACT = "0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40";
const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";

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
    // Get the most recent score entry (ordered by updated_at, not created_at or score)
    const { data: recentScores, error } = await supabase
      .from("donut_dash_scores")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error fetching recent Donut Dash score:", error);
      return NextResponse.json({ recentPlayer: null, prizePool: "0" });
    }

    let recentPlayer = null;
    
    if (recentScores && recentScores.length > 0) {
      const recent = recentScores[0];
      const profile = await getProfile(recent.wallet_address);
      
      recentPlayer = {
        username: profile?.username || recent.username || `${recent.wallet_address.slice(0, 6)}...${recent.wallet_address.slice(-4)}`,
        score: recent.score,
        pfpUrl: profile?.pfpUrl || recent.pfp_url || null,
        address: recent.wallet_address,
      };
    }

    // Fetch prize pool from contract
    let prizePool = "0";
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
      
      // Get DONUT balance of the contract
      const balanceResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [
            {
              to: DONUT_TOKEN,
              data: `0x70a08231000000000000000000000000${DONUT_DASH_CONTRACT.slice(2)}`,
            },
            "latest",
          ],
          id: 1,
        }),
      });
      
      const balanceData = await balanceResponse.json();
      if (balanceData.result && balanceData.result !== "0x") {
        const balanceWei = BigInt(balanceData.result);
        const balanceFormatted = parseFloat(formatUnits(balanceWei, 18));
        prizePool = balanceFormatted.toFixed(2);
      }
    } catch (prizeError) {
      console.error("Error fetching prize pool:", prizeError);
    }

    return NextResponse.json({
      recentPlayer,
      prizePool,
    });
  } catch (error) {
    console.error("Error in Donut Dash recent API:", error);
    return NextResponse.json({ recentPlayer: null, prizePool: "0" });
  }
}