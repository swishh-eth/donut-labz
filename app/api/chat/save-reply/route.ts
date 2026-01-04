// app/api/chat/save-reply/route.ts
// Save reply relationship for chat messages - uses pending table like images

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // First try to update directly if the message exists
    const { data: existingMessage } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('transaction_hash', normalizedTxHash)
      .single();

    if (existingMessage) {
      // Message exists, update it directly
      const { error } = await supabase
        .from('chat_messages')
        .update({ reply_to_hash: normalizedReplyToHash })
        .eq('transaction_hash', normalizedTxHash);

      if (error) {
        console.error('[save-reply] Update error:', error);
        return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });
      }
      console.log(`[save-reply] Updated existing message with reply`);
    } else {
      // Message doesn't exist yet, store in pending table
      const { error } = await supabase
        .from('chat_pending_replies')
        .upsert({
          transaction_hash: normalizedTxHash,
          reply_to_hash: normalizedReplyToHash,
          processed: false,
          created_at: new Date().toISOString(),
        }, { onConflict: 'transaction_hash' });

      if (error) {
        console.error('[save-reply] Pending insert error:', error);
        return NextResponse.json({ error: 'Failed to save pending reply' }, { status: 500 });
      }
      console.log(`[save-reply] Stored in pending_replies table`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[save-reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}