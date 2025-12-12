// app/api/lp-price/route.ts
import { NextResponse } from "next/server";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

const SPRINKLES_LP_TOKEN = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668";
const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_TOKEN = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

const ERC20_ABI = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aerodrome pool ABI for getting reserves
const POOL_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { name: "_reserve0", type: "uint256" },
      { name: "_reserve1", type: "uint256" },
      { name: "_blockTimestampLast", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET() {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
    });

    // Get pool data
    const [reserves, token0, token1, totalSupply] = await Promise.all([
      client.readContract({
        address: SPRINKLES_LP_TOKEN as `0x${string}`,
        abi: POOL_ABI,
        functionName: "getReserves",
      }),
      client.readContract({
        address: SPRINKLES_LP_TOKEN as `0x${string}`,
        abi: POOL_ABI,
        functionName: "token0",
      }),
      client.readContract({
        address: SPRINKLES_LP_TOKEN as `0x${string}`,
        abi: POOL_ABI,
        functionName: "token1",
      }),
      client.readContract({
        address: SPRINKLES_LP_TOKEN as `0x${string}`,
        abi: POOL_ABI,
        functionName: "totalSupply",
      }),
    ]);

    // Determine which reserve is DONUT
    const isToken0Donut = token0.toLowerCase() === DONUT_TOKEN.toLowerCase();
    const donutReserve = isToken0Donut ? reserves[0] : reserves[1];
    const sprinklesReserve = isToken0Donut ? reserves[1] : reserves[0];

    // Get DONUT price from our prices API
    const pricesRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/prices`);
    const pricesData = await pricesRes.json();
    const donutPrice = pricesData.donutPrice || 0;

    // Calculate LP token price
    // LP value = (DONUT reserve × DONUT price × 2) / Total LP supply
    // We multiply by 2 because LP represents both sides, but since SPRINKLES ≈ $0,
    // the DONUT side is essentially all the value. However, for accuracy we use the actual formula.
    const donutReserveNum = Number(formatEther(donutReserve));
    const totalSupplyNum = Number(formatEther(totalSupply));
    
    // Total pool value = DONUT value + SPRINKLES value (≈0)
    const poolValueUsd = donutReserveNum * donutPrice * 2; // ×2 for both sides
    const lpTokenPrice = totalSupplyNum > 0 ? poolValueUsd / totalSupplyNum : 0;

    return NextResponse.json({
      lpTokenPrice,
      donutReserve: formatEther(donutReserve),
      sprinklesReserve: formatEther(sprinklesReserve),
      totalSupply: formatEther(totalSupply),
      donutPrice,
      poolValueUsd,
      token0,
      token1,
    });
  } catch (error: any) {
    console.error("Error fetching LP price:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch LP price" },
      { status: 500 }
    );
  }
}