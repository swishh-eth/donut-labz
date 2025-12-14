"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Bomb, Trophy, History, HelpCircle, X, Loader2, DollarSign, Gem, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const DONUT_MINES_ADDRESS = "0x9f83a0103eb385cDA21D32dfD3D6C628d591e667" as const;
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

const MINES_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "mineCount", type: "uint8" },
      { name: "commitHash", type: "bytes32" }
    ],
    name: "startGame",
    outputs: [{ type: "uint256" }],
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
    name: "getActiveGames",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "getGame",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "commitBlock", type: "uint256" },
      { name: "mineCount", type: "uint8" },
      { name: "safeRevealed", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "revealedTiles", type: "uint32" },
      { name: "minePositions", type: "uint32" },
      { name: "payout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "gameCore",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "commitBlock", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "revealedSecret", type: "bytes32" }
    ],
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
    inputs: [{ name: "gameId", type: "uint256" }],
    name: "claimExpired",
    outputs: [],
    stateMutability: "nonpayable",
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

type OnchainGame = [
  `0x${string}`, // player
  `0x${string}`, // token
  bigint,        // betAmount
  bigint,        // commitBlock
  number,        // mineCount
  number,        // safeRevealed
  number,        // status
  number,        // revealedTiles
  number,        // minePositions
  bigint         // payout
];

type PendingGame = {
  secret: `0x${string}`;
  commitHash: `0x${string}`;
  gameId: bigint | null;
  mineCount: number;
  amount: string;
};

// Local storage key for game secrets
const GAME_SECRETS_KEY = "donut-mines-secrets";

// Save game secret to localStorage
const saveGameSecret = (gameId: string, secret: string) => {
  try {
    const secrets = JSON.parse(localStorage.getItem(GAME_SECRETS_KEY) || "{}");
    secrets[gameId] = secret;
    localStorage.setItem(GAME_SECRETS_KEY, JSON.stringify(secrets));
  } catch {}
};

// Get game secret from localStorage
const getGameSecret = (gameId: string): `0x${string}` | null => {
  try {
    const secrets = JSON.parse(localStorage.getItem(GAME_SECRETS_KEY) || "{}");
    return secrets[gameId] || null;
  } catch {
    return null;
  }
};

// Clear game secret from localStorage
const clearGameSecret = (gameId: string) => {
  try {
    const secrets = JSON.parse(localStorage.getItem(GAME_SECRETS_KEY) || "{}");
    delete secrets[gameId];
    localStorage.setItem(GAME_SECRETS_KEY, JSON.stringify(secrets));
  } catch {}
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
  isPending,
  onClick,
  disabled
}: {
  index: number;
  isRevealed: boolean;
  isMine: boolean;
  isGameOver: boolean;
  minePositions: bigint;
  isPending: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const showMine = isGameOver && (Number(minePositions) & (1 << index)) !== 0;
  const isExploded = isRevealed && isMine;
  
  return (
    <button
      onClick={onClick}
      disabled={disabled || isRevealed || isPending}
      className={cn(
        "aspect-square rounded-lg border-2 transition-all duration-200 flex items-center justify-center text-lg font-bold",
        isPending && "bg-amber-500/50 border-amber-400 animate-pulse",
        isRevealed && !isMine && "bg-amber-500/30 border-amber-500 text-amber-400",
        isExploded && "bg-red-500/30 border-red-500 text-red-400 animate-pulse",
        showMine && !isExploded && "bg-red-500/10 border-red-500/50 text-red-400/50",
        !isRevealed && !showMine && !isPending && "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 active:scale-95",
        disabled && !isRevealed && !isPending && "opacity-50 cursor-not-allowed hover:bg-zinc-800 hover:border-zinc-700"
      )}
    >
      {isPending && <Loader2 className="w-5 h-5 animate-spin text-amber-400" />}
      {isRevealed && !isMine && !isPending && <span className="text-xl">🍩</span>}
      {(isExploded || showMine) && <Bomb className="w-5 h-5" />}
    </button>
  );
}

export default function MinesPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [mineCount, setMineCount] = useState<number>(1);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showBetaPopup, setShowBetaPopup] = useState(false);
  const [showApprovalArrow, setShowApprovalArrow] = useState(false);
  const [dismissedGameId, setDismissedGameId] = useState<bigint | null>(null);
  const [dismissedPendingNotice, setDismissedPendingNotice] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "mines" | "bet">("none");
  const [customApprovalAmount, setCustomApprovalAmount] = useState<string>("");
  const [pendingGame, setPendingGame] = useState<PendingGame | null>(null);
  const [gameStep, setGameStep] = useState<"idle" | "approving" | "starting" | "playing" | "revealing" | "cashing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiData, setConfettiData] = useState<Array<{left: number, size: number, delay: number, duration: number}>>([]);
  const [pendingTileIndex, setPendingTileIndex] = useState<number | null>(null); // Optimistic tile reveal
  const [localRevealedTiles, setLocalRevealedTiles] = useState<number>(0); // Track revealed tiles locally

  // Generate confetti data when showing confetti
  useEffect(() => {
    if (showConfetti) {
      const data = Array.from({ length: 40 }, () => ({
        left: Math.random() * 100,
        size: 18 + Math.random() * 24,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 2,
      }));
      setConfettiData(data);
    }
  }, [showConfetti]);

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

  // Refetch balance when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchBalance();
        refetchAllowance();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchBalance, refetchAllowance]);

  // Auto-show approvals modal if user has no allowance set
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals) {
      // Small delay to let the page load first
      const timer = setTimeout(() => {
        setShowApprovals(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance]);

  // Read active games
  const { data: activeGameIds, refetch: refetchActiveGames } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "getActiveGames",
    args: address ? [address] : undefined,
  });

  // Find the current playable game (one we have the secret for)
  const allActiveGameIds = (activeGameIds as bigint[]) || [];
  
  // Get the game we're currently playing (have secret for)
  const currentGameId = pendingGame?.gameId || (allActiveGameIds.length > 0 ? allActiveGameIds[0] : undefined);
  
  // Check if we have a secret for current game
  const hasSecretForCurrentGame = (): boolean => {
    if (pendingGame?.secret) return true;
    if (!currentGameId) return false;
    // We'll check localStorage when needed
    return false;
  };

  // Read game details if we have an active game
  const { data: activeGameData, refetch: refetchGameData } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "getGame",
    args: currentGameId ? [currentGameId] : undefined,
    query: { enabled: !!currentGameId }
  });

  // Read game core (for commitHash) if active
  const { data: activeGameCore } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "gameCore",
    args: currentGameId ? [currentGameId] : undefined,
    query: { enabled: !!currentGameId }
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

  const { 
    writeContract: writeClaimExpired, 
    data: claimExpiredHash,
    isPending: isClaimPending,
    error: claimExpiredError
  } = useWriteContract();

  // Transaction receipts
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });
  const { isSuccess: isRevealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });
  const { isSuccess: isClaimExpiredSuccess } = useWaitForTransactionReceipt({ hash: claimExpiredHash });

  // Handle errors
  useEffect(() => {
    const error = approveError || startError || revealError || cashOutError || claimExpiredError;
    if (error) {
      const msg = error.message || "";
      console.log("Transaction error:", msg);
      
      // Try to extract the revert reason
      let displayMsg = "Transaction failed";
      
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        displayMsg = "Transaction cancelled";
      } else if (msg.includes("insufficient") || msg.includes("Insufficient")) {
        displayMsg = "Insufficient balance";
      } else if (msg.includes("Insufficient pool")) {
        displayMsg = "Pool empty - try smaller bet";
      } else if (msg.includes("Token not supported")) {
        displayMsg = "Token not enabled";
      } else if (msg.includes("Invalid amount")) {
        displayMsg = "Bet out of range (0.1-1)";
      } else if (msg.includes("Paused")) {
        displayMsg = "Game is paused";
      } else if (msg.includes("reverted")) {
        // Try to find the reason after "reverted"
        const match = msg.match(/reverted[:\s]*([^"]+)/i);
        if (match) {
          displayMsg = match[1].slice(0, 40);
        }
      } else if (msg.includes("reason:")) {
        const match = msg.match(/reason:\s*([^\n]+)/i);
        if (match) {
          displayMsg = match[1].slice(0, 40);
        }
      }
      
      setErrorMessage(displayMsg);
      setGameStep("idle");
      setPendingTileIndex(null); // Clear pending tile on error
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [approveError, startError, revealError, cashOutError, claimExpiredError]);

  // Handle approval success - just refetch allowance
  useEffect(() => {
    if (isApproveSuccess) {
      resetApprove();
      refetchAllowance();
      try { sdk.haptics.notificationOccurred("success"); } catch {}
    }
  }, [isApproveSuccess]);

  // Handle start game success
  useEffect(() => {
    if (isStartSuccess && gameStep === "starting") {
      resetStart(); // Reset so we can start again later
      
      // Refetch active games multiple times to ensure we get the new game
      const doRefetch = async () => {
        await refetchActiveGames();
        await refetchGameData();
        setGameStep("playing");
        try { sdk.haptics.impactOccurred("medium"); } catch {}
      };
      
      doRefetch();
      // Also refetch again after delays in case blockchain is slow
      setTimeout(() => refetchActiveGames(), 500);
      setTimeout(() => refetchActiveGames(), 1500);
    }
  }, [isStartSuccess, gameStep]);

  // When active game is detected with secret, set gameStep to playing
  useEffect(() => {
    if (currentGameId && gameStep === "idle") {
      const secret = getSecretForGame();
      if (secret) {
        setGameStep("playing");
      }
    }
  }, [currentGameId, gameStep, pendingGame, activeGameCore]);

  // Handle claim expired success
  useEffect(() => {
    if (isClaimExpiredSuccess) {
      setGameStep("idle");
      setPendingGame(null);
      refetchBalance();
      refetchActiveGames();
      setErrorMessage(null);
      try { sdk.haptics.impactOccurred("medium"); } catch {}
    }
  }, [isClaimExpiredSuccess]);

  // Handle reveal success
  useEffect(() => {
    if (isRevealSuccess && gameStep === "revealing") {
      // Mark the tile as revealed locally immediately
      if (pendingTileIndex !== null) {
        setLocalRevealedTiles(prev => prev | (1 << pendingTileIndex));
      }
      
      // Clear pending tile and set back to playing
      setPendingTileIndex(null);
      setGameStep("playing");
      
      // Show confetti and haptics immediately (optimistic - assume safe)
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
      try {
        sdk.haptics.impactOccurred("medium");
      } catch {}
      
      // Reset reveal so we can reveal again
      resetReveal();
      
      // Refetch game data multiple times to catch the update
      refetchGameData();
      setTimeout(() => refetchGameData(), 300);
      setTimeout(() => refetchGameData(), 800);
      setTimeout(() => {
        refetchGameData().then((result) => {
          const gameData = result.data as OnchainGame | undefined;
          if (gameData && gameData[6] === 3) {
            // Actually lost - heavy haptic
            try { sdk.haptics.impactOccurred("heavy"); } catch {}
          }
        });
      }, 1500);
    }
  }, [isRevealSuccess, gameStep]);

  // Handle cash out success
  useEffect(() => {
    if (isCashOutSuccess && gameStep === "cashing") {
      // Dismiss the current game so we don't show it anymore
      if (currentGameId) {
        setDismissedGameId(currentGameId);
      }
      setGameStep("idle");
      setPendingGame(null);
      setShowConfetti(true);
      refetchBalance();
      refetchActiveGames();
      // Reset cash out state so it can be used again
      resetCashOut();
      
      // Celebration haptics
      try {
        sdk.haptics.impactOccurred("heavy");
        setTimeout(() => sdk.haptics.impactOccurred("medium"), 100);
        setTimeout(() => sdk.haptics.impactOccurred("light"), 200);
      } catch {}
      
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [isCashOutSuccess, gameStep]);

  const startNewGame = async () => {
    if (!address) return;
    
    // Validate bet amount
    const betNum = parseFloat(betAmount);
    if (isNaN(betNum) || betNum <= 0 || betNum > 1) {
      setErrorMessage("Invalid bet amount");
      setGameStep("idle");
      return;
    }
    
    // Clear any dismissed game since we're starting fresh
    setDismissedGameId(null);
    setDismissedPendingNotice(false);
    setLocalRevealedTiles(0); // Reset local revealed tiles
    
    const amountWei = parseUnits(betAmount, 18);
    const secret = generateSecret();
    const commitHash = hashSecret(secret);
    
    // Store secret temporarily - we'll save to localStorage with gameId after tx confirms
    setPendingGame({
      secret,
      commitHash,
      gameId: null,
      mineCount,
      amount: betAmount
    });
    
    // Also save to localStorage with commitHash as temp key
    saveGameSecret(commitHash, secret);
    
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
    // Prevent double clicks - check if already starting or have pending game
    if (gameStep === "starting" || gameStep === "approving" || isStartPending || isApprovePending) return;
    if (pendingGame !== null) return; // Already have a pending game
    
    // Validate bet amount
    const betNum = parseFloat(betAmount);
    if (isNaN(betNum) || betNum < 0.1 || betNum > 1) {
      setErrorMessage("Bet must be between 0.1 and 1 DONUT");
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    
    // Check if approval needed - show modal instead of auto-approving
    const needsApproval = !allowance || allowance < amountWei;
    
    if (needsApproval) {
      setShowApprovals(true);
      setErrorMessage("Need more approval - tap shield icon to add more");
      return;
    }
    
    startNewGame();
  };

  const handleRevealTile = (tileIndex: number) => {
    if (!currentGameId || gameStep !== "playing") return;
    
    // Try to get secret from pendingGame state first, then localStorage
    let secret: `0x${string}` | null = pendingGame?.secret || null;
    
    if (!secret && activeGameCore) {
      // gameCore returns: [player, token, betAmount, commitBlock, commitHash, revealedSecret]
      const coreData = activeGameCore as [`0x${string}`, `0x${string}`, bigint, bigint, `0x${string}`, `0x${string}`];
      const commitHash = coreData[4]; // commitHash is index 4
      
      // Look up secret by commitHash in localStorage
      secret = getGameSecret(commitHash);
    }
    
    if (!secret) {
      setErrorMessage("Secret not found - check history to claim");
      return;
    }
    
    // Optimistic update - show tile as pending immediately
    setPendingTileIndex(tileIndex);
    setGameStep("revealing");
    
    // Haptic feedback immediately
    try { sdk.haptics.impactOccurred("light"); } catch {}
    
    writeRevealTile({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_ABI,
      functionName: "revealTile",
      args: [currentGameId, tileIndex, secret]
    });
  };

  const handleCashOut = () => {
    if (!currentGameId || gameStep !== "playing") return;
    
    setGameStep("cashing");
    
    writeCashOut({
      address: DONUT_MINES_ADDRESS,
      abi: MINES_ABI,
      functionName: "cashOut",
      args: [currentGameId]
    });
  };

  // Check if we have a playable game (with secret)
  const getSecretForGame = (): `0x${string}` | null => {
    if (pendingGame?.secret) {
      return pendingGame.secret;
    }
    if (activeGameCore) {
      const coreData = activeGameCore as [`0x${string}`, `0x${string}`, bigint, bigint, `0x${string}`, `0x${string}`];
      const commitHash = coreData[4];
      return getGameSecret(commitHash);
    }
    return null;
  };

  const isProcessing = gameStep !== "idle" && gameStep !== "playing";
  const hasSecretForGame = currentGameId !== undefined && getSecretForGame() !== null;
  const game = activeGameData as OnchainGame | undefined;
  const isGameActive = game ? game[6] === 1 : false; // status is index 6
  const isGameOver = game ? (game[6] === 3 || game[6] === 4) : false; // Lost or CashedOut
  // Don't show game if user dismissed it
  const isGameDismissed = currentGameId !== undefined && dismissedGameId === currentGameId;
  // Show grid if: we have a secret for active game, OR game just ended (but only if we were playing it and haven't dismissed)
  const hasPlayableGame = !isGameDismissed && ((hasSecretForGame && isGameActive) || (isGameOver && gameStep === "playing"));
  const revealedTiles = game ? Number(game[7]) : 0; // revealedTiles is index 7
  const safeRevealed = game ? Number(game[5]) : 0; // safeRevealed is index 5
  const gameMineCount = game ? Number(game[4]) : mineCount; // mineCount is index 4
  const displayMultiplier = calculateDisplayMultiplier(gameMineCount, safeRevealed);
  const minePositions = game ? BigInt(game[8]) : BigInt(0); // minePositions is index 8
  const gameBetAmount = game ? game[2] : BigInt(0); // betAmount is index 2
  
  // Sync local revealed tiles with contract when contract has more reveals
  useEffect(() => {
    if (revealedTiles > localRevealedTiles) {
      setLocalRevealedTiles(revealedTiles);
    }
  }, [revealedTiles]);
  
  // Only count games that are truly pending (not the current playable game)
  const pendingGamesCount = allActiveGameIds.filter(id => {
    // Exclude current game if we have a secret for it
    if (currentGameId !== undefined && id === currentGameId && hasSecretForGame) return false;
    return true;
  }).length;

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
          0% { 
            transform: translateY(-60px) rotate(0deg); 
            opacity: 1; 
          }
          75% { 
            opacity: 1; 
          }
          100% { 
            transform: translateY(100vh) rotate(720deg); 
            opacity: 0; 
          }
        }
        @keyframes toast-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes bounce-down {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .confetti { animation: confetti-fall linear forwards; }
        .toast-animate { animation: toast-in 0.2s ease-out forwards; }
        .arrow-bounce { 
          animation: fade-in 0.3s ease-out forwards, bounce-down 0.8s ease-in-out infinite;
        }
        .control-bar {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .panel-slide {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      {/* Donut Confetti */}
      {showConfetti && confettiData.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {confettiData.map((item, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                position: 'absolute',
                left: `${item.left}%`,
                top: '-60px',
                fontSize: `${item.size}px`,
                animationDelay: `${item.delay}s`,
                animationDuration: `${item.duration}s`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div 
          className="fixed left-1/2 -translate-x-1/2 z-[100] toast-animate"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
        >
          <div className="bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-red-400">
            <span className="text-sm font-bold">{errorMessage}</span>
            <button 
              onClick={() => setErrorMessage(null)}
              className="ml-1 hover:bg-red-400/30 rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Beta Popup */}
      {showBetaPopup && (
        <div 
          className="fixed left-1/2 -translate-x-1/2 z-[100] toast-animate"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
        >
          <div className="bg-amber-500 text-black px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-amber-400">
            <span className="text-sm font-bold">🚧 Beta: Only 1 mine available</span>
          </div>
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

        {/* Token Selector */}
        <div className="flex gap-2 mb-2 flex-shrink-0">
          <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500 text-black font-bold text-sm">
            <span>🍩</span> DONUT
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-gray-500 font-bold text-sm opacity-50">
            <span>✨</span> SPRINKLES
            <span className="text-[8px] text-gray-600 ml-1">SOON</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-2 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Balance</span>
            <span className="text-sm font-bold text-white">🍩{formattedBalance}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Mines</span>
            <span className="text-sm font-bold text-white">💣 {gameMineCount}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Multiplier</span>
            <span className="text-sm font-bold text-amber-400">{displayMultiplier.toFixed(2)}x</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => setShowApprovals(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <Shield className="w-4 h-4 text-gray-400" />
          </button>
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
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          {hasPlayableGame ? (
            <>
              <div className="grid grid-cols-5 gap-2 w-full max-w-[320px] mb-2">
                {Array.from({ length: 25 }).map((_, i) => {
                  // Combine contract revealed tiles with locally tracked ones
                  const combinedRevealedTiles = revealedTiles | localRevealedTiles;
                  const isRevealed = (combinedRevealedTiles & (1 << i)) !== 0;
                  const isMine = isRevealed && game !== undefined && game[6] === 3 && (Number(minePositions) & (1 << i)) !== 0;
                  const isGameOver = game !== undefined && (game[6] === 3 || game[6] === 4);
                  
                  return (
                    <Tile
                      key={i}
                      index={i}
                      isRevealed={isRevealed}
                      isMine={isMine}
                      isGameOver={isGameOver}
                      minePositions={minePositions}
                      isPending={pendingTileIndex === i}
                      onClick={() => handleRevealTile(i)}
                      disabled={!isGameActive || gameStep === "revealing"}
                    />
                  );
                })}
              </div>

              {/* Game Status & Cash Out */}
              {isGameActive ? (
                <div className="w-full max-w-[320px] mt-2">
                  {safeRevealed > 0 && (
                    <div className="text-center mb-2">
                      <div className="text-xs text-gray-400">Current Payout</div>
                      <div className="text-xl font-bold text-green-400">
                        🍩 {(parseFloat(formatUnits(gameBetAmount, 18)) * displayMultiplier).toFixed(4)}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleCashOut}
                    disabled={safeRevealed === 0 || gameStep === "revealing" || gameStep === "cashing"}
                    className="w-full py-3 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-lg tracking-wide disabled:opacity-50 transition-colors"
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
                </div>
              ) : game && (game[6] === 3 || game[6] === 4) ? (
                /* Game Over - Lost or Cashed Out */
                <div className="w-full max-w-[320px] mt-2">
                  <div className="text-center mb-3">
                    <div className={cn(
                      "text-xl font-bold",
                      game[6] === 3 ? "text-red-400" : "text-green-400"
                    )}>
                      {game[6] === 3 ? "💥 BOOM!" : "🎉 CASHED OUT!"}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {game[6] === 3 
                        ? `Lost ${parseFloat(formatUnits(gameBetAmount, 18)).toFixed(2)} DONUT`
                        : `Won ${parseFloat(formatUnits(game[9], 18)).toFixed(2)} DONUT`
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Mark this game as dismissed so we don't show it again
                      if (currentGameId) {
                        setDismissedGameId(currentGameId);
                      }
                      // Clear all game state to go back to "buy" screen
                      setPendingGame(null);
                      setGameStep("idle");
                      // Clear the current game from active games by refetching
                      // The contract will have removed this game from active list
                      refetchActiveGames();
                      refetchBalance();
                    }}
                    className="w-full py-3 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-lg tracking-wide transition-colors"
                  >
                    NEW GAME
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {/* Empty grid preview with pending overlay */}
              <div className="relative w-full max-w-[320px]">
                <div className="grid grid-cols-5 gap-2 w-full mb-2 opacity-30">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg border-2 bg-zinc-800 border-zinc-700"
                    />
                  ))}
                </div>
                
                {/* Pending Games Notice - Overlay */}
                {pendingGamesCount > 0 && !dismissedPendingNotice && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-amber-500/20 border border-amber-500/50 rounded-xl p-4 backdrop-blur-sm">
                      <p className="text-sm text-amber-400 text-center font-bold">
                        {pendingGamesCount} pending game(s)
                      </p>
                      <p className="text-xs text-amber-400/70 text-center mt-1">
                        Check history to claim 98% back
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setDismissedPendingNotice(true)}
                          className="flex-1 py-2 rounded-lg bg-zinc-700 text-white text-xs font-bold"
                        >
                          DISMISS
                        </button>
                        <button
                          onClick={() => setShowHistory(true)}
                          className="flex-1 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold"
                        >
                          VIEW
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex-shrink-0">
          {/* Compact Control Bar - show when no playable game */}
          {!hasPlayableGame && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 overflow-hidden">
              <div className="flex items-center gap-2 h-12">
                {/* Mines Button - always on far left */}
                <button
                  onClick={() => {
                    if (expandedPanel === "mines") {
                      setExpandedPanel("none");
                    } else {
                      setExpandedPanel("mines");
                      try { sdk.haptics.selectionChanged(); } catch {}
                    }
                  }}
                  className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center flex-shrink-0"
                >
                  <span className="text-[8px] text-gray-500">MINES</span>
                  <span className="text-sm font-bold text-white">{mineCount}</span>
                </button>

                {/* Middle Section - expands based on state */}
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  {expandedPanel === "mines" ? (
                    // Mines slider expanded
                    <div className="flex-1 flex flex-col justify-center panel-slide">
                      <input
                        type="range"
                        min="1"
                        max="24"
                        value={mineCount}
                        onChange={(e) => {
                          const newValue = parseInt(e.target.value);
                          if (newValue > 1) {
                            setShowBetaPopup(true);
                            setTimeout(() => setShowBetaPopup(false), 2000);
                            try { sdk.haptics.notificationOccurred("warning"); } catch {}
                          }
                        }}
                        className="w-full accent-amber-500"
                        disabled={isProcessing}
                      />
                      <div className="flex justify-between text-[8px] text-gray-500 mt-0.5">
                        <span>1 (Safe)</span>
                        <span>24 (Risky)</span>
                      </div>
                    </div>
                  ) : expandedPanel === "bet" ? (
                    // Bet selector expanded
                    <div className="flex-1 flex flex-col gap-1 panel-slide">
                      <div className="flex gap-1">
                        {["0.25", "0.5", "0.75", "1"].map((val) => (
                          <button
                            key={val}
                            onClick={() => {
                              setBetAmount(val);
                              try { sdk.haptics.selectionChanged(); } catch {}
                            }}
                            className={cn(
                              "flex-1 py-1.5 text-[10px] rounded border transition-colors font-bold",
                              betAmount === val
                                ? "bg-amber-500 text-black border-amber-500"
                                : "bg-zinc-800 text-gray-400 border-zinc-700"
                            )}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={betAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setBetAmount(val);
                          }
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-bold"
                        disabled={isProcessing}
                        placeholder="Custom"
                      />
                    </div>
                  ) : (
                    // Start Game button expanded
                    <button
                      onClick={handleStartGame}
                      disabled={isProcessing || !isConnected || isStartPending || isApprovePending}
                      className="flex-1 h-12 rounded-xl bg-white hover:bg-gray-100 text-black font-bold text-base disabled:opacity-50 flex items-center justify-center overflow-hidden panel-slide"
                    >
                      {isProcessing || isStartPending || isApprovePending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "START GAME"
                      )}
                    </button>
                  )}
                </div>

                {/* Bet Button - always on far right */}
                <button
                  onClick={() => {
                    if (expandedPanel === "bet") {
                      setExpandedPanel("none");
                    } else {
                      setExpandedPanel("bet");
                      try { sdk.haptics.selectionChanged(); } catch {}
                    }
                  }}
                  className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center flex-shrink-0"
                >
                  <span className="text-[8px] text-gray-500">BET</span>
                  <span className="text-sm font-bold text-amber-400">{betAmount}</span>
                </button>
              </div>
            </div>
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
                <p className="text-[10px] text-gray-500 mb-3">Your mines games • Claim expired games here</p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {allActiveGameIds.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p>No active games</p>
                    </div>
                  ) : (
                    allActiveGameIds.map((gameId, index) => {
                      // Check if this is the current game we're playing (have secret for)
                      const isCurrentGame = pendingGame?.gameId === gameId || (pendingGame?.secret && index === 0);
                      
                      return (
                        <div 
                          key={index}
                          className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                              <div>
                                <span className="text-xs text-amber-400 font-bold">
                                  {isCurrentGame ? "Active Game" : "Lost Secret"}
                                </span>
                                <div className="text-[9px] text-gray-500">Game #{gameId.toString()}</div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Always show claim button - user can try to claim */}
                          <div className="mt-2">
                            <p className="text-[9px] text-gray-400 mb-2">
                              {isCurrentGame 
                                ? "You can continue playing this game on the main screen."
                                : "Secret was lost. Claim 98% back after ~8 min expiry."
                              }
                            </p>
                            <button
                              onClick={() => {
                                writeClaimExpired({
                                  address: DONUT_MINES_ADDRESS,
                                  abi: MINES_ABI,
                                  functionName: "claimExpired",
                                  args: [gameId]
                                });
                              }}
                              disabled={isClaimPending}
                              className="w-full py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold disabled:opacity-50"
                            >
                              {isClaimPending ? "Claiming..." : "Claim 98% Back"}
                            </button>
                          </div>
                        </div>
                      );
                    })
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

        {/* Approvals Modal */}
        {showApprovals && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowApprovals(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button
                  onClick={() => setShowApprovals(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Token Approvals
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Approve DONUT tokens to play Mines</p>

                <div className="space-y-3">
                  {/* Current Approval Status */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">🍩 DONUT</span>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full",
                        allowance && allowance > BigInt(0) 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-red-500/20 text-red-400"
                      )}>
                        {allowance ? parseFloat(formatUnits(allowance, 18)).toFixed(2) : "0"} approved
                      </span>
                    </div>
                    
                    {/* Quick Approve Buttons */}
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          writeApprove({
                            address: DONUT_TOKEN_ADDRESS,
                            abi: ERC20_ABI,
                            functionName: "approve",
                            args: [DONUT_MINES_ADDRESS, parseUnits("100", 18)]
                          });
                        }}
                        disabled={isApprovePending}
                        className="flex-1 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
                      >
                        {isApprovePending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Approve 100"}
                      </button>
                      <button
                        onClick={() => {
                          writeApprove({
                            address: DONUT_TOKEN_ADDRESS,
                            abi: ERC20_ABI,
                            functionName: "approve",
                            args: [DONUT_MINES_ADDRESS, BigInt(0)]
                          });
                        }}
                        disabled={isApprovePending}
                        className="py-2 px-3 rounded-lg bg-zinc-800 text-gray-400 text-sm font-bold disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>

                    {/* Custom Amount */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Custom amount"
                        value={customApprovalAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setCustomApprovalAmount(val);
                          }
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-center"
                      />
                      <button
                        onClick={() => {
                          const amount = parseFloat(customApprovalAmount);
                          if (!isNaN(amount) && amount > 0) {
                            writeApprove({
                              address: DONUT_TOKEN_ADDRESS,
                              abi: ERC20_ABI,
                              functionName: "approve",
                              args: [DONUT_MINES_ADDRESS, parseUnits(customApprovalAmount, 18)]
                            });
                            setCustomApprovalAmount("");
                          }
                        }}
                        disabled={isApprovePending || !customApprovalAmount}
                        className="py-1.5 px-3 rounded-lg bg-zinc-700 text-white text-sm font-bold disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex gap-2">
                      <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-amber-400 font-bold mb-1">How approvals work</p>
                        <p className="text-[10px] text-amber-400/70">
                          Each game deducts from your approved amount. When you run out, tap the <span className="font-bold">shield icon</span> during gameplay to approve more.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowApprovals(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Done
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