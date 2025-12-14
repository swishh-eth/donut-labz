"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Volume2, VolumeX, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushSync } from "react-dom";

// Contract addresses
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const DONUT_TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;

// ABIs
const ERC20_ABI = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

const TOWER_V5_ABI = [
  { inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "difficulty", type: "uint8" }], name: "startGame", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }], name: "revealGame", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }, { name: "tileChoice", type: "uint8" }], name: "climbLevel", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }], name: "cashOut", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "gameId", type: "uint256" }], name: "claimExpiredGame", outputs: [], stateMutability: "nonpayable", type: "function" },
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
  { inputs: [{ name: "gameId", type: "uint256" }], name: "getGame", outputs: [{
    type: "tuple",
    components: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "difficulty", type: "uint8" },
      { name: "commitBlock", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "currentLevel", type: "uint8" },
      { name: "trapPositions", type: "uint256" },
      { name: "currentMultiplier", type: "uint256" }
    ]
  }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "difficulty", type: "uint8" }], name: "getMultipliers", outputs: [{ type: "uint256[9]" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "difficulty", type: "uint8" }], name: "getDifficultyConfig", outputs: [{
    type: "tuple",
    components: [
      { name: "tilesPerRow", type: "uint8" },
      { name: "safeTiles", type: "uint8" }
    ]
  }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getRevealableGames", outputs: [{ type: "uint256[]" }], stateMutability: "view", type: "function" },
] as const;

// Game status enum
const GameStatus = {
  None: 0,
  Pending: 1,
  Active: 2,
  Won: 3,
  Lost: 4
};

// Difficulty configurations
const DIFFICULTIES = [
  { name: "Easy", tiles: 4, safe: 3, color: "green" },
  { name: "Medium", tiles: 3, safe: 2, color: "amber" },
  { name: "Hard", tiles: 2, safe: 1, color: "orange" },
  { name: "Expert", tiles: 3, safe: 1, color: "red" },
  { name: "Master", tiles: 4, safe: 1, color: "purple" },
];

// Multiplier tables (in basis points, 10000 = 1x)
const MULTIPLIER_TABLES: Record<number, number[]> = {
  0: [13066, 17422, 23229, 30972, 41296, 55061, 73415, 97887, 130516],
  1: [14848, 22497, 34086, 51645, 78250, 118561, 179638, 272179, 412392],
  2: [19600, 39200, 78400, 156800, 313600, 627200, 1254400, 2508800, 5017600],
  3: [29400, 88200, 264600, 793800, 2381400, 7144200, 21432600, 64297800, 192893400],
  4: [39200, 156800, 627200, 2508800, 10035200, 40140800, 160563200, 642252800, 2569011200],
};

interface OnchainGame {
  player: `0x${string}`;
  token: `0x${string}`;
  betAmount: bigint;
  difficulty: number;
  commitBlock: bigint;
  status: number;
  currentLevel: number;
  trapPositions: bigint;
  currentMultiplier: bigint;
}

export default function DonutTowerPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [difficulty, setDifficulty] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isWaitingForReveal, setIsWaitingForReveal] = useState(false);
  const [isClimbing, setIsClimbing] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasShownApproval, setHasShownApproval] = useState(false);
  const [recentGames, setRecentGames] = useState<OnchainGame[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "difficulty" | "bet">("none");
  
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null);
  const [gameState, setGameState] = useState<OnchainGame | null>(null);
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);

  const { address, isConnected } = useAccount();
  
  // Audio context for sounds
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playClimbSound = useCallback(() => {
    try { sdk.haptics.impactOccurred("light"); } catch {}
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, [isMuted]);

  const playWinSound = useCallback(() => {
    try { sdk.haptics.impactOccurred("heavy"); } catch {}
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const frequencies = [523, 659, 784, 1047];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const startTime = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    } catch {}
  }, [isMuted]);

  const playLoseSound = useCallback(() => {
    try { sdk.haptics.impactOccurred("heavy"); } catch {}
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
    args: address ? [address, DONUT_TOWER_ADDRESS] : undefined,
  });

  // Read active game ID
  const { data: contractActiveGameId, refetch: refetchActiveGame } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_V5_ABI,
    functionName: "getPlayerActiveGame",
    args: address ? [address] : undefined,
  });

  // Read player game IDs for history
  const { data: playerGameIds, refetch: refetchGameIds } = useReadContract({
    address: DONUT_TOWER_ADDRESS,
    abi: TOWER_V5_ABI,
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
          address: DONUT_TOWER_ADDRESS,
          abi: TOWER_V5_ABI,
          functionName: "games",
          args: [contractActiveGameId],
          blockTag: 'latest',
        }) as [string, string, bigint, number, bigint, number, number, bigint, bigint];
        
        const gameData: OnchainGame = {
          player: game[0] as `0x${string}`,
          token: game[1] as `0x${string}`,
          betAmount: game[2],
          difficulty: game[3],
          commitBlock: game[4],
          status: game[5],
          currentLevel: game[6],
          trapPositions: game[7],
          currentMultiplier: game[8],
        };
        
        setActiveGameId(contractActiveGameId);
        setGameState(gameData);
        
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
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_V5_ABI,
            functionName: "games",
            args: [id],
          }) as [string, string, bigint, number, bigint, number, number, bigint, bigint];
          
          games.push({
            player: game[0] as `0x${string}`,
            token: game[1] as `0x${string}`,
            betAmount: game[2],
            difficulty: game[3],
            commitBlock: game[4],
            status: game[5],
            currentLevel: game[6],
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

  // Contract writes
  const { data: startHash, writeContract: writeStartGame, isPending: isStartPending, reset: resetStart, error: startError } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });
  
  const { data: climbHash, writeContract: writeClimb, isPending: isClimbPending, error: climbError } = useWriteContract();
  const { isSuccess: isClimbSuccess } = useWaitForTransactionReceipt({ hash: climbHash });
  
  const { data: cashOutHash, writeContract: writeCashOut, isPending: isCashOutPending, error: cashOutError } = useWriteContract();
  const { isSuccess: isCashOutSuccess } = useWaitForTransactionReceipt({ hash: cashOutHash });

  // Start game handler
  const handleStartGame = () => {
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
    
    try { sdk.haptics.impactOccurred("medium"); } catch {}
    
    writeStartGame({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_V5_ABI,
      functionName: "startGame",
      args: [DONUT_TOKEN_ADDRESS, amountWei, difficulty]
    });
  };

  // Handle start game success
  useEffect(() => {
    if (isStartSuccess && isStartingGame && startHash && publicClient) {
      const getGameIdAndPoll = async () => {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: startHash });
          
          const gameStartedLog = receipt.logs.find(log => 
            log.address.toLowerCase() === DONUT_TOWER_ADDRESS.toLowerCase()
          );
          
          if (gameStartedLog && gameStartedLog.topics[1]) {
            const gameId = BigInt(gameStartedLog.topics[1]);
            console.log("Got game ID from receipt:", gameId.toString());
            
            setActiveGameId(gameId);
            setIsWaitingForReveal(true);
            
            // Poll for reveal
            let attempts = 0;
            const maxAttempts = 15;
            
            const poll = async (): Promise<boolean> => {
              attempts++;
              
              try {
                await fetch('/api/reveal?game=tower');
              } catch {}
              
              await new Promise(r => setTimeout(r, 4000));
              
              try {
                const game = await publicClient.readContract({
                  address: DONUT_TOWER_ADDRESS,
                  abi: TOWER_V5_ABI,
                  functionName: "games",
                  args: [gameId],
                  blockTag: 'latest',
                }) as [string, string, bigint, number, bigint, number, number, bigint, bigint];
                
                if (game[5] === GameStatus.Active) {
                  setGameState({
                    player: game[0] as `0x${string}`,
                    token: game[1] as `0x${string}`,
                    betAmount: game[2],
                    difficulty: game[3],
                    commitBlock: game[4],
                    status: game[5],
                    currentLevel: game[6],
                    trapPositions: game[7],
                    currentMultiplier: game[8],
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
          }
        } catch (e) {
          console.error("Error getting receipt:", e);
          setErrorMessage("Error starting game");
          setIsStartingGame(false);
          setIsWaitingForReveal(false);
        }
      };
      
      getGameIdAndPoll();
    }
  }, [isStartSuccess, isStartingGame, startHash, publicClient]);

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

  // Handle tile click (climb)
  const handleTileClick = (tileIndex: number) => {
    if (!activeGameId || !gameState) return;
    if (gameState.status !== GameStatus.Active) return;
    if (isClimbing || isClimbPending) return;
    
    setIsClimbing(true);
    
    try { sdk.haptics.impactOccurred("light"); } catch {}
    
    writeClimb({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_V5_ABI,
      functionName: "climbLevel",
      args: [activeGameId, tileIndex]
    });
  };

  // Handle climb success
  useEffect(() => {
    if (isClimbSuccess && isClimbing && activeGameId && publicClient) {
      const refreshGame = async () => {
        await new Promise(r => setTimeout(r, 500));
        
        try {
          const game = await publicClient.readContract({
            address: DONUT_TOWER_ADDRESS,
            abi: TOWER_V5_ABI,
            functionName: "games",
            args: [activeGameId],
            blockTag: 'latest',
          }) as [string, string, bigint, number, bigint, number, number, bigint, bigint];
          
          const newGameState: OnchainGame = {
            player: game[0] as `0x${string}`,
            token: game[1] as `0x${string}`,
            betAmount: game[2],
            difficulty: game[3],
            commitBlock: game[4],
            status: game[5],
            currentLevel: game[6],
            trapPositions: game[7],
            currentMultiplier: game[8],
          };
          
          setGameState(newGameState);
          setIsClimbing(false);
          
          if (newGameState.status === GameStatus.Lost) {
            playLoseSound();
            setGameResult("lost");
            setTimeout(() => {
              setActiveGameId(null);
              setGameState(null);
              setGameResult(null);
              refetchActiveGame();
              refetchBalance();
            }, 4000);
          } else if (newGameState.status === GameStatus.Won) {
            playWinSound();
            setGameResult("won");
            flushSync(() => setShowConfetti(true));
            setTimeout(() => {
              setShowConfetti(false);
              setActiveGameId(null);
              setGameState(null);
              setGameResult(null);
              refetchActiveGame();
              refetchBalance();
              refetchGameIds();
            }, 4000);
          } else {
            playClimbSound();
          }
        } catch (e) {
          console.error("Error refreshing game:", e);
          setIsClimbing(false);
        }
      };
      
      refreshGame();
    }
  }, [isClimbSuccess, isClimbing, activeGameId, publicClient, playClimbSound, playLoseSound, playWinSound, refetchActiveGame, refetchBalance, refetchGameIds]);

  // Handle climb error
  useEffect(() => {
    if (climbError && isClimbing) {
      setIsClimbing(false);
      setErrorMessage("Failed to climb");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [climbError, isClimbing]);

  // Handle cash out
  const handleCashOut = () => {
    if (!activeGameId || !gameState) return;
    if (gameState.status !== GameStatus.Active) return;
    if (gameState.currentLevel === 0) return;
    if (isCashingOut || isCashOutPending) return;
    
    setIsCashingOut(true);
    
    try { sdk.haptics.impactOccurred("medium"); } catch {}
    
    writeCashOut({
      address: DONUT_TOWER_ADDRESS,
      abi: TOWER_V5_ABI,
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
      
      setTimeout(() => {
        setShowConfetti(false);
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
  const diffConfig = DIFFICULTIES[difficulty];
  const multipliers = MULTIPLIER_TABLES[difficulty];
  
  const currentMultiplier = gameState && gameState.currentLevel > 0
    ? Number(gameState.currentMultiplier) / 10000
    : 1;
  const nextMultiplier = gameState && gameState.currentLevel < 9
    ? multipliers[gameState.currentLevel] / 10000
    : 0;
  const currentPayout = gameState && gameState.currentLevel > 0
    ? parseFloat(formatUnits(gameState.betAmount, 18)) * currentMultiplier
    : 0;

  // Get trap tile for a level (only visible after game ends)
  const getTrapTile = (level: number): number => {
    if (!gameState) return -1;
    return Number((gameState.trapPositions >> BigInt(level * 4)) & BigInt(0xF));
  };

  // Render tower
  const renderTower = () => {
    const rows = [];
    const isInGame = !!gameState && gameState.status === GameStatus.Active;
    const gameEnded = gameState && (gameState.status === GameStatus.Lost || gameState.status === GameStatus.Won);
    const config = gameState ? DIFFICULTIES[gameState.difficulty] : DIFFICULTIES[difficulty];
    
    for (let level = 8; level >= 0; level--) {
      const tiles = [];
      const tilesCount = config.tiles;
      const isCurrentLevel = gameState ? gameState.currentLevel === level : false;
      const isPastLevel = gameState ? gameState.currentLevel > level : false;
      const isFutureLevel = gameState ? gameState.currentLevel < level : true;
      const trapTile = getTrapTile(level);
      
      for (let tile = 0; tile < tilesCount; tile++) {
        const isSafe = config.safe > 1 ? tile !== trapTile : tile === trapTile;
        const showResult = gameEnded || isPastLevel;
        const isClickable = isInGame && isCurrentLevel && !isClimbing;
        
        let tileStyle = "";
        let content = null;
        
        if (showResult) {
          if (isSafe) {
            tileStyle = "bg-white/10 border-white";
            content = <span className="text-lg">🍩</span>;
          } else {
            tileStyle = "bg-red-500/20 border-red-500";
            content = <span className="text-lg">💀</span>;
          }
        } else if (isCurrentLevel) {
          tileStyle = "bg-amber-500/20 border-amber-500 hover:bg-amber-500/40 cursor-pointer active:scale-95";
          content = <span className="text-zinc-400">?</span>;
        } else if (isFutureLevel) {
          tileStyle = "bg-zinc-900 border-zinc-700 opacity-40";
          content = <span className="text-zinc-600">?</span>;
        }
        
        tiles.push(
          <button
            key={tile}
            onClick={() => isClickable && handleTileClick(tile)}
            disabled={!isClickable}
            className={cn(
              "w-12 h-12 rounded-lg border-2 flex items-center justify-center font-bold transition-all",
              tileStyle
            )}
          >
            {isClimbing && isCurrentLevel ? (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            ) : content}
          </button>
        );
      }
      
      // Level multiplier
      const levelMult = multipliers[level] / 10000;
      const isLevelReached = gameState && gameState.currentLevel > level;
      
      rows.push(
        <div key={level} className="flex items-center gap-2 justify-center">
          <span className={cn(
            "text-xs w-16 text-right font-mono",
            isLevelReached ? "text-green-400" : isCurrentLevel ? "text-amber-400" : "text-zinc-600"
          )}>
            {levelMult.toFixed(2)}x
          </span>
          <div className="flex gap-1">
            {tiles}
          </div>
          <span className={cn(
            "text-xs w-8 font-mono",
            isLevelReached ? "text-green-400" : isCurrentLevel ? "text-amber-400" : "text-zinc-600"
          )}>
            L{level + 1}
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
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${(i * 17) % 100}%`,
                animationDelay: `${(i * 0.05)}s`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col w-full max-w-md h-full">
        {/* Header */}
        <div className="flex-none px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Donut Tower</h1>
              <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-lg">🍩</div>
          </div>

          {/* Token selector */}
          <div className="flex gap-2 mb-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 text-black font-bold text-sm">
              <span>🍩</span> DONUT
            </button>
            <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 text-gray-500 font-bold text-sm opacity-50">
              ✨ SPRINKLES <span className="text-[8px]">SOON</span>
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
              <div className="text-[9px] text-gray-500 uppercase">Balance</div>
              <div className="text-sm font-bold flex items-center justify-center gap-1">
                <span>🍩</span>{balance.toFixed(0)}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
              <div className="text-[9px] text-gray-500 uppercase">Level</div>
              <div className={cn("text-sm font-bold", gameState ? "text-amber-400" : "text-white")}>
                {gameState ? `${gameState.currentLevel}/9` : "0/9"}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
              <div className="text-[9px] text-gray-500 uppercase">Multiplier</div>
              <div className={cn("text-sm font-bold", currentMultiplier > 1 ? "text-green-400" : "text-white")}>
                {currentMultiplier.toFixed(2)}x
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              {isMuted ? <VolumeX className="w-4 h-4 text-gray-500" /> : <Volume2 className="w-4 h-4" />}
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
        </div>

        {/* Tower area */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-4">
          {isWaitingForReveal ? (
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Building tower...</p>
            </div>
          ) : gameResult === "lost" ? (
            <div className="w-full">
              <div className="text-center mb-4">
                <p className="text-red-400 font-bold text-lg">💀 You fell!</p>
                <p className="text-sm text-gray-500">Lost {gameState ? formatUnits(gameState.betAmount, 18) : "0"} 🍩</p>
              </div>
              <div className="space-y-1">
                {renderTower()}
              </div>
            </div>
          ) : gameResult === "won" ? (
            <div className="w-full">
              <div className="text-center mb-4">
                <p className="text-green-400 font-bold text-lg">🎉 Cashed out!</p>
                <p className="text-sm text-gray-400">Won {currentPayout.toFixed(2)} 🍩</p>
              </div>
              <div className="space-y-1">
                {renderTower()}
              </div>
            </div>
          ) : gameState ? (
            <div className="w-full space-y-1">
              {renderTower()}
            </div>
          ) : (
            <div className="w-full space-y-1 opacity-50">
              {renderTower()}
            </div>
          )}

          {/* Current payout info */}
          {gameState && gameState.status === GameStatus.Active && gameState.currentLevel > 0 && (
            <div className="mt-4 text-center">
              <div className="text-[10px] text-gray-500">Current Payout</div>
              <div className="text-lg font-bold text-green-400">+{currentPayout.toFixed(2)} 🍩</div>
              <div className="text-[10px] text-gray-500">Next: {nextMultiplier.toFixed(2)}x</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-none px-4 pb-2 space-y-2">
          {/* Error message */}
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-center text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Game controls or setup */}
          {gameState && gameState.status === GameStatus.Active ? (
            <button
              onClick={handleCashOut}
              disabled={gameState.currentLevel === 0 || isCashingOut || isCashOutPending}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                gameState.currentLevel === 0 
                  ? "bg-zinc-700 text-zinc-500"
                  : "bg-green-500 text-black hover:bg-green-400"
              )}
            >
              {isCashingOut || isCashOutPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cashing out...
                </span>
              ) : gameState.currentLevel === 0 ? (
                "Pick a tile to start"
              ) : (
                `CASH OUT ${currentPayout.toFixed(2)} 🍩`
              )}
            </button>
          ) : !isStartingGame && !isWaitingForReveal ? (
            <>
              {/* Compact controls */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                <div className="flex items-center gap-2">
                  {/* Difficulty selector */}
                  {expandedPanel === "difficulty" ? (
                    <div className="flex-1 flex flex-wrap gap-1">
                      {DIFFICULTIES.map((d, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setDifficulty(i);
                            try { sdk.haptics.impactOccurred("light"); } catch {}
                          }}
                          className={cn(
                            "flex-1 py-1.5 text-[9px] rounded font-bold border min-w-[50px]",
                            difficulty === i
                              ? `bg-${d.color}-500 text-black border-${d.color}-500`
                              : "bg-zinc-800 text-gray-400 border-zinc-700"
                          )}
                          style={{
                            backgroundColor: difficulty === i ? (d.color === "green" ? "#22c55e" : d.color === "amber" ? "#f59e0b" : d.color === "orange" ? "#f97316" : d.color === "red" ? "#ef4444" : "#a855f7") : undefined,
                            borderColor: difficulty === i ? (d.color === "green" ? "#22c55e" : d.color === "amber" ? "#f59e0b" : d.color === "orange" ? "#f97316" : d.color === "red" ? "#ef4444" : "#a855f7") : undefined,
                          }}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setExpandedPanel("difficulty");
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      className="w-16 h-12 rounded-lg flex flex-col items-center justify-center border"
                      style={{
                        backgroundColor: `${diffConfig.color === "green" ? "#22c55e" : diffConfig.color === "amber" ? "#f59e0b" : diffConfig.color === "orange" ? "#f97316" : diffConfig.color === "red" ? "#ef4444" : "#a855f7"}20`,
                        borderColor: `${diffConfig.color === "green" ? "#22c55e" : diffConfig.color === "amber" ? "#f59e0b" : diffConfig.color === "orange" ? "#f97316" : diffConfig.color === "red" ? "#ef4444" : "#a855f7"}50`,
                      }}
                    >
                      <span className="text-[8px] text-gray-400">RISK</span>
                      <span className="text-[10px] font-bold" style={{ color: diffConfig.color === "green" ? "#22c55e" : diffConfig.color === "amber" ? "#f59e0b" : diffConfig.color === "orange" ? "#f97316" : diffConfig.color === "red" ? "#ef4444" : "#a855f7" }}>
                        {diffConfig.name.toUpperCase()}
                      </span>
                    </button>
                  )}

                  {/* Bet amount */}
                  {expandedPanel === "bet" ? (
                    <div className="flex-1 flex items-center gap-1">
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex gap-1">
                          {["0.5", "1", "2", "5"].map((val) => (
                            <button
                              key={val}
                              onClick={() => {
                                setBetAmount(val);
                                try { sdk.haptics.impactOccurred("light"); } catch {}
                              }}
                              className={cn(
                                "flex-1 py-1.5 text-[10px] rounded border font-bold",
                                betAmount === val ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-800 text-gray-400 border-zinc-700"
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
                          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBetAmount(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-bold"
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setExpandedPanel("bet");
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      className="flex-1 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center gap-2"
                    >
                      <span className="text-[10px] text-gray-500">BET</span>
                      <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                      <span className="text-[10px] text-gray-500">🍩</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={handleStartGame}
                disabled={!isConnected || parseFloat(betAmount || "0") <= 0}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-lg transition-all",
                  "bg-white text-black hover:bg-gray-100"
                )}
              >
                START CLIMB
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" />
              <p className="text-sm text-gray-500 mt-2">
                {isStartingGame && !isWaitingForReveal ? "Confirm in wallet..." : "Setting up tower..."}
              </p>
            </div>
          )}

          {/* Info text */}
          {!gameState && (
            <div className="text-center text-[10px] text-gray-500">
              {diffConfig.name} • {diffConfig.safe}/{diffConfig.tiles} safe • Max {(multipliers[8] / 10000).toFixed(2)}x
            </div>
          )}
        </div>

        <NavBar />
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90" onClick={() => setShowHelp(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 p-1.5 text-gray-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
              
              <h2 className="text-base font-bold mb-3">🗼 How to Play</h2>
              
              <div className="space-y-2 text-sm">
                <p className="text-gray-400">Climb the tower by picking safe tiles!</p>
                
                <div className="bg-zinc-900 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Easy</span>
                    <span className="text-green-400">3/4 safe (75%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Medium</span>
                    <span className="text-amber-400">2/3 safe (66%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Hard</span>
                    <span className="text-orange-400">1/2 safe (50%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Expert</span>
                    <span className="text-red-400">1/3 safe (33%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Master</span>
                    <span className="text-purple-400">1/4 safe (25%)</span>
                  </div>
                </div>
                
                <p className="text-gray-400">Cash out anytime or climb all 9 levels for max payout!</p>
                <p className="text-[10px] text-gray-500">2% house edge • 98% RTP</p>
              </div>
              
              <button onClick={() => setShowHelp(false)} className="mt-4 w-full py-2 rounded-xl bg-white text-black font-bold">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90" onClick={() => setShowHistory(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[80vh] overflow-y-auto">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 p-1.5 text-gray-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
              
              <h2 className="text-base font-bold mb-3">📜 Game History</h2>
              
              {recentGames.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No games yet</p>
              ) : (
                <div className="space-y-2">
                  {recentGames.map((game, i) => (
                    <div key={i} className={cn(
                      "p-3 rounded-lg border",
                      game.status === GameStatus.Won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                    )}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold">
                          {game.status === GameStatus.Won ? "🎉 Won" : "💀 Lost"}
                        </span>
                        <span className={cn("text-sm font-bold", game.status === GameStatus.Won ? "text-green-400" : "text-red-400")}>
                          {game.status === GameStatus.Won 
                            ? `+${(parseFloat(formatUnits(game.betAmount, 18)) * Number(game.currentMultiplier) / 10000).toFixed(2)}`
                            : `-${parseFloat(formatUnits(game.betAmount, 18)).toFixed(2)}`
                          } 🍩
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        {DIFFICULTIES[game.difficulty].name} • Level {game.currentLevel}/9 • {(Number(game.currentMultiplier) / 10000).toFixed(2)}x
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 rounded-xl bg-zinc-800 text-white font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approvals Modal */}
      {showApprovals && (
        <ApprovalsModal 
          onClose={() => setShowApprovals(false)} 
          tokenAddress={DONUT_TOKEN_ADDRESS}
          spenderAddress={DONUT_TOWER_ADDRESS}
          onSuccess={() => {
            refetchAllowance();
            setShowApprovals(false);
          }}
        />
      )}
    </main>
  );
}

// Approvals Modal Component
function ApprovalsModal({ 
  onClose, 
  tokenAddress, 
  spenderAddress,
  onSuccess 
}: { 
  onClose: () => void;
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  onSuccess: () => void;
}) {
  const { address } = useAccount();
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, spenderAddress] : undefined,
  });
  
  const { writeContract, isPending, isSuccess, reset } = useWriteContract();
  
  const isApproved = allowance && allowance > BigInt(0);
  
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        refetchLocal();
        onSuccess();
        reset();
      }, 1000);
    }
  }, [isSuccess, refetchLocal, onSuccess, reset]);
  
  const handleApprove = () => {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spenderAddress, parseUnits("1000000", 18)]
    });
  };
  
  const handleRevoke = () => {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spenderAddress, BigInt(0)]
    });
  };
  
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <button onClick={onClose} className="absolute right-3 top-3 p-1.5 text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          
          <h2 className="text-base font-bold mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Token Approvals
          </h2>
          
          <div className="bg-zinc-900 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">🍩 DONUT</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", isApproved ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                {isApproved ? "Approved" : "Not Approved"}
              </span>
            </div>
            
            <div className="flex gap-2">
              {!isApproved && (
                <button
                  onClick={handleApprove}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-green-500 text-black text-xs font-bold hover:bg-green-400 disabled:opacity-50"
                >
                  {isPending ? "..." : "Approve"}
                </button>
              )}
              {isApproved && (
                <button
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 disabled:opacity-50"
                >
                  {isPending ? "..." : "Revoke"}
                </button>
              )}
            </div>
          </div>
          
          <button onClick={onClose} className="mt-3 w-full py-2 rounded-xl bg-white text-black font-bold text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}