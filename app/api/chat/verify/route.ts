import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-leaderboard";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

const baseClient = createPublicClient({
  chain: base,
  transport: http("https://base.publicnode.com"),
});

// Requirements
const MIN_ETH_BALANCE = 0.0005;
const MIN_NEYNAR_SCORE = 0.6;
const MIN_FOLLOWERS = 500;
const MIN_MESSAGE_LENGTH = 3;
const RATE_LIMIT_SECONDS = 30;
const MAX_SAME_MESSAGE = 3;
const SCORE_CACHE_DAYS = 7;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { senderAddress, message } = body;

    if (!senderAddress) {
      return NextResponse.json(
        { eligible: false, reasons: ["Missing wallet address"] },
        { status: 400 }
      );
    }

    const address = senderAddress.toLowerCase();
    const trimmedMessage = message?.trim() || "";
    const reasons: string[] = [];

    // === CHECK 1: Minimum message length ===
    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      reasons.push(`Message must be at least ${MIN_MESSAGE_LENGTH} characters`);
    }

    // === CHECK 2: ETH balance ===
    try {
      const balance = await baseClient.getBalance({ address: address as `0x${string}` });
      const ethBalance = parseFloat(formatEther(balance));

      if (ethBalance < MIN_ETH_BALANCE) {
        reasons.push(`Need at least ${MIN_ETH_BALANCE} ETH in wallet`);
      }
    } catch (e) {
      console.error("Failed to check ETH balance:", e);
    }

    // === CHECK 3: Get user data from chat_points ===
    const { data: existing } = await supabase
      .from("chat_points")
      .select("*")
      .eq("address", address)
      .single();

    // === CHECK 4: Rate limiting ===
    if (existing?.last_message_at) {
      const lastMessageTime = new Date(existing.last_message_at).getTime();
      const now = Date.now();
      const secondsSinceLastMessage = (now - lastMessageTime) / 1000;

      if (secondsSinceLastMessage < RATE_LIMIT_SECONDS) {
        const waitTime = Math.ceil(RATE_LIMIT_SECONDS - secondsSinceLastMessage);
        reasons.push(`Wait ${waitTime}s before sending another message`);
      }
    }

    // === CHECK 5: Duplicate consecutive message ===
    if (trimmedMessage && existing?.last_message === trimmedMessage) {
      reasons.push("Cannot send the same message twice in a row");
    }

    // === CHECK 6: Repeated message abuse ===
    if (trimmedMessage && existing?.recent_messages) {
      const recentMessages = existing.recent_messages as string[];
      const sameMessageCount = recentMessages.filter(m => m === trimmedMessage).length;

      if (sameMessageCount >= MAX_SAME_MESSAGE) {
        reasons.push("Message used too frequently, try something different");
      }
    }

    // === CHECK 7: Neynar score and follower count from profile_cache ===
    let neynarScore = 0;
    let followerCount = 0;
    let needsFreshData = true;

    const { data: cachedProfile } = await supabase
      .from("profile_cache")
      .select("profile, updated_at")
      .eq("address", address)
      .single();

    if (cachedProfile?.profile) {
      const profile = cachedProfile.profile as { neynarScore?: number; followerCount?: number };
      const cacheAge = Date.now() - new Date(cachedProfile.updated_at).getTime();
      const cacheMaxAge = SCORE_CACHE_DAYS * 24 * 60 * 60 * 1000;

      if (cacheAge < cacheMaxAge) {
        neynarScore = profile.neynarScore ?? 0;
        followerCount = profile.followerCount ?? 0;
        needsFreshData = false;
      }
    }

    // Fetch fresh data from Neynar if needed
    if (needsFreshData) {
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
            followerCount = user.follower_count || 0;

            // Update profile_cache
            const profileData = {
              fid: user.fid,
              pfpUrl: user.pfp_url,
              username: user.username,
              displayName: user.display_name,
              neynarScore: neynarScore,
              followerCount: followerCount,
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
        console.error("Failed to fetch neynar data:", e);
      }
    }

    // Check neynar score
    if (neynarScore < MIN_NEYNAR_SCORE) {
      reasons.push(`Neynar score must be at least ${MIN_NEYNAR_SCORE} (yours: ${neynarScore.toFixed(2)})`);
    }

    // Check follower count
    if (followerCount < MIN_FOLLOWERS) {
      reasons.push(`Need at least ${MIN_FOLLOWERS} followers (yours: ${followerCount})`);
    }

    // Return result
    if (reasons.length > 0) {
      return NextResponse.json({
        eligible: false,
        reasons,
        neynarScore,
        followerCount,
      });
    }

    return NextResponse.json({
      eligible: true,
      neynarScore,
      followerCount,
    });
  } catch (error) {
    console.error("Error verifying eligibility:", error);
    return NextResponse.json(
      { eligible: false, reasons: ["Verification failed, try again"] },
      { status: 500 }
    );
  }
}