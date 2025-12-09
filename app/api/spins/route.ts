// app/api/spins/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Get user's available spins
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_spins')
      .select('total_spins, spins_used')
      .eq('address', address.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const totalSpins = data?.total_spins || 0;
    const spinsUsed = data?.spins_used || 0;
    const availableSpins = totalSpins - spinsUsed;

    return NextResponse.json({
      success: true,
      availableSpins,
      totalSpins,
      spinsUsed,
    });
  } catch (error) {
    console.error('Error fetching spins:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch spins' },
      { status: 500 }
    );
  }
}