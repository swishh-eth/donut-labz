// app/api/games/flappy/start-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

const FLAPPY_POOL_ADDRESS = '0xA3419c6eFbb7a227fC3e24189d8099591327a14A';
const DONUT_ADDRESS = '0xAE4a37d554C6D6F3E398546d8566B25052e0169C';

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function POST(request: NextRequest) {
  try {
    const { playerAddress, txHash, costPaid } = await request.json();

    if (!playerAddress || !txHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the transaction on-chain
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    
    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction not found or failed' }, { status: 400 });
    }

    // Verify the transaction is to the Flappy Pool contract
    if (receipt.to?.toLowerCase() !== FLAPPY_POOL_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid transaction recipient' }, { status: 400 });
    }

    // Verify the sender matches the player
    if (receipt.from.toLowerCase() !== playerAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction sender mismatch' }, { status: 400 });
    }

    // Check if this transaction has already been used for a session
    const { data: existingSession } = await supabase
      .from('flappy_sessions')
      .select('id')
      .eq('tx_hash', txHash.toLowerCase())
      .single();

    if (existingSession) {
      return NextResponse.json({ error: 'Transaction already used' }, { status: 400 });
    }

    // Verify DONUT was transferred (check logs for Transfer event to pool)
    const transferLog = receipt.logs.find(log => 
      log.address.toLowerCase() === DONUT_ADDRESS.toLowerCase() &&
      log.topics[0] === TRANSFER_EVENT_SIGNATURE &&
      log.topics[2] && // to address
      ('0x' + log.topics[2].slice(26)).toLowerCase() === FLAPPY_POOL_ADDRESS.toLowerCase()
    );

    if (!transferLog) {
      return NextResponse.json({ error: 'No valid DONUT transfer found' }, { status: 400 });
    }

    // Create a new game session
    const sessionId = crypto.randomUUID();
    const startTime = Date.now();

    const { error: insertError } = await supabase
      .from('flappy_sessions')
      .insert({
        id: sessionId,
        player_address: playerAddress.toLowerCase(),
        tx_hash: txHash.toLowerCase(),
        cost_paid: costPaid || 1,
        start_time: startTime,
        used: false,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error creating session:', insertError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      sessionId,
      startTime,
    });

  } catch (error) {
    console.error('Start session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}