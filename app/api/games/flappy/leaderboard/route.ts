import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Calculate current week number (starting from a fixed date)
function getCurrentWeekNumber(): number {
  // Start from Jan 1, 2025
  const startDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerAddress = searchParams.get('address')?.toLowerCase();
  
  try {
    const weekNumber = getCurrentWeekNumber();
    
    // Get all scores for current week
    const { data: allScores, error: scoresError } = await supabase
      .from('flappy_games')
      .select('player_address, username, pfp_url, score')
      .eq('week_number', weekNumber)
      .order('score', { ascending: false });
    
    if (scoresError) {
      console.error('Leaderboard query error:', scoresError);
      return NextResponse.json({ 
        leaderboard: [], 
        playerRank: null, 
        weekNumber,
        error: scoresError.message 
      });
    }
    
    if (!allScores || allScores.length === 0) {
      return NextResponse.json({
        leaderboard: [],
        playerRank: null,
        weekNumber,
        totalPlayers: 0,
      });
    }
    
    // Get best score per player (dedup)
    const playerBestScores = new Map<string, {
      address: string;
      username: string;
      pfpUrl: string | null;
      score: number;
    }>();
    
    for (const row of allScores) {
      const addr = row.player_address.toLowerCase();
      if (!playerBestScores.has(addr) || row.score > playerBestScores.get(addr)!.score) {
        playerBestScores.set(addr, {
          address: row.player_address,
          username: row.username,
          pfpUrl: row.pfp_url,
          score: row.score,
        });
      }
    }
    
    // Sort by score and take top 10
    const sortedScores = Array.from(playerBestScores.values())
      .sort((a, b) => b.score - a.score);
    
    const leaderboard = sortedScores.slice(0, 10).map((entry, i) => ({
      rank: i + 1,
      username: entry.username,
      pfpUrl: entry.pfpUrl,
      score: entry.score,
    }));
    
    // Find player's rank if provided
    let playerRank: number | null = null;
    if (playerAddress) {
      const idx = sortedScores.findIndex(s => s.address.toLowerCase() === playerAddress);
      if (idx !== -1) {
        playerRank = idx + 1;
      }
    }
    
    return NextResponse.json({
      leaderboard,
      playerRank,
      weekNumber,
      totalPlayers: sortedScores.length,
    });
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    return NextResponse.json({ leaderboard: [], playerRank: null, error: String(error) }, { status: 500 });
  }
}