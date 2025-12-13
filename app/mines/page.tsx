"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Bomb, Trophy, History, HelpCircle, X, Loader2, DollarSign, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - UPDATE AFTER DEPLOYMENT
const DONUT_MINES_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const DONUT_TOKEN_ADDRESS = "0x376237C31E24A1eaF4F135B8B8F7c197073a70ee" as const;

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

const MINES_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "mineCount", type: "uint8" },
      { name: "commitHash", type: "bytes32" }
    ],
    name: "startGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "tileIndex", type: "uint8" },
      { name: "secret", type: "bytes32" }
    ],
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
    inputs: [{ name: "player", type: "address" }],
    name: "activeGame",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "getGame",
    outputs: [{
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "mineCount", type: "uint8" },
        { name: "commitHash", type: "bytes32" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "revealedTiles", type: "uint256" },
        { name: "safeRevealed", type: "uint8" },
        { name: "currentMultiplier", type: "uint256" },
        { name: "payout", type: "uint256" },
        { name: "revealedSecret", type: "bytes32" },
        { name: "minePositions", type: "uint256" }
      ],
      type: "tuple"
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "mineCount", type: "uint8" }, { name: "safeRevealed", type: "uint8" }],
    name: "calculateMultiplier",
    outputs: [{ type: "uint256" }],
    stateMutability: "pure",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }, { name: "count", type: "uint256" }],
    name: "getPlayerRecentGames",
    outputs: [{
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "mineCount", type: "uint8" },
        { name: "commitHash", type: "bytes32" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "revealedTiles", type: "uint256" },
        { name: "safeRevealed", type: "uint8" },
        { name: "currentMultiplier", type: "uint256" },
        { name: "payout", type: "uint256" },
        { name: "revealedSecret", type: "bytes32" },
        { name: "minePositions", type: "uint256" }
      ],
      type: "tuple[]"
    }],
    stateMutability: "view",
    type: "function"
  }
] as const;

type GameStatus = "None" | "Active" | "Won" | "Lost" | "CashedOut" | "Expired";

const STATUS_MAP: Record<number, GameStatus> = {
  0: "None",
  1: "Active",
  2: "Won",
  3: "Lost",
  4: "CashedOut",
  5: "Expired"
};

type OnchainGame = {
  player: `0x${string}`;
  token: `0x${string}`;
  betAmount: bigint;
  mineCount: number;
  commitHash: `0x${string}`;
  commitBlock: bigint;
  status: number;
  revealedTiles: bigint;
  safeRevealed: number;
  currentMultiplier: bigint;
  payout: bigint;
  revealedSecret: `0x${string}`;
  minePositions: bigint;
};

type PendingGame = {
  secret: `0x${string}`;
  commitHash: `0x${string}`;
  gameId: bigint | null;
  mineCount: number;
  amount: string;
};

// Generate a random bytes32 secret
const generateSecret = (): `0x${string}` => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
};

// Hash the secret
const hashSecret = (secret: `0x${string}`): `0x${string}` => {
  return keccak256(encodePacked(['bytes32'], [secret]));
};

// Calculate multiplier for display
const calculateDisplayMultiplier = (mineCount: number, safeRevealed: number): number => {
  if (safeRevealed === 0) return 1.0;
  
  let multiplier = 1.0;
  const safeTiles = 25 - mineCount;
  
  for (let i = 0; i < safeRevealed; i++) {
    multiplier *= (25 - i) / (safeTiles - i);
  }
  
  return multiplier * 0.98; // Apply house edge
};

// Tile component
function Tile({ 
  index, 
  isRevealed, 
  isMine, 
  isGameOver,
  minePositions,
  onClick,
  disabled
}: {
  index: number;
  isRevealed: boolean;
  isMine: boolean;
  isGameOver: boolean;
  minePositions: bigint;
  onClick: () => void;
  disabled: boolean;
}) {
  const showMine = isGameOver && (Number(minePositions) & (1 << index)) !== 0;
  const isExploded = isRevealed && isMine;
  
  return (
    <button
      onClick={onClick}
      disabled={disabled || isRevealed}
      className={cn(
        "aspect-square rounded-lg border-2 transition-all duration-200 flex items-center justify-center text-lg font-bold",
        isRevealed && !isMine && "bg-green-500/30 border-green-500 text-green-400",
        isExploded && "bg-red-500/30 border-red-500 text-red-400 animate-pulse",
        showMine && !isExploded && "bg-red-500/10 border-red-500/50 text-red-400/50",
        !isRevealed && !showMine && "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 active:scale-95",
        disabled && !isRevealed && "opacity-50 cursor-not-allowed hover:bg-zinc-800 hover:border-zinc-700"
      )}
    >
      {isRevealed && !isMine && <Gem className="w-5 h-5" />}
      {(isExploded || showMine) && <Bomb className="w-5 h-5" />}
    </button>
  );
}

export default function MinesPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [mineCount, setMineCount] = useState<number>(5);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingGame, setPendingGame] = useState<PendingGame | null>(null);
  const [gameStep, setGameStep] = useState<"idle" | "approving" | "starting" | "playing" | "revealing" | "cashing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const { address, isConnected } = useAccount();

  // Load Farcaster context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // Notify Farcaster ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Calculate current multiplier and next multiplier
  const currentMultiplier = pendingGame ? calculateDisplayMultiplier(mineCount, 0) : 1.0;
  const nextMultiplier = calculateDisplayMultiplier(mineCount, 1);
  const potentialWin = (parseFloat(betAmount || "0") * nextMultiplier).toFixed(2);

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

  // Read active game
  const { data: activeGameId, refetch: refetchActiveGame } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "activeGame",
    args: address ? [address] : undefined,
  });

  // Read game details if active
  const { data: activeGameData, refetch: refetchGameData } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "getGame",
    args: activeGameId && activeGameId > BigInt(0) ? [activeGameId] : undefined,
    query: { enabled: !!activeGameId && activeGameId > BigInt(0) }
  });

  // Read recent games for history
  const { data: recentGames, refetch: refetchGames } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "getPlayerRecentGames",
    args: address ? [address, BigInt(10)] : undefined,
  });

  // Write contracts
  const { 
    writeContract: writeApprove, 
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove
  } = useWriteContract();

  const { 
    writeContract: writeStartGame, 
    data: startHash,
    isPending: isStartPending,
    error: startError,
    reset: resetStart
  } = useWriteContract();

  const { 
    writeContract: writeRevealTile, 
    data: revealHash,
    isPending: isRevealPending,
    error: revealError,
    reset: resetReveal
  } = useWriteContract();

  const { 
    writeContract: writeCashOut, 
    data: cashOutHash,
    isPending: isCashOutPending,
    error: cashOutError,
    reset: resetCashOut
  } = useWriteContract();

  // Transaction receipts
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });
  const { isSuccess: isRevealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

  // Handle errors
  useEffect(() => {
    const error = approveError || startError || revealError || cashOutError;
    if (error) {
      const msg = error.message;
      if (msg.includes("User rejected")) {
        setErrorMessage("Transaction cancelled");
      } else if (msg.includes("insufficient")) {
        setErrorMessage("Insufficient balance");
      } else {
        setErrorMessage("Transaction failed");
      }
      setGameStep("idle");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [approveError, startError, revealError, cashOutError]);

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess && gameStep === "approving") {
      refetchAllowance();
      // Continue to start game
      startNewGame();
    }
  }, [isApproveSuccess, gameStep]);

  // Handle start game success
  useEffect(() => {
    if (isStartSuccess && gameStep === "starting") {
      setGameStep("playing");
      refetchActiveGame();
      refetchGameData();
      try { sdk.haptics.impactOccurred("medium"); } catch {}
    }
  }, [isStartSuccess, gameStep]);

  // Handle reveal success
  useEffect(() => {
    if (isRevealSuccess && gameStep === "revealing") {
      setGameStep("playing");
      refetchGameData();
      
      // Check if game ended
      if (activeGameData) {
        const game = activeGameData as OnchainGame;
        if (game.status === 3) { // Lost
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setErrorMessage("BOOM! 💥");
          setTimeout(() => setErrorMessage(null), 2000);
        } else {
          try { sdk.haptics.impactOccurred("light"); } catch {}
        }
      }
    }
  }, [isRevealSuccess, gameStep]);

  // Handle cash out success
  useEffect(() => {
    if (isCashOutSuccess && gameStep === "cashing") {
      setGameStep("idle");
      setPendingGame(null);
      setShowConfetti(true);
      refetchBalance();
      refetchActiveGame();
      refetchGames();
      
      // Celebration haptics
      try {
        sdk.haptics.impactOccurred("heavy");
        setTimeout(() => sdk.haptics.impactOccurred("medium"), 100);
        setTimeout(() => sdk.haptics.impactOccurred("light"), 200);
      } catch {}
      
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [isCashOutSuccess, gameStep]);

  const startNewGame = async () => {
    if (!address) return;
    
    const amountWei = parseUnits(betAmount, 18);
    const secret = generateSecret();
    const commitHash = hashSecret(secret);
    
    setPendingGame({
      secret,
      commitHash,
      gameId: null,
      mineCount,
      amount: betAmount
    });
    
    setGameStep("starting");
    
    writeStartGame({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_ABI,
      functionName: "startGame",
      args: [DONUT_TOKEN_ADDRESS, amountWei, mineCount, commitHash]
    });
  };

  const handleStartGame = async () => {
    if (!isConnected || !address) return;
    
    const amountWei = parseUnits(betAmount, 18);
    
    // Check if approval needed
    const needsApproval = !allowance || allowance < amountWei;
    
    if (needsApproval) {
      setGameStep("approving");
      writeApprove({
        address: DONUT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [DONUT_MINES_ADDRESS, parseUnits("10", 18)] // Approve 10 at a time
      });
    } else {
      startNewGame();
    }
  };

  const handleRevealTile = (tileIndex: number) => {
    if (!pendingGame || !activeGameId || gameStep !== "playing") return;
    
    setGameStep("revealing");
    
    writeRevealTile({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_ABI,
      functionName: "revealTile",
      args: [activeGameId, tileIndex, pendingGame.secret]
    });
  };

  const handleCashOut = () => {
    if (!activeGameId || gameStep !== "playing") return;
    
    setGameStep("cashing");
    
    writeCashOut({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_ABI,
      functionName: "cashOut",
      args: [activeGameId]
    });
  };

  const isProcessing = gameStep !== "idle" && gameStep !== "playing";
  const hasActiveGame = activeGameId && activeGameId > BigInt(0);
  const game = activeGameData as OnchainGame | undefined;
  const isGameActive = game?.status === 1;
  const revealedTiles = game ? Number(game.revealedTiles) : 0;
  const safeRevealed = game?.safeRevealed || 0;
  const displayMultiplier = game ? Number(game.currentMultiplier) / 100 : 1.0;
  const minePositions = game?.minePositions || BigInt(0);

  const formattedBalance = tokenBalance 
    ? parseFloat(formatUnits(tokenBalance, 18)).toFixed(2)
    : "0.00";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s ease-out forwards; }
      `}</style>

      {/* Donut Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                position: 'absolute',
                left: `${Math.random() * 100}%`,
                top: '-50px',
                fontSize: `${20 + Math.random() * 20}px`,
                animationDelay: `${Math.random() * 0.5}s`,
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
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">MINES</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
              BETA
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1 opacity-50">
              <span className="text-[8px] text-gray-500 whitespace-nowrap">Earn GLAZE soon</span>
            </div>
            {context?.user?.pfpUrl ? (
              <img src={context.user.pfpUrl} alt="pfp" className="w-7 h-7 rounded-full border border-zinc-700" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-3 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] text-gray-500 uppercase">Balance</span>
            <span className="text-base font-bold text-white">🍩{formattedBalance}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] text-gray-500 uppercase">Mines</span>
            <span className="text-base font-bold text-white">💣 {mineCount}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] text-gray-500 uppercase">Multiplier</span>
            <span className="text-base font-bold text-amber-400">{displayMultiplier.toFixed(2)}x</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <History className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Game Grid */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="grid grid-cols-5 gap-2 w-full max-w-[300px] mb-4">
            {Array.from({ length: 25 }).map((_, i) => {
              const isRevealed = (revealedTiles & (1 << i)) !== 0;
              const isMine = isRevealed && game?.status === 3 && (Number(minePositions) & (1 << i)) !== 0;
              
              return (
                <Tile
                  key={i}
                  index={i}
                  isRevealed={isRevealed}
                  isMine={isMine}
                  isGameOver={game?.status === 3 || game?.status === 4}
                  minePositions={minePositions}
                  onClick={() => handleRevealTile(i)}
                  disabled={!isGameActive || gameStep === "revealing"}
                />
              );
            })}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="text-red-400 text-sm font-bold mb-2">{errorMessage}</div>
          )}

          {/* Game Status */}
          {isGameActive && safeRevealed > 0 && (
            <div className="text-center mb-4">
              <div className="text-sm text-gray-400">Current Payout</div>
              <div className="text-2xl font-bold text-green-400">
                🍩 {(parseFloat(game?.betAmount ? formatUnits(game.betAmount, 18) : "0") * displayMultiplier * 0.98).toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex-shrink-0 space-y-2">
          {/* Mine Count Selector */}
          {!hasActiveGame && (
            <>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">Mines</span>
                  <span className="text-sm font-bold text-white">{mineCount}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={mineCount}
                  onChange={(e) => setMineCount(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                  disabled={isProcessing}
                />
                <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                  <span>1 (Safe)</span>
                  <span>24 (Risky)</span>
                </div>
              </div>

              {/* Bet Amount */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">Bet (max 1 DONUT)</span>
                  <div className="flex gap-1">
                    {["0.25", "0.5", "0.75", "1"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setBetAmount(val)}
                        className={cn(
                          "px-2 py-0.5 text-[10px] rounded border transition-colors",
                          betAmount === val
                            ? "bg-amber-500 text-black border-amber-500"
                            : "bg-zinc-800 text-gray-400 border-zinc-700 hover:border-zinc-600"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-center text-lg font-bold"
                  disabled={isProcessing}
                />
              </div>
            </>
          )}

          {/* Action Button */}
          {!hasActiveGame ? (
            <button
              onClick={handleStartGame}
              disabled={isProcessing || !isConnected}
              className="w-full py-3 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-lg tracking-wide disabled:opacity-50 transition-colors"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {gameStep === "approving" ? "Approving..." : "Starting..."}
                </span>
              ) : (
                "START GAME"
              )}
            </button>
          ) : isGameActive ? (
            <button
              onClick={handleCashOut}
              disabled={safeRevealed === 0 || gameStep === "revealing" || gameStep === "cashing"}
              className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 text-black font-bold text-lg tracking-wide disabled:opacity-50 transition-colors"
            >
              {gameStep === "cashing" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cashing Out...
                </span>
              ) : (
                `CASH OUT ${displayMultiplier.toFixed(2)}x`
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                setPendingGame(null);
                refetchActiveGame();
                resetStart();
                resetReveal();
                resetCashOut();
              }}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-lg tracking-wide transition-colors"
            >
              NEW GAME
            </button>
          )}
        </div>

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button
                  onClick={() => setShowHelp(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Bomb className="w-4 h-4" />
                  How to Play Mines
                </h2>

                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Set Mines & Bet</div>
                      <div className="text-[11px] text-gray-400">Choose how many mines (1-24) and your bet amount.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Reveal Tiles</div>
                      <div className="text-[11px] text-gray-400">Click tiles to reveal. Each safe tile increases your multiplier.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">3</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Cash Out Anytime</div>
                      <div className="text-[11px] text-gray-400">Take your winnings whenever you want, or keep going for higher multipliers.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">!</div>
                    <div>
                      <div className="font-semibold text-red-400 text-xs">Hit a Mine = Lose All</div>
                      <div className="text-[11px] text-gray-400">If you reveal a mine, you lose your entire bet.</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="font-semibold text-amber-400 text-xs mb-1">2% House Edge</div>
                  <div className="text-[11px] text-gray-400">1% → House (Pool Growth)</div>
                  <div className="text-[11px] text-gray-400">0.5% → LP Burn Rewards</div>
                  <div className="text-[11px] text-gray-400">0.5% → Treasury</div>
                </div>

                <button
                  onClick={() => setShowHelp(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[80vh]">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
                <button
                  onClick={() => setShowHistory(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Game History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Your recent mines games</p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {recentGames && (recentGames as OnchainGame[]).length > 0 ? (
                    (recentGames as OnchainGame[]).map((g, index) => (
                      <div
                        key={index}
                        className={cn(
                          "p-2 rounded-lg border",
                          g.status === 4 ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-bold",
                              g.status === 4 ? "text-green-400" : "text-red-400"
                            )}>
                              {g.status === 4 ? "Won" : "Lost"}
                            </span>
                            <span className="text-xs text-gray-400">
                              {g.mineCount} mines • {g.safeRevealed} revealed
                            </span>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              "text-sm font-bold",
                              g.status === 4 ? "text-green-400" : "text-red-400"
                            )}>
                              {g.status === 4
                                ? `+${parseFloat(formatUnits(g.payout, 18)).toFixed(2)}`
                                : `-${parseFloat(formatUnits(g.betAmount, 18)).toFixed(2)}`
                              }
                            </div>
                            <div className="text-[9px] text-gray-600">🍩 DONUT</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-8">No games yet</div>
                  )}
                </div>

                <button
                  onClick={() => setShowHistory(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}