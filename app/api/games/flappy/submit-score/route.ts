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

// Calculate current week number (starting from Jan 1, 2025)
function getCurrentWeekNumber(): number {
  const startDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playerAddress, username, pfpUrl, score, costPaid } = body;
    
    if (!playerAddress || score === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const address = playerAddress.toLowerCase();
    const cost = costPaid || 1;
    const playDate = getPlayDate();
    const weekNumber = getCurrentWeekNumber();
    
    // Calculate fee split (5% LP, 5% treasury, 90% prize pool)
    const toLpBurn = cost * 0.05;
    const toTreasury = cost * 0.05;
    const toPrizePool = cost * 0.90;
    
    // Insert game record
    const { data: gameData, error: gameError } = await supabase
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
    
    // Update daily attempts - upsert to increment attempts
    const { data: existingAttempt } = await supabase
      .from('flappy_daily_attempts')
      .select('attempts')
      .eq('player_address', address)
      .eq('play_date', playDate)
      .single();
    
    if (existingAttempt) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('flappy_daily_attempts')
        .update({ 
          attempts: existingAttempt.attempts + 1,
          last_attempt_at: new Date().toISOString()
        })
        .eq('player_address', address)
        .eq('play_date', playDate);
      
      if (updateError) {
        console.error('Failed to update attempts:', updateError);
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('flappy_daily_attempts')
        .insert({
          player_address: address,
          play_date: playDate,
          attempts: 1,
          last_attempt_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Failed to insert attempts:', insertError);
      }
    }
    
    console.log('Game saved:', gameData);
    
    return NextResponse.json({
      success: true,
      score,
      gameId: gameData?.id,
      weekNumber,
    });
  } catch (error) {
    console.error('Failed to submit score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}