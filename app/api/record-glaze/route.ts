// app/api/record-glaze/route.ts
// Updated to also store mining events for the Recent Miners feature
// Removed deprecated image_url feature

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

// Fee splitter contract - receives 5% of mining fee
const FEE_SPLITTER_ADDRESS = '0xcB2604D87fe3e5b6fe33C5d5Ff05781602357D59'.toLowerCase();

// Alchemy RPC (primary) with fallback
const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g';
const FALLBACK_RPC = 'https://mainnet.base.org';

// Calculate the mine function selectors
// DONUT: mine(address,uint256,uint256,uint256,string)
const DONUT_MINE_SELECTOR = keccak256(toBytes('mine(address,uint256,uint256,uint256,string)')).slice(0, 10);
// SPRINKLES: mine(address,address,uint256,uint256,uint256,string)
const SPRINKLES_MINE_SELECTOR = keccak256(toBytes('mine(address,address,uint256,uint256,uint256,string)')).slice(0, 10);

// Helper function to fetch with fallback RPC
async function fetchWithFallback(method: string, params: any[]): Promise<any> {
  const rpcs = [ALCHEMY_RPC, FALLBACK_RPC];
  
  for (const rpc of rpcs) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: 1,
        }),
      });
      
      const data = await response.json();
      if (data.result) {
        return data;
      }
    } catch (e) {
      console.warn(`RPC ${rpc} failed for ${method}:`, e);
      continue;
    }
  }
  
  return { result: null };
}

export async function POST(request: Request) {
  try {
    // Accept both 'amount' and 'providedAmount' for backwards compatibility
    const { address, txHash, mineType = 'donut', amount: providedAmountAlt, providedAmount } = await request.json();
    const finalProvidedAmount = providedAmount || providedAmountAlt;
    
    console.log('record-glaze called with:', { address, txHash, mineType, providedAmount: finalProvidedAmount });

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

    // Get transaction receipt to verify success (using Alchemy with fallback)
    const receiptData = await fetchWithFallback('eth_getTransactionReceipt', [txHash]);
    
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
    const txData = await fetchWithFallback('eth_getTransactionByHash', [txHash]);
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
    let amount = finalProvidedAmount || '';
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
            { success: false, error: 'Glaze did not use Sprinkles App provider' },
            { status: 400 }
          );
        }
        
        // Extract amount from tx.value (ETH sent) if not provided, and message from uri
        if (!finalProvidedAmount) {
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
      
      // Extract amount from Transfer event TO the fee splitter contract
      // The fee splitter receives 5% of total, so multiply by 20 to get actual amount paid
      const TRANSFER_EVENT_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)'));
      const DECIMALS = BigInt("1000000000000000000"); // 10^18
      
      try {
        const logs = receipt.logs || [];
        console.log('Processing', logs.length, 'logs for tx:', txHash);
        
        // Find Transfer TO the fee splitter contract (this is 5% of total)
        for (const log of logs) {
          if (log.topics?.[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase()) {
            const toAddr = '0x' + log.topics[2].slice(26).toLowerCase();
            
            // Check if this transfer is TO the fee splitter contract
            if (toAddr === FEE_SPLITTER_ADDRESS) {
              const feeWei = BigInt(log.data);
              // Fee splitter receives 5%, so multiply by 20 to get total paid
              const totalPaidWei = feeWei * BigInt(20);
              const totalPaid = totalPaidWei / DECIMALS;
              amount = totalPaid.toString();
              console.log('Fee splitter received (wei):', feeWei.toString(), '-> Total paid:', amount);
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
    // Use check-then-insert/update pattern to avoid upsert issues with auto-increment id
    try {
      const txHashLower = txHash.toLowerCase();
      const addressLower = address.toLowerCase();
      
      console.log('Storing mining event:', { address: addressLower, tx_hash: txHashLower, mine_type: mineType, amount, message });
      
      // First check if this tx_hash already exists
      const { data: existing, error: selectError } = await supabase
        .from('mining_events')
        .select('id')
        .eq('tx_hash', txHashLower)
        .maybeSingle();
      
      if (selectError) {
        console.error('Supabase select error:', selectError);
      } else if (existing) {
        // Update existing record (removed image_url)
        const { error: updateError } = await supabase
          .from('mining_events')
          .update({
            address: addressLower,
            mine_type: mineType,
            amount,
            message,
            created_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error('Supabase update error:', updateError);
        } else {
          console.log('Supabase update success for id:', existing.id);
        }
      } else {
        // Insert new record (removed image_url)
        const { data: insertData, error: insertError } = await supabase
          .from('mining_events')
          .insert({
            address: addressLower,
            tx_hash: txHashLower,
            mine_type: mineType,
            amount,
            message,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        
        if (insertError) {
          console.error('Supabase insert error:', insertError);
        } else {
          console.log('Supabase insert success, new id:', insertData?.id);
        }
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