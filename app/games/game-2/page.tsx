"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Trophy, Play, Zap, Share2, X, HelpCircle, Volume2, VolumeX, ChevronRight, Clock, Layers, Palette, Lock, Crown, Sparkles, Check } from "lucide-react";

// Free Arcade Contract (gas-only, no token payment) - Glaze Stack specific
const FREE_ARCADE_CONTRACT = "0xca9f8dce3be5ee0e1d0eb327be8143e2f688fc91" as const;

const FREE_ARCADE_ABI = [
  {
    inputs: [{ name: "gameId", type: "string" }],
    name: "play",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2;
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;

const BLOCK_HEIGHT = 24;
const INITIAL_BLOCK_WIDTH = 160;
const BASE_SPEED = 2.5;
const SPEED_INCREMENT = 0.12;
const MAX_SPEED = 7;
const PERFECT_THRESHOLD = 5;

// Weekly USDC prize pool (fetched from API)
interface PrizeInfo {
  totalPrize: number;
  prizeStructure: { rank: number; percent: number; amount: string }[];
}

// Prize percentages (same as Donut Dash)
const PRIZE_PERCENTAGES = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];

function calculatePrizeStructure(totalPrize: number) {
  return PRIZE_PERCENTAGES.map((percent, i) => ({
    rank: i + 1,
    percent,
    amount: ((totalPrize * percent) / 100).toFixed(2),
  }));
}

const DEFAULT_PRIZE_INFO: PrizeInfo = {
  totalPrize: 5,
  prizeStructure: calculatePrizeStructure(5),
};

// Skin type definition
type SkinTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultimate' | 'default';

interface GameSkin {
  id: string;
  name: string;
  frostingColor: string;
  tier: SkinTier;
  animated?: boolean;
  animationType?: 'rainbow' | 'glow' | 'pulse' | 'sparkle' | 'electric' | 'fire';
  requirement?: {
    type: string;
    value: number;
    description: string;
  };
}

const DEFAULT_SKIN: GameSkin = {
  id: 'default',
  name: 'Classic Pink',
  frostingColor: '#F472B6',
  tier: 'default',
};

const STACK_SKINS: GameSkin[] = [
  DEFAULT_SKIN,
  {
    id: 'stack-bronze',
    name: 'Stack Starter',
    frostingColor: '#FF6B6B',
    tier: 'common',
    requirement: { type: 'games_played', value: 25, description: 'Play 25 games' },
  },
  {
    id: 'stack-silver',
    name: 'Tower Builder',
    frostingColor: '#4ECDC4',
    tier: 'rare',
    requirement: { type: 'games_played', value: 50, description: 'Play 50 games' },
  },
  {
    id: 'stack-epic',
    name: 'Sky Stacker',
    frostingColor: '#8B5CF6',
    tier: 'epic',
    animated: true,
    animationType: 'pulse',
    requirement: { type: 'games_played', value: 100, description: 'Play 100 games' },
  },
  {
    id: 'stack-gold',
    name: 'Glaze Architect',
    frostingColor: '#9D4EDD',
    tier: 'legendary',
    animated: true,
    animationType: 'rainbow',
    requirement: { type: 'high_score', value: 100, description: 'Score 100+ in one game' },
  },
  {
    id: 'stack-mythic',
    name: 'Tower Titan',
    frostingColor: '#14B8A6',
    tier: 'mythic',
    animated: true,
    animationType: 'electric',
    requirement: { type: 'games_played', value: 250, description: 'Play 250 games' },
  },
  {
    id: 'stack-ultimate',
    name: 'Stack God',
    frostingColor: '#F59E0B',
    tier: 'ultimate',
    animated: true,
    animationType: 'fire',
    requirement: { type: 'games_played', value: 500, description: 'Play 500 games' },
  },
];

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; fid?: number; username: string; displayName?: string; pfpUrl?: string; score: number; walletAddress?: string };
type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

const getBlockColor = (index: number): string => {
  const colors = [
    '#FFE4EC', '#FFDEE8', '#FFD8E4', '#FFD2E0', '#FFCCDC',
    '#FFC6D8', '#FFC0D4', '#FFE4EC', '#FFDEE8', '#FFD8E4',
  ];
  return colors[index % colors.length];
};

function getTimeUntilReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  const nextReset = new Date(utcNow);
  const currentDay = utcNow.getUTCDay();
  const currentHour = utcNow.getUTCHours();
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0 && currentHour >= 23) daysUntilFriday = 7;
  nextReset.setUTCDate(utcNow.getUTCDate() + daysUntilFriday);
  nextReset.setUTCHours(23, 0, 0, 0);
  const diff = nextReset.getTime() - utcNow.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
};

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

type Block = {
  x: number;
  y: number;
  width: number;
  color: string;
  settled: boolean;
  landTime?: number;
};

type FallingPiece = {
  x: number;
  y: number;
  width: number;
  color: string;
  velocityY: number;
  velocityX: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export default function StackGamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "countdown" | "playing" | "gameover">("menu");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [lastPlacement, setLastPlacement] = useState<"perfect" | "good" | "ok" | null>(null);
  
  // Play state (simplified - no payment, just gas tx)
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gamesPlayedThisWeek, setGamesPlayedThisWeek] = useState(0);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userBestScore, setUserBestScore] = useState(0);
  
  // Prize info (fetched from API)
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo>(DEFAULT_PRIZE_INFO);
  
  // Skin system state
  const [isPremium, setIsPremium] = useState(false);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>(['default']);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(DEFAULT_SKIN);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  const [userStats, setUserStats] = useState<{ gamesPlayed: number; highScore: number; totalScore: number }>({ gamesPlayed: 0, highScore: 0, totalScore: 0 });
  
  // Contract write for free play
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInitializedRef = useRef(false);
  
  const blocksRef = useRef<Block[]>([]);
  const currentBlockRef = useRef<Block | null>(null);
  const fallingPiecesRef = useRef<FallingPiece[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const directionRef = useRef<1 | -1>(1);
  const speedRef = useRef(BASE_SPEED);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const gameActiveRef = useRef(false);
  const cameraYRef = useRef(0);
  const targetCameraYRef = useRef(0);
  const countdownRef = useRef(3);
  const lastFrameTimeRef = useRef(performance.now());
  const screenShakeRef = useRef(0);
  const perfectPulseRef = useRef(0);
  
  const getDonutColor = useCallback(() => {
    const skin = selectedSkin;
    let color = skin.frostingColor;
    
    if (skin.animated) {
      const time = Date.now();
      
      if (skin.animationType === 'rainbow') {
        const hueShift = (time / 20) % 360;
        const [, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(hueShift, s, l);
      } else if (skin.animationType === 'pulse') {
        const pulseAmount = Math.sin(time / 300) * 0.15;
        const [h, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(h, s, Math.min(100, l + pulseAmount * 20));
      }
    }
    
    return color;
  }, [selectedSkin]);

  // Update reset countdown
  useEffect(() => {
    const updateCountdown = () => setResetCountdown(getTimeUntilReset());
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch prize info from API
  useEffect(() => {
    const fetchPrizeInfo = async () => {
      try {
        const res = await fetch('/api/games/stack-tower/prize-info');
        if (res.ok) {
          const data = await res.json();
          setPrizeInfo({
            totalPrize: data.totalPrize || 5,
            prizeStructure: data.prizeStructure || calculatePrizeStructure(data.totalPrize || 5),
          });
        }
      } catch (e) {
        console.error("Failed to fetch prize info:", e);
      }
    };
    fetchPrizeInfo();
  }, []);
  
  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const fid = context?.user?.fid;
      const url = fid ? `/api/games/stack-tower/leaderboard?fid=${fid}&limit=10` : `/api/games/stack-tower/leaderboard?limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success !== false) {
        setLeaderboard(data.leaderboard || []);
        if (data.userStats) {
          setUserRank(data.userStats.rank);
          setUserBestScore(data.userStats.bestScore);
          setGamesPlayedThisWeek(data.userStats.gamesPlayed || 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    }
  }, [context?.user?.fid]);

  // Submit score to API
  const submitScore = useCallback(async (finalScore: number) => {
    const entryId = currentEntryIdRef.current;
    if (!entryId || !context?.user?.fid) {
      console.error("Cannot submit score: missing entryId or fid", { entryId, fid: context?.user?.fid });
      return;
    }
    try {
      const res = await fetch("/api/games/stack-tower/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          entryId, 
          score: finalScore, 
          fid: context.user.fid,
          walletAddress: address,
          username: context.user.username || context.user.displayName,
          pfpUrl: context.user.pfpUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUserRank(data.rank);
        if (data.isPersonalBest) setUserBestScore(finalScore);
      }
      
      // Send game announcement to chat
      if (finalScore > 0 && address) {
        fetch('/api/chat/game-announce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerAddress: address,
            username: context.user.username || null,
            pfpUrl: context.user.pfpUrl || null,
            gameId: 'glaze-stack',
            gameName: 'Glaze Stack',
            score: finalScore,
            skinId: selectedSkin.id,
            skinColor: selectedSkin.frostingColor,
          }),
        }).catch(console.error);
      }
      
      // Refresh skin data (games played may have changed)
      if (address) {
        fetch(`/api/games/skin-market/user-data?address=${address}`).then(r => r.json()).then(data => {
          if (data.stats && data.stats['glaze-stack']) {
            setUserStats(data.stats['glaze-stack']);
          }
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  }, [context?.user, address, selectedSkin]);

  // Record entry to API and start game (after free tx confirms)
  const recordEntryAndStartGame = useCallback(async (hash: string) => {
    if (!context?.user) return;
    setPlayState('recording');
    try {
      const res = await fetch("/api/games/stack-tower/free-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context.user.fid,
          walletAddress: address,
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl,
          txHash: hash,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentEntryId(data.entryId);
        currentEntryIdRef.current = data.entryId;
        setPlayState('idle');
        resetWrite();
        startGame();
      } else {
        setErrorMessage(data.error || "Failed to record entry");
        setPlayState('error');
      }
    } catch (error) {
      console.error("Failed to record entry:", error);
      setErrorMessage("Failed to record entry");
      setPlayState('error');
    }
  }, [context?.user, address, resetWrite]);

  // Handle play - just calls free play contract (gas only)
  const handlePlay = useCallback(async () => {
    if (!address || !context?.user?.fid) {
      setErrorMessage("Please connect your wallet");
      return;
    }
    
    setErrorMessage(null);
    setPlayState('confirming');
    
    writeContract({
      address: FREE_ARCADE_CONTRACT,
      abi: FREE_ARCADE_ABI,
      functionName: "play",
      args: ["glaze-stack"],
    });
  }, [address, context?.user?.fid, writeContract]);

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && txHash && playState === 'confirming') {
      recordEntryAndStartGame(txHash);
    }
  }, [isConfirmed, txHash, playState, recordEntryAndStartGame]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      console.error("Write error:", writeError);
      setPlayState('error');
      setErrorMessage(writeError.message?.includes("User rejected") ? "Transaction rejected" : "Transaction failed");
    }
  }, [writeError]);
  
  // Initialize Farcaster SDK
  useEffect(() => {
    const init = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as MiniAppContext);
        await sdk.actions.ready();
      } catch (error) {
        console.error("SDK init error:", error);
      }
    };
    init();
  }, []);

  // Fetch data on load
  useEffect(() => {
    if (context?.user?.fid) {
      fetchLeaderboard();
    }
  }, [context?.user?.fid, fetchLeaderboard]);

  // Fetch skin data
  useEffect(() => {
    if (!address) return;
    
    const fetchSkinData = async () => {
      try {
        const res = await fetch(`/api/games/skin-market/user-data?address=${address}`);
        if (res.ok) {
          const data = await res.json();
          setIsPremium(data.isPremium || false);
          
          const unlocked = ['default', ...(data.unlockedSkins || [])];
          setUnlockedSkins(unlocked);
          
          if (data.equippedSkin) {
            const equippedSkinData = STACK_SKINS.find(s => s.id === data.equippedSkin);
            if (equippedSkinData && unlocked.includes(data.equippedSkin)) {
              setSelectedSkin(equippedSkinData);
            }
          }
          
          if (data.stats && data.stats['glaze-stack']) {
            setUserStats(data.stats['glaze-stack']);
          }
        }
      } catch (e) {
        console.error("Failed to fetch skin data:", e);
      }
    };
    
    fetchSkinData();
  }, [address]);
  
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
        audioInitializedRef.current = true;
      } catch {}
    }
    return audioContextRef.current;
  }, []);
  
  const playPlaceSound = useCallback((perfect: boolean, comboCount: number) => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        if (perfect) {
          const baseFreq = 440 + comboCount * 50;
          osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
          osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.1);
          osc.frequency.setValueAtTime(baseFreq * 2, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        } else {
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.setValueAtTime(250, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const playCountdownSound = useCallback((isLast: boolean) => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        if (isLast) {
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        } else {
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const playGameOverSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const triggerHaptic = useCallback((strong: boolean) => {
    try {
      if (navigator.vibrate) navigator.vibrate(strong ? [30, 50, 30] : 15);
    } catch {}
  }, []);
  
  const spawnPerfectParticles = useCallback((x: number, y: number, width: number) => {
    const getRandomColor = () => {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8B500', '#FF69B4', '#00CED1', '#FFD700', '#FF4500', '#7B68EE', '#00FA9A', '#FF1493', '#1E90FF', '#32CD32'];
      return colors[Math.floor(Math.random() * colors.length)];
    };
    for (let i = 0; i < 20; i++) {
      particlesRef.current.push({ x: x + Math.random() * width, y: y, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 2, life: 1, maxLife: 1, color: getRandomColor(), size: 3 + Math.random() * 4 });
    }
  }, []);
  
  const drawBlock = useCallback((ctx: CanvasRenderingContext2D, block: Block, cameraY: number, time: number) => {
    const screenY = block.y - cameraY;
    const depth = 10;
    const donutColor = getDonutColor();
    if (screenY > CANVAS_HEIGHT + 50 || screenY < -50) return;
    let bounceOffset = 0;
    if (block.landTime) {
      const timeSinceLand = time - block.landTime;
      if (timeSinceLand < 200) bounceOffset = Math.sin(timeSinceLand / 200 * Math.PI) * 4;
    }
    const drawY = screenY - bounceOffset;
    ctx.fillStyle = shadeColor(block.color, -20);
    ctx.beginPath();
    ctx.moveTo(block.x + block.width, drawY);
    ctx.lineTo(block.x + block.width + depth, drawY - depth);
    ctx.lineTo(block.x + block.width + depth, drawY + BLOCK_HEIGHT - depth);
    ctx.lineTo(block.x + block.width, drawY + BLOCK_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadeColor(block.color, 10);
    ctx.beginPath();
    ctx.moveTo(block.x, drawY);
    ctx.lineTo(block.x + depth, drawY - depth);
    ctx.lineTo(block.x + block.width + depth, drawY - depth);
    ctx.lineTo(block.x + block.width, drawY);
    ctx.closePath();
    ctx.fill();
    const gradient = ctx.createLinearGradient(block.x, drawY, block.x, drawY + BLOCK_HEIGHT);
    gradient.addColorStop(0, shadeColor(block.color, 5));
    gradient.addColorStop(0.5, block.color);
    gradient.addColorStop(1, shadeColor(block.color, -8));
    ctx.fillStyle = gradient;
    ctx.fillRect(block.x, drawY, block.width, BLOCK_HEIGHT);
    const windowPadding = 4;
    const windowHeight = BLOCK_HEIGHT - windowPadding * 2;
    const windowWidth = block.width - windowPadding * 2;
    const windowX = block.x + windowPadding;
    const windowY = drawY + windowPadding;
    ctx.fillStyle = 'rgba(30, 20, 25, 0.85)';
    ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
    const donutRadius = 6;
    const donutSpacing = donutRadius * 2.8;
    const numDonuts = Math.max(1, Math.floor(windowWidth / donutSpacing));
    const startX = windowX + (windowWidth - (numDonuts - 1) * donutSpacing) / 2;
    const donutY = windowY + windowHeight / 2;
    for (let i = 0; i < numDonuts; i++) {
      const donutX = startX + i * donutSpacing;
      ctx.beginPath();
      ctx.arc(donutX, donutY, donutRadius, 0, Math.PI * 2);
      ctx.fillStyle = donutColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(donutX, donutY, donutRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 20, 25, 0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(donutX - donutRadius * 0.3, donutY - donutRadius * 0.3, donutRadius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(windowX, windowY, windowWidth, windowHeight);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(block.x, drawY + BLOCK_HEIGHT * 0.1, block.width, 2);
    ctx.fillRect(block.x, drawY + BLOCK_HEIGHT * 0.85, block.width, 2);
  }, [getDonutColor]);
  
  const drawFallingPiece = useCallback((ctx: CanvasRenderingContext2D, piece: FallingPiece, cameraY: number) => {
    const screenY = piece.y - cameraY;
    const donutColor = getDonutColor();
    ctx.save();
    ctx.globalAlpha = piece.opacity;
    ctx.translate(piece.x + piece.width / 2, screenY + BLOCK_HEIGHT / 2);
    ctx.rotate(piece.rotation);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.width / 2, -BLOCK_HEIGHT / 2, piece.width, BLOCK_HEIGHT);
    const windowPadding = 3;
    const windowX = -piece.width / 2 + windowPadding;
    const windowY = -BLOCK_HEIGHT / 2 + windowPadding;
    const windowWidth = piece.width - windowPadding * 2;
    const windowHeight = BLOCK_HEIGHT - windowPadding * 2;
    ctx.fillStyle = 'rgba(30, 20, 25, 0.85)';
    ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
    const donutRadius = 4;
    const numDonuts = Math.max(1, Math.floor(windowWidth / (donutRadius * 2.5)));
    const spacing = windowWidth / (numDonuts + 1);
    for (let i = 0; i < numDonuts; i++) {
      const dx = windowX + spacing * (i + 1);
      ctx.beginPath();
      ctx.arc(dx, 0, donutRadius, 0, Math.PI * 2);
      ctx.fillStyle = donutColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx, 0, donutRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 20, 25, 0.9)';
      ctx.fill();
    }
    ctx.restore();
  }, [getDonutColor]);
  
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D, cameraY: number) => {
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - cameraY, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, []);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    const now = performance.now();
    const rawDelta = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    const deltaTime = Math.min(rawDelta / 16.667, 2);
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    let shakeX = 0, shakeY = 0;
    if (screenShakeRef.current > 0) {
      shakeX = (Math.random() - 0.5) * screenShakeRef.current * 8;
      shakeY = (Math.random() - 0.5) * screenShakeRef.current * 8;
      screenShakeRef.current -= 0.1 * deltaTime;
      if (screenShakeRef.current < 0) screenShakeRef.current = 0;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
    for (let i = 0; i < CANVAS_HEIGHT; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }
    if (perfectPulseRef.current > 0) {
      ctx.fillStyle = `rgba(255, 215, 0, ${perfectPulseRef.current * 0.1})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      perfectPulseRef.current -= 0.05 * deltaTime;
      if (perfectPulseRef.current < 0) perfectPulseRef.current = 0;
    }
    cameraYRef.current += (targetCameraYRef.current - cameraYRef.current) * 0.08 * deltaTime;
    blocksRef.current.forEach(block => { drawBlock(ctx, block, cameraYRef.current, now); });
    particlesRef.current = particlesRef.current.filter(p => { p.x += p.vx * deltaTime; p.y += p.vy * deltaTime; p.vy += 0.3 * deltaTime; p.life -= 0.02 * deltaTime; return p.life > 0; });
    drawParticles(ctx, cameraYRef.current);
    fallingPiecesRef.current = fallingPiecesRef.current.filter(piece => {
      piece.y += piece.velocityY * deltaTime; piece.x += piece.velocityX * deltaTime; piece.velocityY += 0.8 * deltaTime; piece.rotation += piece.rotationSpeed * deltaTime; piece.opacity -= 0.025 * deltaTime;
      if (piece.opacity > 0 && piece.y - cameraYRef.current < CANVAS_HEIGHT + 100) { drawFallingPiece(ctx, piece, cameraYRef.current); return true; }
      return false;
    });
    if (currentBlockRef.current && !currentBlockRef.current.settled) {
      const block = currentBlockRef.current;
      block.x += speedRef.current * directionRef.current * deltaTime;
      if (block.x + block.width >= CANVAS_WIDTH) { block.x = CANVAS_WIDTH - block.width; directionRef.current = -1; } 
      else if (block.x <= 0) { block.x = 0; directionRef.current = 1; }
      drawBlock(ctx, block, cameraYRef.current, now);
    }
    ctx.restore();
    ctx.shadowColor = "#FFFFFF"; ctx.shadowBlur = 20; ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 48px monospace"; ctx.textAlign = "center"; ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 70); ctx.shadowBlur = 0;
    if (comboRef.current >= 2) {
      const comboPulse = 1 + Math.sin(now / 100) * 0.1;
      ctx.save(); ctx.translate(CANVAS_WIDTH / 2, 100); ctx.scale(comboPulse, comboPulse); ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 15; ctx.fillStyle = "#FFD700"; ctx.font = "bold 20px monospace"; ctx.fillText(`${comboRef.current}x PERFECT!`, 0, 0); ctx.shadowBlur = 0; ctx.restore();
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBlock, drawFallingPiece, drawParticles]);
  
  const endGame = useCallback((finalScore: number) => {
    gameActiveRef.current = false;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    playGameOverSound(); triggerHaptic(true); screenShakeRef.current = 1;
    setGameState("gameover"); setHighScore(prev => Math.max(prev, finalScore));
    submitScore(finalScore); fetchLeaderboard();
  }, [playGameOverSound, triggerHaptic, submitScore, fetchLeaderboard]);
  
  const placeBlock = useCallback(() => {
    if (!gameActiveRef.current || !currentBlockRef.current) return;
    const current = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock) {
      current.settled = true; current.landTime = performance.now(); blocksRef.current.push({ ...current }); scoreRef.current++; setScore(scoreRef.current);
      playPlaceSound(true, 1); triggerHaptic(true); setLastPlacement("perfect"); spawnPerfectParticles(current.x, current.y, current.width); perfectPulseRef.current = 1; screenShakeRef.current = 0.3;
      setTimeout(() => setLastPlacement(null), 500); spawnNewBlock(); return;
    }
    const currentLeft = current.x; const currentRight = current.x + current.width; const lastLeft = lastBlock.x; const lastRight = lastBlock.x + lastBlock.width;
    const overlapLeft = Math.max(currentLeft, lastLeft); const overlapRight = Math.min(currentRight, lastRight); const overlapWidth = overlapRight - overlapLeft;
    if (overlapWidth <= 0) {
      blocksRef.current.forEach((block, i) => { setTimeout(() => { fallingPiecesRef.current.push({ x: block.x, y: block.y, width: block.width, color: block.color, velocityY: -2 - Math.random() * 3, velocityX: (Math.random() - 0.5) * 4, rotation: 0, rotationSpeed: (Math.random() - 0.5) * 0.2, opacity: 1 }); }, i * 50); });
      endGame(scoreRef.current); return;
    }
    const isPerfect = Math.abs(current.x - lastBlock.x) <= PERFECT_THRESHOLD;
    if (isPerfect) {
      current.x = lastBlock.x; current.width = lastBlock.width; comboRef.current++; setCombo(comboRef.current);
      playPlaceSound(true, comboRef.current); triggerHaptic(true); setLastPlacement("perfect"); spawnPerfectParticles(current.x, current.y, current.width); perfectPulseRef.current = 1; screenShakeRef.current = 0.2;
    } else {
      const cutOffLeft = currentLeft < lastLeft ? lastLeft - currentLeft : 0; const cutOffRight = currentRight > lastRight ? currentRight - lastRight : 0;
      if (cutOffLeft > 0) fallingPiecesRef.current.push({ x: currentLeft, y: current.y, width: cutOffLeft, color: current.color, velocityY: 0, velocityX: -2 - Math.random() * 2, rotation: 0, rotationSpeed: -0.1 - Math.random() * 0.1, opacity: 1 });
      if (cutOffRight > 0) fallingPiecesRef.current.push({ x: overlapRight, y: current.y, width: cutOffRight, color: current.color, velocityY: 0, velocityX: 2 + Math.random() * 2, rotation: 0, rotationSpeed: 0.1 + Math.random() * 0.1, opacity: 1 });
      current.x = overlapLeft; current.width = overlapWidth; comboRef.current = 0; setCombo(0); playPlaceSound(false, 0); triggerHaptic(false); screenShakeRef.current = 0.15;
      if (overlapWidth > lastBlock.width * 0.8) setLastPlacement("good"); else setLastPlacement("ok");
    }
    setTimeout(() => setLastPlacement(null), 500);
    if (current.width < 12) { endGame(scoreRef.current); return; }
    current.settled = true; current.landTime = performance.now(); blocksRef.current.push({ ...current }); scoreRef.current++; setScore(scoreRef.current);
    const desiredScreenY = 180; const topBlockY = current.y - BLOCK_HEIGHT; const newCameraTarget = topBlockY - desiredScreenY;
    if (newCameraTarget < targetCameraYRef.current) targetCameraYRef.current = newCameraTarget;
    speedRef.current = Math.min(BASE_SPEED + scoreRef.current * SPEED_INCREMENT, MAX_SPEED);
    spawnNewBlock();
  }, [playPlaceSound, triggerHaptic, spawnPerfectParticles, endGame]);
  
  const spawnNewBlock = useCallback(() => {
    const blocks = blocksRef.current; const lastBlock = blocks[blocks.length - 1];
    const newY = lastBlock ? lastBlock.y - BLOCK_HEIGHT : CANVAS_HEIGHT - BLOCK_HEIGHT - 50;
    const newWidth = lastBlock ? lastBlock.width : INITIAL_BLOCK_WIDTH;
    const newX = directionRef.current === 1 ? -newWidth : CANVAS_WIDTH;
    currentBlockRef.current = { x: newX, y: newY, width: newWidth, color: getBlockColor(blocks.length), settled: false };
  }, []);
  
  const startGame = useCallback(() => {
    initAudioContext();
    blocksRef.current = []; fallingPiecesRef.current = []; particlesRef.current = []; currentBlockRef.current = null;
    directionRef.current = 1; speedRef.current = BASE_SPEED; scoreRef.current = 0; comboRef.current = 0;
    cameraYRef.current = 0; targetCameraYRef.current = 0; countdownRef.current = 3;
    lastFrameTimeRef.current = performance.now(); screenShakeRef.current = 0; perfectPulseRef.current = 0;
    setScore(0); setCombo(0); setCountdown(3); setGameState("countdown"); setErrorMessage(null); setLastPlacement(null);
    const baseY = CANVAS_HEIGHT - BLOCK_HEIGHT - 50;
    blocksRef.current.push({ x: (CANVAS_WIDTH - INITIAL_BLOCK_WIDTH) / 2, y: baseY, width: INITIAL_BLOCK_WIDTH, color: getBlockColor(0), settled: true });
    playCountdownSound(false);
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--; countdownRef.current = count; setCountdown(count);
      if (count > 0) playCountdownSound(false); else playCountdownSound(true);
      if (count <= 0) {
        clearInterval(countdownInterval); lastFrameTimeRef.current = performance.now(); gameActiveRef.current = true; setGameState("playing"); spawnNewBlock();
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop, initAudioContext, playCountdownSound, spawnNewBlock]);
  
  const handleTap = useCallback(() => { if (gameState === "playing" && gameActiveRef.current) placeBlock(); }, [gameState, placeBlock]);
  
  const handleSelectSkin = async (skin: GameSkin) => {
    if (!address || !unlockedSkins.includes(skin.id)) return;
    setSelectedSkin(skin);
    if (skin.id !== 'default') {
      try { await fetch('/api/games/skin-market/equip-skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.toLowerCase(), skinId: skin.id }) }); } catch {}
    }
  };
  
  const handleClaimSkin = async (skin: GameSkin) => {
    if (!address || !isPremium) return;
    try {
      const res = await fetch('/api/games/skin-market/claim-skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.toLowerCase(), skinId: skin.id }) });
      if (res.ok) { setUnlockedSkins(prev => [...prev, skin.id]); setSelectedSkin(skin); }
    } catch {}
  };
  
  const canClaimSkin = (skin: GameSkin): boolean => {
    if (!skin.requirement || !isPremium) return false;
    if (skin.requirement.type === 'games_played') return userStats.gamesPlayed >= skin.requirement.value;
    if (skin.requirement.type === 'high_score') return userStats.highScore >= skin.requirement.value;
    return false;
  };
  
  const getSkinProgress = (skin: GameSkin): { current: number; target: number } => {
    if (!skin.requirement) return { current: 0, target: 0 };
    if (skin.requirement.type === 'games_played') return { current: userStats.gamesPlayed, target: skin.requirement.value };
    if (skin.requirement.type === 'high_score') return { current: userStats.highScore, target: skin.requirement.value };
    return { current: 0, target: 0 };
  };
  
  const getTierColor = (tier: SkinTier) => {
    switch (tier) {
      case 'ultimate': return 'bg-gradient-to-br from-amber-400 to-orange-500';
      case 'mythic': return 'bg-violet-500';
      case 'legendary': return 'bg-yellow-500';
      case 'epic': return 'bg-cyan-500';
      case 'rare': return 'bg-purple-500';
      case 'common': return 'bg-zinc-600';
      default: return 'bg-zinc-700';
    }
  };
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🍩📦 I just stacked ${score} glaze boxes in Glaze Stack!\n\nThink you can stack higher? Play FREE now! 🏆`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score]);
  
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT); bgGradient.addColorStop(0, "#1a1a1a"); bgGradient.addColorStop(1, "#0d0d0d"); ctx.fillStyle = bgGradient; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)"; ctx.lineWidth = 1;
      for (let i = 0; i < CANVAS_WIDTH; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }
      const previewColors = ['#FFE4EC', '#FFDEE8', '#FFD8E4', '#FFD2E0', '#FFCCDC']; const baseY = CANVAS_HEIGHT - 70; const floatOffset = Math.sin(Date.now() / 500) * 4; const depth = 10; const donutColor = getDonutColor();
      previewColors.forEach((color, i) => {
        const width = 130 - i * 10; const x = (CANVAS_WIDTH - width) / 2; const y = baseY - i * (BLOCK_HEIGHT - 1) + floatOffset;
        ctx.fillStyle = shadeColor(color, -20); ctx.beginPath(); ctx.moveTo(x + width, y); ctx.lineTo(x + width + depth, y - depth); ctx.lineTo(x + width + depth, y + BLOCK_HEIGHT - depth); ctx.lineTo(x + width, y + BLOCK_HEIGHT); ctx.closePath(); ctx.fill();
        ctx.fillStyle = shadeColor(color, 10); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + depth, y - depth); ctx.lineTo(x + width + depth, y - depth); ctx.lineTo(x + width, y); ctx.closePath(); ctx.fill();
        const gradient = ctx.createLinearGradient(x, y, x, y + BLOCK_HEIGHT); gradient.addColorStop(0, shadeColor(color, 5)); gradient.addColorStop(0.5, color); gradient.addColorStop(1, shadeColor(color, -8)); ctx.fillStyle = gradient; ctx.fillRect(x, y, width, BLOCK_HEIGHT);
        const windowPadding = 4; const windowX = x + windowPadding; const windowY = y + windowPadding; const windowWidth = width - windowPadding * 2; const windowHeight = BLOCK_HEIGHT - windowPadding * 2;
        ctx.fillStyle = 'rgba(30, 20, 25, 0.85)'; ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
        const donutRadius = 6; const donutSpacing = donutRadius * 2.8; const numDonuts = Math.max(1, Math.floor(windowWidth / donutSpacing)); const startX = windowX + (windowWidth - (numDonuts - 1) * donutSpacing) / 2; const donutYPos = windowY + windowHeight / 2;
        for (let j = 0; j < numDonuts; j++) { const donutX = startX + j * donutSpacing; ctx.beginPath(); ctx.arc(donutX, donutYPos, donutRadius, 0, Math.PI * 2); ctx.fillStyle = donutColor; ctx.fill(); ctx.beginPath(); ctx.arc(donutX, donutYPos, donutRadius * 0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30, 20, 25, 0.9)'; ctx.fill(); }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(windowX, windowY, windowWidth, windowHeight);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fillRect(x, y + BLOCK_HEIGHT * 0.1, width, 2); ctx.fillRect(x, y + BLOCK_HEIGHT * 0.85, width, 2);
      });
      ctx.fillStyle = "#F472B6"; ctx.font = "bold 28px monospace"; ctx.textAlign = "center"; ctx.fillText("GLAZE STACK", CANVAS_WIDTH / 2, 60);
      if (gameState === "countdown") {
        const scale = 1 + Math.sin(Date.now() / 100) * 0.08; ctx.save(); ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40); ctx.scale(scale, scale); ctx.shadowColor = "#FFFFFF"; ctx.shadowBlur = 40; ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 120px monospace"; ctx.fillText(countdownRef.current.toString(), 0, 30); ctx.shadowBlur = 0; ctx.restore();
        ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 16px monospace"; ctx.fillText("GET READY!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      }
      if (gameState === "gameover") {
        ctx.fillStyle = "#FF6B6B"; ctx.font = "bold 24px monospace"; ctx.fillText("TOWER COLLAPSED!", CANVAS_WIDTH / 2, 100);
        ctx.shadowColor = "#FFFFFF"; ctx.shadowBlur = 20; ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 56px monospace"; ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 155); ctx.shadowBlur = 0;
        ctx.fillStyle = "#888888"; ctx.font = "14px monospace"; ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 185);
        if (combo >= 3) { ctx.fillStyle = "#FFD700"; ctx.font = "bold 14px monospace"; ctx.fillText(`Max Combo: ${combo}x`, CANVAS_WIDTH / 2, 210); }
      }
    };
    draw();
    if (gameState === "menu" || gameState === "gameover" || gameState === "countdown") { const interval = setInterval(draw, 50); return () => clearInterval(interval); }
  }, [gameState, score, highScore, combo, getDonutColor]);
  
  useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); handleTap(); } }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleTap]);
  
  const isPlayPending = playState === 'confirming' || playState === 'recording' || isPending || isConfirming;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`.hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; } .hide-scrollbar::-webkit-scrollbar { display: none; } @keyframes placement-pop { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 0; } } .placement-indicator { animation: placement-pop 0.5s ease-out forwards; } * { -webkit-tap-highlight-color: transparent !important; }`}</style>
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <Header title="GLAZE STACK" user={context?.user} />
        <button onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }} className="relative w-full mb-3 px-4 py-3 bg-gradient-to-br from-zinc-900/80 to-zinc-800/60 border border-zinc-700/50 rounded-xl transition-all active:scale-[0.98] hover:border-zinc-600 group" style={{ minHeight: '70px' }}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2"><img src="/coins/USDC_LOGO.png" alt="USDC" className="w-4 h-4 rounded-full" /><span className="text-[10px] text-zinc-400 font-medium">Weekly Prize Pool</span></div>
              <span className="text-2xl font-bold text-green-400">${prizeInfo.totalPrize} USDC</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-zinc-500 group-hover:text-zinc-300 transition-colors"><span className="text-[10px]">View Leaderboard</span><ChevronRight className="w-3 h-3" /></div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /><span>Resets in <span className="font-bold text-zinc-300">{resetCountdown}</span></span></div>
            </div>
          </div>
        </button>
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            {gameState === "playing" && <div className="absolute inset-0 z-10 cursor-pointer" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleTap(); }} style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }} />}
            <canvas ref={canvasRef} width={SCALED_WIDTH} height={SCALED_HEIGHT} className="rounded-2xl border border-zinc-800 w-full h-full select-none" style={{ touchAction: "none" }} />
            {lastPlacement && gameState === "playing" && <div className="absolute top-24 left-0 right-0 flex justify-center pointer-events-none z-20"><span className={`placement-indicator font-bold text-lg ${lastPlacement === "perfect" ? "text-yellow-400" : lastPlacement === "good" ? "text-green-400" : "text-zinc-400"}`}>{lastPlacement === "perfect" ? "PERFECT!" : lastPlacement === "good" ? "GOOD!" : "OK"}</span></div>}
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500"><Share2 className="w-3 h-3" /><span>Share</span></button>}
                  {errorMessage && <p className="text-red-400 text-xs">{errorMessage}</p>}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 rounded-full border border-zinc-700"><span className="text-xs text-zinc-400">Gas only (~$0.001)</span></div>
                  <button onClick={handlePlay} disabled={isPlayPending} className="flex items-center gap-2 px-6 py-2 bg-green-500 text-black font-bold rounded-full hover:bg-green-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isPlayPending ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Confirming...</span></> : <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>}
                  </button>
                  <p className="text-zinc-500 text-[10px]">Games this week: {gamesPlayedThisWeek}</p>
                </div>
              </div>
            )}
            {gameState === "playing" && <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20"><p className="text-zinc-600 text-[10px]">Tap to place block</p></div>}
          </div>
        </div>
        {(gameState === "menu" || gameState === "gameover") && (
          <div className="py-3 flex items-center justify-center gap-2">
            <button onClick={() => setShowSkins(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500"><Palette className="w-3 h-3 text-zinc-400" /><span className="text-xs">Skins</span></button>
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500"><HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs">How to Play</span></button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>{isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}<span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span></button>
          </div>
        )}
      </div>
      {showLeaderboard && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800"><div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-green-400" /><span className="font-bold">Weekly Leaderboard</span></div><button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800"><div className="flex items-center justify-between"><span className="text-xs text-zinc-400">Prize Pool</span><span className="text-sm font-bold text-green-400">${prizeInfo.totalPrize} USDC</span></div></div>
            <div className="max-h-[50vh] overflow-y-auto">
              {leaderboard.length === 0 ? <div className="py-8 text-center"><p className="text-zinc-500">No scores yet!</p><p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p></div> : leaderboard.map((entry) => {
                const prize = prizeInfo.prizeStructure.find(p => p.rank === entry.rank);
                return (
                  <div key={entry.rank} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-green-500/10" : ""}`}>
                    <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-green-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                    {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🏗️</div>}
                    <div className="flex-1 min-w-0"><span className="block truncate text-sm">{entry.displayName || entry.username || `fid:${entry.fid}`}</span>{prize && <span className="text-xs text-green-400">+${prize.amount}</span>}</div>
                    <span className="font-bold text-sm">{entry.score}</span>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-800"><p className="text-[10px] text-zinc-500 text-center">Prizes distributed every Friday in USDC</p></div>
          </div>
        </div>
      )}
      {showSkins && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800"><div className="flex items-center gap-2"><Palette className="w-5 h-5 text-zinc-400" /><span className="font-bold">Glaze Stack Skins</span></div><button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            {!isPremium && <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20"><div className="flex items-center gap-2"><Crown className="w-4 h-4 text-amber-400" /><span className="text-xs text-amber-200">Unlock Premium to earn skins by playing!</span></div></div>}
            {isPremium && <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800"><div className="flex items-center justify-between text-xs"><span className="text-zinc-400">Games Played: <span className="text-white font-bold">{userStats.gamesPlayed}</span></span><span className="text-zinc-400">High Score: <span className="text-white font-bold">{userStats.highScore}</span></span></div></div>}
            <div className="p-4 grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
              {STACK_SKINS.map((skin) => {
                const isUnlocked = unlockedSkins.includes(skin.id); const isSelected = selectedSkin.id === skin.id; const canClaim = !isUnlocked && canClaimSkin(skin); const progress = getSkinProgress(skin); const isDefault = skin.id === 'default';
                return (
                  <button key={skin.id} onClick={() => { if (isUnlocked) handleSelectSkin(skin); else if (canClaim) handleClaimSkin(skin); }} onMouseEnter={() => setPreviewSkin(skin)} onMouseLeave={() => setPreviewSkin(null)} disabled={!isUnlocked && !canClaim} className={`relative p-3 rounded-xl border-2 transition-all ${isSelected ? "border-white bg-zinc-800" : isUnlocked ? "border-zinc-700 hover:border-zinc-500" : canClaim ? "border-green-500/50 hover:border-green-500 bg-green-500/10" : "border-zinc-800 opacity-60"}`}>
                    {!isDefault && <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${getTierColor(skin.tier)}`}>{skin.tier === 'ultimate' ? <Crown className="w-2.5 h-2.5 text-black" /> : skin.tier === 'mythic' ? <Sparkles className="w-2.5 h-2.5 text-white" /> : skin.tier === 'legendary' ? <Sparkles className="w-2.5 h-2.5 text-black" /> : skin.tier === 'epic' ? <Zap className="w-2.5 h-2.5 text-black" /> : <span className="text-[8px] text-white font-bold">{skin.tier === 'rare' ? 'R' : 'C'}</span>}</div>}
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: isUnlocked || canClaim ? skin.frostingColor : '#3f3f46' }}><div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700" /></div>{!isUnlocked && !canClaim && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"><Lock className="w-4 h-4 text-zinc-500" /></div>}</div>
                    <p className="text-[10px] font-bold truncate text-center">{skin.name}</p>
                    {isSelected && <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /></div>}
                    {!isUnlocked && !isDefault && isPremium && <div className="mt-1">{canClaim ? <span className="text-[8px] text-green-400 font-bold">CLAIM!</span> : <><div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%`, backgroundColor: skin.frostingColor }} /></div><p className="text-[8px] text-zinc-500 text-center mt-0.5">{progress.current}/{progress.target}</p></>}</div>}
                    {!isUnlocked && !isDefault && !isPremium && <p className="text-[8px] text-zinc-600 text-center mt-1 flex items-center justify-center gap-0.5"><Crown className="w-2 h-2" /> Premium</p>}
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-800/50"><button onClick={() => { setShowSkins(false); window.location.href = "/games/skin-market"; }} className="w-full flex items-center justify-center gap-2 py-2 text-amber-400 hover:text-amber-300"><Crown className="w-4 h-4" /><span className="text-sm font-bold">{isPremium ? 'View All Skins' : 'Get Premium'}</span></button></div>
          </div>
        </div>
      )}
      {showHelp && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800"><div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div><button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-pink-400" />Gameplay</h3><p className="text-xs text-zinc-400">Tap to place the moving block. Align it perfectly with the block below to keep building! Misaligned portions fall off, making your tower narrower.</p></div>
              <div><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Perfect Placement</h3><p className="text-xs text-zinc-400">Land blocks perfectly to build combos! Perfect placements keep your block the same size and increase your combo multiplier.</p></div>
              <div><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-green-400" />Win Prizes</h3><p className="text-xs text-zinc-400">This game is FREE TO PLAY! Top 10 players each week win USDC prizes distributed automatically every Friday at 6PM EST.</p><div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs"><div className="flex justify-between"><span className="text-green-400">🥇 1st</span><span className="text-white">40%</span></div><div className="flex justify-between"><span className="text-zinc-300">🥈 2nd</span><span className="text-white">20%</span></div><div className="flex justify-between"><span className="text-orange-400">🥉 3rd</span><span className="text-white">15%</span></div><div className="flex justify-between"><span className="text-zinc-400">4th</span><span className="text-white">8%</span></div><div className="flex justify-between"><span className="text-zinc-400">5th</span><span className="text-white">5%</span></div><div className="flex justify-between"><span className="text-zinc-400">6th-10th</span><span className="text-white">12% split</span></div></div></div>
              <div><h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-zinc-400" />Weekly Reset</h3><p className="text-xs text-zinc-400">Leaderboards reset every Friday at 6PM EST. Your best score of the week counts!</p></div>
            </div>
            <div className="p-4 border-t border-zinc-800 bg-zinc-800/50"><button onClick={() => setShowHelp(false)} className="w-full py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200">Got it!</button></div>
          </div>
        </div>
      )}
      <NavBar />
    </main>
  );
}

function shadeColor(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + (B < 255 ? (B < 1 ? 0 : B) : 255)).toString(16).slice(1);
}