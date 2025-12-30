// app/api/games/flappy/submit-score/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Game physics constants - must match frontend
const PIPE_SPAWN_DISTANCE = 240;
const PIPE_SPEED_START = 2.0;
const PIPE_SPEED_MAX = 4.0;

// Calculate minimum time to achieve a score (in ms)
// This is based on how fast pipes move and spawn
function getMinTimeForScore(score: number): number {
  if (score <= 0) return 0;
  
  // Average pipe speed increases with score
  // At score 0: 2.0 speed, at score 50+: 4.0 speed
  // Time per pipe = distance / speed, roughly 1.5-3 seconds per point
  // Being generous here to avoid false positives
  const avgTimePerPipe = 1000; // 1 second minimum per pipe (very generous)
  return score * avgTimePerPipe;
}

// Maximum realistic score based on time played
// Even the best players can't score more than ~1 point per 1.2 seconds
function getMaxScoreForTime(elapsedMs: number): number {
  const maxPointsPerSecond = 1 / 1.2; // ~0.83 points per second max
  const maxScore = Math.floor((elapsedMs / 1000) * maxPointsPerSecond);
  return maxScore + 10; // Add buffer for timing variations
}

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

    // Cap score at reasonable maximum (nobody scoring 1000+ legitimately)
    const MAX_REALISTIC_SCORE = 500;
    if (score > MAX_REALISTIC_SCORE) {
      console.warn(`Suspicious score rejected: ${score} from ${playerAddress}`);
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }

    let costPaid = 1;
    let sessionValid = false;

    // If session provided, validate it
    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from('flappy_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.warn(`Invalid session: ${sessionId}`);
        return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
      }

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

      // Check score is realistic for time played
      const elapsedMs = Date.now() - session.start_time;
      const maxPossibleScore = getMaxScoreForTime(elapsedMs);
      
      if (score > maxPossibleScore) {
        console.warn(`Score too high for time: ${score} in ${elapsedMs}ms (max: ${maxPossibleScore})`);
        return NextResponse.json({ error: 'Invalid score for time played' }, { status: 400 });
      }

      // Minimum time check - must play at least 2 seconds to submit
      if (elapsedMs < 2000 && score > 0) {
        console.warn(`Game too short: ${elapsedMs}ms with score ${score}`);
        return NextResponse.json({ error: 'Game too short' }, { status: 400 });
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
    } else {
      // No session = suspicious, but allow score 0 submissions (died immediately)
      if (score > 0) {
        console.warn(`No session for score ${score} from ${playerAddress}`);
        return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
      }
    }

    // Get current week boundaries
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysSinceFriday = (dayOfWeek + 2) % 7;
    const fridayNoon = new Date(now);
    fridayNoon.setUTCDate(now.getUTCDate() - daysSinceFriday);
    fridayNoon.setUTCHours(12, 0, 0, 0);
    if (now < fridayNoon) {
      fridayNoon.setUTCDate(fridayNoon.getUTCDate() - 7);
    }
    const nextFridayNoon = new Date(fridayNoon);
    nextFridayNoon.setUTCDate(fridayNoon.getUTCDate() + 7);

    const weekStart = fridayNoon.toISOString();
    const weekEnd = nextFridayNoon.toISOString();

    // Check for existing entry this week
    const { data: existing } = await supabase
      .from('flappy_leaderboard')
      .select('*')
      .eq('player_address', playerAddress.toLowerCase())
      .gte('created_at', weekStart)
      .lt('created_at', weekEnd)
      .order('score', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Only update if new score is higher
      if (score > existing.score) {
        await supabase
          .from('flappy_leaderboard')
          .update({ 
            score,
            username: username || existing.username,
            pfp_url: pfpUrl || existing.pfp_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } else {
      // Insert new entry
      await supabase
        .from('flappy_leaderboard')
        .insert({
          player_address: playerAddress.toLowerCase(),
          username: username || `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`,
          pfp_url: pfpUrl,
          score,
          cost_paid: costPaid,
          created_at: new Date().toISOString(),
        });
    }

    // Record attempt
    const today = new Date().toISOString().split('T')[0];
    const { data: attemptData } = await supabase
      .from('flappy_attempts')
      .select('*')
      .eq('player_address', playerAddress.toLowerCase())
      .eq('date', today)
      .single();

    if (attemptData) {
      await supabase
        .from('flappy_attempts')
        .update({ attempts: attemptData.attempts + 1 })
        .eq('id', attemptData.id);
    } else {
      await supabase
        .from('flappy_attempts')
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