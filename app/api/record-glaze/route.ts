// app/api/record-glaze/route.ts
// Updated to also store mining events for the Recent Miners feature

import { NextResponse } from 'next/server';
import { recordGlaze } from '@/lib/supabase-leaderboard';
import { decodeAbiParameters, parseAbiParameters, keccak256, toBytes } from 'viem';
import { createClient } from '@supabase/supabase-js';

// Supabase client for mining events
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Your provider address - glazes must use this to count
const YOUR_PROVIDER_ADDRESS = '0x30cb501B97c6b87B7b240755C730A9795dBB84f5'.toLowerCase();

// The multicall contract address for DONUT mining
const MULTICALL_ADDRESS = '0x3ec144554b484C6798A683E34c8e8E222293f323'.toLowerCase();

// The SPRINKLES miner contract address
const SPRINKLES_MINER_ADDRESS = '0x924b2d4a89b84a37510950031dcdb6552dc97bcc'.toLowerCase();

// Calculate the mine function selectors
// DONUT: mine(address,uint256,uint256,uint256,string)
const DONUT_MINE_SELECTOR = keccak256(toBytes('mine(address,uint256,uint256,uint256,string)')).slice(0, 10);
// SPRINKLES: mine(address,address,uint256,uint256,uint256,string)
const SPRINKLES_MINE_SELECTOR = keccak256(toBytes('mine(address,address,uint256,uint256,uint256,string)')).slice(0, 10);

export async function POST(request: Request) {
  try {
    const { address, txHash, mineType = 'donut', imageUrl, amount: providedAmount } = await request.json();
    
    console.log('record-glaze called with:', { address, txHash, mineType, imageUrl, providedAmount });

    if (!address || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing address or txHash' },
        { status: 400 }
      );
    }

    // Validate mineType
    if (mineType !== 'donut' && mineType !== 'sprinkles') {
      return NextResponse.json(
        { success: false, error: 'Invalid mineType' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 400 }
      );
    }

    if (receiptData.result.status !== '0x1') {
      return NextResponse.json(
        { success: false, error: 'Transaction failed/reverted' },
        { status: 400 }
      );
    }

    const receipt = receiptData.result;

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
      return NextResponse.json(
        { success: false, error: 'Transaction data not found' },
        { status: 400 }
      );
    }

    const toAddress = tx.to?.toLowerCase();
    const inputData = tx.input || '';
    const txSender = tx.from?.toLowerCase();
    
    // Variables to store for mining_events
    // Use provided amount if available (captured at mine time for accuracy)
    let amount = providedAmount || '';
    let message = '';

    // Verify based on mine type
    if (mineType === 'donut') {
      // Check the transaction was sent to the multicall contract
      if (toAddress !== MULTICALL_ADDRESS) {
        console.log('Wrong contract for DONUT:', toAddress, 'expected:', MULTICALL_ADDRESS);
        return NextResponse.json(
          { success: false, error: 'Transaction not sent to Donut contract' },
          { status: 400 }
        );
      }

      // Check the transaction called the mine() function
      if (!inputData.startsWith(DONUT_MINE_SELECTOR)) {
        console.log('Wrong function called:', inputData.slice(0, 10));
        return NextResponse.json(
          { success: false, error: 'Transaction is not a mine() call' },
          { status: 400 }
        );
      }

      // Decode the input to check the provider address and extract message
      try {
        const params = decodeAbiParameters(
          parseAbiParameters('address provider, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri'),
          `0x${inputData.slice(10)}` as `0x${string}`
        );
        
        const providerAddress = (params[0] as string).toLowerCase();
        
        if (providerAddress !== YOUR_PROVIDER_ADDRESS) {
          console.log('Wrong provider:', providerAddress, 'expected:', YOUR_PROVIDER_ADDRESS);
          return NextResponse.json(
            { success: false, error: 'Glaze did not use Donut Labs provider' },
            { status: 400 }
          );
        }
        
        // Extract amount from tx.value (ETH sent) if not provided, and message from uri
        if (!providedAmount) {
          amount = tx.value || '0';
        }
        message = params[4] as string || '';
      } catch (decodeError) {
        console.error('Failed to decode transaction input:', decodeError);
        return NextResponse.json(
          { success: false, error: 'Failed to verify provider' },
          { status: 400 }
        );
      }
    } else if (mineType === 'sprinkles') {
      // Check the transaction was sent to the SPRINKLES miner contract
      if (toAddress !== SPRINKLES_MINER_ADDRESS) {
        console.log('Wrong contract for SPRINKLES:', toAddress, 'expected:', SPRINKLES_MINER_ADDRESS);
        return NextResponse.json(
          { success: false, error: 'Transaction not sent to Sprinkles miner contract' },
          { status: 400 }
        );
      }

      // Check the transaction called the mine() function
      if (!inputData.startsWith(SPRINKLES_MINE_SELECTOR)) {
        console.log('Wrong function called:', inputData.slice(0, 10));
        return NextResponse.json(
          { success: false, error: 'Transaction is not a mine() call' },
          { status: 400 }
        );
      }
      
      // Extract message from input params
      try {
        const params = decodeAbiParameters(
          parseAbiParameters('address to, address referrer, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri'),
          `0x${inputData.slice(10)}` as `0x${string}`
        );
        message = params[5] as string || '';
      } catch (decodeError) {
        console.error('Failed to decode SPRINKLES input:', decodeError);
      }
      
      // Extract amount from Transfer event TO the miner contract
      // The miner contract receives 10% fee, so multiply by 10 to get actual amount paid
      const TRANSFER_EVENT_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)'));
      const DECIMALS = BigInt("1000000000000000000"); // 10^18
      
      try {
        const logs = receipt.logs || [];
        console.log('Processing', logs.length, 'logs for tx:', txHash);
        
        // Find Transfer TO the miner contract (this is the 10% fee)
        for (const log of logs) {
          if (log.topics?.[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase()) {
            const toAddr = '0x' + log.topics[2].slice(26).toLowerCase();
            
            // Check if this transfer is TO the sprinkles miner contract
            if (toAddr === SPRINKLES_MINER_ADDRESS) {
              const feeWei = BigInt(log.data);
              // Miner receives 10% fee, so multiply by 10 BEFORE dividing to preserve precision
              const totalPaidWei = feeWei * BigInt(10);
              const totalPaid = totalPaidWei / DECIMALS;
              amount = totalPaid.toString();
              console.log('Miner received fee (wei):', feeWei.toString(), '-> Total paid:', amount);
              break;
            }
          }
        }
      } catch (eventError) {
        console.error('Failed to process Transfer event logs:', eventError);
      }
      
      // If we couldn't extract amount, log a warning
      if (!amount || amount === '' || amount === '0') {
        console.warn('Could not extract amount from Transfer event for tx:', txHash);
      }
    }

    // Verify the sender matches the claimed address
    if (txSender !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match' },
        { status: 400 }
      );
    }

    // Store mining event for Recent Miners feature
    try {
      console.log('Upserting mining event:', { address: address.toLowerCase(), tx_hash: txHash.toLowerCase(), mine_type: mineType, amount, message, image_url: imageUrl || null });
      
      const { data: upsertData, error: upsertError } = await supabase
        .from('mining_events')
        .upsert(
          {
            address: address.toLowerCase(),
            tx_hash: txHash.toLowerCase(),
            mine_type: mineType,
            amount,
            message,
            image_url: imageUrl || null,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'tx_hash' }
        );
      
      if (upsertError) {
        console.error('Supabase upsert error:', upsertError);
      } else {
        console.log('Supabase upsert success:', upsertData);
      }
    } catch (dbError) {
      console.error('Failed to store mining event:', dbError);
      // Don't fail the request - leaderboard is more important
    }

    // All checks passed - record the glaze with txHash and mineType
    // DONUT = 2 points, SPRINKLES = 1 point
    const result = await recordGlaze(address, txHash, mineType);

    if (result.alreadyRecorded) {
      console.log('Glaze already recorded:', { address, txHash, mineType });
      return NextResponse.json({
        success: true,
        message: 'Glaze already recorded',
        alreadyRecorded: true,
      });
    }

    console.log('Valid glaze recorded:', { address, txHash, mineType, pointsAdded: result.pointsAdded, amount });

    return NextResponse.json({
      success: true,
      message: 'Glaze recorded successfully',
      pointsAdded: result.pointsAdded,
    });
  } catch (error) {
    console.error('Error recording glaze:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record glaze' },
      { status: 500 }
    );
  }
}