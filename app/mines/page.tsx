"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Bomb, History, HelpCircle, X, Loader2, Shield } from "lucide-react";
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

// Local storage keys
const GAME_SECRETS_KEY = "donut-mines-secrets";
const DISMISSED_GAMES_KEY = "donut-mines-dismissed";

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

// Dismissed games helpers (Fix #4 - persist dismissed state)
const getDismissedGames = (): Set<string> => {
  try {
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_GAMES_KEY) || "[]");
    return new Set(dismissed);
  } catch {
    return new Set();
  }
};

const addDismissedGame = (gameId: string) => {
  try {
    const dismissed = getDismissedGames();
    dismissed.add(gameId);
    localStorage.setItem(DISMISSED_GAMES_KEY, JSON.stringify([...dismissed]));
  } catch {}
};

const clearOldDismissedGames = (activeGameIds: string[]) => {
  try {
    const dismissed = getDismissedGames();
    const activeSet = new Set(activeGameIds);
    // Only keep dismissed games that are still active (cleanup old ones)
    const filtered = [...dismissed].filter(id => activeSet.has(id));
    localStorage.setItem(DISMISSED_GAMES_KEY, JSON.stringify(filtered));
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
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [mineCount] = useState<number>(1); // Fix #2: Remove setter, hardcode to 1 for beta
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [dismissedGameIds, setDismissedGameIds] = useState<Set<string>>(new Set()); // Fix #4: Use Set for multiple dismissed games
  const [dismissedPendingNotice, setDismissedPendingNotice] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "bet">("none"); // Fix #2: Remove "mines" option
  const [customApprovalAmount, setCustomApprovalAmount] = useState<string>("");
  const [pendingGame, setPendingGame] = useState<PendingGame | null>(null);
  const [gameStep, setGameStep] = useState<"idle" | "approving" | "starting" | "playing" | "revealing" | "cashing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiData, setConfettiData] = useState<Array<{left: number, size: number, delay: number, duration: number}>>([]);
  const [pendingTileIndex, setPendingTileIndex] = useState<number | null>(null);
  const [localRevealedTiles, setLocalRevealedTiles] = useState<number>(0);
  const [isStartingNewGame, setIsStartingNewGame] = useState(false); // Track when we're starting a fresh game

  // Load dismissed games from localStorage on mount (Fix #4)
  useEffect(() => {
    setDismissedGameIds(getDismissedGames());
  }, []);

  // Track if user has seen the approval modal
  const [hasSeenApprovalModal, setHasSeenApprovalModal] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('donut-mines-seen-approval') === 'true';
  });

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

  // Auto-show approvals modal if user has no allowance set AND hasn't seen it before
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals && !hasSeenApprovalModal) {
      const timer = setTimeout(() => {
        setShowApprovals(true);
        setHasSeenApprovalModal(true);
        localStorage.setItem('donut-mines-seen-approval', 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals, hasSeenApprovalModal]);

  // Read active games
  const { data: activeGameIds, refetch: refetchActiveGames } = useReadContract({
    address: DONUT_MINES_ADDRESS,
    abi: MINES_ABI,
    functionName: "getActiveGames",
    args: address ? [address] : undefined,
  });

  // Find the current playable game (one we have the secret for)
  const allActiveGameIds = (activeGameIds as bigint[]) || [];
  
  // Cleanup old dismissed games when active games change (Fix #4)
  useEffect(() => {
    if (allActiveGameIds.length > 0) {
      clearOldDismissedGames(allActiveGameIds.map(id => id.toString()));
    }
  }, [allActiveGameIds]);
  
  // Get the game we're currently playing (have secret for)
  const currentGameId = pendingGame?.gameId || (allActiveGameIds.length > 0 ? allActiveGameIds[0] : undefined);

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
      setPendingTileIndex(null);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [approveError, startError, revealError, cashOutError, claimExpiredError]);

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      resetApprove();
      refetchAllowance();
      try { sdk.haptics.notificationOccurred("success"); } catch {}
    }
  }, [isApproveSuccess, resetApprove, refetchAllowance]);

  // Handle start game success
  useEffect(() => {
    if (isStartSuccess && gameStep === "starting") {
      resetStart();
      
      const doRefetch = async () => {
        await refetchActiveGames();
        await refetchGameData();
        setIsStartingNewGame(false); // Game is ready, show the grid
        setGameStep("playing");
        try { sdk.haptics.impactOccurred("medium"); } catch {}
      };
      
      doRefetch();
      setTimeout(() => refetchActiveGames(), 500);
      setTimeout(() => refetchActiveGames(), 1500);
    }
  }, [isStartSuccess, gameStep, resetStart, refetchActiveGames, refetchGameData]);

  // When active game is detected with secret, set gameStep to playing
  useEffect(() => {
    if (currentGameId && gameStep === "idle") {
      const secret = getSecretForGame();
      if (secret) {
        setGameStep("playing");
      }
    }
  }, [currentGameId, gameStep]);

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
  }, [isClaimExpiredSuccess, refetchBalance, refetchActiveGames]);

  // Handle reveal success
  useEffect(() => {
    if (isRevealSuccess && gameStep === "revealing") {
      if (pendingTileIndex !== null) {
        setLocalRevealedTiles(prev => prev | (1 << pendingTileIndex));
      }
      
      setPendingTileIndex(null);
      setGameStep("playing");
      
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
      try {
        sdk.haptics.impactOccurred("medium");
      } catch {}
      
      resetReveal();
      
      refetchGameData();
      setTimeout(() => refetchGameData(), 300);
      setTimeout(() => refetchGameData(), 800);
      setTimeout(() => {
        refetchGameData().then((result) => {
          const gameData = result.data as OnchainGame | undefined;
          if (gameData && gameData[6] === 3) {
            try { sdk.haptics.impactOccurred("heavy"); } catch {}
          }
        });
      }, 1500);
    }
  }, [isRevealSuccess, gameStep, pendingTileIndex, resetReveal, refetchGameData]);

  // Handle cash out success
  useEffect(() => {
    if (isCashOutSuccess && gameStep === "cashing") {
      // Fix #4: Persist dismissed game to localStorage
      if (currentGameId) {
        const gameIdStr = currentGameId.toString();
        addDismissedGame(gameIdStr);
        setDismissedGameIds(prev => new Set([...prev, gameIdStr]));
      }
      setGameStep("idle");
      setPendingGame(null);
      setShowConfetti(true);
      refetchBalance();
      refetchActiveGames();
      resetCashOut();
      
      try {
        sdk.haptics.impactOccurred("heavy");
        setTimeout(() => sdk.haptics.impactOccurred("medium"), 100);
        setTimeout(() => sdk.haptics.impactOccurred("light"), 200);
      } catch {}
      
      setTimeout(() => setShowConfetti(false), 5000);
    }
  }, [isCashOutSuccess, gameStep, currentGameId, refetchBalance, refetchActiveGames, resetCashOut]);

  const startNewGame = async () => {
    if (!address) return;
    
    const betNum = parseFloat(betAmount);
    if (isNaN(betNum) || betNum <= 0 || betNum > 1) {
      setErrorMessage("Invalid bet amount");
      setGameStep("idle");
      return;
    }
    
    // Clear all game state IMMEDIATELY so old game doesn't show
    setIsStartingNewGame(true);
    setDismissedGameIds(new Set());
    setDismissedPendingNotice(false);
    setLocalRevealedTiles(0);
    
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
    if (gameStep === "starting" || gameStep === "approving" || isStartPending || isApprovePending) return;
    if (pendingGame !== null) return;
    
    const betNum = parseFloat(betAmount);
    if (isNaN(betNum) || betNum < 0.1 || betNum > 1) {
      setErrorMessage("Bet must be between 0.1 and 1 DONUT");
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    
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
    
    let secret: `0x${string}` | null = pendingGame?.secret || null;
    
    if (!secret && activeGameCore) {
      const coreData = activeGameCore as [`0x${string}`, `0x${string}`, bigint, bigint, `0x${string}`, `0x${string}`];
      const commitHash = coreData[4];
      secret = getGameSecret(commitHash);
    }
    
    if (!secret) {
      setErrorMessage("Secret not found - check history to claim");
      return;
    }
    
    setPendingTileIndex(tileIndex);
    setGameStep("revealing");
    
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
  const isGameActive = game ? game[6] === 1 : false;
  const isGameOver = game ? (game[6] === 3 || game[6] === 4) : false;
  // Fix #4: Check dismissed games from persistent Set
  const isGameDismissed = currentGameId !== undefined && dismissedGameIds.has(currentGameId.toString());
  // Don't show old game grid when starting a new game
  const hasPlayableGame = !isStartingNewGame && !isGameDismissed && ((hasSecretForGame && isGameActive) || (isGameOver && gameStep === "playing"));
  const revealedTiles = game ? Number(game[7]) : 0;
  const safeRevealed = game ? Number(game[5]) : 0;
  const gameMineCount = game ? Number(game[4]) : mineCount;
  const minePositions = game ? BigInt(game[8]) : BigInt(0);
  const gameBetAmount = game ? game[2] : BigInt(0);
  
  const localSafeCount = (() => {
    let count = 0;
    for (let i = 0; i < 25; i++) {
      if ((localRevealedTiles & (1 << i)) !== 0) {
        count++;
      }
    }
    return count;
  })();
  
  const displaySafeRevealed = Math.max(safeRevealed, localSafeCount);
  const displayMultiplier = calculateDisplayMultiplier(gameMineCount, displaySafeRevealed);
  const actualPayoutMultiplier = calculateDisplayMultiplier(gameMineCount, safeRevealed);
  
  // Fix #3: Calculate and display next tile multiplier in UI
  const nextTileMultiplier = calculateDisplayMultiplier(gameMineCount, displaySafeRevealed + 1);
  const potentialWinNext = (parseFloat(formatUnits(gameBetAmount, 18)) * nextTileMultiplier).toFixed(4);
  
  useEffect(() => {
    if (revealedTiles > localRevealedTiles) {
      setLocalRevealedTiles(revealedTiles);
    }
  }, [revealedTiles, localRevealedTiles]);
  
  const pendingGamesCount = allActiveGameIds.filter(id => {
    if (currentGameId !== undefined && id === currentGameId && hasSecretForGame) return false;
    return true;
  }).length;

  const formattedBalance = tokenBalance 
    ? parseFloat(formatUnits(tokenBalance, 18)).toFixed(2)
    : "0.00";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
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
        .confetti { animation: confetti-fall linear forwards; }
        .toast-animate { animation: toast-in 0.2s ease-out forwards; }
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
                  const combinedRevealedTiles = revealedTiles | localRevealedTiles;
                  const isRevealed = (combinedRevealedTiles & (1 << i)) !== 0;
                  const isMine = isRevealed && game !== undefined && game[6] === 3 && (Number(minePositions) & (1 << i)) !== 0;
                  const isGameOverState = game !== undefined && (game[6] === 3 || game[6] === 4);
                  
                  return (
                    <Tile
                      key={i}
                      index={i}
                      isRevealed={isRevealed}
                      isMine={isMine}
                      isGameOver={isGameOverState}
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
                  {/* Fix #3: Show next tile potential win */}
                  <div className="text-center mb-2">
                    {safeRevealed > 0 ? (
                      <>
                        <div className="text-xs text-gray-400">Current Payout</div>
                        <div className="text-xl font-bold text-green-400">
                          🍩 {(parseFloat(formatUnits(gameBetAmount, 18)) * actualPayoutMultiplier).toFixed(4)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          Next tile: {nextTileMultiplier.toFixed(2)}x → 🍩{potentialWinNext}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-gray-400">Click a tile to start</div>
                        <div className="text-sm text-gray-500 mt-1">
                          First reveal: {nextTileMultiplier.toFixed(2)}x → 🍩{potentialWinNext}
                        </div>
                      </>
                    )}
                  </div>
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
                      `CASH OUT ${actualPayoutMultiplier.toFixed(2)}x`
                    )}
                  </button>
                </div>
              ) : game && (game[6] === 3 || game[6] === 4) ? (
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
                        : `Won ${parseFloat(formatUnits(game[9], 18)).toFixed(4)} DONUT`
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Fix #4: Persist dismissed game
                      if (currentGameId) {
                        const gameIdStr = currentGameId.toString();
                        addDismissedGame(gameIdStr);
                        setDismissedGameIds(prev => new Set([...prev, gameIdStr]));
                      }
                      setPendingGame(null);
                      setGameStep("idle");
                      setLocalRevealedTiles(0);
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
              <div className="relative w-full max-w-[320px]">
                <div className="grid grid-cols-5 gap-2 w-full mb-2 opacity-30">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg border-2 bg-zinc-800 border-zinc-700"
                    />
                  ))}
                </div>
                
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

        {/* Bottom Controls - Fix #2: Simplified without mines selector */}
        <div className="flex-shrink-0">
          {!hasPlayableGame && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 overflow-hidden">
              <div className="flex items-center gap-2 h-12">
                {/* Fix #2: Static mines display instead of selector */}
                <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[8px] text-gray-500">MINES</span>
                  <span className="text-sm font-bold text-white">1</span>
                </div>

                {/* Middle Section */}
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  {expandedPanel === "bet" ? (
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

                {/* Bet Button */}
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
                      <div className="font-semibold text-amber-400 text-xs">Set Your Bet</div>
                      <div className="text-[11px] text-gray-400">Choose your bet amount (0.1-1 DONUT). Currently 1 mine per game in beta.</div>
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