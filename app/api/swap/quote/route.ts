import { NextRequest, NextResponse } from "next/server";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
const SWAP_FEE_BPS = 5;

export async function GET(request: NextRequest) {
  console.log("=== 0x Quote API Called ===");
  
  try {
    const { searchParams } = new URL(request.url);
    
    const chainId = searchParams.get("chainId") || "8453";
    const sellToken = searchParams.get("sellToken");
    const buyToken = searchParams.get("buyToken");
    const sellAmount = searchParams.get("sellAmount");
    const taker = searchParams.get("taker");
    const slippageBps = searchParams.get("slippageBps") || "100";
    
    console.log("Request params:", { chainId, sellToken, buyToken, sellAmount, taker, slippageBps });
    
    if (!sellToken || !buyToken || !sellAmount || !taker) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    if (!ZEROX_API_KEY) {
      return NextResponse.json(
        { error: "0x API key not configured" },
        { status: 500 }
      );
    }

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

    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": ZEROX_API_KEY,
        "0x-version": "v2",
        "Accept": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("0x API error:", data);
      const errorMsg = data.reason || data.message || "0x API error";
      return NextResponse.json(
        { error: errorMsg, details: data },
        { status: response.status }
      );
    }

    console.log("Quote successful, buyAmount:", data.buyAmount);
    return NextResponse.json(data);
    
  } catch (error: unknown) {
    console.error("Swap quote error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}