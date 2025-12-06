// app/api/share/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { SHARE_REWARDS_ADDRESS, SHARE_REWARDS_ABI } from "@/lib/contracts/share-rewards";

const VERIFIER_PRIVATE_KEY = process.env.SHARE_VERIFIER_PRIVATE_KEY as `0x${string}`;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Minimum requirements
const MIN_NEYNAR_SCORE = 0.7;
const MIN_FOLLOWERS = 500;

// swishh.eth FID - users must follow this account
const SWISHH_FID = 209951;

// The EXACT miniapp URL that must be in the cast
const REQUIRED_EMBED_URLS = [
  "donutlabs.vercel.app",
  "warpcast.com/miniapps/donutlabs",
  "warpcast.com/~/miniapps/donutlabs",
];

// Cache TTL - 1 week
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { address, fid } = await req.json();

    if (!address || !fid) {
      return NextResponse.json(
        { error: "Missing address or fid" },
        { status: 400 }
      );
    }

    if (!VERIFIER_PRIVATE_KEY) {
      console.error("SHARE_VERIFIER_PRIVATE_KEY not set");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    // ============================================
    // STEP 1: Check contract if already claimed (FREE)
    // ============================================
    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    let campaignId: bigint;
    let campaignInfo: any;

    try {
      campaignId = await publicClient.readContract({
        address: SHARE_REWARDS_ADDRESS as `0x${string}`,
        abi: SHARE_REWARDS_ABI,
        functionName: "campaignId",
      });

      campaignInfo = await publicClient.readContract({
        address: SHARE_REWARDS_ADDRESS as `0x${string}`,
        abi: SHARE_REWARDS_ABI,
        functionName: "getCampaignInfo",
      });
    } catch (e) {
      console.error("Failed to read contract:", e);
      return NextResponse.json(
        { error: "Failed to read campaign info" },
        { status: 500 }
      );
    }

    const [, , , , , active, startTime] = campaignInfo as [
      string,
      bigint,
      bigint,
      bigint,
      bigint,
      boolean,
      bigint,
      bigint
    ];

    if (campaignId === 0n || !active) {
      return NextResponse.json(
        { error: "No active campaign", message: "There is no share campaign active right now." },
        { status: 400 }
      );
    }

    const campaignStartMs = Number(startTime) * 1000;

    const hasClaimed = await publicClient.readContract({
      address: SHARE_REWARDS_ADDRESS as `0x${string}`,
      abi: SHARE_REWARDS_ABI,
      functionName: "hasUserClaimed",
      args: [address as `0x${string}`],
    });

    if (hasClaimed) {
      return NextResponse.json(
        { error: "Already claimed", message: "You have already claimed this campaign's reward." },
        { status: 400 }
      );
    }

    // ============================================
    // STEP 2: Check for valid cast FIRST (1 Neynar call)
    // If no cast found, reject early - saves 2 API calls
    // ============================================
    const castsRes = await fetch(
      `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${fid}&limit=25`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY,
        },
      }
    );

    if (!castsRes.ok) {
      console.error("Failed to fetch casts:", await castsRes.text());
      return NextResponse.json(
        { error: "Failed to fetch casts" },
        { status: 500 }
      );
    }

    const castsData = await castsRes.json();
    const casts = castsData.casts || [];

    const validCast = casts.find((cast: any) => {
      const castTime = new Date(cast.timestamp).getTime();

      if (castTime < campaignStartMs) {
        return false;
      }

      const embeds = cast.embeds || [];
      const hasValidEmbed = embeds.some((embed: any) => {
        const url = (embed.url || "").toLowerCase();
        return REQUIRED_EMBED_URLS.some((requiredUrl) =>
          url.includes(requiredUrl.toLowerCase())
        );
      });

      const text = (cast.text || "").toLowerCase();
      const hasValidText = REQUIRED_EMBED_URLS.some((requiredUrl) =>
        text.includes(requiredUrl.toLowerCase())
      );

      return hasValidEmbed || hasValidText;
    });

    if (!validCast) {
      const campaignStartDate = new Date(campaignStartMs).toLocaleString();
      return NextResponse.json(
        {
          error: "No valid share found",
          message: `Please share the mini app AFTER the campaign started (${campaignStartDate}). Make sure to include the Donut Labs miniapp link in your cast.`,
        },
        { status: 404 }
      );
    }

    // ============================================
    // STEP 3: Check profile cache in Supabase (FREE)
    // ============================================
    let neynarScore: number | null = null;
    let followerCount: number | null = null;

    try {
      const { data: cachedProfile } = await supabase
        .from("profile_cache")
        .select("*")
        .eq("address", address.toLowerCase())
        .single();

      if (cachedProfile) {
        const cachedTime = new Date(cachedProfile.updated_at).getTime();
        if (Date.now() - cachedTime < CACHE_TTL_MS) {
          neynarScore = cachedProfile.profile?.neynarScore ?? null;
          followerCount = cachedProfile.profile?.followerCount ?? null;
          console.log("Share verify - Using cached profile:", { neynarScore, followerCount });
        }
      }
    } catch (e) {
      // Cache miss, will fetch from Neynar
    }

    // ============================================
    // STEP 4: Fetch user data from Neynar if not cached (1 Neynar call)
    // ============================================
    let user: any = null;
    
    if (neynarScore === null || followerCount === null) {
      const userRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
        {
          headers: {
            accept: "application/json",
            api_key: NEYNAR_API_KEY,
          },
        }
      );

      if (!userRes.ok) {
        console.error("Failed to fetch user:", await userRes.text());
        return NextResponse.json(
          { error: "Failed to fetch user data" },
          { status: 500 }
        );
      }

      const userData = await userRes.json();
      user = userData.users?.[0];
      
      neynarScore = user?.experimental?.neynar_user_score || 0;
      followerCount = user?.follower_count ?? 0;

      // Update cache with fresh data including follower count
      const userVerifiedAddress = user?.verified_addresses?.eth_addresses?.[0]?.toLowerCase();
      if (userVerifiedAddress) {
        try {
          await supabase.from("profile_cache").upsert(
            {
              address: userVerifiedAddress,
              profile: {
                fid: user.fid,
                username: user.username,
                displayName: user.display_name,
                pfpUrl: user.pfp_url,
                neynarScore: neynarScore,
                followerCount: followerCount,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "address" }
          );
        } catch (e) {
          console.error("Failed to update profile cache:", e);
        }
      }
    }

    console.log("Share verify - User check:", { 
      fid, 
      neynarScore, 
      followerCount,
      fromCache: user === null,
    });

    // Check minimum follower requirement
    if (followerCount! < MIN_FOLLOWERS) {
      return NextResponse.json(
        {
          error: "Not enough followers",
          message: `You need at least ${MIN_FOLLOWERS} followers to claim (you have ${followerCount}).`,
        },
        { status: 403 }
      );
    }

    // Check minimum score requirement
    if (neynarScore! < MIN_NEYNAR_SCORE) {
      return NextResponse.json(
        {
          error: "Score too low",
          message: `Your Neynar score (${neynarScore!.toFixed(2)}) is below the minimum required (${MIN_NEYNAR_SCORE}). Build up your reputation and try again!`,
        },
        { status: 403 }
      );
    }

    // ============================================
    // STEP 5: Check if user follows swishh.eth (1 Neynar call)
    // ============================================
    let followsSwishh = false;
    try {
      const followRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${SWISHH_FID}&viewer_fid=${fid}`,
        {
          headers: {
            accept: "application/json",
            api_key: NEYNAR_API_KEY,
          },
        }
      );

      if (followRes.ok) {
        const followData = await followRes.json();
        followsSwishh = followData.users?.[0]?.viewer_context?.following || false;
      }
    } catch (e) {
      console.error("Failed to check follow status:", e);
    }

    console.log("Share verify - Follow check:", { fid, followsSwishh });

    if (!followsSwishh) {
      return NextResponse.json(
        {
          error: "Must follow @swishh.eth",
          message: "You need to follow @swishh.eth to claim rewards.",
          needsFollow: true,
          hasShared: true,
        },
        { status: 403 }
      );
    }

    // ============================================
    // STEP 6: All checks passed - generate signature
    // ============================================
    const multiplier = 0.9 + ((neynarScore! - 0.7) / 0.3) * 0.2;
    const clampedMultiplier = Math.min(Math.max(multiplier, 0.9), 1.1);
    const scoreBps = Math.floor(clampedMultiplier * 10000);

    let castHashHex = validCast.hash;
    if (!castHashHex.startsWith("0x")) {
      castHashHex = "0x" + castHashHex;
    }

    while (castHashHex.length < 66) {
      castHashHex = castHashHex + "0";
    }

    const messageHash = keccak256(
      encodePacked(
        ["uint256", "address", "uint256", "bytes32"],
        [
          campaignId,
          address as `0x${string}`,
          BigInt(scoreBps),
          castHashHex as `0x${string}`,
        ]
      )
    );

    const account = privateKeyToAccount(VERIFIER_PRIVATE_KEY);
    const signature = await account.signMessage({
      message: { raw: messageHash },
    });

    console.log("Share verify - Success:", {
      address,
      fid,
      scoreBps,
      castHash: castHashHex,
    });

    return NextResponse.json({
      success: true,
      campaignId: campaignId.toString(),
      scoreBps,
      castHash: castHashHex,
      signature,
      neynarScore,
    });
  } catch (error) {
    console.error("Share verify error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}