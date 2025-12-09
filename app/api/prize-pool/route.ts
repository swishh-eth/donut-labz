// app/api/prize-pool/route.ts
import { NextResponse } from "next/server";

const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586";
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// Cache the result for 60 seconds
let cache: {
  data: { ethBalance: string; donutBalance: string; sprinklesBalance: string } | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 300_000; // 5 minutes (was 60 seconds)

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
    
    // Check for rate limiting
    if (ethRes.status === 429) {
      console.error("RPC rate limited! Status 429");
      if (cache.data) return NextResponse.json(cache.data);
      return NextResponse.json({ ethBalance: "0x0", donutBalance: "0x0", sprinklesBalance: "0x0", error: "rate_limited" });
    }
    
    const ethData = await ethRes.json();
    
    // Check for RPC errors
    if (ethData.error) {
      console.error("ETH RPC error:", ethData.error);
      if (cache.data) return NextResponse.json(cache.data);
    }

    // Fetch WETH balance (to combine with ETH)
    const wethRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: WETH_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 2,
      }),
    });
    const wethData = await wethRes.json();
    if (wethData.error) console.error("WETH RPC error:", wethData.error);

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
        id: 3,
      }),
    });
    const donutData = await donutRes.json();
    if (donutData.error) console.error("DONUT RPC error:", donutData.error);

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
        id: 4,
      }),
    });
    const sprinklesData = await sprinklesRes.json();
    if (sprinklesData.error) console.error("SPRINKLES RPC error:", sprinklesData.error);

    // Combine ETH + WETH balances
    const ethBalance = BigInt(ethData.result || "0x0");
    const wethBalance = BigInt(wethData.result || "0x0");
    const combinedEthBalance = ethBalance + wethBalance;

    const result = {
      ethBalance: "0x" + combinedEthBalance.toString(16),
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