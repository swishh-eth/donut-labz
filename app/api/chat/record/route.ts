import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-leaderboard";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

const baseClient = createPublicClient({
  chain: base,
  transport: http("https://base.publicnode.com"),
});

// Minimum ETH balance required (0.0005 ETH)
const MIN_ETH_BALANCE = 0.0005;

// Rate limit: minimum seconds between messages
const RATE_LIMIT_SECONDS = 30;

// Minimum message length to earn points
const MIN_MESSAGE_LENGTH = 3;

// Only refresh Neynar score if cache is older than 7 days
const SCORE_CACHE_DAYS = 7;

// Sprinkles chat reward halving constants - STARTS AT 4x
const CHAT_REWARDS_START_TIME = 1765163000; // Approx when sprinkles miner deployed
const HALVING_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds
const INITIAL_MULTIPLIER = 4.0; // Changed to 4.0
const MIN_MULTIPLIER = 0.5; // Min 0.5x

const getCurrentMultiplier = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  const halvings = Math.floor(elapsed / HALVING_PERIOD);
  
  let multiplier = INITIAL_MULTIPLIER;
  for (let i = 0; i < halvings; i++) {
    multiplier = multiplier / 2;
    if (multiplier < MIN_MULTIPLIER) {
      multiplier = MIN_MULTIPLIER;
      break;
    }
  }
  
  return multiplier;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { senderAddress, message } = body;

    if (!senderAddress) {
      return NextResponse.json(
        { error: "Missing sender address" },
        { status: 400 }
      );
    }

    const address = senderAddress.toLowerCase();

    // === SPAM CHECK 1: Minimum message length ===
    if (message && message.trim().length < MIN_MESSAGE_LENGTH) {
      return NextResponse.json({
        success: true,
        pointsAwarded: 0,
        reason: "Message too short to earn sprinkles",
      });
    }

    // === SPAM CHECK 2: ETH balance check (free RPC call) ===
    try {
      const balance = await baseClient.getBalance({ address: address as `0x${string}` });
      const ethBalance = parseFloat(formatEther(balance));
      
      if (ethBalance < MIN_ETH_BALANCE) {
        return NextResponse.json({
          success: true,
          pointsAwarded: 0,
          reason: "Insufficient ETH balance",
        });
      }
    } catch (e) {
      console.error("Failed to check ETH balance:", e);
    }

    // Check if user exists in chat_points
    const { data: existing } = await supabase
      .from("chat_points")
      .select("*")
      .eq("address", address)
      .single();

    // === SPAM CHECK 3: Rate limiting ===
    if (existing?.last_message_at) {
      const lastMessageTime = new Date(existing.last_message_at).getTime();
      const now = Date.now();
      const secondsSinceLastMessage = (now - lastMessageTime) / 1000;

      if (secondsSinceLastMessage < RATE_LIMIT_SECONDS) {
        return NextResponse.json({
          success: true,
          pointsAwarded: 0,
          reason: "Rate limited",
        });
      }
    }

    // === SPAM CHECK 4: Duplicate message detection ===
    if (message && existing?.last_message === message.trim()) {
      return NextResponse.json({
        success: true,
        pointsAwarded: 0,
        reason: "Duplicate message",
      });
    }

    // === GET NEYNAR SCORE FROM profile_cache FIRST ===
    let neynarScore = 0;
    let needsFreshScore = true;

    // Check profile_cache for existing score
    const { data: cachedProfile } = await supabase
      .from("profile_cache")
      .select("profile, updated_at")
      .eq("address", address)
      .single();

    if (cachedProfile?.profile) {
      const profile = cachedProfile.profile as { neynarScore?: number };
      const cacheAge = Date.now() - new Date(cachedProfile.updated_at).getTime();
      const cacheMaxAge = SCORE_CACHE_DAYS * 24 * 60 * 60 * 1000;

      if (profile.neynarScore !== undefined && cacheAge < cacheMaxAge) {
        // Use cached score
        neynarScore = profile.neynarScore;
        needsFreshScore = false;
      }
    }

    // Only fetch from Neynar if cache is missing or stale
    if (needsFreshScore) {
      try {
        const neynarRes = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
          {
            headers: {
              accept: "application/json",
              api_key: process.env.NEYNAR_API_KEY || "",
            },
          }
        );

        if (neynarRes.ok) {
          const neynarData = await neynarRes.json();
          const users = neynarData[address];
          if (users && users.length > 0) {
            const user = users[0];
            neynarScore = user.experimental?.neynar_user_score || 0;

            // Update profile_cache with fresh data
            const profileData = {
              fid: user.fid,
              pfpUrl: user.pfp_url,
              username: user.username,
              displayName: user.display_name,
              neynarScore: neynarScore,
              followerCount: user.follower_count,
            };

            await supabase
              .from("profile_cache")
              .upsert({
                address,
                profile: profileData,
                updated_at: new Date().toISOString(),
              }, { onConflict: "address" });
          }
        }
      } catch (e) {
        console.error("Failed to fetch neynar score:", e);
      }
    }

    // Calculate points with halving multiplier
    const currentMultiplier = getCurrentMultiplier();
    const pointsAwarded = neynarScore * currentMultiplier;

    // Update chat_points
    if (existing) {
      const { error } = await supabase
        .from("chat_points")
        .update({
          total_messages: existing.total_messages + 1,
          total_points: existing.total_points + pointsAwarded,
          last_message_at: new Date().toISOString(),
          last_message: message?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("address", address);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("chat_points").insert({
        address,
        total_messages: 1,
        total_points: pointsAwarded,
        last_message_at: new Date().toISOString(),
        last_message: message?.trim() || null,
      });

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: pointsAwarded,
      multiplier: currentMultiplier,
      neynarScore: neynarScore,
    });
  } catch (error) {
    console.error("Error recording points:", error);
    return NextResponse.json(
      { error: "Failed to record points" },
      { status: 500 }
    );
  }
}