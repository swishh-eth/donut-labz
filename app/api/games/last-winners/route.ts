import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Winner = {
  username: string;
  amount: string;
  pfpUrl?: string;
};

type GameWinners = Winner[];

export async function GET() {
  try {
    // Fetch last 3 winners for each game
    const { data, error } = await supabase
      .from('game_wins')
      .select('game, username, amount, pfp_url')
      .order('created_at', { ascending: false })
      .limit(50); // Get enough to have 3 per game
    
    if (error) throw error;
    
    // Group by game, keeping only last 3 per game
    const result: {
      dice: GameWinners;
      mines: GameWinners;
      wheel: GameWinners;
      tower: GameWinners;
    } = {
      dice: [],
      mines: [],
      wheel: [],
      tower: [],
    };
    
    for (const row of data || []) {
      const game = row.game as keyof typeof result;
      if (result[game] && result[game].length < 3) {
        result[game].push({
          username: row.username,
          amount: row.amount,
          pfpUrl: row.pfp_url || undefined,
        });
      }
    }
    
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15',
      },
    });
  } catch (e) {
    console.error('Failed to get winners:', e);
    return NextResponse.json({
      dice: [],
      mines: [],
      wheel: [],
      tower: [],
    });
  }
}