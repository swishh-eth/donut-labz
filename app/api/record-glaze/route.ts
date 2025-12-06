import { NextResponse } from 'next/server';
import { recordGlaze } from '@/lib/supabase-leaderboard';
import { decodeAbiParameters, parseAbiParameters, keccak256, toBytes } from 'viem';

// Your provider address - glazes must use this to count
const YOUR_PROVIDER_ADDRESS = '0x73f1d590f4D0155Cab46A2b0A2CB90a82f9881cB'.toLowerCase();

// The multicall contract address
const MULTICALL_ADDRESS = '0x3ec144554b484C6798A683E34c8e8E222293f323'.toLowerCase();

// Calculate the mine function selector
// mine(address,uint256,uint256,uint256,string)
const MINE_FUNCTION_SELECTOR = keccak256(toBytes('mine(address,uint256,uint256,uint256,string)')).slice(0, 10);

export async function POST(request: Request) {
  try {
    const { address, txHash } = await request.json();

    if (!address || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing address or txHash' },
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

    // Check the transaction was sent to the multicall contract
    const toAddress = tx.to?.toLowerCase();
    if (toAddress !== MULTICALL_ADDRESS) {
      console.log('Wrong contract:', toAddress, 'expected:', MULTICALL_ADDRESS);
      return NextResponse.json(
        { success: false, error: 'Transaction not sent to Donut contract' },
        { status: 400 }
      );
    }

    // Check the transaction called the mine() function
    const inputData = tx.input || '';
    if (!inputData.startsWith(MINE_FUNCTION_SELECTOR)) {
      console.log('Wrong function called:', inputData.slice(0, 10));
      return NextResponse.json(
        { success: false, error: 'Transaction is not a mine() call' },
        { status: 400 }
      );
    }

    // Decode the input to check the provider address
    // mine(address provider, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri)
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

    // Verify the sender matches the claimed address
    const txSender = tx.from?.toLowerCase();
    if (txSender !== address.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Transaction sender does not match' },
        { status: 400 }
      );
    }

    // All checks passed - record the glaze!
    await recordGlaze(address);

    console.log('Valid glaze recorded:', { address, txHash });

    return NextResponse.json({
      success: true,
      message: 'Glaze recorded successfully',
    });
  } catch (error) {
    console.error('Error recording glaze:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record glaze' },
      { status: 500 }
    );
  }
}