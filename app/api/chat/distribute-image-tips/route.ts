// app/api/chat/distribute-image-tips/route.ts
// Distributes 1 SPRINKLES each to the last 10 UNIQUE chatters when an image is uploaded
// FIXED: Now finds 10 unique addresses even if we need to look further back in history

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPRINKLES_ADDRESS = '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D';
const AMOUNT_PER_CHATTER = parseUnits('1', 18); // 1 SPRINKLES each
const TARGET_UNIQUE_CHATTERS = 10;

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const { triggerTxHash, senderAddress } = await request.json();

    if (!triggerTxHash) {
      return NextResponse.json({ error: 'Missing triggerTxHash' }, { status: 400 });
    }

    console.log(`[distribute-image-tips] Starting distribution for tx: ${triggerTxHash}`);

    // Check if this tx has already been processed
    const { data: existing } = await supabase
      .from('chat_image_airdrops')
      .select('id')
      .eq('trigger_tx_hash', triggerTxHash.toLowerCase())
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[distribute-image-tips] Already processed tx: ${triggerTxHash}`);
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    // Get the private key from environment
    const privateKey = process.env.CHAT_BOT_PRIVATE_KEY;
    if (!privateKey) {
      console.error('[distribute-image-tips] Missing CHAT_BOT_PRIVATE_KEY');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Create wallet client
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g'),
    });

    // Find 10 UNIQUE chatters by fetching in batches until we have enough
    const senderLower = senderAddress?.toLowerCase();
    const uniqueChatters: { address: string; messageHash: string }[] = [];
    const seen = new Set<string>();
    
    let offset = 0;
    const batchSize = 50;
    const maxIterations = 20; // Safety limit: max 1000 messages to scan
    
    for (let i = 0; i < maxIterations && uniqueChatters.length < TARGET_UNIQUE_CHATTERS; i++) {
      const { data: messages, error: msgError } = await supabase
        .from('chat_messages')
        .select('sender, transaction_hash')
        .order('timestamp', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (msgError) {
        console.error('[distribute-image-tips] Failed to fetch messages:', msgError);
        break;
      }

      if (!messages || messages.length === 0) {
        console.log(`[distribute-image-tips] No more messages to scan at offset ${offset}`);
        break;
      }

      for (const msg of messages) {
        const sender = msg.sender.toLowerCase();
        
        // Skip if it's the image uploader or already seen
        if (sender === senderLower || seen.has(sender)) {
          continue;
        }
        
        seen.add(sender);
        uniqueChatters.push({
          address: sender,
          messageHash: msg.transaction_hash,
        });
        
        if (uniqueChatters.length >= TARGET_UNIQUE_CHATTERS) {
          break;
        }
      }

      offset += batchSize;
    }

    console.log(`[distribute-image-tips] Found ${uniqueChatters.length} unique chatters to tip (scanned ${offset} messages)`);

    if (uniqueChatters.length === 0) {
      return NextResponse.json({ success: true, distributed: 0, message: 'No chatters to tip' });
    }

    // Send 1 SPRINKLES to each chatter
    const results: { address: string; txHash: string | null; success: boolean }[] = [];
    
    for (const chatter of uniqueChatters) {
      try {
        const hash = await walletClient.writeContract({
          address: SPRINKLES_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [chatter.address as `0x${string}`, AMOUNT_PER_CHATTER],
        });

        console.log(`[distribute-image-tips] Sent to ${chatter.address}: ${hash}`);

        // Record the airdrop
        await supabase
          .from('chat_image_airdrops')
          .insert({
            trigger_tx_hash: triggerTxHash.toLowerCase(),
            recipient_address: chatter.address,
            recipient_message_hash: chatter.messageHash,
            recipient_tx_hash: hash,
            amount: '1',
            created_at: new Date().toISOString(),
          });

        results.push({ address: chatter.address, txHash: hash, success: true });

        // Small delay between transactions to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`[distribute-image-tips] Failed to send to ${chatter.address}:`, e);
        results.push({ address: chatter.address, txHash: null, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[distribute-image-tips] Distributed to ${successCount}/${uniqueChatters.length} chatters`);

    return NextResponse.json({ 
      success: true, 
      distributed: successCount,
      total: uniqueChatters.length,
      results 
    });

  } catch (error) {
    console.error('[distribute-image-tips] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}