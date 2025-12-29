import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }
  
  try {
    const playDate = getPlayDate();
    const normalizedAddress = address.toLowerCase();
    
    // Get attempts from flappy_daily_attempts table
    const { data, error } = await supabase
      .from('flappy_daily_attempts')
      .select('attempts')
      .eq('player_address', normalizedAddress)
      .eq('play_date', playDate)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine (0 attempts)
      console.error('Failed to fetch attempts:', error);
    }
    
    const attempts = data?.attempts || 0;
    
    return NextResponse.json({
      attempts,
      nextCost: attempts + 1,
      playDate,
    });
  } catch (error) {
    console.error('Failed to fetch attempts:', error);
    return NextResponse.json({ attempts: 0, nextCost: 1 }, { status: 200 });
  }
}