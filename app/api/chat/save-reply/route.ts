// app/api/chat/save-reply/route.ts
// Save reply relationship for chat messages - uses pending table like images

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const { transactionHash, replyToHash } = await request.json();

    if (!transactionHash || !replyToHash) {
      return NextResponse.json(
        { error: 'Missing transactionHash or replyToHash' },
        { status: 400 }
      );
    }

    const normalizedTxHash = transactionHash.toLowerCase();
    const normalizedReplyToHash = replyToHash.toLowerCase();

    console.log(`[save-reply] Saving reply: ${normalizedTxHash} -> ${normalizedReplyToHash}`);

    // Always store in pending table first (in case message doesn't exist yet)
    await supabase
      .from('chat_pending_replies')
      .upsert({
        transaction_hash: normalizedTxHash,
        reply_to_hash: normalizedReplyToHash,
        processed: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'transaction_hash' });

    console.log(`[save-reply] Stored in pending_replies table`);

    // Also try to update directly if message exists (retry a few times)
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existingMessage } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('transaction_hash', normalizedTxHash)
        .single();

      if (existingMessage) {
        const { error } = await supabase
          .from('chat_messages')
          .update({ reply_to_hash: normalizedReplyToHash })
          .eq('transaction_hash', normalizedTxHash);

        if (!error) {
          // Mark pending as processed
          await supabase
            .from('chat_pending_replies')
            .update({ processed: true })
            .eq('transaction_hash', normalizedTxHash);
          
          console.log(`[save-reply] Direct update succeeded on attempt ${attempt + 1}`);
          return NextResponse.json({ success: true, direct: true });
        }
      }
      
      // Wait before retry
      if (attempt < 2) {
        await sleep(1000);
      }
    }

    console.log(`[save-reply] Message not found yet, pending reply will be picked up by sync`);
    return NextResponse.json({ success: true, pending: true });

  } catch (error) {
    console.error('[save-reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}