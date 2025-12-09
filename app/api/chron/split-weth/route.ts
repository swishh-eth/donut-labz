// app/api/cron/unwrap-weth/route.ts
import { NextResponse } from 'next/server';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// FeeSplitterV3 address
const FEE_SPLITTER_V3 = '0x30cb501B97c6b87B7b240755C730A9795dBB84f5' as `0x${string}`;
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const FEE_SPLITTER_ABI = [
  {
    inputs: [],
    name: 'splitWETH',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const privateKey = process.env.AUTOMATION_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Automation wallet not configured');
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    const client = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    }).extend(publicActions);

    // Check WETH balance in splitter
    const wethBalance = await client.readContract({
      address: WETH_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [FEE_SPLITTER_V3],
    });

    // If no WETH, skip
    if (wethBalance === 0n) {
      return NextResponse.json({ 
        success: true, 
        message: 'No WETH to split',
        wethBalance: '0',
      });
    }

    // Split WETH
    const hash = await client.writeContract({
      address: FEE_SPLITTER_V3,
      abi: FEE_SPLITTER_ABI,
      functionName: 'splitWETH',
    });

    const receipt = await client.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      const wethAmount = Number(wethBalance) / 1e18;
      
      return NextResponse.json({
        success: true,
        message: 'WETH split successfully',
        txHash: hash,
        wethSplit: wethAmount.toFixed(6),
      });
    } else {
      throw new Error('Transaction reverted');
    }
  } catch (error) {
    console.error('WETH unwrap error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}