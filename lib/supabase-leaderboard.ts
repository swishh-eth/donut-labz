import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Get current week number (resets Friday 12pm UTC)
export function getCurrentWeek(): number {
  const epochStart = new Date('2025-12-13T12:00:00Z'); // First distribution Friday 12pm UTC
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - epochStart.getTime()) / 1000);
  
  // If before first distribution, we're in week 0
  if (secondsElapsed < 0) {
    return 0;
  }
  
  const weeksElapsed = Math.floor(secondsElapsed / 604800); // 604800 seconds in a week
  return weeksElapsed;
}

// Record a glaze for a user
export async function recordGlaze(address: string) {
  const weekNumber = getCurrentWeek();
  
  // Try to update existing entry
  const { data: existing } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('address', address.toLowerCase())
    .eq('week_number', weekNumber)
    .single();

  if (existing) {
    // Update existing entry
    const { error } = await supabase
      .from('leaderboard_entries')
      .update({
        points: existing.points + 1,
        total_glazes: existing.total_glazes + 1,
        last_glaze_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('address', address.toLowerCase())
      .eq('week_number', weekNumber);

    if (error) throw error;
  } else {
    // Insert new entry
    const { error } = await supabase
      .from('leaderboard_entries')
      .insert({
        address: address.toLowerCase(),
        points: 1,
        total_glazes: 1,
        week_number: weekNumber,
        last_glaze_timestamp: new Date().toISOString(),
      });

    if (error) throw error;
  }
}

// Get current week's leaderboard
export async function getLeaderboard(limit: number = 10) {
  const weekNumber = getCurrentWeek();
  
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('week_number', weekNumber)
    .order('points', { ascending: false })
    .order('last_glaze_timestamp', { ascending: true }) // Tiebreaker: earliest glaze wins
    .limit(limit);

  if (error) throw error;
  return data;
}

// Get top 3 winners for distribution
export async function getTop3Winners() {
  const weekNumber = getCurrentWeek();
  
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('week_number', weekNumber)
    .order('points', { ascending: false })
    .order('last_glaze_timestamp', { ascending: true })
    .limit(3);

  if (error) throw error;
  
  if (!data || data.length < 3) {
    return null; // Not enough winners
  }

  return {
    first: data[0].address,
    second: data[1].address,
    third: data[2].address,
    weekNumber,
  };
}

// Save weekly winners to history
export async function saveWeeklyWinners(
  weekNumber: number,
  first: string,
  second: string,
  third: string,
  firstAmount: string,
  secondAmount: string,
  thirdAmount: string,
  txHash: string
) {
  const { error } = await supabase
    .from('weekly_winners')
    .insert({
      week_number: weekNumber,
      first_place: first.toLowerCase(),
      second_place: second.toLowerCase(),
      third_place: third.toLowerCase(),
      first_amount: firstAmount,
      second_amount: secondAmount,
      third_amount: thirdAmount,
      tx_hash: txHash,
    });

  if (error) throw error;
}