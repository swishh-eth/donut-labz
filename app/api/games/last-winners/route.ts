import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";

// Use public RPC, not Alchemy!
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Contract addresses
const DONUT_DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
const DONUT_MINES_ADDRESS = "0xc5D771DaEEBCEdf8e7e53512eA533C9B07F8bE4f" as const;
const GLAZE_WHEEL_ADDRESS = "0xDd89E2535e460aDb63adF09494AcfB99C33c43d8" as const;
const DONUT_TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;

type LastWinner = {
  username: string;
  amount: string;
  pfpUrl?: string;
} | null;

// In-memory cache
let cachedWinners: {
  dice: LastWinner;
  mines: LastWinner;
  wheel: LastWinner;
  tower: LastWinner;
} | null = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getProfile(address: string, baseUrl: string): Promise<{ username: string; pfpUrl?: string } | null> {
  try {
    const url = `${baseUrl}/api/profiles?addresses=${address}`;
    console.log('Fetching profile from:', url);
    
    const response = await fetch(url, { cache: 'no-store' });
    
    if (response.ok) {
      const data = await response.json();
      const lowercaseAddr = address.toLowerCase();
      const profile = data.profiles[lowercaseAddr];
      
      console.log('Profile lookup for', lowercaseAddr, ':', profile ? 'found' : 'not found');
      
      if (profile?.username) {
        return {
          username: profile.username,
          pfpUrl: profile.pfpUrl || undefined,
        };
      }
    } else {
      console.error('Profile fetch failed:', response.status, await response.text());
    }
  } catch (e) {
    console.error('getProfile error:', e);
  }
  return null;
}

async function fetchLastWinner(
  contractAddress: `0x${string}`,
  eventName: string,
  eventInputs: readonly { type: string; name: string; indexed?: boolean }[],
  checkWin: (log: any) => boolean,
  getPayout: (log: any) => bigint,
  getPlayer: (log: any) => string,
  baseUrl: string
): Promise<LastWinner> {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    // Reduce block range to 500 blocks (~15 minutes) to reduce load
    const fromBlock = currentBlock > 500n ? currentBlock - 500n : 0n;
    
    const logs = await publicClient.getLogs({
      address: contractAddress,
      event: {
        type: 'event',
        name: eventName,
        inputs: eventInputs,
      },
      fromBlock,
      toBlock: 'latest',
    });

    // Find last winning log
    let lastWin: { player: string; payout: bigint } | null = null;
    for (let i = logs.length - 1; i >= 0 && i >= logs.length - 20; i--) {
      const log = logs[i];
      if (checkWin(log)) {
        lastWin = { player: getPlayer(log), payout: getPayout(log) };
        break;
      }
    }
    
    if (!lastWin) return null;
    
    const profile = await getProfile(lastWin.player, baseUrl);
    return {
      username: profile?.username || `${lastWin.player.slice(0, 6)}...${lastWin.player.slice(-4)}`,
      amount: `${parseFloat(formatUnits(lastWin.payout, 18)).toFixed(2)} 🍩`,
      pfpUrl: profile?.pfpUrl,
    };
  } catch (error) {
    console.error(`Failed to fetch ${eventName}:`, error);
    return null;
  }
}

export async function GET(request: Request) {
  // Get base URL from request headers
  const headersList = new Headers(request.headers);
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = `${protocol}://${host}`;
  
  console.log('last-winners: baseUrl =', baseUrl);
  
  // Check for cache bust parameter
  const { searchParams } = new URL(request.url);
  const bustCache = searchParams.get('bust') === '1';
  
  // Return cached data if still fresh and not busting cache
  if (!bustCache && cachedWinners && Date.now() - cacheTime < CACHE_DURATION) {
    return NextResponse.json(cachedWinners, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  }

  // Fetch all in parallel
  const [dice, mines, wheel, tower] = await Promise.all([
    // Dice
    fetchLastWinner(
      DONUT_DICE_ADDRESS,
      'BetRevealed',
      [
        { name: 'betId', type: 'uint256', indexed: true },
        { name: 'player', type: 'address', indexed: true },
        { name: 'blockHash', type: 'bytes32' },
        { name: 'result', type: 'uint8' },
        { name: 'won', type: 'bool' },
        { name: 'payout', type: 'uint256' },
      ],
      (log) => log.args.won && log.args.player && log.args.payout,
      (log) => log.args.payout,
      (log) => log.args.player,
      baseUrl
    ),
    // Mines
    fetchLastWinner(
      DONUT_MINES_ADDRESS,
      'GameCashedOut',
      [
        { type: 'uint256', name: 'gameId', indexed: true },
        { type: 'address', name: 'player', indexed: true },
        { type: 'uint256', name: 'tilesRevealed' },
        { type: 'uint256', name: 'multiplier' },
        { type: 'uint256', name: 'payout' },
      ],
      (log) => log.args.player && log.args.payout,
      (log) => log.args.payout,
      (log) => log.args.player,
      baseUrl
    ),
    // Wheel
    fetchLastWinner(
      GLAZE_WHEEL_ADDRESS,
      'SpinRevealed',
      [
        { type: 'uint256', name: 'spinId', indexed: true },
        { type: 'address', name: 'player', indexed: true },
        { type: 'uint8', name: 'result' },
        { type: 'uint256', name: 'multiplier' },
        { type: 'uint256', name: 'payout' },
      ],
      (log) => log.args.payout && log.args.payout > 0n && log.args.player,
      (log) => log.args.payout,
      (log) => log.args.player,
      baseUrl
    ),
    // Tower
    fetchLastWinner(
      DONUT_TOWER_ADDRESS,
      'GameCashedOut',
      [
        { type: 'uint256', name: 'gameId', indexed: true },
        { type: 'address', name: 'player', indexed: true },
        { type: 'uint8', name: 'levelReached' },
        { type: 'uint256', name: 'multiplier' },
        { type: 'uint256', name: 'payout' },
      ],
      (log) => log.args.player && log.args.payout,
      (log) => log.args.payout,
      (log) => log.args.player,
      baseUrl
    ),
  ]);

  const result = { dice, mines, wheel, tower };
  
  // Update cache
  cachedWinners = result;
  cacheTime = Date.now();

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  });
}