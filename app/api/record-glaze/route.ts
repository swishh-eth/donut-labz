import { NextResponse } from 'next/server';
import { recordGlaze } from '@/lib/supabase-leaderboard';
import { decodeAbiParameters, parseAbiParameters, keccak256, toBytes } from 'viem';

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
    const { address, txHash, mineType = 'donut' } = await request.json();

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

      // Decode the input to check the provider address
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
    }

    // Verify the sender matches the claimed address
    const txSender = tx.from?.toLowerCase();
    if (txSender !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match' },
        { status: 400 }
      );
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

    console.log('Valid glaze recorded:', { address, txHash, mineType, pointsAdded: result.pointsAdded });

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