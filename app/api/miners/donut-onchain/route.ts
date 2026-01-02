import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, formatEther } from "viem";
import { base } from "viem/chains";

// Donut Miner contract address
const DONUT_MINER_CONTRACT = "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6" as `0x${string}`;

// Mine event from the Miner contract
// event Miner__Mined(address indexed sender, address indexed miner, uint256 price, string uri)
const MINE_EVENT = parseAbiItem(
  "event Miner__Mined(address indexed sender, address indexed miner, uint256 price, string uri)"
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
    const fromBlock = currentBlock - BigInt(43200);

    // Fetch Mine events from the contract
    let logs;
    try {
      logs = await client.getLogs({
        address: DONUT_MINER_CONTRACT,
        event: MINE_EVENT,
        fromBlock: fromBlock > 0n ? fromBlock : 0n,
        toBlock: currentBlock,
      });
    } catch (logError) {
      console.error("Failed to fetch logs:", logError);
      return NextResponse.json({ miners: [], error: "Failed to fetch events" });
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({ miners: [] });
    }

    // Sort by block number descending (most recent first) and limit
    const sortedLogs = logs.sort((a, b) => 
      Number(b.blockNumber) - Number(a.blockNumber)
    ).slice(0, limit);

    // Get block timestamps and format the data
    const miners = await Promise.all(
      sortedLogs.map(async (log) => {
        try {
          const block = await client.getBlock({ blockNumber: log.blockNumber! });
          // The "miner" in the event is who becomes the new miner (recipient)
          const minerAddress = (log.args as any).miner as string;
          const price = (log.args as any).price as bigint;
          const uri = (log.args as any).uri as string || "";
          
          // Price is what they paid in ETH
          const amountPaid = formatEther(price);

          return {
            address: minerAddress.toLowerCase(),
            amount: Number(amountPaid).toFixed(4),
            message: uri,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash,
          };
        } catch (err) {
          console.error("Error processing log:", err);
          return null;
        }
      })
    );

    // Filter out any null entries from errors
    const validMiners = miners.filter((m): m is NonNullable<typeof m> => m !== null);

    // Batch fetch Farcaster profiles for all addresses
    const uniqueAddresses = [...new Set(validMiners.map(m => m.address))];
    const profileMap: Record<string, { fid: number | null; username: string | null; pfpUrl: string | null }> = {};

    if (uniqueAddresses.length > 0 && process.env.NEYNAR_API_KEY) {
      try {
        const neynarRes = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${uniqueAddresses.join(",")}`,
          {
            headers: {
              accept: "application/json",
              "x-api-key": process.env.NEYNAR_API_KEY,
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
    const minersWithProfiles = validMiners.map((miner) => ({
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