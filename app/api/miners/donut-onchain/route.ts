import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, formatEther } from "viem";
import { base } from "viem/chains";

// The donut miner contract address - update this to match your CONTRACT_ADDRESSES.multicall or the actual miner contract
const DONUT_MINER_CONTRACT = "0x..." as `0x${string}`; // UPDATE THIS

// Mine event signature - adjust based on your contract's actual event
// Common patterns: Mine(address indexed miner, uint256 price, string uri)
const MINE_EVENT = parseAbiItem(
  "event Mine(address indexed miner, address indexed prev, uint256 price, string uri)"
);

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get the current block
    const currentBlock = await client.getBlockNumber();
    
    // Look back ~24 hours of blocks (Base has ~2 second blocks, so ~43200 blocks per day)
    // Adjust this based on how far back you want to look
    const fromBlock = currentBlock - BigInt(43200);

    // Fetch Mine events from the contract
    const logs = await client.getLogs({
      address: DONUT_MINER_CONTRACT,
      event: MINE_EVENT,
      fromBlock: fromBlock > 0n ? fromBlock : 0n,
      toBlock: currentBlock,
    });

    // Sort by block number descending (most recent first) and limit
    const sortedLogs = logs.sort((a, b) => 
      Number(b.blockNumber) - Number(a.blockNumber)
    ).slice(0, limit);

    // Get block timestamps and format the data
    const miners = await Promise.all(
      sortedLogs.map(async (log) => {
        const block = await client.getBlock({ blockNumber: log.blockNumber! });
        const address = log.args.miner as string;
        const price = log.args.price as bigint;
        const uri = log.args.uri as string || "";
        
        // The amount paid is typically price / 2 based on your contract logic
        const amountPaid = formatEther(price / 2n);

        return {
          address: address.toLowerCase(),
          amount: Number(amountPaid).toFixed(4),
          message: uri,
          timestamp: Number(block.timestamp),
          txHash: log.transactionHash,
        };
      })
    );

    // Batch fetch Farcaster profiles for all addresses
    const uniqueAddresses = [...new Set(miners.map(m => m.address))];
    const profileMap: Record<string, { fid: number | null; username: string | null; pfpUrl: string | null }> = {};

    if (uniqueAddresses.length > 0) {
      try {
        const neynarRes = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${uniqueAddresses.join(",")}`,
          {
            headers: {
              accept: "application/json",
              "x-api-key": process.env.NEYNAR_API_KEY || "",
            },
          }
        );

        if (neynarRes.ok) {
          const neynarData = await neynarRes.json();
          for (const addr of uniqueAddresses) {
            const users = neynarData[addr];
            if (users && users.length > 0) {
              const user = users[0];
              profileMap[addr] = {
                fid: user.fid || null,
                username: user.username || null,
                pfpUrl: user.pfp_url || null,
              };
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch Neynar profiles:", err);
      }
    }

    // Combine miners with profile data
    const minersWithProfiles = miners.map((miner) => ({
      ...miner,
      fid: profileMap[miner.address]?.fid || null,
      username: profileMap[miner.address]?.username || null,
      pfpUrl: profileMap[miner.address]?.pfpUrl || null,
    }));

    return NextResponse.json({ miners: minersWithProfiles });
  } catch (error) {
    console.error("Error fetching on-chain miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners", miners: [] },
      { status: 500 }
    );
  }
}