// app/api/sprinkles-claim/verify-share/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { fid, address, expectedAmount } = await request.json();

    if (!fid || !address) {
      return NextResponse.json(
        { error: "Missing fid or address" },
        { status: 400 }
      );
    }

    if (!NEYNAR_API_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 }
      );
    }

    // Fetch recent casts from the user
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${fid}&limit=10`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error("Neynar API error:", await response.text());
      return NextResponse.json(
        { error: "Failed to fetch casts" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const casts = data.casts || [];

    // Look for a cast that mentions SPRINKLES claim and has the donutlabs link
    const validCast = casts.find((cast: any) => {
      const text = cast.text?.toLowerCase() || "";
      const hasKeywords = 
        (text.includes("sprinkles") || text.includes("✨")) &&
        (text.includes("claim") || text.includes("airdrop"));
      
      // Check for embed
      const hasEmbed = cast.embeds?.some((embed: any) => 
        embed.url?.includes("donutlabs")
      );

      // Cast must be recent (within last hour)
      const castTime = new Date(cast.timestamp).getTime();
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      const isRecent = castTime > oneHourAgo;

      return hasKeywords && hasEmbed && isRecent;
    });

    if (!validCast) {
      return NextResponse.json(
        { error: "No valid share cast found. Make sure to include 'SPRINKLES', 'claim', and the donutlabs link." },
        { status: 400 }
      );
    }

    // Verified!
    return NextResponse.json({
      success: true,
      castHash: validCast.hash,
      message: "Share verified! You can now claim your SPRINKLES.",
    });
  } catch (error: any) {
    console.error("Error verifying share:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}