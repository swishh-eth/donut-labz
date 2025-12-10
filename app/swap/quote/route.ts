// Vercel API Route: /api/swap/quote
// Proxies requests to 0x Swap API to avoid CORS and protect API key

import { NextRequest, NextResponse } from "next/server";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";
const ZEROX_API_URL = "https://api.0x.org/swap/allowance-holder";

// Your treasury address for fee collection
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
const SWAP_FEE_BPS = 5; // 0.05% = 5 basis points

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Required params
    const chainId = searchParams.get("chainId") || "8453"; // Base
    const sellToken = searchParams.get("sellToken");
    const buyToken = searchParams.get("buyToken");
    const sellAmount = searchParams.get("sellAmount");
    const taker = searchParams.get("taker");
    const slippageBps = Math.round(Number(searchParams.get("slippageBps") || "100")); // Ensure integer
    
    if (!sellToken || !buyToken || !sellAmount || !taker) {
      return NextResponse.json(
        { error: "Missing required parameters: sellToken, buyToken, sellAmount, taker" },
        { status: 400 }
      );
    }

    // Validate sellAmount is a valid number
    if (!/^\d+$/.test(sellAmount)) {
      return NextResponse.json(
        { error: "Invalid sellAmount - must be a positive integer (wei)" },
        { status: 400 }
      );
    }

    // Check API key
    if (!ZEROX_API_KEY) {
      return NextResponse.json(
        { error: "0x API key not configured" },
        { status: 500 }
      );
    }

    // Build 0x API request with our fee
    const params = new URLSearchParams({
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
      slippageBps: slippageBps.toString(),
      // Fee collection - 0x handles this atomically!
      swapFeeBps: SWAP_FEE_BPS.toString(),
      swapFeeRecipient: TREASURY_ADDRESS,
      swapFeeToken: buyToken, // Take fee from output token
    });

    const endpoint = searchParams.get("endpoint") || "quote";
    const url = `${ZEROX_API_URL}/${endpoint}?${params.toString()}`;

    console.log("Fetching 0x quote:", url.replace(ZEROX_API_KEY, "***"));

    const response = await fetch(url, {
      headers: {
        "0x-api-key": ZEROX_API_KEY,
        "0x-version": "v2",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("0x API error:", data);
      return NextResponse.json(
        { error: data.reason || data.message || "0x API error", details: data },
        { status: response.status }
      );
    }

    // Return the quote with transaction data
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Swap quote error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}