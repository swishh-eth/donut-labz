"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Volume2, VolumeX, ChevronDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const DONUT_TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;

// ABIs
const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

const TOWER_ABI = [
  { inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "difficulty", type: "uint8" }], name: "startGame", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }, { name: "tileChoice", type: "uint8" }], name: "climbLevel", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }], name: "cashOut", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "player", type: "address" }], name: "getPlayerActiveGame", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "player", type: "address" }], name: "getPlayerGames", outputs: [{ type: "uint256[]" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }], name: "games", outputs: [
    { name: "player", type: "address" },
    { name: "token", type: "address" },
    { name: "betAmount", type: "uint256" },
    { name: "difficulty", type: "uint8" },
    { name: "commitBlock", type: "uint256" },
    { name: "status", type: "uint8" },
    { name: "currentLevel", type: "uint8" },
    { name: "trapPositions", type: "uint256" },
    { name: "currentMultiplier", type: "uint256" }
  ], stateMutability: "view", type: "function" },
] as const;

const GameStatus = { None: 0, Pending: 1, Active: 2, Won: 3, Lost: 4 };

const DIFFICULTIES = [
  { name: "Easy", tiles: 4, safe: 3, color: "green" },
  { name: "Medium", tiles: 3, safe: 2, color: "amber" },
  { name: "Hard", tiles: 2, safe: 1, color: "orange" },
  { name: "Expert", tiles: 3, safe: 1, color: "red" },
  { name: "Master", tiles: 4, safe: 1, color: "purple" },
];

// Multiplier tables matching contract exactly (in basis points, 10000 = 1x)
const MULTIPLIER_TABLES = [
  [13066, 17422, 23229, 30972, 41296, 55061, 73415, 97887, 130516],
  [14848, 22497, 34086, 51645, 78250, 118561, 179638, 272179, 412392],
  [19600, 39200, 78400, 156800, 313600, 627200, 1254400, 2508800, 5017600],
  [29400, 88200, 264600, 793800, 2381400, 7144200, 21432600, 64297800, 192893400],
  [39200, 156800, 627200, 2508800, 10035200, 40140800, 160563200, 642252800, 2569011200],
];

interface GameState {
  player: string;
  betAmount: bigint;
  difficulty: number;
  status: number;
  currentLevel: number;
  trapPositions: bigint;
  currentMultiplier: bigint;
}

interface HistoryGame {
  gameId: bigint;
  player: string;
  betAmount: bigint;
  difficulty: number;
  commitBlock: bigint;
  status: number;
  currentLevel: number;
  trapPositions: bigint;
  currentMultiplier: bigint;
}

export default function DonutTowerPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const towerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const processedStartHash = useRef<string | null>(null);
  const processedClimbHash = useRef<string | null>(null);

  // UI State
  const [context, setContext] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [hasShownApproval, setHasShownApproval] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Game setup
  const [difficulty, setDifficulty] = useState(0);
  const [betAmount, setBetAmount] = useState("1");
  const [expandedControl, setExpandedControl] = useState<string | null>(null);

  // Game state
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isWaitingForReveal, setIsWaitingForReveal] = useState(false);
  const [isClimbing, setIsClimbing] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);
  
  // Tower view state
  const [showFullTower, setShowFullTower] = useState(false);

  // History state
  const [historyGames, setHistoryGames] = useState<HistoryGame[]>([]);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Sounds
  const playSound = useCallback((freq: number, type: OscillatorType = "sine", duration = 0.1) => {
    if (isMuted) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [isMuted]);

  const playClimbSound = useCallback(() => playSound(800), [playSound]);
  const playWinSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = new AudioContext();
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.2);
      });
    } catch {}
  }, [isMuted]);
  const playLoseSound = useCallback(() => playSound(200, "sawtooth", 0.3), [playSound]);

  // Load context
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx);
      } catch {}
    };
    load();
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

  // Read balance
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
    args: address ? [address, DONUT_TOWER_ADDRESS] : undefined,
  });

  // Read active game
  const { data: contractActiveGameId, refetch: refetchActiveGame } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_ABI,
    functionName: "getPlayerActiveGame",
    args: address ? [address] : undefined,
  });

  // Read player games for history
  const { data: playerGameIds, refetch: refetchPlayerGames } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_ABI,
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

  // Fetch game state when active game changes
  useEffect(() => {
    const fetchGame = async () => {
      if (!publicClient || !contractActiveGameId || contractActiveGameId === BigInt(0)) {
        setActiveGameId(null);
        setGameState(null);
        return;
      }

      try {
        const game = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [contractActiveGameId],
          blockTag: 'latest',
        }) as unknown as any[];

        setActiveGameId(contractActiveGameId);
        setGameState({
          player: game[0],
          betAmount: game[2],
          difficulty: Number(game[3]),
          status: Number(game[5]),
          currentLevel: Number(game[6]),
          trapPositions: game[7],
          currentMultiplier: game[8],
        });

        if (Number(game[5]) === GameStatus.Pending) {
          setIsWaitingForReveal(true);
        } else {
          setIsWaitingForReveal(false);
        }
      } catch (e) {
        console.error("Error fetching game:", e);
      }
    };

    fetchGame();
  }, [publicClient, contractActiveGameId]);

  // Poll for reveal when waiting (page reload)
  useEffect(() => {
    if (!isWaitingForReveal || !activeGameId || !publicClient || isStartingGame) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        await fetch('/api/reveal?game=tower');
      } catch {}
      await new Promise(r => setTimeout(r, 4000));
      if (cancelled) return;

      try {
        const game = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [activeGameId],
          blockTag: 'latest',
        }) as unknown as any[];

        if (Number(game[5]) === GameStatus.Active) {
          setGameState({
            player: game[0],
            betAmount: game[2],
            difficulty: Number(game[3]),
            status: Number(game[5]),
            currentLevel: Number(game[6]),
            trapPositions: game[7],
            currentMultiplier: game[8],
          });
          setIsWaitingForReveal(false);
        }
      } catch {}
    };

    const interval = setInterval(poll, 5000);
    poll();
    return () => { cancelled = true; clearInterval(interval); };
  }, [isWaitingForReveal, activeGameId, publicClient, isStartingGame]);

  // Contract writes
  const { data: startHash, writeContract: writeStart, isPending: isStartPending, reset: resetStart, error: startError } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });

  const { data: climbHash, writeContract: writeClimb, isPending: isClimbPending, reset: resetClimb, error: climbError } = useWriteContract();
  const { isSuccess: isClimbSuccess } = useWaitForTransactionReceipt({ hash: climbHash });

  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending, error: cashOutError } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

  // Computed values
  const config = gameState ? DIFFICULTIES[gameState.difficulty] : DIFFICULTIES[difficulty];
  const multipliers = MULTIPLIER_TABLES[gameState?.difficulty ?? difficulty];
  const currentMult = gameState && gameState.currentLevel > 0
    ? Number(gameState.currentMultiplier) / 10000
    : 1;
  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const payout = gameState ? (parseFloat(formatUnits(gameState.betAmount, 18)) * currentMult * 0.98) : 0;

  // Get trap for level
  const getTrap = (level: number): number => {
    if (!gameState) return -1;
    const traps = gameState.trapPositions;
    const bitsPerLevel = gameState.difficulty <= 2 ? 2 : 2;
    const shift = BigInt(level * bitsPerLevel);
    const mask = BigInt((1 << bitsPerLevel) - 1);
    return Number((traps >> shift) & mask);
  };

  // Track expected level to prevent double-clicks
  const [expectedLevel, setExpectedLevel] = useState<number | null>(null);
  
  // Handle tile click
  const handleTileClick = (tileIndex: number) => {
    if (!activeGameId || !gameState || isClimbing || isClimbPending) return;
    if (gameState.status !== GameStatus.Active) {
      setErrorMessage("Game not active");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }
    
    // Check if we're on the expected level (prevent clicking during state sync)
    const currentLevel = expectedLevel !== null ? expectedLevel : gameState.currentLevel;
    if (expectedLevel !== null && expectedLevel !== gameState.currentLevel) {
      console.log("Waiting for state to sync, expected:", expectedLevel, "actual:", gameState.currentLevel);
      return;
    }

    console.log("Climbing tile:", tileIndex, "Game ID:", activeGameId.toString(), "Current level:", currentLevel);
    setIsClimbing(true);
    processedClimbHash.current = null;
    
    // Optimistically set expected level (will be currentLevel + 1 if successful)
    setExpectedLevel(currentLevel + 1);
    
    writeClimb({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "climbLevel",
      args: [activeGameId, tileIndex]
    }, {
      onError: (error) => {
        console.error("Climb write error:", error);
        setIsClimbing(false);
        setExpectedLevel(null); // Reset on error
        setErrorMessage("Transaction failed");
        setTimeout(() => setErrorMessage(null), 2000);
      }
    });
  };

  // Handle climb success - simplified and more robust
  useEffect(() => {
    if (!isClimbSuccess || !climbHash || !publicClient || !activeGameId) return;
    if (processedClimbHash.current === climbHash) return;
    processedClimbHash.current = climbHash;

    console.log("Climb tx confirmed:", climbHash);
    const gameIdToCheck = activeGameId; // Capture current value

    const fetchNewState = async () => {
      // Give the chain a moment to update
      await new Promise(r => setTimeout(r, 1500));
      
      try {
        // Read the game state using the ID we had when starting the climb
        const game = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [gameIdToCheck],
          blockTag: 'latest',
        }) as unknown as any[];

        const newState: GameState = {
          player: game[0],
          betAmount: game[2],
          difficulty: Number(game[3]),
          status: Number(game[5]),
          currentLevel: Number(game[6]),
          trapPositions: game[7],
          currentMultiplier: game[8],
        };

        console.log("New state after climb:", {
          status: newState.status,
          level: newState.currentLevel,
          statusName: newState.status === 2 ? "Active" : newState.status === 3 ? "Won" : newState.status === 4 ? "Lost" : "Other"
        });
        
        // Update state FIRST, then reset climbing flag
        setGameState(newState);
        setExpectedLevel(null); // Clear expected level now that we have real state
        setIsClimbing(false);
        resetClimb();

        if (newState.status === GameStatus.Lost) {
          // Debug: log trap info
          console.log("=== GAME LOST DEBUG ===");
          console.log("Difficulty:", newState.difficulty, DIFFICULTIES[newState.difficulty]);
          console.log("Trap positions (raw):", newState.trapPositions.toString());
          console.log("Trap positions (hex):", "0x" + newState.trapPositions.toString(16));
          console.log("Current level:", newState.currentLevel);
          // Decode trap for current level
          const bitsPerLevel = 2;
          const shift = BigInt(newState.currentLevel * bitsPerLevel);
          const mask = BigInt((1 << bitsPerLevel) - 1);
          const trapForLevel = Number((newState.trapPositions >> shift) & mask);
          console.log("Trap value for level", newState.currentLevel, ":", trapForLevel);
          console.log("Config:", DIFFICULTIES[newState.difficulty]);
          console.log("For safe > 1, trap IS the bad tile. For safe = 1, trap IS the safe tile.");
          console.log("========================");
          
          // Hit a trap!
          console.log("Player hit a trap!");
          playLoseSound();
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setGameResult("lost");
          setShowFullTower(true);
          setTimeout(() => {
            setShowFullTower(false);
            setActiveGameId(null);
            setGameState(null);
            setGameResult(null);
            setExpectedLevel(null);
            refetchActiveGame();
            refetchBalance();
            refetchPlayerGames();
          }, 4000);
        } else if (newState.status === GameStatus.Won) {
          // Completed the tower!
          console.log("Player won!");
          playWinSound();
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setGameResult("won");
          setShowConfetti(true);
          setTimeout(() => {
            setShowConfetti(false);
            setActiveGameId(null);
            setGameState(null);
            setGameResult(null);
            setExpectedLevel(null);
            refetchActiveGame();
            refetchBalance();
            refetchPlayerGames();
          }, 4000);
        } else if (newState.status === GameStatus.Active) {
          // Still active - successfully climbed to next level
          console.log("Climbed to level", newState.currentLevel);
          playClimbSound();
          try { sdk.haptics.impactOccurred("medium"); } catch {}
        } else {
          // Unexpected status
          console.log("Unexpected game status:", newState.status);
          setGameState(newState);
          refetchActiveGame();
        }
      } catch (e) {
        console.error("Error reading game state after climb:", e);
        setIsClimbing(false);
        resetClimb();
        setErrorMessage("Failed to update");
        setTimeout(() => setErrorMessage(null), 2000);
        refetchActiveGame();
      }
    };

    fetchNewState();
  }, [isClimbSuccess, climbHash, publicClient, activeGameId, playClimbSound, playLoseSound, playWinSound, refetchActiveGame, refetchBalance, refetchPlayerGames, resetClimb]);

  // Handle climb error
  useEffect(() => {
    if (climbError) {
      console.error("Climb error:", climbError);
      setIsClimbing(false);
      resetClimb();
      const msg = climbError.message || "";
      setErrorMessage(msg.includes("rejected") ? "Cancelled" : "Transaction failed");
      setTimeout(() => setErrorMessage(null), 2000);
    }
  }, [climbError, resetClimb]);

  // Timeout for climbing state - if stuck for 30 seconds, reset
  useEffect(() => {
    if (!isClimbing) return;
    
    const timeout = setTimeout(() => {
      console.log("Climb timeout - resetting state");
      setIsClimbing(false);
      resetClimb();
      setErrorMessage("Timeout - try again");
      setTimeout(() => setErrorMessage(null), 2000);
      refetchActiveGame();
    }, 30000);
    
    return () => clearTimeout(timeout);
  }, [isClimbing, resetClimb, refetchActiveGame]);

  // Handle cash out
  const handleCashOut = () => {
    if (!activeGameId || !gameState || isCashingOut) return;
    if (gameState.status !== GameStatus.Active || gameState.currentLevel === 0) return;
    setIsCashingOut(true);
    writeCashOut({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "cashOut",
      args: [activeGameId]
    });
  };

  // Handle cash out success
  useEffect(() => {
    if (isCashOutSuccess && isCashingOut) {
      playWinSound();
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
        refetchPlayerGames();
      }, 4000);
    }
  }, [isCashOutSuccess, isCashingOut, playWinSound, refetchActiveGame, refetchBalance, refetchPlayerGames]);

  // Handle start game
  const handleStartGame = () => {
    if (!isConnected || isStartingGame || activeGameId) return;
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet 0.1-10");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }
    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Low balance");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }
    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      return;
    }

    setIsStartingGame(true);
    setExpandedControl(null);
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

    console.log("Start tx confirmed:", startHash);
    setIsWaitingForReveal(true);

    const startPolling = async () => {
      // Try to get game ID with retries (chain might be slow to index)
      let gameId: bigint | null = null;
      let gameIdAttempts = 0;
      const maxGameIdAttempts = 15;
      
      while (gameIdAttempts < maxGameIdAttempts) {
        gameIdAttempts++;
        await new Promise(r => setTimeout(r, 1000)); // Wait 1 second between attempts
        
        try {
          const result = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "getPlayerActiveGame",
            args: [address],
            blockTag: 'latest',
          }) as bigint;

          console.log(`Game ID attempt ${gameIdAttempts}:`, result?.toString());

          if (result && result > BigInt(0)) {
            gameId = result;
            break;
          }
        } catch (e) {
          console.error(`Game ID attempt ${gameIdAttempts} error:`, e);
        }
      }

      if (!gameId || gameId === BigInt(0)) {
        console.log("No game ID found after all attempts");
        setErrorMessage("No game found - please refresh");
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
        return;
      }

      console.log("Got game ID:", gameId.toString());
      setActiveGameId(gameId);

      // Now poll for the game to become active (revealed)
      let attempts = 0;
      const maxAttempts = 60;

      const poll = async (): Promise<boolean> => {
        attempts++;
        console.log(`Reveal poll attempt ${attempts}`);
        
        // Call reveal API first
        try { 
          const res = await fetch('/api/reveal?game=tower');
          const data = await res.json();
          console.log("Reveal API response:", data);
        } catch (e) {
          console.log("Reveal API error:", e);
        }
        
        // Wait between checks
        await new Promise(r => setTimeout(r, 2000));

        try {
          const game = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "games",
            args: [gameId],
            blockTag: 'latest',
          }) as unknown as any[];

          const status = Number(game[5]);
          console.log("Game status:", status);

          if (status === GameStatus.Active) {
            console.log("Game is now active!");
            setGameState({
              player: game[0],
              betAmount: game[2],
              difficulty: Number(game[3]),
              status: status,
              currentLevel: Number(game[6]),
              trapPositions: game[7],
              currentMultiplier: game[8],
            });
            setIsWaitingForReveal(false);
            setIsStartingGame(false);
            return true;
          }

          if (attempts >= maxAttempts) {
            console.log("Polling timed out");
            setErrorMessage("Timeout - refresh page");
            setIsWaitingForReveal(false);
            setIsStartingGame(false);
            return true;
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
        return false;
      };

      // Keep polling until done
      while (true) {
        const done = await poll();
        if (done) break;
      }
    };

    startPolling();
  }, [isStartSuccess, startHash, publicClient, address]);

  // Handle start error
  useEffect(() => {
    if (startError && isStartingGame) {
      const msg = startError.message || "";
      setErrorMessage(msg.includes("rejected") ? "Cancelled" : "Failed");
      setIsStartingGame(false);
      resetStart();
      setTimeout(() => setErrorMessage(null), 2000);
    }
  }, [startError, isStartingGame, resetStart]);

  // Fetch history
  useEffect(() => {
    if (!showHistory || !playerGameIds || !publicClient) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      const ids = playerGameIds as bigint[];
      if (!ids || ids.length === 0) {
        setHistoryGames([]);
        setIsLoadingHistory(false);
        return;
      }

      const games: HistoryGame[] = [];
      const idsToFetch = ids.slice(-10).reverse();

      for (const id of idsToFetch) {
        try {
          const game = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "games",
            args: [id],
          }) as unknown as any[];

          games.push({
            gameId: id,
            player: game[0],
            betAmount: game[2],
            difficulty: Number(game[3]),
            commitBlock: game[4],
            status: Number(game[5]),
            currentLevel: Number(game[6]),
            trapPositions: game[7],
            currentMultiplier: game[8],
          });
          await new Promise(r => setTimeout(r, 100));
        } catch {}
      }

      setHistoryGames(games);
      setIsLoadingHistory(false);
    };

    fetchHistory();
  }, [showHistory, playerGameIds, publicClient]);

  // Render tower - now from bottom up with big tiles
  const renderTower = () => {
    const inGame = gameState?.status === GameStatus.Active;
    const ended = gameState && (gameState.status === GameStatus.Lost || gameState.status === GameStatus.Won);
    // Use expectedLevel if we're waiting for chain, otherwise use actual level
    const displayLevel = expectedLevel !== null ? expectedLevel : (gameState?.currentLevel ?? 0);
    const actualLevel = gameState?.currentLevel ?? 0;

    // In focused mode, only show current level and 1-2 around it
    // In full mode (after bust), show all levels
    const visibleLevels = showFullTower || ended ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : 
      inGame ? [Math.max(0, displayLevel - 1), displayLevel, Math.min(8, displayLevel + 1)].filter((v, i, a) => a.indexOf(v) === i) :
      [0, 1, 2]; // Preview mode

    return (
      <div className={cn(
        "flex flex-col-reverse gap-3 transition-all duration-700 ease-out",
        showFullTower && "scale-[0.6] origin-bottom"
      )}>
        {visibleLevels.map((l) => {
          const trap = getTrap(l);
          // For display purposes, use displayLevel
          const isCurrent = inGame && displayLevel === l;
          const isPast = displayLevel > l;
          const isFuture = displayLevel < l;
          const mult = multipliers[l] / 10000;
          // For clickability, use actualLevel (what chain knows) to prevent clicking ahead
          const isClickableLevel = inGame && actualLevel === l && !isClimbing;

          return (
            <div 
              key={l} 
              className={cn(
                "flex flex-col items-center gap-2 transition-all duration-500",
                isFuture && !ended && !showFullTower && "opacity-30 scale-95",
                isPast && !ended && !showFullTower && "opacity-50 scale-95",
                isCurrent && "scale-100"
              )}
              style={{
                animationDelay: `${l * 50}ms`
              }}
            >
              {/* Level indicator */}
              <div className="flex items-center gap-3 w-full justify-center">
                <span className={cn(
                  "text-xs font-mono px-2 py-0.5 rounded",
                  isPast ? "bg-green-500/20 text-green-400" : 
                  isCurrent ? "bg-amber-500/20 text-amber-400" : 
                  "bg-zinc-800 text-zinc-500"
                )}>
                  {mult >= 1000 ? `${(mult/1000).toFixed(0)}K` : mult >= 100 ? mult.toFixed(0) : mult.toFixed(1)}x
                </span>
                <span className={cn(
                  "text-[10px] font-bold",
                  isPast ? "text-green-400" : isCurrent ? "text-amber-400" : "text-zinc-600"
                )}>
                  LVL {l + 1}
                </span>
              </div>

              {/* Tiles - big and touchable */}
              <div className="flex gap-2 justify-center">
                {Array.from({ length: config.tiles }).map((_, t) => {
                  // For safe > 1 modes: trap position = the trap tile
                  // For safe = 1 modes: trap position = the SAFE tile (only 1 safe)
                  const isSafe = config.safe > 1 ? t !== trap : t === trap;
                  const show = ended || isPast || showFullTower;
                  // Only clickable if this is the level the chain knows about AND we're not climbing
                  const clickable = isClickableLevel && !ended;

                  let bgStyle = "";
                  let content: React.ReactNode = "?";

                  if (show && (ended || isPast)) {
                    if (isSafe) {
                      bgStyle = "bg-green-500/20 border-green-500/50";
                      content = <span className="text-2xl">🍩</span>;
                    } else {
                      bgStyle = "bg-red-500/30 border-red-500/50";
                      content = <span className="text-2xl">💀</span>;
                    }
                  } else if (isCurrent) {
                    // Show loading on current level if climbing
                    if (isClimbing) {
                      bgStyle = "bg-amber-500/30 border-amber-500 animate-pulse";
                      content = <Loader2 className="w-6 h-6 animate-spin text-amber-400" />;
                    } else {
                      bgStyle = "bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/20";
                      content = <span className="text-zinc-400 text-lg">?</span>;
                    }
                  } else {
                    bgStyle = "bg-zinc-900/80 border-zinc-700";
                    content = <span className="text-zinc-600 text-lg">?</span>;
                  }

                  return (
                    <button
                      key={t}
                      onClick={() => clickable && handleTileClick(t)}
                      disabled={!clickable}
                      className={cn(
                        "w-16 h-16 rounded-xl border-2 flex items-center justify-center transition-all duration-200",
                        bgStyle,
                        clickable && "hover:scale-105 hover:bg-amber-500/30 active:scale-95 cursor-pointer",
                        !clickable && "cursor-default"
                      )}
                    >
                      {content}
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

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
        
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
      `}</style>

      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <div key={i} className="confetti absolute text-2xl" style={{ left: `${(i * 37 + 13) % 100}%`, animationDelay: `${i * 0.07}s` }}>🍩</div>
          ))}
        </div>
      )}

      <div className="relative flex h-full w-full max-w-md flex-col px-3" style={{ paddingTop: 'env(safe-area-inset-top, 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
        
        {/* Header - fixed to match other pages */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">DONUT TOWER</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 animate-pulse">LIVE</span>
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
            <div className="text-[8px] text-gray-500">LEVEL</div>
            <div className="text-sm font-bold text-amber-400">{gameState?.currentLevel ?? 0}/9</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MULTIPLIER</div>
            <div className="text-sm font-bold text-green-400">{currentMult.toFixed(2)}x</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-3">
          <button onClick={() => setIsMuted(!isMuted)} className={cn("p-2 rounded-lg border", isMuted ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-zinc-900 border-zinc-800")}>
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

        {/* Tower area */}
        <div className="flex-1 relative overflow-hidden flex flex-col justify-end">
          {/* Top gradient fade */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black via-black/80 to-transparent z-10 pointer-events-none" />
          
          {/* Result overlay */}
          {gameResult && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className={cn(
                "text-center p-6 rounded-2xl animate-slide-up",
                gameResult === "won" ? "bg-green-500/20 border border-green-500/50" : "bg-red-500/20 border border-red-500/50"
              )}>
                <div className={cn(
                  "text-4xl font-bold mb-2",
                  gameResult === "won" ? "text-green-400" : "text-red-400"
                )}>
                  {gameResult === "won" ? "🎉 CASHED OUT!" : "💀 FELL!"}
                </div>
                {gameResult === "won" && gameState && (
                  <div className="text-xl text-green-400">
                    +{payout.toFixed(2)} 🍩
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Waiting state */}
          {isWaitingForReveal && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto mb-3" />
                <div className="text-amber-400 font-bold">Building tower...</div>
                <div className="text-[10px] text-gray-500 mt-1">Setting up traps</div>
              </div>
            </div>
          )}

          {/* Tower */}
          <div ref={towerRef} className={cn(
            "pb-4 transition-all duration-500",
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
        <div className="space-y-2 pb-1">
          {/* Setup controls - only when no active game */}
          {!gameState && !isStartingGame && !isWaitingForReveal && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              <div className="flex items-center gap-2 h-14">
                {/* Risk/Difficulty button */}
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
                    <div className="flex gap-1 h-full">
                      {DIFFICULTIES.map((d, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setDifficulty(idx);
                            setExpandedControl(null);
                            try { sdk.haptics.impactOccurred("light"); } catch {}
                          }}
                          className="flex-1 rounded-lg font-bold text-[9px] border-2 transition-all duration-200 hover:scale-[1.02] active:scale-95"
                          style={{
                            backgroundColor: difficulty === idx ? 
                              (d.color === "green" ? "rgb(34 197 94)" : 
                               d.color === "amber" ? "rgb(245 158 11)" :
                               d.color === "orange" ? "rgb(249 115 22)" :
                               d.color === "red" ? "rgb(239 68 68)" : "rgb(168 85 247)") : "rgb(39 39 42)",
                            borderColor: difficulty === idx ?
                              (d.color === "green" ? "rgb(34 197 94)" : 
                               d.color === "amber" ? "rgb(245 158 11)" :
                               d.color === "orange" ? "rgb(249 115 22)" :
                               d.color === "red" ? "rgb(239 68 68)" : "rgb(168 85 247)") : "rgb(63 63 70)",
                            color: difficulty === idx ? "white" : "rgb(161 161 170)"
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
                        backgroundColor: DIFFICULTIES[difficulty].color === "green" ? "rgba(34, 197, 94, 0.15)" : 
                          DIFFICULTIES[difficulty].color === "amber" ? "rgba(245, 158, 11, 0.15)" :
                          DIFFICULTIES[difficulty].color === "orange" ? "rgba(249, 115, 22, 0.15)" :
                          DIFFICULTIES[difficulty].color === "red" ? "rgba(239, 68, 68, 0.15)" : "rgba(168, 85, 247, 0.15)",
                        borderColor: DIFFICULTIES[difficulty].color === "green" ? "rgba(34, 197, 94, 0.4)" : 
                          DIFFICULTIES[difficulty].color === "amber" ? "rgba(245, 158, 11, 0.4)" :
                          DIFFICULTIES[difficulty].color === "orange" ? "rgba(249, 115, 22, 0.4)" :
                          DIFFICULTIES[difficulty].color === "red" ? "rgba(239, 68, 68, 0.4)" : "rgba(168, 85, 247, 0.4)"
                      }}
                    >
                      <span className="text-[8px] text-gray-400">RISK</span>
                      <span 
                        className="text-xs font-bold"
                        style={{
                          color: DIFFICULTIES[difficulty].color === "green" ? "rgb(74 222 128)" : 
                            DIFFICULTIES[difficulty].color === "amber" ? "rgb(251 191 36)" :
                            DIFFICULTIES[difficulty].color === "orange" ? "rgb(251 146 60)" :
                            DIFFICULTIES[difficulty].color === "red" ? "rgb(248 113 113)" : "rgb(192 132 252)"
                        }}
                      >
                        {DIFFICULTIES[difficulty].name}
                      </span>
                    </button>
                  )}
                </div>

                {/* Bet button */}
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

          {/* Main action button */}
          {gameState?.status === GameStatus.Active ? (
            <button
              onClick={handleCashOut}
              disabled={gameState.currentLevel === 0 || isCashingOut || isCashOutPending}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                gameState.currentLevel === 0 ? "bg-zinc-800 text-zinc-500" : "bg-green-500 text-black hover:bg-green-400"
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
                isStartingGame || isStartPending || isWaitingForReveal ? "bg-zinc-500 text-zinc-300" : "bg-white text-black hover:bg-gray-100"
              )}
            >
              {isStartPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Confirm...
                </span>
              ) : isStartingGame || isWaitingForReveal ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Starting...
                </span>
              ) : (
                "START CLIMB"
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
                  <History className="w-4 h-4" /> Climb History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Tap any game to verify. All results are provably fair.</p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    </div>
                  ) : historyGames.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No games yet</p>
                  ) : (
                    historyGames.map((game) => {
                      const isWon = game.status === GameStatus.Won;
                      const isLost = game.status === GameStatus.Lost;
                      const mult = Number(game.currentMultiplier) / 10000;
                      const gamePayout = parseFloat(formatUnits(game.betAmount, 18)) * mult * 0.98;
                      const isExpanded = expandedGameId === game.gameId.toString();

                      return (
                        <div
                          key={game.gameId.toString()}
                          onClick={() => setExpandedGameId(isExpanded ? null : game.gameId.toString())}
                          className={cn(
                            "p-2 rounded-lg border cursor-pointer transition-all",
                            isWon ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20" : 
                            isLost ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20" : 
                            "bg-amber-500/10 border-amber-500/30"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{isWon ? "🎉" : isLost ? "💀" : "⏳"}</span>
                              <div>
                                <span className="text-xs text-gray-400">
                                  {DIFFICULTIES[game.difficulty].name} • Level {game.currentLevel}/9
                                </span>
                                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                  {mult.toFixed(2)}x <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                                </div>
                              </div>
                            </div>
                            <div className={cn("text-sm font-bold", isWon ? "text-green-400" : "text-red-400")}>
                              {isWon ? `+${gamePayout.toFixed(2)}` : `-${parseFloat(formatUnits(game.betAmount, 18)).toFixed(2)}`} 🍩
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 p-2 bg-zinc-900/80 rounded-lg border border-zinc-700 space-y-2">
                              <div className="text-[10px] text-amber-400 font-bold">🔐 Verification Data</div>
                              <div className="space-y-1 text-[9px] font-mono">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Game ID:</span>
                                  <span className="text-white">{game.gameId.toString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Commit Block:</span>
                                  <span className="text-white">{game.commitBlock.toString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Difficulty:</span>
                                  <span className="text-white">{DIFFICULTIES[game.difficulty].name} ({DIFFICULTIES[game.difficulty].tiles} tiles, {DIFFICULTIES[game.difficulty].safe} safe)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Final Level:</span>
                                  <span className={isWon ? "text-green-400" : "text-red-400"}>{game.currentLevel}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Trap Positions:</span>
                                  <span className="text-white font-mono text-[8px]">0x{game.trapPositions.toString(16).padStart(8, '0')}</span>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-zinc-700">
                                <div className="text-[8px] text-amber-400/80 font-mono bg-zinc-800 p-1.5 rounded break-all">
                                  traps = keccak256(blockhash + gameId)
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
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Choose Difficulty</div>
                      <div className="text-[11px] text-gray-400">Higher risk = higher multipliers!</div>
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
                      <div className="font-semibold text-white text-xs">Climb the Tower</div>
                      <div className="text-[11px] text-gray-400">Pick safe tiles 🍩 to climb. Avoid traps 💀!</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                    <div>
                      <div className="font-semibold text-green-400 text-xs">Cash Out Anytime!</div>
                      <div className="text-[11px] text-gray-400">Take your winnings before you fall!</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Difficulty Tiers:</div>
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    <div><span className="text-green-400">Easy:</span> 4 tiles, 3 safe (1.3x → 13.1x)</div>
                    <div><span className="text-amber-400">Medium:</span> 3 tiles, 2 safe (1.5x → 41.2x)</div>
                    <div><span className="text-orange-400">Hard:</span> 2 tiles, 1 safe (2x → 501.8x)</div>
                    <div><span className="text-red-400">Expert:</span> 3 tiles, 1 safe (2.9x → 19,289x)</div>
                    <div><span className="text-purple-400">Master:</span> 4 tiles, 1 safe (3.9x → 256,901x)</div>
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
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowApprovals(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowApprovals(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Token Approvals
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Tower contract.</p>

                <ApprovalSection refetchAllowance={refetchAllowance} />

                <button onClick={() => setShowApprovals(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}

// Approval section component
function ApprovalSection({ refetchAllowance }: { refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState("100");

  const { data: allowance, refetch } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_TOWER_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_TOWER_ADDRESS, parseUnits(amount, 18)]
    }, {
      onSuccess: () => { refetch(); refetchAllowance(); }
    });
  };

  const isApproved = allowance && allowance > BigInt(0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🍩</span>
          <div>
            <div className="text-sm font-bold text-white">DONUT</div>
            <div className="text-[10px] text-gray-500">
              {isApproved ? `Approved: ${parseFloat(formatUnits(allowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "Not approved"}
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

      <button
        onClick={() => handleApprove(approvalAmount)}
        disabled={isPending}
        className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold"
      >
        {isPending ? "..." : "Approve"}
      </button>
    </div>
  );
}