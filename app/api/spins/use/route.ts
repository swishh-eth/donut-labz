// app/api/spins/use/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPIN_WHEEL_ADDRESS = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C";

// POST - Use a spin after successful reveal
export async function POST(request: Request) {
  try {
    const { address, revealTxHash, segment, prizes } = await request.json();

    if (!address || !revealTxHash) {
      return NextResponse.json(
        { success: false, error: 'Address and revealTxHash required' },
        { status: 400 }
      );
    }

    // Verify the transaction on-chain
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
    
    const receiptResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [revealTxHash],
        id: 1,
      }),
    });
    
    const receiptData = await receiptResponse.json();
    
    if (!receiptData.result) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 400 }
      );
    }

    if (receiptData.result.status !== '0x1') {
      return NextResponse.json(
        { success: false, error: 'Transaction failed' },
        { status: 400 }
      );
    }

    // Verify it was sent to the spin wheel contract
    if (receiptData.result.to?.toLowerCase() !== SPIN_WHEEL_ADDRESS?.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Invalid contract' },
        { status: 400 }
      );
    }

    // Verify sender matches
    const txResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [revealTxHash],
        id: 2,
      }),
    });
    
    const txData = await txResponse.json();
    
    if (txData.result?.from?.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Address mismatch' },
        { status: 400 }
      );
    }

    // Check user has available spins
    const { data: spinData, error: spinError } = await supabase
      .from('user_spins')
      .select('total_spins, spins_used')
      .eq('address', address.toLowerCase())
      .single();

    if (spinError && spinError.code !== 'PGRST116') {
      throw spinError;
    }

    const availableSpins = (spinData?.total_spins || 0) - (spinData?.spins_used || 0);
    
    if (availableSpins <= 0) {
      return NextResponse.json(
        { success: false, error: 'No spins available' },
        { status: 400 }
      );
    }

    // Use the spin
    const { error: updateError } = await supabase
      .from('user_spins')
      .update({ 
        spins_used: (spinData?.spins_used || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('address', address.toLowerCase());

    if (updateError) {
      throw updateError;
    }

    // Record in spin history
    await supabase
      .from('spin_history')
      .insert({
        address: address.toLowerCase(),
        commit_hash: '', // Could pass this from frontend
        reveal_tx_hash: revealTxHash,
        segment,
        prizes,
        status: 'revealed',
        revealed_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      message: 'Spin used successfully',
      remainingSpins: availableSpins - 1,
    });
  } catch (error) {
    console.error('Error using spin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to use spin' },
      { status: 500 }
    );
  }
}