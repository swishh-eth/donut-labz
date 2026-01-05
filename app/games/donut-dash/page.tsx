"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Play, Share2, X, HelpCircle, Volume2, VolumeX, Trophy, ChevronRight, Clock, Sparkles, Ghost, Zap } from "lucide-react";

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

// Combo settings
const COMBO_WINDOW = 500; // ms to chain coins
const NEAR_MISS_DISTANCE = 25; // pixels for near-miss bonus

// Zone thresholds (by score) - spread out for better pacing
const ZONES = [
  { name: 'Factory', threshold: 0, bg1: '#1a1a1a', bg2: '#0d0d0d', accent: '#FF6B00', gridColor: 'rgba(255, 255, 255, 0.02)' },
  { name: 'Lava', threshold: 100, bg1: '#2a1a0a', bg2: '#1a0a00', accent: '#FF4400', gridColor: 'rgba(255, 100, 0, 0.03)' },
  { name: 'Ice', threshold: 250, bg1: '#0a1a2a', bg2: '#001020', accent: '#00CCFF', gridColor: 'rgba(0, 200, 255, 0.03)' },
  { name: 'Space', threshold: 400, bg1: '#0a0a1a', bg2: '#000010', accent: '#AA00FF', gridColor: 'rgba(150, 0, 255, 0.03)' },
];

// Milestone thresholds - spread out by 200 for better pacing
const MILESTONES = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000];

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

// Types
type ObstacleType = 'zapper_h' | 'zapper_v' | 'zapper_diag' | 'zapper_moving' | 'missile' | 'laser' | 'zapper_rotating';
type PowerUpType = 'magnet' | 'shield' | 'slowmo' | 'rocket' | 'ghost';
type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

interface Obstacle { 
  x: number; 
  y: number; 
  type: ObstacleType; 
  width: number; 
  height: number; 
  angle?: number;
  // For moving zappers
  baseY?: number;
  moveRange?: number;
  moveSpeed?: number;
  movePhase?: number;
  // For missiles
  velocityY?: number;
  targetY?: number;
  // For lasers
  warningTime?: number;
  firingTime?: number;
  active?: boolean;
  // For rotating
  rotationSpeed?: number;
  centerX?: number;
  centerY?: number;
  orbitRadius?: number;
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

interface Coin { x: number; y: number; collected: boolean; trail?: { x: number; y: number; alpha: number }[]; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface LeaderboardEntry { rank: number; fid: number; username?: string; displayName?: string; pfpUrl?: string; score: number; }
type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

// Ghost run recording
interface GhostFrame {
  y: number;
  isThrusting: boolean;
}

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

// Power-up colors and icons
const POWERUP_CONFIG: Record<PowerUpType, { color: string; icon: string; duration: number }> = {
  magnet: { color: '#FF00FF', icon: '🧲', duration: 5000 },
  shield: { color: '#00FFFF', icon: '🛡️', duration: 0 }, // One-time use
  slowmo: { color: '#FFFF00', icon: '⏱️', duration: 3000 },
  rocket: { color: '#FF6600', icon: '🚀', duration: 4000 },
  ghost: { color: '#AAAAFF', icon: '👻', duration: 3000 },
};

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
  const [isMuted, setIsMuted] = useState(false);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [showGhost, setShowGhost] = useState(true);
  
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
  
  // Display state for UI
  const [currentZone, setCurrentZone] = useState(ZONES[0]);
  const [comboDisplay, setComboDisplay] = useState(0);
  const [activePowerUpsDisplay, setActivePowerUpsDisplay] = useState<ActivePowerUp[]>([]);
  
  // Game refs
  const playerRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0, isThrusting: false });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const coinsCollectedRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const bgElementsRef = useRef<{ x: number; y: number; type: string; speed: number; height?: number }[]>([]);
  const hasStartedFlyingRef = useRef(false);
  
  // Combo system refs
  const comboRef = useRef(0);
  const lastCoinTimeRef = useRef(0);
  const nearMissBonusRef = useRef(0);
  
  // Screen shake refs
  const screenShakeRef = useRef({ intensity: 0, duration: 0, startTime: 0 });
  
  // Milestone tracking
  const lastMilestoneRef = useRef(0);
  
  // Zone tracking
  const currentZoneRef = useRef(ZONES[0]);
  
  // Ghost run refs
  const ghostRecordingRef = useRef<GhostFrame[]>([]);
  const bestGhostRef = useRef<GhostFrame[]>([]);
  const bestGhostScoreRef = useRef(0);
  
  // Shield hit tracking
  const hasShieldRef = useRef(false);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const thrustOscRef = useRef<OscillatorNode | null>(null);
  const thrustGainRef = useRef<GainNode | null>(null);
  const baseMusicTempoRef = useRef(1);
  
  // Profile picture image ref for player avatar
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const pfpLoadedRef = useRef(false);

  // Contract write for free play
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Donut is always white
  const getDonutColor = useCallback(() => {
    return '#FFFFFF';
  }, []);

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
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  }, [context?.user?.fid]);

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

  // Load profile picture for player avatar
  useEffect(() => {
    if (context?.user?.pfpUrl && !pfpLoadedRef.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        pfpImageRef.current = img;
        pfpLoadedRef.current = true;
      };
      img.onerror = () => {
        pfpImageRef.current = null;
        pfpLoadedRef.current = false;
      };
      img.src = context.user.pfpUrl;
    }
  }, [context?.user?.pfpUrl]);

  // Audio functions
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
      } catch {}
    }
  }, []);

  // Pitch-shifted collect sound based on combo
  const playCollectSound = useCallback((combo: number = 1) => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // Pitch increases with combo
      const baseFreq = 800 + Math.min(combo * 50, 400);
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
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
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [isMuted]);

  const playMilestoneSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      // Play a triumphant chord
      const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.05 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + 0.5);
      });
    } catch {}
  }, [isMuted]);

  const playNearMissSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, [isMuted]);

  const playHeartbeatSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
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

  const playShieldBreakSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      // Shimmering break sound
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(1000 + i * 200, ctx.currentTime + i * 0.02);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.02 + 0.2);
        osc.start(ctx.currentTime + i * 0.02);
        osc.stop(ctx.currentTime + i * 0.02 + 0.2);
      }
    } catch {}
  }, [isMuted]);

  const startThrustSound = useCallback(() => {
    if (isMuted || !audioContextRef.current || thrustOscRef.current) return;
    try {
      const ctx = audioContextRef.current;
      
      const bufferSize = ctx.sampleRate * 0.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, ctx.currentTime);
      noiseFilter.Q.setValueAtTime(0.5, ctx.currentTime);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06, ctx.currentTime);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      const rumble = ctx.createOscillator();
      rumble.type = 'triangle';
      rumble.frequency.setValueAtTime(55, ctx.currentTime);
      
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.04, ctx.currentTime);
      
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(6, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(8, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(rumble.frequency);
      
      rumble.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      
      noise.start();
      rumble.start();
      lfo.start();
      
      thrustOscRef.current = rumble;
      thrustGainRef.current = rumbleGain;
      (thrustOscRef.current as any)._noise = noise;
      (thrustOscRef.current as any)._noiseGain = noiseGain;
      (thrustOscRef.current as any)._lfo = lfo;
    } catch {}
  }, [isMuted]);

  const stopThrustSound = useCallback(() => {
    try {
      const ctx = audioContextRef.current;
      const fadeTime = ctx?.currentTime ? ctx.currentTime + 0.15 : 0;
      
      if (thrustGainRef.current && ctx) {
        thrustGainRef.current.gain.exponentialRampToValueAtTime(0.001, fadeTime);
      }
      
      if (thrustOscRef.current && (thrustOscRef.current as any)._noiseGain && ctx) {
        (thrustOscRef.current as any)._noiseGain.gain.exponentialRampToValueAtTime(0.001, fadeTime);
      }
      
      if (thrustOscRef.current) {
        const osc = thrustOscRef.current as any;
        setTimeout(() => {
          try {
            osc.stop?.();
            osc._noise?.stop?.();
            osc._lfo?.stop?.();
          } catch {}
        }, 150);
        thrustOscRef.current = null;
        thrustGainRef.current = null;
      }
    } catch {}
  }, []);

  // Screen shake helper
  const triggerScreenShake = useCallback((intensity: number, duration: number) => {
    screenShakeRef.current = {
      intensity,
      duration,
      startTime: performance.now(),
    };
  }, []);

  // Check if power-up is active
  const isPowerUpActive = useCallback((type: PowerUpType): boolean => {
    const now = Date.now();
    return activePowerUpsRef.current.some(p => p.type === type && p.endTime > now);
  }, []);

  // Add power-up
  const activatePowerUp = useCallback((type: PowerUpType) => {
    const config = POWERUP_CONFIG[type];
    const now = Date.now();
    
    if (type === 'shield') {
      hasShieldRef.current = true;
    } else {
      // Remove existing power-up of same type
      activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.type !== type);
      activePowerUpsRef.current.push({ type, endTime: now + config.duration });
    }
    
    setActivePowerUpsDisplay([...activePowerUpsRef.current]);
    playPowerUpSound();
  }, [playPowerUpSound]);

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
    const currentScore = coinsCollectedRef.current;
    const zone = currentZoneRef.current;
    
    // Available obstacle types based on zone
    let types: ObstacleType[] = ['zapper_h', 'zapper_v', 'zapper_diag'];
    
    // Add more obstacle types as zones progress
    if (zone.threshold >= 100) types.push('zapper_moving');
    if (zone.threshold >= 250) types.push('missile', 'laser');
    if (zone.threshold >= 400) types.push('zapper_rotating');
    
    const type = types[Math.floor(Math.random() * types.length)];
    let obstacle: Obstacle;
    
    if (type === 'zapper_h') {
      obstacle = { 
        x: CANVAS_WIDTH + 20, 
        y: 60 + Math.random() * (CANVAS_HEIGHT - 180), 
        type, 
        width: 80 + Math.random() * 40, 
        height: 12 
      };
    } else if (type === 'zapper_v') {
      const fromTop = Math.random() > 0.5;
      obstacle = { 
        x: CANVAS_WIDTH + 20, 
        y: fromTop ? 30 : CANVAS_HEIGHT - 30 - (60 + Math.random() * 80), 
        type, 
        width: 12, 
        height: 60 + Math.random() * 80 
      };
    } else if (type === 'zapper_diag') {
      obstacle = { 
        x: CANVAS_WIDTH + 20, 
        y: 60 + Math.random() * (CANVAS_HEIGHT - 200), 
        type, 
        width: 100, 
        height: 100, 
        angle: Math.random() > 0.5 ? 45 : -45 
      };
    } else if (type === 'zapper_moving') {
      const baseY = 100 + Math.random() * (CANVAS_HEIGHT - 260);
      obstacle = {
        x: CANVAS_WIDTH + 20,
        y: baseY,
        type,
        width: 70,
        height: 12,
        baseY,
        moveRange: 60 + Math.random() * 40,
        moveSpeed: 0.03 + Math.random() * 0.02,
        movePhase: Math.random() * Math.PI * 2,
      };
    } else if (type === 'missile') {
      const playerY = playerRef.current.y;
      obstacle = {
        x: CANVAS_WIDTH + 40,
        y: playerY + (Math.random() - 0.5) * 100,
        type,
        width: 30,
        height: 12,
        targetY: playerY,
        velocityY: 0,
      };
    } else if (type === 'laser') {
      obstacle = {
        x: CANVAS_WIDTH + 20,
        y: 60 + Math.random() * (CANVAS_HEIGHT - 180),
        type,
        width: CANVAS_WIDTH,
        height: 8,
        warningTime: 60, // frames of warning
        firingTime: 30, // frames of firing
        active: false,
      };
    } else if (type === 'zapper_rotating') {
      const centerX = CANVAS_WIDTH + 60;
      const centerY = 100 + Math.random() * (CANVAS_HEIGHT - 200);
      obstacle = {
        x: centerX,
        y: centerY,
        type,
        width: 60,
        height: 12,
        centerX,
        centerY,
        orbitRadius: 40,
        angle: Math.random() * 360,
        rotationSpeed: 2 + Math.random() * 2,
      };
    } else {
      return;
    }
    
    obstaclesRef.current.push(obstacle);
  }, []);

  const spawnPowerUp = useCallback(() => {
    const types: PowerUpType[] = ['magnet', 'shield', 'slowmo', 'rocket', 'ghost'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    powerUpsRef.current.push({
      x: CANVAS_WIDTH + 30,
      y: 80 + Math.random() * (CANVAS_HEIGHT - 200),
      type,
      collected: false,
    });
  }, []);

  const spawnCoins = useCallback(() => {
    const spawnZoneStart = CANVAS_WIDTH - 50;
    const hasCoinsInSpawnZone = coinsRef.current.some(c => !c.collected && c.x > spawnZoneStart);
    if (hasCoinsInSpawnZone) return;
    
    const patterns = ['line', 'arc', 'wave', 'diagonal', 'zigzag'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const startX = CANVAS_WIDTH + 50;
    
    const minY = 80;
    const maxY = CANVAS_HEIGHT - 120;
    const centerY = minY + Math.random() * (maxY - minY);
    
    const newCoins: Coin[] = [];
    
    if (pattern === 'line') {
      const count = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        newCoins.push({ x: startX + i * 28, y: centerY, collected: false, trail: [] });
      }
    } else if (pattern === 'arc') {
      for (let i = 0; i < 7; i++) {
        const arcY = centerY + Math.sin((i / 6) * Math.PI) * 40;
        const clampedY = Math.max(50, Math.min(CANVAS_HEIGHT - 50, arcY));
        newCoins.push({ x: startX + i * 24, y: clampedY, collected: false, trail: [] });
      }
    } else if (pattern === 'wave') {
      for (let i = 0; i < 7; i++) {
        const waveY = centerY + Math.sin(i * 0.9) * 30;
        const clampedY = Math.max(50, Math.min(CANVAS_HEIGHT - 50, waveY));
        newCoins.push({ x: startX + i * 24, y: clampedY, collected: false, trail: [] });
      }
    } else if (pattern === 'diagonal') {
      const goingUp = Math.random() > 0.5;
      for (let i = 0; i < 5; i++) {
        const diagY = centerY + (goingUp ? -i * 18 : i * 18);
        const clampedY = Math.max(50, Math.min(CANVAS_HEIGHT - 50, diagY));
        newCoins.push({ x: startX + i * 30, y: clampedY, collected: false, trail: [] });
      }
    } else if (pattern === 'zigzag') {
      for (let i = 0; i < 6; i++) {
        const zigY = centerY + (i % 2 === 0 ? -25 : 25);
        const clampedY = Math.max(50, Math.min(CANVAS_HEIGHT - 50, zigY));
        newCoins.push({ x: startX + i * 25, y: clampedY, collected: false, trail: [] });
      }
    }
    
    coinsRef.current.push(...newCoins);
  }, []);

  const addThrustParticles = useCallback(() => {
    const player = playerRef.current;
    if (!player.isThrusting) return;
    
    // Rocket power-up has bigger flames
    const isRocket = isPowerUpActive('rocket');
    const particleCount = isRocket ? 4 : 2;
    
    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push({
        x: PLAYER_X - PLAYER_SIZE / 2,
        y: player.y + PLAYER_SIZE / 2 + Math.random() * 10,
        vx: -3 - Math.random() * (isRocket ? 4 : 2),
        vy: (Math.random() - 0.5) * 2,
        life: 20 + Math.random() * 10,
        color: Math.random() > 0.5 ? '#FF6B00' : '#FFD700',
        size: (isRocket ? 5 : 3) + Math.random() * 4,
      });
    }
  }, [isPowerUpActive]);

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

  const addShieldBreakParticles = useCallback(() => {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      particlesRef.current.push({
        x: PLAYER_X,
        y: playerRef.current.y,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        life: 30,
        color: '#00FFFF',
        size: 6,
      });
    }
  }, []);

  const addMilestoneParticles = useCallback(() => {
    // Burst of golden particles
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      particlesRef.current.push({
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 40 + Math.random() * 20,
        color: Math.random() > 0.5 ? '#FFD700' : '#FFA500',
        size: 6 + Math.random() * 4,
      });
    }
  }, []);

  // Get current zone based on score
  const getCurrentZone = useCallback((score: number) => {
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (score >= ZONES[i].threshold) {
        return ZONES[i];
      }
    }
    return ZONES[0];
  }, []);

  // Draw functions
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    const zone = currentZoneRef.current;
    
    // Zone-based gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, zone.bg1);
    bgGradient.addColorStop(1, zone.bg2);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Subtle grid pattern with zone color
    ctx.strokeStyle = zone.gridColor;
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
    
    // Space zone: add stars
    if (zone.name === 'Space') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = 0; i < 50; i++) {
        const x = (frameCountRef.current * 0.5 + i * 73) % CANVAS_WIDTH;
        const y = (i * 97) % CANVAS_HEIGHT;
        const size = (i % 3) + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Ice zone: add floating ice particles
    if (zone.name === 'Ice') {
      ctx.fillStyle = 'rgba(200, 240, 255, 0.3)';
      for (let i = 0; i < 20; i++) {
        const x = (frameCountRef.current * 0.3 + i * 89) % CANVAS_WIDTH;
        const y = (i * 67 + frameCountRef.current * 0.1) % CANVAS_HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Lava zone: add embers rising
    if (zone.name === 'Lava') {
      for (let i = 0; i < 15; i++) {
        const x = (i * 83) % CANVAS_WIDTH;
        const y = CANVAS_HEIGHT - ((frameCountRef.current * 0.5 + i * 47) % CANVAS_HEIGHT);
        const alpha = 0.3 + Math.sin(frameCountRef.current * 0.1 + i) * 0.2;
        ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 2 + Math.sin(frameCountRef.current * 0.2 + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    const intensity = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    
    // Speed lines with zone accent color
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
    
    // Hazard stripes - use zone accent
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
    ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
    
    const stripeOffset = (frameCountRef.current * speed) % 30;
    ctx.fillStyle = zone.accent + 'BB';
    for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 15, 0); ctx.lineTo(x + 5, 30); ctx.lineTo(x - 10, 30);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, CANVAS_HEIGHT); ctx.lineTo(x + 15, CANVAS_HEIGHT); ctx.lineTo(x + 5, CANVAS_HEIGHT - 30); ctx.lineTo(x - 10, CANVAS_HEIGHT - 30);
      ctx.closePath(); ctx.fill();
    }
  }, []);

  const drawGhost = useCallback((ctx: CanvasRenderingContext2D) => {
    // Only draw ghost if enabled, has data, and player has started flying
    if (!showGhost || !hasStartedFlyingRef.current || bestGhostRef.current.length === 0) return;
    
    const frameIndex = Math.min(frameCountRef.current, bestGhostRef.current.length - 1);
    if (frameIndex < 0) return;
    
    const ghostFrame = bestGhostRef.current[frameIndex];
    if (!ghostFrame) return;
    
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(PLAYER_X - 20, ghostFrame.y);
    
    // Ghost donut
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = currentZoneRef.current.bg1;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }, [showGhost]);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const x = PLAYER_X;
    const y = player.y;
    const tilt = Math.max(-0.4, Math.min(0.4, player.velocity * 0.04));
    const donutColor = getDonutColor();
    
    // Check for active power-ups
    const isGhost = isPowerUpActive('ghost');
    const isRocket = isPowerUpActive('rocket');
    const hasShield = hasShieldRef.current;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    
    // Ghost effect
    if (isGhost) {
      ctx.globalAlpha = 0.5;
    }
    
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
    
    // Flames (bigger for rocket)
    if (player.isThrusting || isRocket) {
      const time = frameCountRef.current * 0.15;
      const baseFlameSize = isRocket ? 35 : 22;
      const flameSize = baseFlameSize + Math.sin(time * 4) * 8;
      const flameWidth = (isRocket ? 18 : 12) + Math.sin(time * 5) * 3;
      
      // Outer flame
      const outerFlame = ctx.createLinearGradient(tankX + 8, tankY + 40, tankX + 8, tankY + 40 + flameSize);
      outerFlame.addColorStop(0, isRocket ? '#00AAFF' : '#FF6B00');
      outerFlame.addColorStop(0.3, isRocket ? '#0066FF' : '#FF4500');
      outerFlame.addColorStop(0.6, isRocket ? '#0044AA' : '#FF2200');
      outerFlame.addColorStop(1, 'transparent');
      ctx.fillStyle = outerFlame;
      ctx.beginPath();
      ctx.moveTo(tankX + 8 - flameWidth/2, tankY + 40);
      ctx.quadraticCurveTo(tankX + 8 - flameWidth/3, tankY + 40 + flameSize * 0.6, tankX + 8, tankY + 40 + flameSize);
      ctx.quadraticCurveTo(tankX + 8 + flameWidth/3, tankY + 40 + flameSize * 0.6, tankX + 8 + flameWidth/2, tankY + 40);
      ctx.fill();
      
      // Inner flame
      const innerSize = flameSize * 0.6;
      const innerFlame = ctx.createLinearGradient(tankX + 8, tankY + 40, tankX + 8, tankY + 40 + innerSize);
      innerFlame.addColorStop(0, '#FFFFFF');
      innerFlame.addColorStop(0.3, isRocket ? '#AADDFF' : '#FFFF00');
      innerFlame.addColorStop(0.6, isRocket ? '#00AAFF' : '#FFA500');
      innerFlame.addColorStop(1, 'transparent');
      ctx.fillStyle = innerFlame;
      ctx.beginPath();
      ctx.moveTo(tankX + 8 - flameWidth/4, tankY + 40);
      ctx.quadraticCurveTo(tankX + 8 - flameWidth/6, tankY + 40 + innerSize * 0.5, tankX + 8, tankY + 40 + innerSize);
      ctx.quadraticCurveTo(tankX + 8 + flameWidth/6, tankY + 40 + innerSize * 0.5, tankX + 8 + flameWidth/4, tankY + 40);
      ctx.fill();
    }
    
    // Player avatar (pfp or fallback donut)
    const radius = PLAYER_SIZE / 2;
    
    if (pfpImageRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pfpImageRef.current, -radius, -radius, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
      
      ctx.lineWidth = player.isThrusting ? 3 : 2;
      ctx.strokeStyle = player.isThrusting ? '#FF6B00' : '#FFFFFF';
      ctx.shadowColor = player.isThrusting ? '#FF4500' : '#FFFFFF';
      ctx.shadowBlur = player.isThrusting ? 30 : 12;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      if (player.isThrusting) {
        ctx.strokeStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
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
      
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Shield effect
    if (hasShield) {
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      
      // Animated shield particles
      const shieldTime = frameCountRef.current * 0.1;
      for (let i = 0; i < 6; i++) {
        const angle = shieldTime + (i / 6) * Math.PI * 2;
        const sx = Math.cos(angle) * (radius + 8);
        const sy = Math.sin(angle) * (radius + 8);
        ctx.fillStyle = '#00FFFF';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  }, [getDonutColor, isPowerUpActive]);

  const drawObstacles = useCallback((ctx: CanvasRenderingContext2D) => {
    const time = frameCountRef.current * 0.1;
    const zone = currentZoneRef.current;
    
    obstaclesRef.current.forEach(obstacle => {
      ctx.save();
      
      // Handle special obstacle types
      if (obstacle.type === 'missile') {
        // Draw missile
        const missileX = obstacle.x;
        const missileY = obstacle.y;
        
        // Missile body
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.ellipse(missileX, missileY, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Nose cone
        ctx.fillStyle = '#AA0000';
        ctx.beginPath();
        ctx.moveTo(missileX - 15, missileY);
        ctx.lineTo(missileX - 25, missileY);
        ctx.lineTo(missileX - 15, missileY - 4);
        ctx.lineTo(missileX - 15, missileY + 4);
        ctx.closePath();
        ctx.fill();
        
        // Fins
        ctx.fillStyle = '#CC2222';
        ctx.beginPath();
        ctx.moveTo(missileX + 10, missileY - 6);
        ctx.lineTo(missileX + 18, missileY - 12);
        ctx.lineTo(missileX + 15, missileY - 6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(missileX + 10, missileY + 6);
        ctx.lineTo(missileX + 18, missileY + 12);
        ctx.lineTo(missileX + 15, missileY + 6);
        ctx.closePath();
        ctx.fill();
        
        // Exhaust
        ctx.fillStyle = `rgba(255, 200, 0, ${0.5 + Math.sin(time * 5) * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(missileX + 15, missileY);
        ctx.lineTo(missileX + 25 + Math.sin(time * 8) * 5, missileY);
        ctx.lineTo(missileX + 15, missileY + 4);
        ctx.lineTo(missileX + 15, missileY - 4);
        ctx.closePath();
        ctx.fill();
        
        // Warning indicator
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚠', missileX, missileY - 15);
        
        ctx.restore();
        return;
      }
      
      if (obstacle.type === 'laser') {
        const laserX = obstacle.x;
        const laserY = obstacle.y;
        
        if (obstacle.warningTime && obstacle.warningTime > 0) {
          // Warning phase - flashing line
          const flash = Math.sin(time * 10) > 0;
          if (flash) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, laserY);
            ctx.lineTo(CANVAS_WIDTH, laserY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          
          // Warning markers on sides
          ctx.fillStyle = '#FF0000';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('⚡', 5, laserY + 5);
          ctx.textAlign = 'right';
          ctx.fillText('⚡', CANVAS_WIDTH - 5, laserY + 5);
        } else if (obstacle.active) {
          // Firing phase - full laser beam
          ctx.shadowColor = '#FF0000';
          ctx.shadowBlur = 20;
          
          // Outer glow
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
          ctx.lineWidth = 20;
          ctx.beginPath();
          ctx.moveTo(0, laserY);
          ctx.lineTo(CANVAS_WIDTH, laserY);
          ctx.stroke();
          
          // Main beam
          ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(0, laserY);
          ctx.lineTo(CANVAS_WIDTH, laserY);
          ctx.stroke();
          
          // Core
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, laserY);
          ctx.lineTo(CANVAS_WIDTH, laserY);
          ctx.stroke();
          
          ctx.shadowBlur = 0;
        }
        
        ctx.restore();
        return;
      }
      
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
      } else if (obstacle.type === 'zapper_moving') {
        x1 = obstacle.x;
        y1 = obstacle.y + obstacle.height / 2;
        x2 = obstacle.x + obstacle.width;
        y2 = obstacle.y + obstacle.height / 2;
      } else if (obstacle.type === 'zapper_rotating' && obstacle.centerX !== undefined) {
        const angleRad = ((obstacle.angle || 0) * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        x1 = obstacle.centerX - halfLength * Math.cos(angleRad);
        y1 = obstacle.centerY! - halfLength * Math.sin(angleRad);
        x2 = obstacle.centerX + halfLength * Math.cos(angleRad);
        y2 = obstacle.centerY! + halfLength * Math.sin(angleRad);
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
      
      // Inner node glow - use zone accent
      ctx.fillStyle = zone.accent;
      ctx.beginPath();
      ctx.arc(x1, y1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer glow
      ctx.shadowColor = zone.accent;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = zone.accent + '4D';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Mid glow
      ctx.shadowBlur = 15;
      ctx.strokeStyle = zone.accent + '80';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Electric beam with flickering jagged effect
      ctx.shadowColor = zone.accent;
      ctx.shadowBlur = 10;
      const flicker = 0.7 + Math.sin(time * 8 + obstacle.x) * 0.3;
      ctx.strokeStyle = `${zone.accent}${Math.floor(flicker * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      
      const segments = 8;
      const dx = (x2 - x1) / segments;
      const dy = (y2 - y1) / segments;
      const len = Math.sqrt(dx*dx + dy*dy);
      const perpX = len > 0 ? -dy / len * 4 : 0;
      const perpY = len > 0 ? dx / len * 4 : 0;
      
      for (let i = 1; i < segments; i++) {
        const jitter = Math.sin(time * 15 + i * 2 + obstacle.x * 0.1) * (i % 2 === 0 ? 1 : -1);
        ctx.lineTo(x1 + dx * i + perpX * jitter, y1 + dy * i + perpY * jitter);
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

  const drawPowerUps = useCallback((ctx: CanvasRenderingContext2D) => {
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return;
      
      const config = POWERUP_CONFIG[powerUp.type];
      const float = Math.sin(frameCountRef.current * 0.1 + powerUp.x * 0.05) * 5;
      const pulse = 1 + Math.sin(frameCountRef.current * 0.15) * 0.1;
      
      ctx.save();
      ctx.translate(powerUp.x, powerUp.y + float);
      ctx.scale(pulse, pulse);
      
      // Glow
      ctx.shadowColor = config.color;
      ctx.shadowBlur = 20;
      
      // Background circle
      ctx.fillStyle = config.color + '40';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
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
    });
  }, []);

  const drawCoins = useCallback((ctx: CanvasRenderingContext2D) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    const isMagnet = isPowerUpActive('magnet');
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      // Draw trail
      if (coin.trail && coin.trail.length > 0) {
        coin.trail.forEach((t, i) => {
          ctx.globalAlpha = t.alpha;
          const color = colors[Math.floor(coin.x / 40) % colors.length];
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      
      ctx.save();
      ctx.translate(coin.x, coin.y);
      const float = Math.sin(frameCountRef.current * 0.12 + coin.x * 0.05) * 4;
      ctx.translate(0, float);
      
      const color = colors[Math.floor(coin.x / 40) % colors.length];
      
      // Magnet attraction visual
      if (isMagnet) {
        const dx = PLAYER_X - coin.x;
        const dy = playerRef.current.y - coin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.strokeStyle = '#FF00FF44';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(dx * 0.3, dy * 0.3);
          ctx.stroke();
        }
      }
      
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-9, -4, 18, 8, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }, [isPowerUpActive]);

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

  const drawCombo = useCallback((ctx: CanvasRenderingContext2D) => {
    if (comboRef.current <= 1) return;
    
    const combo = comboRef.current;
    const scale = 1 + Math.sin(frameCountRef.current * 0.3) * 0.1;
    
    ctx.save();
    ctx.translate(CANVAS_WIDTH - 60, 70);
    ctx.scale(scale, scale);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 10;
    ctx.fillText(`${combo}x`, 0, 0);
    
    ctx.font = '10px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.fillText('COMBO', 0, 14);
    
    ctx.restore();
  }, []);

  const drawActivePowerUps = useCallback((ctx: CanvasRenderingContext2D) => {
    const now = Date.now();
    const activePowerUps = activePowerUpsRef.current.filter(p => p.endTime > now);
    
    activePowerUps.forEach((powerUp, index) => {
      const config = POWERUP_CONFIG[powerUp.type];
      const remaining = (powerUp.endTime - now) / config.duration;
      const x = 20 + index * 35;
      const y = 90;
      
      ctx.save();
      ctx.translate(x, y);
      
      // Background
      ctx.fillStyle = '#00000080';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // Progress ring
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
      ctx.stroke();
      
      // Icon
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.icon, 0, 0);
      
      ctx.restore();
    });
    
    // Show shield separately
    if (hasShieldRef.current) {
      const x = 20 + activePowerUps.length * 35;
      ctx.save();
      ctx.translate(x, 90);
      ctx.fillStyle = '#00000080';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', 0, 0);
      ctx.restore();
    }
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

  const checkCollisions = useCallback((): { hit: boolean; nearMiss: boolean } => {
    const player = playerRef.current;
    const playerRadius = PLAYER_SIZE / 2 - 5;
    const isGhost = isPowerUpActive('ghost');
    const isRocket = isPowerUpActive('rocket');
    
    // Ghost and rocket are invincible
    if (isGhost || isRocket) {
      return { hit: false, nearMiss: false };
    }
    
    // Boundary check
    if (player.y - playerRadius < 30 || player.y + playerRadius > CANVAS_HEIGHT - 30) {
      if (hasShieldRef.current) {
        hasShieldRef.current = false;
        addShieldBreakParticles();
        playShieldBreakSound();
        // Bounce player back
        player.y = player.y - playerRadius < 30 ? 30 + playerRadius + 5 : CANVAS_HEIGHT - 30 - playerRadius - 5;
        player.velocity = -player.velocity * 0.5;
        return { hit: false, nearMiss: false };
      }
      return { hit: true, nearMiss: false };
    }
    
    let nearMissDetected = false;
    
    for (const obstacle of obstaclesRef.current) {
      let distance = Infinity;
      
      if (obstacle.type === 'missile') {
        const dx = PLAYER_X - obstacle.x;
        const dy = player.y - obstacle.y;
        distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < playerRadius + 15) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            // Remove the missile
            obstaclesRef.current = obstaclesRef.current.filter(o => o !== obstacle);
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
      } else if (obstacle.type === 'laser' && obstacle.active) {
        const dy = Math.abs(player.y - obstacle.y);
        if (dy < playerRadius + 4) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
        distance = dy;
      } else if (obstacle.type === 'zapper_diag' && obstacle.angle) {
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        const angleRad = (obstacle.angle * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        const x1 = centerX - halfLength * Math.cos(angleRad);
        const y1 = centerY - halfLength * Math.sin(angleRad);
        const x2 = centerX + halfLength * Math.cos(angleRad);
        const y2 = centerY + halfLength * Math.sin(angleRad);
        distance = pointToLineDistance(PLAYER_X, player.y, x1, y1, x2, y2);
        if (distance < playerRadius + 10) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
      } else if (obstacle.type === 'zapper_h' || obstacle.type === 'zapper_moving') {
        distance = pointToLineDistance(PLAYER_X, player.y, obstacle.x, obstacle.y + obstacle.height / 2, obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2);
        if (distance < playerRadius + 10) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
      } else if (obstacle.type === 'zapper_v') {
        distance = pointToLineDistance(PLAYER_X, player.y, obstacle.x + obstacle.width / 2, obstacle.y, obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height);
        if (distance < playerRadius + 10) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
      } else if (obstacle.type === 'zapper_rotating' && obstacle.centerX !== undefined) {
        const angleRad = ((obstacle.angle || 0) * Math.PI) / 180;
        const halfLength = obstacle.width / 2;
        const x1 = obstacle.centerX - halfLength * Math.cos(angleRad);
        const y1 = obstacle.centerY! - halfLength * Math.sin(angleRad);
        const x2 = obstacle.centerX + halfLength * Math.cos(angleRad);
        const y2 = obstacle.centerY! + halfLength * Math.sin(angleRad);
        distance = pointToLineDistance(PLAYER_X, player.y, x1, y1, x2, y2);
        if (distance < playerRadius + 10) {
          if (hasShieldRef.current) {
            hasShieldRef.current = false;
            addShieldBreakParticles();
            playShieldBreakSound();
            return { hit: false, nearMiss: false };
          }
          return { hit: true, nearMiss: false };
        }
      }
      
      // Near miss detection
      if (distance < NEAR_MISS_DISTANCE && distance >= playerRadius + 10) {
        nearMissDetected = true;
      }
    }
    
    return { hit: false, nearMiss: nearMissDetected };
  }, [pointToLineDistance, isPowerUpActive, addShieldBreakParticles, playShieldBreakSound]);

  const checkCoins = useCallback(() => {
    const player = playerRef.current;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    const isMagnet = isPowerUpActive('magnet');
    const isRocket = isPowerUpActive('rocket');
    const now = Date.now();
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      // Magnet effect - pull coins toward player
      if (isMagnet) {
        const dx = PLAYER_X - coin.x;
        const dy = player.y - coin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          const pull = 5 / dist;
          coin.x += dx * pull;
          coin.y += dy * pull;
        }
      }
      
      const dx = PLAYER_X - coin.x;
      const dy = player.y - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < PLAYER_SIZE / 2 + 12) {
        coin.collected = true;
        
        // Combo system
        if (now - lastCoinTimeRef.current < COMBO_WINDOW) {
          comboRef.current++;
        } else {
          comboRef.current = 1;
        }
        lastCoinTimeRef.current = now;
        
        // Calculate points with combo and rocket multiplier
        const comboMultiplier = Math.min(comboRef.current, 10);
        const rocketMultiplier = isRocket ? 2 : 1;
        const points = 1 * comboMultiplier * rocketMultiplier;
        
        coinsCollectedRef.current += points;
        setComboDisplay(comboRef.current);
        
        playCollectSound(comboRef.current);
        addCollectParticles(coin.x, coin.y, colors[Math.floor(coin.x / 40) % colors.length]);
      }
    });
  }, [isPowerUpActive, playCollectSound, addCollectParticles]);

  const checkPowerUps = useCallback(() => {
    const player = playerRef.current;
    
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return;
      
      const dx = PLAYER_X - powerUp.x;
      const dy = player.y - powerUp.y;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_SIZE / 2 + 18) {
        powerUp.collected = true;
        activatePowerUp(powerUp.type);
        
        // Special particles for power-up
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          particlesRef.current.push({
            x: powerUp.x,
            y: powerUp.y,
            vx: Math.cos(angle) * 4,
            vy: Math.sin(angle) * 4,
            life: 30,
            color: POWERUP_CONFIG[powerUp.type].color,
            size: 6,
          });
        }
      }
    });
  }, [activatePowerUp]);

  // Update obstacles
  const updateObstacles = useCallback((speed: number, delta: number) => {
    obstaclesRef.current.forEach(obstacle => {
      // Move horizontally
      obstacle.x -= speed * delta;
      
      // Update special obstacles
      if (obstacle.type === 'zapper_moving' && obstacle.baseY !== undefined) {
        obstacle.movePhase = (obstacle.movePhase || 0) + (obstacle.moveSpeed || 0.03);
        obstacle.y = obstacle.baseY + Math.sin(obstacle.movePhase) * (obstacle.moveRange || 50);
      }
      
      if (obstacle.type === 'missile') {
        // Track player with some lag
        const dy = playerRef.current.y - obstacle.y;
        obstacle.velocityY = (obstacle.velocityY || 0) + dy * 0.01;
        obstacle.velocityY = Math.max(-3, Math.min(3, obstacle.velocityY));
        obstacle.y += obstacle.velocityY;
      }
      
      if (obstacle.type === 'laser') {
        if (obstacle.warningTime && obstacle.warningTime > 0) {
          obstacle.warningTime--;
          if (obstacle.warningTime === 0) {
            obstacle.active = true;
          }
        } else if (obstacle.active && obstacle.firingTime && obstacle.firingTime > 0) {
          obstacle.firingTime--;
          if (obstacle.firingTime === 0) {
            obstacle.active = false;
          }
        }
      }
      
      if (obstacle.type === 'zapper_rotating' && obstacle.centerX !== undefined) {
        obstacle.centerX -= speed * delta;
        obstacle.angle = ((obstacle.angle || 0) + (obstacle.rotationSpeed || 2)) % 360;
      }
    });
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
    
    // Apply screen shake
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
    
    const hasStarted = hasStartedFlyingRef.current;
    
    // Speed affected by slow-mo
    const isSlowMo = isPowerUpActive('slowmo');
    const speedMultiplier = isSlowMo ? 0.5 : 1;
    
    if (hasStarted) speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta * speedMultiplier, MAX_SPEED);
    const speed = hasStarted ? speedRef.current * speedMultiplier : 0;
    
    // Update score display
    setScore(coinsCollectedRef.current);
    
    // Update zone based on score
    const newZone = getCurrentZone(coinsCollectedRef.current);
    if (newZone !== currentZoneRef.current) {
      currentZoneRef.current = newZone;
      setCurrentZone(newZone);
      triggerScreenShake(5, 300);
      addMilestoneParticles();
      playMilestoneSound();
    }
    
    // Check milestones
    const currentScore = coinsCollectedRef.current;
    for (const milestone of MILESTONES) {
      if (currentScore >= milestone && lastMilestoneRef.current < milestone) {
        lastMilestoneRef.current = milestone;
        triggerScreenShake(8, 400);
        addMilestoneParticles();
        playMilestoneSound();
      }
    }
    
    // Update player physics
    const player = playerRef.current;
    const isRocket = isPowerUpActive('rocket');
    
    if (hasStarted) {
      if (isRocket) {
        // Rocket gives controlled flight
        if (player.isThrusting) player.velocity += THRUST * 1.5 * delta;
        else player.velocity += GRAVITY * 0.5 * delta;
      } else {
        if (player.isThrusting) player.velocity += THRUST * delta;
        else player.velocity += GRAVITY * delta;
      }
      player.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, player.velocity));
      player.y += player.velocity * delta;
      player.y = Math.max(30 + PLAYER_SIZE / 2, Math.min(CANVAS_HEIGHT - 30 - PLAYER_SIZE / 2, player.y));
      
      // Record ghost frame
      ghostRecordingRef.current.push({
        y: player.y,
        isThrusting: player.isThrusting,
      });
    }
    
    // Update obstacles
    if (hasStarted) {
      updateObstacles(speed, delta);
      obstaclesRef.current = obstaclesRef.current.filter(o => {
        if (o.type === 'zapper_rotating') {
          return (o.centerX || o.x) > -100;
        }
        return o.x + o.width > -50;
      });
      
      const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
      const baseSpawnGap = 200 + Math.random() * 150;
      const spawnGap = currentScore >= 300 ? baseSpawnGap * 0.75 : baseSpawnGap;
      if (!lastObs || (lastObs.type === 'zapper_rotating' ? (lastObs.centerX || lastObs.x) : lastObs.x) < CANVAS_WIDTH - spawnGap) {
        spawnObstacle();
      }
      
      // Update coins and add trails
      coinsRef.current.forEach(c => {
        // Add to trail
        if (!c.collected) {
          if (!c.trail) c.trail = [];
          c.trail.unshift({ x: c.x, y: c.y, alpha: 0.5 });
          if (c.trail.length > 5) c.trail.pop();
          c.trail.forEach(t => t.alpha *= 0.8);
        }
        c.x -= speed * delta;
      });
      coinsRef.current = coinsRef.current.filter(c => c.x > -50);
      if (coinsRef.current.length < 20 && Math.random() < 0.03) spawnCoins();
      
      // Update power-ups
      powerUpsRef.current.forEach(p => { p.x -= speed * delta; });
      powerUpsRef.current = powerUpsRef.current.filter(p => p.x > -50);
      if (powerUpsRef.current.length < 2 && Math.random() < 0.005) spawnPowerUp();
      
      // Clean up expired power-ups
      const nowMs = Date.now();
      activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.endTime > nowMs);
      setActivePowerUpsDisplay([...activePowerUpsRef.current]);
      
      // Decay combo if no coins collected recently
      if (nowMs - lastCoinTimeRef.current > COMBO_WINDOW * 2) {
        comboRef.current = Math.max(1, comboRef.current - 1);
        setComboDisplay(comboRef.current);
      }
    }
    
    // Thrust particles
    if ((player.isThrusting || isRocket) && frameCountRef.current % 2 === 0) addThrustParticles();
    
    // Draw everything
    drawBackground(ctx, hasStarted ? speed : 0.5);
    drawGhost(ctx);
    drawParticles(ctx);
    drawCoins(ctx);
    drawPowerUps(ctx);
    drawObstacles(ctx);
    drawPlayer(ctx);
    drawCombo(ctx);
    drawActivePowerUps(ctx);
    
    // Start prompt - just text, no floating donut
    if (!hasStarted) {
      ctx.save();
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10;
      const pulse = 0.7 + Math.sin(frameCountRef.current * 0.1) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillText('TAP TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    
    // Collision and pickup checks
    if (hasStarted) {
      checkCoins();
      checkPowerUps();
      
      const collision = checkCollisions();
      
      // Near miss bonus
      if (collision.nearMiss && !nearMissBonusRef.current) {
        nearMissBonusRef.current = 1;
        coinsCollectedRef.current += 2;
        playNearMissSound();
        triggerScreenShake(3, 100);
        
        // Show near miss text
        particlesRef.current.push({
          x: PLAYER_X + 30,
          y: player.y,
          vx: 1,
          vy: -1,
          life: 30,
          color: '#FFD700',
          size: 0, // Flag for text particle
        });
      } else if (!collision.nearMiss) {
        nearMissBonusRef.current = 0;
      }
      
      // Heartbeat when close to obstacles
      if (collision.nearMiss && frameCountRef.current % 30 === 0) {
        playHeartbeatSound();
      }
      
      if (collision.hit) {
        const finalScore = coinsCollectedRef.current;
        playCrashSound();
        stopThrustSound();
        gameActiveRef.current = false;
        triggerScreenShake(15, 500);
        
        // Save ghost if new best
        if (finalScore > bestGhostScoreRef.current) {
          bestGhostRef.current = [...ghostRecordingRef.current];
          bestGhostScoreRef.current = finalScore;
        }
        
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
              skinId: 'default',
              skinColor: '#FFFFFF',
            }),
          }).catch(console.error);
        }
        return;
      }
    }
    
    // HUD
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${coinsCollectedRef.current}`, 15, 58);
    
    // Zone indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = currentZoneRef.current.accent;
    ctx.fillText(currentZoneRef.current.name.toUpperCase(), 15, 75);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [
    drawBackground, drawPlayer, drawObstacles, drawCoins, drawPowerUps, drawParticles, drawCombo, drawActivePowerUps, drawGhost,
    checkCollisions, checkCoins, checkPowerUps, updateObstacles,
    spawnObstacle, spawnCoins, spawnPowerUp, addThrustParticles, addMilestoneParticles,
    playCrashSound, stopThrustSound, playMilestoneSound, playNearMissSound, playHeartbeatSound,
    triggerScreenShake, getCurrentZone, isPowerUpActive,
    submitScore, fetchLeaderboard, address, context
  ]);

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
    powerUpsRef.current = [];
    activePowerUpsRef.current = [];
    particlesRef.current = [];
    speedRef.current = BASE_SPEED;
    coinsCollectedRef.current = 0;
    frameCountRef.current = 0;
    hasStartedFlyingRef.current = false;
    comboRef.current = 0;
    lastCoinTimeRef.current = 0;
    nearMissBonusRef.current = 0;
    lastMilestoneRef.current = 0;
    currentZoneRef.current = ZONES[0];
    ghostRecordingRef.current = [];
    hasShieldRef.current = false;
    screenShakeRef.current = { intensity: 0, duration: 0, startTime: 0 };
    setScore(0);
    setCurrentZone(ZONES[0]);
    setComboDisplay(0);
    setActivePowerUpsDisplay([]);
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
      
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGradient.addColorStop(0, "#1a1a1a");
      bgGradient.addColorStop(1, "#0d0d0d");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
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
      
      if (pfpImageRef.current) {
        const menuRadius = 30;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, menuRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(pfpImageRef.current, -menuRadius, -menuRadius, menuRadius * 2, menuRadius * 2);
        ctx.restore();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(0, 0, menuRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowColor = donutColor; ctx.shadowBlur = 25;
        ctx.fillStyle = donutColor;
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 24px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 260);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 32px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 295);
        ctx.fillStyle = '#888'; ctx.font = '12px monospace';
        ctx.fillText('sprinkles collected', CANVAS_WIDTH / 2, 318);
        
        // Show best ghost score
        if (bestGhostScoreRef.current > 0) {
          ctx.fillStyle = '#666';
          ctx.font = '10px monospace';
          ctx.fillText(`Best: ${bestGhostScoreRef.current}`, CANVAS_WIDTH / 2, 338);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace';
        ctx.fillText('Hold to fly • Release to fall', CANVAS_WIDTH / 2, 290);
        
        // Show power-up icons
        ctx.font = '10px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('Power-ups: 🧲 🛡️ ⏱️ 🚀 👻', CANVAS_WIDTH / 2, 310);
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

  const isPlayPending = playState === 'confirming' || playState === 'recording' || isPending || isConfirming;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { 
          -webkit-tap-highlight-color: transparent !important;
          -webkit-touch-callout: none !important;
        }
        main, main * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
        }
        canvas, .game-touch-area {
          touch-action: none !important;
          -webkit-touch-callout: none !important;
          -webkit-user-select: none !important;
          -khtml-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
        }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        <Header title="DONUT DASH" user={context?.user} />
        
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
              style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
              onPointerDown={(e) => { e.preventDefault(); if (gameState === "playing") handleThrustStart(); }}
              onPointerUp={(e) => { e.preventDefault(); handleThrustEnd(); }}
              onPointerLeave={handleThrustEnd}
              onPointerCancel={handleThrustEnd}
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onTouchMove={(e) => e.preventDefault()}
              draggable={false}
            />
            
            {gameState === "playing" && (
              <div 
                className="absolute inset-0 z-10 select-none game-touch-area"
                style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                onPointerDown={(e) => { e.preventDefault(); handleThrustStart(); }}
                onPointerUp={(e) => { e.preventDefault(); handleThrustEnd(); }}
                onPointerLeave={handleThrustEnd}
                onPointerCancel={handleThrustEnd}
                onContextMenu={(e) => e.preventDefault()}
                onTouchStart={(e) => { e.preventDefault(); handleThrustStart(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleThrustEnd(); }}
                onTouchMove={(e) => e.preventDefault()}
                draggable={false}
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
          <div className="py-4 flex items-center justify-center gap-2 flex-wrap">
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs whitespace-nowrap">How to Play</span>
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>
              {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}
              <span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
            <button onClick={() => setShowGhost(!showGhost)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${showGhost ? 'border-purple-500/50' : 'border-zinc-700'}`}>
              <Ghost className="w-3 h-3 text-purple-400" />
              <span className="text-xs">{showGhost ? 'Ghost On' : 'Ghost Off'}</span>
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
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-yellow-400" />Gameplay</h3>
                <p className="text-xs text-zinc-400">Hold the screen to fly up with your jetpack. Release to fall. Navigate through the facility avoiding zappers and collecting sprinkles!</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-orange-400" />Power-Ups</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2"><span>🧲</span><span className="text-zinc-400">Magnet - Pulls coins</span></div>
                  <div className="flex items-center gap-2"><span>🛡️</span><span className="text-zinc-400">Shield - Survive 1 hit</span></div>
                  <div className="flex items-center gap-2"><span>⏱️</span><span className="text-zinc-400">Slow-Mo - Slows time</span></div>
                  <div className="flex items-center gap-2"><span>🚀</span><span className="text-zinc-400">Rocket - 2x coins, invincible</span></div>
                  <div className="flex items-center gap-2"><span>👻</span><span className="text-zinc-400">Ghost - Phase through</span></div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-400" />Zones</h3>
                <p className="text-xs text-zinc-400">Progress through 4 zones with unique visuals and new obstacles: Factory → Lava → Ice → Space</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-green-400" />Combos & Near Misses</h3>
                <p className="text-xs text-zinc-400">Chain coin pickups for combo multipliers (up to 10x)! Graze obstacles for +2 near-miss bonus points.</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Ghost className="w-4 h-4 text-purple-400" />Ghost Mode</h3>
                <p className="text-xs text-zinc-400">Race against your best run! Toggle ghost visibility in the menu.</p>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-green-400" />Weekly Prizes</h3>
                <p className="text-xs text-zinc-400">This game is FREE TO PLAY! Top 10 players each week win USDC prizes distributed automatically every Friday at 6PM EST.</p>
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
      
      <NavBar />
    </main>
  );
}