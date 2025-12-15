// app/api/reveal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract addresses
const DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
const MINES_ADDRESS = "0xc5D771DaEEBCEdf8e7e53512eA533C9B07F8bE4f" as const;
const WHEEL_ADDRESS = "0xDd89E2535e460aDb63adF09494AcfB99C33c43d8" as const;
const TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;

// Revealer bot address: 0xccb3d6c0f171cb68d5521a483e9fb223a8adb94b
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

// Use a reliable RPC - consider using your Alchemy key from env
const RPC_URL = process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org';

// Create clients
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

function getWalletClient() {
  if (!REVEALER_PRIVATE_KEY) {
    throw new Error('REVEALER_PRIVATE_KEY not set');
  }
  const account = privateKeyToAccount(REVEALER_PRIVATE_KEY);
  return createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  });
}

// Helper to get gas price with buffer for priority
async function getGasSettings() {
  try {
    const gasPrice = await publicClient.getGasPrice();
    // Add 20% buffer to gas price for faster inclusion
    const bufferedGasPrice = (gasPrice * 120n) / 100n;
    return {
      gasPrice: bufferedGasPrice,
    };
  } catch (e) {
    console.error('Failed to get gas price:', e);
    return {};
  }
}

// Helper to reveal with retry logic
async function revealWithRetry(
  walletClient: ReturnType<typeof getWalletClient>,
  address: `0x${string}`,
  functionName: string,
  args: [bigint],
  maxRetries: number = 2
): Promise<{ success: boolean; hash?: string; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const gasSettings = await getGasSettings();
      
      // Estimate gas first, then add 30% buffer
      let gasLimit = 500000n;
      try {
        const estimated = await publicClient.estimateGas({
          account: walletClient.account,
          to: address,
          data: walletClient.account ? undefined : undefined, // Will be filled by writeContract
        });
        gasLimit = (estimated * 130n) / 100n;
        // Ensure minimum gas
        if (gasLimit < 300000n) gasLimit = 300000n;
        // Cap at reasonable max
        if (gasLimit > 1000000n) gasLimit = 1000000n;
      } catch {
        // Use default if estimation fails
        gasLimit = 600000n;
      }

      const hash = await walletClient.writeContract({
        address,
        abi: REVEAL_ABI,
        functionName: functionName as any,
        args,
        gas: gasLimit,
        ...gasSettings,
      });

      // Wait for receipt with timeout
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash, 
        timeout: 60_000 // 60 second timeout
      });

      if (receipt.status === 'success') {
        return { success: true, hash };
      } else {
        return { success: false, hash, error: 'Transaction reverted' };
      }
    } catch (e: any) {
      const errorMsg = e.message || 'Unknown error';
      console.error(`Attempt ${attempt + 1} failed:`, errorMsg);
      
      // Don't retry on certain errors
      if (errorMsg.includes('Block hash expired') || 
          errorMsg.includes('already revealed') ||
          errorMsg.includes('Invalid status')) {
        return { success: false, error: errorMsg };
      }
      
      // Wait before retry
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        return { success: false, error: errorMsg };
      }
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game'); // 'dice', 'mines', 'wheel', 'tower', or 'all'
  const betId = searchParams.get('betId'); // Optional: specific bet to check/reveal
  
  try {
    const results: Record<string, any> = {};
    const walletClient = getWalletClient();
    
    // DICE
    if (game === 'dice' || game === 'all') {
      try {
        const revealable = await publicClient.readContract({
          address: DICE_ADDRESS,
          abi: REVEAL_ABI,
          functionName: 'getRevealableBets',
        }) as bigint[];
        
        console.log('[DICE] Revealable bets:', revealable.length);
        
        if (revealable.length > 0) {
          const revealed: string[] = [];
          const failed: string[] = [];
          let lastHash = '';
          
          for (const betIdToReveal of revealable) {
            const result = await revealWithRetry(
              walletClient,
              DICE_ADDRESS,
              'revealBet',
              [betIdToReveal]
            );
            
            if (result.success) {
              revealed.push(betIdToReveal.toString());
              lastHash = result.hash || '';
              console.log(`[DICE] Revealed bet ${betIdToReveal.toString()}`);
            } else {
              failed.push(`${betIdToReveal.toString()}: ${result.error}`);
              console.error(`[DICE] Failed bet ${betIdToReveal.toString()}:`, result.error);
            }
          }
          
          results.dice = { revealed, failed: failed.length > 0 ? failed : undefined, txHash: lastHash };
        } else {
          results.dice = { revealed: [], message: 'No pending bets' };
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
        
        console.log('[MINES] Revealable games:', revealable.length);
        
        if (revealable.length > 0) {
          const revealed: string[] = [];
          const failed: string[] = [];
          let lastHash = '';
          
          for (const gameId of revealable) {
            const result = await revealWithRetry(
              walletClient,
              MINES_ADDRESS,
              'revealGame',
              [gameId]
            );
            
            if (result.success) {
              revealed.push(gameId.toString());
              lastHash = result.hash || '';
              console.log(`[MINES] Revealed game ${gameId.toString()}`);
            } else {
              failed.push(`${gameId.toString()}: ${result.error}`);
              console.error(`[MINES] Failed game ${gameId.toString()}:`, result.error);
            }
          }
          
          results.mines = { revealed, failed: failed.length > 0 ? failed : undefined, txHash: lastHash };
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
        
        console.log('[WHEEL] Revealable spins:', revealable.length);
        
        if (revealable.length > 0) {
          const revealed: string[] = [];
          const failed: string[] = [];
          let lastHash = '';
          
          for (const spinId of revealable) {
            const result = await revealWithRetry(
              walletClient,
              WHEEL_ADDRESS,
              'revealSpin',
              [spinId]
            );
            
            if (result.success) {
              revealed.push(spinId.toString());
              lastHash = result.hash || '';
              console.log(`[WHEEL] Revealed spin ${spinId.toString()}`);
            } else {
              failed.push(`${spinId.toString()}: ${result.error}`);
              console.error(`[WHEEL] Failed spin ${spinId.toString()}:`, result.error);
            }
          }
          
          results.wheel = { revealed, failed: failed.length > 0 ? failed : undefined, txHash: lastHash };
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
    
    // TOWER
    if (game === 'tower' || game === 'all') {
      try {
        const revealable = await publicClient.readContract({
          address: TOWER_ADDRESS,
          abi: REVEAL_ABI,
          functionName: 'getRevealableGames',
        }) as bigint[];
        
        console.log('[TOWER] Revealable games:', revealable.length);
        
        if (revealable.length > 0) {
          const revealed: string[] = [];
          const failed: string[] = [];
          let lastHash = '';
          
          for (const gameId of revealable) {
            const result = await revealWithRetry(
              walletClient,
              TOWER_ADDRESS,
              'revealGame',
              [gameId]
            );
            
            if (result.success) {
              revealed.push(gameId.toString());
              lastHash = result.hash || '';
              console.log(`[TOWER] Revealed game ${gameId.toString()}`);
            } else {
              failed.push(`${gameId.toString()}: ${result.error}`);
              console.error(`[TOWER] Failed game ${gameId.toString()}:`, result.error);
            }
          }
          
          results.tower = { revealed, failed: failed.length > 0 ? failed : undefined, txHash: lastHash };
        } else {
          results.tower = { revealed: [], message: 'No pending games' };
        }
        
        if (betId && game === 'tower') {
          const towerGame = await publicClient.readContract({
            address: TOWER_ADDRESS,
            abi: REVEAL_ABI,
            functionName: 'getGame',
            args: [BigInt(betId)],
          });
          results.towerGame = towerGame;
        }
      } catch (e: any) {
        results.tower = { error: e.message };
      }
    }
    
    return NextResponse.json({ 
      status: 'ok',
      timestamp: Date.now(),
      results 
    });
    
  } catch (error: any) {
    console.error('[REVEAL] Fatal error:', error);
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