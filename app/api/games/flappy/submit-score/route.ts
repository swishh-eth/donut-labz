// app/api/games/flappy/submit-score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { playerAddress, username, pfpUrl, score, costPaid } = await request.json();

    if (!playerAddress) {
      return NextResponse.json({ error: 'Missing player address' }, { status: 400 });
    }

    // Insert game into flappy_games
    // cost_paid is split: 90% prize pool, 5% treasury, 5% LP burn rewards
    const cost = costPaid || 1;
    const toPrizePool = cost * 0.9;
    const toTreasury = cost * 0.05;
    const toLpBurn = cost * 0.05;
    
    // Calculate week number (same as leaderboard route - weeks since Jan 1, 2025)
    const startDate = new Date('2025-01-01T00:00:00Z');
    const now = new Date();
    const diffMs = now.getTime() - startDate.getTime();
    const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    
    const { error: insertError } = await supabase
      .from('flappy_games')
      .insert({
        player_address: playerAddress.toLowerCase(),
        username: username,
        pfp_url: pfpUrl,
        score: score,
        cost_paid: cost,
        to_prize_pool: toPrizePool,
        to_treasury: toTreasury,
        to_lp_burn: toLpBurn,
        week_number: weekNumber,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Get the current "play date" based on 6pm EST reset (11pm UTC)
    function getPlayDate(): string {
      const now = new Date();
      const utcHour = now.getUTCHours();
      
      // If before 23:00 UTC (6pm EST), use today's date
      // If after 23:00 UTC, use tomorrow as the "play day"
      let playDate = new Date(now);
      if (utcHour >= 23) {
        playDate.setUTCDate(playDate.getUTCDate() + 1);
      }
      
      return playDate.toISOString().split('T')[0];
    }

    // Update daily attempts
    const playDate = getPlayDate();
    const { data: attemptData } = await supabase
      .from('flappy_daily_attempts')
      .select('*')
      .eq('player_address', playerAddress.toLowerCase())
      .eq('play_date', playDate)
      .single();

    if (attemptData) {
      await supabase
        .from('flappy_daily_attempts')
        .update({ 
          attempts: attemptData.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('player_address', playerAddress.toLowerCase())
        .eq('play_date', playDate);
    } else {
      await supabase
        .from('flappy_daily_attempts')
        .insert({
          player_address: playerAddress.toLowerCase(),
          play_date: playDate,
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Submit score error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}