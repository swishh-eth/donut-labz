// app/api/spins/award-sprinkles-mine/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { keccak256, toBytes } from 'viem';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sprinkles miner contract address
const SPRINKLES_MINER_ADDRESS = '0x924b2d4a89b84A37510950031DCDb6552Dc97bcC'.toLowerCase();

// Calculate the mine function selector for sprinkles miner
// mine(address miner, address provider, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri)
const MINE_FUNCTION_SELECTOR = keccak256(toBytes('mine(address,address,uint256,uint256,uint256,string)')).slice(0, 10);

export async function POST(request: Request) {
  try {
    const { address, txHash } = await request.json();

    console.log('=== Sprinkles spin award request ===', { address, txHash });

    if (!address || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing address or txHash' },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Check if we already awarded a spin for this tx
    const { data: existing } = await supabase
      .from('sprinkles_spin_awards')
      .select('id')
      .eq('tx_hash', txHash)
      .single();

    if (existing) {
      console.log('Already awarded spin for tx:', txHash);
      return NextResponse.json({
        success: true,
        message: 'Spin already awarded for this transaction',
      });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';

    // Get transaction receipt to verify success
    const receiptResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1,
      }),
    });

    const receiptData = await receiptResponse.json();
    
    if (!receiptData.result) {
      console.log('Transaction not found:', txHash);
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 400 }
      );
    }

    if (receiptData.result.status !== '0x1') {
      console.log('Transaction failed/reverted:', txHash);
      return NextResponse.json(
        { success: false, error: 'Transaction failed/reverted' },
        { status: 400 }
      );
    }

    // Get the actual transaction to check the input data
    const txResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 2,
      }),
    });

    const txData = await txResponse.json();
    const tx = txData.result;

    if (!tx) {
      console.log('Transaction data not found:', txHash);
      return NextResponse.json(
        { success: false, error: 'Transaction data not found' },
        { status: 400 }
      );
    }

    // Check the transaction was sent to the sprinkles miner contract
    const toAddress = tx.to?.toLowerCase();
    if (toAddress !== SPRINKLES_MINER_ADDRESS) {
      console.log('Wrong contract:', toAddress, 'expected:', SPRINKLES_MINER_ADDRESS);
      return NextResponse.json(
        { success: false, error: 'Transaction not sent to Sprinkles miner contract' },
        { status: 400 }
      );
    }

    // Check the transaction called the mine() function
    const inputData = tx.input || '';
    if (!inputData.startsWith(MINE_FUNCTION_SELECTOR)) {
      console.log('Wrong function called:', inputData.slice(0, 10), 'expected:', MINE_FUNCTION_SELECTOR);
      return NextResponse.json(
        { success: false, error: 'Transaction is not a mine() call' },
        { status: 400 }
      );
    }

    // Verify the sender matches the claimed address
    const txSender = tx.from?.toLowerCase();
    if (txSender !== normalizedAddress) {
      console.log('Sender mismatch:', txSender, 'claimed:', normalizedAddress);
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match' },
        { status: 400 }
      );
    }

    // All checks passed - award the spin!
    console.log('All checks passed, awarding spin to:', normalizedAddress);

    // Record that we processed this tx (do this first to prevent double-awards)
    const { error: recordError } = await supabase
      .from('sprinkles_spin_awards')
      .insert({
        tx_hash: txHash,
        address: normalizedAddress,
        block_number: parseInt(receiptData.result.blockNumber, 16),
        created_at: new Date().toISOString(),
      });

    if (recordError) {
      // If it's a duplicate key error, spin was already awarded
      if (recordError.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'Spin already awarded for this transaction',
        });
      }
      console.error('Failed to record spin award:', recordError);
      throw recordError;
    }

    // Now award the spin
    const { data: existingUser } = await supabase
      .from('user_spins')
      .select('total_spins')
      .eq('address', normalizedAddress)
      .single();

    if (existingUser) {
      const { error: updateError } = await supabase
        .from('user_spins')
        .update({ 
          total_spins: existingUser.total_spins + 1,
          updated_at: new Date().toISOString()
        })
        .eq('address', normalizedAddress);

      if (updateError) {
        console.error('Failed to update spins:', updateError);
        throw updateError;
      }
      
      console.log('Updated spins for', normalizedAddress, 'to', existingUser.total_spins + 1);
    } else {
      const { error: insertError } = await supabase
        .from('user_spins')
        .insert({
          address: normalizedAddress,
          total_spins: 1,
          spins_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Failed to insert spins:', insertError);
        throw insertError;
      }
      
      console.log('Created new spin record for', normalizedAddress);
    }

    return NextResponse.json({
      success: true,
      message: 'Spin awarded successfully',
    });
  } catch (error) {
    console.error('Error awarding spin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to award spin' },
      { status: 500 }
    );
  }
}