import { NextResponse } from 'next/server';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getTop3Winners, saveWeeklyWinners, getCurrentWeek } from '@/lib/supabase-leaderboard';

const LEADERBOARD_CONTRACT = '0xC8826f73206215CaE1327D1262A4bC5128b0973B';

const LEADERBOARD_ABI = [
  {
    inputs: [
      { name: 'first', type: 'address' },
      { name: 'second', type: 'address' },
      { name: 'third', type: 'address' },
      { name: 'weekNumber', type: 'uint256' },
    ],
    name: 'distributeWeekly',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'canDistribute',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
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

    // Check if distribution is ready
    const canDistribute = await client.readContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'canDistribute',
    });

    if (!canDistribute) {
      return NextResponse.json({ 
        success: false, 
        message: 'Distribution not ready yet' 
      });
    }

    // Get contract balance
    const balance = await client.readContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'getBalance',
    });

    if (balance === 0n) {
      return NextResponse.json({ 
        success: false, 
        message: 'No funds to distribute' 
      });
    }

    // Get top 3 winners from database
    const winners = await getTop3Winners();
    
    if (!winners) {
      return NextResponse.json({ 
        success: false, 
        message: 'Not enough participants this week' 
      });
    }

    // Execute distribution
    const hash = await client.writeContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'distributeWeekly',
      args: [
        winners.first as `0x${string}`,
        winners.second as `0x${string}`,
        winners.third as `0x${string}`,
        BigInt(winners.weekNumber),
      ],
    });

    // Wait for transaction
    const receipt = await client.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      // Calculate prize amounts
      const totalBalance = Number(balance) / 1e18;
      const firstAmount = (totalBalance * 0.5).toString();
      const secondAmount = (totalBalance * 0.3).toString();
      const thirdAmount = (totalBalance * 0.2).toString();

      // Save winners to database
      await saveWeeklyWinners(
        winners.weekNumber,
        winners.first,
        winners.second,
        winners.third,
        firstAmount,
        secondAmount,
        thirdAmount,
        hash
      );

      return NextResponse.json({
        success: true,
        message: 'Distribution successful',
        txHash: hash,
        winners: {
          first: winners.first,
          second: winners.second,
          third: winners.third,
        },
      });
    } else {
      throw new Error('Transaction reverted');
    }
  } catch (error) {
    console.error('Distribution error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}