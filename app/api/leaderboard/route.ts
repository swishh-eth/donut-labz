import { NextResponse } from 'next/server';
import { getLeaderboard, getCurrentWeek } from '@/lib/supabase-leaderboard';

export async function GET() {
  try {
    const leaderboard = await getLeaderboard(10); // Top 10
    const weekNumber = getCurrentWeek();

    return NextResponse.json({
      success: true,
      weekNumber,
      leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}