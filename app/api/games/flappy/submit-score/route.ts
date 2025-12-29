import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Get the current "play date" based on 6pm EST reset (11pm UTC)
function getPlayDate(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  let playDate = new Date(now);
  if (utcHour >= 23) {
    playDate.setUTCDate(playDate.getUTCDate() + 1);
  }
  
  return playDate.toISOString().split('T')[0];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playerAddress, username, pfpUrl, score, weekNumber, costPaid } = body;
    
    if (!playerAddress || score === undefined || !weekNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const address = playerAddress.toLowerCase();
    const cost = costPaid || 1;
    
    // Calculate fee split (5% LP, 5% treasury, 90% prize pool)
    const toLpBurn = cost * 0.05;
    const toTreasury = cost * 0.05;
    const toPrizePool = cost * 0.90;
    
    // Insert game record
    const { data, error: gameError } = await supabase
      .from('flappy_games')
      .insert({
        player_address: address,
        username: username || `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`,
        pfp_url: pfpUrl || null,
        score,
        cost_paid: cost,
        to_prize_pool: toPrizePool,
        to_lp_burn: toLpBurn,
        to_treasury: toTreasury,
        week_number: weekNumber,
      })
      .select()
      .single();
    
    if (gameError) {
      console.error('Failed to insert game:', gameError);
      return NextResponse.json({ error: 'Failed to save game', details: gameError.message }, { status: 500 });
    }
    
    console.log('Game saved:', data);
    
    return NextResponse.json({
      success: true,
      score,
      gameId: data?.id,
    });
  } catch (error) {
    console.error('Failed to submit score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}