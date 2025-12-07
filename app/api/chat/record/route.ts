import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-leaderboard";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

const baseClient = createPublicClient({
  chain: base,
  transport: http("https://base.publicnode.com"),
});

// Minimum ETH balance required (0.0001 ETH)
const MIN_ETH_BALANCE = 0.001;

// Rate limit: minimum seconds between messages
const RATE_LIMIT_SECONDS = 30;

// Minimum message length to earn points
const MIN_MESSAGE_LENGTH = 3;

// Only refresh Neynar score if cache is older than 7 days
const SCORE_CACHE_DAYS = 7;

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

    // Update chat_points
    if (existing) {
      const { error } = await supabase
        .from("chat_points")
        .update({
          total_messages: existing.total_messages + 1,
          total_points: existing.total_points + neynarScore,
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
        total_points: neynarScore,
        last_message_at: new Date().toISOString(),
        last_message: message?.trim() || null,
      });

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: neynarScore,
    });
  } catch (error) {
    console.error("Error recording points:", error);
    return NextResponse.json(
      { error: "Failed to record points" },
      { status: 500 }
    );
  }
}