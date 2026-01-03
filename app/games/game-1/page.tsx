"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Trophy, Play, Coins, Zap, Share2, Palette, Check, X, ExternalLink, HelpCircle, Volume2, VolumeX, ChevronRight, Clock, Lock, Crown, Sparkles } from "lucide-react";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const FLAPPY_POOL_ADDRESS = "0xA3419c6eFbb7a227fC3e24189d8099591327a14A" as const;

const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const FLAPPY_POOL_ABI = [
  { inputs: [{ name: "amount", type: "uint256" }], name: "payEntry", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "getPrizePool", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// Donut coin image component
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover scale-[1.7]" />
  </span>
);

// Game constants - Base dimensions (will be scaled 2x for retina)
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2; // 2x resolution for crisp graphics
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;
const GRAVITY = 0.32;
const FLAP_STRENGTH = -5.5;
const PIPE_WIDTH = 60;
const PIPE_GAP_START = 175; // Starting gap size
const PIPE_GAP_MIN = 140; // Minimum gap size (was 115, increased for playability)
const PIPE_SPEED_START = 2.0;
const PIPE_SPEED_MAX = 4.0;
const PIPE_SPAWN_DISTANCE = 240;
const PLAYER_SIZE = 36;
const PLAYER_X = 80;

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

// Default skin (always available)
const DEFAULT_SKIN: GameSkin = {
  id: 'default',
  name: 'Classic',
  frostingColor: '#F472B6',
  tier: 'default',
};

// All Flappy Donut achievement skins
const FLAPPY_SKINS: GameSkin[] = [
  DEFAULT_SKIN,
  {
    id: 'flappy-bronze',
    name: 'Sky Rookie',
    frostingColor: '#CD7F32',
    tier: 'common',
    requirement: { type: 'games_played', value: 25, description: 'Play 25 games' },
  },
  {
    id: 'flappy-silver',
    name: 'Wing Master',
    frostingColor: '#C0C0C0',
    tier: 'rare',
    requirement: { type: 'games_played', value: 50, description: 'Play 50 games' },
  },
  {
    id: 'flappy-epic',
    name: 'Cloud Surfer',
    frostingColor: '#06B6D4',
    tier: 'epic',
    animated: true,
    animationType: 'pulse',
    requirement: { type: 'games_played', value: 100, description: 'Play 100 games' },
  },
  {
    id: 'flappy-gold',
    name: 'Golden Aviator',
    frostingColor: '#FFD700',
    tier: 'legendary',
    animated: true,
    animationType: 'glow',
    requirement: { type: 'high_score', value: 300, description: 'Score 300+ in one game' },
  },
  {
    id: 'flappy-mythic',
    name: 'Storm Chaser',
    frostingColor: '#7C3AED',
    tier: 'mythic',
    animated: true,
    animationType: 'electric',
    requirement: { type: 'games_played', value: 250, description: 'Play 250 games' },
  },
  {
    id: 'flappy-ultimate',
    name: 'Sky Legend',
    frostingColor: '#F472B6',
    tier: 'ultimate',
    animated: true,
    animationType: 'rainbow',
    requirement: { type: 'games_played', value: 500, description: 'Play 500 games' },
  },
];

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; username: string; pfpUrl?: string; score: number };

const getDifficulty = (score: number) => {
  const progress = Math.min(score / 50, 1);
  return { pipeGap: PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * progress, pipeSpeed: PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * progress };
};

// Falling Donut Animation Component - starts above view
function FallingDonuts() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute falling-donut"
          style={{
            left: `${10 + i * 12}%`,
            top: '-30px',
            animationDelay: `${i * 0.4}s`,
            animationDuration: `${3 + (i % 3)}s`,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 40 40" className="opacity-30">
            <circle cx="20" cy="20" r="16" fill="#F472B6" />
            <circle cx="20" cy="20" r="6" fill="#1a1a1a" />
          </svg>
        </div>
      ))}
    </div>
  );
}

// Calculate time until next Friday 11PM UTC (6PM EST)
function getTimeUntilReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Find next Friday at 23:00 UTC
  const nextReset = new Date(utcNow);
  const currentDay = utcNow.getUTCDay();
  const currentHour = utcNow.getUTCHours();
  
  // Days until Friday (5)
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  
  // If it's Friday but past 11PM UTC, go to next Friday
  if (daysUntilFriday === 0 && currentHour >= 23) {
    daysUntilFriday = 7;
  }
  
  nextReset.setUTCDate(utcNow.getUTCDate() + daysUntilFriday);
  nextReset.setUTCHours(23, 0, 0, 0);
  
  const diff = nextReset.getTime() - utcNow.getTime();
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Calculate time until daily cost reset (6PM EST / 11PM UTC)
function getTimeUntilCostReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  // Find next 11PM UTC
  const nextReset = new Date(utcNow);
  nextReset.setUTCHours(23, 0, 0, 0);
  
  // If it's already past 11PM UTC today, go to tomorrow
  if (utcNow.getUTCHours() >= 23) {
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  }
  
  const diff = nextReset.getTime() - utcNow.getTime();
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export default function FlappyDonutPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "countdown" | "playing" | "gameover">("menu");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [entryCost, setEntryCost] = useState(1);
  const [paidCost, setPaidCost] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prizePool, setPrizePool] = useState<string>("0");
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [costResetCountdown, setCostResetCountdown] = useState<string>(getTimeUntilCostReset());
  const [pendingTxType, setPendingTxType] = useState<"approve" | "approved" | "pay" | null>(null);
  
  // Prize distribution percentages for top 10
  const PRIZE_DISTRIBUTION = [30, 20, 15, 10, 8, 6, 5, 3, 2, 1];
  
  // Audio context and sounds
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScoreRef = useRef(0);
  const audioInitializedRef = useRef(false);
  
  // Skin system state
  const [isPremium, setIsPremium] = useState(false);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>(['default']);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(DEFAULT_SKIN);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  const [userStats, setUserStats] = useState<{ gamesPlayed: number; highScore: number; totalScore: number }>({ gamesPlayed: 0, highScore: 0, totalScore: 0 });
  
  // User PFP image for player model
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const [pfpLoaded, setPfpLoaded] = useState(false);
  
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; baseTopHeight: number; gap: number; passed: boolean; phase: number; oscillates: boolean; oscSpeed: number; oscAmount: number }[]>([]);
  const buildingsRef = useRef<{ x: number; width: number; height: number; shade: number; windows: number[] }[]>([]);
  const bgOffsetRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const countdownRef = useRef(3);
  const paidCostRef = useRef(1);
  const hasFlappedRef = useRef(false); // Tracks if player has made first flap
  const gameStartPendingRef = useRef(false); // Track if we're waiting to start a game after tx
  
  // Load user PFP image
  useEffect(() => {
    if (context?.user?.pfpUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        pfpImageRef.current = img;
        setPfpLoaded(true);
      };
      img.onerror = () => {
        pfpImageRef.current = null;
        setPfpLoaded(false);
      };
      img.src = context.user.pfpUrl;
    }
  }, [context?.user?.pfpUrl]);
  
  // Initialize audio context - call early to prevent lag on first flap
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Resume if suspended (required for some browsers)
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        audioInitializedRef.current = true;
      } catch {}
    }
    return audioContextRef.current;
  }, []);
  
  // Play flap sound - non-blocking
  const playFlapSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current) return;
    // Use setTimeout to make it non-blocking
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.setValueAtTime(400, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  // Play point sound - non-blocking
  const playPointSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  // Play countdown sound
  const playCountdownSound = useCallback((isLast: boolean) => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = 'sine';
        
        if (isLast) {
          // Higher pitch "go" sound
          oscillator.frequency.setValueAtTime(880, ctx.currentTime);
          oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
        } else {
          // Regular countdown beep
          oscillator.frequency.setValueAtTime(440, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.15);
        }
      } catch {}
    }, 0);
  }, [isMuted]);
  
  // Haptic feedback - heavy for point only
  const triggerPointHaptic = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    } catch {}
  }, []);
  
  const { writeContract, data: txHash, isPending: isWritePending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({ hash: txHash });
  
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: DONUT_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, FLAPPY_POOL_ADDRESS] : undefined });
  const { data: balance, refetch: refetchBalance } = useReadContract({ address: DONUT_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined });
  const { data: prizePoolData } = useReadContract({ address: FLAPPY_POOL_ADDRESS, abi: FLAPPY_POOL_ABI, functionName: "getPrizePool" });
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const ctx = await (sdk as any).context; if (!cancelled) setContext(ctx); } catch { if (!cancelled) setContext(null); }
    })();
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  
  // Fetch skin data from new premium system
  useEffect(() => {
    if (!address) return;
    
    const fetchSkinData = async () => {
      try {
        const fidParam = context?.user?.fid ? `&fid=${context.user.fid}` : '';
        const res = await fetch(`/api/games/skin-market/user-data?address=${address}${fidParam}`);
        if (res.ok) {
          const data = await res.json();
          setIsPremium(data.isPremium || false);
          
          // Set unlocked skins (always include default)
          const unlocked = ['default', ...(data.unlockedSkins || [])];
          setUnlockedSkins(unlocked);
          
          // Set equipped skin if it's a flappy skin
          if (data.equippedSkin) {
            const equippedSkinData = FLAPPY_SKINS.find(s => s.id === data.equippedSkin);
            if (equippedSkinData && unlocked.includes(data.equippedSkin)) {
              setSelectedSkin(equippedSkinData);
            }
          }
          
          // Set user stats for flappy donut
          if (data.stats && data.stats['flappy-donut']) {
            setUserStats(data.stats['flappy-donut']);
          }
        }
      } catch (e) {
        console.error("Failed to fetch skin data:", e);
      }
    };
    
    fetchSkinData();
  }, [address]);
  
  // Fetch attempts and leaderboard
  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        const attemptsRes = await fetch(`/api/games/flappy/attempts?address=${address}`);
        if (attemptsRes.ok) { const data = await attemptsRes.json(); setAttempts(data.attempts); setEntryCost(data.nextCost); }
        const lbRes = await fetch('/api/games/flappy/leaderboard');
        if (lbRes.ok) { const data = await lbRes.json(); setLeaderboard(data.leaderboard || []); }
      } catch (e) { console.error("Failed to fetch data:", e); }
    })();
  }, [address]);
  
  useEffect(() => { if (prizePoolData) setPrizePool(Number(formatUnits(prizePoolData, 18)).toFixed(2)); }, [prizePoolData]);
  
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
  
  // Helper to convert hex to HSL for rainbow animation
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

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number, skin: GameSkin = selectedSkin) => {
    const x = PLAYER_X;
    const rotation = Math.min(Math.max(velocity * 0.04, -0.5), 0.5);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Calculate animated color for legendary skins (used for glow/border)
    let borderColor = skin.frostingColor;
    let glowIntensity = 0;
    
    if (skin.animated) {
      const time = Date.now();
      
      if (skin.animationType === 'rainbow') {
        const hueShift = (time / 20) % 360;
        const [, s, l] = hexToHsl(skin.frostingColor);
        borderColor = hslToHex(hueShift, s, l);
        glowIntensity = 15;
      } else if (skin.animationType === 'glow') {
        glowIntensity = 15 + Math.sin(time / 200) * 10;
      } else if (skin.animationType === 'pulse') {
        glowIntensity = 10 + Math.sin(time / 300) * 8;
      } else if (skin.animationType === 'electric') {
        glowIntensity = 12 + Math.sin(time / 150) * 8;
      }
    }
    
    // Shadow
    ctx.beginPath();
    ctx.ellipse(3, 5, PLAYER_SIZE / 2, PLAYER_SIZE / 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    
    // Glow effect for animated skins
    if (skin.animated && glowIntensity > 0) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = glowIntensity;
    }
    
    // Draw player as PFP circle or fallback donut
    if (pfpImageRef.current && pfpLoaded) {
      // Draw PFP in circle
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      ctx.drawImage(
        pfpImageRef.current,
        -PLAYER_SIZE / 2,
        -PLAYER_SIZE / 2,
        PLAYER_SIZE,
        PLAYER_SIZE
      );
      
      // Reset clip
      ctx.restore();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      
      // Border ring (skin color)
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Fallback: Draw donut
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = borderColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Donut hole
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    // Wings - improved animation
    const flapSpeed = velocity < 0 ? 0.6 : 0.25;
    const flapAmount = velocity < 0 ? 12 : 6;
    const wingFlap = Math.sin(frameCountRef.current * flapSpeed) * flapAmount;
    const wingAngle = velocity < 0 ? -0.6 : -0.1;
    const wingScale = velocity < 0 ? 1.2 : 1.0;
    
    // Left wing
    ctx.save();
    ctx.translate(-PLAYER_SIZE / 2 - 2, -2);
    ctx.rotate(wingAngle + wingFlap * 0.08);
    ctx.scale(wingScale, 1);
    
    const wingGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    wingGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    wingGradient.addColorStop(0.7, "rgba(240, 240, 255, 0.9)");
    wingGradient.addColorStop(1, "rgba(200, 200, 220, 0.8)");
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8, -8 - wingFlap, -18, -4 - wingFlap * 0.8);
    ctx.quadraticCurveTo(-20, 2, -14, 6);
    ctx.quadraticCurveTo(-6, 8, 0, 4);
    ctx.closePath();
    ctx.fillStyle = wingGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 180, 200, 0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.strokeStyle = "rgba(150, 150, 180, 0.4)";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-10, -4 - wingFlap * 0.5, -14, -2 - wingFlap * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-12, 0, -16, 2);
    ctx.stroke();
    ctx.restore();
    
    // Right wing (mirrored)
    ctx.save();
    ctx.translate(PLAYER_SIZE / 2 + 2, -2);
    ctx.rotate(-wingAngle - wingFlap * 0.08);
    ctx.scale(-wingScale, 1);
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8, -8 - wingFlap, -18, -4 - wingFlap * 0.8);
    ctx.quadraticCurveTo(-20, 2, -14, 6);
    ctx.quadraticCurveTo(-6, 8, 0, 4);
    ctx.closePath();
    ctx.fillStyle = wingGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 180, 200, 0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.strokeStyle = "rgba(150, 150, 180, 0.4)";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-10, -4 - wingFlap * 0.5, -14, -2 - wingFlap * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-12, 0, -16, 2);
    ctx.stroke();
    ctx.restore();
    
    ctx.restore();
  }, [selectedSkin, pfpLoaded]);
  
  // Draw scrolling cityscape background
  const drawCityscape = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    const GROUND_HEIGHT = 50;
    const BUILDING_COLORS = ['#2a2a2a', '#3d3d3d', '#4a4a4a', '#5c5c5c', '#6e6e6e'];
    
    const generateWindows = (width: number, height: number): number[] => {
      const windowRows = Math.floor(height / 15);
      const windowCols = Math.floor(width / 12);
      const windows: number[] = [];
      for (let i = 0; i < windowRows * windowCols; i++) {
        windows.push(Math.random() > 0.3 ? 0.1 + Math.random() * 0.2 : 0);
      }
      return windows;
    };
    
    bgOffsetRef.current += speed * 0.5;
    
    if (buildingsRef.current.length === 0) {
      let x = 0;
      while (x < CANVAS_WIDTH + 100) {
        const width = 25 + Math.random() * 35;
        const height = 40 + Math.random() * 80;
        const shade = Math.floor(Math.random() * BUILDING_COLORS.length);
        const windows = generateWindows(width, height);
        buildingsRef.current.push({ x, width, height, shade, windows });
        x += width + 5 + Math.random() * 15;
      }
    }
    
    buildingsRef.current.forEach(building => {
      building.x -= speed * 0.5;
    });
    
    while (buildingsRef.current.length > 0 && buildingsRef.current[0].x + buildingsRef.current[0].width < -10) {
      buildingsRef.current.shift();
    }
    
    const lastBuilding = buildingsRef.current[buildingsRef.current.length - 1];
    if (lastBuilding && lastBuilding.x + lastBuilding.width < CANVAS_WIDTH + 50) {
      const width = 25 + Math.random() * 35;
      const height = 40 + Math.random() * 80;
      const shade = Math.floor(Math.random() * BUILDING_COLORS.length);
      const windows = generateWindows(width, height);
      const x = lastBuilding.x + lastBuilding.width + 5 + Math.random() * 15;
      buildingsRef.current.push({ x, width, height, shade, windows });
    }
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
    
    buildingsRef.current.forEach(building => {
      const baseY = CANVAS_HEIGHT - GROUND_HEIGHT;
      
      ctx.fillStyle = BUILDING_COLORS[building.shade];
      ctx.fillRect(building.x, baseY - building.height, building.width, building.height);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(building.x, baseY - building.height, 2, building.height);
      
      const windowRows = Math.floor(building.height / 15);
      const windowCols = Math.floor(building.width / 12);
      let windowIdx = 0;
      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          const brightness = building.windows[windowIdx] || 0;
          if (brightness > 0) {
            ctx.fillStyle = `rgba(255, 220, 150, ${brightness})`;
          } else {
            ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
          }
          ctx.fillRect(
            building.x + 4 + col * 12,
            baseY - building.height + 8 + row * 15,
            6, 8
          );
          windowIdx++;
        }
      }
    });
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - GROUND_HEIGHT);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_HEIGHT);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    const dashOffset = bgOffsetRef.current % 20;
    for (let i = -dashOffset; i < CANVAS_WIDTH + 20; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, CANVAS_HEIGHT - 25);
      ctx.lineTo(i + 10, CANVAS_HEIGHT - 25);
      ctx.stroke();
    }
  }, []);
  
  const drawPipe = useCallback((ctx: CanvasRenderingContext2D, x: number, topHeight: number, gap: number) => {
    const gradient = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, "#C4A77D");
    gradient.addColorStop(0.3, "#E8D5B7");
    gradient.addColorStop(0.5, "#F5E6D3");
    gradient.addColorStop(0.7, "#E8D5B7");
    gradient.addColorStop(1, "#C4A77D");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, -10, PIPE_WIDTH, topHeight + 10, [0, 0, 8, 8]);
    ctx.fill();
    
    const bottomY = topHeight + gap;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY + 10, [8, 8, 0, 0]);
    ctx.fill();
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
    
    frameCountRef.current++;
    const difficulty = getDifficulty(scoreRef.current);
    
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
    for (let i = 0; i < CANVAS_HEIGHT; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }
    
    drawCityscape(ctx, difficulty.pipeSpeed);
    
    if (hasFlappedRef.current) {
      donutRef.current.velocity += GRAVITY * deltaTime;
      donutRef.current.velocity = Math.min(donutRef.current.velocity, 10);
      donutRef.current.y += donutRef.current.velocity * deltaTime;
    }
    
    const pipeMovement = difficulty.pipeSpeed * deltaTime;
    
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= pipeMovement;
      
      if (pipe.oscillates) {
        const time = performance.now() / 1000;
        pipe.topHeight = pipe.baseTopHeight + Math.sin(time * pipe.oscSpeed * 60 + pipe.phase) * pipe.oscAmount;
        
        const minTop = 40;
        const maxTop = CANVAS_HEIGHT - pipe.gap - 40;
        pipe.topHeight = Math.max(minTop, Math.min(maxTop, pipe.topHeight));
      }
      
      if (!pipe.passed && pipe.x + PIPE_WIDTH < PLAYER_X) { 
        pipe.passed = true; 
        scoreRef.current++; 
        setScore(scoreRef.current);
        playPointSound();
        triggerPointHaptic();
      }
      if (pipe.x + PIPE_WIDTH < -10) pipesRef.current.splice(index, 1);
    });
    
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < CANVAS_WIDTH - PIPE_SPAWN_DISTANCE) {
      const currentGap = difficulty.pipeGap;
      const topHeight = Math.random() * (CANVAS_HEIGHT - currentGap - 120) + 60;
      const phase = Math.random() * Math.PI * 2;
      
      const shouldOscillate = scoreRef.current >= 100;
      const oscillationProgress = shouldOscillate ? Math.min((scoreRef.current - 100) / 100, 1) : 0;
      const oscSpeed = 0.02 + oscillationProgress * 0.02;
      const oscAmount = 15 + oscillationProgress * 25;
      
      pipesRef.current.push({ 
        x: CANVAS_WIDTH + 20, 
        topHeight, 
        baseTopHeight: topHeight, 
        gap: currentGap, 
        passed: false, 
        phase,
        oscillates: shouldOscillate,
        oscSpeed,
        oscAmount,
      });
    }
    
    pipesRef.current.forEach(pipe => drawPipe(ctx, pipe.x, pipe.topHeight, pipe.gap));
    drawPlayer(ctx, donutRef.current.y, donutRef.current.velocity);
    
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    
    const playerY = donutRef.current.y;
    const hitboxRadius = PLAYER_SIZE / 2 - 6;
    
    const endGameInline = () => {
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
      
      if (address && scoreRef.current >= 0) {
        fetch('/api/games/flappy/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            playerAddress: address, 
            username: context?.user?.username || `${address.slice(0, 6)}...${address.slice(-4)}`, 
            pfpUrl: context?.user?.pfpUrl, 
            score: scoreRef.current, 
            costPaid: paidCostRef.current 
          }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              console.error('Score submission failed:', data.error);
            }
            fetch(`/api/games/flappy/attempts?address=${address}`).then(r => r.json()).then(data => { setAttempts(data.attempts); setEntryCost(data.nextCost); });
            fetch('/api/games/flappy/leaderboard').then(r => r.json()).then(data => setLeaderboard(data.leaderboard || []));
            const fidParam = context?.user?.fid ? `&fid=${context.user.fid}` : '';
            fetch(`/api/games/skin-market/user-data?address=${address}${fidParam}`).then(r => r.json()).then(data => {
              if (data.stats && data.stats['flappy-donut']) {
                setUserStats(data.stats['flappy-donut']);
              }
            });
          })
          .catch(err => {
            console.error('Score submission error:', err);
          });
        
        if (scoreRef.current > 0) {
          fetch('/api/chat/game-announce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerAddress: address,
              username: context?.user?.username || null,
              pfpUrl: context?.user?.pfpUrl || null,
              gameId: 'flappy-donut',
              gameName: 'Flappy Donut',
              score: scoreRef.current,
              skinId: selectedSkin.id,
              skinColor: selectedSkin.frostingColor,
            }),
          }).catch(console.error);
        }
      }
    };
    
    if (playerY - hitboxRadius < 0 || playerY + hitboxRadius > CANVAS_HEIGHT) { endGameInline(); return; }
    for (const pipe of pipesRef.current) {
      if (PLAYER_X + hitboxRadius > pipe.x && PLAYER_X - hitboxRadius < pipe.x + PIPE_WIDTH) {
        if (playerY - hitboxRadius < pipe.topHeight || playerY + hitboxRadius > pipe.topHeight + pipe.gap) { endGameInline(); return; }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawPlayer, drawPipe, drawCityscape, address, context, playPointSound, triggerPointHaptic, selectedSkin]);
  
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      hasFlappedRef.current = true;
      donutRef.current.velocity = FLAP_STRENGTH;
      playFlapSound();
    }
  }, [gameState, playFlapSound]);
  
  const startGame = useCallback(() => {
    initAudioContext();
    
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    buildingsRef.current = [];
    bgOffsetRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    scoreRef.current = 0;
    frameCountRef.current = 0;
    countdownRef.current = 3;
    hasFlappedRef.current = false;
    gameStartPendingRef.current = false;
    setScore(0);
    setCountdown(3);
    setGameState("countdown");
    setError(null);
    
    playCountdownSound(false);
    
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      countdownRef.current = count;
      setCountdown(count);
      
      if (count > 0) {
        playCountdownSound(false);
      } else {
        playCountdownSound(true);
      }
      
      if (count <= 0) {
        clearInterval(countdownInterval);
        lastFrameTimeRef.current = performance.now();
        gameActiveRef.current = true;
        setGameState("playing");
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop, initAudioContext, playCountdownSound]);

  useEffect(() => {
    if (isTxSuccess && pendingTxType === "approve") {
      setPendingTxType("approved");
      resetWrite();
      refetchAllowance();
    }
  }, [isTxSuccess, pendingTxType, resetWrite, refetchAllowance]);

  useEffect(() => {
    if (pendingTxType === "approved" && allowance) {
      const costWei = parseUnits(entryCost.toFixed(1), 18);
      if (allowance >= costWei) {
        setPendingTxType("pay");
        writeContract({ address: FLAPPY_POOL_ADDRESS, abi: FLAPPY_POOL_ABI, functionName: "payEntry", args: [costWei] });
      }
    }
  }, [pendingTxType, allowance, entryCost, writeContract]);

  useEffect(() => {
    if (isTxSuccess && pendingTxType === "pay" && gameStartPendingRef.current) {
      setPendingTxType(null);
      setPaidCost(entryCost);
      paidCostRef.current = entryCost;
      setIsLoading(false);
      refetchAllowance();
      refetchBalance();
      resetWrite();
      startGame();
    }
  }, [isTxSuccess, pendingTxType, entryCost, refetchAllowance, refetchBalance, startGame, resetWrite]);

  useEffect(() => {
    if (writeError || isTxError) {
      setIsLoading(false);
      setPendingTxType(null);
      gameStartPendingRef.current = false;
      if (writeError) {
        const msg = (writeError as Error).message || "Transaction failed";
        if (msg.includes("rejected") || msg.includes("denied")) {
          setError("Transaction rejected");
        } else {
          setError("Transaction failed");
        }
      } else {
        setError("Transaction failed");
      }
      resetWrite();
    }
  }, [writeError, isTxError, resetWrite]);
  
  const handlePlay = async () => {
    if (!address) { setError("Connect wallet to play"); return; }
    setIsLoading(true);
    setError(null);
    gameStartPendingRef.current = true;
    const costWei = parseUnits(entryCost.toFixed(1), 18);
    if (balance && balance < costWei) { setError(`Insufficient DONUT. Need ${entryCost.toFixed(1)}`); setIsLoading(false); gameStartPendingRef.current = false; return; }
    if (!allowance || allowance < costWei) { 
      setPendingTxType("approve");
      writeContract({ address: DONUT_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [FLAPPY_POOL_ADDRESS, parseUnits("100", 18)] }); 
      return; 
    }
    setPendingTxType("pay");
    writeContract({ address: FLAPPY_POOL_ADDRESS, abi: FLAPPY_POOL_ABI, functionName: "payEntry", args: [costWei] });
  };
  
  const handleSelectSkin = async (skin: GameSkin) => {
    if (!address) return;
    if (!unlockedSkins.includes(skin.id)) return;
    
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
    if (skin.requirement.type === 'games_played') {
      return userStats.gamesPlayed >= skin.requirement.value;
    } else if (skin.requirement.type === 'high_score') {
      return userStats.highScore >= skin.requirement.value;
    }
    return false;
  };
  
  const getSkinProgress = (skin: GameSkin): { current: number; target: number } => {
    if (!skin.requirement) return { current: 0, target: 0 };
    if (skin.requirement.type === 'games_played') {
      return { current: userStats.gamesPlayed, target: skin.requirement.value };
    } else if (skin.requirement.type === 'high_score') {
      return { current: userStats.highScore, target: skin.requirement.value };
    }
    return { current: 0, target: 0 };
  };
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `I just scored ${score} in Flappy Donut on the Sprinkles App by @swishh.eth!\n\nThink you can beat me? Play now and compete for the ${prizePool} DONUT weekly prize pool!`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score, prizePool]);
  
  // Draw menu/countdown/gameover
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    const menuPlayerY = CANVAS_HEIGHT / 2 - 40;
    
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGradient.addColorStop(0, "#1a1a1a");
      bgGradient.addColorStop(1, "#0d0d0d");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      for (let i = 0; i < CANVAS_WIDTH; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }
      
      drawCityscape(ctx, 0.5);
      
      const floatOffset = Math.sin(Date.now() / 500) * 6;
      drawPlayer(ctx, menuPlayerY + floatOffset, 0, previewSkin || selectedSkin);
      
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 60);
      
      if (gameState === "countdown") {
        const scale = 1 + Math.sin(Date.now() / 100) * 0.08;
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
        ctx.scale(scale, scale);
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 40;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 120px monospace";
        ctx.fillText(countdownRef.current.toString(), 0, 30);
        ctx.shadowBlur = 0;
        ctx.restore();
        
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 16px monospace";
        ctx.fillText("GET READY!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 120);
      }
      
      if (gameState === "gameover") {
        ctx.fillStyle = "#FF6B6B";
        ctx.font = "bold 24px monospace";
        ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, 100);
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 48px monospace";
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 150);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#888888";
        ctx.font = "14px monospace";
        ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 180);
      }
    };
    
    draw();
    if (gameState === "menu" || gameState === "gameover" || gameState === "countdown") {
      const interval = setInterval(draw, 50);
      return () => clearInterval(interval);
    }
  }, [gameState, score, highScore, drawPlayer, drawCityscape, previewSkin, selectedSkin]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); handleFlap(); } };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlap]);
  
  const isPaying = isWritePending || isTxLoading;

  const getTierColor = (tier: SkinTier) => {
    switch (tier) {
      case 'ultimate': return 'bg-gradient-to-br from-pink-400 to-orange-500';
      case 'mythic': return 'bg-violet-500';
      case 'legendary': return 'bg-yellow-500';
      case 'epic': return 'bg-cyan-500';
      case 'rare': return 'bg-purple-500';
      case 'common': return 'bg-zinc-600';
      default: return 'bg-zinc-700';
    }
  };

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        @keyframes falling-donut {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
        .falling-donut {
          animation: falling-donut 3s ease-in-out infinite;
        }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        {/* Global Header */}
        <Header title="FLAPPY DONUT" user={context?.user} />
        
        {/* Prize Pool Tile - Clickable to open leaderboard */}
        <button
          onClick={() => setShowLeaderboard(true)}
          className="relative w-full mb-3 px-4 py-3 bg-gradient-to-r from-pink-500/20 to-pink-600/20 border border-pink-500/30 rounded-xl transition-all active:scale-[0.98] hover:border-pink-500/50 group"
          style={{ minHeight: '70px' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-pink-400" />
                <span className="text-[10px] text-pink-200/80 font-medium">Weekly Prize Pool</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-bold text-pink-400">{prizePool}</span>
                <DonutCoin className="w-6 h-6" />
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-pink-400/60 group-hover:text-pink-400 transition-colors">
                <span className="text-[10px]">View Leaderboard</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="text-[10px] text-pink-200/60 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Resets in <span className="font-bold text-pink-300">{resetCountdown}</span></span>
              </div>
            </div>
          </div>
        </button>
        
        {/* Game Area */}
        <div className="flex flex-col items-center">
          <div 
            className="relative w-full" 
            style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
          >
            {gameState === "playing" && (
              <div 
                className="absolute inset-0 z-10 cursor-pointer"
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleFlap(); }}
                style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
              />
            )}
            <canvas 
              ref={canvasRef} 
              width={SCALED_WIDTH} 
              height={SCALED_HEIGHT} 
              className="rounded-2xl border border-zinc-800 w-full h-full select-none" 
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }} 
            />
            
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500"><Share2 className="w-3 h-3" /><span>Share</span></button>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <Zap className="w-3 h-3 text-pink-400" />
                    <span className="text-xs">Entry: <span className="font-bold">{entryCost.toFixed(1)}</span></span>
                    <DonutCoin className="w-3.5 h-3.5" />
                  </div>
                  <button onClick={handlePlay} disabled={isPaying || isLoading} className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 active:scale-95 disabled:opacity-50">
                    {isPaying ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Processing...</span></> : <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>}
                  </button>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <p className="text-zinc-500 text-[10px]">Attempts today: {attempts} • Resets in {costResetCountdown}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20"><p className="text-zinc-600 text-[10px]">Tap to flap</p></div>}
          </div>
        </div>
          
        {(gameState === "menu" || gameState === "gameover") && (
          <div className="py-4 flex items-center justify-center gap-2">
            <button onClick={() => setShowSkins(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <Palette className="w-3 h-3 text-zinc-400" /><span className="text-xs">Skins</span>
            </button>
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs">How to Play</span>
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>
              {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}
              <span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          </div>
        )}
        
        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-pink-400" /><span className="font-bold">Weekly Leaderboard</span></div>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Prize Pool</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-pink-400">{prizePool}</span>
                    <DonutCoin className="w-4 h-4" />
                  </div>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-zinc-500">No scores yet!</p>
                    <p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p>
                  </div>
                ) : leaderboard.map((entry, i) => {
                  const prizePercent = PRIZE_DISTRIBUTION[entry.rank - 1] || 0;
                  const prizeAmount = ((parseFloat(prizePool) * prizePercent) / 100).toFixed(2);
                  return (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-pink-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-pink-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><DonutCoin className="w-5 h-5" /></div>}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{entry.username}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-pink-400">+{prizeAmount}</span>
                          <DonutCoin className="w-3 h-3" />
                        </div>
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
        
        {/* Skins Modal */}
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-zinc-400" />
                  <span className="font-bold">Flappy Donut Skins</span>
                </div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {!isPremium && (
                <div className="px-4 py-3 bg-pink-500/10 border-b border-pink-500/20">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-pink-400" />
                    <span className="text-xs text-pink-200">Unlock Premium to earn skins by playing!</span>
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
                {FLAPPY_SKINS.map((skin) => {
                  const isUnlocked = unlockedSkins.includes(skin.id);
                  const isSelected = selectedSkin.id === skin.id;
                  const canClaim = !isUnlocked && canClaimSkin(skin);
                  const progress = getSkinProgress(skin);
                  const isDefault = skin.id === 'default';
                  
                  return (
                    <button
                      key={skin.id}
                      onClick={() => {
                        if (isUnlocked) {
                          handleSelectSkin(skin);
                        } else if (canClaim) {
                          handleClaimSkin(skin);
                        }
                      }}
                      onMouseEnter={() => setPreviewSkin(skin)}
                      onMouseLeave={() => setPreviewSkin(null)}
                      disabled={!isUnlocked && !canClaim}
                      className={`relative p-3 rounded-xl border-2 transition-all ${
                        isSelected ? "border-white bg-zinc-800" : 
                        isUnlocked ? "border-zinc-700 hover:border-zinc-500" :
                        canClaim ? "border-green-500/50 hover:border-green-500 bg-green-500/10" :
                        "border-zinc-800 opacity-60"
                      }`}
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
                      
                      {isSelected && (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Check className="w-3 h-3 text-green-400" />
                        </div>
                      )}
                      
                      {!isUnlocked && !isDefault && isPremium && (
                        <div className="mt-1">
                          {canClaim ? (
                            <span className="text-[8px] text-green-400 font-bold">CLAIM!</span>
                          ) : (
                            <>
                              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ 
                                    width: `${Math.min((progress.current / progress.target) * 100, 100)}%`,
                                    backgroundColor: skin.frostingColor 
                                  }}
                                />
                              </div>
                              <p className="text-[8px] text-zinc-500 text-center mt-0.5">
                                {progress.current}/{progress.target}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      
                      {!isUnlocked && !isDefault && !isPremium && (
                        <p className="text-[8px] text-zinc-600 text-center mt-1 flex items-center justify-center gap-0.5">
                          <Crown className="w-2 h-2" /> Premium
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button 
                  onClick={() => { setShowSkins(false); window.location.href = "/games/skin-market"; }} 
                  className="w-full flex items-center justify-center gap-2 py-2 text-pink-400 hover:text-pink-300"
                >
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
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-pink-400" />Gameplay</h3>
                  <p className="text-xs text-zinc-400">Tap or click to make your character flap and fly. Navigate through the rolling pin obstacles without hitting them or the edges!</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-pink-400" />Entry Cost</h3>
                  <p className="text-xs text-zinc-400">Each game costs DONUT to play. The cost increases by 0.1 with each attempt:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li className="flex items-center gap-1">• 1st game: <span className="text-white">1.0</span> <DonutCoin className="w-3 h-3" /></li>
                    <li className="flex items-center gap-1">• 2nd game: <span className="text-white">1.1</span> <DonutCoin className="w-3 h-3" /></li>
                    <li className="flex items-center gap-1">• 3rd game: <span className="text-white">1.2</span> <DonutCoin className="w-3 h-3" /></li>
                    <li>• And so on...</li>
                  </ul>
                  <p className="text-xs text-zinc-500 mt-2">Cost resets daily at 6PM EST</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Coins className="w-4 h-4 text-pink-400" />Prize Pool</h3>
                  <p className="text-xs text-zinc-400">90% of all entry fees go to the weekly prize pool. 5% goes to LP rewards, 5% to treasury.</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-pink-400" />Weekly Rewards</h3>
                  <p className="text-xs text-zinc-400">Every week, the prize pool is distributed to the top 10 players based on their highest score:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                    <div className="flex justify-between"><span className="text-pink-400">🥇 1st</span><span className="text-white">30%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-300">🥈 2nd</span><span className="text-white">20%</span></div>
                    <div className="flex justify-between"><span className="text-orange-400">🥉 3rd</span><span className="text-white">15%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">4th</span><span className="text-white">10%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">5th</span><span className="text-white">8%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">6th</span><span className="text-white">6%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">7th</span><span className="text-white">5%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">8th</span><span className="text-white">3%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">9th</span><span className="text-white">2%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">10th</span><span className="text-white">1%</span></div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Palette className="w-4 h-4 text-zinc-400" />Skins</h3>
                  <p className="text-xs text-zinc-400">Unlock Premium to earn skins by playing! Each game has unique skins to unlock based on milestones:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• <span className="text-zinc-300">Common:</span> Play 25 games</li>
                    <li>• <span className="text-purple-400">Rare:</span> Play 50 games</li>
                    <li>• <span className="text-cyan-400">Epic:</span> Play 100 games</li>
                    <li>• <span className="text-yellow-400">Legendary:</span> Score 300+</li>
                  </ul>
                </div>
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200">
                  Got it!
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