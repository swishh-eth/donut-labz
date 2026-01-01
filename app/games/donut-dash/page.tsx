"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Play, Share2, X, HelpCircle, Volume2, VolumeX, Trophy, ChevronRight, Clock, Palette, Lock, Crown, Sparkles, Check } from "lucide-react";

// Free Arcade Contract
const FREE_ARCADE_CONTRACT = "0x9726D22F49274b575b1cd899868Aa10523A3E895" as const;

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

// Physics
const GRAVITY = 0.38;
const THRUST = -0.65;
const MAX_VELOCITY = 6;
const PLAYER_X = 80;
const PLAYER_SIZE = 32;

// Game speed
const BASE_SPEED = 4;
const MAX_SPEED = 8;
const SPEED_INCREMENT = 0.0005;

// Weekly USDC prize pool (fetched from API)
interface PrizeInfo {
  totalPrize: number;
  prizeStructure: { rank: number; percent: number; amount: string }[];
}

// Prize percentages (amounts calculated from totalPrize)
const PRIZE_PERCENTAGES = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];

// Calculate prize structure from total
function calculatePrizeStructure(totalPrize: number) {
  return PRIZE_PERCENTAGES.map((percent, i) => ({
    rank: i + 1,
    percent,
    amount: ((totalPrize * percent) / 100).toFixed(2),
  }));
}

// Default values until API loads
const DEFAULT_PRIZE_INFO: PrizeInfo = {
  totalPrize: 5,
  prizeStructure: calculatePrizeStructure(5),
};

// Skin type definitions
type SkinTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultimate' | 'default';

interface GameSkin {
  id: string;
  name: string;
  frostingColor: string;
  tier: SkinTier;
  animated?: boolean;
  animationType?: 'rainbow' | 'glow' | 'pulse' | 'sparkle' | 'electric' | 'fire';
  requirement?: { type: string; value: number };
}

// Default skin (always available)
const DEFAULT_SKIN: GameSkin = {
  id: 'default',
  name: 'Classic Pink',
  frostingColor: '#FF69B4',
  tier: 'default',
};

// All Donut Dash achievement skins
const DASH_SKINS: GameSkin[] = [
  DEFAULT_SKIN,
  { id: 'dash-bronze', name: 'Jetpack Novice', frostingColor: '#3B82F6', tier: 'common', requirement: { type: 'games_played', value: 25 } },
  { id: 'dash-silver', name: 'Speed Demon', frostingColor: '#F97316', tier: 'rare', requirement: { type: 'games_played', value: 50 } },
  { id: 'dash-epic', name: 'Rocket Rider', frostingColor: '#EF4444', tier: 'epic', animated: true, animationType: 'pulse', requirement: { type: 'games_played', value: 100 } },
  { id: 'dash-gold', name: 'Cosmic Cruiser', frostingColor: '#EC4899', tier: 'legendary', animated: true, animationType: 'sparkle', requirement: { type: 'high_score', value: 1000 } },
  { id: 'dash-mythic', name: 'Void Walker', frostingColor: '#6366F1', tier: 'mythic', animated: true, animationType: 'electric', requirement: { type: 'games_played', value: 250 } },
  { id: 'dash-ultimate', name: 'Dash Deity', frostingColor: '#10B981', tier: 'ultimate', animated: true, animationType: 'fire', requirement: { type: 'games_played', value: 500 } },
];

// Types
type ObstacleType = 'zapper_h' | 'zapper_v' | 'zapper_diag';
type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

interface Obstacle { x: number; y: number; type: ObstacleType; width: number; height: number; angle?: number; }
interface Coin { x: number; y: number; collected: boolean; }
interface GroundBlock { x: number; width: number; height: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface LeaderboardEntry { rank: number; fid: number; username?: string; displayName?: string; pfpUrl?: string; score: number; }
type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
};

// Color conversion helpers for animations
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
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Calculate time until next Friday 11PM UTC
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
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export default function DonutDashPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  // Context and game state
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  
  // Skin state
  const [isPremium, setIsPremium] = useState(false);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>(['default']);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(DEFAULT_SKIN);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  const [userStats, setUserStats] = useState<{ gamesPlayed: number; highScore: number; totalScore: number }>({ gamesPlayed: 0, highScore: 0, totalScore: 0 });
  
  // Play state (simplified - no payment, just gas tx)
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gamesPlayedThisWeek, setGamesPlayedThisWeek] = useState(0);
  
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userBestScore, setUserBestScore] = useState(0);
  
  // Prize info (fetched from API)
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo>(DEFAULT_PRIZE_INFO);
  
  // Game refs
  const playerRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0, isThrusting: false });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const groundBlocksRef = useRef<GroundBlock[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const coinsCollectedRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const bgElementsRef = useRef<{ x: number; y: number; type: string; speed: number; height?: number }[]>([]);
  const hasStartedFlyingRef = useRef(false);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const thrustOscRef = useRef<OscillatorNode | null>(null);
  const thrustGainRef = useRef<GainNode | null>(null);

  // Contract write for free play
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Get donut color with animation support
  const getDonutColor = useCallback(() => {
    const skin = selectedSkin;
    let color = skin.frostingColor;
    
    if (skin.animated) {
      const time = Date.now();
      if (skin.animationType === 'pulse') {
        const pulseAmount = Math.sin(time / 300) * 0.15;
        const [h, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(h, s, Math.min(100, l + pulseAmount * 20));
      } else if (skin.animationType === 'sparkle') {
        const sparkleOffset = Math.sin(time / 100) * 0.3;
        const [h, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(h, s, Math.min(100, l + sparkleOffset * 30));
      } else if (skin.animationType === 'rainbow') {
        const hueShift = (time / 20) % 360;
        const [, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(hueShift, s, l);
      } else if (skin.animationType === 'glow') {
        const glowAmount = Math.sin(time / 200) * 0.2;
        const [h, s, l] = hexToHsl(skin.frostingColor);
        color = hslToHex(h, s, Math.min(100, l + glowAmount * 25));
      }
    }
    return color;
  }, [selectedSkin]);

  // Update reset countdown every minute
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
        const res = await fetch('/api/games/donut-dash/prize-distribute');
        if (res.ok) {
          const data = await res.json();
          // Use API prizeStructure if available, otherwise calculate locally
          setPrizeInfo({
            totalPrize: data.totalPrize,
            prizeStructure: data.prizeStructure || calculatePrizeStructure(data.totalPrize),
          });
        }
      } catch (e) {
        console.error("Failed to fetch prize info:", e);
      }
    };
    fetchPrizeInfo();
  }, []);

  // Fetch skin data from API
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
            const equippedSkinData = DASH_SKINS.find(s => s.id === data.equippedSkin);
            if (equippedSkinData && unlocked.includes(data.equippedSkin)) {
              setSelectedSkin(equippedSkinData);
            }
          }
          if (data.stats && data.stats['donut-dash']) {
            setUserStats(data.stats['donut-dash']);
          }
        }
      } catch (e) {
        console.error("Failed to fetch skin data:", e);
      }
    };
    fetchSkinData();
  }, [address]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const fid = context?.user?.fid;
      const url = fid ? `/api/games/donut-dash/leaderboard?fid=${fid}&limit=10` : `/api/games/donut-dash/leaderboard?limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
        setCurrentWeek(data.currentWeek);
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

  // Skin handlers
  const handleSelectSkin = async (skin: GameSkin) => {
    if (!address || !unlockedSkins.includes(skin.id)) return;
    setSelectedSkin(skin);
    if (skin.id !== 'default') {
      try {
        await fetch('/api/games/skin-market/equip-skin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.toLowerCase(), skinId: skin.id }),
        });
      } catch (e) {
        console.error("Failed to equip skin:", e);
      }
    }
  };

  const handleClaimSkin = async (skin: GameSkin) => {
    if (!address || !isPremium) return;
    try {
      const res = await fetch('/api/games/skin-market/claim-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase(), skinId: skin.id }),
      });
      if (res.ok) {
        setUnlockedSkins(prev => [...prev, skin.id]);
        setSelectedSkin(skin);
      }
    } catch (e) {
      console.error("Failed to claim skin:", e);
    }
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

  // Submit score to API
  const submitScore = useCallback(async (finalScore: number) => {
    const entryId = currentEntryIdRef.current;
    if (!entryId || !context?.user?.fid) {
      console.error("Cannot submit score: missing entryId or fid", { entryId, fid: context?.user?.fid });
      return;
    }
    try {
      const res = await fetch("/api/games/donut-dash/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, score: finalScore, fid: context.user.fid }),
      });
      const data = await res.json();
      if (data.success) {
        setUserRank(data.rank);
        if (data.isPersonalBest) setUserBestScore(finalScore);
      }
      // Refresh skin data after game
      if (address) {
        fetch(`/api/games/skin-market/user-data?address=${address}`).then(r => r.json()).then(data => {
          if (data.stats && data.stats['donut-dash']) setUserStats(data.stats['donut-dash']);
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  }, [context?.user?.fid, address]);

  // Record entry to API and start game (after free tx confirms)
  const recordEntryAndStartGame = useCallback(async (hash: string) => {
    if (!context?.user) return;
    setPlayState('recording');
    try {
      const res = await fetch("/api/games/donut-dash/free-entry", {
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
      args: ["donut-dash"],
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

  // Audio functions
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
      } catch {}
    }
  }, []);

  const playCollectSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, [isMuted]);

  const playCrashSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [isMuted]);

  const startThrustSound = useCallback(() => {
    if (isMuted || !audioContextRef.current || thrustOscRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      thrustOscRef.current = osc;
      thrustGainRef.current = gain;
    } catch {}
  }, [isMuted]);

  const stopThrustSound = useCallback(() => {
    try {
      if (thrustGainRef.current && audioContextRef.current) {
        thrustGainRef.current.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.1);
      }
      if (thrustOscRef.current) {
        thrustOscRef.current.stop(audioContextRef.current?.currentTime ? audioContextRef.current.currentTime + 0.1 : 0);
        thrustOscRef.current = null;
        thrustGainRef.current = null;
      }
    } catch {}
  }, []);

  // Initialize background
  const initBackground = useCallback(() => {
    bgElementsRef.current = [];
    const types = ['beaker', 'flask', 'tube', 'machine', 'tank'];
    for (let i = 0; i < 8; i++) {
      bgElementsRef.current.push({
        x: i * 60 + Math.random() * 40,
        y: CANVAS_HEIGHT - 30,
        type: types[Math.floor(Math.random() * types.length)],
        speed: 0.3 + Math.random() * 0.2,
        height: 50 + Math.random() * 60,
      });
    }
  }, []);

  // Spawn functions
  const spawnObstacle = useCallback(() => {
    const types: ObstacleType[] = ['zapper_h', 'zapper_v', 'zapper_diag'];
    const type = types[Math.floor(Math.random() * types.length)];
    let obstacle: Obstacle;
    if (type === 'zapper_h') {
      obstacle = { x: CANVAS_WIDTH + 20, y: 60 + Math.random() * (CANVAS_HEIGHT - 180), type, width: 80 + Math.random() * 40, height: 12 };
    } else if (type === 'zapper_v') {
      const fromTop = Math.random() > 0.5;
      obstacle = { x: CANVAS_WIDTH + 20, y: fromTop ? 30 : CANVAS_HEIGHT - 30 - (60 + Math.random() * 80), type, width: 12, height: 60 + Math.random() * 80 };
    } else {
      obstacle = { x: CANVAS_WIDTH + 20, y: 60 + Math.random() * (CANVAS_HEIGHT - 200), type, width: 100, height: 100, angle: Math.random() > 0.5 ? 45 : -45 };
    }
    obstaclesRef.current.push(obstacle);
  }, []);

  const spawnCoins = useCallback(() => {
    const patterns = ['line', 'arc', 'wave', 'diagonal', 'zigzag', 'cluster'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const startX = CANVAS_WIDTH + 50;
    const centerY = 80 + Math.random() * (CANVAS_HEIGHT - 200);
    if (pattern === 'line') {
      const count = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) coinsRef.current.push({ x: startX + i * 28, y: centerY, collected: false });
    } else if (pattern === 'arc') {
      for (let i = 0; i < 8; i++) coinsRef.current.push({ x: startX + i * 24, y: centerY + Math.sin((i / 7) * Math.PI) * 50, collected: false });
    } else if (pattern === 'wave') {
      for (let i = 0; i < 8; i++) coinsRef.current.push({ x: startX + i * 24, y: centerY + Math.sin(i * 0.9) * 35, collected: false });
    } else if (pattern === 'diagonal') {
      const goingUp = Math.random() > 0.5;
      for (let i = 0; i < 6; i++) coinsRef.current.push({ x: startX + i * 30, y: centerY + (goingUp ? -i * 20 : i * 20), collected: false });
    } else if (pattern === 'zigzag') {
      for (let i = 0; i < 8; i++) coinsRef.current.push({ x: startX + i * 25, y: centerY + (i % 2 === 0 ? -30 : 30), collected: false });
    } else {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 20 + (i % 3) * 15;
        coinsRef.current.push({ x: startX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, collected: false });
      }
    }
  }, []);

  const spawnGroundBlock = useCallback(() => {
    groundBlocksRef.current.push({ x: CANVAS_WIDTH + 20, width: 30 + Math.random() * 40, height: 25 + Math.random() * 35 });
  }, []);

  const addThrustParticles = useCallback(() => {
    const player = playerRef.current;
    if (!player.isThrusting) return;
    for (let i = 0; i < 2; i++) {
      particlesRef.current.push({
        x: PLAYER_X - PLAYER_SIZE / 2,
        y: player.y + PLAYER_SIZE / 2 + Math.random() * 10,
        vx: -3 - Math.random() * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 20 + Math.random() * 10,
        color: Math.random() > 0.5 ? '#FF6B00' : '#FFD700',
        size: 3 + Math.random() * 4,
      });
    }
  }, []);

  const addCollectParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * 3 + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * 3 + (Math.random() - 0.5) * 2,
        life: 20 + Math.random() * 10,
        color,
        size: 4 + Math.random() * 3,
      });
    }
  }, []);

  // Draw functions
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const intensity = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    
    // Subtle vignette
    const vignette = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT * 0.3, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT * 0.8);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Speed lines (motion blur effect)
    const lineCount = Math.floor(3 + intensity * 12);
    for (let i = 0; i < lineCount; i++) {
      const y = (frameCountRef.current * 2 + i * 47) % CANVAS_HEIGHT;
      const lineLength = 20 + intensity * 60 + Math.random() * 30;
      const alpha = 0.02 + intensity * 0.06;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH, y);
      ctx.lineTo(CANVAS_WIDTH - lineLength, y);
      ctx.stroke();
    }
    
    // Hazard stripes - top and bottom
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
    ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
    
    const stripeOffset = (frameCountRef.current * speed) % 30;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 15, 0); ctx.lineTo(x + 5, 30); ctx.lineTo(x - 10, 30);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, CANVAS_HEIGHT); ctx.lineTo(x + 15, CANVAS_HEIGHT); ctx.lineTo(x + 5, CANVAS_HEIGHT - 30); ctx.lineTo(x - 10, CANVAS_HEIGHT - 30);
      ctx.closePath(); ctx.fill();
    }
    
    // Ground blocks (obstacles)
    groundBlocksRef.current.forEach(block => {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, block.height);
    });
  }, []);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const x = PLAYER_X;
    const y = player.y;
    const tilt = Math.max(-0.4, Math.min(0.4, player.velocity * 0.04));
    const donutColor = getDonutColor();
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    
    // Jetpack - improved metallic design
    const tankX = -PLAYER_SIZE / 2 - 18;
    const tankY = -14;
    
    // Main tank body with metallic gradient
    const tankGradient = ctx.createLinearGradient(tankX, tankY, tankX + 16, tankY);
    tankGradient.addColorStop(0, '#3a3a3a');
    tankGradient.addColorStop(0.3, '#6a6a6a');
    tankGradient.addColorStop(0.5, '#888888');
    tankGradient.addColorStop(0.7, '#6a6a6a');
    tankGradient.addColorStop(1, '#4a4a4a');
    ctx.fillStyle = tankGradient;
    ctx.beginPath();
    ctx.roundRect(tankX, tankY, 16, 32, 4);
    ctx.fill();
    
    // Tank highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(tankX + 2, tankY + 2, 4, 28, 2);
    ctx.fill();
    
    // Tank bands
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(tankX + 1, tankY + 8, 14, 3);
    ctx.fillRect(tankX + 1, tankY + 20, 14, 3);
    
    // Connector to donut
    ctx.fillStyle = '#555';
    ctx.fillRect(tankX + 14, tankY + 10, 8, 6);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(tankX + 20, tankY + 13, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Nozzle
    const nozzleGradient = ctx.createLinearGradient(tankX + 2, tankY + 32, tankX + 14, tankY + 32);
    nozzleGradient.addColorStop(0, '#2a2a2a');
    nozzleGradient.addColorStop(0.5, '#4a4a4a');
    nozzleGradient.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = nozzleGradient;
    ctx.beginPath();
    ctx.moveTo(tankX + 3, tankY + 32);
    ctx.lineTo(tankX + 0, tankY + 40);
    ctx.lineTo(tankX + 16, tankY + 40);
    ctx.lineTo(tankX + 13, tankY + 32);
    ctx.closePath();
    ctx.fill();
    
    // Flames
    if (player.isThrusting) {
      const time = frameCountRef.current * 0.15;
      const flameSize = 22 + Math.sin(time * 4) * 8;
      const flameWidth = 12 + Math.sin(time * 5) * 3;
      
      // Outer flame
      const outerFlame = ctx.createLinearGradient(tankX + 8, tankY + 40, tankX + 8, tankY + 40 + flameSize);
      outerFlame.addColorStop(0, '#FF6B00');
      outerFlame.addColorStop(0.3, '#FF4500');
      outerFlame.addColorStop(0.6, '#FF2200');
      outerFlame.addColorStop(1, 'transparent');
      ctx.fillStyle = outerFlame;
      ctx.beginPath();
      ctx.moveTo(tankX + 8 - flameWidth/2, tankY + 40);
      ctx.quadraticCurveTo(tankX + 8 - flameWidth/3, tankY + 40 + flameSize * 0.6, tankX + 8, tankY + 40 + flameSize);
      ctx.quadraticCurveTo(tankX + 8 + flameWidth/3, tankY + 40 + flameSize * 0.6, tankX + 8 + flameWidth/2, tankY + 40);
      ctx.fill();
      
      // Inner flame (white/yellow core)
      const innerSize = flameSize * 0.6;
      const innerFlame = ctx.createLinearGradient(tankX + 8, tankY + 40, tankX + 8, tankY + 40 + innerSize);
      innerFlame.addColorStop(0, '#FFFFFF');
      innerFlame.addColorStop(0.3, '#FFFF00');
      innerFlame.addColorStop(0.6, '#FFA500');
      innerFlame.addColorStop(1, 'transparent');
      ctx.fillStyle = innerFlame;
      ctx.beginPath();
      ctx.moveTo(tankX + 8 - flameWidth/4, tankY + 40);
      ctx.quadraticCurveTo(tankX + 8 - flameWidth/6, tankY + 40 + innerSize * 0.5, tankX + 8, tankY + 40 + innerSize);
      ctx.quadraticCurveTo(tankX + 8 + flameWidth/6, tankY + 40 + innerSize * 0.5, tankX + 8 + flameWidth/4, tankY + 40);
      ctx.fill();
    }
    
    // Donut
    ctx.shadowColor = donutColor;
    ctx.shadowBlur = player.isThrusting ? 25 : 15;
    const [h, s, l] = hexToHsl(donutColor);
    const donutGradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, PLAYER_SIZE / 2);
    donutGradient.addColorStop(0, hslToHex(h, s, Math.min(100, l + 20)));
    donutGradient.addColorStop(0.5, donutColor);
    donutGradient.addColorStop(1, hslToHex(h, s, Math.max(0, l - 20)));
    ctx.fillStyle = donutGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Hole
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }, [getDonutColor]);

  const drawObstacles = useCallback((ctx: CanvasRenderingContext2D) => {
    const time = frameCountRef.current * 0.1;
    
    obstaclesRef.current.forEach(obstacle => {
      ctx.save();
      
      let x1: number, y1: number, x2: number, y2: number;
      
      if (obstacle.type === 'zapper_h') {
        x1 = obstacle.x;
        y1 = obstacle.y + obstacle.height / 2;
        x2 = obstacle.x + obstacle.width;
        y2 = obstacle.y + obstacle.height / 2;
      } else if (obstacle.type === 'zapper_v') {
        x1 = obstacle.x + obstacle.width / 2;
        y1 = obstacle.y;
        x2 = obstacle.x + obstacle.width / 2;
        y2 = obstacle.y + obstacle.height;
      } else if (obstacle.type === 'zapper_diag' && obstacle.angle) {
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        const angleRad = (obstacle.angle * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        x1 = centerX - halfLength * Math.cos(angleRad);
        y1 = centerY - halfLength * Math.sin(angleRad);
        x2 = centerX + halfLength * Math.cos(angleRad);
        y2 = centerY + halfLength * Math.sin(angleRad);
      } else {
        ctx.restore();
        return;
      }
      
      // Electrode nodes at ends
      const nodeRadius = 6;
      ctx.fillStyle = '#2a2a2a';
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x1, y1, nodeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x2, y2, nodeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Inner node glow
      ctx.fillStyle = '#FF4400';
      ctx.beginPath();
      ctx.arc(x1, y1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer glow
      ctx.shadowColor = '#FF3300';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Mid glow
      ctx.shadowBlur = 15;
      ctx.strokeStyle = 'rgba(255, 150, 0, 0.5)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Electric beam with flickering jagged effect
      ctx.shadowColor = '#FFAA00';
      ctx.shadowBlur = 10;
      const flicker = 0.7 + Math.sin(time * 8 + obstacle.x) * 0.3;
      ctx.strokeStyle = `rgba(255, 200, 0, ${flicker})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      
      // Create jagged electric effect
      const segments = 8;
      const dx = (x2 - x1) / segments;
      const dy = (y2 - y1) / segments;
      const perpX = -dy / Math.sqrt(dx*dx + dy*dy) * 4;
      const perpY = dx / Math.sqrt(dx*dx + dy*dy) * 4;
      
      for (let i = 1; i < segments; i++) {
        const jitter = Math.sin(time * 15 + i * 2 + obstacle.x * 0.1) * (i % 2 === 0 ? 1 : -1);
        ctx.lineTo(
          x1 + dx * i + perpX * jitter,
          y1 + dy * i + perpY * jitter
        );
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Core white line
      ctx.shadowBlur = 5;
      ctx.strokeStyle = `rgba(255, 255, 255, ${flicker * 0.8})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }, []);

  const drawCoins = useCallback((ctx: CanvasRenderingContext2D, currentScore: number) => {
    const colors = currentScore >= 100 
      ? ['#FFFFFF', '#F0F0F0', '#E8E8E8', '#FFFFFF', '#F5F5F5', '#FFFFFF', '#EEEEEE']
      : ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      ctx.save();
      ctx.translate(coin.x, coin.y);
      const float = Math.sin(frameCountRef.current * 0.12 + coin.x * 0.05) * 4;
      ctx.translate(0, float);
      const color = colors[Math.floor(coin.x / 40) % colors.length];
      ctx.shadowColor = currentScore >= 100 ? '#FFFFFF' : color;
      ctx.shadowBlur = currentScore >= 100 ? 12 : 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-9, -4, 18, 8, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }, []);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;
      if (particle.life <= 0) { particlesRef.current.splice(index, 1); return; }
      ctx.globalAlpha = particle.life / 30;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (particle.life / 30), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }, []);

  // Collision helpers
  const pointToLineDistance = useCallback((px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
  }, []);

  const checkCollisions = useCallback((): boolean => {
    const player = playerRef.current;
    const playerRadius = PLAYER_SIZE / 2 - 5;
    if (player.y - playerRadius < 30 || player.y + playerRadius > CANVAS_HEIGHT - 30) return true;
    
    for (const obstacle of obstaclesRef.current) {
      if (obstacle.type === 'zapper_diag' && obstacle.angle) {
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        const angleRad = (obstacle.angle * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        const x1 = centerX - halfLength * Math.cos(angleRad);
        const y1 = centerY - halfLength * Math.sin(angleRad);
        const x2 = centerX + halfLength * Math.cos(angleRad);
        const y2 = centerY + halfLength * Math.sin(angleRad);
        if (pointToLineDistance(PLAYER_X, player.y, x1, y1, x2, y2) < playerRadius + 10) return true;
      } else if (obstacle.type === 'zapper_h') {
        if (pointToLineDistance(PLAYER_X, player.y, obstacle.x, obstacle.y + obstacle.height / 2, obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2) < playerRadius + 10) return true;
      } else if (obstacle.type === 'zapper_v') {
        if (pointToLineDistance(PLAYER_X, player.y, obstacle.x + obstacle.width / 2, obstacle.y, obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height) < playerRadius + 10) return true;
      }
    }
    return false;
  }, [pointToLineDistance]);

  const checkCoins = useCallback(() => {
    const player = playerRef.current;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      const dx = PLAYER_X - coin.x;
      const dy = player.y - coin.y;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_SIZE / 2 + 12) {
        coin.collected = true;
        coinsCollectedRef.current += 1;
        playCollectSound();
        addCollectParticles(coin.x, coin.y, colors[Math.floor(coin.x / 40) % colors.length]);
      }
    });
  }, [playCollectSound, addCollectParticles]);

  const checkGroundBlocks = useCallback((): boolean => {
    const player = playerRef.current;
    for (const block of groundBlocksRef.current) {
      if (PLAYER_X + PLAYER_SIZE / 2 - 5 > block.x && PLAYER_X - PLAYER_SIZE / 2 + 5 < block.x + block.width && player.y + PLAYER_SIZE / 2 - 5 > CANVAS_HEIGHT - 30 - block.height) return true;
    }
    return false;
  }, []);

  // Game loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    const now = performance.now();
    const delta = Math.min((now - lastFrameTimeRef.current) / 16.667, 2);
    lastFrameTimeRef.current = now;
    frameCountRef.current++;
    
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    
    const hasStarted = hasStartedFlyingRef.current;
    if (hasStarted) speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta, MAX_SPEED);
    const speed = hasStarted ? speedRef.current : 0;
    
    setScore(coinsCollectedRef.current);
    
    const player = playerRef.current;
    if (hasStarted) {
      if (player.isThrusting) player.velocity += THRUST * delta;
      else player.velocity += GRAVITY * delta;
      player.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, player.velocity));
      player.y += player.velocity * delta;
      player.y = Math.max(30 + PLAYER_SIZE / 2, Math.min(CANVAS_HEIGHT - 30 - PLAYER_SIZE / 2, player.y));
    }
    
    if (hasStarted) {
      obstaclesRef.current.forEach(o => { o.x -= speed * delta; });
      obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.width > -50);
      const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
      if (!lastObs || lastObs.x < CANVAS_WIDTH - 200 - Math.random() * 150) spawnObstacle();
      
      coinsRef.current.forEach(c => { c.x -= speed * delta; });
      coinsRef.current = coinsRef.current.filter(c => c.x > -50);
      if (coinsRef.current.length < 25 && Math.random() < 0.04) spawnCoins();
      
      if (coinsCollectedRef.current >= 100) {
        groundBlocksRef.current.forEach(b => { b.x -= speed * delta; });
        groundBlocksRef.current = groundBlocksRef.current.filter(b => b.x + b.width > -20);
        const lastBlock = groundBlocksRef.current[groundBlocksRef.current.length - 1];
        if (!lastBlock || lastBlock.x < CANVAS_WIDTH - 150 - Math.random() * 100) {
          if (Math.random() < 0.3) spawnGroundBlock();
        }
      }
    }
    
    if (player.isThrusting && frameCountRef.current % 2 === 0) addThrustParticles();
    
    drawBackground(ctx, hasStarted ? speed : 0.5);
    drawParticles(ctx);
    drawCoins(ctx, coinsCollectedRef.current);
    drawObstacles(ctx);
    drawPlayer(ctx);
    
    if (!hasStarted) {
      const pulseScale = 1 + Math.sin(frameCountRef.current * 0.1) * 0.15;
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
      ctx.globalAlpha = 0.8;
      ctx.scale(pulseScale, pulseScale);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
      ctx.scale(1/pulseScale, 1/pulseScale);
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('TAP TO START', 0, 55);
      ctx.restore();
    }
    
    if (hasStarted) {
      checkCoins();
      if (checkCollisions() || checkGroundBlocks()) {
        const finalScore = coinsCollectedRef.current;
        playCrashSound();
        stopThrustSound();
        gameActiveRef.current = false;
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        setGameState("gameover");
        setHighScore(prev => Math.max(prev, finalScore));
        submitScore(finalScore);
        fetchLeaderboard();
        
        if (finalScore > 0 && address) {
          fetch('/api/chat/game-announce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerAddress: address,
              username: context?.user?.username || null,
              pfpUrl: context?.user?.pfpUrl || null,
              gameId: 'donut-dash',
              gameName: 'Donut Dash',
              score: finalScore,
              skinId: selectedSkin.id,
              skinColor: selectedSkin.frostingColor,
            }),
          }).catch(console.error);
        }
        return;
      }
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${coinsCollectedRef.current}`, 15, 58);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBackground, drawPlayer, drawObstacles, drawCoins, drawParticles, checkCollisions, checkCoins, checkGroundBlocks, spawnObstacle, spawnCoins, spawnGroundBlock, addThrustParticles, playCrashSound, stopThrustSound, submitScore, fetchLeaderboard, address, context, selectedSkin]);

  const handleThrustStart = useCallback(() => {
    if (!gameActiveRef.current) return;
    hasStartedFlyingRef.current = true;
    playerRef.current.isThrusting = true;
    startThrustSound();
  }, [startThrustSound]);

  const handleThrustEnd = useCallback(() => {
    playerRef.current.isThrusting = false;
    stopThrustSound();
  }, [stopThrustSound]);

  const startGame = useCallback(() => {
    initAudioContext();
    initBackground();
    const groundY = CANVAS_HEIGHT - 30 - PLAYER_SIZE / 2 - 10;
    playerRef.current = { y: groundY, velocity: 0, isThrusting: false };
    obstaclesRef.current = [];
    coinsRef.current = [];
    particlesRef.current = [];
    groundBlocksRef.current = [];
    speedRef.current = BASE_SPEED;
    coinsCollectedRef.current = 0;
    frameCountRef.current = 0;
    hasStartedFlyingRef.current = false;
    setScore(0);
    setGameState("playing");
    lastFrameTimeRef.current = performance.now();
    gameActiveRef.current = true;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, initAudioContext, initBackground]);

  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🍩🚀 I collected ${score} sprinkles in Donut Dash!`;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`);
    } catch {
      try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {}
    }
  }, [score]);

  // Menu animation
  useEffect(() => {
    if (gameState !== "menu" && gameState !== "gameover") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let animationId: number;
    const startTime = performance.now();
    const draw = () => {
      const time = (performance.now() - startTime) / 1000;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
      ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      const stripeOffset = (time * 60) % 30;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 15, 0); ctx.lineTo(x + 5, 30); ctx.lineTo(x - 10, 30); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, CANVAS_HEIGHT); ctx.lineTo(x + 15, CANVAS_HEIGHT); ctx.lineTo(x + 5, CANVAS_HEIGHT - 30); ctx.lineTo(x - 10, CANVAS_HEIGHT - 30); ctx.closePath(); ctx.fill();
      }
      
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#FF69B4'; ctx.shadowBlur = 15;
      ctx.fillText('DONUT', CANVAS_WIDTH / 2, 90);
      ctx.fillText('DASH', CANVAS_WIDTH / 2, 130);
      ctx.shadowBlur = 0;
      
      const bounceY = Math.sin(time * 3) * 10;
      const donutY = (gameState === "gameover" ? 180 : 210) + bounceY;
      const donutColor = getDonutColor();
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, donutY);
      ctx.shadowColor = donutColor; ctx.shadowBlur = 25;
      ctx.fillStyle = donutColor;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 24px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 260);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 32px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 295);
        ctx.fillStyle = '#888'; ctx.font = '12px monospace';
        ctx.fillText('sprinkles collected', CANVAS_WIDTH / 2, 318);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace';
        ctx.fillText('Hold to fly • Release to fall', CANVAS_WIDTH / 2, 290);
      }
      animationId = requestAnimationFrame(draw);
    };
    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, score, getDonutColor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleThrustStart(); } };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') handleThrustEnd(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleThrustStart, handleThrustEnd]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;
  const isPlayPending = playState === 'confirming' || playState === 'recording' || isPending || isConfirming;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent !important; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-3 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        <div className="flex items-center justify-between mb-2 px-1">
          <h1 className="text-xl font-bold tracking-wide">DONUT DASH</h1>
          {context?.user && (
            <div className="flex items-center gap-2 rounded-full bg-black px-2 py-0.5">
              <Avatar className="h-6 w-6 border border-zinc-800">
                <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                <AvatarFallback className="bg-zinc-800 text-white text-[10px]">{initialsFrom(userDisplayName)}</AvatarFallback>
              </Avatar>
              <div className="text-xs font-bold">{userDisplayName}</div>
            </div>
          )}
        </div>
        
        <button
          onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
          className="relative w-full mb-3 px-4 py-3 bg-gradient-to-br from-zinc-900/80 to-zinc-800/60 border border-zinc-700/50 rounded-xl transition-all active:scale-[0.98] hover:border-zinc-600 group"
          style={{ minHeight: '70px' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-4 h-4 rounded-full" />
                <span className="text-[10px] text-zinc-400 font-medium">Weekly Prize Pool</span>
              </div>
              <span className="text-2xl font-bold text-green-400">${prizeInfo.totalPrize} USDC</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-zinc-500 group-hover:text-zinc-300 transition-colors">
                <span className="text-[10px]">View Leaderboard</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Resets in <span className="font-bold text-zinc-300">{resetCountdown}</span></span>
              </div>
            </div>
          </div>
        </button>
        
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={SCALED_WIDTH}
              height={SCALED_HEIGHT}
              className="rounded-2xl border border-zinc-800 w-full h-full select-none"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => { e.preventDefault(); if (gameState === "playing") handleThrustStart(); }}
              onPointerUp={(e) => { e.preventDefault(); handleThrustEnd(); }}
              onPointerLeave={handleThrustEnd}
              onPointerCancel={handleThrustEnd}
              onContextMenu={(e) => e.preventDefault()}
            />
            
            {gameState === "playing" && (
              <div 
                className="absolute inset-0 z-10 select-none"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => { e.preventDefault(); handleThrustStart(); }}
                onPointerUp={(e) => { e.preventDefault(); handleThrustEnd(); }}
                onPointerLeave={handleThrustEnd}
                onPointerCancel={handleThrustEnd}
              />
            )}
            
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500">
                      <Share2 className="w-3 h-3" /><span>Share</span>
                    </button>
                  )}
                  {errorMessage && <p className="text-red-400 text-xs">{errorMessage}</p>}
                  
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <span className="text-xs text-zinc-400">Gas only (~$0.001)</span>
                  </div>
                  
                  <button 
                    onClick={handlePlay} 
                    disabled={isPlayPending}
                    className="flex items-center gap-2 px-6 py-2 bg-green-500 text-black font-bold rounded-full hover:bg-green-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPlayPending ? (
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Confirming...</span></>
                    ) : (
                      <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>
                    )}
                  </button>
                  <p className="text-zinc-500 text-[10px]">Games this week: {gamesPlayedThisWeek}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20"><p className="text-zinc-600 text-[10px]">Hold to fly</p></div>}
          </div>
        </div>
        
        {(gameState === "menu" || gameState === "gameover") && (
          <div className="py-4 flex items-center justify-center gap-2">
            <button onClick={() => setShowSkins(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <Palette className="w-3 h-3 text-zinc-400" /><span className="text-xs">Skins</span>
            </button>
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs whitespace-nowrap">How to Play</span>
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>
              {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}
              <span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          </div>
        )}
        
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-zinc-400" /><span className="font-bold">Donut Dash Skins</span></div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                {DASH_SKINS.map((skin) => {
                  const isUnlocked = unlockedSkins.includes(skin.id);
                  const isSelected = selectedSkin.id === skin.id;
                  const canClaim = !isUnlocked && canClaimSkin(skin);
                  const progress = getSkinProgress(skin);
                  const isDefault = skin.id === 'default';
                  return (
                    <button key={skin.id} onClick={() => { if (isUnlocked) handleSelectSkin(skin); else if (canClaim) handleClaimSkin(skin); }} disabled={!isUnlocked && !canClaim} className={`relative p-3 rounded-xl border-2 transition-all ${isSelected ? "border-white bg-zinc-800" : isUnlocked ? "border-zinc-700 hover:border-zinc-500" : canClaim ? "border-green-500/50 hover:border-green-500 bg-green-500/10" : "border-zinc-800 opacity-60"}`}>
                      <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: isUnlocked || canClaim ? skin.frostingColor : '#3f3f46' }}>
                        <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700" /></div>
                        {!isUnlocked && !canClaim && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"><Lock className="w-4 h-4 text-zinc-500" /></div>}
                      </div>
                      <p className="text-[10px] font-bold truncate text-center">{skin.name}</p>
                      {isSelected && <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /></div>}
                      {!isUnlocked && !isDefault && isPremium && (
                        <div className="mt-1">
                          {canClaim ? <span className="text-[8px] text-green-400 font-bold">CLAIM!</span> : (
                            <><div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%`, backgroundColor: skin.frostingColor }} /></div><p className="text-[8px] text-zinc-500 text-center mt-0.5">{progress.current}/{progress.target}</p></>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => { setShowSkins(false); window.location.href = "/games/skin-market"; }} className="w-full flex items-center justify-center gap-2 py-2 text-amber-400 hover:text-amber-300">
                  <Crown className="w-4 h-4" /><span className="text-sm font-bold">{isPremium ? 'View All Skins' : 'Get Premium'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {showHelp && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div>
                <button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-green-400" />Free to Play!</h3>
                  <p className="text-xs text-zinc-400">Donut Dash is completely free! You only pay gas (~$0.001 on Base) to register your game onchain.</p>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-yellow-400" />Gameplay</h3>
                  <p className="text-xs text-zinc-400">Hold the screen to fly up with your jetpack. Release to fall. Navigate through the facility avoiding zappers and collecting sprinkles!</p>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-green-400" />Weekly USDC Prizes</h3>
                  <p className="text-xs text-zinc-400">Top 10 players split ${prizeInfo.totalPrize} USDC every Friday!</p>
                  <ul className="text-xs text-zinc-400 mt-2 space-y-1 pl-4">
                    {prizeInfo.prizeStructure.slice(0, 5).map(p => (
                      <li key={p.rank}>• {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}th`}: <span className="text-green-400">${p.amount}</span></li>
                    ))}
                    <li>• 6th-10th: $0.40 - $0.10</li>
                  </ul>
                </div>
              </div>
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-green-500 text-black font-bold rounded-full hover:bg-green-400">Got it!</button>
              </div>
            </div>
          </div>
        )}
        
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-green-400" /><span className="font-bold">Weekly Leaderboard</span></div>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Prize Pool</span>
                  <span className="text-sm font-bold text-green-400">${prizeInfo.totalPrize} USDC</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-zinc-500">No scores yet!</p>
                    <p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p>
                  </div>
                ) : leaderboard.map((entry) => {
                  const prize = prizeInfo.prizeStructure.find(p => p.rank === entry.rank);
                  return (
                    <div key={entry.fid} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-green-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-green-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🍩</div>}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{entry.displayName || entry.username || `fid:${entry.fid}`}</span>
                        {prize && <span className="text-xs text-green-400">+${prize.amount}</span>}
                      </div>
                      <span className="font-bold text-sm">{entry.score}</span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-500 text-center">Prizes distributed every Friday in USDC</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}