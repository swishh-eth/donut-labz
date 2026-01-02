// app/api/prize-pool/route.ts
import { NextResponse } from "next/server";

const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586";
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Multiple RPC endpoints to fallback through
const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_BASE_RPC_URL,
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://1rpc.io/base",
  "https://base-mainnet.public.blastapi.io",
  "https://mainnet.base.org",
].filter(Boolean) as string[];

// Cache the result for 5 minutes
let cache: {
  data: { donutBalance: string; sprinklesBalance: string; usdcBalance: string } | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 300_000; // 5 minutes

async function tryFetchFromRpc(rpcUrl: string): Promise<any[] | null> {
  try {
    const batchRequest = [
      {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: DONUT_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 1,
      },
      {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: SPRINKLES_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 2,
      },
      {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: USDC_ADDRESS,
            data: "0x70a08231000000000000000000000000" + LEADERBOARD_CONTRACT.slice(2).toLowerCase(),
          },
          "latest",
        ],
        id: 3,
      },
    ];

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batchRequest),
    });

    if (res.status === 429) {
      console.log(`Rate limited by ${rpcUrl}`);
      return null;
    }

    if (!res.ok) {
      console.log(`HTTP error from ${rpcUrl}: ${res.status}`);
      return null;
    }

    const responses = await res.json();
    const results = Array.isArray(responses) ? responses : [responses];
    
    // Check if we got valid results
    const donutResult = results.find((r: any) => r.id === 1);
    if (!donutResult?.result || donutResult.error) {
      console.log(`Invalid response from ${rpcUrl}`);
      return null;
    }

    return results;
  } catch (error) {
    console.log(`Error from ${rpcUrl}:`, error);
    return null;
  }
}

export async function GET() {
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Try each RPC endpoint until one works
  let results: any[] | null = null;
  
  for (const rpcUrl of RPC_ENDPOINTS) {
    results = await tryFetchFromRpc(rpcUrl);
    if (results) {
      console.log(`Successfully fetched from ${rpcUrl}`);
      break;
    }
  }

  if (!results) {
    console.error("All RPC endpoints failed");
    
    // Return cached data if available, even if stale
    if (cache.data) {
      return NextResponse.json(cache.data);
    }

    return NextResponse.json(
      { donutBalance: "0x0", sprinklesBalance: "0x0", usdcBalance: "0x0", error: "all_rpcs_failed" },
      { status: 500 }
    );
  }

  // Find results by id
  const donutResult = results.find((r: any) => r.id === 1)?.result || "0x0";
  const sprinklesResult = results.find((r: any) => r.id === 2)?.result || "0x0";
  const usdcResult = results.find((r: any) => r.id === 3)?.result || "0x0";

  const result = {
    donutBalance: donutResult,
    sprinklesBalance: sprinklesResult,
    usdcBalance: BigInt(usdcResult).toString(), // Convert to decimal string for easier handling (6 decimals)
  };

  // Update cache
  cache = {
    data: result,
    timestamp: now,
  };

  return NextResponse.json(result);
}