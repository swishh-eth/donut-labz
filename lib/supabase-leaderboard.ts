import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Get current week number (resets Friday 12pm UTC)
export function getCurrentWeek(): number {
  const epochStart = new Date('2025-12-12T12:00:00Z');
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - epochStart.getTime()) / 1000);
  
  if (secondsElapsed < 0) {
    return 1;
  }
  
  const weeksElapsed = Math.floor(secondsElapsed / 604800);
  return weeksElapsed + 1;
}

// Record a glaze for a user (with transaction deduplication)
// mineType: 'donut' = 2 points, 'sprinkles' = 1 point
export async function recordGlaze(address: string, txHash?: string, mineType: 'donut' | 'sprinkles' = 'donut') {
  const weekNumber = getCurrentWeek();
  const normalizedAddress = address.toLowerCase();
  const pointsToAdd = mineType === 'donut' ? 2 : 1;
  
  // If txHash provided, check for duplicates
  if (txHash) {
    const normalizedTxHash = txHash.toLowerCase();
    
    // Check if this transaction was already recorded
    const { data: existingTx } = await supabase
      .from('glaze_transactions')
      .select('id')
      .eq('tx_hash', normalizedTxHash)
      .single();
    
    if (existingTx) {
      console.log('Transaction already recorded:', normalizedTxHash);
      return { alreadyRecorded: true };
    }
    
    // Record the transaction
    const { error: txError } = await supabase
      .from('glaze_transactions')
      .insert({
        tx_hash: normalizedTxHash,
        address: normalizedAddress,
        week_number: weekNumber,
        mine_type: mineType,
      });
    
    if (txError) {
      // If unique constraint violation, it was already recorded
      if (txError.code === '23505') {
        console.log('Transaction already recorded (race condition):', normalizedTxHash);
        return { alreadyRecorded: true };
      }
      throw txError;
    }
  }
  
  // Now update the leaderboard
  const { data: existing } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('address', normalizedAddress)
    .eq('week_number', weekNumber)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('leaderboard_entries')
      .update({
        points: existing.points + pointsToAdd,
        total_glazes: existing.total_glazes + 1,
        last_glaze_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('address', normalizedAddress)
      .eq('week_number', weekNumber);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('leaderboard_entries')
      .insert({
        address: normalizedAddress,
        points: pointsToAdd,
        total_glazes: 1,
        week_number: weekNumber,
        last_glaze_timestamp: new Date().toISOString(),
      });

    if (error) throw error;
  }
  
  return { alreadyRecorded: false, pointsAdded: pointsToAdd };
}

// Get current week's leaderboard
export async function getLeaderboard(limit: number = 10) {
  const weekNumber = getCurrentWeek();
  
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('*')
    .eq('week_number', weekNumber)
    .order('points', { ascending: false })
    .order('last_glaze_timestamp', { ascending: true })
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
  
  if (!data || data.length === 0) {
    return null;
  }

  return {
    first: data[0]?.address || null,
    second: data[1]?.address || null,
    third: data[2]?.address || null,
    weekNumber,
  };
}

// Save weekly winners to history
export async function saveWeeklyWinners(
  weekNumber: number,
  first: string,
  second: string | null,
  third: string | null,
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
      second_place: second?.toLowerCase() || null,
      third_place: third?.toLowerCase() || null,
      first_amount: firstAmount,
      second_amount: secondAmount,
      third_amount: thirdAmount,
      tx_hash: txHash,
    });

  if (error) throw error;
}