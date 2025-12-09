// app/api/spins/add/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPRINKLES_MINER_ADDRESS = "0x213d676d6d5c71d7f35a4213034e32739bd8f125";

// POST - Add a spin when user mines sprinkles
export async function POST(request: Request) {
  try {
    const { address, txHash } = await request.json();

    if (!address || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Address and txHash required' },
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
        params: [txHash],
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

    // Verify it was sent to the sprinkles miner contract
    if (receiptData.result.to?.toLowerCase() !== SPRINKLES_MINER_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Invalid contract - not sprinkles miner' },
        { status: 400 }
      );
    }

    // Add the spin
    const { data: existingData } = await supabase
      .from('user_spins')
      .select('total_spins')
      .eq('address', address.toLowerCase())
      .single();

    if (existingData) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('user_spins')
        .update({ 
          total_spins: existingData.total_spins + 1,
          updated_at: new Date().toISOString()
        })
        .eq('address', address.toLowerCase());

      if (updateError) throw updateError;
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('user_spins')
        .insert({
          address: address.toLowerCase(),
          total_spins: 1,
          spins_used: 0,
        });

      if (insertError) throw insertError;
    }

    const newTotal = (existingData?.total_spins || 0) + 1;

    console.log('Spin added for sprinkles mine:', { address, txHash, newTotal });

    return NextResponse.json({
      success: true,
      message: 'Spin added!',
      totalSpins: newTotal,
    });
  } catch (error) {
    console.error('Error adding spin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add spin' },
      { status: 500 }
    );
  }
}