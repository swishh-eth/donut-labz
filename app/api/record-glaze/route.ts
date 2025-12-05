import { NextResponse } from 'next/server';
import { recordGlaze } from '@/lib/supabase-leaderboard';

export async function POST(request: Request) {
  try {
    const { address, txHash } = await request.json();

    if (!address || !txHash) {
      return NextResponse.json(
        { success: false, error: 'Missing address or txHash' },
        { status: 400 }
      );
    }

    // Verify the transaction is real by checking Base RPC
    // (Optional but recommended for security)
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
    if (rpcUrl) {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      });

      const data = await response.json();
      
      if (!data.result || data.result.status !== '0x1') {
        return NextResponse.json(
          { success: false, error: 'Transaction not found or failed' },
          { status: 400 }
        );
      }
    }

    await recordGlaze(address);

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