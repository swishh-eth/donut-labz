import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Valid game types
const VALID_GAMES = ['dice', 'mines', 'wheel', 'tower'] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const { game, username, amount, pfpUrl, playerAddress } = body;
    
    // Validate required fields
    if (!game || !username || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: game, username, amount' },
        { status: 400 }
      );
    }
    
    // Validate game type
    if (!VALID_GAMES.includes(game)) {
      return NextResponse.json(
        { error: `Invalid game type. Must be one of: ${VALID_GAMES.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Insert the win record
    const { error } = await supabase
      .from('game_wins')
      .insert({
        game,
        username,
        amount,
        pfp_url: pfpUrl || null,
        player_address: playerAddress || null,
      });
    
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to record win:', e);
    return NextResponse.json(
      { error: 'Failed to record win' },
      { status: 500 }
    );
  }
}