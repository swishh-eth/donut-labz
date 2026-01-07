import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

// Contract addresses
const GDONUT_CONTRACT = "0xC78B6e362cB0f48b59E573dfe7C99d92153a16d3";
const SPRINKLES_TREASURY = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
const DONUT_CONTRACT = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";

// Goldsky subgraph URL (from GlazeCorp)
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgscxhw81j5601xmhgd42rej/subgraphs/donut-miner/1.0.0/gn";

// gDONUT Governance Token ABI
const GDONUT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// Cache for 60 seconds
let cache: {
  data: any;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 60 * 1000;

// Fetch revenue estimate from subgraph (same logic as GlazeCorp)
async function fetchRevenueEstimate(): Promise<{
  latestGlazeSpent: number;
  revenuePerGlaze: number;
  dailyRevenue: number;
  weeklyRevenue: number;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          glazes(first: 1, orderBy: startTime, orderDirection: desc) {
            id
            spent
            startTime
          }
        }`
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const data = await response.json();
    
    if (data.data?.glazes?.length > 0) {
      const latestGlazeSpent = parseFloat(data.data.glazes[0].spent);
      const revenuePerGlaze = latestGlazeSpent * 0.15; // 15% fee
      const dailyRevenue = 48 * revenuePerGlaze; // ~48 glazes per day estimate
      const weeklyRevenue = dailyRevenue * 7;
      
      return { latestGlazeSpent, revenuePerGlaze, dailyRevenue, weeklyRevenue };
    }
  } catch (e) {
    console.error("[gDONUT API] Revenue estimate error:", e);
  }
  
  // Fallback values
  return {
    latestGlazeSpent: 0.1,
    revenuePerGlaze: 0.015,
    dailyRevenue: 0.72,
    weeklyRevenue: 5.04,
  };
}

export async function GET() {
  try {
    // Check cache
    if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
      return NextResponse.json(cache.data);
    }

    const client = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    // Fetch contract data and revenue in parallel
    const [
      treasuryBalance,
      totalSupply,
      decimals,
      revenueEstimate,
    ] = await Promise.all([
      client.readContract({
        address: GDONUT_CONTRACT as `0x${string}`,
        abi: GDONUT_ABI,
        functionName: "balanceOf",
        args: [SPRINKLES_TREASURY as `0x${string}`],
      }).catch(() => BigInt(0)),
      
      client.readContract({
        address: GDONUT_CONTRACT as `0x${string}`,
        abi: GDONUT_ABI,
        functionName: "totalSupply",
      }).catch(() => BigInt(0)),
      
      client.readContract({
        address: GDONUT_CONTRACT as `0x${string}`,
        abi: GDONUT_ABI,
        functionName: "decimals",
      }).catch(() => 18),
      
      fetchRevenueEstimate(),
    ]);

    // Convert to numbers
    const dec = Number(decimals);
    const treasuryBalanceNum = Number(formatUnits(treasuryBalance as bigint, dec));
    const totalSupplyNum = Number(formatUnits(totalSupply as bigint, dec));

    // Calculate treasury's share of total staked
    const treasurySharePercent = totalSupplyNum > 0 ? (treasuryBalanceNum / totalSupplyNum) * 100 : 0;

    // Fetch DONUT price
    let donutPriceUsd = 0.35;
    
    try {
      const priceResponse = await fetch(
        "https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=0xAE4a37d554C6D6F3E398546d8566B25052e0169C&vs_currencies=usd",
        { next: { revalidate: 300 } }
      );
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        const price = priceData["0xae4a37d554c6d6f3e398546d8566b25052e0169c"]?.usd;
        if (price) donutPriceUsd = price;
      }
    } catch (e) {
      console.log("[gDONUT API] Failed to fetch DONUT price, using fallback");
    }

    // Calculate treasury's share of weekly revenue
    // Revenue is distributed proportionally to vote weight (gDONUT balance)
    const treasuryWeeklyRevenue = revenueEstimate.weeklyRevenue * (treasurySharePercent / 100);
    const treasuryWeeklyRevenueUsd = treasuryWeeklyRevenue * donutPriceUsd;
    
    // Calculate estimated APR based on weekly revenue
    // APR = (yearly earnings / staked amount) * 100
    const yearlyRevenue = treasuryWeeklyRevenue * 52;
    const apr = treasuryBalanceNum > 0 ? (yearlyRevenue / treasuryBalanceNum) * 100 : 0;

    const result = {
      // Treasury staking info
      treasuryStaked: treasuryBalanceNum,
      treasuryStakedUsd: treasuryBalanceNum * donutPriceUsd,
      treasurySharePercent,
      
      // Revenue earnings
      weeklyRevenue: treasuryWeeklyRevenue,
      weeklyRevenueUsd: treasuryWeeklyRevenueUsd,
      
      // Global weekly revenue (total protocol)
      totalWeeklyRevenue: revenueEstimate.weeklyRevenue,
      totalWeeklyRevenueUsd: revenueEstimate.weeklyRevenue * donutPriceUsd,
      
      // APR estimate
      apr,
      
      // Global stats
      totalStaked: totalSupplyNum,
      totalStakedUsd: totalSupplyNum * donutPriceUsd,
      
      // Price
      donutPriceUsd,
      
      // Timestamp
      lastUpdated: Date.now(),
    };

    // Update cache
    cache = {
      data: result,
      timestamp: Date.now(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[gDONUT API] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch staking data",
        treasuryStaked: 0,
        treasurySharePercent: 0,
        totalStaked: 0,
        weeklyRevenue: 0,
        apr: 0,
      },
      { status: 500 }
    );
  }
}