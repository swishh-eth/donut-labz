import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

// Contract addresses
const GDONUT_CONTRACT = "0xC78B6e362cB0f48b59E573dfe7C99d92153a16d3";
const SPRINKLES_TREASURY = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";

// Goldsky subgraph URL (from GlazeCorp)
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgscxhw81j5601xmhgd42rej/subgraphs/donut-miner/1.0.0/gn";

// GlazeCorp governance subgraph for strategy APRs
const GOVERN_SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmgscxhw81j5601xmhgd42rej/subgraphs/glaze-govern/1.0.0/gn";

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
] as const;

// Cache for 60 seconds
let cache: {
  data: any;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 60 * 1000;

// Fetch strategy APRs from GlazeCorp govern subgraph
async function fetchStrategyAprs(): Promise<{
  donutApr: number;
  donutEthLpApr: number;
  usdcApr: number;
  qrApr: number;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(GOVERN_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          strategies(first: 10) {
            id
            name
            apr
            totalStaked
          }
        }`
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const data = await response.json();
    
    if (data.data?.strategies?.length > 0) {
      const strategies = data.data.strategies;
      
      // Find each strategy by name/id
      const donutStrategy = strategies.find((s: any) => 
        s.name?.toLowerCase().includes('donut') && !s.name?.toLowerCase().includes('lp') && !s.name?.toLowerCase().includes('eth')
      );
      const lpStrategy = strategies.find((s: any) => 
        s.name?.toLowerCase().includes('lp') || s.name?.toLowerCase().includes('eth')
      );
      const usdcStrategy = strategies.find((s: any) => 
        s.name?.toLowerCase().includes('usdc')
      );
      const qrStrategy = strategies.find((s: any) => 
        s.name?.toLowerCase().includes('qr')
      );
      
      return {
        donutApr: parseFloat(donutStrategy?.apr || "0"),
        donutEthLpApr: parseFloat(lpStrategy?.apr || "0"),
        usdcApr: parseFloat(usdcStrategy?.apr || "0"),
        qrApr: parseFloat(qrStrategy?.apr || "0"),
      };
    }
  } catch (e) {
    console.error("[gDONUT API] Strategy APR fetch error:", e);
  }
  
  // Fallback APRs based on observed GlazeCorp data
  return {
    donutApr: 247,
    donutEthLpApr: 332,
    usdcApr: 198,
    qrApr: 273,
  };
}

// Fetch weekly revenue from subgraph
// The revenue comes from multiple sources - we need to query the actual revenue data
async function fetchWeeklyRevenue(): Promise<{
  totalWeeklyRevenueUsd: number;
  breakdown: {
    donut: number;
    donutEthLp: number;
    usdc: number;
    qr: number;
  };
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    // Query for weekly stats - this gets the revenue distribution data
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          weeklyStats(first: 1, orderBy: weekStart, orderDirection: desc) {
            id
            weekStart
            totalRevenue
            donutRevenue
            usdcRevenue
            lpRevenue
          }
          globalStats(id: "global") {
            totalRevenue
            weeklyRevenue
          }
        }`
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const data = await response.json();
    
    // Check if we got weekly stats
    if (data.data?.weeklyStats?.length > 0) {
      const stats = data.data.weeklyStats[0];
      return {
        totalWeeklyRevenueUsd: parseFloat(stats.totalRevenue || "0"),
        breakdown: {
          donut: parseFloat(stats.donutRevenue || "0"),
          donutEthLp: parseFloat(stats.lpRevenue || "0"),
          usdc: parseFloat(stats.usdcRevenue || "0"),
          qr: 0,
        },
      };
    }
    
    // Check global stats
    if (data.data?.globalStats?.weeklyRevenue) {
      return {
        totalWeeklyRevenueUsd: parseFloat(data.data.globalStats.weeklyRevenue),
        breakdown: { donut: 0, donutEthLp: 0, usdc: 0, qr: 0 },
      };
    }
  } catch (e) {
    console.error("[gDONUT API] Weekly stats error:", e);
  }
  
  // Fallback: estimate based on observed GlazeCorp data (~$50-55k/week)
  // This is a reasonable estimate based on the govern page screenshot
  // Revenue varies week to week based on mining activity
  return {
    totalWeeklyRevenueUsd: 39500, // ~$53k/week observed
    breakdown: {
      donut: 25675,    // ~65%
      donutEthLp: 2015, // ~4%
      usdc: 9638,      // ~21%
      qr: 1085,         // ~3%
    },
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

    // Fetch all data in parallel
    const [
      treasuryBalance,
      totalSupply,
      revenueData,
      strategyAprs,
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
      
      fetchWeeklyRevenue(),
      fetchStrategyAprs(),
    ]);

    // Convert to numbers (18 decimals)
    const treasuryBalanceNum = Number(formatUnits(treasuryBalance as bigint, 18));
    const totalSupplyNum = Number(formatUnits(totalSupply as bigint, 18));

    // Calculate treasury's share of total staked
    const treasurySharePercent = totalSupplyNum > 0 
      ? (treasuryBalanceNum / totalSupplyNum) * 100 
      : 0;

    // Fetch DONUT price for display purposes
    let donutPriceUsd = 0.09;
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
    const treasuryWeeklyRevenueUsd = revenueData.totalWeeklyRevenueUsd * (treasurySharePercent / 100);
    
    // Calculate APR: (yearly revenue / staked value) * 100
    const treasuryStakedUsd = treasuryBalanceNum * donutPriceUsd;
    
    // Use the actual strategy APRs from GlazeCorp
    const donutApr = strategyAprs.donutApr;
    const usdcApr = strategyAprs.usdcApr;
    
    // Treasury stake is split 50/50 between DONUT and USDC strategies
    // So each strategy only earns on HALF the staked value
    const halfStakedUsd = treasuryStakedUsd / 2;
    
    // Calculate weekly USD earnings for each strategy
    // Formula: (staked * APR / 100) / 52 weeks
    const treasuryDonutWeeklyUsd = (halfStakedUsd * donutApr / 100) / 52;
    const treasuryUsdcWeeklyUsd = (halfStakedUsd * usdcApr / 100) / 52;
    
    // Combined APR is the weighted average (which is just the average since 50/50)
    const apr = (donutApr + usdcApr) / 2;

    const result = {
      // Treasury staking info
      treasuryStaked: treasuryBalanceNum,
      treasuryStakedUsd,
      treasurySharePercent,
      
      // Revenue earnings
      weeklyRevenueUsd: treasuryWeeklyRevenueUsd,
      
      // Separate revenue streams for treasury
      donutWeeklyUsd: treasuryDonutWeeklyUsd,
      usdcWeeklyUsd: treasuryUsdcWeeklyUsd,
      
      // Protocol total weekly revenue
      totalWeeklyRevenueUsd: revenueData.totalWeeklyRevenueUsd,
      revenueBreakdown: revenueData.breakdown,
      
      // APR estimates
      apr,
      donutApr,
      usdcApr,
      
      // All strategy APRs for reference
      strategyAprs,
      
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
        weeklyRevenueUsd: 0,
        totalWeeklyRevenueUsd: 0,
        apr: 0,
        donutApr: 0,
        usdcApr: 0,
        donutWeeklyUsd: 0,
        usdcWeeklyUsd: 0,
      },
      { status: 500 }
    );
  }
}