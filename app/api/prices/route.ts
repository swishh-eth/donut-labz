import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

// Token addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

// LP pair addresses
const DONUT_WETH_LP = "0xd1dbb2e56533c55c3a637d13c53aeef65c5d5703";
const SPRINKLES_DONUT_LP = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668";

// Aerodrome LP ABI
const AERODROME_POOL_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint256", name: "_reserve0", type: "uint256" },
      { internalType: "uint256", name: "_reserve1", type: "uint256" },
      { internalType: "uint256", name: "_blockTimestampLast", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Alchemy RPC
const ALCHEMY_RPC = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

const client = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_RPC),
});

// ============== CACHED PRICES ==============
// Stored in module scope - persists across requests in serverless environments
// Refreshes every 10 minutes

interface CachedPrices {
  ethPrice: number;
  donutPrice: number;
  sprinklesPrice: number;
  sprinklesLpPrice: number;
  lastUpdated: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedPrices: CachedPrices = {
  ethPrice: 3500,      // Reasonable defaults
  donutPrice: 0.10,
  sprinklesPrice: 0.001,
  sprinklesLpPrice: 0.00001,
  lastUpdated: 0,
};

let isRefreshing = false;

async function refreshPrices(): Promise<CachedPrices> {
  if (isRefreshing) {
    return cachedPrices;
  }
  
  isRefreshing = true;
  console.log("[prices] Refreshing cached prices...");
  
  try {
    // 1. Fetch ETH price from CoinGecko
    let ethPrice = cachedPrices.ethPrice;
    try {
      const ethRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        { cache: "no-store" }
      );
      const ethData = await ethRes.json();
      if (ethData.ethereum?.usd) {
        ethPrice = ethData.ethereum.usd;
      }
      console.log("[prices] ETH price:", ethPrice);
    } catch (e) {
      console.error("[prices] CoinGecko error:", e);
    }

    // 2. Fetch DONUT/WETH LP reserves to calculate DONUT price
    let donutPrice = cachedPrices.donutPrice;
    try {
      const [donutWethReserves, donutWethToken0] = await Promise.all([
        client.readContract({
          address: DONUT_WETH_LP as `0x${string}`,
          abi: AERODROME_POOL_ABI,
          functionName: "getReserves",
        }),
        client.readContract({
          address: DONUT_WETH_LP as `0x${string}`,
          abi: AERODROME_POOL_ABI,
          functionName: "token0",
        }),
      ]);

      const [reserve0, reserve1] = donutWethReserves;
      const isDonutToken0 = donutWethToken0.toLowerCase() === DONUT_ADDRESS.toLowerCase();
      const donutReserve = isDonutToken0 ? reserve0 : reserve1;
      const wethReserve = isDonutToken0 ? reserve1 : reserve0;

      const donutReserveNum = Number(formatEther(donutReserve));
      const wethReserveNum = Number(formatEther(wethReserve));
      if (donutReserveNum > 0 && wethReserveNum > 0) {
        donutPrice = (wethReserveNum / donutReserveNum) * ethPrice;
      }
      console.log("[prices] DONUT price:", donutPrice);
    } catch (e) {
      console.error("[prices] DONUT/WETH LP error:", e);
    }

    // 3. Fetch SPRINKLES/DONUT LP reserves
    let sprinklesPrice = cachedPrices.sprinklesPrice;
    let sprinklesLpPrice = cachedPrices.sprinklesLpPrice;
    try {
      const [sprinklesDonutReserves, sprinklesDonutTotalSupply, sprinklesDonutToken0] = await Promise.all([
        client.readContract({
          address: SPRINKLES_DONUT_LP as `0x${string}`,
          abi: AERODROME_POOL_ABI,
          functionName: "getReserves",
        }),
        client.readContract({
          address: SPRINKLES_DONUT_LP as `0x${string}`,
          abi: AERODROME_POOL_ABI,
          functionName: "totalSupply",
        }),
        client.readContract({
          address: SPRINKLES_DONUT_LP as `0x${string}`,
          abi: AERODROME_POOL_ABI,
          functionName: "token0",
        }),
      ]);

      const [reserve0, reserve1] = sprinklesDonutReserves;
      const isSprinklesToken0 = sprinklesDonutToken0.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase();
      const sprinklesReserve = isSprinklesToken0 ? reserve0 : reserve1;
      const donutReserve = isSprinklesToken0 ? reserve1 : reserve0;

      const sprinklesReserveNum = Number(formatEther(sprinklesReserve));
      const donutReserveNum = Number(formatEther(donutReserve));
      
      if (sprinklesReserveNum > 0 && donutReserveNum > 0 && donutPrice > 0) {
        sprinklesPrice = (donutReserveNum / sprinklesReserveNum) * donutPrice;
      }
      console.log("[prices] SPRINKLES price:", sprinklesPrice);

      // LP token price
      const totalSupplyNum = Number(formatEther(sprinklesDonutTotalSupply));
      if (totalSupplyNum > 0 && donutPrice > 0) {
        const sprinklesValueUsd = sprinklesReserveNum * sprinklesPrice;
        const donutValueUsd = donutReserveNum * donutPrice;
        const totalPoolValueUsd = sprinklesValueUsd + donutValueUsd;
        sprinklesLpPrice = totalPoolValueUsd / totalSupplyNum;
      }
      console.log("[prices] LP price:", sprinklesLpPrice);
    } catch (e) {
      console.error("[prices] SPRINKLES/DONUT LP error:", e);
    }

    // Update cache
    cachedPrices = {
      ethPrice,
      donutPrice,
      sprinklesPrice,
      sprinklesLpPrice,
      lastUpdated: Date.now(),
    };
    
    console.log("[prices] Cache updated:", cachedPrices);
    return cachedPrices;
  } finally {
    isRefreshing = false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    const cacheAge = now - cachedPrices.lastUpdated;
    
    // If cache is stale, refresh in background
    if (cacheAge > CACHE_TTL_MS) {
      // Don't await - let it refresh in background
      // But if cache is VERY old (>20min) or never set, wait for refresh
      if (cacheAge > CACHE_TTL_MS * 2 || cachedPrices.lastUpdated === 0) {
        await refreshPrices();
      } else {
        refreshPrices(); // Fire and forget
      }
    }

    // Return cached data immediately
    return NextResponse.json({
      ethPrice: cachedPrices.ethPrice,
      donutPrice: cachedPrices.donutPrice,
      sprinklesPrice: cachedPrices.sprinklesPrice,
      sprinklesLpPrice: cachedPrices.sprinklesLpPrice,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[prices] Error:", error);
    // Return cached data even on error
    return NextResponse.json({
      ethPrice: cachedPrices.ethPrice,
      donutPrice: cachedPrices.donutPrice,
      sprinklesPrice: cachedPrices.sprinklesPrice,
      sprinklesLpPrice: cachedPrices.sprinklesLpPrice,
    });
  }
}