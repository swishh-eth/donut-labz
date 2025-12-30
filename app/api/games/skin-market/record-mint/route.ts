import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

export async function POST(request: NextRequest) {
  try {
    const { address, skinId, username, pfpUrl } = await request.json();
    
    if (!address || !skinId) {
      return NextResponse.json({ error: 'Missing address or skinId' }, { status: 400 });
    }
    
    const normalizedAddress = address.toLowerCase();
    
    // Check if already minted
    const { data: existing } = await supabase
      .from('skin_mints')
      .select('id')
      .eq('address', normalizedAddress)
      .eq('skin_id', skinId)
      .single();
    
    if (existing) {
      return NextResponse.json({ error: 'Already minted' }, { status: 400 });
    }
    
    // Record the mint
    const { error: insertError } = await supabase
      .from('skin_mints')
      .insert({
        address: normalizedAddress,
        skin_id: skinId,
        username: username || null,
        pfp_url: pfpUrl || null,
      });
    
    if (insertError) {
      console.error('Error recording mint:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    
    // Also add to user's owned skins in user_skins table
    const { error: skinError } = await supabase
      .from('user_skins')
      .upsert({
        address: normalizedAddress,
        skin_id: skinId,
      }, {
        onConflict: 'address,skin_id',
      });
    
    if (skinError) {
      console.error('Error adding to user skins:', skinError);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to record mint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}