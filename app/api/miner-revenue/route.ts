import { NextResponse } from "next/server";

// Sprinkles Miner contract
const MINER_CONTRACT = "0x924b2d4a89b84A37510950031DCDb6552Dc97bcC";

// Mined(address indexed sender, address indexed miner, uint256 price, string uri)
// Topic hash from basescan logs
const MINED_TOPIC = "0xfe3b8c42ad23215a4897b79a6f46cb13a5fd3ec59180693586a33f89c250edae";

const BASE_RPCS = [
  "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g",
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
];

// Blocks per day on Base (~2 second block time)
const BLOCKS_PER_DAY = 43200;
const BLOCKS_PER_WEEK = BLOCKS_PER_DAY * 7;

// Treasury takes 15% of all miner revenue (5% provider fee + 10% burn fee)
const TREASURY_FEE_PERCENT = 0.15;

async function fetchWithFallback(payload: object): Promise<any> {
  for (const rpc of BASE_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.result !== undefined && !data.error) {
        return data;
      }
      console.log(`[miner-revenue] RPC ${rpc} error:`, data.error);
    } catch (e) {
      console.log(`[miner-revenue] RPC ${rpc} failed:`, e);
    }
  }
  throw new Error("All RPCs failed");
}

async function getBlockNumber(): Promise<number> {
  const data = await fetchWithFallback({
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  });
  return parseInt(data.result, 16);
}

async function getLogs(fromBlock: number, toBlock: number): Promise<any[]> {
  try {
    const data = await fetchWithFallback({
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [{
        address: MINER_CONTRACT,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [[MINED_TOPIC]],
      }],
      id: 1,
    });
    
    console.log("[miner-revenue] Topic used:", MINED_TOPIC);
    console.log("[miner-revenue] Block range:", fromBlock, "-", toBlock);
    console.log("[miner-revenue] Logs found:", data.result?.length || 0);
    
    return data.result || [];
  } catch (e) {
    console.error("[miner-revenue] getLogs failed:", e);
    return [];
  }
}

async function getDonutPrice(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=donut&vs_currencies=usd",
      { next: { revalidate: 300 } }
    );
    const data = await response.json();
    return data.donut?.usd || 0.088;
  } catch {
    return 0.088;
  }
}

export async function GET() {
  try {
    const currentBlock = await getBlockNumber();
    const weekAgoBlock = currentBlock - BLOCKS_PER_WEEK;
    const dayAgoBlock = currentBlock - BLOCKS_PER_DAY;
    
    console.log("[miner-revenue] Current block:", currentBlock);
    
    // Fetch Mined events for the past week
    const minedLogs = await getLogs(weekAgoBlock, currentBlock);
    
    // Calculate totals from Mined events
    // Mined event data layout: price (uint256), uri offset, uri length, uri data
    // Price is the first 32 bytes of data
    let weeklyTotalPrice = 0n;
    let dailyTotalPrice = 0n;
    let weeklyMineCount = 0;
    let dailyMineCount = 0;
    
    for (const log of minedLogs) {
      // Price is in the first 32 bytes of data (64 hex chars after 0x)
      const priceHex = log.data.slice(0, 66); // 0x + 64 chars
      const price = BigInt(priceHex);
      const blockNumber = parseInt(log.blockNumber, 16);
      
      weeklyTotalPrice += price;
      weeklyMineCount++;
      
      if (blockNumber >= dayAgoBlock) {
        dailyTotalPrice += price;
        dailyMineCount++;
      }
    }
    
    // Calculate treasury's 15% cut
    const weeklyTreasuryDonut = Number(weeklyTotalPrice) / 1e18 * TREASURY_FEE_PERCENT;
    const dailyTreasuryDonut = Number(dailyTotalPrice) / 1e18 * TREASURY_FEE_PERCENT;
    
    // Total volume
    const weeklyVolumeDonut = Number(weeklyTotalPrice) / 1e18;
    const dailyVolumeDonut = Number(dailyTotalPrice) / 1e18;
    
    // Get DONUT price
    const donutPrice = await getDonutPrice();
    
    // Calculate USD values
    const weeklyTreasuryUsd = weeklyTreasuryDonut * donutPrice;
    const dailyTreasuryUsd = dailyTreasuryDonut * donutPrice;
    const weeklyVolumeUsd = weeklyVolumeDonut * donutPrice;
    const dailyVolumeUsd = dailyVolumeDonut * donutPrice;
    
    console.log("[miner-revenue] Weekly mines:", weeklyMineCount);
    console.log("[miner-revenue] Weekly volume:", weeklyVolumeDonut, "DONUT");
    console.log("[miner-revenue] Weekly treasury:", weeklyTreasuryDonut, "DONUT");
    
    return NextResponse.json({
      // Treasury revenue (15% cut)
      weeklyDonut: weeklyTreasuryDonut,
      dailyDonut: dailyTreasuryDonut,
      weeklyUsd: weeklyTreasuryUsd,
      dailyUsd: dailyTreasuryUsd,
      // Total miner volume
      weeklyVolumeDonut,
      dailyVolumeDonut,
      weeklyVolumeUsd,
      dailyVolumeUsd,
      // Stats
      weeklyMineCount,
      dailyMineCount,
      donutPrice,
      // Debug info
      debug: {
        topic: MINED_TOPIC,
        currentBlock,
        weekAgoBlock,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[miner-revenue] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch miner revenue",
        message: error instanceof Error ? error.message : "Unknown error",
        weeklyDonut: 0,
        dailyDonut: 0,
        weeklyUsd: 0,
        dailyUsd: 0,
        weeklyVolumeDonut: 0,
        dailyVolumeDonut: 0,
        weeklyVolumeUsd: 0,
        dailyVolumeUsd: 0,
        weeklyMineCount: 0,
        dailyMineCount: 0,
      },
      { status: 500 }
    );
  }
}