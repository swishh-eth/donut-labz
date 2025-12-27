import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

// Token addresses
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

// LP pair addresses
const DONUT_WETH_LP = "0xd1dbb2e56533c55c3a637d13c53aeef65c5d5703"; // DONUT/WETH Aerodrome
const SPRINKLES_DONUT_LP = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668"; // SPRINKLES/DONUT Aerodrome

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
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Use Alchemy RPC for reliability
const ALCHEMY_RPC = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

const client = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_RPC),
});

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch ETH price from CoinGecko (most reliable for ETH/USD)
    let ethPrice = 0;
    try {
      const ethRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        { next: { revalidate: 60 } }
      );
      const ethData = await ethRes.json();
      ethPrice = ethData.ethereum?.usd || 3500; // Fallback to ~$3500
      console.log("[prices] ETH price from CoinGecko:", ethPrice);
    } catch (e) {
      console.error("[prices] CoinGecko error, using fallback:", e);
      ethPrice = 3500;
    }

    // 2. Fetch DONUT/WETH LP reserves to calculate DONUT price
    let donutPrice = 0;
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

      console.log("[prices] DONUT/WETH reserves - DONUT:", formatEther(donutReserve), "WETH:", formatEther(wethReserve));

      // DONUT price = (WETH reserve / DONUT reserve) * ETH price
      const donutReserveNum = Number(formatEther(donutReserve));
      const wethReserveNum = Number(formatEther(wethReserve));
      if (donutReserveNum > 0 && wethReserveNum > 0) {
        donutPrice = (wethReserveNum / donutReserveNum) * ethPrice;
        console.log("[prices] DONUT price calculated:", donutPrice);
      }
    } catch (e) {
      console.error("[prices] DONUT/WETH LP error:", e);
    }

    // 3. Fetch SPRINKLES/DONUT LP reserves to calculate SPRINKLES price and LP token price
    let sprinklesPrice = 0;
    let sprinklesLpPrice = 0;
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

      console.log("[prices] SPRINKLES/DONUT reserves - SPRINKLES:", formatEther(sprinklesReserve), "DONUT:", formatEther(donutReserve));
      console.log("[prices] SPRINKLES/DONUT LP totalSupply:", formatEther(sprinklesDonutTotalSupply));

      // SPRINKLES price = (DONUT reserve / SPRINKLES reserve) * DONUT price
      const sprinklesReserveNum = Number(formatEther(sprinklesReserve));
      const donutReserveNum = Number(formatEther(donutReserve));
      if (sprinklesReserveNum > 0 && donutReserveNum > 0 && donutPrice > 0) {
        sprinklesPrice = (donutReserveNum / sprinklesReserveNum) * donutPrice;
        console.log("[prices] SPRINKLES price calculated:", sprinklesPrice);
      }

      // LP token price = (total pool value in USD) / (total LP supply)
      const totalSupplyNum = Number(formatEther(sprinklesDonutTotalSupply));
      if (totalSupplyNum > 0 && donutPrice > 0) {
        const sprinklesValueUsd = sprinklesReserveNum * sprinklesPrice;
        const donutValueUsd = donutReserveNum * donutPrice;
        const totalPoolValueUsd = sprinklesValueUsd + donutValueUsd;
        sprinklesLpPrice = totalPoolValueUsd / totalSupplyNum;
        console.log("[prices] LP pool value:", totalPoolValueUsd, "LP price:", sprinklesLpPrice);
      }
    } catch (e) {
      console.error("[prices] SPRINKLES/DONUT LP error:", e);
    }

    const result = {
      ethPrice,
      donutPrice,
      sprinklesPrice,
      sprinklesLpPrice,
    };
    console.log("[prices] Final result:", result);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[prices] Failed to fetch prices:", error);
    return NextResponse.json(
      { ethPrice: 0, donutPrice: 0, sprinklesPrice: 0, sprinklesLpPrice: 0 },
      { status: 500 }
    );
  }
}