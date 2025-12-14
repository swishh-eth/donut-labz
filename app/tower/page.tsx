"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Volume2, VolumeX } from "lucide-react";
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

const MULTIPLIER_TABLES = [
  [13066, 17421, 23228, 30970, 41294, 55058, 73411, 97881, 130508],
  [14700, 22050, 33075, 49612, 74419, 111628, 167442, 251163, 376745],
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

  // Contract writes
  const { data: startHash, writeContract: writeStart, isPending: isStartPending } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });

  const { data: climbHash, writeContract: writeClimb, isPending: isClimbPending, error: climbError, reset: resetClimb } = useWriteContract();
  const { isSuccess: isClimbSuccess, isLoading: isClimbConfirming } = useWaitForTransactionReceipt({ hash: climbHash });

  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

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
    
    // If no game ID, clear state
    if (!contractGameId || contractGameId === BigInt(0)) {
      // Only clear if not showing a result
      if (!gameResult) {
        setActiveGameId(null);
        setGameState(null);
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
      }
      return;
    }
    
    // Skip if we already have this game loaded with Active status
    // This prevents overwriting state we just updated from a climb
    if (activeGameId === contractGameId && gameState?.status === GameStatus.Active) {
      console.log("Load effect: skipping - already have active game");
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
  }, [isClimbSuccess, climbHash, publicClient, activeGameId, playClimbSound, playLoseSound, playWinSound, refetchActiveGame, refetchBalance, resetClimb]);

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
      }, 3000);
    }
  }, [isCashOutSuccess, isCashingOut, playWinSound, refetchActiveGame, refetchBalance]);

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
    if (!isStartSuccess || !isStartingGame || !publicClient || !address) return;
    
    console.log("Start tx confirmed, fetching game ID...");
    setIsWaitingForReveal(true);
    
    const startPolling = async () => {
      // Wait a moment then get the game ID
      await new Promise(r => setTimeout(r, 500));
      
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
          console.log("No game ID returned");
          setIsWaitingForReveal(false);
          setIsStartingGame(false);
        }
      } catch (e) {
        console.error("Error getting game ID:", e);
        setIsWaitingForReveal(false);
        setIsStartingGame(false);
      }
    };
    
    startPolling();
  }, [isStartSuccess, isStartingGame, publicClient, address]);

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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Donut Tower</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 animate-pulse">LIVE</span>
          </div>
          {context?.user?.pfpUrl ? (
            <img src={context.user.pfpUrl} alt="" className="w-7 h-7 rounded-full border border-zinc-700" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
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

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowHelp(false)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-4 max-w-sm w-full">
            <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold mb-3">How to Play</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>🏗️ Start a game to build your tower</p>
              <p>👆 Tap tiles to climb - 🍩 = safe, 💀 = trap</p>
              <p>📈 Each level increases your multiplier</p>
              <p>💰 Cash out anytime to claim winnings</p>
              <p className="text-amber-400">⚡ Higher risk = bigger rewards!</p>
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

const ERC20_ABI_APPROVE = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;