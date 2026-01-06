// app/api/chat/distribute-image-tips/route.ts
// Distributes 1 SPRINKLES each to the last 10 chatters when an image is uploaded
// NOT unique - same person can receive multiple if they sent multiple recent messages

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createWalletClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPRINKLES_ADDRESS = '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D';
const AMOUNT_PER_CHATTER = parseUnits('1', 18); // 1 SPRINKLES each
const TARGET_CHATTERS = 10;

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

    // Get the last 10 messages (excluding the image uploader)
    // NOT unique - same person can receive multiple airdrops
    const senderLower = senderAddress?.toLowerCase();
    
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('sender, transaction_hash')
      .order('timestamp', { ascending: false })
      .limit(50); // Fetch more to filter out the sender

    if (msgError) {
      console.error('[distribute-image-tips] Failed to fetch messages:', msgError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, distributed: 0, message: 'No chatters to tip' });
    }

    // Filter out the image uploader and take first 10
    const chattersToTip: { address: string; messageHash: string }[] = [];
    
    for (const msg of messages) {
      const sender = msg.sender.toLowerCase();
      
      // Skip if it's the image uploader
      if (sender === senderLower) {
        continue;
      }
      
      chattersToTip.push({
        address: sender,
        messageHash: msg.transaction_hash,
      });
      
      if (chattersToTip.length >= TARGET_CHATTERS) {
        break;
      }
    }

    console.log(`[distribute-image-tips] Found ${chattersToTip.length} chatters to tip`);

    if (chattersToTip.length === 0) {
      return NextResponse.json({ success: true, distributed: 0, message: 'No chatters to tip' });
    }

    // Send 1 SPRINKLES to each chatter
    const results: { address: string; txHash: string | null; success: boolean }[] = [];
    
    for (const chatter of chattersToTip) {
      try {
        const hash = await walletClient.writeContract({
          address: SPRINKLES_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [chatter.address as `0x${string}`, AMOUNT_PER_CHATTER],
        });

        console.log(`[distribute-image-tips] Sent to ${chatter.address}: ${hash}`);

        // Record the airdrop in the airdrops table
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

        // Update airdrop_amount on the chat message so UI can display it
        // First get current amount, then increment
        const { data: currentMsg } = await supabase
          .from('chat_messages')
          .select('airdrop_amount')
          .eq('transaction_hash', chatter.messageHash)
          .single();

        const currentAmount = currentMsg?.airdrop_amount || 0;
        
        const { error: updateError } = await supabase
          .from('chat_messages')
          .update({ airdrop_amount: currentAmount + 1 })
          .eq('transaction_hash', chatter.messageHash);

        if (updateError) {
          console.error(`[distribute-image-tips] Failed to update airdrop_amount for message ${chatter.messageHash}:`, updateError);
        } else {
          console.log(`[distribute-image-tips] Updated airdrop_amount to ${currentAmount + 1} for message ${chatter.messageHash}`);
        }

        results.push({ address: chatter.address, txHash: hash, success: true });

        // Small delay between transactions to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`[distribute-image-tips] Failed to send to ${chatter.address}:`, e);
        results.push({ address: chatter.address, txHash: null, success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[distribute-image-tips] Distributed to ${successCount}/${chattersToTip.length} chatters`);

    return NextResponse.json({ 
      success: true, 
      distributed: successCount,
      total: chattersToTip.length,
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