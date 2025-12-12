import { NextRequest, NextResponse } from "next/server";

// Token addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

// Specific pair addresses
const DONUT_WETH_PAIR = "0xd1dbb2e56533c55c3a637d13c53aeef65c5d5703".toLowerCase();
const SPRINKLES_DONUT_PAIR = "0x47e8b03017d8b8d058ba5926838ca4dd4531e668".toLowerCase();

export async function GET(request: NextRequest) {
  try {
    // Fetch ETH price from CoinGecko
    const ethRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const ethData = await ethRes.json();
    const ethPrice = ethData.ethereum?.usd || 0;
    console.log("[prices] ETH price:", ethPrice);

    // Fetch DONUT price using token endpoint
    let donutPrice = 0;
    try {
      const donutRes = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${DONUT_ADDRESS}`,
        { next: { revalidate: 60 } }
      );
      const donutData = await donutRes.json();
      console.log("[prices] DONUT pairs count:", donutData.pairs?.length || 0);
      
      if (donutData.pairs && donutData.pairs.length > 0) {
        // First try to find the specific DONUT/WETH pair on Base
        const specificPair = donutData.pairs.find(
          (p: any) => p.pairAddress?.toLowerCase() === DONUT_WETH_PAIR && p.chainId === "base"
        );
        
        if (specificPair && specificPair.priceUsd) {
          donutPrice = parseFloat(specificPair.priceUsd);
          console.log("[prices] DONUT specific pair found, price:", donutPrice);
        } else {
          // Fallback: filter for Base chain AND valid 42-char addresses only
          const validBasePairs = donutData.pairs.filter((p: any) => 
            p.chainId === "base" && 
            p.priceUsd &&
            p.pairAddress?.length === 42 && // Valid ETH address length
            p.pairAddress?.startsWith("0x")
          );
          
          // Sort by liquidity
          const sortedPairs = validBasePairs.sort(
            (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          );
          
          if (sortedPairs.length > 0) {
            donutPrice = parseFloat(sortedPairs[0].priceUsd || "0");
            console.log("[prices] DONUT best valid pair:", sortedPairs[0].pairAddress, "price:", donutPrice);
          }
        }
      }
    } catch (e) {
      console.error("[prices] DONUT fetch error:", e);
    }

    // Fetch SPRINKLES price using token endpoint
    let sprinklesPrice = 0;
    try {
      const sprinklesRes = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${SPRINKLES_ADDRESS}`,
        { next: { revalidate: 60 } }
      );
      const sprinklesData = await sprinklesRes.json();
      console.log("[prices] SPRINKLES pairs count:", sprinklesData.pairs?.length || 0);
      
      if (sprinklesData.pairs && sprinklesData.pairs.length > 0) {
        // Try to find the specific SPRINKLES/DONUT pair first
        const specificPair = sprinklesData.pairs.find(
          (p: any) => p.pairAddress?.toLowerCase() === SPRINKLES_DONUT_PAIR && p.chainId === "base"
        );
        
        if (specificPair && specificPair.priceUsd) {
          sprinklesPrice = parseFloat(specificPair.priceUsd);
          console.log("[prices] SPRINKLES specific pair found, price:", sprinklesPrice);
        } else {
          // Fallback: filter for Base chain AND valid addresses
          const validBasePairs = sprinklesData.pairs.filter((p: any) => 
            p.chainId === "base" && 
            p.priceUsd &&
            p.pairAddress?.length === 42 &&
            p.pairAddress?.startsWith("0x")
          );
          
          const sortedPairs = validBasePairs.sort(
            (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          );
          
          if (sortedPairs.length > 0) {
            sprinklesPrice = parseFloat(sortedPairs[0].priceUsd || "0");
            console.log("[prices] SPRINKLES best valid pair:", sortedPairs[0].pairAddress, "price:", sprinklesPrice);
          }
        }
      }
    } catch (e) {
      console.error("[prices] SPRINKLES fetch error:", e);
    }

    const result = {
      ethPrice,
      donutPrice,
      sprinklesPrice,
    };
    console.log("[prices] Final result:", result);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("[prices] Failed to fetch prices:", error);
    return NextResponse.json(
      { ethPrice: 0, donutPrice: 0, sprinklesPrice: 0 },
      { status: 500 }
    );
  }
}