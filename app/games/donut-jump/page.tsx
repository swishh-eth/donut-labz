"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Play, Share2, X, HelpCircle, Volume2, VolumeX, Trophy, ChevronRight, Clock, Sparkles, Zap, Rocket } from "lucide-react";

// Free Arcade Contract
const FREE_ARCADE_CONTRACT = "0x80D28cB05A6636a80980AA75172C469F789CfAe7" as const;

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
const GRAVITY = 0.4;
const JUMP_FORCE = -14;
const SUPER_JUMP_FORCE = -20;
const JETPACK_FORCE = -0.8;
const MAX_FALL_SPEED = 15;
const MOVE_SPEED = 6;
const MOVE_ACCELERATION = 0.8;
const MOVE_FRICTION = 0.85;

// Player
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 40;

// Platforms
const PLATFORM_WIDTH = 70;
const PLATFORM_HEIGHT = 15;
const MIN_PLATFORM_GAP = 50;
const MAX_PLATFORM_GAP = 120;

// Donut coin
const COIN_SIZE = 24;

// Types
type PlatformType = 'normal' | 'moving' | 'breakable' | 'spring' | 'disappearing';
type PowerUpType = 'jetpack' | 'spring_shoes' | 'shield' | 'magnet';
type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

interface Platform {
  x: number;
  y: number;
  width: number;
  type: PlatformType;
  broken?: boolean;
  moveDir?: number;
  moveSpeed?: number;
  opacity?: number;
  hasSpring?: boolean;
  springCompressed?: boolean;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
  sparklePhase: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  collected: boolean;
}

interface ActivePowerUp {
  type: PowerUpType;
  endTime: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: string;
}

interface LeaderboardEntry {
  rank: number;
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  score: number;
}

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

// Prize info
interface PrizeInfo {
  totalPrize: number;
  prizeStructure: { rank: number; percent: number; amount: string }[];
}

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

// Power-up config
const POWERUP_CONFIG: Record<PowerUpType, { color: string; icon: string; duration: number }> = {
  jetpack: { color: '#FF6600', icon: '🚀', duration: 4000 },
  spring_shoes: { color: '#00FF00', icon: '👟', duration: 8000 },
  shield: { color: '#00FFFF', icon: '🛡️', duration: 0 },
  magnet: { color: '#FF00FF', icon: '🧲', duration: 6000 },
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
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export default function DonutJumpPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const currentFidRef = useRef<number | null>(null);  // Store fid at game start
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gamesPlayedThisWeek, setGamesPlayedThisWeek] = useState(0);
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo>(DEFAULT_PRIZE_INFO);
  
  // Game refs
  const playerRef = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100, vx: 0, vy: 0, facingRight: true });
  const platformsRef = useRef<Platform[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const cameraYRef = useRef(0);
  const maxHeightRef = useRef(0);
  const coinsCollectedRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  
  const hasShieldRef = useRef(false);
  const invincibleUntilRef = useRef(0);
  
  const moveLeftRef = useRef(false);
  const moveRightRef = useRef(false);
  
  const screenShakeRef = useRef({ intensity: 0, duration: 0, startTime: 0 });
  
  // Background elements
  const bgParticlesRef = useRef<{ x: number; y: number; size: number; speed: number; alpha: number }[]>([]);
  
  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // User PFP
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const pfpLoadedRef = useRef(false);
  
  // Donut coin image
  const donutImageRef = useRef<HTMLImageElement | null>(null);
  const donutLoadedRef = useRef(false);
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  
  // Load images
  useEffect(() => {
    if (context?.user?.pfpUrl && !pfpLoadedRef.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { pfpImageRef.current = img; pfpLoadedRef.current = true; };
      img.onerror = () => { pfpImageRef.current = null; };
      img.src = context.user.pfpUrl;
    }
  }, [context?.user?.pfpUrl]);
  
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { donutImageRef.current = img; donutLoadedRef.current = true; };
    img.src = '/coins/donut_logo.png';
  }, []);
  
  // SDK init
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
  
  // Update countdown
  useEffect(() => {
    const updateCountdown = () => setResetCountdown(getTimeUntilReset());
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Fetch prize info
  useEffect(() => {
    const fetchPrizeInfo = async () => {
      try {
        const res = await fetch('/api/games/donut-jump/prize-distribute');
        if (res.ok) {
          const data = await res.json();
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
  
  const fetchLeaderboard = useCallback(async () => {
    try {
      const fid = context?.user?.fid;
      const url = fid ? `/api/games/donut-jump/leaderboard?fid=${fid}&limit=10` : `/api/games/donut-jump/leaderboard?limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
        if (data.userStats) {
          setGamesPlayedThisWeek(data.userStats.gamesPlayed || 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    }
  }, [context?.user?.fid]);
  
  useEffect(() => {
    if (context?.user?.fid) fetchLeaderboard();
  }, [context?.user?.fid, fetchLeaderboard]);
  
  const submitScore = useCallback(async (finalScore: number) => {
    const entryId = currentEntryIdRef.current;
    const fid = currentFidRef.current;
    console.log("[Donut Jump Client] Submitting score:", { entryId, finalScore, fid });
    if (!entryId || !fid) {
      console.log("[Donut Jump Client] Missing entryId or fid, skipping submission");
      return;
    }
    try {
      const res = await fetch("/api/games/donut-jump/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, score: finalScore, fid }),
      });
      const data = await res.json();
      console.log("[Donut Jump Client] Submit response:", data);
    } catch (error) {
      console.error("[Donut Jump Client] Failed to submit score:", error);
    }
  }, []);
  
  // Audio
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
      } catch {}
    }
  }, []);
  
  const playJumpSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, [isMuted]);
  
  const playSuperJumpSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, [isMuted]);
  
  const playCoinSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, [isMuted]);
  
  const playPowerUpSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, [isMuted]);
  
  const playBreakSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }, [isMuted]);
  
  const playGameOverSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, [isMuted]);
  
  const triggerScreenShake = useCallback((intensity: number, duration: number) => {
    screenShakeRef.current = { intensity, duration, startTime: performance.now() };
  }, []);
  
  const addParticles = useCallback((x: number, y: number, color: string, count: number, speed: number = 3) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
        vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5),
        life: 1,
        maxLife: 1,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  }, []);
  
  const addJumpParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.5;
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 3,
        life: 1,
        maxLife: 1,
        color: '#FFFFFF',
        size: 2 + Math.random() * 2,
        type: 'dust',
      });
    }
  }, []);
  
  const isPowerUpActive = useCallback((type: PowerUpType): boolean => {
    const now = Date.now();
    return activePowerUpsRef.current.some(p => p.type === type && p.endTime > now);
  }, []);
  
  const activatePowerUp = useCallback((type: PowerUpType) => {
    const config = POWERUP_CONFIG[type];
    const now = Date.now();
    
    if (type === 'shield') {
      hasShieldRef.current = true;
    } else {
      activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.type !== type);
      activePowerUpsRef.current.push({ type, endTime: now + config.duration });
    }
    
    playPowerUpSound();
  }, [playPowerUpSound]);
  
  // Platform generation
  const generatePlatform = useCallback((y: number, forceNormal: boolean = false): Platform => {
    const height = maxHeightRef.current;
    let type: PlatformType = 'normal';
    
    if (!forceNormal && height > 500) {
      const rand = Math.random();
      if (height > 3000 && rand < 0.15) type = 'disappearing';
      else if (height > 2000 && rand < 0.2) type = 'breakable';
      else if (height > 1000 && rand < 0.25) type = 'moving';
      else if (rand < 0.1) type = 'spring';
    }
    
    const platform: Platform = {
      x: Math.random() * (CANVAS_WIDTH - PLATFORM_WIDTH),
      y,
      width: PLATFORM_WIDTH,
      type,
    };
    
    if (type === 'moving') {
      platform.moveDir = Math.random() > 0.5 ? 1 : -1;
      platform.moveSpeed = 1 + Math.random() * 2;
    }
    
    if (type === 'disappearing') {
      platform.opacity = 1;
    }
    
    if (type === 'spring' || (type === 'normal' && Math.random() < 0.1)) {
      platform.hasSpring = true;
      platform.springCompressed = false;
    }
    
    return platform;
  }, []);
  
  const generateInitialPlatforms = useCallback(() => {
    platformsRef.current = [];
    
    // Ground platform
    platformsRef.current.push({
      x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      width: PLATFORM_WIDTH,
      type: 'normal',
    });
    
    // Generate platforms upward with coins
    let y = CANVAS_HEIGHT - 100;
    let coinsSpawned = 0;
    while (y > -CANVAS_HEIGHT) {
      y -= MIN_PLATFORM_GAP + Math.random() * (MAX_PLATFORM_GAP - MIN_PLATFORM_GAP);
      const platform = generatePlatform(y, y > CANVAS_HEIGHT - 300);
      platformsRef.current.push(platform);
      
      // Spawn coins on initial platforms (40% chance)
      if (Math.random() < 0.4) {
        coinsRef.current.push({
          x: platform.x + platform.width / 2,
          y: platform.y - 30,
          collected: false,
          sparklePhase: Math.random() * Math.PI * 2,
        });
        coinsSpawned++;
      }
    }
    console.log("[Donut Jump Client] Initial platforms generated:", platformsRef.current.length, "coins spawned:", coinsSpawned);
  }, [generatePlatform]);
  
  // Coin generation
  const maybeSpawnCoin = useCallback((platform: Platform) => {
    if (Math.random() < 0.4) {  // 40% chance for more coins
      coinsRef.current.push({
        x: platform.x + platform.width / 2,
        y: platform.y - 30,
        collected: false,
        sparklePhase: Math.random() * Math.PI * 2,
      });
    }
  }, []);
  
  // Power-up generation
  const maybeSpawnPowerUp = useCallback((platform: Platform) => {
    const height = maxHeightRef.current;
    if (height > 500 && Math.random() < 0.03) {
      const types: PowerUpType[] = ['jetpack', 'spring_shoes', 'shield', 'magnet'];
      const type = types[Math.floor(Math.random() * types.length)];
      powerUpsRef.current.push({
        x: platform.x + platform.width / 2,
        y: platform.y - 40,
        type,
        collected: false,
      });
    }
  }, []);
  
  // Drawing functions
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Initialize background particles if needed
    if (bgParticlesRef.current.length === 0) {
      for (let i = 0; i < 40; i++) {
        bgParticlesRef.current.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          size: 1 + Math.random() * 2,
          speed: 0.3 + Math.random() * 0.5,
          alpha: 0.05 + Math.random() * 0.15,
        });
      }
    }
    
    // Animated background particles - move DOWN as player goes UP
    bgParticlesRef.current.forEach(p => {
      // Particles drift down relative to camera (creates falling effect as player climbs)
      const screenY = ((p.y - cameraYRef.current * 0.15) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, screenY, p.size, 0, Math.PI * 2);
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
  
  const drawPlatform = useCallback((ctx: CanvasRenderingContext2D, platform: Platform, screenY: number) => {
    if (platform.broken) return;
    
    ctx.save();
    
    if (platform.type === 'disappearing' && platform.opacity !== undefined) {
      ctx.globalAlpha = platform.opacity;
    }
    
    // Platform colors by type
    let color1 = '#4ade80';
    let color2 = '#22c55e';
    
    if (platform.type === 'moving') {
      color1 = '#60a5fa';
      color2 = '#3b82f6';
    } else if (platform.type === 'breakable') {
      color1 = '#a78bfa';
      color2 = '#8b5cf6';
    } else if (platform.type === 'disappearing') {
      color1 = '#fbbf24';
      color2 = '#f59e0b';
    }
    
    // Platform body with gradient
    const gradient = ctx.createLinearGradient(platform.x, screenY, platform.x, screenY + PLATFORM_HEIGHT);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(platform.x, screenY, platform.width, PLATFORM_HEIGHT, 5);
    ctx.fill();
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.roundRect(platform.x + 5, screenY + 2, platform.width - 10, 4, 2);
    ctx.fill();
    
    // Spring
    if (platform.hasSpring) {
      const springX = platform.x + platform.width / 2;
      const springY = screenY;
      const compressed = platform.springCompressed;
      const springHeight = compressed ? 8 : 15;
      
      // Spring coil
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = springY - (i + 1) * (springHeight / 4);
        const offset = (i % 2 === 0 ? -6 : 6);
        ctx.lineTo(springX + offset, y);
      }
      ctx.stroke();
      
      // Spring top
      ctx.fillStyle = '#FF8800';
      ctx.beginPath();
      ctx.ellipse(springX, springY - springHeight, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }, []);
  
  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D, screenY: number) => {
    const player = playerRef.current;
    const isJetpack = isPowerUpActive('jetpack');
    const hasSpringShoes = isPowerUpActive('spring_shoes');
    const isInvincible = Date.now() < invincibleUntilRef.current;
    
    ctx.save();
    ctx.translate(player.x, screenY);
    
    // Flip based on direction
    if (!player.facingRight) {
      ctx.scale(-1, 1);
    }
    
    // Flash when invincible
    if (isInvincible && Math.floor(frameCountRef.current / 4) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }
    
    // Jetpack effect
    if (isJetpack) {
      // Jetpack body
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.roundRect(-PLAYER_WIDTH / 2 - 12, -8, 10, 25, 3);
      ctx.fill();
      
      // Flames
      const flameSize = 15 + Math.sin(frameCountRef.current * 0.5) * 5;
      const flameGradient = ctx.createLinearGradient(0, 17, 0, 17 + flameSize);
      flameGradient.addColorStop(0, '#FFFF00');
      flameGradient.addColorStop(0.5, '#FF6600');
      flameGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(-PLAYER_WIDTH / 2 - 10, 17);
      ctx.lineTo(-PLAYER_WIDTH / 2 - 7, 17 + flameSize);
      ctx.lineTo(-PLAYER_WIDTH / 2 - 4, 17);
      ctx.fill();
    }
    
    // Spring shoes effect
    if (hasSpringShoes) {
      ctx.fillStyle = '#00FF00';
      ctx.beginPath();
      ctx.ellipse(-8, PLAYER_HEIGHT / 2 - 5, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(8, PLAYER_HEIGHT / 2 - 5, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Player body (PFP or fallback)
    const radius = PLAYER_WIDTH / 2;
    
    if (pfpImageRef.current && pfpLoadedRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pfpImageRef.current, -radius, -radius, PLAYER_WIDTH, PLAYER_HEIGHT);
      ctx.restore();
      
      // Border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Fallback donut character
      ctx.fillStyle = '#F472B6';
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Donut hole
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(0, 0, radius / 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-6, -3, 3, 0, Math.PI * 2);
      ctx.arc(6, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Shield effect
    if (hasShieldRef.current) {
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  }, [isPowerUpActive]);
  
  const drawCoin = useCallback((ctx: CanvasRenderingContext2D, coin: Coin, screenY: number) => {
    if (coin.collected) return;
    
    coin.sparklePhase += 0.1;
    const float = Math.sin(coin.sparklePhase) * 3;
    const pulse = 1 + Math.sin(coin.sparklePhase * 2) * 0.1;
    
    ctx.save();
    ctx.translate(coin.x, screenY + float);
    ctx.scale(pulse, pulse);
    
    // Glow
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 15;
    
    if (donutImageRef.current && donutLoadedRef.current) {
      ctx.drawImage(donutImageRef.current, -COIN_SIZE / 2, -COIN_SIZE / 2, COIN_SIZE, COIN_SIZE);
    } else {
      // Fallback coin
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, 0, COIN_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(0, 0, COIN_SIZE / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
    ctx.restore();
  }, []);
  
  const drawPowerUp = useCallback((ctx: CanvasRenderingContext2D, powerUp: PowerUp, screenY: number) => {
    if (powerUp.collected) return;
    
    const config = POWERUP_CONFIG[powerUp.type];
    const float = Math.sin(frameCountRef.current * 0.1) * 5;
    const pulse = 1 + Math.sin(frameCountRef.current * 0.15) * 0.15;
    
    ctx.save();
    ctx.translate(powerUp.x, screenY + float);
    ctx.scale(pulse, pulse);
    
    // Glow
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 20;
    
    // Background
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    gradient.addColorStop(0, config.color + '80');
    gradient.addColorStop(1, config.color + '20');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    
    // Icon
    ctx.shadowBlur = 0;
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.icon, 0, 0);
    
    ctx.restore();
  }, []);
  
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity on particles
      p.life -= 0.03;
      
      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
        return;
      }
      
      const screenY = p.y - cameraYRef.current;
      if (screenY < -50 || screenY > CANVAS_HEIGHT + 50) return;
      
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, screenY, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, []);
  
  const drawHUD = useCallback((ctx: CanvasRenderingContext2D) => {
    // Score with donut coin image
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    
    // Draw donut coin image
    if (donutImageRef.current && donutLoadedRef.current) {
      ctx.drawImage(donutImageRef.current, 12, 22, 22, 22);
      ctx.fillText(`${coinsCollectedRef.current}`, 40, 40);
    } else {
      ctx.fillText(`🍩 ${coinsCollectedRef.current}`, 15, 40);
    }
    ctx.shadowBlur = 0;
    
    // Height (secondary)
    ctx.font = '14px monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText(`${Math.floor(maxHeightRef.current)}m`, 15, 60);
    
    // Active power-ups
    const now = Date.now();
    const activePowerUps = activePowerUpsRef.current.filter(p => p.endTime > now);
    
    activePowerUps.forEach((powerUp, index) => {
      const config = POWERUP_CONFIG[powerUp.type];
      const remaining = (powerUp.endTime - now) / config.duration;
      const x = CANVAS_WIDTH - 30 - index * 35;
      const y = 40;
      
      ctx.fillStyle = '#00000080';
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
      ctx.stroke();
      
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.icon, x, y);
    });
    
    // Shield indicator
    if (hasShieldRef.current) {
      const x = CANVAS_WIDTH - 30 - activePowerUps.length * 35;
      ctx.fillStyle = '#00000080';
      ctx.beginPath();
      ctx.arc(x, 40, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, 40, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', x, 40);
    }
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
    
    // Screen shake
    let shakeX = 0, shakeY = 0;
    const shake = screenShakeRef.current;
    if (shake.duration > 0) {
      const elapsed = now - shake.startTime;
      if (elapsed < shake.duration) {
        const intensity = shake.intensity * (1 - elapsed / shake.duration);
        shakeX = (Math.random() - 0.5) * intensity * 2;
        shakeY = (Math.random() - 0.5) * intensity * 2;
      } else {
        screenShakeRef.current.duration = 0;
      }
    }
    
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, shakeX * CANVAS_SCALE, shakeY * CANVAS_SCALE);
    
    const player = playerRef.current;
    const isJetpack = isPowerUpActive('jetpack');
    const hasSpringShoes = isPowerUpActive('spring_shoes');
    const isMagnet = isPowerUpActive('magnet');
    
    // Movement input
    if (moveLeftRef.current) {
      player.vx -= MOVE_ACCELERATION * delta;
      player.facingRight = false;
    }
    if (moveRightRef.current) {
      player.vx += MOVE_ACCELERATION * delta;
      player.facingRight = true;
    }
    
    // Apply friction and clamp velocity
    player.vx *= MOVE_FRICTION;
    player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));
    
    // Apply gravity or jetpack
    if (isJetpack) {
      player.vy += JETPACK_FORCE * delta;
      player.vy = Math.max(-12, player.vy);
      
      // Jetpack particles
      if (frameCountRef.current % 2 === 0) {
        particlesRef.current.push({
          x: player.x - (player.facingRight ? 15 : -15),
          y: player.y + 15,
          vx: (Math.random() - 0.5) * 2,
          vy: 3 + Math.random() * 2,
          life: 1,
          maxLife: 1,
          color: Math.random() > 0.5 ? '#FF6600' : '#FFFF00',
          size: 4 + Math.random() * 3,
        });
      }
    } else {
      player.vy += GRAVITY * delta;
    }
    
    player.vy = Math.min(player.vy, MAX_FALL_SPEED);
    
    // Update position
    player.x += player.vx * delta;
    player.y += player.vy * delta;
    
    // Wrap around screen edges
    if (player.x < -PLAYER_WIDTH / 2) player.x = CANVAS_WIDTH + PLAYER_WIDTH / 2;
    if (player.x > CANVAS_WIDTH + PLAYER_WIDTH / 2) player.x = -PLAYER_WIDTH / 2;
    
    // Platform collisions (only when falling)
    if (player.vy > 0) {
      for (const platform of platformsRef.current) {
        if (platform.broken) continue;
        
        const screenY = platform.y - cameraYRef.current;
        
        // Check collision
        if (
          player.x > platform.x - PLAYER_WIDTH / 2 &&
          player.x < platform.x + platform.width + PLAYER_WIDTH / 2 &&
          player.y + PLAYER_HEIGHT / 2 > platform.y &&
          player.y + PLAYER_HEIGHT / 2 < platform.y + PLATFORM_HEIGHT + player.vy * delta
        ) {
          // Handle platform type
          if (platform.type === 'breakable') {
            platform.broken = true;
            playBreakSound();
            addParticles(platform.x + platform.width / 2, platform.y, '#8b5cf6', 10);
            continue;
          }
          
          if (platform.type === 'disappearing') {
            platform.opacity = 0.5;
            setTimeout(() => {
              platform.broken = true;
            }, 300);
          }
          
          // Bounce
          let jumpForce = hasSpringShoes ? SUPER_JUMP_FORCE : JUMP_FORCE;
          
          if (platform.hasSpring) {
            jumpForce = SUPER_JUMP_FORCE * 1.3;
            platform.springCompressed = true;
            setTimeout(() => { platform.springCompressed = false; }, 100);
            playSuperJumpSound();
            addParticles(player.x, player.y + PLAYER_HEIGHT / 2, '#FF6600', 12, 5);
          } else {
            playJumpSound();
          }
          
          player.vy = jumpForce;
          player.y = platform.y - PLAYER_HEIGHT / 2;
          addJumpParticles(player.x, player.y + PLAYER_HEIGHT / 2);
        }
      }
    }
    
    // Update camera (follow player when going up)
    const targetCameraY = player.y - CANVAS_HEIGHT * 0.4;
    if (targetCameraY < cameraYRef.current) {
      cameraYRef.current = targetCameraY;
    }
    
    // Update max height (score)
    const currentHeight = -player.y + CANVAS_HEIGHT;
    if (currentHeight > maxHeightRef.current) {
      maxHeightRef.current = currentHeight;
    }
    
    // Generate new platforms as we go up
    const highestPlatform = Math.min(...platformsRef.current.map(p => p.y));
    if (highestPlatform > cameraYRef.current - CANVAS_HEIGHT) {
      const newY = highestPlatform - (MIN_PLATFORM_GAP + Math.random() * (MAX_PLATFORM_GAP - MIN_PLATFORM_GAP));
      const newPlatform = generatePlatform(newY);
      platformsRef.current.push(newPlatform);
      maybeSpawnCoin(newPlatform);
      maybeSpawnPowerUp(newPlatform);
    }
    
    // Remove platforms below screen
    platformsRef.current = platformsRef.current.filter(p => p.y < cameraYRef.current + CANVAS_HEIGHT + 100);
    coinsRef.current = coinsRef.current.filter(c => c.y < cameraYRef.current + CANVAS_HEIGHT + 100);
    powerUpsRef.current = powerUpsRef.current.filter(p => p.y < cameraYRef.current + CANVAS_HEIGHT + 100);
    
    // Update moving platforms
    platformsRef.current.forEach(platform => {
      if (platform.type === 'moving' && platform.moveDir !== undefined) {
        platform.x += platform.moveDir * (platform.moveSpeed || 2) * delta;
        if (platform.x <= 0 || platform.x >= CANVAS_WIDTH - platform.width) {
          platform.moveDir *= -1;
        }
      }
    });
    
    // Coin collection
    const nowMs = Date.now();
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      // Magnet pull
      if (isMagnet) {
        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          coin.x += dx * 0.1;
          coin.y += dy * 0.1;
        }
      }
      
      // Collision check
      const dx = player.x - coin.x;
      const dy = player.y - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_WIDTH / 2 + COIN_SIZE / 2) {
        coin.collected = true;
        coinsCollectedRef.current++;
        console.log("[Donut Jump Client] Coin collected! Total:", coinsCollectedRef.current);
        playCoinSound();
        addParticles(coin.x, coin.y, '#FFD700', 8);
      }
    });
    
    // Power-up collection
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return;
      
      const dx = player.x - powerUp.x;
      const dy = player.y - powerUp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_WIDTH / 2 + 20) {
        powerUp.collected = true;
        activatePowerUp(powerUp.type);
        addParticles(powerUp.x, powerUp.y, POWERUP_CONFIG[powerUp.type].color, 15);
      }
    });
    
    // Clean up expired power-ups
    activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.endTime > nowMs);
    
    // Check game over (fell below screen)
    if (player.y > cameraYRef.current + CANVAS_HEIGHT + 100) {
      endGame();
      return;
    }
    
    // Draw everything
    drawBackground(ctx);
    
    // Draw platforms
    platformsRef.current.forEach(platform => {
      const screenY = platform.y - cameraYRef.current;
      if (screenY > -50 && screenY < CANVAS_HEIGHT + 50) {
        drawPlatform(ctx, platform, screenY);
      }
    });
    
    // Draw coins
    coinsRef.current.forEach(coin => {
      const screenY = coin.y - cameraYRef.current;
      if (screenY > -50 && screenY < CANVAS_HEIGHT + 50) {
        drawCoin(ctx, coin, screenY);
      }
    });
    
    // Draw power-ups
    powerUpsRef.current.forEach(powerUp => {
      const screenY = powerUp.y - cameraYRef.current;
      if (screenY > -50 && screenY < CANVAS_HEIGHT + 50) {
        drawPowerUp(ctx, powerUp, screenY);
      }
    });
    
    // Draw particles
    drawParticles(ctx);
    
    // Draw player
    const playerScreenY = player.y - cameraYRef.current;
    drawPlayer(ctx, playerScreenY);
    
    // Draw HUD
    drawHUD(ctx);
    
    setScore(coinsCollectedRef.current);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [
    isPowerUpActive, activatePowerUp, generatePlatform, maybeSpawnCoin, maybeSpawnPowerUp,
    drawBackground, drawPlatform, drawPlayer, drawCoin, drawPowerUp, drawParticles, drawHUD,
    playJumpSound, playSuperJumpSound, playCoinSound, playBreakSound, addParticles, addJumpParticles, triggerScreenShake
  ]);
  
  const endGame = useCallback(() => {
    gameActiveRef.current = false;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    playGameOverSound();
    triggerScreenShake(15, 500);
    
    const finalScore = coinsCollectedRef.current;
    const totalCoins = coinsRef.current.length;
    const collectedCoins = coinsRef.current.filter(c => c.collected).length;
    console.log("[Donut Jump Client] Game over - finalScore:", finalScore, "totalCoins:", totalCoins, "collectedCoins:", collectedCoins, "height:", maxHeightRef.current);
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
          gameId: 'donut-jump',
          gameName: 'Donut Jump',
          score: finalScore,
        }),
      }).catch(console.error);
    }
  }, [playGameOverSound, triggerScreenShake, submitScore, fetchLeaderboard, address, context]);
  
  const startGame = useCallback(() => {
    initAudioContext();
    
    playerRef.current = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 100, vx: 0, vy: JUMP_FORCE, facingRight: true };
    platformsRef.current = [];
    coinsRef.current = [];
    powerUpsRef.current = [];
    activePowerUpsRef.current = [];
    particlesRef.current = [];
    bgParticlesRef.current = [];
    
    cameraYRef.current = 0;
    maxHeightRef.current = 0;
    coinsCollectedRef.current = 0;
    frameCountRef.current = 0;
    hasShieldRef.current = false;
    invincibleUntilRef.current = 0;
    screenShakeRef.current = { intensity: 0, duration: 0, startTime: 0 };
    
    generateInitialPlatforms();
    
    setScore(0);
    setGameState("playing");
    lastFrameTimeRef.current = performance.now();
    gameActiveRef.current = true;
    
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [initAudioContext, generateInitialPlatforms, gameLoop]);
  
  // Handle blockchain play
  const recordEntryAndStartGame = useCallback(async (hash: string) => {
    if (!context?.user) return;
    setPlayState('recording');
    try {
      const res = await fetch("/api/games/donut-jump/free-entry", {
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
        currentFidRef.current = context.user.fid;  // Store fid for score submission
        console.log("[Donut Jump Client] Entry recorded, fid stored:", context.user.fid);
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
  }, [context?.user, address, resetWrite, startGame]);
  
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
      args: ["donut-jump"],
    });
  }, [address, context?.user?.fid, writeContract]);
  
  useEffect(() => {
    if (isConfirmed && txHash && playState === 'confirming') {
      recordEntryAndStartGame(txHash);
    }
  }, [isConfirmed, txHash, playState, recordEntryAndStartGame]);
  
  useEffect(() => {
    if (writeError) {
      setPlayState('error');
      setErrorMessage(writeError.message?.includes("User rejected") ? "Transaction rejected" : "Transaction failed");
    }
  }, [writeError]);
  
  // Touch/Mouse controls
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (gameState !== "playing") return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const mid = rect.width / 2;
    
    if (x < mid) {
      moveLeftRef.current = true;
    } else {
      moveRightRef.current = true;
    }
  }, [gameState]);
  
  const handlePointerUp = useCallback(() => {
    moveLeftRef.current = false;
    moveRightRef.current = false;
  }, []);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeftRef.current = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRightRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeftRef.current = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRightRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🍩⬆️ I collected ${score} donuts in Donut Jump!`;
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
    
    // Initialize menu bg particles
    const menuParticles: { x: number; y: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < 30; i++) {
      menuParticles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: 1 + Math.random() * 2,
        alpha: 0.05 + Math.random() * 0.15,
      });
    }
    
    const draw = () => {
      const time = (performance.now() - startTime) / 1000;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      // Dark gradient background like Flappy Donut
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(1, '#0d0d0d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Background particles
      menuParticles.forEach(p => {
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
      
      // Floating platforms
      for (let i = 0; i < 5; i++) {
        const y = 120 + i * 70 + Math.sin(time + i) * 10;
        const x = 50 + i * 60;
        const platformGradient = ctx.createLinearGradient(x, y, x, y + 15);
        platformGradient.addColorStop(0, '#4ade80');
        platformGradient.addColorStop(1, '#22c55e');
        ctx.fillStyle = platformGradient;
        ctx.beginPath();
        ctx.roundRect(x, y, 70, 15, 5);
        ctx.fill();
      }
      
      // Bouncing character
      const bounceY = Math.abs(Math.sin(time * 3)) * 40;
      const playerY = 200 - bounceY;
      const playerX = CANVAS_WIDTH / 2;
      
      ctx.save();
      ctx.translate(playerX, playerY);
      
      if (pfpImageRef.current && pfpLoadedRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(pfpImageRef.current, -25, -25, 50, 50);
        ctx.restore();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#F472B6';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#F472B6';
        ctx.shadowColor = '#F472B6';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      
      // Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DONUT JUMP', CANVAS_WIDTH / 2, 60);
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 290);
        
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 340);
        ctx.shadowBlur = 0;
        
        // Draw donut image + text for "donuts collected"
        ctx.fillStyle = '#888888';
        ctx.font = '14px monospace';
        if (donutImageRef.current && donutLoadedRef.current) {
          ctx.drawImage(donutImageRef.current, CANVAS_WIDTH / 2 - 70, 352, 16, 16);
          ctx.fillText('donuts collected', CANVAS_WIDTH / 2 + 10, 365);
        } else {
          ctx.fillText('🍩 donuts collected', CANVAS_WIDTH / 2, 365);
        }
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, score]);
  
  const isPlayPending = playState === 'confirming' || playState === 'recording' || isPending || isConfirming;
  
  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent !important; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        <Header title="DONUT JUMP" user={context?.user} />
        
        {/* Prize Pool Tile */}
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
        
        {/* Game Canvas */}
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={SCALED_WIDTH}
              height={SCALED_HEIGHT}
              className="rounded-2xl border border-zinc-800 w-full h-full select-none"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
            />
            
            {gameState === "playing" && (
              <div
                className="absolute inset-0 z-10 select-none"
                style={{ touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
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
                    <span className="text-xs text-zinc-400">Free to play (gas only ~$0.001)</span>
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
          </div>
        </div>
        
        {/* Control buttons */}
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
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div>
              <button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-green-400" />Gameplay</h3>
                <p className="text-xs text-zinc-400">Tap left or right side of the screen to move. Your character bounces automatically on platforms. Climb as high as you can!</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-blue-400" />Platforms</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-500 rounded"></span><span className="text-zinc-400">Normal</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 bg-blue-500 rounded"></span><span className="text-zinc-400">Moving</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 bg-purple-500 rounded"></span><span className="text-zinc-400">Breakable</span></div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-500 rounded"></span><span className="text-zinc-400">Disappearing</span></div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Rocket className="w-4 h-4 text-orange-400" />Power-Ups</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2"><span>🚀</span><span className="text-zinc-400">Jetpack - Fly up!</span></div>
                  <div className="flex items-center gap-2"><span>👟</span><span className="text-zinc-400">Spring Shoes</span></div>
                  <div className="flex items-center gap-2"><span>🛡️</span><span className="text-zinc-400">Shield - 1 hit</span></div>
                  <div className="flex items-center gap-2"><span>🧲</span><span className="text-zinc-400">Magnet - Pull coins</span></div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-400" />Scoring</h3>
                <p className="text-xs text-zinc-400">Collect donuts to score points! The higher you climb, the more donuts appear.</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-green-400" />Weekly Prizes</h3>
                <p className="text-xs text-zinc-400">FREE TO PLAY! Top 10 players each week win USDC prizes distributed every Friday at 6PM EST.</p>
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
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
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
            <div className="max-h-[50vh] overflow-y-auto">
              {leaderboard.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-zinc-500">No scores yet!</p>
                  <p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p>
                </div>
              ) : leaderboard.map((entry) => {
                const prize = prizeInfo.prizeStructure.find(p => p.rank === entry.rank);
                return (
                  <div key={entry.fid} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-green-500/10" : ""}`}>
                    <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-green-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                    </span>
                    {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700" />}
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
      
      <NavBar />
    </main>
  );
}