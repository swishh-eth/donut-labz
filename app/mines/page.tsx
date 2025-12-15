"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Bomb, Volume2, VolumeX, ChevronDown, Target, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - V5
const DONUT_MINES_ADDRESS = "0xc5D771DaEEBCEdf8e7e53512eA533C9B07F8bE4f" as const;
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;

const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// V5 ABI - house reveals mine positions
const MINES_V5_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "mineCount", type: "uint8" }
    ],
    name: "startGame",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }, { name: "tileIndex", type: "uint8" }],
    name: "revealTile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "cashOut",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "claimExpiredGame",
    outputs: [],
    stateMutability: "nonpayable",
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
        { name: "minePositions", type: "uint32" },
        { name: "revealedTiles", type: "uint32" },
        { name: "currentMultiplier", type: "uint256" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "games",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "mineCount", type: "uint8" },
      { name: "commitBlock", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "minePositions", type: "uint32" },
      { name: "revealedTiles", type: "uint32" },
      { name: "currentMultiplier", type: "uint256" },
      { name: "payout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerActiveGame",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerGames",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "mineCount", type: "uint8" }, { name: "tilesRevealed", type: "uint8" }],
    name: "getMultiplier",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "gameId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "mineCount", type: "uint8" },
      { indexed: false, name: "commitBlock", type: "uint256" }
    ],
    name: "GameStarted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "gameId", type: "uint256" },
      { indexed: false, name: "minePositions", type: "uint32" }
    ],
    name: "GameRevealed",
    type: "event"
  }
] as const;

// GameStatus enum matching contract
enum GameStatus { None, Pending, Active, Won, Lost, Expired }

type OnchainGame = {
  player: `0x${string}`;
  token: `0x${string}`;
  betAmount: bigint;
  mineCount: number;
  commitBlock: bigint;
  status: number;
  minePositions: number;
  revealedTiles: number;
  currentMultiplier: bigint;
  payout: bigint;
};

// Multiplier tables (matching contract)
const MULTIPLIERS: Record<number, Record<number, number>> = {
  1: { 1: 10200, 2: 10600, 3: 11100, 4: 11600, 5: 12100, 6: 12700, 7: 13400, 8: 14100, 9: 14900, 10: 15800, 11: 16800, 12: 17900, 13: 19200, 14: 20600, 15: 22200, 16: 24100, 17: 26300, 18: 28900, 19: 32000, 20: 35800, 21: 40600, 22: 46900, 23: 55600, 24: 68600 },
  3: { 1: 11100, 2: 12500, 3: 14200, 4: 16200, 5: 18700, 6: 21700, 7: 25400, 8: 30100, 9: 36100, 10: 43900, 11: 54300, 12: 68400, 13: 88100, 14: 116500, 15: 159100, 16: 226600, 17: 340000, 18: 544000, 19: 952000, 20: 1904000, 21: 4760000, 22: 19040000 },
  5: { 1: 12200, 2: 15100, 3: 18900, 4: 24000, 5: 30900, 6: 40500, 7: 54000, 8: 73500, 9: 102900, 10: 147000, 11: 220500, 12: 343000, 13: 564200, 14: 987400, 15: 1876000, 16: 3948200, 17: 9474800, 18: 28424400, 19: 113697600, 20: 852732000 },
  10: { 1: 16300, 2: 27200, 3: 46800, 4: 83200, 5: 154700, 6: 302400, 7: 628600, 8: 1415200, 9: 3538000, 10: 10260200, 11: 35910800, 12: 161598400, 13: 1077322800, 14: 12927873000, 15: 645000000000 },
  24: { 1: 245000 } // 24.5x - corrected from contract bug
};

const getMultiplier = (mineCount: number, tilesRevealed: number): number => {
  return MULTIPLIERS[mineCount]?.[tilesRevealed] || 10000;
};

const countBits = (n: number): number => {
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return count;
};

// Donut explosion particle type
type DonutParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  scale: number;
};

// Donut Explosion Component
function DonutExplosion({ tileIndex, onComplete }: { tileIndex: number; onComplete: () => void }) {
  const [particles, setParticles] = useState<DonutParticle[]>([]);
  
  useEffect(() => {
    // Create 8-12 particles
    const count = 8 + Math.floor(Math.random() * 5);
    const newParticles: DonutParticle[] = [];
    
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 60;
      newParticles.push({
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50, // Bias upward
        rotation: Math.random() * 360,
        scale: 0.6 + Math.random() * 0.6,
      });
    }
    
    setParticles(newParticles);
    
    // Clean up after animation
    const timer = setTimeout(onComplete, 800);
    return () => clearTimeout(timer);
  }, [onComplete]);
  
  // Calculate tile position (5x5 grid)
  const row = Math.floor(tileIndex / 5);
  const col = tileIndex % 5;
  
  return (
    <div 
      className="absolute pointer-events-none z-30"
      style={{
        left: `${col * 20 + 10}%`,
        top: `${row * 20 + 10}%`,
      }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute text-xl"
          style={{
            animation: 'donut-fly 0.8s ease-out forwards',
            '--vx': `${p.vx}px`,
            '--vy': `${p.vy}px`,
            '--rotation': `${p.rotation + 720}deg`,
            transform: `scale(${p.scale})`,
          } as React.CSSProperties}
        >
          🍩
        </div>
      ))}
    </div>
  );
}

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("100");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_MINES_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_MINES_ADDRESS, parseUnits(amount, 18)]
    }, {
      onSuccess: () => {
        refetchLocal();
        refetchAllowance();
      }
    });
  };

  const handleRevoke = () => {
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_MINES_ADDRESS, BigInt(0)]
    }, {
      onSuccess: () => {
        refetchLocal();
        refetchAllowance();
      }
    });
  };

  const isApproved = allowance && allowance > BigInt(0);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Token Approvals
          </h2>
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Mines contract.</p>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍩</span>
                <div>
                  <div className="text-sm font-bold text-white">DONUT</div>
                  <div className="text-[10px] text-gray-500">
                    {isApproved 
                      ? `Approved: ${parseFloat(formatUnits(allowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "Not approved"
                    }
                  </div>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full", isApproved ? "bg-green-500" : "bg-red-500")} />
            </div>
            
            <div className="mb-2">
              <input
                type="number"
                value={approvalAmount}
                onChange={(e) => setApprovalAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(approvalAmount)}
                disabled={isPending}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold"
              >
                {isPending ? "..." : "Approve"}
              </button>
              {isApproved && (
                <button
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold"
                >
                  {isPending ? "..." : "Revoke"}
                </button>
              )}
            </div>
          </div>
          
          <button onClick={onClose} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function BakeryMinesPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [mineCount, setMineCount] = useState<number>(1); // Default to 1 mine now
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasShownApproval, setHasShownApproval] = useState(false);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  
  // Donut explosions state
  const [explosions, setExplosions] = useState<number[]>([]);
  
  // Collapsible panel state (like wheel)
  const [expandedPanel, setExpandedPanel] = useState<"none" | "mines" | "bet">("none");
  
  // Game state
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null);
  const [gameState, setGameState] = useState<OnchainGame | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isWaitingForReveal, setIsWaitingForReveal] = useState(false);
  const [revealingTile, setRevealingTile] = useState<number | null>(null);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);
  const [recentGames, setRecentGames] = useState<OnchainGame[]>([]);
  
  const { address, isConnected } = useAccount();

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playRevealSound = useCallback((safe: boolean) => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = safe ? 800 : 200;
      oscillator.type = safe ? 'sine' : 'square';
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } catch {}
  }, [isMuted]);

  const playWinSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {}
  }, [isMuted]);

  const playLoseSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, [isMuted]);

  // Load context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // SDK ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Read token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_MINES_ADDRESS] : undefined,
  });

  // Read active game ID
  const { data: contractActiveGameId, refetch: refetchActiveGame } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_V5_ABI,
    functionName: "getPlayerActiveGame",
    args: address ? [address] : undefined,
  });

  // Read player game IDs for history
  const { data: playerGameIds, refetch: refetchGameIds } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_V5_ABI,
    functionName: "getPlayerGames",
    args: address ? [address] : undefined,
  });

  // Auto-show approvals
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals && !hasShownApproval) {
      const timer = setTimeout(() => {
        setShowApprovals(true);
        setHasShownApproval(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals, hasShownApproval]);

  // Fetch game state when active game ID changes
  useEffect(() => {
    const fetchGameState = async () => {
      if (!publicClient || !contractActiveGameId || contractActiveGameId === BigInt(0)) {
        setActiveGameId(null);
        setGameState(null);
        return;
      }
      
      try {
        const game = await publicClient.readContract({
          address: DONUT_MINES_ADDRESS,
          abi: MINES_V5_ABI,
          functionName: "games",
          args: [contractActiveGameId],
          blockTag: 'latest',
        }) as [string, string, bigint, number, bigint, number, number, number, bigint, bigint];
        
        const gameData: OnchainGame = {
          player: game[0] as `0x${string}`,
          token: game[1] as `0x${string}`,
          betAmount: game[2],
          mineCount: game[3],
          commitBlock: game[4],
          status: game[5],
          minePositions: game[6],
          revealedTiles: game[7],
          currentMultiplier: game[8],
          payout: game[9],
        };
        
        setActiveGameId(contractActiveGameId);
        setGameState(gameData);
        
        // If game is pending, poll for reveal
        if (gameData.status === GameStatus.Pending) {
          setIsWaitingForReveal(true);
        } else {
          setIsWaitingForReveal(false);
        }
      } catch (e) {
        console.error("Error fetching game:", e);
      }
    };
    
    fetchGameState();
  }, [publicClient, contractActiveGameId]);

  // Poll for game reveal when waiting (for page reload cases)
  useEffect(() => {
    if (!isWaitingForReveal || !activeGameId || !publicClient || isStartingGame) return;
    
    let cancelled = false;
    
    const pollForReveal = async () => {
      if (cancelled) return;
      
      try {
        await fetch('/api/reveal?game=mines');
      } catch {}
      
      await new Promise(r => setTimeout(r, 4000));
      
      if (cancelled) return;
      
      try {
        const game = await publicClient.readContract({
          address: DONUT_MINES_ADDRESS,
          abi: MINES_V5_ABI,
          functionName: "games",
          args: [activeGameId],
          blockTag: 'latest',
        }) as [string, string, bigint, number, bigint, number, number, number, bigint, bigint];
        
        if (game[5] === GameStatus.Active) {
          setGameState({
            player: game[0] as `0x${string}`,
            token: game[1] as `0x${string}`,
            betAmount: game[2],
            mineCount: game[3],
            commitBlock: game[4],
            status: game[5],
            minePositions: game[6],
            revealedTiles: game[7],
            currentMultiplier: game[8],
            payout: game[9],
          });
          setIsWaitingForReveal(false);
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };
    
    const interval = setInterval(pollForReveal, 5000);
    pollForReveal();
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isWaitingForReveal, activeGameId, publicClient, isStartingGame]);

  // Fetch game history
  useEffect(() => {
    if (!showHistory || !playerGameIds || !publicClient) return;
    
    const fetchHistory = async () => {
      const ids = playerGameIds as bigint[];
      if (!ids || ids.length === 0) {
        setRecentGames([]);
        return;
      }
      
      const games: OnchainGame[] = [];
      const idsToFetch = ids.slice(-5).reverse();
      
      for (const id of idsToFetch) {
        try {
          const game = await publicClient.readContract({
            address: DONUT_MINES_ADDRESS,
            abi: MINES_V5_ABI,
            functionName: "games",
            args: [id],
          }) as [string, string, bigint, number, bigint, number, number, number, bigint, bigint];
          
          games.push({
            player: game[0] as `0x${string}`,
            token: game[1] as `0x${string}`,
            betAmount: game[2],
            mineCount: game[3],
            commitBlock: game[4],
            status: game[5],
            minePositions: game[6],
            revealedTiles: game[7],
            currentMultiplier: game[8],
            payout: game[9],
          });
          
          await new Promise(r => setTimeout(r, 100));
        } catch {}
      }
      
      setRecentGames(games);
    };
    
    fetchHistory();
  }, [showHistory, playerGameIds, publicClient]);

  // Contract writes
  const { data: startHash, writeContract: writeStartGame, isPending: isStartPending, reset: resetStart, error: startError } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });
  
  const { data: revealHash, writeContract: writeRevealTile, isPending: isRevealPending, error: revealError } = useWriteContract();
  const { isSuccess: isRevealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });
  
  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending, error: cashOutError } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

  // Handle locked mine option click
  const handleLockedMineClick = () => {
    setShowComingSoon(true);
    try { sdk.haptics.impactOccurred("medium"); } catch {}
    setTimeout(() => setShowComingSoon(false), 1500);
  };

  // Handle start game
  const handleStartGame = async () => {
    if (!isConnected || !address) return;
    if (isStartingGame || activeGameId) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet must be between 0.1 and 10");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Insufficient balance");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      setErrorMessage("Need approval first");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsStartingGame(true);
    setGameResult(null);
    setExpandedPanel("none");
    
    writeStartGame({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_V5_ABI,
      functionName: "startGame",
      args: [DONUT_TOKEN_ADDRESS, amountWei, mineCount]
    });
  };

  // Handle start game success
  useEffect(() => {
    if (isStartSuccess && isStartingGame && startHash && publicClient && address) {
      const getGameIdAndPoll = async () => {
        let gameId: bigint | null = null;
        
        // Try to get game ID from receipt first
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: startHash });
          
          const gameStartedLog = receipt.logs.find(log => 
            log.address.toLowerCase() === DONUT_MINES_ADDRESS.toLowerCase()
          );
          
          if (gameStartedLog && gameStartedLog.topics[1]) {
            gameId = BigInt(gameStartedLog.topics[1]);
            console.log("Got game ID from receipt:", gameId.toString());
          }
        } catch (e) {
          console.error("Error getting receipt:", e);
        }
        
        // Fallback: poll for active game ID if we couldn't get it from receipt
        if (!gameId) {
          console.log("Trying fallback: polling for active game");
          let attempts = 0;
          const maxAttempts = 15;
          
          while (attempts < maxAttempts && !gameId) {
            attempts++;
            await new Promise(r => setTimeout(r, 1000));
            
            try {
              const result = await publicClient.readContract({
                address: DONUT_MINES_ADDRESS,
                abi: MINES_V5_ABI,
                functionName: "getPlayerActiveGame",
                args: [address],
                blockTag: 'latest',
              }) as bigint;
              
              console.log(`Fallback attempt ${attempts}: game ID =`, result?.toString());
              
              if (result && result > BigInt(0)) {
                gameId = result;
              }
            } catch (e) {
              console.error(`Fallback attempt ${attempts} error:`, e);
            }
          }
        }
        
        if (!gameId) {
          console.error("Could not find game ID");
          setErrorMessage("Could not find game - try refreshing");
          setIsStartingGame(false);
          setIsWaitingForReveal(false);
          return;
        }
        
        setConfirmedTiles(0);
        setActiveGameId(gameId);
        setIsWaitingForReveal(true);
        
        let attempts = 0;
        const maxAttempts = 30;
        
        const poll = async (): Promise<boolean> => {
          attempts++;
          console.log(`Poll attempt ${attempts} for game ${gameId!.toString()}`);
          
          try {
            await fetch('/api/reveal?game=mines');
          } catch {}
          
          await new Promise(r => setTimeout(r, 4000));
          
          try {
            const game = await publicClient.readContract({
              address: DONUT_MINES_ADDRESS,
              abi: MINES_V5_ABI,
              functionName: "games",
              args: [gameId!],
              blockTag: 'latest',
            }) as [string, string, bigint, number, bigint, number, number, number, bigint, bigint];
            
            console.log("Game status:", game[5]);
            
            if (game[5] === GameStatus.Active) {
              setGameState({
                player: game[0] as `0x${string}`,
                token: game[1] as `0x${string}`,
                betAmount: game[2],
                mineCount: game[3],
                commitBlock: game[4],
                status: game[5],
                minePositions: game[6],
                revealedTiles: game[7],
                currentMultiplier: game[8],
                payout: game[9],
              });
              setIsWaitingForReveal(false);
              setIsStartingGame(false);
              return true;
            }
            
            if (attempts >= maxAttempts) {
              setErrorMessage("Timeout - try refreshing");
              setIsWaitingForReveal(false);
              setIsStartingGame(false);
              return true;
            }
          } catch (e) {
            console.error("Poll error:", e);
          }
          
          return false;
        };
        
        const pollLoop = async () => {
          while (true) {
            const done = await poll();
            if (done) break;
          }
        };
        
        pollLoop();
      };
      
      getGameIdAndPoll();
    }
  }, [isStartSuccess, isStartingGame, startHash, publicClient, address]);

  // Handle start game error
  useEffect(() => {
    if (startError && isStartingGame) {
      const msg = startError.message || "";
      if (msg.includes("rejected")) {
        setErrorMessage("Transaction cancelled");
      } else if (msg.includes("Finish current game")) {
        setErrorMessage("Finish current game first");
      } else {
        setErrorMessage("Failed to start game");
      }
      setIsStartingGame(false);
      resetStart();
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [startError, isStartingGame, resetStart]);

  // Track tiles that are confirmed revealed (local optimistic state)
  const [confirmedTiles, setConfirmedTiles] = useState<number>(0);
  const pendingTileRef = useRef<number | null>(null);
  
  // Handle tile reveal
  const handleRevealTile = (tileIndex: number) => {
    if (!activeGameId || !gameState) return;
    if (gameState.status !== GameStatus.Active) return;
    if (revealingTile !== null || isRevealPending) return;
    
    const tileMask = 1 << tileIndex;
    if ((gameState.revealedTiles & tileMask) !== 0) return;
    if ((confirmedTiles & tileMask) !== 0) return;
    
    // Track which tile we're revealing
    pendingTileRef.current = tileIndex;
    setRevealingTile(tileIndex);
    
    // Optimistically add the tile to confirmed (will show as revealed immediately)
    setConfirmedTiles(prev => prev | tileMask);
    
    writeRevealTile({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_V5_ABI,
      functionName: "revealTile",
      args: [activeGameId, tileIndex]
    }, {
      onError: (error) => {
        console.error("Reveal tile error:", error);
        // Revert optimistic update on error
        setConfirmedTiles(prev => prev & ~tileMask);
        setRevealingTile(null);
        pendingTileRef.current = null;
      }
    });
  };

  // Trigger donut explosion
  const triggerExplosion = useCallback((tileIndex: number) => {
    setExplosions(prev => [...prev, tileIndex]);
  }, []);

  const removeExplosion = useCallback((tileIndex: number) => {
    setExplosions(prev => prev.filter(i => i !== tileIndex));
  }, []);

  // Handle tile reveal success
  useEffect(() => {
    if (!isRevealSuccess || revealingTile === null || !activeGameId || !publicClient) return;
    
    const tileIndex = revealingTile;
    const tileMask = 1 << tileIndex;
    const gameIdToCheck = activeGameId;
    
    // Clear revealing state but keep tile in confirmedTiles
    setRevealingTile(null);
    pendingTileRef.current = null;
    playRevealSound(true);
    triggerExplosion(tileIndex); // Trigger donut explosion!
    try { sdk.haptics.impactOccurred("light"); } catch {}
    
    const fetchAndUpdate = async () => {
      // Wait longer for mobile/slow networks
      await new Promise(r => setTimeout(r, 1500));
      
      try {
        const game = await publicClient.readContract({
          address: DONUT_MINES_ADDRESS,
          abi: MINES_V5_ABI,
          functionName: "games",
          args: [gameIdToCheck],
          blockTag: 'latest',
        }) as [string, string, bigint, number, bigint, number, number, number, bigint, bigint];
        
        const newGameState: OnchainGame = {
          player: game[0] as `0x${string}`,
          token: game[1] as `0x${string}`,
          betAmount: game[2],
          mineCount: game[3],
          commitBlock: game[4],
          status: game[5],
          minePositions: game[6],
          revealedTiles: game[7],
          currentMultiplier: game[8],
          payout: game[9],
        };
        
        // Only update if we got newer data (more tiles revealed or game ended)
        const onChainCount = countBits(newGameState.revealedTiles);
        const localCount = countBits(confirmedTiles);
        
        if (onChainCount >= localCount || newGameState.status !== GameStatus.Active) {
          setGameState(newGameState);
          // Merge: keep our local tiles plus any the chain knows about
          setConfirmedTiles(prev => prev | newGameState.revealedTiles);
        }
        
        const hitMine = (newGameState.minePositions & tileMask) !== 0;
        
        if (hitMine || newGameState.status === GameStatus.Lost) {
          playLoseSound();
          setGameResult("lost");
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setTimeout(() => {
            setConfirmedTiles(0);
            setActiveGameId(null);
            setGameState(null);
            setGameResult(null);
            refetchActiveGame();
            refetchBalance();
          }, 4000);
        }
      } catch (e) {
        console.error("Error fetching game state:", e);
      }
    };
    
    fetchAndUpdate();
  }, [isRevealSuccess, revealingTile, activeGameId, publicClient, playRevealSound, playLoseSound, refetchActiveGame, refetchBalance, confirmedTiles, triggerExplosion]);

  // Handle tile reveal error
  useEffect(() => {
    if (revealError && revealingTile !== null) {
      setRevealingTile(null);
      setErrorMessage("Failed to reveal tile");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [revealError, revealingTile]);

  // Handle cash out
  const handleCashOut = () => {
    if (!activeGameId || !gameState) return;
    if (gameState.status !== GameStatus.Active) return;
    const tileCount = Math.max(countBits(gameState.revealedTiles), countBits(confirmedTiles));
    if (tileCount === 0) return;
    
    setIsCashingOut(true);
    
    writeCashOut({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_V5_ABI,
      functionName: "cashOut",
      args: [activeGameId]
    });
  };

  // Handle cash out success
  useEffect(() => {
    if (isCashOutSuccess && isCashingOut) {
      playWinSound();
      setGameResult("won");
      flushSync(() => setShowConfetti(true));
      try { sdk.haptics.impactOccurred("heavy"); } catch {}
      
      setTimeout(() => {
        setShowConfetti(false);
        setConfirmedTiles(0);
        setActiveGameId(null);
        setGameState(null);
        setGameResult(null);
        setIsCashingOut(false);
        refetchActiveGame();
        refetchBalance();
        refetchGameIds();
      }, 4000);
    }
  }, [isCashOutSuccess, isCashingOut, playWinSound, refetchActiveGame, refetchBalance, refetchGameIds]);

  // Handle cash out error
  useEffect(() => {
    if (cashOutError && isCashingOut) {
      setIsCashingOut(false);
      setErrorMessage("Failed to cash out");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [cashOutError, isCashingOut]);

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  
  // Use the higher of on-chain or local tile count for display
  const revealedCount = gameState 
    ? Math.max(countBits(gameState.revealedTiles), countBits(confirmedTiles))
    : 0;
  
  const nextMultiplier = gameState 
    ? getMultiplier(gameState.mineCount, revealedCount + 1)
    : getMultiplier(mineCount, 1);
  const currentMultiplier = gameState 
    ? Number(gameState.currentMultiplier) / 10000
    : 1;
  const currentProfit = gameState && revealedCount > 0
    ? (parseFloat(formatUnits(gameState.betAmount, 18)) * currentMultiplier) - parseFloat(formatUnits(gameState.betAmount, 18))
    : 0;

  // Render grid - bigger tiles now
  const renderGrid = () => {
    const tiles = [];
    const isInGame = !!gameState;
    const gameEnded = gameState && (gameState.status === GameStatus.Lost || gameState.status === GameStatus.Won);
    
    for (let i = 0; i < 25; i++) {
      const tileMask = 1 << i;
      
      const isRevealedOnChain = gameState ? (gameState.revealedTiles & tileMask) !== 0 : false;
      const isConfirmedRevealed = (confirmedTiles & tileMask) !== 0;
      const isRevealed = isRevealedOnChain || isConfirmedRevealed;
      
      const isMine = gameState ? (gameState.minePositions & tileMask) !== 0 : false;
      
      const showAsMine = gameEnded && isMine;
      const showAsSafe = (isRevealed && !isMine) || (gameEnded && !isMine);
      
      const isClickable = gameState?.status === GameStatus.Active && !isRevealed && revealingTile === null;
      const isRevealing = revealingTile === i;
      
      let tileStyle = "";
      if (isRevealing) {
        tileStyle = "animate-pulse bg-amber-500/20 border-amber-500";
      } else if (showAsMine) {
        const wasHitMine = isRevealed && isMine;
        tileStyle = wasHitMine 
          ? "bg-red-500/40 border-red-500 animate-pulse" 
          : "bg-red-500/20 border-red-400";
      } else if (showAsSafe) {
        tileStyle = "bg-white/10 border-white";
      } else if (!isClickable) {
        tileStyle = "bg-zinc-900 border-zinc-700 opacity-50";
      } else {
        tileStyle = "bg-zinc-800 border-zinc-600 hover:border-white hover:bg-zinc-700 cursor-pointer active:scale-95";
      }
      
      tiles.push(
        <button
          key={i}
          onClick={() => handleRevealTile(i)}
          disabled={!isClickable}
          className={cn(
            "aspect-square flex items-center justify-center font-bold transition-all rounded-xl border-2",
            tileStyle
          )}
        >
          {isRevealing ? (
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          ) : showAsMine ? (
            <Bomb className="w-7 h-7 text-red-400" />
          ) : showAsSafe ? (
            <span className="text-2xl">🍩</span>
          ) : (
            <span className="text-zinc-600 text-lg">?</span>
          )}
        </button>
      );
    }
    return tiles;
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
        
        @keyframes donut-fly {
          0% { 
            transform: translate(0, 0) rotate(0deg) scale(1); 
            opacity: 1; 
          }
          100% { 
            transform: translate(var(--vx), var(--vy)) rotate(var(--rotation)) scale(0.3); 
            opacity: 0; 
          }
        }
        
        @keyframes coming-soon-fade {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
        .coming-soon-toast {
          animation: coming-soon-fade 1.5s ease-out forwards;
        }
      `}</style>

      {/* Coming Soon Toast */}
      {showComingSoon && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="coming-soon-toast absolute left-1/2 top-1/2 bg-zinc-900 border-2 border-amber-500 rounded-2xl px-6 py-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              <span className="text-lg font-bold text-white">COMING SOON</span>
            </div>
          </div>
        </div>
      )}

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${(i * 37 + 13) % 100}%`,
                top: '-60px',
                animationDelay: `${(i * 0.05) % 0.8}s`,
                fontSize: `${20 + (i % 3) * 8}px`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">BAKERY MINES</h1>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/30 animate-pulse">LIVE</span>
          </div>
          {context?.user?.pfpUrl ? (
            <img src={context.user.pfpUrl} alt="" className="h-7 w-7 rounded-full border border-zinc-700 object-cover" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
        </div>

        {/* Token selector */}
        <div className="flex gap-2 mb-2">
          <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-amber-500 text-black">
            🍩 DONUT
          </button>
          <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-zinc-900 border border-zinc-800 text-gray-600 opacity-50">
            ✨ SPRINKLES <span className="text-[8px]">SOON</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">BALANCE</div>
            <div className="text-sm font-bold">🍩{balance.toFixed(0)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MINES</div>
            <div className="text-sm font-bold text-red-400">{gameState?.mineCount || mineCount} 💣</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MULTIPLIER</div>
            <div className="text-sm font-bold text-green-400">{currentMultiplier.toFixed(2)}x</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={cn(
              "p-2 rounded-lg border transition-colors",
              isMuted ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-zinc-900 border-zinc-800"
            )}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowApprovals(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <Shield className="w-4 h-4" />
          </button>
          <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <History className="w-4 h-4" />
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Game Grid - Now bigger */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          {isWaitingForReveal ? (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto mb-3" />
              <div className="text-amber-400 font-bold">Setting up minefield...</div>
              <div className="text-[10px] text-gray-500 mt-1">House is placing mines</div>
            </div>
          ) : gameResult ? (
            <div className="text-center">
              <div className={cn(
                "text-4xl font-bold mb-2",
                gameResult === "won" ? "text-green-400" : "text-red-400"
              )}>
                {gameResult === "won" ? "🍩 CASHED OUT!" : "💥 BOOM!"}
              </div>
              {gameResult === "won" && gameState && (
                <div className="text-xl text-green-400">
                  +{(parseFloat(formatUnits(gameState.betAmount, 18)) * (Number(gameState.currentMultiplier) / 10000) * 0.98).toFixed(2)} 🍩
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Larger grid with explosion container */}
              <div className="relative w-full max-w-[320px]">
                <div className="grid grid-cols-5 gap-2">
                  {renderGrid()}
                </div>
                
                {/* Donut Explosions */}
                {explosions.map((tileIndex) => (
                  <DonutExplosion 
                    key={`explosion-${tileIndex}-${Date.now()}`}
                    tileIndex={tileIndex} 
                    onComplete={() => removeExplosion(tileIndex)} 
                  />
                ))}
              </div>
              
              {/* Current profit display */}
              {gameState?.status === GameStatus.Active && revealedCount > 0 && (
                <div className="mt-3 text-center">
                  <div className="text-[10px] text-gray-400">Current Profit</div>
                  <div className="text-lg font-bold text-green-400">+{currentProfit.toFixed(2)} 🍩</div>
                  <div className="text-[9px] text-gray-500">
                    Next: {(nextMultiplier / 10000).toFixed(2)}x
                  </div>
                </div>
              )}
              
              {/* Status message */}
              {!gameState && !isStartingGame && (
                <div className="mt-3 text-center text-gray-500 text-xs">
                  {mineCount} mines • {25 - mineCount} safe tiles • First reveal: {(getMultiplier(mineCount, 1) / 10000).toFixed(2)}x
                </div>
              )}
              
              {errorMessage && (
                <div className="mt-2 text-xs text-red-400">{errorMessage}</div>
              )}
            </>
          )}
        </div>

        {/* Controls - Collapsible with smooth animations */}
        <div className="space-y-2 pb-1">
          {/* Only show setup controls when no active game */}
          {!gameState && !isStartingGame && !isWaitingForReveal && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              <div className="flex items-center gap-2 h-14">
                {/* Mines button/panel */}
                <div 
                  className="relative h-12"
                  style={{
                    flex: expandedPanel === "mines" ? "1 1 auto" : "0 0 auto",
                    width: expandedPanel === "mines" ? "auto" : expandedPanel === "bet" ? "0px" : "auto",
                    opacity: expandedPanel === "bet" ? 0 : 1,
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden"
                  }}
                >
                  {expandedPanel === "mines" ? (
                    <div className="flex items-center gap-1 h-full">
                      {[1, 3, 5, 10, 24].map((count) => {
                        const isLocked = count !== 1;
                        const isSelected = mineCount === count;
                        
                        return (
                          <button
                            key={count}
                            onClick={() => {
                              if (isLocked) {
                                handleLockedMineClick();
                              } else {
                                setMineCount(count);
                                setExpandedPanel("none");
                                try { sdk.haptics.impactOccurred("light"); } catch {}
                              }
                            }}
                            className={cn(
                              "flex-1 h-full rounded-lg font-bold text-[10px] border-2 transition-all duration-200 relative",
                              isLocked 
                                ? "bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed"
                                : isSelected 
                                  ? "bg-red-500 border-red-500 text-white hover:scale-[1.02] active:scale-95"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:scale-[1.02] active:scale-95"
                            )}
                          >
                            <span className={cn(isLocked && "opacity-50")}>{count}</span>
                            {isLocked && (
                              <Lock className="w-3 h-3 absolute top-1 right-1 text-zinc-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setExpandedPanel("mines");
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      className="h-full px-4 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-200 hover:scale-[1.02] active:scale-95"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        borderColor: "rgba(239, 68, 68, 0.4)"
                      }}
                    >
                      <span className="text-[8px] text-gray-400">MINES</span>
                      <span className="text-sm font-bold text-red-400">{mineCount} 💣</span>
                    </button>
                  )}
                </div>

                {/* Bet Amount button/panel */}
                <div 
                  className="relative h-12"
                  style={{
                    flex: expandedPanel === "bet" ? "1 1 auto" : expandedPanel === "mines" ? "0 0 0px" : "1 1 auto",
                    opacity: expandedPanel === "mines" ? 0 : 1,
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    overflow: "hidden"
                  }}
                >
                  {expandedPanel === "bet" ? (
                    <div className="flex flex-col gap-1 h-full justify-center">
                      <div className="flex gap-1">
                        {["0.5", "1", "2", "5"].map((val) => (
                          <button
                            key={val}
                            onClick={() => {
                              setBetAmount(val);
                              try { sdk.haptics.impactOccurred("light"); } catch {}
                            }}
                            className="flex-1 py-1 text-[10px] rounded-lg border-2 font-bold transition-all duration-200 hover:scale-[1.02] active:scale-95"
                            style={{
                              backgroundColor: betAmount === val ? "rgb(245 158 11)" : "rgb(39 39 42)",
                              borderColor: betAmount === val ? "rgb(245 158 11)" : "rgb(63 63 70)",
                              color: betAmount === val ? "black" : "rgb(161 161 170)"
                            }}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={betAmount}
                          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBetAmount(e.target.value)}
                          className="flex-1 bg-zinc-800 border-2 border-zinc-700 rounded-lg px-2 py-0.5 text-center text-sm font-bold focus:border-amber-500 focus:outline-none transition-colors duration-200"
                        />
                        <button
                          onClick={() => {
                            setExpandedPanel("none");
                            try { sdk.haptics.impactOccurred("light"); } catch {}
                          }}
                          className="px-4 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 active:scale-95 transition-all duration-200"
                        >
                          ✓
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setExpandedPanel("bet");
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      className="w-full h-full rounded-lg bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center gap-2 transition-all duration-200 hover:bg-zinc-750 hover:border-zinc-600 active:scale-[0.98]"
                    >
                      <span className="text-[10px] text-gray-500">BET</span>
                      <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                      <span className="text-[10px] text-gray-500">🍩</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main Action Button */}
          {gameState?.status === GameStatus.Active ? (
            <button
              onClick={handleCashOut}
              disabled={isCashingOut || isCashOutPending || revealedCount === 0}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                revealedCount === 0
                  ? "bg-zinc-700 text-zinc-400"
                  : "bg-green-500 text-white hover:bg-green-400"
              )}
            >
              {isCashingOut || isCashOutPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cashing out...
                </span>
              ) : revealedCount === 0 ? (
                "Tap a tile to start"
              ) : (
                `CASH OUT ${(parseFloat(formatUnits(gameState.betAmount, 18)) * currentMultiplier * 0.98).toFixed(2)} 🍩`
              )}
            </button>
          ) : (
            <button
              onClick={handleStartGame}
              disabled={isStartingGame || isStartPending || isWaitingForReveal || !isConnected || parseFloat(betAmount || "0") <= 0}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                isStartingGame || isStartPending || isWaitingForReveal
                  ? "bg-zinc-500 text-zinc-300"
                  : "bg-white text-black hover:bg-gray-100"
              )}
            >
              {isStartingGame || isStartPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isStartPending ? "Confirm in wallet..." : "Starting..."}
                </span>
              ) : (
                "START GAME"
              )}
            </button>
          )}
        </div>

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col">
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <History className="w-4 h-4" /> Game History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Tap any game to verify. All results are provably fair.</p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {recentGames.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No games yet</p>
                  ) : (
                    recentGames.map((game, index) => {
                      const isWon = game.status === GameStatus.Won;
                      const isLost = game.status === GameStatus.Lost;
                      const tilesRevealed = countBits(game.revealedTiles);
                      const multiplier = Number(game.currentMultiplier) / 10000;
                      const gameIds = playerGameIds as bigint[] | undefined;
                      const gameId = gameIds ? gameIds[gameIds.length - 1 - index] : null;
                      const gameIdStr = gameId?.toString() || index.toString();
                      const isExpanded = expandedGameId === gameIdStr;
                      
                      return (
                        <div 
                          key={index}
                          onClick={() => setExpandedGameId(isExpanded ? null : gameIdStr)}
                          className={cn(
                            "p-2 rounded-lg border cursor-pointer transition-all", 
                            isWon ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20" : isLost ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20" : "bg-zinc-800 border-zinc-700"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xl", isWon ? "text-green-400" : "text-red-400")}>
                                {isWon ? "🍩" : "💥"}
                              </span>
                              <div>
                                <span className="text-xs text-gray-400">{game.mineCount} mines • {tilesRevealed} tiles</span>
                                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                  {multiplier.toFixed(2)}x <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                                </div>
                              </div>
                            </div>
                            <div className={cn("text-sm font-bold", isWon ? "text-green-400" : "text-red-400")}>
                              {isWon 
                                ? `+${parseFloat(formatUnits(game.payout, 18)).toFixed(2)}` 
                                : `-${parseFloat(formatUnits(game.betAmount, 18)).toFixed(2)}`
                              } 🍩
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-3 p-2 bg-zinc-900/80 rounded-lg border border-zinc-700 space-y-2">
                              <div className="text-[10px] text-amber-400 font-bold">🔐 Verification Data</div>
                              
                              <div className="space-y-1 text-[9px] font-mono">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Game ID:</span>
                                  <span className="text-white">{gameId?.toString() || "N/A"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Commit Block:</span>
                                  <span className="text-white">{game.commitBlock.toString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Mine Count:</span>
                                  <span className="text-white">{game.mineCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Tiles Revealed:</span>
                                  <span className={isWon ? "text-green-400" : "text-red-400"}>{tilesRevealed}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Mine Positions:</span>
                                  <span className="text-white font-mono text-[8px]">0x{game.minePositions.toString(16).padStart(8, '0')}</span>
                                </div>
                              </div>
                              
                              <div className="pt-2 border-t border-zinc-700">
                                <div className="text-[8px] text-amber-400/80 font-mono bg-zinc-800 p-1.5 rounded break-all">
                                  mines = keccak256(blockhash + gameId)
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                
                <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" /> How to Play
                </h2>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Choose Mine Count</div>
                      <div className="text-[11px] text-gray-400">More mines = higher multipliers but more risk!</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Set Your Bet</div>
                      <div className="text-[11px] text-gray-400">Choose how much DONUT to wager (0.1 - 10).</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Reveal Tiles</div>
                      <div className="text-[11px] text-gray-400">Each safe 🍩 tile increases your multiplier!</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                    <div>
                      <div className="font-semibold text-green-400 text-xs">Cash Out Anytime!</div>
                      <div className="text-[11px] text-gray-400">Take your winnings before hitting a 💣 mine!</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Mine Configurations:</div>
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    <div><span className="text-green-400">1 mine:</span> Low risk, up to 6.86x</div>
                    <div className="flex items-center gap-1"><Lock className="w-3 h-3 text-zinc-500" /><span className="text-zinc-500">3 mines:</span> <span className="text-zinc-600">Coming soon</span></div>
                    <div className="flex items-center gap-1"><Lock className="w-3 h-3 text-zinc-500" /><span className="text-zinc-500">5 mines:</span> <span className="text-zinc-600">Coming soon</span></div>
                    <div className="flex items-center gap-1"><Lock className="w-3 h-3 text-zinc-500" /><span className="text-zinc-500">10 mines:</span> <span className="text-zinc-600">Coming soon</span></div>
                    <div className="flex items-center gap-1"><Lock className="w-3 h-3 text-zinc-500" /><span className="text-zinc-500">24 mines:</span> <span className="text-zinc-600">Coming soon</span></div>
                  </div>
                </div>
                
                <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Fee Structure:</div>
                  <div className="text-[10px] text-gray-400">On Win: 2% house edge</div>
                  <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
                </div>
                
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
              </div>
            </div>
          </div>
        )}

        {/* Approvals Modal */}
        {showApprovals && (
          <ApprovalsModal 
            onClose={() => setShowApprovals(false)} 
            refetchAllowance={refetchAllowance}
          />
        )}
      </div>
      <NavBar />
    </main>
  );
}