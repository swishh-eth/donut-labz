// Vercel API Route: /api/swap/quote
// Proxies requests to 0x Swap API to avoid CORS and protect API key

import { NextRequest, NextResponse } from "next/server";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";

// Your treasury address for fee collection
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
const SWAP_FEE_BPS = 5; // 0.05% = 5 basis points

export async function GET(request: NextRequest) {
  console.log("=== 0x Quote API Called ===");
  
  try {
    const { searchParams } = new URL(request.url);
    
    // Required params
    const chainId = searchParams.get("chainId") || "8453"; // Base
    const sellToken = searchParams.get("sellToken");
    const buyToken = searchParams.get("buyToken");
    const sellAmount = searchParams.get("sellAmount");
    const taker = searchParams.get("taker");
    const slippageBps = searchParams.get("slippageBps") || "100";
    
    console.log("Request params:", { chainId, sellToken, buyToken, sellAmount, taker, slippageBps });
    
    if (!sellToken || !buyToken || !sellAmount || !taker) {
      console.log("Missing required parameters");
      return NextResponse.json(
        { error: "Missing required parameters: sellToken, buyToken, sellAmount, taker" },
        { status: 400 }
      );
    }

    // Check API key
    if (!ZEROX_API_KEY) {
      console.error("ZEROX_API_KEY not set!");
      return NextResponse.json(
        { error: "0x API key not configured. Set ZEROX_API_KEY in Vercel environment variables." },
        { status: 500 }
      );
    }

    // Build 0x API URL
    const apiUrl = new URL("https://api.0x.org/swap/allowance-holder/quote");
    apiUrl.searchParams.set("chainId", chainId);
    apiUrl.searchParams.set("sellToken", sellToken);
    apiUrl.searchParams.set("buyToken", buyToken);
    apiUrl.searchParams.set("sellAmount", sellAmount);
    apiUrl.searchParams.set("taker", taker);
    apiUrl.searchParams.set("slippageBps", slippageBps);
    apiUrl.searchParams.set("swapFeeBps", SWAP_FEE_BPS.toString());
    apiUrl.searchParams.set("swapFeeRecipient", TREASURY_ADDRESS);
    apiUrl.searchParams.set("swapFeeToken", buyToken);

    console.log("Calling 0x API:", apiUrl.toString().replace(ZEROX_API_KEY, "***"));

    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": ZEROX_API_KEY,
        "0x-version": "v2",
        "Accept": "application/json",
      },
    });

    const responseText = await response.text();
    console.log("0x API response status:", response.status);
    console.log("0x API response:", responseText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse 0x response as JSON:", responseText);
      return NextResponse.json(
        { error: "Invalid response from 0x API", raw: responseText.substring(0, 200) },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("0x API error:", JSON.stringify(data, null, 2));
      let errorMsg = "0x API error";
      if (data.reason) errorMsg = data.reason;
      else if (data.message) errorMsg = data.message;
      else if (data.validationErrors?.length) {
        errorMsg = data.validationErrors.map((e: any) => `${e.field}: ${e.reason}`).join(", ");
      }
      return NextResponse.json(
        { error: errorMsg, details: data },
        { status: response.status }
      );
    }

    console.log("Quote successful, buyAmount:", data.buyAmount);
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error("Swap quote error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}