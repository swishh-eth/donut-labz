import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Calculate current week number based on Jan 3, 2025 epoch (matching flappy_games table)
function getCurrentWeek(): number {
  const now = new Date();
  const epoch = new Date('2025-01-03T23:00:00Z');
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid, walletAddress, username, displayName, pfpUrl, txHash } = body;

    if (!fid || !walletAddress || !txHash) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const currentWeek = getCurrentWeek();

    // Generate a unique entry ID
    const entryId = `flappy-${fid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Record the entry in a game_entries table (or flappy_entries)
    // First, check if the table exists - if not, we'll just return success
    // The entry will be associated with the score submission later
    
    // For now, we'll track this in a simple way by returning the entry ID
    // The score submission will use this entry ID for validation
    
    // Count games played this week for this user
    const { count: gamesThisWeek } = await supabase
      .from('flappy_games')
      .select('*', { count: 'exact', head: true })
      .eq('week_number', currentWeek)
      .eq('player_address', walletAddress.toLowerCase());

    return NextResponse.json({
      success: true,
      entryId,
      currentWeek,
      gamesThisWeek: (gamesThisWeek || 0) + 1, // +1 for the current game about to be played
      txHash,
    });
  } catch (error) {
    console.error("Error recording free entry:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record entry" },
      { status: 500 }
    );
  }
}