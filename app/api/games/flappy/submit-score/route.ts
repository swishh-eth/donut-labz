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
    
    // Calculate week number (ISO week)
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    
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

    // Update daily attempts
    const today = new Date().toISOString().split('T')[0];
    const { data: attemptData } = await supabase
      .from('flappy_daily_attempts')
      .select('*')
      .eq('player_address', playerAddress.toLowerCase())
      .eq('date', today)
      .single();

    if (attemptData) {
      await supabase
        .from('flappy_daily_attempts')
        .update({ attempts: attemptData.attempts + 1 })
        .eq('id', attemptData.id);
    } else {
      await supabase
        .from('flappy_daily_attempts')
        .insert({
          player_address: playerAddress.toLowerCase(),
          date: today,
          attempts: 1,
        });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Submit score error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}