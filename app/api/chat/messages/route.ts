import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GLAZERY_CHAT_ADDRESS = "0x2fA4E51741DF5049D2f8c82CC51a6d3a8bbD60bf";
const CACHE_DURATION_HOURS = 12;
const SYNC_BLOCKS = 300n;

const baseClient = createPublicClient({
  chain: base,
  transport: http("https://base.publicnode.com"),
});

async function syncRecentMessages() {
  try {
    const currentBlock = await baseClient.getBlockNumber();
    const fromBlock = currentBlock - SYNC_BLOCKS;

    const logs = await baseClient.getLogs({
      address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
      event: parseAbiItem("event MessageSent(address indexed sender, string message, uint256 timestamp)"),
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of logs) {
      await supabase
        .from("chat_messages")
        .upsert({
          sender: (log.args.sender as string).toLowerCase(),
          message: log.args.message as string,
          timestamp: Number(log.args.timestamp),
          transaction_hash: log.transactionHash,
          block_number: Number(log.blockNumber),
        }, { onConflict: "transaction_hash" });
    }

    return logs.length;
  } catch (e) {
    console.error("Sync error:", e);
    return 0;
  }
}

async function cleanupOldMessages() {
  const twelveHoursAgo = Math.floor(Date.now() / 1000) - (CACHE_DURATION_HOURS * 60 * 60);
  await supabase
    .from("chat_messages")
    .delete()
    .lt("timestamp", twelveHoursAgo);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get("sync") === "true";

    if (sync) {
      await syncRecentMessages();
      await cleanupOldMessages();
    }

    const twelveHoursAgo = Math.floor(Date.now() / 1000) - (CACHE_DURATION_HOURS * 60 * 60);
    
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("*")
      .gte("timestamp", twelveHoursAgo)
      .order("timestamp", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ messages: messages || [] });
  } catch (e) {
    console.error("Error fetching messages:", e);
    return NextResponse.json({ messages: [] });
  }
}