import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GLAZERY_CHAT_ADDRESS = "0x543832Fe5EFB216a79f64BE52A24547D6d875685";
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
      const txHash = log.transactionHash;
      
      // Check if message already exists with an image_url
      const { data: existingMessage } = await supabase
        .from("chat_messages")
        .select("image_url, reply_to_hash")
        .eq("transaction_hash", txHash)
        .single();
      
      // Check if there's a pending image for this transaction
      const { data: pendingImage } = await supabase
        .from("chat_pending_images")
        .select("image_url")
        .eq("transaction_hash", txHash)
        .eq("processed", false)
        .single();

      // Check if there's a pending reply for this transaction
      const { data: pendingReply } = await supabase
        .from("chat_pending_replies")
        .select("reply_to_hash")
        .eq("transaction_hash", txHash)
        .eq("processed", false)
        .single();

      // Determine the image_url to use (preserve existing, or use pending)
      const imageUrl = existingMessage?.image_url || pendingImage?.image_url || null;
      // Determine the reply_to_hash to use (preserve existing, or use pending)
      const replyToHash = existingMessage?.reply_to_hash || pendingReply?.reply_to_hash || null;

      await supabase
        .from("chat_messages")
        .upsert({
          sender: (log.args.sender as string).toLowerCase(),
          message: log.args.message as string,
          timestamp: Number(log.args.timestamp),
          transaction_hash: txHash,
          block_number: Number(log.blockNumber),
          image_url: imageUrl,
          reply_to_hash: replyToHash,
        }, { onConflict: "transaction_hash" });

      // Mark pending image as processed
      if (pendingImage) {
        await supabase
          .from("chat_pending_images")
          .update({ processed: true })
          .eq("transaction_hash", txHash);
      }

      // Mark pending reply as processed
      if (pendingReply) {
        await supabase
          .from("chat_pending_replies")
          .update({ processed: true })
          .eq("transaction_hash", txHash);
      }
    }

    return logs.length;
  } catch (e) {
    console.error("Sync error:", e);
    return 0;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get("sync") === "true";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (sync) {
      await syncRecentMessages();
    }

    // Fetch last N messages, ordered by timestamp ascending (oldest first, newest at bottom)
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("sender, message, timestamp, transaction_hash, block_number, is_system_message, image_url, reply_to_hash")
      .order("timestamp", { ascending: false })
      .limit(Math.min(limit, 100)); // Cap at 100 max

    if (error) throw error;

    // Fetch recent airdrops to mark which messages received tips
    const { data: airdrops } = await supabase
      .from("chat_image_airdrops")
      .select("recipient_message_hash, amount")
      .order("created_at", { ascending: false })
      .limit(200);

    // Create a map of message hashes that received airdrops
    const airdropMap = new Map<string, number>();
    for (const airdrop of airdrops || []) {
      if (airdrop.recipient_message_hash) {
        const hash = airdrop.recipient_message_hash.toLowerCase();
        airdropMap.set(hash, (airdropMap.get(hash) || 0) + parseInt(airdrop.amount || '1'));
      }
    }

    // Add airdrop info to messages
    const messagesWithAirdrops = (messages || []).map(msg => ({
      ...msg,
      airdrop_amount: airdropMap.get(msg.transaction_hash?.toLowerCase()) || 0,
    }));

    // Reverse to get oldest first (so newest appears at bottom when rendered)
    const sortedMessages = messagesWithAirdrops.reverse();

    return NextResponse.json({ messages: sortedMessages });
  } catch (e) {
    console.error("Error fetching messages:", e);
    return NextResponse.json({ messages: [] });
  }
}