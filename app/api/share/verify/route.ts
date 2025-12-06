// app/api/share/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, keccak256, encodePacked, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { SHARE_REWARDS_ADDRESS, SHARE_REWARDS_ABI } from "@/lib/contracts/share-rewards";

const VERIFIER_PRIVATE_KEY = process.env.SHARE_VERIFIER_PRIVATE_KEY as `0x${string}`;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;

// Minimum Neynar score required (0.6 = 6000 basis points)
const MIN_NEYNAR_SCORE = 0.7;

// The EXACT miniapp URL that must be in the cast
const REQUIRED_EMBED_URLS = [
  "donutlabs.vercel.app",
  "warpcast.com/miniapps/donutlabs",
  "warpcast.com/~/miniapps/donutlabs",
];

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

    // Get user's Neynar score FIRST to reject low scores early
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
    const user = userData.users?.[0];
    const neynarScore = user?.experimental?.neynar_user_score || 0;

    // Check minimum score requirement
    if (neynarScore < MIN_NEYNAR_SCORE) {
      return NextResponse.json(
        {
          error: "Score too low",
          message: `Your Neynar score (${neynarScore.toFixed(2)}) is below the minimum required (${MIN_NEYNAR_SCORE}). Build up your reputation and try again!`,
        },
        { status: 403 }
      );
    }

    // Get current campaign info from contract
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

    // Parse campaign info
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

    // Convert campaign start time to milliseconds
    const campaignStartMs = Number(startTime) * 1000;

    // Check if user already claimed
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

    // Fetch user's recent casts from Neynar
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

    // Find a valid cast that:
    // 1. Was made AFTER the campaign started
    // 2. Contains the miniapp embed URL
    const validCast = casts.find((cast: any) => {
      const castTime = new Date(cast.timestamp).getTime();

      // Cast must be AFTER campaign started
      if (castTime < campaignStartMs) {
        return false;
      }

      // Check embeds for the miniapp URL (this is the important one)
      const embeds = cast.embeds || [];
      const hasValidEmbed = embeds.some((embed: any) => {
        const url = (embed.url || "").toLowerCase();
        return REQUIRED_EMBED_URLS.some((requiredUrl) =>
          url.includes(requiredUrl.toLowerCase())
        );
      });

      // Also check text as fallback
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

    // Calculate score for contract
    // We pass a value that the contract will use to calculate reward
    // Score range: 0.6 to 1.0 maps to -10% to +10% of base reward
    // 
    // Formula: multiplier = 0.9 + (score - 0.6) * 0.5
    // Score 0.6 → 0.9 (90% of base)
    // Score 0.8 → 1.0 (100% of base)  
    // Score 1.0 → 1.1 (110% of base)
    //
    // We'll pass the multiplier as basis points (9000-11000)
    // Contract will do: reward = baseReward * scoreBps / 10000
    
    const multiplier = 0.9 + (neynarScore - 0.6) * 0.5;
    const clampedMultiplier = Math.min(Math.max(multiplier, 0.9), 1.1);
    const scoreBps = Math.floor(clampedMultiplier * 10000);

    // Format cast hash - needs to be bytes32
    let castHashHex = validCast.hash;
    if (!castHashHex.startsWith("0x")) {
      castHashHex = "0x" + castHashHex;
    }

    // Pad to 32 bytes (64 hex chars + 0x)
    while (castHashHex.length < 66) {
      castHashHex = castHashHex + "0";
    }

    // Create the message hash that matches the contract
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

    // Sign the message
    const account = privateKeyToAccount(VERIFIER_PRIVATE_KEY);
    const signature = await account.signMessage({
      message: { raw: toBytes(messageHash) },
    });

    const castDate = new Date(validCast.timestamp).toLocaleString();

    return NextResponse.json({
      success: true,
      neynarScore: scoreBps,
      rawNeynarScore: neynarScore,
      multiplier: clampedMultiplier,
      castHash: castHashHex,
      signature,
      campaignId: Number(campaignId),
      castText: validCast.text?.slice(0, 50),
      castDate,
    });
  } catch (error) {
    console.error("Share verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}