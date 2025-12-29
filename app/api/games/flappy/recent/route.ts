import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';

const FLAPPY_POOL_ADDRESS = process.env.NEXT_PUBLIC_FLAPPY_POOL_ADDRESS || "0xA3419c6eFbb7a227fC3e24189d8099591327a14A";

const FLAPPY_POOL_ABI = [
  {
    inputs: [],
    name: "getPrizePool",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET() {
  try {
    // Get most recent game
    const { data: recentGame, error: gameError } = await supabase
      .from('flappy_games')
      .select('username, pfp_url, score')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    let recentPlayer = null;
    if (!gameError && recentGame) {
      recentPlayer = {
        username: recentGame.username,
        score: recentGame.score,
        pfpUrl: recentGame.pfp_url,
      };
    }
    
    // Get prize pool from contract
    let prizePool = "0";
    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });
      
      const prizePoolWei = await publicClient.readContract({
        address: FLAPPY_POOL_ADDRESS as `0x${string}`,
        abi: FLAPPY_POOL_ABI,
        functionName: 'getPrizePool',
      });
      
      prizePool = Number(formatUnits(prizePoolWei, 18)).toFixed(2);
    } catch (e) {
      console.error('Failed to fetch prize pool:', e);
    }
    
    return NextResponse.json({
      recentPlayer,
      prizePool,
    });
  } catch (error) {
    console.error('Failed to fetch recent game data:', error);
    return NextResponse.json({ recentPlayer: null, prizePool: "0" });
  }
}