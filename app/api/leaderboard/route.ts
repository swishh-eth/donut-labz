import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get current week number (resets Friday 6pm EST / 11pm UTC)
function getCurrentWeek(): number {
  const epochStart = new Date('2025-12-05T23:00:00Z'); // Week 1 started Dec 5 at 6pm EST
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - epochStart.getTime()) / 1000);
  
  if (secondsElapsed < 0) {
    return 1;
  }
  
  const weeksElapsed = Math.floor(secondsElapsed / 604800);
  return weeksElapsed + 1;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const weekNumber = getCurrentWeek();

    console.log('Fetching leaderboard for week:', weekNumber);

    // Query glaze_transactions and aggregate points by address
    const { data, error } = await supabase
      .from('glaze_transactions')
      .select('address, points, recorded_at, week_number');

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch leaderboard' },
        { status: 500 }
      );
    }

    console.log('Total records found:', data?.length || 0);
    console.log('Sample records:', data?.slice(0, 3));

    // Aggregate points by address (for current week only)
    const aggregated: Record<string, { 
      address: string; 
      total_points: number; 
      total_mines: number;
      last_mine_timestamp: string;
    }> = {};
    
    for (const row of data || []) {
      // Filter by week number (handle potential string/number mismatch)
      if (Number(row.week_number) !== weekNumber) continue;
      
      const addr = row.address.toLowerCase();
      if (!aggregated[addr]) {
        aggregated[addr] = { 
          address: addr, 
          total_points: 0, 
          total_mines: 0,
          last_mine_timestamp: row.recorded_at || new Date().toISOString()
        };
      }
      aggregated[addr].total_points += row.points || 0;
      aggregated[addr].total_mines += 1;
      // Track latest mine timestamp
      if (row.recorded_at && row.recorded_at > aggregated[addr].last_mine_timestamp) {
        aggregated[addr].last_mine_timestamp = row.recorded_at;
      }
    }
    
    console.log('Aggregated entries:', Object.keys(aggregated).length);
    
    // Sort by points descending, then by earliest last_mine_timestamp (tiebreaker)
    const sorted = Object.values(aggregated)
      .sort((a, b) => {
        if (b.total_points !== a.total_points) {
          return b.total_points - a.total_points;
        }
        // Tiebreaker: whoever got their points first wins
        return new Date(a.last_mine_timestamp).getTime() - new Date(b.last_mine_timestamp).getTime();
      })
      .slice(0, limit);

    return NextResponse.json({
      leaderboard: sorted,
      weekNumber,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}