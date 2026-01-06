"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Trophy, Play, Coins, Zap, Share2, X, HelpCircle, Volume2, VolumeX, ChevronRight, Clock, Shield, Minimize2 } from "lucide-react";

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
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover" />
  </span>
);

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2;
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;

// Physics - more forgiving
const GRAVITY = 0.28;
const FLAP_STRENGTH = -5.2;
const MAX_FALL_SPEED = 8;

// Pipe settings - easier start
const PIPE_WIDTH = 55;
const PIPE_GAP_START = 185;
const PIPE_GAP_MIN = 145;
const PIPE_SPEED_START = 1.8;
const PIPE_SPEED_MAX = 3.8;
const PIPE_SPAWN_DISTANCE = 260;

// Player
const PLAYER_SIZE = 36;
const PLAYER_X = 80;

// Power-up types
type PowerUpType = 'shield' | 'widegap' | 'tiny';

interface PowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  collected: boolean;
}

interface ActivePowerUp {
  type: PowerUpType;
  endTime?: number;
}

// Particle types
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'sparkle' | 'trail' | 'burst' | 'star';
}

// Floating text
interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; username: string; pfpUrl?: string; score: number };

// Smoother difficulty curve
const getDifficulty = (score: number) => {
  // Slower progression - full difficulty at score 80 instead of 50
  const progress = Math.min(score / 80, 1);
  // Ease-out curve for smoother feel
  const eased = 1 - Math.pow(1 - progress, 2);
  return {
    pipeGap: PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * eased,
    pipeSpeed: PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * eased,
  };
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

function getTimeUntilCostReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  const nextReset = new Date(utcNow);
  nextReset.setUTCHours(23, 0, 0, 0);
  if (utcNow.getUTCHours() >= 23) nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  const diff = nextReset.getTime() - utcNow.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prizePool, setPrizePool] = useState<string>("0");
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [costResetCountdown, setCostResetCountdown] = useState<string>(getTimeUntilCostReset());
  const [pendingTxType, setPendingTxType] = useState<"approve" | "approved" | "pay" | null>(null);
  const [activePowerUpDisplay, setActivePowerUpDisplay] = useState<PowerUpType | null>(null);
  
  const PRIZE_DISTRIBUTION = [30, 20, 15, 10, 8, 6, 5, 3, 2, 1];
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInitializedRef = useRef(false);
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const [pfpLoaded, setPfpLoaded] = useState(false);
  
  // Game state refs
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0, size: PLAYER_SIZE });
  const pipesRef = useRef<{ x: number; topHeight: number; baseTopHeight: number; gap: number; passed: boolean; phase: number; oscillates: boolean; oscSpeed: number; oscAmount: number }[]>([]);
  const buildingsRef = useRef<{ x: number; width: number; height: number; shade: number; windows: number[] }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpRef = useRef<ActivePowerUp | null>(null);
  const bgParticlesRef = useRef<{ x: number; y: number; size: number; speed: number; alpha: number }[]>([]);
  
  const bgOffsetRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const countdownRef = useRef(3);
  const paidCostRef = useRef(1);
  const hasFlappedRef = useRef(false);
  const gameStartPendingRef = useRef(false);
  const screenShakeRef = useRef(0);
  const lastPipePassedRef = useRef(0);
  
  // Load user PFP
  useEffect(() => {
    if (context?.user?.pfpUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { pfpImageRef.current = img; setPfpLoaded(true); };
      img.onerror = () => { pfpImageRef.current = null; setPfpLoaded(false); };
      img.src = context.user.pfpUrl;
    }
  }, [context?.user?.pfpUrl]);
  
  // Initialize background particles
  const initBgParticles = useCallback(() => {
    bgParticlesRef.current = [];
    for (let i = 0; i < 30; i++) {
      bgParticlesRef.current.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: 1 + Math.random() * 2,
        speed: 0.3 + Math.random() * 0.5,
        alpha: 0.05 + Math.random() * 0.15,
      });
    }
  }, []);
  
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
  
  const playFlapSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const playPointSound = useCallback(() => {
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
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const playPowerUpSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current) return;
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
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
  
  const playHitSound = useCallback(() => {
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
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const triggerHaptic = useCallback((strong: boolean) => {
    try {
      if (navigator.vibrate) navigator.vibrate(strong ? [30, 50, 30] : 15);
    } catch {}
  }, []);
  
  // Spawn particles
  const spawnScoreParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        life: 1,
        maxLife: 1,
        color: '#FFD700',
        size: 4 + Math.random() * 3,
        type: 'star',
      });
    }
  }, []);
  
  const spawnTrailParticle = useCallback((x: number, y: number, color: string) => {
    if (particlesRef.current.length > 100) return; // Limit particles
    particlesRef.current.push({
      x: x - 10 + Math.random() * 5,
      y: y + (Math.random() - 0.5) * 10,
      vx: -1 - Math.random(),
      vy: (Math.random() - 0.5) * 0.5,
      life: 1,
      maxLife: 1,
      color,
      size: 3 + Math.random() * 3,
      type: 'trail',
    });
  }, []);
  
  const spawnPowerUpParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * 4,
        vy: Math.sin(angle) * 4,
        life: 1,
        maxLife: 1,
        color,
        size: 5,
        type: 'sparkle',
      });
    }
  }, []);
  
  const spawnDeathParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color: i % 2 === 0 ? '#F472B6' : '#FFFFFF',
        size: 4 + Math.random() * 6,
        type: 'burst',
      });
    }
  }, []);
  
  const addFloatingText = useCallback((x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({ x, y, text, color, life: 1, vy: -2 });
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
  
  useEffect(() => {
    const updateCountdown = () => {
      setResetCountdown(getTimeUntilReset());
      setCostResetCountdown(getTimeUntilCostReset());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Draw background with parallax particles
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    // Gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Animated background particles
    bgParticlesRef.current.forEach(p => {
      p.x -= speed * 0.3;
      if (p.x < 0) {
        p.x = CANVAS_WIDTH;
        p.y = Math.random() * CANVAS_HEIGHT;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }
  }, []);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number, size: number, hasShield: boolean) => {
    const x = PLAYER_X;
    const rotation = Math.min(Math.max(velocity * 0.04, -0.5), 0.5);
    const playerColor = '#F472B6';
    const scale = size / PLAYER_SIZE;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    
    // Shield effect
    if (hasShield) {
      const shieldPulse = 1 + Math.sin(frameCountRef.current * 0.15) * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2 + 12, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.5 + Math.sin(frameCountRef.current * 0.1) * 0.3})`;
      ctx.lineWidth = 3 * shieldPulse;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2 + 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, 0.1)`;
      ctx.fill();
    }
    
    // Shadow
    ctx.beginPath();
    ctx.ellipse(3, 5, PLAYER_SIZE / 2, PLAYER_SIZE / 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    
    // Draw player
    if (pfpImageRef.current && pfpLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pfpImageRef.current, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
      
      // Border ring
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = playerColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // Fallback donut
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = playerColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
    }
    
    // Wings
    const flapSpeed = velocity < 0 ? 0.6 : 0.25;
    const flapAmount = velocity < 0 ? 12 : 6;
    const wingFlap = Math.sin(frameCountRef.current * flapSpeed) * flapAmount;
    const wingAngle = velocity < 0 ? -0.6 : -0.1;
    const wingScale = velocity < 0 ? 1.2 : 1.0;
    
    const wingGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    wingGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    wingGradient.addColorStop(0.7, "rgba(240, 240, 255, 0.9)");
    wingGradient.addColorStop(1, "rgba(200, 200, 220, 0.8)");
    
    // Left wing
    ctx.save();
    ctx.translate(-PLAYER_SIZE / 2 - 2, -2);
    ctx.rotate(wingAngle + wingFlap * 0.08);
    ctx.scale(wingScale, 1);
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
    ctx.restore();
    
    // Right wing
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
    ctx.restore();
    
    ctx.restore();
  }, [pfpLoaded]);
  
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
    
    buildingsRef.current.forEach(building => { building.x -= speed * 0.5; });
    
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
          ctx.fillStyle = brightness > 0 ? `rgba(255, 220, 150, ${brightness})` : 'rgba(50, 50, 50, 0.5)';
          ctx.fillRect(building.x + 4 + col * 12, baseY - building.height + 8 + row * 15, 6, 8);
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
  }, []);
  
  const drawPipe = useCallback((ctx: CanvasRenderingContext2D, x: number, topHeight: number, gap: number) => {
    // Wooden rolling pin style
    const gradient = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, "#8B7355");
    gradient.addColorStop(0.2, "#C4A77D");
    gradient.addColorStop(0.4, "#DEC9A9");
    gradient.addColorStop(0.6, "#C4A77D");
    gradient.addColorStop(0.8, "#A08060");
    gradient.addColorStop(1, "#8B7355");
    
    // Top pipe
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, -10, PIPE_WIDTH, topHeight + 10, [0, 0, 8, 8]);
    ctx.fill();
    
    // Top pipe cap
    ctx.fillStyle = '#6B5344';
    ctx.beginPath();
    ctx.roundRect(x - 4, topHeight - 20, PIPE_WIDTH + 8, 20, [4, 4, 8, 8]);
    ctx.fill();
    
    // Bottom pipe
    const bottomY = topHeight + gap;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY + 10, [8, 8, 0, 0]);
    ctx.fill();
    
    // Bottom pipe cap
    ctx.fillStyle = '#6B5344';
    ctx.beginPath();
    ctx.roundRect(x - 4, bottomY, PIPE_WIDTH + 8, 20, [8, 8, 4, 4]);
    ctx.fill();
    
    // Highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x + 8, -10, 4, topHeight + 10);
    ctx.fillRect(x + 8, bottomY, 4, CANVAS_HEIGHT - bottomY);
  }, []);
  
  const drawPowerUp = useCallback((ctx: CanvasRenderingContext2D, powerUp: PowerUp, time: number) => {
    if (powerUp.collected) return;
    
    const pulse = 1 + Math.sin(time / 150) * 0.15;
    const float = Math.sin(time / 300) * 5;
    
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y + float);
    ctx.scale(pulse, pulse);
    
    // Glow
    const color = powerUp.type === 'shield' ? '#64C8FF' : powerUp.type === 'widegap' ? '#FF69B4' : '#22C55E';
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    
    // Circle background
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Icon
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(powerUp.type === 'shield' ? '🛡️' : powerUp.type === 'widegap' ? '↕' : '•', 0, 0);
    
    ctx.restore();
  }, []);
  
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      
      if (p.type === 'star') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        const size = p.size * p.life;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + frameCountRef.current * 0.1;
          const px = p.x + Math.cos(angle) * size;
          const py = p.y + Math.sin(angle) * size;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (p.type === 'sparkle') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }, []);
  
  const drawFloatingTexts = useCallback((ctx: CanvasRenderingContext2D) => {
    floatingTextsRef.current.forEach(ft => {
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.shadowBlur = 0;
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
    
    // Use fixed step for pipes (ignores frame timing for consistent movement)
    const FIXED_PIPE_STEP = 1.0;
    
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    frameCountRef.current++;
    
    const difficulty = getDifficulty(scoreRef.current);
    
    // Apply wide gap power-up
    let effectiveGap = difficulty.pipeGap;
    if (activePowerUpRef.current?.type === 'widegap') {
      effectiveGap += 50; // Add 50px to gap
    }
    
    const effectiveSpeed = difficulty.pipeSpeed;
    
    // Check power-up expiration
    if (activePowerUpRef.current?.endTime && now > activePowerUpRef.current.endTime) {
      if (activePowerUpRef.current.type === 'tiny') {
        donutRef.current.size = PLAYER_SIZE;
      }
      activePowerUpRef.current = null;
      setActivePowerUpDisplay(null);
    }
    
    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (screenShakeRef.current > 0) {
      shakeX = (Math.random() - 0.5) * screenShakeRef.current * 8;
      shakeY = (Math.random() - 0.5) * screenShakeRef.current * 8;
      screenShakeRef.current -= 0.1 * deltaTime;
      if (screenShakeRef.current < 0) screenShakeRef.current = 0;
    }
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    drawBackground(ctx, effectiveSpeed * FIXED_PIPE_STEP);
    drawCityscape(ctx, effectiveSpeed * FIXED_PIPE_STEP);
    
    // Physics
    if (hasFlappedRef.current) {
      donutRef.current.velocity += GRAVITY * deltaTime;
      donutRef.current.velocity = Math.min(donutRef.current.velocity, MAX_FALL_SPEED);
      donutRef.current.y += donutRef.current.velocity * deltaTime;
    }
    
    // Trail particles
    if (hasFlappedRef.current && frameCountRef.current % 3 === 0) {
      spawnTrailParticle(PLAYER_X, donutRef.current.y, 'rgba(244, 114, 182, 0.6)');
    }
    
    // Move pipes with fixed step for consistent movement (no jerkiness)
    const pipeMovement = effectiveSpeed * FIXED_PIPE_STEP;
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= pipeMovement;
      
      if (pipe.oscillates) {
        const time = now / 1000;
        pipe.topHeight = pipe.baseTopHeight + Math.sin(time * pipe.oscSpeed * 60 + pipe.phase) * pipe.oscAmount;
        pipe.topHeight = Math.max(40, Math.min(CANVAS_HEIGHT - pipe.gap - 40, pipe.topHeight));
      }
      
      if (!pipe.passed && pipe.x + PIPE_WIDTH < PLAYER_X) {
        pipe.passed = true;
        scoreRef.current++;
        setScore(scoreRef.current);
        playPointSound();
        addFloatingText(PLAYER_X + 40, donutRef.current.y - 20, '+1', '#FFD700');
        lastPipePassedRef.current = scoreRef.current;
      }
      
      if (pipe.x + PIPE_WIDTH < -10) pipesRef.current.splice(index, 1);
    });
    
    // Spawn new pipes
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < CANVAS_WIDTH - PIPE_SPAWN_DISTANCE) {
      const currentGap = effectiveGap;
      const topHeight = Math.random() * (CANVAS_HEIGHT - currentGap - 120) + 60;
      const phase = Math.random() * Math.PI * 2;
      
      // Oscillating pipes start later (score 120+)
      const shouldOscillate = scoreRef.current >= 120;
      const oscillationProgress = shouldOscillate ? Math.min((scoreRef.current - 120) / 80, 1) : 0;
      const oscSpeed = 0.015 + oscillationProgress * 0.015;
      const oscAmount = 10 + oscillationProgress * 20;
      
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
      
      // Spawn power-up occasionally (every 8-15 pipes, after score 5)
      if (scoreRef.current >= 5 && Math.random() < 0.12) {
        const types: PowerUpType[] = ['shield', 'widegap', 'tiny'];
        const type = types[Math.floor(Math.random() * types.length)];
        const puY = topHeight + currentGap / 2;
        powerUpsRef.current.push({
          type,
          x: CANVAS_WIDTH + 20 + PIPE_WIDTH / 2,
          y: puY,
          collected: false,
        });
      }
    }
    
    // Draw pipes
    pipesRef.current.forEach(pipe => drawPipe(ctx, pipe.x, pipe.topHeight, pipe.gap));
    
    // Move and draw power-ups
    powerUpsRef.current.forEach((pu, i) => {
      if (!pu.collected) {
        pu.x -= pipeMovement;
        drawPowerUp(ctx, pu, now);
        
        // Collision with player
        const dx = PLAYER_X - pu.x;
        const dy = donutRef.current.y - pu.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < donutRef.current.size / 2 + 18) {
          pu.collected = true;
          playPowerUpSound();
          
          const color = pu.type === 'shield' ? '#64C8FF' : pu.type === 'widegap' ? '#FF69B4' : '#22C55E';
          spawnPowerUpParticles(pu.x, pu.y, color);
          
          if (pu.type === 'shield') {
            activePowerUpRef.current = { type: 'shield' };
            setActivePowerUpDisplay('shield');
            addFloatingText(pu.x, pu.y - 20, 'SHIELD!', color);
          } else if (pu.type === 'widegap') {
            activePowerUpRef.current = { type: 'widegap', endTime: now + 8000 };
            setActivePowerUpDisplay('widegap');
            addFloatingText(pu.x, pu.y - 20, 'WIDE GAP!', color);
          } else if (pu.type === 'tiny') {
            donutRef.current.size = PLAYER_SIZE * 0.6;
            activePowerUpRef.current = { type: 'tiny', endTime: now + 6000 };
            setActivePowerUpDisplay('tiny');
            addFloatingText(pu.x, pu.y - 20, 'TINY!', color);
          }
        }
      }
    });
    
    // Cleanup power-ups
    powerUpsRef.current = powerUpsRef.current.filter(pu => !pu.collected && pu.x > -30);
    
    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      if (p.type !== 'trail') p.vy += 0.15 * deltaTime;
      p.life -= 0.025 * deltaTime;
      return p.life > 0;
    });
    
    // Update floating texts
    floatingTextsRef.current = floatingTextsRef.current.filter(ft => {
      ft.y += ft.vy * deltaTime;
      ft.life -= 0.025 * deltaTime;
      return ft.life > 0;
    });
    
    // Draw particles and texts
    drawParticles(ctx);
    drawFloatingTexts(ctx);
    
    // Draw player
    const hasShield = activePowerUpRef.current?.type === 'shield';
    drawPlayer(ctx, donutRef.current.y, donutRef.current.velocity, donutRef.current.size, hasShield);
    
    ctx.restore();
    
    // HUD - Score
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    
    // Active power-up indicator
    if (activePowerUpRef.current) {
      const pu = activePowerUpRef.current;
      const color = pu.type === 'shield' ? '#64C8FF' : pu.type === 'widegap' ? '#FF69B4' : '#22C55E';
      ctx.fillStyle = color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const icon = pu.type === 'shield' ? '🛡️ SHIELD' : pu.type === 'widegap' ? '↕ WIDE GAP' : '• TINY';
      ctx.fillText(icon, 15, 50);
      
      if (pu.endTime) {
        const remaining = Math.max(0, (pu.endTime - now) / 1000);
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText(`${remaining.toFixed(1)}s`, 15, 65);
      }
    }
    
    // Collision detection
    const playerY = donutRef.current.y;
    const hitboxRadius = donutRef.current.size / 2 - 6;
    
    const endGameInline = (hitPipe: boolean = false) => {
      if (hitPipe && activePowerUpRef.current?.type === 'shield') {
        // Shield blocks one hit
        activePowerUpRef.current = null;
        setActivePowerUpDisplay(null);
        screenShakeRef.current = 0.5;
        spawnPowerUpParticles(PLAYER_X, donutRef.current.y, '#64C8FF');
        addFloatingText(PLAYER_X, donutRef.current.y - 30, 'BLOCKED!', '#64C8FF');
        return false;
      }
      
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      playHitSound();
      spawnDeathParticles(PLAYER_X, donutRef.current.y);
      screenShakeRef.current = 1;
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
          .then(() => {
            fetch(`/api/games/flappy/attempts?address=${address}`).then(r => r.json()).then(data => { setAttempts(data.attempts); setEntryCost(data.nextCost); });
            fetch('/api/games/flappy/leaderboard').then(r => r.json()).then(data => setLeaderboard(data.leaderboard || []));
          })
          .catch(console.error);
        
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
            }),
          }).catch(console.error);
        }
      }
      return true;
    };
    
    // Check boundaries
    if (playerY - hitboxRadius < 0 || playerY + hitboxRadius > CANVAS_HEIGHT) {
      endGameInline();
      return;
    }
    
    // Check pipe collisions
    for (const pipe of pipesRef.current) {
      if (PLAYER_X + hitboxRadius > pipe.x && PLAYER_X - hitboxRadius < pipe.x + PIPE_WIDTH) {
        if (playerY - hitboxRadius < pipe.topHeight || playerY + hitboxRadius > pipe.topHeight + pipe.gap) {
          if (endGameInline(true)) return;
        }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBackground, drawCityscape, drawPlayer, drawPipe, drawPowerUp, drawParticles, drawFloatingTexts, address, context, playPointSound, playPowerUpSound, playHitSound, spawnTrailParticle, spawnPowerUpParticles, spawnDeathParticles, addFloatingText]);
  
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      hasFlappedRef.current = true;
      donutRef.current.velocity = FLAP_STRENGTH;
      playFlapSound();
    }
  }, [gameState, playFlapSound]);
  
  const startGame = useCallback(() => {
    initAudioContext();
    initBgParticles();
    
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0, size: PLAYER_SIZE };
    pipesRef.current = [];
    buildingsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    powerUpsRef.current = [];
    activePowerUpRef.current = null;
    bgOffsetRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    scoreRef.current = 0;
    frameCountRef.current = 0;
    countdownRef.current = 3;
    hasFlappedRef.current = false;
    gameStartPendingRef.current = false;
    screenShakeRef.current = 0;
    lastPipePassedRef.current = 0;
    
    setScore(0);
    setCountdown(3);
    setGameState("countdown");
    setError(null);
    setActivePowerUpDisplay(null);
    
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
  }, [gameLoop, initAudioContext, initBgParticles, playCountdownSound]);

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
        setError(msg.includes("rejected") || msg.includes("denied") ? "Transaction rejected" : "Transaction failed");
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
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `I just scored ${score} in Flappy Donut on the Sprinkles App by @swishh.eth!\n\nThink you can beat me? Play now and compete for the ${prizePool} DONUT weekly prize pool!`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); }
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score, prizePool]);
  
  // Menu/gameover animation
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    // Initialize bg particles for menu
    if (bgParticlesRef.current.length === 0) {
      for (let i = 0; i < 30; i++) {
        bgParticlesRef.current.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          size: 1 + Math.random() * 2,
          speed: 0.3 + Math.random() * 0.5,
          alpha: 0.05 + Math.random() * 0.15,
        });
      }
    }
    
    const menuPlayerY = CANVAS_HEIGHT / 2 - 40;
    
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      drawBackground(ctx, 0.5);
      drawCityscape(ctx, 0.5);
      
      const floatOffset = Math.sin(Date.now() / 500) * 6;
      drawPlayer(ctx, menuPlayerY + floatOffset, 0, PLAYER_SIZE, false);
      
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
  }, [gameState, score, highScore, drawBackground, drawCityscape, drawPlayer]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); handleFlap(); } };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlap]);
  
  const isPaying = isWritePending || isTxLoading;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent !important; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <Header title="FLAPPY DONUT" user={context?.user} />
        
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
        
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
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
              style={{ touchAction: "none" }}
            />
            
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500">
                      <Share2 className="w-3 h-3" /><span>Share</span>
                    </button>
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
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs">How to Play</span>
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>
              {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}
              <span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          </div>
        )}
      </div>
      
      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
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
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div>
              <button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-pink-400" />Gameplay</h3>
                <p className="text-xs text-zinc-400">Tap or click to flap and fly. Navigate through the rolling pin obstacles without hitting them!</p>
              </div>
              
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Power-Ups</h3>
                <div className="space-y-2 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">🛡️</span>
                    <span>Shield - Blocks one hit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-pink-400">↕</span>
                    <span>Wide Gap - Wider pipes for 8 seconds</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">•</span>
                    <span>Tiny - Shrinks player for 6 seconds</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Coins className="w-4 h-4 text-pink-400" />Entry Cost</h3>
                <p className="text-xs text-zinc-400">Each game costs DONUT. Cost increases by 0.1 with each attempt and resets daily at 6PM EST.</p>
              </div>
              
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-pink-400" />Weekly Rewards</h3>
                <p className="text-xs text-zinc-400">Top 10 players split the weekly prize pool:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                  <div className="flex justify-between"><span className="text-pink-400">🥇 1st</span><span>30%</span></div>
                  <div className="flex justify-between"><span className="text-zinc-300">🥈 2nd</span><span>20%</span></div>
                  <div className="flex justify-between"><span className="text-orange-400">🥉 3rd</span><span>15%</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">4th-10th</span><span>35% split</span></div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
              <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200">Got it!</button>
            </div>
          </div>
        </div>
      )}
      
      <NavBar />
    </main>
  );
}