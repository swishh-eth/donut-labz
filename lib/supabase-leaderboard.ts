import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Get current week number (resets Friday 12pm UTC)
export function getCurrentWeek(): number {
  const epochStart = new Date('2025-12-05T12:00:00Z'); // Week 1 started Dec 5
  const now = new Date();
  const secondsElapsed = Math.floor((now.getTime() - epochStart.getTime()) / 1000);
  
  if (secondsElapsed < 0) {
    return 1;
  }
  
  const weeksElapsed = Math.floor(secondsElapsed / 604800);
  return weeksElapsed + 1;
}

// Record a glaze/mine transaction
// mineType: 'donut' = 2 points, 'sprinkles' = 1 point
export async function recordGlaze(address: string, txHash?: string, mineType: 'donut' | 'sprinkles' = 'donut') {
  const weekNumber = getCurrentWeek();
  const normalizedAddress = address.toLowerCase();
  const points = mineType === 'donut' ? 2 : 1;
  
  if (!txHash) {
    return { alreadyRecorded: false, pointsAdded: 0 };
  }

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
  
  // Record the transaction with points
  const { error: txError } = await supabase
    .from('glaze_transactions')
    .insert({
      tx_hash: normalizedTxHash,
      address: normalizedAddress,
      week_number: weekNumber,
      mine_type: mineType,
      points: points,
    });
  
  if (txError) {
    // If unique constraint violation, it was already recorded
    if (txError.code === '23505') {
      console.log('Transaction already recorded (race condition):', normalizedTxHash);
      return { alreadyRecorded: true };
    }
    throw txError;
  }
  
  return { alreadyRecorded: false, pointsAdded: points };
}

// Get current week's leaderboard by aggregating glaze_transactions
export async function getLeaderboard(limit: number = 10) {
  const weekNumber = getCurrentWeek();
  
  // Use raw SQL to aggregate points by address for current week
  const { data, error } = await supabase
    .rpc('get_leaderboard', { 
      week_num: weekNumber, 
      limit_count: limit 
    });

  if (error) {
    // Fallback: manual query if RPC doesn't exist
    console.error('RPC error, using fallback query:', error);
    
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('glaze_transactions')
      .select('address, points')
      .eq('week_number', weekNumber);
    
    if (fallbackError) throw fallbackError;
    
    // Aggregate manually
    const aggregated: Record<string, { address: string; total_points: number; total_mines: number }> = {};
    
    for (const row of fallbackData || []) {
      const addr = row.address.toLowerCase();
      if (!aggregated[addr]) {
        aggregated[addr] = { address: addr, total_points: 0, total_mines: 0 };
      }
      aggregated[addr].total_points += row.points || 0;
      aggregated[addr].total_mines += 1;
    }
    
    // Sort by points descending
    const sorted = Object.values(aggregated)
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, limit);
    
    return sorted;
  }
  
  return data;
}

// Get top 3 winners for distribution
export async function getTop3Winners() {
  const weekNumber = getCurrentWeek();
  const leaderboard = await getLeaderboard(3);
  
  if (!leaderboard || leaderboard.length === 0) {
    return null;
  }

  return {
    first: leaderboard[0]?.address || null,
    second: leaderboard[1]?.address || null,
    third: leaderboard[2]?.address || null,
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