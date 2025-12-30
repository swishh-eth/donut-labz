import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.toLowerCase();
  const skinId = searchParams.get('skinId');
  
  if (!address || !skinId) {
    return NextResponse.json({ error: 'Missing address or skinId' }, { status: 400 });
  }
  
  try {
    const { data, error } = await supabase
      .from('skin_mints')
      .select('id')
      .eq('address', address)
      .eq('skin_id', skinId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking mint:', error);
    }
    
    return NextResponse.json({
      hasMinted: !!data,
    });
  } catch (error) {
    console.error('Failed to check mint status:', error);
    return NextResponse.json({ hasMinted: false });
  }
}