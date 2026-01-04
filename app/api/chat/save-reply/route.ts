// app/api/chat/save-reply/route.ts
// Save reply relationship for chat messages

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

    // Update the message with the reply_to_hash
    const { error } = await supabase
      .from('chat_messages')
      .update({ reply_to_hash: normalizedReplyToHash })
      .eq('transaction_hash', normalizedTxHash);

    if (error) {
      console.error('[save-reply] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to save reply' },
        { status: 500 }
      );
    }

    console.log(`[save-reply] Successfully saved reply relationship`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[save-reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}