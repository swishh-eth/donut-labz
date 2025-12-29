import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Get the current "play date" based on 6pm EST reset (11pm UTC)
function getPlayDate(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  // If before 23:00 UTC (6pm EST), use today
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
    
    // Get start of play day (11pm UTC previous day) and end (11pm UTC current day)
    const dayStart = new Date(playDate);
    dayStart.setUTCHours(23, 0, 0, 0);
    dayStart.setUTCDate(dayStart.getUTCDate() - 1);
    
    const dayEnd = new Date(playDate);
    dayEnd.setUTCHours(23, 0, 0, 0);
    
    // Count games played today by this address
    const { count, error } = await supabase
      .from('flappy_games')
      .select('*', { count: 'exact', head: true })
      .eq('player_address', address.toLowerCase())
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString());
    
    if (error) {
      console.error('Failed to fetch attempts:', error);
      return NextResponse.json({ attempts: 0, nextCost: 1, playDate });
    }
    
    const attempts = count || 0;
    
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