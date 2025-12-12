import { NextResponse } from 'next/server';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getTop3Winners, saveWeeklyWinners, getCurrentWeek } from '@/lib/supabase-leaderboard';

const LEADERBOARD_CONTRACT = '0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586' as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;
const DONUT_ADDRESS = '0xAE4a37d554C6D6F3E398546d8566B25052e0169C' as `0x${string}`;

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
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getTokenBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(request: Request) {
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

    const ethBalance = await client.readContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'getBalance',
    });

    const donutBalance = await client.readContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'getTokenBalance',
      args: [DONUT_ADDRESS],
    });

    if (ethBalance === 0n && donutBalance === 0n) {
      return NextResponse.json({ 
        success: false, 
        message: 'No funds to distribute - rolling over' 
      });
    }

    const winners = await getTop3Winners();
    const weekNumber = getCurrentWeek();
    
    const first = (winners?.first || ZERO_ADDRESS) as `0x${string}`;
    const second = (winners?.second || ZERO_ADDRESS) as `0x${string}`;
    const third = (winners?.third || ZERO_ADDRESS) as `0x${string}`;

    if (first === ZERO_ADDRESS) {
      return NextResponse.json({ 
        success: false, 
        message: 'No participants this week - rewards rolling over' 
      });
    }

    const hash = await client.writeContract({
      address: LEADERBOARD_CONTRACT,
      abi: LEADERBOARD_ABI,
      functionName: 'distributeWeekly',
      args: [first, second, third, BigInt(weekNumber)],
    });

    const receipt = await client.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      const totalEth = Number(ethBalance) / 1e18;
      const totalDonut = Number(donutBalance) / 1e18;
      
      let firstPercent = 50;
      let secondPercent = second !== ZERO_ADDRESS ? 30 : 0;
      let thirdPercent = third !== ZERO_ADDRESS ? 20 : 0;

      const firstEth = ((totalEth * firstPercent) / 100).toString();
      const secondEth = ((totalEth * secondPercent) / 100).toString();
      const thirdEth = ((totalEth * thirdPercent) / 100).toString();

      await saveWeeklyWinners(
        weekNumber,
        first,
        second !== ZERO_ADDRESS ? second : null,
        third !== ZERO_ADDRESS ? third : null,
        firstEth,
        secondEth,
        thirdEth,
        hash
      );

      return NextResponse.json({
        success: true,
        message: 'Distribution successful',
        txHash: hash,
        winners: {
          first,
          second: second !== ZERO_ADDRESS ? second : null,
          third: third !== ZERO_ADDRESS ? third : null,
        },
        distributed: {
          eth: totalEth,
          donut: totalDonut,
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