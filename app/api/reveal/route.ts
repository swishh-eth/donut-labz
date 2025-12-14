// app/api/reveal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract addresses
const DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
const MINES_ADDRESS = "0xc5D771DaEEBCEdf8e7e53512eA533C9B07F8bE4f" as const;
const WHEEL_ADDRESS = "0xDd89E2535e460aDb63adF09494AcfB99C33c43d8" as const;

// Revealer bot address: 0xccb3d6c0f171cb68d5521a483e9fb223a8adb94b
// Make sure this matches what's set in each contract

// Revealer wallet private key - SET IN VERCEL ENV VARS
const REVEALER_PRIVATE_KEY = process.env.REVEALER_PRIVATE_KEY as `0x${string}`;

// ABIs (minimal - just what we need)
const REVEAL_ABI = [
  {
    inputs: [],
    name: "getRevealableBets",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "revealBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betIds", type: "uint256[]" }],
    name: "revealBets",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getRevealableGames",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "revealGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "gameIds", type: "uint256[]" }],
    name: "revealGames",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getRevealableSpins",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "revealSpin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "spinIds", type: "uint256[]" }],
    name: "revealSpins",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "getBet",
    outputs: [{
      type: "tuple",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "target", type: "uint8" },
        { name: "isOver", type: "bool" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "result", type: "uint8" },
        { name: "won", type: "bool" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "getGame",
    outputs: [{
      type: "tuple",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "mineCount", type: "uint8" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "revealedTiles", type: "uint32" },
        { name: "currentMultiplier", type: "uint256" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "getSpin",
    outputs: [{
      type: "tuple",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "riskLevel", type: "uint8" },
        { name: "segments", type: "uint8" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "result", type: "uint8" },
        { name: "multiplier", type: "uint256" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Create clients
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g'),
});

function getWalletClient() {
  if (!REVEALER_PRIVATE_KEY) {
    throw new Error('REVEALER_PRIVATE_KEY not set');
  }
  const account = privateKeyToAccount(REVEALER_PRIVATE_KEY);
  return createWalletClient({
    account,
    chain: base,
    transport: http('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g'),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game'); // 'dice', 'mines', 'wheel', or 'all'
  const betId = searchParams.get('betId'); // Optional: specific bet to check/reveal
  
  try {
    const results: Record<string, any> = {};
    
    // DICE
    if (game === 'dice' || game === 'all') {
      try {
        const revealable = await publicClient.readContract({
          address: DICE_ADDRESS,
          abi: REVEAL_ABI,
          functionName: 'getRevealableBets',
        }) as bigint[];
        
        console.log('Revealable bets:', revealable.map(id => id.toString()));
        
        if (revealable.length > 0) {
          const walletClient = getWalletClient();
          const revealed: string[] = [];
          let lastHash = '';
          
          // Reveal one at a time with explicit gas limit
          for (const betId of revealable) {
            try {
              const hash = await walletClient.writeContract({
                address: DICE_ADDRESS,
                abi: REVEAL_ABI,
                functionName: 'revealBet',
                args: [betId],
                gas: BigInt(500000), // Explicit gas limit
              });
              
              await publicClient.waitForTransactionReceipt({ hash });
              revealed.push(betId.toString());
              lastHash = hash;
            } catch (e: any) {
              console.error('Failed to reveal bet', betId.toString(), e.message);
            }
          }
          
          results.dice = { 
            revealed,
            txHash: lastHash 
          };
        } else {
          results.dice = { revealed: [], message: 'No pending bets', checked: DICE_ADDRESS };
        }
        
        // If specific betId requested, return its status
        if (betId && game === 'dice') {
          const bet = await publicClient.readContract({
            address: DICE_ADDRESS,
            abi: REVEAL_ABI,
            functionName: 'getBet',
            args: [BigInt(betId)],
          });
          results.bet = bet;
        }
      } catch (e: any) {
        results.dice = { error: e.message };
      }
    }
    
    // MINES
    if (game === 'mines' || game === 'all') {
      try {
        const revealable = await publicClient.readContract({
          address: MINES_ADDRESS,
          abi: REVEAL_ABI,
          functionName: 'getRevealableGames',
        }) as bigint[];
        
        console.log('Revealable mines games:', revealable.map(id => id.toString()));
        
        if (revealable.length > 0) {
          const walletClient = getWalletClient();
          const revealed: string[] = [];
          let lastHash = '';
          
          // Reveal one at a time with explicit gas limit
          for (const gameId of revealable) {
            try {
              const hash = await walletClient.writeContract({
                address: MINES_ADDRESS,
                abi: REVEAL_ABI,
                functionName: 'revealGame',
                args: [gameId],
                gas: BigInt(500000),
              });
              
              await publicClient.waitForTransactionReceipt({ hash });
              revealed.push(gameId.toString());
              lastHash = hash;
            } catch (e: any) {
              console.error('Failed to reveal mines game', gameId.toString(), e.message);
            }
          }
          
          results.mines = { 
            revealed,
            txHash: lastHash 
          };
        } else {
          results.mines = { revealed: [], message: 'No pending games' };
        }
        
        if (betId && game === 'mines') {
          const gameData = await publicClient.readContract({
            address: MINES_ADDRESS,
            abi: REVEAL_ABI,
            functionName: 'getGame',
            args: [BigInt(betId)],
          });
          results.game = gameData;
        }
      } catch (e: any) {
        results.mines = { error: e.message };
      }
    }
    
    // WHEEL
    if (game === 'wheel' || game === 'all') {
      try {
        const revealable = await publicClient.readContract({
          address: WHEEL_ADDRESS,
          abi: REVEAL_ABI,
          functionName: 'getRevealableSpins',
        }) as bigint[];
        
        console.log('Revealable spins:', revealable.map(id => id.toString()));
        
        if (revealable.length > 0) {
          const walletClient = getWalletClient();
          const revealed: string[] = [];
          let lastHash = '';
          
          // Reveal one at a time with explicit gas limit
          for (const spinId of revealable) {
            try {
              const hash = await walletClient.writeContract({
                address: WHEEL_ADDRESS,
                abi: REVEAL_ABI,
                functionName: 'revealSpin',
                args: [spinId],
                gas: BigInt(500000),
              });
              
              await publicClient.waitForTransactionReceipt({ hash });
              revealed.push(spinId.toString());
              lastHash = hash;
            } catch (e: any) {
              console.error('Failed to reveal spin', spinId.toString(), e.message);
            }
          }
          
          results.wheel = { 
            revealed,
            txHash: lastHash 
          };
        } else {
          results.wheel = { revealed: [], message: 'No pending spins' };
        }
        
        if (betId && game === 'wheel') {
          const spin = await publicClient.readContract({
            address: WHEEL_ADDRESS,
            abi: REVEAL_ABI,
            functionName: 'getSpin',
            args: [BigInt(betId)],
          });
          results.spin = spin;
        }
      } catch (e: any) {
        results.wheel = { error: e.message };
      }
    }
    
    return NextResponse.json({ 
      status: 'ok',
      timestamp: Date.now(),
      results 
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 });
  }
}

// Also support POST for explicit reveal requests
export async function POST(request: NextRequest) {
  return GET(request);
}