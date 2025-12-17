import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    // Fetch past winners
    const { data: winners, error: winnersError } = await supabase
      .from('weekly_winners')
      .select('*')
      .order('week_number', { ascending: false })
      .limit(limit);

    if (winnersError) throw winnersError;

    if (!winners || winners.length === 0) {
      return NextResponse.json({ winners: [], profiles: {} });
    }

    // Collect all unique addresses from winners
    const addresses = new Set<string>();
    for (const week of winners) {
      if (week.first_place) addresses.add(week.first_place.toLowerCase());
      if (week.second_place) addresses.add(week.second_place.toLowerCase());
      if (week.third_place) addresses.add(week.third_place.toLowerCase());
    }

    // Fetch profiles from profile_cache
    const { data: profileData, error: profileError } = await supabase
      .from('profile_cache')
      .select('address, profile')
      .in('address', Array.from(addresses));

    if (profileError) {
      console.error('Failed to fetch profiles:', profileError);
    }

    // Build profiles map
    const profiles: Record<string, {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    }> = {};

    for (const row of profileData || []) {
      const addr = row.address.toLowerCase();
      const p = row.profile as {
        fid?: number;
        username?: string;
        displayName?: string;
        pfpUrl?: string;
      } | null;
      
      profiles[addr] = {
        fid: p?.fid || null,
        username: p?.username || null,
        displayName: p?.displayName || null,
        pfpUrl: p?.pfpUrl || null,
      };
    }

    return NextResponse.json({ winners, profiles });
  } catch (error) {
    console.error('Failed to fetch past winners:', error);
    return NextResponse.json({ winners: [], profiles: {} }, { status: 500 });
  }
}