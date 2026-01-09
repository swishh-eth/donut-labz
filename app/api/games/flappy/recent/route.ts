import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const FLAPPY_POOL_ADDRESS = "0xA3419c6eFbb7a227fC3e24189d8099591327a14A" as const;

const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Get Friday 6PM EST as the start of the week
function getWeekStart(): Date {
  const now = new Date();
  const estOffset = -5 * 60; // EST offset in minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const estTime = new Date(utc + estOffset * 60000);
  
  const dayOfWeek = estTime.getDay();
  const hourOfDay = estTime.getHours();
  
  let daysSinceFriday = (dayOfWeek + 2) % 7;
  
  if (dayOfWeek === 5 && hourOfDay < 18) {
    daysSinceFriday = 7;
  }
  
  const weekStart = new Date(estTime);
  weekStart.setDate(estTime.getDate() - daysSinceFriday);
  weekStart.setHours(18, 0, 0, 0);
  
  return weekStart;
}

export async function GET(request: NextRequest) {
  try {
    const weekStart = getWeekStart();
    const weekStartISO = weekStart.toISOString();

    // Get most recent player - using flappy_games table
    const { data: recentScore, error: recentError } = await supabase
      .from("flappy_games")
      .select("username, score, pfp_url")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get games played this week
    const { count: gamesThisWeek, error: countError } = await supabase
      .from("flappy_games")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStartISO);

    // Get prize pool by reading DONUT balance of the pool contract
    let prizePool = "0";
    try {
      const balance = await publicClient.readContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [FLAPPY_POOL_ADDRESS],
      });
      prizePool = Number(formatUnits(balance, 18)).toFixed(2);
    } catch (e) {
      console.error("[Flappy Recent] Failed to read contract balance:", e);
    }

    return NextResponse.json({
      recentPlayer: recentScore ? {
        username: recentScore.username,
        score: recentScore.score,
        pfpUrl: recentScore.pfp_url,
      } : null,
      gamesThisWeek: gamesThisWeek || 0,
      prizePool,
    });
  } catch (error: any) {
    console.error("[Flappy Recent] Error:", error);
    return NextResponse.json(
      { error: error.message, recentPlayer: null, gamesThisWeek: 0, prizePool: "0" },
      { status: 500 }
    );
  }
}