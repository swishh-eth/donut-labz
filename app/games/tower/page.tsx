"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Volume2, VolumeX, Shield, ChevronDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const DONUT_TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;
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

const TOWER_ABI = [
  {
    inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "difficulty", type: "uint8" }],
    name: "startGame",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }, { name: "tileChoice", type: "uint8" }],
    name: "climbLevel",
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
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "games",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "difficulty", type: "uint8" },
      { name: "commitBlock", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "currentLevel", type: "uint8" },
      { name: "trapPositions", type: "uint256" },
      { name: "currentMultiplier", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

const DIFFICULTIES = [
  { name: "Easy", tiles: 4, safe: 3, color: "green" },
  { name: "Medium", tiles: 3, safe: 2, color: "amber" },
  { name: "Hard", tiles: 2, safe: 1, color: "orange" },
  { name: "Expert", tiles: 3, safe: 1, color: "red" },
  { name: "Master", tiles: 4, safe: 1, color: "purple" },
];

const MULTIPLIER_TABLES = [
  [13066, 17422, 23229, 30972, 41296, 55061, 73415, 97887, 130516],
  [14848, 22497, 34086, 51645, 78250, 118561, 179638, 272179, 412392],
  [19600, 39200, 78400, 156800, 313600, 627200, 1254400, 2508800, 5017600],
  [29400, 88200, 264600, 793800, 2381400, 7144200, 21432600, 64297800, 192893400],
  [39200, 156800, 627200, 2508800, 10035200, 40140800, 160563200, 642252800, 2569011200],
];

enum GameStatus {
  None = 0,
  Pending = 1,
  Active = 2,
  Won = 3,
  Lost = 4
}

interface GameState {
  player: string;
  betAmount: bigint;
  difficulty: number;
  status: number;
  currentLevel: number;
  trapPositions: bigint;
  currentMultiplier: bigint;
}

// Approvals Modal Component
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("100");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_TOWER_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    const parsedAmount = parseFloat(amount || "0");
    if (parsedAmount <= 0) return;
    
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_TOWER_ADDRESS, parseUnits(amount, 18)]
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
      args: [DONUT_TOWER_ADDRESS, BigInt(0)]
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
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Tower contract.</p>
          
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
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-gray-500">DONUT</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(approvalAmount)}
                disabled={isPending || parseFloat(approvalAmount || "0") <= 0}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {isPending ? "..." : "Approve"}
              </button>
              {isApproved && (
                <button
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
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

export default function TowerPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // UI State
  const [difficulty, setDifficulty] = useState(0);
  const [betAmount, setBetAmount] = useState("1");
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [expandedControl, setExpandedControl] = useState<"risk" | "bet" | null>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [recentGames, setRecentGames] = useState<GameState[]>([]);

  // Game State - Simple and clean
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Loading States - One for each action
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isClimbing, setIsClimbing] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [isWaitingForReveal, setIsWaitingForReveal] = useState(false);
  const [buildingCountdown, setBuildingCountdown] = useState(15);

  // Refs to prevent duplicate processing
  const processedStartHash = useRef<string | null>(null);
  const processedClimbHash = useRef<string | null>(null);

  // Audio
  const audioContext = useRef<AudioContext | null>(null);
  
  const playSound = useCallback((type: "climb" | "win" | "lose") => {
    if (!soundEnabled) return;
    try {
      if (!audioContext.current) audioContext.current = new AudioContext();
      const ctx = audioContext.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === "climb") {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } else if (type === "win") {
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        setTimeout(() => osc.frequency.setValueAtTime(659, ctx.currentTime), 100);
        setTimeout(() => osc.frequency.setValueAtTime(784, ctx.currentTime), 200);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      }
    } catch {}
  }, [soundEnabled]);

  // Contract reads
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_TOWER_ADDRESS] : undefined,
  });

  const { data: contractActiveGameId, refetch: refetchActiveGame } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_ABI,
    functionName: "getPlayerActiveGame",
    args: address ? [address] : undefined,
  });

  const { data: playerGameIds, refetch: refetchPlayerGames } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_ABI,
    functionName: "getPlayerGames",
    args: address ? [address] : undefined,
  });

  // Contract writes
  const { data: startHash, writeContract: writeStart, isPending: isStartPending, error: startError, reset: resetStart } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });

  const { data: climbHash, writeContract: writeClimb, isPending: isClimbPending, error: climbError, reset: resetClimb } = useWriteContract();
  const { isSuccess: isClimbSuccess } = useWaitForTransactionReceipt({ hash: climbHash });

  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

  // Computed values
  const config = gameState ? DIFFICULTIES[gameState.difficulty] : DIFFICULTIES[difficulty];
  const multipliers = MULTIPLIER_TABLES[gameState?.difficulty ?? difficulty];
  const currentMult = gameState && gameState.currentLevel > 0
    ? Number(gameState.currentMultiplier) / 10000
    : 1;
  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const payout = gameState ? (parseFloat(formatUnits(gameState.betAmount, 18)) * currentMult * 0.98) : 0;

  // Get trap position for a level (4 bits per level - matching contract!)
  const getTrap = (level: number): number => {
    if (!gameState) return -1;
    // Contract uses 4-bit slots: trapPositions |= uint256(trapTile) << (level * 4)
    const shift = BigInt(level * 4);
    const mask = BigInt(0xF); // 4 bits
    return Number((gameState.trapPositions >> shift) & mask);
  };

  // ===========================================
  // FETCH GAME STATE - Single source of truth
  // ===========================================
  const fetchGameState = useCallback(async (gameId: bigint) => {
    if (!publicClient) return null;
    try {
      const game = await publicClient.readContract({
        address: DONUT_TOWER_ADDRESS,
        abi: TOWER_ABI,
        functionName: "games",
        args: [gameId],
        blockTag: 'latest',
      }) as unknown as any[];

      return {
        player: game[0],
        betAmount: game[2],
        difficulty: Number(game[3]),
        status: Number(game[5]),
        currentLevel: Number(game[6]),
        trapPositions: game[7],
        currentMultiplier: game[8],
      } as GameState;
    } catch (e) {
      console.error("Error fetching game:", e);
      return null;
    }
  }, [publicClient]);

  // ===========================================
  // LOAD EXISTING GAME ON MOUNT
  // ===========================================
  useEffect(() => {
    const loadGame = async () => {
      if (!contractActiveGameId || contractActiveGameId === BigInt(0) || !publicClient) {
        setActiveGameId(null);
        setGameState(null);
        return;
      }

      const state = await fetchGameState(contractActiveGameId);
      if (state) {
        setActiveGameId(contractActiveGameId);
        setGameState(state);
        if (state.status === GameStatus.Pending) {
          setIsWaitingForReveal(true);
        }
      }
    };
    loadGame();
  }, [contractActiveGameId, publicClient, fetchGameState]);

  // ===========================================
  // POLL FOR REVEAL (when game is pending)
  // ===========================================
  useEffect(() => {
    if (!isWaitingForReveal || !activeGameId || !publicClient) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      while (!cancelled && attempts < 60) {
        attempts++;
        
        // Call reveal API
        try { await fetch('/api/reveal?game=tower'); } catch {}
        
        await new Promise(r => setTimeout(r, 2000));
        if (cancelled) return;

        const state = await fetchGameState(activeGameId);
        if (state && state.status === GameStatus.Active) {
          setGameState(state);
          setIsWaitingForReveal(false);
          setIsStartingGame(false);
          return;
        }
      }

      if (!cancelled) {
        setErrorMessage("Timeout - please refresh");
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [isWaitingForReveal, activeGameId, publicClient, fetchGameState]);

  // Countdown timer when building
  useEffect(() => {
    if (!isWaitingForReveal) {
      setBuildingCountdown(15);
      return;
    }

    const interval = setInterval(() => {
      setBuildingCountdown(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);

    return () => clearInterval(interval);
  }, [isWaitingForReveal]);

  // Fetch game history when modal opens
  useEffect(() => {
    if (!showHistory || !playerGameIds || !publicClient) return;
    
    const fetchHistory = async () => {
      const ids = playerGameIds as bigint[];
      if (!ids || ids.length === 0) {
        setRecentGames([]);
        return;
      }
      
      const games: GameState[] = [];
      const idsToFetch = ids.slice(-5).reverse();
      
      for (const id of idsToFetch) {
        try {
          const game = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "games",
            args: [id],
          }) as unknown as any[];
          
          games.push({
            player: game[0],
            betAmount: game[2],
            difficulty: Number(game[3]),
            status: Number(game[5]),
            currentLevel: Number(game[6]),
            trapPositions: game[7],
            currentMultiplier: game[8],
          });
          
          await new Promise(r => setTimeout(r, 100));
        } catch {}
      }
      
      setRecentGames(games);
    };
    
    fetchHistory();
  }, [showHistory, playerGameIds, publicClient]);


  // ===========================================
  // START GAME
  // ===========================================
  const handleStartGame = () => {
    if (!isConnected || isStartingGame || activeGameId) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet 0.1-10 DONUT");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }

    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Insufficient balance");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }

    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      return;
    }

    setIsStartingGame(true);
    setExpandedControl(null);
    processedStartHash.current = null;

    writeStart({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "startGame",
      args: [DONUT_TOKEN_ADDRESS, amountWei, difficulty]
    });
  };

  // Handle start success
  useEffect(() => {
    if (!isStartSuccess || !startHash || !publicClient || !address) return;
    if (processedStartHash.current === startHash) return;
    processedStartHash.current = startHash;

    const getGameId = async () => {
      // Poll for game ID
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        try {
          const gameId = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "getPlayerActiveGame",
            args: [address],
            blockTag: 'latest',
          }) as bigint;

          if (gameId && gameId > BigInt(0)) {
            setActiveGameId(gameId);
            setIsWaitingForReveal(true);
            return;
          }
        } catch {}
      }

      setErrorMessage("Could not find game - refresh");
      setIsStartingGame(false);
    };

    getGameId();
  }, [isStartSuccess, startHash, publicClient, address]);

  // Handle start error
  useEffect(() => {
    if (startError && isStartingGame) {
      const msg = startError.message || "";
      setErrorMessage(msg.includes("rejected") ? "Cancelled" : "Failed to start");
      setIsStartingGame(false);
      resetStart();
      setTimeout(() => setErrorMessage(null), 2000);
    }
  }, [startError, isStartingGame, resetStart]);

  // ===========================================
  // CLIMB (Click Tile)
  // ===========================================
  const handleTileClick = (tileIndex: number) => {
    // Guard: must have active game
    if (!activeGameId || !gameState) return;
    // Guard: game must be active
    if (gameState.status !== GameStatus.Active) return;
    // Guard: not already climbing
    if (isClimbing || isClimbPending) return;

    setIsClimbing(true);
    processedClimbHash.current = null;

    writeClimb({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "climbLevel",
      args: [activeGameId, tileIndex]
    });
  };

  // Handle climb - poll for state change instead of relying solely on tx receipt
  useEffect(() => {
    if (!isClimbing || !activeGameId || !publicClient) return;
    if (!climbHash && !isClimbPending) return; // Not started yet
    
    // If we have a hash, start polling for state change
    if (!climbHash) return;
    
    // Prevent duplicate processing
    if (processedClimbHash.current === climbHash) return;
    processedClimbHash.current = climbHash;

    console.log("Climb tx sent, polling for state change...", climbHash);

    const gameIdToFetch = activeGameId;
    const startLevel = gameState?.currentLevel ?? 0;
    let cancelled = false;

    const pollForUpdate = async () => {
      // Wait a bit for chain to process
      await new Promise(r => setTimeout(r, 2000));
      
      // Poll up to 15 times (30 seconds total)
      for (let i = 0; i < 15 && !cancelled; i++) {
        try {
          const newState = await fetchGameState(gameIdToFetch);
          
          if (!newState) {
            console.log("Poll attempt", i + 1, "- no state");
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          // Check if state changed (level increased, or game ended)
          const levelChanged = newState.currentLevel !== startLevel;
          const gameEnded = newState.status === GameStatus.Lost || newState.status === GameStatus.Won;
          
          console.log("Poll attempt", i + 1, "- level:", newState.currentLevel, "status:", newState.status, "changed:", levelChanged || gameEnded);

          if (levelChanged || gameEnded) {
            if (cancelled) return;
            
            // Update state
            setGameState(newState);
            setIsClimbing(false);
            resetClimb();

            // Handle game end
            if (newState.status === GameStatus.Lost) {
              playSound("lose");
              try { sdk.haptics.impactOccurred("heavy"); } catch {}
              setGameResult("lost");
              
              setTimeout(() => {
                setActiveGameId(null);
                setGameState(null);
                setGameResult(null);
                refetchActiveGame();
                refetchBalance();
              }, 3000);
            } else if (newState.status === GameStatus.Won) {
              playSound("win");
              try { sdk.haptics.impactOccurred("heavy"); } catch {}
              setGameResult("won");
              setShowConfetti(true);
              
              setTimeout(() => {
                setShowConfetti(false);
                setActiveGameId(null);
                setGameState(null);
                setGameResult(null);
                refetchActiveGame();
                refetchBalance();
              }, 3000);
            } else {
              // Successfully climbed
              playSound("climb");
              try { sdk.haptics.impactOccurred("medium"); } catch {}
            }
            return;
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
        
        await new Promise(r => setTimeout(r, 2000));
      }

      // Timeout - reset state
      if (!cancelled) {
        console.log("Climb poll timeout");
        setIsClimbing(false);
        resetClimb();
        setErrorMessage("Sync issue - tap tile again");
        setTimeout(() => setErrorMessage(null), 3000);
      }
    };

    pollForUpdate();
    
    return () => { cancelled = true; };
  }, [isClimbing, climbHash, isClimbPending, activeGameId, publicClient, gameState?.currentLevel, fetchGameState, playSound, refetchActiveGame, refetchBalance, resetClimb]);

  // Handle climb error
  useEffect(() => {
    if (climbError && isClimbing) {
      console.error("Climb error:", climbError);
      setIsClimbing(false);
      resetClimb();
      const msg = climbError.message || "";
      setErrorMessage(msg.includes("rejected") ? "Cancelled" : "Failed");
      setTimeout(() => setErrorMessage(null), 2000);
    }
  }, [climbError, isClimbing, resetClimb]);

  // ===========================================
  // CASH OUT
  // ===========================================
  const handleCashOut = () => {
    if (!activeGameId || !gameState || isCashingOut) return;
    if (gameState.status !== GameStatus.Active) return;
    if (gameState.currentLevel === 0) return;

    setIsCashingOut(true);
    writeCashOut({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "cashOut",
      args: [activeGameId]
    });
  };

  useEffect(() => {
    if (isCashOutSuccess && isCashingOut) {
      playSound("win");
      setGameResult("won");
      setShowConfetti(true);
      
      setTimeout(() => {
        setShowConfetti(false);
        setActiveGameId(null);
        setGameState(null);
        setGameResult(null);
        setIsCashingOut(false);
        refetchActiveGame();
        refetchBalance();
      }, 3000);
    }
  }, [isCashOutSuccess, isCashingOut, playSound, refetchActiveGame, refetchBalance]);

  // ===========================================
  // RENDER TOWER
  // ===========================================
  const renderTower = () => {
    const inGame = gameState?.status === GameStatus.Active;
    const ended = gameState && (gameState.status === GameStatus.Lost || gameState.status === GameStatus.Won);
    const level = gameState?.currentLevel ?? 0;

    // Show 3 levels at a time (current + adjacent)
    const visibleLevels = ended 
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8]
      : inGame 
        ? [Math.max(0, level - 1), level, Math.min(8, level + 1)].filter((v, i, a) => a.indexOf(v) === i)
        : [0, 1, 2];

    return (
      <div className={cn(
        "flex flex-col-reverse gap-4 transition-all duration-500",
        ended && "scale-75 origin-bottom"
      )}>
        {visibleLevels.map((l) => {
          const trap = getTrap(l);
          const isCurrent = inGame && level === l;
          const isPast = level > l;
          const mult = multipliers[l] / 10000;
          
          // Can only click tiles on current level when not climbing
          const canClick = isCurrent && !isClimbing && !isClimbPending && !ended;

          return (
            <div 
              key={l}
              className={cn(
                "flex flex-col items-center gap-2 transition-all duration-300",
                !isCurrent && !ended && "opacity-40 scale-95"
              )}
            >
              {/* Level label */}
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-mono px-2 py-0.5 rounded",
                  isPast ? "bg-green-500/20 text-green-400" :
                  isCurrent ? "bg-amber-500/20 text-amber-400" :
                  "bg-zinc-800 text-zinc-500"
                )}>
                  {mult >= 1000 ? `${(mult/1000).toFixed(0)}K` : mult.toFixed(1)}x
                </span>
                <span className={cn(
                  "text-[10px] font-bold",
                  isPast ? "text-green-400" : isCurrent ? "text-amber-400" : "text-zinc-600"
                )}>
                  LVL {l + 1}
                </span>
              </div>

              {/* Tiles */}
              <div className="flex gap-2">
                {Array.from({ length: config.tiles }).map((_, t) => {
                  // For safe > 1: trap value = bad tile
                  // For safe = 1: trap value = safe tile (inverted)
                  const isSafe = config.safe > 1 ? t !== trap : t === trap;
                  const showResult = ended || isPast;

                  return (
                    <button
                      key={t}
                      onClick={() => canClick && handleTileClick(t)}
                      disabled={!canClick}
                      className={cn(
                        "w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-200",
                        // Result states
                        showResult && isSafe && "bg-green-500/20 border-green-500/50",
                        showResult && !isSafe && "bg-red-500/20 border-red-500/50",
                        // Current level
                        !showResult && isCurrent && "bg-amber-500/20 border-amber-500",
                        // Future levels
                        !showResult && !isCurrent && "bg-zinc-800 border-zinc-700",
                        // Clickable
                        canClick && "hover:scale-105 hover:bg-amber-500/30 active:scale-95 cursor-pointer",
                        // Loading
                        isClimbing && isCurrent && "animate-pulse"
                      )}
                    >
                      {showResult ? (
                        isSafe ? <span className="text-xl">🍩</span> : <span className="text-xl">💀</span>
                      ) : isClimbing && isCurrent ? (
                        <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                      ) : (
                        <span className="text-zinc-500">?</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ===========================================
  // RENDER
  // ===========================================
  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      <div className="w-full max-w-md flex flex-col h-full pb-16">
        <NavBar />
        
        <div className="flex-1 px-4 py-2 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wide">DONUT TOWER</h1>
              {gameState?.status === GameStatus.Active && (
                <span className="px-2 py-0.5 text-[10px] bg-green-500 text-black rounded-full font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>
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

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">BALANCE</div>
              <div className="text-sm font-bold text-amber-400">{balance.toFixed(0)} 🍩</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">LEVEL</div>
              <div className="text-sm font-bold">{gameState ? `${gameState.currentLevel}/9` : "-"}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">MULTIPLIER</div>
              <div className="text-sm font-bold text-green-400">{currentMult.toFixed(2)}x</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mb-3">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowApprovals(true)}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700"
            >
              <Shield className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700"
            >
              <History className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 rounded-lg bg-zinc-800 border border-zinc-700"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Tower Area */}
          <div className={cn(
            "flex-1 flex items-center justify-center relative min-h-[300px]",
            gameResult && "overflow-auto"
          )}>
            {/* Result overlay */}
            {gameResult && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50 pointer-events-none">
                <div className={cn(
                  "text-2xl font-bold px-6 py-3 rounded-xl",
                  gameResult === "won" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {gameResult === "won" ? `🎉 +${payout.toFixed(2)} 🍩` : "💀 FELL!"}
                </div>
              </div>
            )}

            {/* Waiting state */}
            {isWaitingForReveal && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="text-center px-4">
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-2" />
                  <div className="text-amber-400 font-bold mb-2">Building your tower...</div>
                  <div className="text-[11px] text-gray-400 mb-1">
                    Loading may take a few seconds due to onchain verification
                  </div>
                  {buildingCountdown > 0 ? (
                    <div className="text-[10px] text-gray-500">
                      Please wait... <span className="text-amber-400 font-bold">{buildingCountdown}s</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-red-400">
                      Taking longer than expected? Try refreshing the miniapp!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tower */}
            <div className={cn(
              "transition-all duration-300",
              isWaitingForReveal && "opacity-30 blur-sm"
            )}>
              {renderTower()}
            </div>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-center text-red-400 text-sm mb-2">
              {errorMessage}
            </div>
          )}

          {/* Controls */}
          <div className="space-y-2 pb-4 mt-auto">
            {/* Setup controls - collapsible like mines */}
            {!gameState && !isStartingGame && !isWaitingForReveal && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                <div className="flex items-center gap-2 h-14">
                  {/* Difficulty button/panel */}
                  <div 
                    className="relative h-12"
                    style={{
                      flex: expandedControl === "risk" ? "1 1 auto" : "0 0 auto",
                      width: expandedControl === "risk" ? "auto" : expandedControl === "bet" ? "0px" : "auto",
                      opacity: expandedControl === "bet" ? 0 : 1,
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      overflow: "hidden"
                    }}
                  >
                    {expandedControl === "risk" ? (
                      <div className="flex items-center gap-1 h-full">
                        {DIFFICULTIES.map((d, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setDifficulty(i);
                              setExpandedControl(null);
                              try { sdk.haptics.impactOccurred("light"); } catch {}
                            }}
                            className="flex-1 h-full rounded-lg font-bold text-[9px] border-2 transition-all duration-200 hover:scale-[1.02] active:scale-95"
                            style={{
                              backgroundColor: difficulty === i ? `rgb(${d.color === "green" ? "34 197 94" : d.color === "amber" ? "245 158 11" : d.color === "orange" ? "249 115 22" : d.color === "red" ? "239 68 68" : "168 85 247"})` : "rgb(39 39 42)",
                              borderColor: difficulty === i ? `rgb(${d.color === "green" ? "34 197 94" : d.color === "amber" ? "245 158 11" : d.color === "orange" ? "249 115 22" : d.color === "red" ? "239 68 68" : "168 85 247"})` : "rgb(63 63 70)",
                              color: difficulty === i ? (d.color === "amber" || d.color === "green" ? "black" : "white") : "rgb(161 161 170)"
                            }}
                          >
                            {d.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setExpandedControl("risk");
                          try { sdk.haptics.impactOccurred("light"); } catch {}
                        }}
                        className="h-full px-4 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-200 hover:scale-[1.02] active:scale-95"
                        style={{
                          backgroundColor: `rgba(${DIFFICULTIES[difficulty].color === "green" ? "34, 197, 94" : DIFFICULTIES[difficulty].color === "amber" ? "245, 158, 11" : DIFFICULTIES[difficulty].color === "orange" ? "249, 115, 22" : DIFFICULTIES[difficulty].color === "red" ? "239, 68, 68" : "168, 85, 247"}, 0.15)`,
                          borderColor: `rgba(${DIFFICULTIES[difficulty].color === "green" ? "34, 197, 94" : DIFFICULTIES[difficulty].color === "amber" ? "245, 158, 11" : DIFFICULTIES[difficulty].color === "orange" ? "249, 115, 22" : DIFFICULTIES[difficulty].color === "red" ? "239, 68, 68" : "168, 85, 247"}, 0.4)`
                        }}
                      >
                        <span className="text-[8px] text-gray-400">RISK</span>
                        <span className={cn(
                          "text-sm font-bold",
                          DIFFICULTIES[difficulty].color === "green" && "text-green-400",
                          DIFFICULTIES[difficulty].color === "amber" && "text-amber-400",
                          DIFFICULTIES[difficulty].color === "orange" && "text-orange-400",
                          DIFFICULTIES[difficulty].color === "red" && "text-red-400",
                          DIFFICULTIES[difficulty].color === "purple" && "text-purple-400"
                        )}>{DIFFICULTIES[difficulty].name}</span>
                      </button>
                    )}
                  </div>

                  {/* Bet Amount button/panel */}
                  <div 
                    className="relative h-12"
                    style={{
                      flex: expandedControl === "bet" ? "1 1 auto" : expandedControl === "risk" ? "0 0 0px" : "1 1 auto",
                      opacity: expandedControl === "risk" ? 0 : 1,
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      overflow: "hidden"
                    }}
                  >
                    {expandedControl === "bet" ? (
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
                              setExpandedControl(null);
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
                          setExpandedControl("bet");
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

            {/* Main button */}
            {gameState?.status === GameStatus.Active ? (
              <button
                onClick={handleCashOut}
                disabled={gameState.currentLevel === 0 || isCashingOut || isCashOutPending}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-lg transition-all",
                  gameState.currentLevel === 0
                    ? "bg-zinc-700 text-zinc-400"
                    : "bg-green-500 text-black hover:bg-green-400"
                )}
              >
                {isCashingOut || isCashOutPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Cashing out...
                  </span>
                ) : gameState.currentLevel === 0 ? (
                  "Climb first!"
                ) : (
                  `CASH OUT ${payout.toFixed(2)} 🍩`
                )}
              </button>
            ) : (
              <button
                onClick={handleStartGame}
                disabled={isStartingGame || isStartPending || isWaitingForReveal || !isConnected}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-lg transition-all",
                  isStartingGame || isStartPending || isWaitingForReveal
                    ? "bg-zinc-600 text-zinc-300"
                    : "bg-white text-black hover:bg-gray-100"
                )}
              >
                {isStartingGame || isStartPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Starting...
                  </span>
                ) : isWaitingForReveal ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Building...
                  </span>
                ) : (
                  "START CLIMB"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovals && (
        <ApprovalsModal 
          onClose={() => setShowApprovals(false)} 
          refetchAllowance={refetchAllowance}
        />
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
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Choose Difficulty</div>
                    <div className="text-[11px] text-gray-400">Easy = 3/4 safe tiles. Master = 1/4 safe tiles!</div>
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
                    <div className="font-semibold text-white text-xs">Climb The Tower</div>
                    <div className="text-[11px] text-gray-400">Pick tiles to climb - avoid the 💀 traps!</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-green-400 text-xs">Cash Out Anytime!</div>
                    <div className="text-[11px] text-gray-400">Take your winnings or reach level 9 for max payout!</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Difficulty Modes:</div>
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  <div><span className="text-green-400">Easy:</span> 4 tiles, 3 safe (75%) - Max 13.05x</div>
                  <div><span className="text-amber-400">Medium:</span> 3 tiles, 2 safe (66%) - Max 41.24x</div>
                  <div><span className="text-orange-400">Hard:</span> 2 tiles, 1 safe (50%) - Max 501.76x</div>
                  <div><span className="text-red-400">Expert:</span> 3 tiles, 1 safe (33%) - Max 19,289x</div>
                  <div><span className="text-purple-400">Master:</span> 4 tiles, 1 safe (25%) - Max 256,901x</div>
                </div>
              </div>
              
              <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Fee Structure:</div>
                <div className="text-[10px] text-gray-400">On Win: 2% house edge (deducted from winnings)</div>
                <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
              </div>
              
              <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
            </div>
          </div>
        </div>
      )}

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
                    const multiplier = Number(game.currentMultiplier) / 10000;
                    const gameIds = playerGameIds as bigint[] | undefined;
                    const gameId = gameIds ? gameIds[gameIds.length - 1 - index] : null;
                    const gameIdStr = gameId?.toString() || index.toString();
                    const isExpanded = expandedGameId === gameIdStr;
                    const diffConfig = DIFFICULTIES[game.difficulty];
                    
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
                              {isWon ? "🏆" : "💀"}
                            </span>
                            <div>
                              <span className="text-xs text-gray-400">{diffConfig.name} • Level {game.currentLevel}</span>
                              <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                {multiplier.toFixed(2)}x <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                              </div>
                            </div>
                          </div>
                          <div className={cn("text-sm font-bold", isWon ? "text-green-400" : "text-red-400")}>
                            {isWon 
                              ? `+${(parseFloat(formatUnits(game.betAmount, 18)) * multiplier * 0.98).toFixed(2)}` 
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
                                <span className="text-gray-500">Difficulty:</span>
                                <span className="text-white">{diffConfig.name} ({diffConfig.safe}/{diffConfig.tiles} safe)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Level Reached:</span>
                                <span className={isWon ? "text-green-400" : "text-red-400"}>{game.currentLevel}/9</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Multiplier:</span>
                                <span className="text-white">{multiplier.toFixed(2)}x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Trap Positions:</span>
                                <span className="text-white font-mono text-[8px]">0x{game.trapPositions.toString(16).padStart(9, '0')}</span>
                              </div>
                            </div>
                            
                            <div className="pt-2 border-t border-zinc-700">
                              <div className="text-[8px] text-amber-400/80 font-mono bg-zinc-800 p-1.5 rounded break-all">
                                traps = keccak256(blockhash + gameId + level)
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
    </main>
  );
}