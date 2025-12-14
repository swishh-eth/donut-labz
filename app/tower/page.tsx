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
  // Easy (75% per level)
  [13066, 17422, 23229, 30972, 41296, 55061, 73415, 97887, 130516],
  // Medium (66% per level)
  [14848, 22497, 34086, 51645, 78250, 118561, 179638, 272179, 412392],
  // Hard (50% per level)
  [19600, 39200, 78400, 156800, 313600, 627200, 1254400, 2508800, 5017600],
  // Expert (33% per level)
  [29400, 88200, 264600, 793800, 2381400, 7144200, 21432600, 64297800, 192893400],
  // Master (25% per level)
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
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.2);
      });
    } catch {}
  }, [isMuted]);
  const playLoseSound = useCallback(() => playSound(200, "sawtooth", 0.3), [playSound]);

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

  const { data: contractGameId, refetch: refetchActiveGame } = useReadContract({
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
  const { data: startHash, writeContract: writeStart, isPending: isStartPending, reset: resetStart } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });

  const { data: climbHash, writeContract: writeClimb, isPending: isClimbPending, error: climbError, reset: resetClimb } = useWriteContract();
  const { isSuccess: isClimbSuccess, isLoading: isClimbConfirming } = useWaitForTransactionReceipt({ hash: climbHash });

  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });
  
  // Track processed hashes to avoid double processing
  const processedStartHash = useRef<string | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx);
      } catch {}
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    };
    init();
  }, []);

  // Auto-show approvals
  useEffect(() => {
    if (isConnected && allowance === BigInt(0) && !showApprovals && !hasShownApproval) {
      setTimeout(() => {
        setShowApprovals(true);
        setHasShownApproval(true);
      }, 500);
    }
  }, [isConnected, allowance, showApprovals, hasShownApproval]);

  // Load game state (only on initial load or when contractGameId changes)
  useEffect(() => {
    // Skip if climbing - we manage state ourselves during climb
    if (isClimbing) {
      console.log("Load effect: skipping - isClimbing");
      return;
    }
    
    // Skip if we're in the middle of starting/waiting - pollForReveal will handle it
    if (isStartingGame || isWaitingForReveal) {
      console.log("Load effect: skipping - starting or waiting for reveal");
      return;
    }
    
    // Skip if we already have an active game with state
    if (activeGameId && gameState?.status === GameStatus.Active) {
      console.log("Load effect: skipping - already have active game state");
      return;
    }
    
    // If no game ID from contract, only clear if we don't have local state
    if (!contractGameId || contractGameId === BigInt(0)) {
      // Only clear if not showing a result AND we don't have a local game
      if (!gameResult && !activeGameId) {
        console.log("Load effect: clearing - no contract game ID and no local game");
        setActiveGameId(null);
        setGameState(null);
      }
      return;
    }
    
    if (!publicClient) return;

    const load = async () => {
      console.log("Load effect: loading game", contractGameId.toString());
      try {
        const game = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [contractGameId],
          blockTag: 'latest',
        }) as unknown as any[];

        const state: GameState = {
          player: game[0],
          betAmount: game[2],
          difficulty: Number(game[3]),
          status: Number(game[5]),
          currentLevel: Number(game[6]),
          trapPositions: game[7],
          currentMultiplier: game[8],
        };
        
        console.log("Load effect: got state", { level: state.currentLevel, status: state.status });

        setActiveGameId(contractGameId);
        setGameState(state);

        if (state.status === GameStatus.Pending) {
          setIsWaitingForReveal(true);
          pollForReveal(contractGameId);
        } else if (state.status === GameStatus.Active) {
          // Already active - make sure loading states are cleared
          setIsWaitingForReveal(false);
          setIsStartingGame(false);
        }
      } catch (e) {
        console.error("Load error:", e);
      }
    };

    load();
  }, [publicClient, contractGameId]);

  // Fetch history when modal opens
  useEffect(() => {
    if (!showHistory || !playerGameIds || !publicClient) return;
    
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      const gameIds = playerGameIds as bigint[];
      if (!gameIds || gameIds.length === 0) {
        setHistoryGames([]);
        setIsLoadingHistory(false);
        return;
      }
      
      // Only fetch last 10 to reduce RPC calls
      const idsToFetch = gameIds.slice(-10).reverse();
      const games: HistoryGame[] = [];
      
      for (const gameId of idsToFetch) {
        try {
          const game = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "games",
            args: [gameId],
          }) as unknown as any[];
          
          games.push({
            gameId,
            player: game[0],
            betAmount: game[2],
            difficulty: Number(game[3]),
            commitBlock: game[4],
            status: Number(game[5]),
            currentLevel: Number(game[6]),
            trapPositions: game[7],
            currentMultiplier: game[8],
          });
          
          // Small delay between fetches
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error("Error fetching game:", gameId.toString(), e);
        }
      }
      
      setHistoryGames(games);
      setIsLoadingHistory(false);
    };
    
    fetchHistory();
  }, [showHistory, playerGameIds, publicClient]);

  // Poll for reveal
  const pollForReveal = async (gameId: bigint) => {
    console.log("Starting poll for reveal, gameId:", gameId.toString());
    
    // First read initial state
    try {
      const game = await publicClient?.readContract({
        address: DONUT_TOWER_ADDRESS,
        abi: TOWER_ABI,
        functionName: "games",
        args: [gameId],
        blockTag: 'latest',
      }) as unknown as any[];
      
      const status = Number(game[5]);
      console.log("Initial game status:", status);
      
      // If already active, we're done
      if (status === GameStatus.Active) {
        setGameState({
          player: game[0],
          betAmount: game[2],
          difficulty: Number(game[3]),
          status: status,
          currentLevel: Number(game[6]),
          trapPositions: game[7],
          currentMultiplier: game[8],
        });
        setActiveGameId(gameId);
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
        return;
      }
    } catch (e) {
      console.error("Error reading initial state:", e);
    }
    
    // Poll for reveal
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        console.log(`Poll attempt ${i + 1}...`);
        await fetch(`/api/reveal?game=tower`);
        
        await new Promise(r => setTimeout(r, 500));
        
        const game = await publicClient?.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [gameId],
          blockTag: 'latest',
        }) as unknown as any[];

        const status = Number(game[5]);
        console.log(`Poll ${i + 1} status:`, status);
        
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
          setActiveGameId(gameId);
          setIsWaitingForReveal(false);
          setIsStartingGame(false);
          return;
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }
    setErrorMessage("Timeout - try refreshing");
    setIsWaitingForReveal(false);
    setIsStartingGame(false);
  };

  // Handle climb success - using the hook's isSuccess
  const lastProcessedClimbHash = useRef<string | null>(null);
  
  useEffect(() => {
    // Only process when we have a successful climb
    if (!isClimbSuccess || !climbHash || !publicClient || !activeGameId) return;
    
    // Don't process same hash twice
    if (lastProcessedClimbHash.current === climbHash) return;
    lastProcessedClimbHash.current = climbHash;
    
    console.log("Climb tx confirmed via hook!", climbHash);
    
    const fetchNewState = async () => {
      // Wait a bit for chain state to update
      await new Promise(r => setTimeout(r, 1500));
      
      try {
        const game = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "games",
          args: [activeGameId],
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
        
        console.log("New state after climb:", { level: newState.currentLevel, status: newState.status });
        
        // Update state
        setGameState(newState);
        setIsClimbing(false);
        resetClimb();

        // Handle results
        if (newState.status === GameStatus.Lost) {
          playLoseSound();
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setGameResult("lost");
          setTimeout(() => {
            setActiveGameId(null);
            setGameState(null);
            setGameResult(null);
            refetchActiveGame();
            refetchBalance();
            refetchPlayerGames();
          }, 3000);
        } else if (newState.status === GameStatus.Won) {
          playWinSound();
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
            refetchPlayerGames();
          }, 3000);
        } else {
          playClimbSound();
          try { sdk.haptics.impactOccurred("medium"); } catch {}
        }
      } catch (e) {
        console.error("Error reading new state:", e);
        setIsClimbing(false);
        resetClimb();
        refetchActiveGame();
      }
    };
    
    fetchNewState();
  }, [isClimbSuccess, climbHash, publicClient, activeGameId, playClimbSound, playLoseSound, playWinSound, refetchActiveGame, refetchBalance, refetchPlayerGames, resetClimb]);

  // Handle climb error
  useEffect(() => {
    if (climbError) {
      setIsClimbing(false);
      resetClimb();
      setErrorMessage("Failed");
      setTimeout(() => setErrorMessage(null), 2000);
    }
  }, [climbError, resetClimb]);

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
      }, 3000);
    }
  }, [isCashOutSuccess, isCashingOut, playWinSound, refetchActiveGame, refetchBalance, refetchPlayerGames]);

  // Handlers
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
    writeStart({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "startGame",
      args: [DONUT_TOKEN_ADDRESS, amountWei, difficulty]
    });
  };

  // Handle start success
  useEffect(() => {
    // Need all conditions
    if (!isStartSuccess || !startHash || !publicClient || !address) return;
    
    // Don't process same hash twice
    if (processedStartHash.current === startHash) {
      console.log("Start: already processed this hash");
      return;
    }
    processedStartHash.current = startHash;
    
    console.log("Start tx confirmed!", startHash);
    setIsWaitingForReveal(true);
    
    const startPolling = async () => {
      // Wait a moment then get the game ID
      await new Promise(r => setTimeout(r, 1000));
      
      try {
        const gameId = await publicClient.readContract({
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_ABI,
          functionName: "getPlayerActiveGame",
          args: [address],
          blockTag: 'latest',
        }) as bigint;
        
        console.log("Got game ID:", gameId.toString());
        
        if (gameId && gameId > BigInt(0)) {
          setActiveGameId(gameId);
          // Start polling for reveal
          pollForReveal(gameId);
        } else {
          console.log("No game ID returned, retrying...");
          // Retry after a delay
          await new Promise(r => setTimeout(r, 1000));
          const retryGameId = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_ABI,
            functionName: "getPlayerActiveGame",
            args: [address],
            blockTag: 'latest',
          }) as bigint;
          
          if (retryGameId && retryGameId > BigInt(0)) {
            setActiveGameId(retryGameId);
            pollForReveal(retryGameId);
          } else {
            console.log("Still no game ID after retry");
            setIsWaitingForReveal(false);
            setIsStartingGame(false);
            resetStart();
          }
        }
      } catch (e) {
        console.error("Error getting game ID:", e);
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
        resetStart();
      }
    };
    
    startPolling();
  }, [isStartSuccess, startHash, publicClient, address, resetStart]);

  const handleTileClick = (tile: number) => {
    console.log("Tile clicked:", tile, { activeGameId: activeGameId?.toString(), status: gameState?.status, isClimbing, isClimbPending });
    
    if (!activeGameId || !gameState) {
      console.log("No game");
      return;
    }
    if (gameState.status !== GameStatus.Active) {
      console.log("Not active");
      return;
    }
    if (isClimbing || isClimbPending) {
      console.log("Already climbing");
      return;
    }

    console.log("Sending climb tx for tile", tile);
    setIsClimbing(true);
    try { sdk.haptics.impactOccurred("light"); } catch {}

    writeClimb({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "climbLevel",
      args: [activeGameId, tile]
    });
  };

  const handleCashOut = () => {
    if (!activeGameId || !gameState) return;
    if (gameState.status !== GameStatus.Active) return;
    if (gameState.currentLevel === 0) return;
    if (isCashingOut || isCashOutPending) return;

    setIsCashingOut(true);
    writeCashOut({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_ABI,
      functionName: "cashOut",
      args: [activeGameId]
    });
  };

  // Computed values
  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const config = gameState ? DIFFICULTIES[gameState.difficulty] : DIFFICULTIES[difficulty];
  const multipliers = MULTIPLIER_TABLES[gameState?.difficulty ?? difficulty];
  const currentMult = gameState && gameState.currentLevel > 0 ? Number(gameState.currentMultiplier) / 10000 : 1;
  const payout = gameState && gameState.currentLevel > 0 ? parseFloat(formatUnits(gameState.betAmount, 18)) * currentMult : 0;

  // Get trap for level
  const getTrap = (level: number) => {
    if (!gameState) return -1;
    return Number((gameState.trapPositions >> BigInt(level * 4)) & BigInt(0xF));
  };

  // Render tower rows
  const renderTower = () => {
    const rows = [];
    const inGame = gameState?.status === GameStatus.Active;
    const ended = gameState && (gameState.status === GameStatus.Lost || gameState.status === GameStatus.Won);
    const level = gameState?.currentLevel ?? 0;

    for (let l = 8; l >= 0; l--) {
      const trap = getTrap(l);
      const isCurrent = inGame && level === l;
      const isPast = level > l;
      const isFuture = level < l;
      const mult = multipliers[l] / 10000;

      const tiles = [];
      for (let t = 0; t < config.tiles; t++) {
        const isSafe = config.safe > 1 ? t !== trap : t === trap;
        const show = ended || isPast;
        const clickable = inGame && isCurrent && !isClimbing;

        let style = "";
        let content: React.ReactNode = "?";

        if (show) {
          if (isSafe) {
            style = "bg-white/10 border-white";
            content = "🍩";
          } else {
            style = "bg-red-500/20 border-red-500";
            content = "💀";
          }
        } else if (isCurrent) {
          style = "bg-amber-500/20 border-amber-500 cursor-pointer active:scale-95";
        } else {
          style = "bg-zinc-900/50 border-zinc-800";
        }

        tiles.push(
          <div
            key={t}
            onClick={() => clickable && handleTileClick(t)}
            className={cn(
              "w-9 h-9 rounded border flex items-center justify-center text-xs transition-transform select-none",
              style,
              clickable && "hover:bg-amber-500/30"
            )}
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            {isClimbing && isCurrent ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : content}
          </div>
        );
      }

      rows.push(
        <div key={l} className={cn(
          "flex items-center justify-center gap-1 py-0.5 transition-opacity",
          isFuture && !ended && "opacity-30"
        )}>
          <span className={cn(
            "text-[10px] w-10 text-right font-mono",
            isPast ? "text-green-400" : isCurrent ? "text-amber-400" : "text-zinc-600"
          )}>
            {mult.toFixed(1)}x
          </span>
          <div className="flex gap-0.5">{tiles}</div>
          <span className={cn(
            "text-[10px] w-4 font-mono",
            isPast ? "text-green-400" : isCurrent ? "text-amber-400" : "text-zinc-600"
          )}>
            {l + 1}
          </span>
        </div>
      );
    }
    return rows;
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <div key={i} className="confetti absolute text-2xl" style={{ left: `${(i * 37 + 13) % 100}%`, animationDelay: `${i * 0.07}s` }}>🍩</div>
          ))}
        </div>
      )}

      <div className="relative flex h-full w-full max-w-md flex-col px-2" style={{ paddingTop: 'env(safe-area-inset-top, 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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
        <div className="flex items-center justify-end gap-2 mb-2">
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

        {/* Tower area with fade */}
        <div className="flex-1 relative overflow-hidden">
          {/* Top fade */}
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
          
          {/* Tower */}
          <div ref={towerRef} className="h-full overflow-y-auto scrollbar-hide flex flex-col justify-end pb-2" style={{ scrollbarWidth: 'none' }}>
            {gameResult === "lost" ? (
              <div className="space-y-0.5">
                <div className="text-center py-2">
                  <p className="text-red-400 font-bold">💀 You fell!</p>
                </div>
                {renderTower()}
              </div>
            ) : gameResult === "won" ? (
              <div className="space-y-0.5">
                <div className="text-center py-2">
                  <p className="text-green-400 font-bold">🎉 +{payout.toFixed(2)} 🍩</p>
                </div>
                {renderTower()}
              </div>
            ) : gameState && gameState.status === GameStatus.Active ? (
              <div className="space-y-0.5">{renderTower()}</div>
            ) : (
              <div className="space-y-0.5 opacity-40">{renderTower()}</div>
            )}
          </div>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-center text-red-400 text-sm mb-2">
            {errorMessage}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-2">
          {gameState?.status === GameStatus.Active ? (
            <button
              onClick={handleCashOut}
              disabled={gameState.currentLevel === 0 || isCashingOut || isCashOutPending}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg",
                gameState.currentLevel === 0 ? "bg-zinc-800 text-zinc-500" : "bg-green-500 text-black"
              )}
            >
              {isCashingOut ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : gameState.currentLevel === 0 ? "Tap a tile" : `CASH OUT ${payout.toFixed(2)} 🍩`}
            </button>
          ) : !isStartingGame && !isWaitingForReveal && !gameResult ? (
            <>
              {/* Compact controls */}
              <div className="flex gap-2">
                <button
                  onClick={() => setExpandedControl(expandedControl === "risk" ? null : "risk")}
                  className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                >
                  <span className="text-gray-500 text-xs">RISK </span>
                  <span className="text-amber-400 font-bold">{config.name}</span>
                </button>
                <button
                  onClick={() => setExpandedControl(expandedControl === "bet" ? null : "bet")}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                >
                  <span className="text-gray-500 text-xs">BET </span>
                  <span className="text-amber-400 font-bold">{betAmount} 🍩</span>
                </button>
              </div>

              {expandedControl === "risk" && (
                <div className="flex gap-1 flex-wrap">
                  {DIFFICULTIES.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => { setDifficulty(i); setExpandedControl(null); }}
                      className={cn("flex-1 py-1.5 rounded text-xs font-bold min-w-[60px]", difficulty === i ? "bg-amber-500 text-black" : "bg-zinc-800 text-gray-400")}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}

              {expandedControl === "bet" && (
                <div className="flex gap-1">
                  {["0.5", "1", "2", "5"].map(v => (
                    <button
                      key={v}
                      onClick={() => { setBetAmount(v); setExpandedControl(null); }}
                      className={cn("flex-1 py-1.5 rounded text-xs font-bold", betAmount === v ? "bg-amber-500 text-black" : "bg-zinc-800 text-gray-400")}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleStartGame}
                disabled={!isConnected || isStartPending}
                className="w-full py-3 rounded-xl font-bold text-lg bg-white text-black"
              >
                {isStartPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "START CLIMB"}
              </button>
            </>
          ) : isStartingGame || isWaitingForReveal ? (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" />
              <p className="text-sm text-gray-500 mt-1">{isWaitingForReveal ? "Building tower..." : "Starting..."}</p>
            </div>
          ) : null}
        </div>

        <NavBar />
      </div>

      {/* Help Modal - Updated to match wheel style */}
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
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Choose Difficulty</div>
                    <div className="text-[11px] text-gray-400">Easy = more safe tiles, lower multipliers. Master = 1 safe tile, huge multipliers up to 2569x!</div>
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
                    <div className="text-[11px] text-gray-400">Tap tiles to climb. 🍩 = safe, 💀 = trap. Each level increases your multiplier!</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-amber-400 text-xs">Cash Out Anytime!</div>
                    <div className="text-[11px] text-gray-400">Secure your winnings before hitting a trap. Reach level 9 for max payout!</div>
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
                <div className="text-[10px] text-gray-400">On Win: 2% edge (1% pool, 0.5% LP, 0.5% treasury)</div>
                <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
              </div>
              
              <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal - Updated to match wheel style */}
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
              <p className="text-[10px] text-gray-500 mb-3">Tap any game to see details. All results are provably fair.</p>
              
              <div className="flex-1 overflow-y-auto space-y-2">
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  </div>
                ) : historyGames.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No games yet</p>
                ) : (
                  historyGames.map((game, index) => {
                    const isPending = game.status === GameStatus.Pending;
                    const isWon = game.status === GameStatus.Won;
                    const isLost = game.status === GameStatus.Lost;
                    const isActive = game.status === GameStatus.Active;
                    const gameIdStr = game.gameId.toString();
                    const isExpanded = expandedGameId === gameIdStr;
                    const diffConfig = DIFFICULTIES[game.difficulty];
                    const finalMult = Number(game.currentMultiplier) / 10000;
                    const betAmt = parseFloat(formatUnits(game.betAmount, 18));
                    const payoutAmt = isWon ? betAmt * finalMult : 0;
                    
                    if (isPending || isActive) {
                      return (
                        <div key={index} className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                              <div>
                                <span className="text-xs text-amber-400 font-bold">
                                  {isPending ? "Waiting for reveal..." : `Active - Level ${game.currentLevel}`}
                                </span>
                                <div className="text-[9px] text-gray-500">{diffConfig.name} difficulty</div>
                              </div>
                            </div>
                            <div className="text-sm font-bold text-amber-400">
                              {betAmt.toFixed(2)} 🍩
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        key={index}
                        onClick={() => setExpandedGameId(isExpanded ? null : gameIdStr)}
                        className={cn(
                          "p-2 rounded-lg border cursor-pointer transition-all", 
                          isWon ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20" : "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-xl font-bold", isWon ? "text-green-400" : "text-red-400")}>
                              {isWon ? `${finalMult.toFixed(2)}x` : "💀"}
                            </span>
                            <div>
                              <span className="text-xs text-gray-400">{diffConfig.name} • Level {game.currentLevel}/9</span>
                              <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                {isWon ? "Cashed out" : "Hit trap"} <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                              </div>
                            </div>
                          </div>
                          <div className={cn("text-sm font-bold", isWon ? "text-green-400" : "text-red-400")}>
                            {isWon 
                              ? `+${payoutAmt.toFixed(2)}` 
                              : `-${betAmt.toFixed(2)}`
                            } 🍩
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
                                <span className="text-white">{diffConfig.name} ({diffConfig.tiles} tiles, {diffConfig.safe} safe)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Final Level:</span>
                                <span className={isWon ? "text-green-400" : "text-red-400"}>{game.currentLevel}/9</span>
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

      {/* Approvals Modal */}
      {showApprovals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowApprovals(false)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-4 max-w-sm w-full">
            <button onClick={() => setShowApprovals(false)} className="absolute right-3 top-3"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold mb-3">Approve DONUT</h3>
            <p className="text-sm text-gray-400 mb-4">One-time approval to play.</p>
            <ApproveButton spender={DONUT_TOWER_ADDRESS} onSuccess={() => { refetchAllowance(); setShowApprovals(false); }} />
          </div>
        </div>
      )}
    </main>
  );
}

function ApproveButton({ spender, onSuccess }: { spender: `0x${string}`; onSuccess: () => void }) {
  const { writeContract, isPending, isSuccess } = useWriteContract();
  useEffect(() => { if (isSuccess) onSuccess(); }, [isSuccess, onSuccess]);
  return (
    <button
      onClick={() => writeContract({ address: DONUT_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [spender, parseUnits("100", 18)] })}
      disabled={isPending}
      className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-bold"
    >
      {isPending ? "Approving..." : "Approve"}
    </button>
  );
}