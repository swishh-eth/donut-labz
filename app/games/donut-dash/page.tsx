"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Play, Share2, X, HelpCircle, Volume2, VolumeX, Trophy, Zap, ChevronRight, Clock, Palette, Lock, Crown, Sparkles, Check } from "lucide-react";
import { parseUnits } from "viem";

// Contract addresses
const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const PRIZE_POOL_CONTRACT = "0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40" as const;

// ABIs
const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const PRIZE_POOL_ABI = [
  { inputs: [{ name: "amount", type: "uint256" }], name: "payEntry", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "getPrizePool", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "currentWeek", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
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
type PaymentState = 'idle' | 'fetching' | 'approving' | 'paying' | 'recording' | 'error';

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

// Calculate time until daily cost reset (6PM EST / 11PM UTC)
function getTimeUntilCostReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  const nextReset = new Date(utcNow);
  nextReset.setUTCHours(23, 0, 0, 0);
  if (utcNow.getUTCHours() >= 23) nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  const diff = nextReset.getTime() - utcNow.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Prize distribution percentages for top 10
const PRIZE_DISTRIBUTION = [30, 20, 15, 10, 8, 6, 5, 3, 2, 1];

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
  const [costResetCountdown, setCostResetCountdown] = useState<string>(getTimeUntilCostReset());
  
  // Skin state
  const [isPremium, setIsPremium] = useState(false);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>(['default']);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(DEFAULT_SKIN);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  const [userStats, setUserStats] = useState<{ gamesPlayed: number; highScore: number; totalScore: number }>({ gamesPlayed: 0, highScore: 0, totalScore: 0 });
  
  // Payment state
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [entryFee, setEntryFee] = useState<bigint>(parseUnits("1", 18));
  const [entryFeeFormatted, setEntryFeeFormatted] = useState("1.0");
  const [playCount, setPlayCount] = useState(0);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userBestScore, setUserBestScore] = useState(0);
  
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

  // Contract reads
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, PRIZE_POOL_CONTRACT] : undefined,
  });

  const { data: balance } = useReadContract({
    address: DONUT_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: prizePool, refetch: refetchPrizePool } = useReadContract({
    address: PRIZE_POOL_CONTRACT,
    abi: PRIZE_POOL_ABI,
    functionName: "getPrizePool",
  });

  // Contract writes
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Update reset countdowns every minute
  useEffect(() => {
    const updateCountdown = () => {
      setResetCountdown(getTimeUntilReset());
      setCostResetCountdown(getTimeUntilCostReset());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
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

  // Fetch entry fee from API
  const fetchEntryFee = useCallback(async () => {
    if (!context?.user?.fid) return;
    try {
      const res = await fetch(`/api/games/donut-dash/pay-entry?fid=${context.user.fid}`);
      const data = await res.json();
      if (data.success) {
        setEntryFee(BigInt(data.entryFee));
        setEntryFeeFormatted(data.entryFeeFormatted);
        setPlayCount(data.playCount);
        setCurrentWeek(data.week);
      }
    } catch (error) {
      console.error("Failed to fetch entry fee:", error);
    }
  }, [context?.user?.fid]);

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

  // Record entry to API and start game
  const recordEntryAndStartGame = useCallback(async (hash: string) => {
    if (!context?.user) return;
    setPaymentState('recording');
    try {
      const res = await fetch("/api/games/donut-dash/pay-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context.user.fid,
          walletAddress: address,
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl,
          txHash: hash,
          entryFee: entryFee.toString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentEntryId(data.entryId);
        currentEntryIdRef.current = data.entryId;
        setPaymentState('idle');
        resetWrite();
        refetchPrizePool();
        startGame();
      } else {
        setErrorMessage(data.error || "Failed to record entry");
        setPaymentState('error');
      }
    } catch (error) {
      console.error("Failed to record entry:", error);
      setErrorMessage("Failed to record entry");
      setPaymentState('error');
    }
  }, [context?.user, address, entryFee, resetWrite, refetchPrizePool]);

  // Handle payment flow
  const handlePayment = useCallback(async () => {
    if (!address || !context?.user?.fid) {
      setErrorMessage("Please connect your wallet");
      return;
    }
    if (!balance || balance < entryFee) {
      setErrorMessage("Insufficient DONUT balance");
      setPaymentState('error');
      return;
    }
    setErrorMessage(null);
    setPaymentState('fetching');
    await fetchEntryFee();
    const currentAllowance = allowance || 0n;
    if (currentAllowance < entryFee) {
      setPaymentState('approving');
      writeContract({
        address: DONUT_TOKEN,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PRIZE_POOL_CONTRACT, entryFee * 100n],
      });
    } else {
      setPaymentState('paying');
      writeContract({
        address: PRIZE_POOL_CONTRACT,
        abi: PRIZE_POOL_ABI,
        functionName: "payEntry",
        args: [entryFee],
      });
    }
  }, [address, context?.user?.fid, balance, entryFee, allowance, fetchEntryFee, writeContract]);

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && txHash) {
      if (paymentState === 'approving') {
        refetchAllowance();
        setPaymentState('paying');
        resetWrite();
        setTimeout(() => {
          writeContract({
            address: PRIZE_POOL_CONTRACT,
            abi: PRIZE_POOL_ABI,
            functionName: "payEntry",
            args: [entryFee],
          });
        }, 500);
      } else if (paymentState === 'paying') {
        recordEntryAndStartGame(txHash);
      }
    }
  }, [isConfirmed, txHash, paymentState, entryFee, refetchAllowance, resetWrite, writeContract, recordEntryAndStartGame]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      console.error("Write error:", writeError);
      setPaymentState('error');
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
      fetchEntryFee();
      fetchLeaderboard();
    }
  }, [context?.user?.fid, fetchEntryFee, fetchLeaderboard]);

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
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const intensity = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, `rgba(40, 20, 60, ${0.3 + intensity * 0.2})`);
    gradient.addColorStop(0.5, 'rgba(15, 15, 20, 0)');
    gradient.addColorStop(1, `rgba(40, 20, 60, ${0.3 + intensity * 0.2})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const lineCount = Math.floor(5 + intensity * 15);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + intensity * 0.05})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < lineCount; i++) {
      const y = (frameCountRef.current * 2 + i * 47) % CANVAS_HEIGHT;
      const lineLength = 30 + intensity * 50 + Math.random() * 30;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH, y);
      ctx.lineTo(CANVAS_WIDTH - lineLength, y);
      ctx.stroke();
    }
    
    const floorY = CANVAS_HEIGHT - 30;
    bgElementsRef.current.forEach(el => {
      el.x -= speed * el.speed;
      if (el.x < -60) { el.x = CANVAS_WIDTH + 60; el.height = 50 + Math.random() * 60; }
      const h = el.height || 60;
      ctx.fillStyle = 'rgba(35, 35, 40, 0.9)';
      if (el.type === 'beaker') {
        ctx.beginPath();
        ctx.moveTo(el.x - 12, floorY);
        ctx.lineTo(el.x - 8, floorY - h + 8);
        ctx.lineTo(el.x - 12, floorY - h);
        ctx.lineTo(el.x + 12, floorY - h);
        ctx.lineTo(el.x + 8, floorY - h + 8);
        ctx.lineTo(el.x + 12, floorY);
        ctx.closePath();
        ctx.fill();
      } else if (el.type === 'flask') {
        ctx.beginPath();
        ctx.arc(el.x, floorY - h * 0.4, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(el.x - 5, floorY - h, 10, h * 0.5);
      } else if (el.type === 'tube') {
        ctx.fillRect(el.x - 15, floorY - 15, 30, 15);
        ctx.fillRect(el.x - 10, floorY - h, 6, h - 10);
        ctx.fillRect(el.x + 4, floorY - h + 10, 6, h - 20);
      } else if (el.type === 'machine') {
        ctx.fillRect(el.x - 18, floorY - h, 36, h);
      } else {
        ctx.fillRect(el.x - 15, floorY - h, 30, h);
        ctx.beginPath();
        ctx.ellipse(el.x, floorY - h, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
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
    
    groundBlocksRef.current.forEach(block => {
      ctx.shadowColor = 'rgba(255, 100, 100, 0.3)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, block.height);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#71717a';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, 4);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(block.x + block.width - 4, CANVAS_HEIGHT - 30 - block.height, 4, block.height);
    });
  }, []);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const x = PLAYER_X;
    const y = player.y;
    const tilt = Math.max(-0.4, Math.min(0.4, player.velocity * 0.04));
    const donutColor = getDonutColor();
    const skin = selectedSkin;
    
    // Motion trail when thrusting
    if (player.isThrusting) {
      for (let i = 3; i > 0; i--) {
        const [h, s, l] = hexToHsl(donutColor);
        ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${0.1 * (4 - i)})`;
        ctx.beginPath();
        ctx.arc(x - i * 8, y, PLAYER_SIZE / 2 - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    
    // Jetpack
    const tankX = -PLAYER_SIZE / 2 - 16;
    const tankY = -12;
    const tankWidth = 14;
    const tankHeight = 28;
    
    const tankGradient = ctx.createLinearGradient(tankX, 0, tankX + tankWidth, 0);
    tankGradient.addColorStop(0, '#3a3a3a');
    tankGradient.addColorStop(0.3, '#6a6a6a');
    tankGradient.addColorStop(0.7, '#5a5a5a');
    tankGradient.addColorStop(1, '#2a2a2a');
    
    ctx.fillStyle = tankGradient;
    ctx.beginPath();
    ctx.roundRect(tankX, tankY, tankWidth, tankHeight, 3);
    ctx.fill();
    
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.roundRect(tankX + 2, tankY + 2, tankWidth - 4, tankHeight - 4, 2);
    ctx.fill();
    
    ctx.fillStyle = '#888';
    ctx.fillRect(tankX + 2, tankY + 2, 2, tankHeight - 4);
    
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(tankX + 3, tankY + 8);
    ctx.lineTo(tankX + tankWidth - 3, tankY + 8);
    ctx.moveTo(tankX + 3, tankY + 14);
    ctx.lineTo(tankX + tankWidth - 3, tankY + 14);
    ctx.moveTo(tankX + 3, tankY + 20);
    ctx.lineTo(tankX + tankWidth - 3, tankY + 20);
    ctx.stroke();
    
    const connectorX = tankX + tankWidth - 2;
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(connectorX, -4, 8, 10);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(connectorX + 4, 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(tankX + 2, tankY + tankHeight);
    ctx.lineTo(tankX - 2, tankY + tankHeight + 6);
    ctx.lineTo(tankX + tankWidth + 2, tankY + tankHeight + 6);
    ctx.lineTo(tankX + tankWidth - 2, tankY + tankHeight);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(tankX + 3, tankY + tankHeight + 1);
    ctx.lineTo(tankX, tankY + tankHeight + 5);
    ctx.lineTo(tankX + tankWidth, tankY + tankHeight + 5);
    ctx.lineTo(tankX + tankWidth - 3, tankY + tankHeight + 1);
    ctx.closePath();
    ctx.fill();
    
    // Flames
    if (player.isThrusting) {
      const flameBaseY = tankY + tankHeight + 6;
      const flameSize = 18 + Math.sin(frameCountRef.current * 0.6) * 10;
      const flameCenterX = tankX + tankWidth / 2;
      
      const outerFlameGradient = ctx.createLinearGradient(flameCenterX, flameBaseY, flameCenterX, flameBaseY + flameSize);
      outerFlameGradient.addColorStop(0, '#FFD700');
      outerFlameGradient.addColorStop(0.3, '#FF8C00');
      outerFlameGradient.addColorStop(0.6, '#FF4500');
      outerFlameGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
      
      ctx.fillStyle = outerFlameGradient;
      ctx.beginPath();
      ctx.moveTo(tankX - 1, flameBaseY);
      ctx.quadraticCurveTo(flameCenterX - 8, flameBaseY + flameSize * 0.6, flameCenterX, flameBaseY + flameSize);
      ctx.quadraticCurveTo(flameCenterX + 8, flameBaseY + flameSize * 0.6, tankX + tankWidth + 1, flameBaseY);
      ctx.closePath();
      ctx.fill();
      
      const innerFlameSize = flameSize * 0.6;
      const innerFlameGradient = ctx.createLinearGradient(flameCenterX, flameBaseY, flameCenterX, flameBaseY + innerFlameSize);
      innerFlameGradient.addColorStop(0, '#FFFFFF');
      innerFlameGradient.addColorStop(0.3, '#FFFACD');
      innerFlameGradient.addColorStop(0.6, '#FFD700');
      innerFlameGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      
      ctx.fillStyle = innerFlameGradient;
      ctx.beginPath();
      ctx.moveTo(tankX + 3, flameBaseY);
      ctx.quadraticCurveTo(flameCenterX - 4, flameBaseY + innerFlameSize * 0.5, flameCenterX, flameBaseY + innerFlameSize);
      ctx.quadraticCurveTo(flameCenterX + 4, flameBaseY + innerFlameSize * 0.5, tankX + tankWidth - 3, flameBaseY);
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowColor = '#FF6B00';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(flameCenterX, flameBaseY + 5, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 100, 0.5)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    
    // Donut with skin color
    let glowIntensity = player.isThrusting ? 25 : 15;
    if (skin.animated && (skin.animationType === 'glow' || skin.animationType === 'pulse')) {
      glowIntensity = 20 + Math.sin(Date.now() / 200) * 10;
    }
    
    ctx.shadowColor = donutColor;
    ctx.shadowBlur = glowIntensity;
    
    const [h, s, l] = hexToHsl(donutColor);
    const lightColor = hslToHex(h, s, Math.min(100, l + 20));
    const darkColor = hslToHex(h, s, Math.max(0, l - 20));
    const darkerColor = hslToHex(h, s, Math.max(0, l - 35));
    
    const donutGradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, PLAYER_SIZE / 2);
    donutGradient.addColorStop(0, lightColor);
    donutGradient.addColorStop(0.4, donutColor);
    donutGradient.addColorStop(0.8, darkColor);
    donutGradient.addColorStop(1, darkerColor);
    ctx.fillStyle = donutGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Sparkle particles for sparkle animation
    if (skin.animated && skin.animationType === 'sparkle') {
      const time = Date.now();
      for (let i = 0; i < 4; i++) {
        const angle = (time / 500 + i * Math.PI / 2) % (Math.PI * 2);
        const dist = PLAYER_SIZE / 2 + 5 + Math.sin(time / 200 + i) * 3;
        const sparkleX = Math.cos(angle) * dist;
        const sparkleY = Math.sin(angle) * dist;
        const sparkleSize = 2 + Math.sin(time / 150 + i * 2) * 1;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(time / 100 + i) * 0.3})`;
        ctx.fill();
      }
    }
    
    // Donut hole
    const holeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, PLAYER_SIZE / 5);
    holeGradient.addColorStop(0, '#0a0a0a');
    holeGradient.addColorStop(1, '#1f1f1f');
    ctx.fillStyle = holeGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(-6, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Sprinkles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.save();
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.roundRect(8, -2, 4, 2, 1);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.roundRect(-4, 10, 4, 2, 1);
    ctx.fill();
    ctx.restore();
    
    ctx.restore();
  }, [getDonutColor, selectedSkin]);

  const drawObstacles = useCallback((ctx: CanvasRenderingContext2D) => {
    obstaclesRef.current.forEach(obstacle => {
      ctx.save();
      if (obstacle.type === 'zapper_diag' && obstacle.angle) {
        ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
        ctx.rotate((obstacle.angle * Math.PI) / 180);
        ctx.translate(-obstacle.width / 2, -obstacle.height / 2);
        ctx.shadowColor = 'rgba(255, 100, 0, 0.5)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, obstacle.height / 2);
        ctx.lineTo(obstacle.width, obstacle.height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, obstacle.height / 2, 6, 0, Math.PI * 2);
        ctx.arc(obstacle.width, obstacle.height / 2, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowColor = 'rgba(255, 100, 0, 0.5)';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 6;
        ctx.beginPath();
        if (obstacle.type === 'zapper_h') {
          ctx.moveTo(obstacle.x, obstacle.y + obstacle.height / 2);
          ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2);
        } else {
          ctx.moveTo(obstacle.x + obstacle.width / 2, obstacle.y);
          ctx.lineTo(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFD700';
        if (obstacle.type === 'zapper_h') {
          ctx.beginPath();
          ctx.arc(obstacle.x, obstacle.y + obstacle.height / 2, 8, 0, Math.PI * 2);
          ctx.arc(obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2, 8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(obstacle.x + obstacle.width / 2, obstacle.y, 8, 0, Math.PI * 2);
          ctx.arc(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }, []);

  const drawCoins = useCallback((ctx: CanvasRenderingContext2D) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      ctx.save();
      ctx.translate(coin.x, coin.y);
      const float = Math.sin(frameCountRef.current * 0.12 + coin.x * 0.05) * 4;
      const pulse = 1 + Math.sin(frameCountRef.current * 0.15 + coin.x * 0.03) * 0.15;
      ctx.translate(0, float);
      ctx.scale(pulse, pulse);
      const color = colors[Math.floor(coin.x / 40) % colors.length];
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.save();
      ctx.rotate(frameCountRef.current * 0.06 + coin.x * 0.01);
      ctx.beginPath();
      ctx.roundRect(-9, -4, 18, 8, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.roundRect(-6, -2, 8, 3, 2);
      ctx.fill();
      ctx.restore();
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
      const alpha = particle.life / 30;
      ctx.globalAlpha = alpha;
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
    const playerCenterX = PLAYER_X;
    const playerCenterY = player.y;
    
    if (playerCenterY - playerRadius < 30 || playerCenterY + playerRadius > CANVAS_HEIGHT - 30) return true;
    
    for (const obstacle of obstaclesRef.current) {
      if (obstacle.type === 'zapper_diag' && obstacle.angle) {
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        const angleRad = (obstacle.angle * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const x1 = centerX - halfLength * cos;
        const y1 = centerY - halfLength * sin;
        const x2 = centerX + halfLength * cos;
        const y2 = centerY + halfLength * sin;
        const dist = pointToLineDistance(playerCenterX, playerCenterY, x1, y1, x2, y2);
        if (dist < playerRadius + 10) return true;
      } else if (obstacle.type === 'zapper_h') {
        const lineY = obstacle.y + obstacle.height / 2;
        const dist = pointToLineDistance(playerCenterX, playerCenterY, obstacle.x, lineY, obstacle.x + obstacle.width, lineY);
        if (dist < playerRadius + 10) return true;
      } else if (obstacle.type === 'zapper_v') {
        const lineX = obstacle.x + obstacle.width / 2;
        const dist = pointToLineDistance(playerCenterX, playerCenterY, lineX, obstacle.y, lineX, obstacle.y + obstacle.height);
        if (dist < playerRadius + 10) return true;
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
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_SIZE / 2 + 12) {
        coin.collected = true;
        coinsCollectedRef.current += 1;
        playCollectSound();
        addCollectParticles(coin.x, coin.y, colors[Math.floor(coin.x / 40) % colors.length]);
      }
    });
  }, [playCollectSound, addCollectParticles]);

  const checkGroundBlocks = useCallback((): boolean => {
    const player = playerRef.current;
    const playerLeft = PLAYER_X - PLAYER_SIZE / 2 + 5;
    const playerRight = PLAYER_X + PLAYER_SIZE / 2 - 5;
    const playerBottom = player.y + PLAYER_SIZE / 2 - 5;
    for (const block of groundBlocksRef.current) {
      const blockTop = CANVAS_HEIGHT - 30 - block.height;
      if (playerRight > block.x && playerLeft < block.x + block.width && playerBottom > blockTop) return true;
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
    
    if (hasStarted) {
      speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta, MAX_SPEED);
    }
    const scoreBoost = coinsCollectedRef.current >= 300 ? Math.min((coinsCollectedRef.current - 300) / 100, 1) : 0;
    const speed = hasStarted ? speedRef.current * (1 + scoreBoost * 0.25) : 0;
    
    const newScore = coinsCollectedRef.current;
    setScore(newScore);
    
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
    drawCoins(ctx);
    drawObstacles(ctx);
    drawPlayer(ctx);
    
    if (!hasStarted) {
      const pulseScale = 1 + Math.sin(frameCountRef.current * 0.1) * 0.15;
      const opacity = 0.6 + Math.sin(frameCountRef.current * 0.08) * 0.3;
      const ringExpand = (frameCountRef.current % 60) / 60;
      
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
      ctx.globalAlpha = opacity;
      
      for (let i = 0; i < 2; i++) {
        const ringPhase = (ringExpand + i * 0.5) % 1;
        const ringRadius = 20 + ringPhase * 25;
        const ringOpacity = (1 - ringPhase) * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringOpacity})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
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
      ctx.globalAlpha = 0.9;
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
        fetchEntryFee();
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
    ctx.fillText(`SCORE: ${newScore}`, 15, 58);
    
    if (scoreBoost > 0) {
      ctx.fillStyle = `rgba(255, ${255 - scoreBoost * 155}, 100, 0.9)`;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`SPEED +${Math.round(scoreBoost * 25)}%`, 15, 78);
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBackground, drawPlayer, drawObstacles, drawCoins, drawParticles, checkCollisions, checkCoins, checkGroundBlocks, spawnObstacle, spawnCoins, spawnGroundBlock, addThrustParticles, playCrashSound, stopThrustSound, submitScore, fetchEntryFee, fetchLeaderboard, address, context, selectedSkin]);

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
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, 'rgba(40, 20, 60, 0.4)');
      gradient.addColorStop(0.5, 'rgba(20, 20, 30, 0)');
      gradient.addColorStop(1, 'rgba(40, 20, 60, 0.4)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const y = (time * 100 + i * 40) % CANVAS_HEIGHT;
        ctx.beginPath(); ctx.moveTo(CANVAS_WIDTH, y); ctx.lineTo(CANVAS_WIDTH - 40 - Math.sin(time + i) * 20, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(35, 35, 40, 0.9)';
      ctx.fillRect(45, CANVAS_HEIGHT - 100, 30, 70);
      ctx.beginPath(); ctx.arc(130, CANVAS_HEIGHT - 60, 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(122, CANVAS_HEIGHT - 110, 16, 40);
      ctx.fillRect(280, CANVAS_HEIGHT - 110, 45, 80);
      ctx.fillRect(200, CANVAS_HEIGHT - 90, 40, 60);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
      ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      const stripeOffset = (time * 60) % 30;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 15, 0); ctx.lineTo(x + 5, 30); ctx.lineTo(x - 10, 30); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, CANVAS_HEIGHT); ctx.lineTo(x + 15, CANVAS_HEIGHT); ctx.lineTo(x + 5, CANVAS_HEIGHT - 30); ctx.lineTo(x - 10, CANVAS_HEIGHT - 30); ctx.closePath(); ctx.fill();
      }
      const sprinkleColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4'];
      for (let i = 0; i < 8; i++) {
        const sx = ((time * 50 + i * 60) % (CANVAS_WIDTH + 40)) - 20;
        const sy = 80 + Math.sin(time * 2 + i * 1.5) * 30 + (i % 3) * 100;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * 0.5 + i);
        ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
        ctx.shadowColor = sprinkleColors[i % sprinkleColors.length]; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.roundRect(-6, -3, 12, 6, 3); ctx.fill();
        ctx.shadowBlur = 0; ctx.restore();
      }
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#FF69B4'; ctx.shadowBlur = 15;
      ctx.fillText('DONUT', CANVAS_WIDTH / 2, 90);
      ctx.fillText('DASH', CANVAS_WIDTH / 2, 130);
      ctx.shadowBlur = 0;
      const bounceY = Math.sin(time * 3) * 10;
      const tiltAngle = Math.sin(time * 2) * 0.15;
      const donutX = CANVAS_WIDTH / 2;
      const donutY = (gameState === "gameover" ? 180 : 210) + bounceY;
      const donutColor = getDonutColor();
      const skin = selectedSkin;
      
      // Motion trail
      for (let i = 3; i > 0; i--) {
        const [h, s, l] = hexToHsl(donutColor);
        ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${0.12 * (4 - i)})`;
        ctx.beginPath(); ctx.arc(donutX - i * 10, donutY, 28 - i * 2, 0, Math.PI * 2); ctx.fill();
      }
      
      ctx.save(); ctx.translate(donutX, donutY); ctx.rotate(tiltAngle);
      
      // Jetpack (menu)
      const tankX = -46;
      const tankY = -14;
      const tankWidth = 18;
      const tankHeight = 34;
      
      const menuTankGradient = ctx.createLinearGradient(tankX, 0, tankX + tankWidth, 0);
      menuTankGradient.addColorStop(0, '#3a3a3a');
      menuTankGradient.addColorStop(0.3, '#6a6a6a');
      menuTankGradient.addColorStop(0.7, '#5a5a5a');
      menuTankGradient.addColorStop(1, '#2a2a2a');
      
      ctx.fillStyle = menuTankGradient;
      ctx.beginPath();
      ctx.roundRect(tankX, tankY, tankWidth, tankHeight, 4);
      ctx.fill();
      
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.roundRect(tankX + 2, tankY + 2, tankWidth - 4, tankHeight - 4, 3);
      ctx.fill();
      
      ctx.fillStyle = '#888';
      ctx.fillRect(tankX + 2, tankY + 2, 3, tankHeight - 4);
      
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tankX + 4, tankY + 10);
      ctx.lineTo(tankX + tankWidth - 4, tankY + 10);
      ctx.moveTo(tankX + 4, tankY + 17);
      ctx.lineTo(tankX + tankWidth - 4, tankY + 17);
      ctx.moveTo(tankX + 4, tankY + 24);
      ctx.lineTo(tankX + tankWidth - 4, tankY + 24);
      ctx.stroke();
      
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(tankX + tankWidth - 2, -5, 10, 12);
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(tankX + tankWidth + 3, 1, 3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.moveTo(tankX + 2, tankY + tankHeight);
      ctx.lineTo(tankX - 2, tankY + tankHeight + 8);
      ctx.lineTo(tankX + tankWidth + 2, tankY + tankHeight + 8);
      ctx.lineTo(tankX + tankWidth - 2, tankY + tankHeight);
      ctx.closePath();
      ctx.fill();
      
      const flameBaseY = tankY + tankHeight + 8;
      const flameSize = 24 + Math.sin(time * 15) * 10;
      const flameCenterX = tankX + tankWidth / 2;
      
      const menuOuterFlame = ctx.createLinearGradient(flameCenterX, flameBaseY, flameCenterX, flameBaseY + flameSize);
      menuOuterFlame.addColorStop(0, '#FFD700');
      menuOuterFlame.addColorStop(0.3, '#FF8C00');
      menuOuterFlame.addColorStop(0.6, '#FF4500');
      menuOuterFlame.addColorStop(1, 'rgba(255, 69, 0, 0)');
      
      ctx.fillStyle = menuOuterFlame;
      ctx.beginPath();
      ctx.moveTo(tankX - 1, flameBaseY);
      ctx.quadraticCurveTo(flameCenterX - 10, flameBaseY + flameSize * 0.6, flameCenterX, flameBaseY + flameSize);
      ctx.quadraticCurveTo(flameCenterX + 10, flameBaseY + flameSize * 0.6, tankX + tankWidth + 1, flameBaseY);
      ctx.closePath();
      ctx.fill();
      
      const innerFlameSize = flameSize * 0.6;
      const menuInnerFlame = ctx.createLinearGradient(flameCenterX, flameBaseY, flameCenterX, flameBaseY + innerFlameSize);
      menuInnerFlame.addColorStop(0, '#FFFFFF');
      menuInnerFlame.addColorStop(0.3, '#FFFACD');
      menuInnerFlame.addColorStop(0.6, '#FFD700');
      menuInnerFlame.addColorStop(1, 'rgba(255, 215, 0, 0)');
      
      ctx.fillStyle = menuInnerFlame;
      ctx.beginPath();
      ctx.moveTo(tankX + 4, flameBaseY);
      ctx.quadraticCurveTo(flameCenterX - 5, flameBaseY + innerFlameSize * 0.5, flameCenterX, flameBaseY + innerFlameSize);
      ctx.quadraticCurveTo(flameCenterX + 5, flameBaseY + innerFlameSize * 0.5, tankX + tankWidth - 4, flameBaseY);
      ctx.closePath();
      ctx.fill();
      
      // Donut with skin color (menu)
      let glowIntensity = 25;
      if (skin.animated && (skin.animationType === 'glow' || skin.animationType === 'pulse')) {
        glowIntensity = 20 + Math.sin(time * 5) * 10;
      }
      
      ctx.shadowColor = donutColor; ctx.shadowBlur = glowIntensity;
      
      const [h, s, l] = hexToHsl(donutColor);
      const lightColor = hslToHex(h, s, Math.min(100, l + 20));
      const darkColor = hslToHex(h, s, Math.max(0, l - 20));
      const darkerColor = hslToHex(h, s, Math.max(0, l - 35));
      
      const donutGradient = ctx.createRadialGradient(-4, -4, 0, 0, 0, 30);
      donutGradient.addColorStop(0, lightColor);
      donutGradient.addColorStop(0.4, donutColor);
      donutGradient.addColorStop(0.8, darkColor);
      donutGradient.addColorStop(1, darkerColor);
      ctx.fillStyle = donutGradient; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      
      // Sparkle particles (menu)
      if (skin.animated && skin.animationType === 'sparkle') {
        for (let i = 0; i < 4; i++) {
          const angle = (time * 2 + i * Math.PI / 2) % (Math.PI * 2);
          const dist = 35 + Math.sin(time * 3 + i) * 3;
          const sparkleX = Math.cos(angle) * dist;
          const sparkleY = Math.sin(angle) * dist;
          const sparkleSize = 2 + Math.sin(time * 4 + i * 2) * 1;
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(time * 5 + i) * 0.3})`;
          ctx.fill();
        }
      }
      
      const holeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      holeGradient.addColorStop(0, '#0a0a0a'); holeGradient.addColorStop(1, '#1f1f1f');
      ctx.fillStyle = holeGradient; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-8, -8, 6, 0, Math.PI * 2); ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.save(); ctx.rotate(-0.3);
      ctx.beginPath(); ctx.roundRect(14, -3, 6, 3, 1); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.rotate(0.5);
      ctx.beginPath(); ctx.roundRect(-6, 16, 6, 3, 1); ctx.fill();
      ctx.restore();
      
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
  }, [gameState, score, getDonutColor, selectedSkin]);

  // Touch prevention
  useEffect(() => {
    const canvas = canvasRef.current;
    const preventDefault = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const preventDefaultOnPlaying = (e: Event) => { if (gameState === "playing") { e.preventDefault(); e.stopPropagation(); } };
    if (canvas) {
      canvas.addEventListener('touchstart', preventDefault, { passive: false });
      canvas.addEventListener('touchmove', preventDefault, { passive: false });
      canvas.addEventListener('touchend', preventDefault, { passive: false });
    }
    document.addEventListener('contextmenu', preventDefaultOnPlaying, { passive: false });
    document.addEventListener('selectstart', preventDefault, { passive: false });
    document.body.style.webkitUserSelect = 'none';
    (document.body.style as any).webkitTouchCallout = 'none';
    return () => {
      if (canvas) {
        canvas.removeEventListener('touchstart', preventDefault);
        canvas.removeEventListener('touchmove', preventDefault);
        canvas.removeEventListener('touchend', preventDefault);
      }
      document.removeEventListener('contextmenu', preventDefaultOnPlaying);
      document.removeEventListener('selectstart', preventDefault);
      document.body.style.webkitUserSelect = '';
      (document.body.style as any).webkitTouchCallout = '';
    };
  }, [gameState]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleThrustStart(); } };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') handleThrustEnd(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleThrustStart, handleThrustEnd]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;
  const prizePoolFormatted = prizePool ? (Number(prizePool) / 1e18).toFixed(2) : "0";
  const isPaymentPending = paymentState === 'approving' || paymentState === 'paying' || paymentState === 'recording' || isPending || isConfirming;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent !important; -webkit-touch-callout: none !important; }
        .game-container { -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; touch-action: manipulation !important; }
        .game-container * { -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-3 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        {/* Header */}
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
        
        {/* Prize Pool Tile */}
        <button
          onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
          className="relative w-full mb-3 px-4 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl transition-all active:scale-[0.98] hover:border-amber-500/50 group"
          style={{ minHeight: '70px' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] text-amber-200/80 font-medium">Weekly Prize Pool</span>
              </div>
              <span className="text-2xl font-bold text-amber-400">{prizePoolFormatted} 🍩</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-amber-400/60 group-hover:text-amber-400 transition-colors">
                <span className="text-[10px]">View Leaderboard</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="text-[10px] text-amber-200/60 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Resets in <span className="font-bold text-amber-300">{resetCountdown}</span></span>
              </div>
            </div>
          </div>
        </button>
        
        {/* Game Canvas */}
        <div className="flex flex-col items-center game-container">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={SCALED_WIDTH}
              height={SCALED_HEIGHT}
              className="rounded-2xl border border-zinc-800 w-full h-full select-none"
              style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
              onPointerDown={(e) => { e.preventDefault(); if (gameState === "playing") handleThrustStart(); }}
              onPointerUp={(e) => { e.preventDefault(); handleThrustEnd(); }}
              onPointerLeave={handleThrustEnd}
              onPointerCancel={handleThrustEnd}
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={(e) => { e.preventDefault(); if (gameState === "playing") handleThrustStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); handleThrustEnd(); }}
              onTouchMove={(e) => { e.preventDefault(); }}
            />
            
            {gameState === "playing" && (
              <div 
                className="absolute inset-0 z-10 select-none"
                style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleThrustStart(); }}
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); handleThrustEnd(); }}
                onPointerLeave={handleThrustEnd}
                onPointerCancel={handleThrustEnd}
                onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); handleThrustStart(); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleThrustEnd(); }}
                onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onContextMenu={(e) => e.preventDefault()}
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
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs">Entry: <span className="font-bold">{entryFeeFormatted} 🍩</span></span>
                  </div>
                  <button 
                    onClick={handlePayment} 
                    disabled={isPaymentPending}
                    className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPaymentPending ? (
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Processing...</span></>
                    ) : (
                      <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>
                    )}
                  </button>
                  <p className="text-zinc-500 text-[10px]">Attempts today: {playCount} • Resets in {costResetCountdown}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20"><p className="text-zinc-600 text-[10px]">Hold to fly</p></div>}
          </div>
        </div>
        
        {/* Action Buttons */}
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
        
        {/* Skins Modal */}
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-zinc-400" /><span className="font-bold">Donut Dash Skins</span></div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              {!isPremium && (
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-amber-200">Unlock Premium to earn skins by playing!</span>
                  </div>
                </div>
              )}
              
              {isPremium && (
                <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Games Played: <span className="text-white font-bold">{userStats.gamesPlayed}</span></span>
                    <span className="text-zinc-400">High Score: <span className="text-white font-bold">{userStats.highScore}</span></span>
                  </div>
                </div>
              )}
              
              <div className="p-4 grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                {DASH_SKINS.map((skin) => {
                  const isUnlocked = unlockedSkins.includes(skin.id);
                  const isSelected = selectedSkin.id === skin.id;
                  const canClaim = !isUnlocked && canClaimSkin(skin);
                  const progress = getSkinProgress(skin);
                  const isDefault = skin.id === 'default';
                  
                  return (
                    <button
                      key={skin.id}
                      onClick={() => { if (isUnlocked) handleSelectSkin(skin); else if (canClaim) handleClaimSkin(skin); }}
                      onMouseEnter={() => setPreviewSkin(skin)}
                      onMouseLeave={() => setPreviewSkin(null)}
                      disabled={!isUnlocked && !canClaim}
                      className={`relative p-3 rounded-xl border-2 transition-all ${isSelected ? "border-white bg-zinc-800" : isUnlocked ? "border-zinc-700 hover:border-zinc-500" : canClaim ? "border-green-500/50 hover:border-green-500 bg-green-500/10" : "border-zinc-800 opacity-60"}`}
                    >
                      {!isDefault && (
                        <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${getTierColor(skin.tier)}`}>
                          {skin.tier === 'ultimate' ? <Crown className="w-2.5 h-2.5 text-black" /> :
                           skin.tier === 'mythic' ? <Sparkles className="w-2.5 h-2.5 text-white" /> :
                           skin.tier === 'legendary' ? <Sparkles className="w-2.5 h-2.5 text-black" /> :
                           skin.tier === 'epic' ? <Zap className="w-2.5 h-2.5 text-black" /> :
                           <span className="text-[8px] text-white font-bold">{skin.tier === 'rare' ? 'R' : 'C'}</span>}
                        </div>
                      )}
                      <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: isUnlocked || canClaim ? skin.frostingColor : '#3f3f46' }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700" />
                        </div>
                        {!isUnlocked && !canClaim && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                            <Lock className="w-4 h-4 text-zinc-500" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] font-bold truncate text-center">{skin.name}</p>
                      {isSelected && <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /></div>}
                      {!isUnlocked && !isDefault && isPremium && (
                        <div className="mt-1">
                          {canClaim ? (
                            <span className="text-[8px] text-green-400 font-bold">CLAIM!</span>
                          ) : (
                            <>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%`, backgroundColor: skin.frostingColor }} />
                              </div>
                              <p className="text-[8px] text-zinc-500 text-center mt-0.5">{progress.current}/{progress.target}</p>
                            </>
                          )}
                        </div>
                      )}
                      {!isUnlocked && !isDefault && !isPremium && (
                        <p className="text-[8px] text-zinc-600 text-center mt-1 flex items-center justify-center gap-0.5"><Crown className="w-2 h-2" /> Premium</p>
                      )}
                    </button>
                  );
                })}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => { setShowSkins(false); window.location.href = "/games/skin-market"; }} className="w-full flex items-center justify-center gap-2 py-2 text-amber-400 hover:text-amber-300">
                  <Crown className="w-4 h-4" />
                  <span className="text-sm font-bold">{isPremium ? 'View All Skins' : 'Get Premium'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Help Modal */}
        {showHelp && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div>
                <button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-amber-400" />Gameplay</h3>
                  <p className="text-xs text-zinc-400">Hold the screen to fly up with your jetpack. Release to fall. Navigate through the facility avoiding zappers and collecting sprinkles!</p>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Entry Cost</h3>
                  <p className="text-xs text-zinc-400">Each game costs DONUT to play. The cost increases by 0.1 with each attempt:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• 1st game: <span className="text-white">1.0 DONUT</span></li>
                    <li>• 2nd game: <span className="text-white">1.1 DONUT</span></li>
                    <li>• 3rd game: <span className="text-white">1.2 DONUT</span></li>
                  </ul>
                  <p className="text-xs text-zinc-500 mt-2">Cost resets daily at 6PM EST</p>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" />Weekly Rewards</h3>
                  <p className="text-xs text-zinc-400">Top 10 split the prize pool: 30%, 20%, 15%, 10%, 8%, 6%, 5%, 3%, 2%, 1%</p>
                </div>
              </div>
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200">Got it!</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /><span className="font-bold">Weekly Leaderboard</span></div>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Prize Pool</span>
                  <span className="text-sm font-bold text-amber-400">{prizePoolFormatted} 🍩</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-zinc-500">No scores yet!</p>
                    <p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p>
                  </div>
                ) : leaderboard.map((entry) => {
                  const prizePercent = PRIZE_DISTRIBUTION[entry.rank - 1] || 0;
                  const prizeAmount = ((parseFloat(prizePoolFormatted) * prizePercent) / 100).toFixed(2);
                  return (
                    <div key={entry.fid} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-amber-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🍩</div>}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{entry.displayName || entry.username || `fid:${entry.fid}`}</span>
                        {prizePercent > 0 && <span className="text-xs text-amber-400">+{prizeAmount} 🍩</span>}
                      </div>
                      <span className="font-bold text-sm">{entry.score}</span>
                    </div>
                  );
                })}
              </div>
              {leaderboard.length > 0 && (
                <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-500 text-center">Top 10 split pool: 30% • 20% • 15% • 10% • 8% • 6% • 5% • 3% • 2% • 1%</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}