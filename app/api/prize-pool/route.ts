// app/api/prize-pool/route.ts
import { NextResponse } from "next/server";

const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586";
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

// Cache the result for 60 seconds
let cache: {
  data: { ethBalance: string; donutBalance: string; sprinklesBalance: string } | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 60_000; // 60 seconds

export async function GET() {
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

    // Fetch ETH balance
    const ethRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [LEADERBOARD_CONTRACT, "latest"],
        id: 1,
      }),
    });
    const ethData = await ethRes.json();

    // Fetch DONUT balance (balanceOf call)
    const donutRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: DONUT_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 2,
      }),
    });
    const donutData = await donutRes.json();

    // Fetch SPRINKLES balance (balanceOf call)
    const sprinklesRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: SPRINKLES_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 3,
      }),
    });
    const sprinklesData = await sprinklesRes.json();

    const result = {
      ethBalance: ethData.result || "0x0",
      donutBalance: donutData.result || "0x0",
      sprinklesBalance: sprinklesData.result || "0x0",
    };

    // Update cache
    cache = {
      data: result,
      timestamp: now,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching prize pool:", error);
    
    // Return cached data if available, even if stale
    if (cache.data) {
      return NextResponse.json(cache.data);
    }

    return NextResponse.json(
      { ethBalance: "0x0", donutBalance: "0x0", sprinklesBalance: "0x0" },
      { status: 500 }
    );
  }
}