// app/api/games/flappy/submit-score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { sessionId, playerAddress, username, pfpUrl, score } = await request.json();

    // Validate required fields
    if (!playerAddress) {
      return NextResponse.json({ error: 'Missing player address' }, { status: 400 });
    }

    if (typeof score !== 'number' || score < 0) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }

    let costPaid = 1;
    let sessionValid = false;

    // If session provided, try to validate it (optional - table might not exist)
    if (sessionId) {
      try {
        const { data: session, error: sessionError } = await supabase
          .from('flappy_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (!sessionError && session) {
          // Check session hasn't been used
          if (session.used) {
            console.warn(`Session already used: ${sessionId}`);
            return NextResponse.json({ error: 'Session already used' }, { status: 400 });
          }

          // Check player address matches
          if (session.player_address.toLowerCase() !== playerAddress.toLowerCase()) {
            console.warn(`Player mismatch: ${playerAddress} vs ${session.player_address}`);
            return NextResponse.json({ error: 'Player mismatch' }, { status: 400 });
          }

          // Mark session as used
          await supabase
            .from('flappy_sessions')
            .update({ 
              used: true, 
              score_submitted: score,
              end_time: Date.now(),
            })
            .eq('id', sessionId);

          costPaid = session.cost_paid || 1;
          sessionValid = true;
        }
      } catch (sessionErr) {
        // Session table might not exist - continue without session validation
        console.log('Session validation skipped:', sessionErr);
      }
    }
    
    console.log(`Score submission: player=${playerAddress}, score=${score}, sessionValid=${sessionValid}`);

    // Insert new game record (flappy_weekly_leaderboard view will aggregate best scores)
    const { error: insertError } = await supabase
      .from('flappy_games')
      .insert({
        player_address: playerAddress.toLowerCase(),
        username: username || `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`,
        pfp_url: pfpUrl,
        score,
        cost_paid: costPaid,
      });
    
    console.log(`Game insert: player=${playerAddress}, score=${score}, error=${insertError?.message || 'none'}`);

    // Record attempt
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

    return NextResponse.json({ 
      success: true,
      sessionValid,
    });

  } catch (error) {
    console.error('Submit score error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}