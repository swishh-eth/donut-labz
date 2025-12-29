import { NextResponse } from 'next/server';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { supabase } from '@/lib/supabase-leaderboard';

const FLAPPY_POOL_ADDRESS = "0xA3419c6eFbb7a227fC3e24189d8099591327a14A" as const;

const FLAPPY_POOL_ABI = [
  {
    inputs: [],
    name: "getPrizePool",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

export async function GET() {
  try {
    // Get most recent game
    const { data: recentGame, error } = await supabase
      .from('flappy_games')
      .select('username, score, pfp_url')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch recent game:', error);
    }
    
    // Get prize pool from contract
    let prizePool = "0";
    try {
      const poolData = await publicClient.readContract({
        address: FLAPPY_POOL_ADDRESS,
        abi: FLAPPY_POOL_ABI,
        functionName: 'getPrizePool',
      });
      prizePool = Number(formatUnits(poolData, 18)).toFixed(2);
    } catch (e) {
      console.error('Failed to fetch prize pool:', e);
    }
    
    return NextResponse.json({
      recentPlayer: recentGame ? {
        username: recentGame.username,
        score: recentGame.score,
        pfpUrl: recentGame.pfp_url,
      } : null,
      prizePool,
    });
  } catch (error) {
    console.error('Failed to fetch recent data:', error);
    return NextResponse.json({ recentPlayer: null, prizePool: "0" });
  }
}