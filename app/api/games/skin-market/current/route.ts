import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-leaderboard';

// Calculate current week number
function getCurrentWeekNumber(): number {
  const startDate = new Date('2025-01-01T00:00:00Z');
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export async function GET() {
  try {
    const weekNumber = getCurrentWeekNumber();
    
    // Get current week's skin from database
    const { data: skinData, error: skinError } = await supabase
      .from('weekly_skins')
      .select('*')
      .eq('week_number', weekNumber)
      .single();
    
    if (skinError && skinError.code !== 'PGRST116') {
      console.error('Error fetching skin:', skinError);
    }
    
    // Get mint count and recent minters
    let mintCount = 0;
    let recentMinters: { username: string; pfpUrl?: string }[] = [];
    let minters: string[] = [];
    
    if (skinData) {
      const { data: mintData, error: mintError } = await supabase
        .from('skin_mints')
        .select('address, username, pfp_url')
        .eq('skin_id', skinData.id)
        .order('created_at', { ascending: false });
      
      if (!mintError && mintData) {
        mintCount = mintData.length;
        minters = mintData.map(m => m.address);
        recentMinters = mintData.slice(0, 10).map(m => ({
          username: m.username || m.address.slice(0, 6),
          pfpUrl: m.pfp_url,
        }));
      }
    }
    
    // If no skin in DB, return a placeholder/mock
    const skin = skinData ? {
      id: skinData.id,
      name: skinData.name,
      frostingColor: skinData.frosting_color,
      description: skinData.description,
      price: skinData.price,
      artist: {
        username: skinData.artist_username,
        displayName: skinData.artist_display_name,
        pfpUrl: skinData.artist_pfp_url,
        fid: skinData.artist_fid,
        walletAddress: skinData.artist_wallet_address,
      },
      weekNumber: skinData.week_number,
      weekStart: skinData.week_start,
      weekEnd: skinData.week_end,
      mintCount,
      animated: skinData.animated,
      animationType: skinData.animation_type,
      rarity: skinData.rarity,
    } : {
      // Mock data when no skin is set
      id: `week-${weekNumber}-placeholder`,
      name: "Coming Soon",
      frostingColor: "#6366F1",
      description: "This week's artist skin is being prepared. Check back soon!",
      price: 0,
      artist: {
        username: "donutlabs",
        displayName: "Donut Labs",
        pfpUrl: "",
        fid: 0,
        walletAddress: "0x0000000000000000000000000000000000000000",
      },
      weekNumber,
      weekStart: "",
      weekEnd: "",
      mintCount: 0,
      animated: false,
      animationType: null,
      rarity: "common",
    };
    
    return NextResponse.json({
      skin,
      recentMinters,
      minters,
      weekNumber,
    });
  } catch (error) {
    console.error('Failed to fetch current skin:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}