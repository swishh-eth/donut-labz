import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Get the current "play date" based on 6pm EST reset (11pm UTC)
function getPlayDate(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  if (utcHour >= 23) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  return now.toISOString().split('T')[0];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playerAddress, username, pfpUrl, score, weekNumber } = body;
    
    if (!playerAddress || score === undefined || !weekNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const playDate = getPlayDate();
    const address = playerAddress.toLowerCase();
    
    // Get current attempt count
    const { data: attemptData } = await supabase
      .from('flappy_daily_attempts')
      .select('attempts')
      .eq('player_address', address)
      .eq('play_date', playDate)
      .single();
    
    const currentAttempts = attemptData?.attempts || 0;
    const costPaid = currentAttempts + 1; // Cost was attempts + 1 when they started
    
    // Calculate fee split (5% LP, 5% treasury, 90% prize pool)
    const toLpBurn = costPaid * 0.05;
    const toTreasury = costPaid * 0.05;
    const toPrizePool = costPaid * 0.90;
    
    // Insert game record
    const { error: gameError } = await supabase
      .from('flappy_games')
      .insert({
        player_address: address,
        username: username || `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`,
        pfp_url: pfpUrl || null,
        score,
        cost_paid: costPaid,
        to_prize_pool: toPrizePool,
        to_lp_burn: toLpBurn,
        to_treasury: toTreasury,
        week_number: weekNumber,
      });
    
    if (gameError) {
      console.error('Failed to insert game:', gameError);
      throw gameError;
    }
    
    // Update attempt count
    const { error: attemptError } = await supabase
      .from('flappy_daily_attempts')
      .upsert({
        player_address: address,
        play_date: playDate,
        attempts: currentAttempts + 1,
        last_attempt_at: new Date().toISOString(),
      }, {
        onConflict: 'player_address,play_date',
      });
    
    if (attemptError) {
      console.error('Failed to update attempts:', attemptError);
    }
    
    return NextResponse.json({
      success: true,
      score,
      attempts: currentAttempts + 1,
      nextCost: currentAttempts + 2,
    });
  } catch (error) {
    console.error('Failed to submit score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}