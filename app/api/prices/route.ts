import { NextRequest, NextResponse } from "next/server";

// DEXScreener pair addresses for accurate pricing
const SPRINKLES_DONUT_PAIR = "0x47e8b03017d8b8d058ba5926838ca4dd4531e668";
const DONUT_WETH_PAIR = "0xb7484cdc25c2a11572632e76e6160b05f9e3b3f0";

export async function GET(request: NextRequest) {
  try {
    // Fetch ETH price from CoinGecko
    const ethRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const ethData = await ethRes.json();
    const ethPrice = ethData.ethereum?.usd || 0;

    // Fetch DONUT price from specific pair
    const donutRes = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/base/${DONUT_WETH_PAIR}`,
      { next: { revalidate: 60 } }
    );
    const donutData = await donutRes.json();
    const donutPair = donutData.pair || donutData.pairs?.[0];
    const donutPrice = donutPair ? parseFloat(donutPair.priceUsd || "0") : 0;

    // Fetch SPRINKLES price from specific pair
    const sprinklesRes = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/base/${SPRINKLES_DONUT_PAIR}`,
      { next: { revalidate: 60 } }
    );
    const sprinklesData = await sprinklesRes.json();
    const sprinklesPair = sprinklesData.pair || sprinklesData.pairs?.[0];
    const sprinklesPrice = sprinklesPair ? parseFloat(sprinklesPair.priceUsd || "0") : 0;

    return NextResponse.json({
      ethPrice,
      donutPrice,
      sprinklesPrice,
    });
  } catch (error) {
    console.error("Failed to fetch prices:", error);
    return NextResponse.json(
      { ethPrice: 0, donutPrice: 0, sprinklesPrice: 0 },
      { status: 500 }
    );
  }
}