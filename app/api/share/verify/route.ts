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

// SPRINKLES token address on Base
const SPRINKLES_TOKEN = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";
const MIN_SPRINKLES_BALANCE = 10000n * 10n ** 18n; // 10,000 SPRINKLES (18 decimals)

// swishh.eth FID - users must follow this account
const SWISHH_FID = 209951;

// The URLs/text that indicate a valid share
const REQUIRED_EMBED_URLS = [
  "sprinkles.wtf",
  "farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles",
  "farcaster.xyz/miniapps/5argX24fr_Tq",
  "5argX24fr_Tq", // miniapp ID
  "warpcast.com/miniapps/sprinkles",
  "warpcast.com/~/miniapps/sprinkles",
];

// Helper to check if a string contains any of our required URLs
const containsRequiredUrl = (str: string): boolean => {
  if (!str) return false;
  const lowerStr = str.toLowerCase();
  return REQUIRED_EMBED_URLS.some((url) => lowerStr.includes(url.toLowerCase()));
};

// Helper to extract all URLs from an embed object (handles various Neynar structures)
const getUrlsFromEmbed = (embed: any): string[] => {
  const urls: string[] = [];
  if (!embed) return urls;
  
  // Direct URL
  if (embed.url) urls.push(embed.url);
  
  // Metadata URL (for frames/miniapps)
  if (embed.metadata?.url) urls.push(embed.metadata.url);
  if (embed.metadata?.html?.ogUrl) urls.push(embed.metadata.html.ogUrl);
  
  // Frame URL
  if (embed.frame?.url) urls.push(embed.frame.url);
  if (embed.frame?.frames_url) urls.push(embed.frame.frames_url);
  
  // Cast embed might have URL in different places
  if (typeof embed === 'string') urls.push(embed);
  
  return urls;
};

// ERC20 balanceOf ABI
const ERC20_BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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
    // STEP 2: Check SPRINKLES balance (FREE - on-chain read)
    // ============================================
    let sprinklesBalance: bigint;
    try {
      sprinklesBalance = await publicClient.readContract({
        address: SPRINKLES_TOKEN as `0x${string}`,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
    } catch (e) {
      console.error("Failed to check SPRINKLES balance:", e);
      return NextResponse.json(
        { error: "Failed to check token balance" },
        { status: 500 }
      );
    }

    const sprinklesHuman = Number(sprinklesBalance) / 1e18;
    console.log("Share verify - SPRINKLES balance:", { address, balance: sprinklesHuman });

    if (sprinklesBalance < MIN_SPRINKLES_BALANCE) {
      const needed = 10000 - Math.floor(sprinklesHuman);
      return NextResponse.json(
        {
          error: "Insufficient SPRINKLES",
          message: `You need at least 10,000 SPRINKLES to claim. You have ${Math.floor(sprinklesHuman).toLocaleString()}.`,
          needsSprinkles: true,
          currentBalance: sprinklesHuman,
          requiredBalance: 10000,
        },
        { status: 403 }
      );
    }

    // ============================================
    // STEP 3: Check for valid cast (1 Neynar call)
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

    // Debug logging
    console.log("Share verify - Checking casts for fid:", fid);
    console.log("Share verify - Campaign start:", new Date(campaignStartMs).toISOString());
    console.log("Share verify - Found", casts.length, "casts");
    
    // Log first few casts for debugging
    casts.slice(0, 5).forEach((cast: any, i: number) => {
      console.log(`Cast ${i}:`, {
        hash: cast.hash,
        timestamp: cast.timestamp,
        text: cast.text?.substring(0, 50),
        embeds: cast.embeds?.map((e: any) => ({
          url: e.url,
          metadataUrl: e.metadata?.url,
          frameUrl: e.frame?.url,
        })),
      });
    });

    const validCast = casts.find((cast: any) => {
      const castTime = new Date(cast.timestamp).getTime();

      if (castTime < campaignStartMs) {
        return false;
      }

      // Check embeds for our URL
      const embeds = cast.embeds || [];
      const hasValidEmbed = embeds.some((embed: any) => {
        const urls = getUrlsFromEmbed(embed);
        return urls.some((url) => containsRequiredUrl(url));
      });

      // Check cast text for our URL or miniapp name
      const hasValidText = containsRequiredUrl(cast.text || "");

      // Log for debugging
      if (hasValidEmbed || hasValidText) {
        console.log("Found valid cast:", { hash: cast.hash, hasValidEmbed, hasValidText });
      }

      return hasValidEmbed || hasValidText;
    });

    if (!validCast) {
      const campaignStartDate = new Date(campaignStartMs).toLocaleString();
      console.log("Share verify - No valid cast found. Campaign started:", campaignStartDate);
      return NextResponse.json(
        {
          error: "No valid share found",
          message: `No qualifying cast found. Share the Sprinkles miniapp and try again.`,
        },
        { status: 404 }
      );
    }

    // ============================================
    // STEP 4: Check if user follows swishh.eth (1 Neynar call)
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
    // STEP 5: All checks passed - generate signature
    // Use a flat 1.0x multiplier since we removed Neynar score scaling
    // ============================================
    const scoreBps = 10000; // 1.0x multiplier (no bonus/penalty)

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
      sprinklesBalance: sprinklesHuman,
    });

    return NextResponse.json({
      success: true,
      campaignId: campaignId.toString(),
      scoreBps,
      castHash: castHashHex,
      signature,
    });
  } catch (error) {
    console.error("Share verify error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}