// app/api/games/flappy/submit-score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Get the current "play date" based on 6pm EST reset (11pm UTC)
function getPlayDate(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  if (utcHour >= 23) {
    const playDate = new Date(now);
    playDate.setUTCDate(playDate.getUTCDate() + 1);
    return playDate.toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0];
}

// Calculate current week number based on Friday 11PM UTC reset
// Week 1 starts Friday Jan 3, 2025 at 11PM UTC
function getCurrentWeekNumber(): number {
  const now = new Date();
  
  // Reference point: Friday Jan 3, 2025 at 11PM UTC (first Friday 11PM of 2025)
  const epoch = new Date('2025-01-03T23:00:00Z');
  
  const diffMs = now.getTime() - epoch.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  
  return diffWeeks + 1;
}

export async function POST(request: NextRequest) {
  try {
    const { playerAddress, username, pfpUrl, score, costPaid } = await request.json();

    if (!playerAddress) {
      return NextResponse.json({ error: 'Missing player address' }, { status: 400 });
    }

    const cost = costPaid || 1;
    const weekNumber = getCurrentWeekNumber();
    const normalizedAddress = playerAddress.toLowerCase();

    console.log('Submitting score for week:', weekNumber);

    // Insert game into flappy_games
    const { error: insertError } = await supabase
      .from('flappy_games')
      .insert({
        player_address: normalizedAddress,
        username: username,
        pfp_url: pfpUrl,
        score: score,
        cost_paid: cost,
        to_prize_pool: cost * 0.9,
        to_treasury: cost * 0.05,
        to_lp_burn: cost * 0.05,
        week_number: weekNumber,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update daily attempts
    const playDate = getPlayDate();
    const { data: attemptData } = await supabase
      .from('flappy_daily_attempts')
      .select('attempts')
      .eq('player_address', normalizedAddress)
      .eq('play_date', playDate)
      .single();

    if (attemptData) {
      await supabase
        .from('flappy_daily_attempts')
        .update({ 
          attempts: attemptData.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('player_address', normalizedAddress)
        .eq('play_date', playDate);
    } else {
      await supabase
        .from('flappy_daily_attempts')
        .insert({
          player_address: normalizedAddress,
          play_date: playDate,
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        });
    }

    return NextResponse.json({ success: true, weekNumber });

  } catch (error) {
    console.error('Submit score error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}