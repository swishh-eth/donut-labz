"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Trophy, Play, Share2, X, HelpCircle, Volume2, VolumeX, ChevronRight, Clock } from "lucide-react";

// Free Arcade Contract (gas-only, no token payment)
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

const BLOCK_HEIGHT = 28;
const INITIAL_BLOCK_WIDTH = 140;
const BASE_SPEED = 2.2;
const SPEED_INCREMENT = 0.08;
const MAX_SPEED = 6;
const PERFECT_THRESHOLD = 6;

// Brand colors - cycling between pink and green
const BRAND_PINK = '#F472B6';
const BRAND_GREEN = '#22C55E';
const BRAND_COLORS = [BRAND_PINK, BRAND_GREEN];

// Power-up types
type PowerUpType = 'auto3' | 'slow' | 'double';

interface PowerUp {
  type: PowerUpType;
  active: boolean;
  endTime?: number;
}

// Weekly USDC prize pool
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

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; fid?: number; username: string; displayName?: string; pfpUrl?: string; score: number; walletAddress?: string };
type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

const getBlockColor = (index: number): string => {
  return BRAND_COLORS[index % 2];
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

type Block = {
  x: number;
  y: number;
  width: number;
  color: string;
  settled: boolean;
  landTime?: number;
  hasPowerUp?: PowerUpType;
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
  type?: 'sparkle' | 'trail' | 'burst';
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
};

// Background particles for ambiance
type BgParticle = {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
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
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [lastPlacement, setLastPlacement] = useState<"perfect" | "good" | "ok" | null>(null);
  
  // Power-up state
  const [activePowerUp, setActivePowerUp] = useState<PowerUpType | null>(null);
  
  // Play state
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gamesPlayedThisWeek, setGamesPlayedThisWeek] = useState(0);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userBestScore, setUserBestScore] = useState(0);
  
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo>(DEFAULT_PRIZE_INFO);
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInitializedRef = useRef(false);
  
  const blocksRef = useRef<Block[]>([]);
  const currentBlockRef = useRef<Block | null>(null);
  const fallingPiecesRef = useRef<FallingPiece[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const bgParticlesRef = useRef<BgParticle[]>([]);
  const directionRef = useRef<1 | -1>(1);
  const speedRef = useRef(BASE_SPEED);
  const baseSpeedRef = useRef(BASE_SPEED);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const gameActiveRef = useRef(false);
  const cameraYRef = useRef(0);
  const targetCameraYRef = useRef(0);
  const countdownRef = useRef(3);
  const lastFrameTimeRef = useRef(performance.now());
  const screenShakeRef = useRef(0);
  const perfectPulseRef = useRef(0);
  const frameCountRef = useRef(0);
  
  // Power-up refs
  const activePowerUpRef = useRef<PowerUp | null>(null);
  const autoStackingRef = useRef(false);
  const autoStackCountRef = useRef(0);
  const pointMultiplierRef = useRef(1);
  
  // Readjustment period after slow ends
  const readjustingRef = useRef(false);
  const readjustCountdownRef = useRef(0);

  // Update reset countdown
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
            skinId: 'default',
            skinColor: BRAND_PINK,
          }),
        }).catch(console.error);
      }
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  }, [context?.user, address]);

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

  useEffect(() => {
    if (isConfirmed && txHash && playState === 'confirming') {
      recordEntryAndStartGame(txHash);
    }
  }, [isConfirmed, txHash, playState, recordEntryAndStartGame]);

  useEffect(() => {
    if (writeError) {
      console.error("Write error:", writeError);
      setPlayState('error');
      setErrorMessage(writeError.message?.includes("User rejected") ? "Transaction rejected" : "Transaction failed");
    }
  }, [writeError]);
  
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

  useEffect(() => {
    if (context?.user?.fid) {
      fetchLeaderboard();
    }
  }, [context?.user?.fid, fetchLeaderboard]);
  
  // Initialize background particles
  const initBgParticles = useCallback(() => {
    bgParticlesRef.current = [];
    for (let i = 0; i < 40; i++) {
      bgParticlesRef.current.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: 1 + Math.random() * 2,
        speed: 0.2 + Math.random() * 0.4,
        alpha: 0.1 + Math.random() * 0.2,
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
          const baseFreq = 440 + comboCount * 40;
          osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
          osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.08);
          osc.frequency.setValueAtTime(baseFreq * 2, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.25);
        } else {
          osc.frequency.setValueAtTime(280, ctx.currentTime);
          osc.frequency.setValueAtTime(220, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.12);
        }
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
  
  const spawnPerfectParticles = useCallback((x: number, y: number, width: number, color: string) => {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      particlesRef.current.push({
        x: x + width / 2,
        y: y + BLOCK_HEIGHT / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 1,
        color: color,
        size: 4 + Math.random() * 4,
        type: 'burst',
      });
    }
    for (let i = 0; i < 10; i++) {
      particlesRef.current.push({
        x: x + Math.random() * width,
        y: y + Math.random() * BLOCK_HEIGHT,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 2,
        life: 1,
        maxLife: 1,
        color: '#FFFFFF',
        size: 2 + Math.random() * 2,
        type: 'sparkle',
      });
    }
  }, []);
  
  const spawnPowerUpParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      particlesRef.current.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 5,
        vy: Math.sin(angle) * 5,
        life: 1,
        maxLife: 1,
        color: color,
        size: 6,
        type: 'sparkle',
      });
    }
  }, []);
  
  const addFloatingText = useCallback((x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({ x, y, text, color, life: 1, vy: -2 });
  }, []);
  
  const drawBlock = useCallback((ctx: CanvasRenderingContext2D, block: Block, cameraY: number, time: number) => {
    const screenY = block.y - cameraY;
    const depth = 12;
    
    if (screenY > CANVAS_HEIGHT + 50 || screenY < -50) return;
    
    let bounceOffset = 0;
    if (block.landTime) {
      const timeSinceLand = time - block.landTime;
      if (timeSinceLand < 200) {
        bounceOffset = Math.sin(timeSinceLand / 200 * Math.PI) * 5;
      }
    }
    
    const drawY = screenY - bounceOffset;
    const color = block.color;
    
    ctx.fillStyle = shadeColor(color, -25);
    ctx.beginPath();
    ctx.moveTo(block.x + block.width, drawY);
    ctx.lineTo(block.x + block.width + depth, drawY - depth);
    ctx.lineTo(block.x + block.width + depth, drawY + BLOCK_HEIGHT - depth);
    ctx.lineTo(block.x + block.width, drawY + BLOCK_HEIGHT);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = shadeColor(color, 15);
    ctx.beginPath();
    ctx.moveTo(block.x, drawY);
    ctx.lineTo(block.x + depth, drawY - depth);
    ctx.lineTo(block.x + block.width + depth, drawY - depth);
    ctx.lineTo(block.x + block.width, drawY);
    ctx.closePath();
    ctx.fill();
    
    const gradient = ctx.createLinearGradient(block.x, drawY, block.x, drawY + BLOCK_HEIGHT);
    gradient.addColorStop(0, shadeColor(color, 10));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, shadeColor(color, -15));
    ctx.fillStyle = gradient;
    ctx.fillRect(block.x, drawY, block.width, BLOCK_HEIGHT);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(block.x + 4, drawY + 3, block.width - 8, 4);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(block.x, drawY + BLOCK_HEIGHT - 3, block.width, 3);
    
    if (block.hasPowerUp && !block.settled) {
      const iconY = drawY + BLOCK_HEIGHT / 2;
      const iconX = block.x + block.width / 2;
      const pulse = 1 + Math.sin(time / 150) * 0.15;
      
      ctx.save();
      ctx.translate(iconX, iconY);
      ctx.scale(pulse, pulse);
      
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.hasPowerUp === 'auto3' ? '+3' : block.hasPowerUp === 'slow' ? '⏱' : '2X', 0, 0);
      
      ctx.restore();
    }
  }, []);
  
  const drawFallingPiece = useCallback((ctx: CanvasRenderingContext2D, piece: FallingPiece, cameraY: number) => {
    const screenY = piece.y - cameraY;
    
    ctx.save();
    ctx.globalAlpha = piece.opacity;
    ctx.translate(piece.x + piece.width / 2, screenY + BLOCK_HEIGHT / 2);
    ctx.rotate(piece.rotation);
    
    const gradient = ctx.createLinearGradient(-piece.width / 2, -BLOCK_HEIGHT / 2, -piece.width / 2, BLOCK_HEIGHT / 2);
    gradient.addColorStop(0, shadeColor(piece.color, 10));
    gradient.addColorStop(1, shadeColor(piece.color, -15));
    ctx.fillStyle = gradient;
    ctx.fillRect(-piece.width / 2, -BLOCK_HEIGHT / 2, piece.width, BLOCK_HEIGHT);
    
    ctx.restore();
  }, []);
  
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D, cameraY: number) => {
    particlesRef.current.forEach(p => {
      const screenY = p.y - cameraY;
      ctx.globalAlpha = p.life;
      
      if (p.type === 'sparkle') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        const size = p.size * p.life;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + frameCountRef.current * 0.1;
          const x = p.x + Math.cos(angle) * size;
          const y = screenY + Math.sin(angle) * size;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, screenY, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }, []);
  
  const drawFloatingTexts = useCallback((ctx: CanvasRenderingContext2D, cameraY: number) => {
    floatingTextsRef.current.forEach(ft => {
      const screenY = ft.y - cameraY;
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, screenY);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }, []);
  
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(-10, -10, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);
    
    bgParticlesRef.current.forEach(p => {
      p.y -= p.speed;
      if (p.y < 0) {
        p.y = CANVAS_HEIGHT;
        p.x = Math.random() * CANVAS_WIDTH;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
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
  
  const spawnNewBlock = useCallback(() => {
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    const newY = lastBlock ? lastBlock.y - BLOCK_HEIGHT : CANVAS_HEIGHT - BLOCK_HEIGHT - 50;
    const newWidth = lastBlock ? lastBlock.width : INITIAL_BLOCK_WIDTH;
    
    const newX = directionRef.current === 1 ? -newWidth : CANVAS_WIDTH;
    const newColor = getBlockColor(blocks.length);
    
    let powerUp: PowerUpType | undefined;
    if (blocks.length > 0 && blocks.length % (8 + Math.floor(Math.random() * 5)) === 0) {
      const types: PowerUpType[] = ['auto3', 'slow', 'double'];
      powerUp = types[Math.floor(Math.random() * types.length)];
    }
    
    currentBlockRef.current = {
      x: newX,
      y: newY,
      width: newWidth,
      color: newColor,
      settled: false,
      hasPowerUp: powerUp,
    };
  }, []);
  
  const spawnAutoBlock = useCallback(() => {
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock) return;
    
    const newY = lastBlock.y - BLOCK_HEIGHT;
    const newWidth = lastBlock.width;
    const newX = lastBlock.x;
    const newColor = getBlockColor(blocks.length);
    
    currentBlockRef.current = {
      x: newX,
      y: newY,
      width: newWidth,
      color: newColor,
      settled: false,
    };
  }, []);
  
  const autoStackOneBlock = useCallback(() => {
    if (!gameActiveRef.current || !currentBlockRef.current) return;
    
    const current = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    if (!lastBlock) return;
    
    current.x = lastBlock.x;
    current.width = lastBlock.width;
    current.settled = true;
    current.landTime = performance.now();
    blocksRef.current.push({ ...current });
    
    const points = 1 * pointMultiplierRef.current;
    scoreRef.current += points;
    setScore(scoreRef.current);
    
    comboRef.current++;
    setCombo(comboRef.current);
    playPlaceSound(true, comboRef.current);
    triggerHaptic(true);
    spawnPerfectParticles(current.x, current.y, current.width, current.color);
    perfectPulseRef.current = 1;
    screenShakeRef.current = 0.25;
    
    const desiredScreenY = 200;
    const topBlockY = current.y - BLOCK_HEIGHT;
    const newCameraTarget = topBlockY - desiredScreenY;
    if (newCameraTarget < targetCameraYRef.current) {
      targetCameraYRef.current = newCameraTarget;
    }
    
    baseSpeedRef.current = Math.min(BASE_SPEED + scoreRef.current * SPEED_INCREMENT, MAX_SPEED);
    if (!activePowerUpRef.current || activePowerUpRef.current.type !== 'slow') {
      speedRef.current = baseSpeedRef.current;
    }
  }, [playPlaceSound, triggerHaptic, spawnPerfectParticles]);
  
  const activatePowerUp = useCallback((type: PowerUpType) => {
    playPowerUpSound();
    
    if (type === 'auto3') {
      autoStackingRef.current = true;
      autoStackCountRef.current = 3;
      addFloatingText(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, '+3 AUTO!', '#22C55E');
      spawnPowerUpParticles(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, '#22C55E');
      
      let stackCount = 0;
      const doAutoStack = () => {
        if (stackCount >= 3 || !gameActiveRef.current) {
          autoStackingRef.current = false;
          autoStackCountRef.current = 0;
          spawnNewBlock();
          return;
        }
        
        spawnAutoBlock();
        setTimeout(() => {
          autoStackOneBlock();
          stackCount++;
          autoStackCountRef.current = 3 - stackCount;
          setTimeout(doAutoStack, 200);
        }, 150);
      };
      
      doAutoStack();
      
    } else if (type === 'slow') {
      speedRef.current = baseSpeedRef.current * 0.5;
      activePowerUpRef.current = { type, active: true, endTime: performance.now() + 5000 };
      setActivePowerUp(type);
      addFloatingText(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, 'SLOW!', '#3B82F6');
      spawnPowerUpParticles(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, '#3B82F6');
    } else if (type === 'double') {
      pointMultiplierRef.current = 2;
      activePowerUpRef.current = { type, active: true, endTime: performance.now() + 10000 };
      setActivePowerUp(type);
      addFloatingText(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, '2X POINTS!', '#FFD700');
      spawnPowerUpParticles(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, '#FFD700');
    }
  }, [playPowerUpSound, addFloatingText, spawnPowerUpParticles, autoStackOneBlock, spawnAutoBlock, spawnNewBlock]);
  
  const endGame = useCallback((finalScore: number) => {
    gameActiveRef.current = false;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    playGameOverSound();
    triggerHaptic(true);
    screenShakeRef.current = 1;
    setGameState("gameover");
    setHighScore(prev => Math.max(prev, finalScore));
    submitScore(finalScore);
    fetchLeaderboard();
  }, [playGameOverSound, triggerHaptic, submitScore, fetchLeaderboard]);
  
  const placeBlock = useCallback(() => {
    if (!gameActiveRef.current || !currentBlockRef.current || autoStackingRef.current || readjustingRef.current) return;
    
    const current = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    if (current.hasPowerUp) {
      const powerUpType = current.hasPowerUp;
      current.hasPowerUp = undefined;
      
      if (powerUpType === 'auto3') {
        if (!lastBlock) {
          current.settled = true;
          current.landTime = performance.now();
          blocksRef.current.push({ ...current });
          const points = 1 * pointMultiplierRef.current;
          scoreRef.current += points;
          setScore(scoreRef.current);
          playPlaceSound(true, 1);
          triggerHaptic(true);
          setLastPlacement("perfect");
          spawnPerfectParticles(current.x, current.y, current.width, current.color);
          perfectPulseRef.current = 1;
          screenShakeRef.current = 0.3;
          setTimeout(() => setLastPlacement(null), 500);
          activatePowerUp('auto3');
          return;
        }
        
        const currentLeft = current.x;
        const currentRight = current.x + current.width;
        const lastLeft = lastBlock.x;
        const lastRight = lastBlock.x + lastBlock.width;
        const overlapLeft = Math.max(currentLeft, lastLeft);
        const overlapRight = Math.min(currentRight, lastRight);
        const overlapWidth = overlapRight - overlapLeft;
        
        if (overlapWidth <= 0) {
          blocksRef.current.forEach((block, i) => {
            setTimeout(() => {
              fallingPiecesRef.current.push({
                x: block.x, y: block.y, width: block.width, color: block.color,
                velocityY: -2 - Math.random() * 3, velocityX: (Math.random() - 0.5) * 4,
                rotation: 0, rotationSpeed: (Math.random() - 0.5) * 0.2, opacity: 1,
              });
            }, i * 50);
          });
          endGame(scoreRef.current);
          return;
        }
        
        const isPerfect = Math.abs(current.x - lastBlock.x) <= PERFECT_THRESHOLD;
        
        if (isPerfect) {
          current.x = lastBlock.x;
          current.width = lastBlock.width;
          comboRef.current++;
          setCombo(comboRef.current);
          playPlaceSound(true, comboRef.current);
          triggerHaptic(true);
          setLastPlacement("perfect");
          spawnPerfectParticles(current.x, current.y, current.width, current.color);
          perfectPulseRef.current = 1;
          screenShakeRef.current = 0.25;
        } else {
          const cutOffLeft = currentLeft < lastLeft ? lastLeft - currentLeft : 0;
          const cutOffRight = currentRight > lastRight ? currentRight - lastRight : 0;
          
          if (cutOffLeft > 0) {
            fallingPiecesRef.current.push({
              x: currentLeft, y: current.y, width: cutOffLeft, color: current.color,
              velocityY: 0, velocityX: -2 - Math.random() * 2, rotation: 0,
              rotationSpeed: -0.1 - Math.random() * 0.1, opacity: 1,
            });
          }
          if (cutOffRight > 0) {
            fallingPiecesRef.current.push({
              x: overlapRight, y: current.y, width: cutOffRight, color: current.color,
              velocityY: 0, velocityX: 2 + Math.random() * 2, rotation: 0,
              rotationSpeed: 0.1 + Math.random() * 0.1, opacity: 1,
            });
          }
          
          current.x = overlapLeft;
          current.width = overlapWidth;
          comboRef.current = 0;
          setCombo(0);
          playPlaceSound(false, 0);
          triggerHaptic(false);
          screenShakeRef.current = 0.15;
          setLastPlacement(overlapWidth > lastBlock.width * 0.8 ? "good" : "ok");
        }
        
        setTimeout(() => setLastPlacement(null), 500);
        
        if (current.width < 15) {
          endGame(scoreRef.current);
          return;
        }
        
        current.settled = true;
        current.landTime = performance.now();
        blocksRef.current.push({ ...current });
        const points = 1 * pointMultiplierRef.current;
        scoreRef.current += points;
        setScore(scoreRef.current);
        
        const desiredScreenY = 200;
        const topBlockY = current.y - BLOCK_HEIGHT;
        const newCameraTarget = topBlockY - desiredScreenY;
        if (newCameraTarget < targetCameraYRef.current) {
          targetCameraYRef.current = newCameraTarget;
        }
        
        baseSpeedRef.current = Math.min(BASE_SPEED + scoreRef.current * SPEED_INCREMENT, MAX_SPEED);
        if (!activePowerUpRef.current || activePowerUpRef.current.type !== 'slow') {
          speedRef.current = baseSpeedRef.current;
        }
        
        activatePowerUp('auto3');
        return;
      } else {
        activatePowerUp(powerUpType);
      }
    }
    
    if (!lastBlock) {
      current.settled = true;
      current.landTime = performance.now();
      blocksRef.current.push({ ...current });
      const points = 1 * pointMultiplierRef.current;
      scoreRef.current += points;
      setScore(scoreRef.current);
      playPlaceSound(true, 1);
      triggerHaptic(true);
      setLastPlacement("perfect");
      spawnPerfectParticles(current.x, current.y, current.width, current.color);
      perfectPulseRef.current = 1;
      screenShakeRef.current = 0.3;
      setTimeout(() => setLastPlacement(null), 500);
      spawnNewBlock();
      return;
    }
    
    const currentLeft = current.x;
    const currentRight = current.x + current.width;
    const lastLeft = lastBlock.x;
    const lastRight = lastBlock.x + lastBlock.width;
    const overlapLeft = Math.max(currentLeft, lastLeft);
    const overlapRight = Math.min(currentRight, lastRight);
    const overlapWidth = overlapRight - overlapLeft;
    
    if (overlapWidth <= 0) {
      blocksRef.current.forEach((block, i) => {
        setTimeout(() => {
          fallingPiecesRef.current.push({
            x: block.x, y: block.y, width: block.width, color: block.color,
            velocityY: -2 - Math.random() * 3, velocityX: (Math.random() - 0.5) * 4,
            rotation: 0, rotationSpeed: (Math.random() - 0.5) * 0.2, opacity: 1,
          });
        }, i * 50);
      });
      endGame(scoreRef.current);
      return;
    }
    
    const isPerfect = Math.abs(current.x - lastBlock.x) <= PERFECT_THRESHOLD;
    
    if (isPerfect) {
      current.x = lastBlock.x;
      current.width = lastBlock.width;
      comboRef.current++;
      setCombo(comboRef.current);
      playPlaceSound(true, comboRef.current);
      triggerHaptic(true);
      setLastPlacement("perfect");
      spawnPerfectParticles(current.x, current.y, current.width, current.color);
      perfectPulseRef.current = 1;
      screenShakeRef.current = 0.25;
      
      if (comboRef.current >= 5) {
        const bonus = Math.floor(comboRef.current / 5) * pointMultiplierRef.current;
        scoreRef.current += bonus;
        addFloatingText(CANVAS_WIDTH / 2, current.y - 20, `+${bonus} BONUS!`, '#FFD700');
      }
    } else {
      const cutOffLeft = currentLeft < lastLeft ? lastLeft - currentLeft : 0;
      const cutOffRight = currentRight > lastRight ? currentRight - lastRight : 0;
      
      if (cutOffLeft > 0) {
        fallingPiecesRef.current.push({
          x: currentLeft, y: current.y, width: cutOffLeft, color: current.color,
          velocityY: 0, velocityX: -2 - Math.random() * 2, rotation: 0,
          rotationSpeed: -0.1 - Math.random() * 0.1, opacity: 1,
        });
      }
      if (cutOffRight > 0) {
        fallingPiecesRef.current.push({
          x: overlapRight, y: current.y, width: cutOffRight, color: current.color,
          velocityY: 0, velocityX: 2 + Math.random() * 2, rotation: 0,
          rotationSpeed: 0.1 + Math.random() * 0.1, opacity: 1,
        });
      }
      
      current.x = overlapLeft;
      current.width = overlapWidth;
      comboRef.current = 0;
      setCombo(0);
      playPlaceSound(false, 0);
      triggerHaptic(false);
      screenShakeRef.current = 0.15;
      
      setLastPlacement(overlapWidth > lastBlock.width * 0.8 ? "good" : "ok");
    }
    
    setTimeout(() => setLastPlacement(null), 500);
    
    if (current.width < 15) {
      endGame(scoreRef.current);
      return;
    }
    
    current.settled = true;
    current.landTime = performance.now();
    blocksRef.current.push({ ...current });
    const points = 1 * pointMultiplierRef.current;
    scoreRef.current += points;
    setScore(scoreRef.current);
    
    if (pointMultiplierRef.current > 1) {
      addFloatingText(CANVAS_WIDTH / 2, current.y - 10, `+${points}`, '#FFD700');
    }
    
    const desiredScreenY = 200;
    const topBlockY = current.y - BLOCK_HEIGHT;
    const newCameraTarget = topBlockY - desiredScreenY;
    if (newCameraTarget < targetCameraYRef.current) {
      targetCameraYRef.current = newCameraTarget;
    }
    
    baseSpeedRef.current = Math.min(BASE_SPEED + scoreRef.current * SPEED_INCREMENT, MAX_SPEED);
    if (!activePowerUpRef.current || activePowerUpRef.current.type !== 'slow') {
      speedRef.current = baseSpeedRef.current;
    }
    
    spawnNewBlock();
  }, [playPlaceSound, triggerHaptic, spawnPerfectParticles, endGame, activatePowerUp, addFloatingText, spawnNewBlock]);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    const now = performance.now();
    const rawDelta = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    const deltaTime = Math.min(rawDelta / 16.667, 2);
    frameCountRef.current++;
    
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    
    let shakeX = 0, shakeY = 0;
    if (screenShakeRef.current > 0) {
      shakeX = (Math.random() - 0.5) * screenShakeRef.current * 10;
      shakeY = (Math.random() - 0.5) * screenShakeRef.current * 10;
      screenShakeRef.current -= 0.08 * deltaTime;
      if (screenShakeRef.current < 0) screenShakeRef.current = 0;
    }
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    drawBackground(ctx);
    
    if (perfectPulseRef.current > 0) {
      ctx.fillStyle = `rgba(255, 215, 0, ${perfectPulseRef.current * 0.12})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      perfectPulseRef.current -= 0.04 * deltaTime;
      if (perfectPulseRef.current < 0) perfectPulseRef.current = 0;
    }
    
    cameraYRef.current += (targetCameraYRef.current - cameraYRef.current) * 0.1 * deltaTime;
    
    blocksRef.current.forEach(block => {
      drawBlock(ctx, block, cameraYRef.current, now);
    });
    
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 0.25 * deltaTime;
      p.life -= 0.025 * deltaTime;
      return p.life > 0;
    });
    drawParticles(ctx, cameraYRef.current);
    
    floatingTextsRef.current = floatingTextsRef.current.filter(ft => {
      ft.y += ft.vy * deltaTime;
      ft.life -= 0.02 * deltaTime;
      return ft.life > 0;
    });
    drawFloatingTexts(ctx, cameraYRef.current);
    
    fallingPiecesRef.current = fallingPiecesRef.current.filter(piece => {
      piece.y += piece.velocityY * deltaTime;
      piece.x += piece.velocityX * deltaTime;
      piece.velocityY += 0.6 * deltaTime;
      piece.rotation += piece.rotationSpeed * deltaTime;
      piece.opacity -= 0.02 * deltaTime;
      if (piece.opacity > 0 && piece.y - cameraYRef.current < CANVAS_HEIGHT + 100) {
        drawFallingPiece(ctx, piece, cameraYRef.current);
        return true;
      }
      return false;
    });
    
    if (activePowerUpRef.current && activePowerUpRef.current.endTime && now > activePowerUpRef.current.endTime) {
      if (activePowerUpRef.current.type === 'slow') {
        speedRef.current = baseSpeedRef.current;
        // Start readjustment period
        readjustingRef.current = true;
        readjustCountdownRef.current = 3;
        addFloatingText(CANVAS_WIDTH / 2, blocksRef.current[blocksRef.current.length - 1]?.y || 300, 'GET READY!', '#3B82F6');
        
        // Countdown timer
        let count = 3;
        const countdownInterval = setInterval(() => {
          count--;
          readjustCountdownRef.current = count;
          if (count <= 0) {
            clearInterval(countdownInterval);
            readjustingRef.current = false;
          }
        }, 1000);
      }
      if (activePowerUpRef.current.type === 'double') {
        pointMultiplierRef.current = 1;
      }
      activePowerUpRef.current = null;
      setActivePowerUp(null);
    }
    
    if (currentBlockRef.current && !currentBlockRef.current.settled && !autoStackingRef.current) {
      const block = currentBlockRef.current;
      block.x += speedRef.current * directionRef.current * deltaTime;
      
      if (block.x + block.width >= CANVAS_WIDTH) {
        block.x = CANVAS_WIDTH - block.width;
        directionRef.current = -1;
      } else if (block.x <= 0) {
        block.x = 0;
        directionRef.current = 1;
      }
      
      drawBlock(ctx, block, cameraYRef.current, now);
    } else if (currentBlockRef.current && !currentBlockRef.current.settled && autoStackingRef.current) {
      drawBlock(ctx, currentBlockRef.current, cameraYRef.current, now);
    }
    
    ctx.restore();
    
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    
    if (comboRef.current >= 2) {
      const comboPulse = 1 + Math.sin(now / 100) * 0.1;
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, 100);
      ctx.scale(comboPulse, comboPulse);
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 20px monospace";
      ctx.fillText(`${comboRef.current}x PERFECT!`, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    
    if (activePowerUpRef.current) {
      const pu = activePowerUpRef.current;
      ctx.fillStyle = pu.type === 'auto3' ? '#22C55E' : pu.type === 'slow' ? '#3B82F6' : '#FFD700';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const icon = pu.type === 'auto3' ? '+3 AUTO' : pu.type === 'slow' ? '⏱ SLOW' : '2X POINTS';
      ctx.fillText(icon, 15, 50);
      
      if (pu.endTime) {
        const remaining = Math.max(0, (pu.endTime - now) / 1000);
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText(`${remaining.toFixed(1)}s`, 15, 65);
      }
    }
    
    if (autoStackingRef.current) {
      ctx.fillStyle = '#22C55E';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`AUTO +${autoStackCountRef.current}`, CANVAS_WIDTH / 2, 130);
    }
    
    // Readjustment countdown after slow ends
    if (readjustingRef.current && readjustCountdownRef.current > 0) {
      // Darken overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Pulsing countdown
      const pulse = 1 + Math.sin(now / 80) * 0.15;
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = '#3B82F6';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#3B82F6';
      ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(readjustCountdownRef.current.toString(), 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FULL SPEED!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBackground, drawBlock, drawFallingPiece, drawParticles, drawFloatingTexts, addFloatingText]);
  
  const startGame = useCallback(() => {
    initAudioContext();
    initBgParticles();
    
    blocksRef.current = [];
    fallingPiecesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    currentBlockRef.current = null;
    directionRef.current = 1;
    speedRef.current = BASE_SPEED;
    baseSpeedRef.current = BASE_SPEED;
    scoreRef.current = 0;
    comboRef.current = 0;
    cameraYRef.current = 0;
    targetCameraYRef.current = 0;
    countdownRef.current = 3;
    lastFrameTimeRef.current = performance.now();
    screenShakeRef.current = 0;
    perfectPulseRef.current = 0;
    frameCountRef.current = 0;
    activePowerUpRef.current = null;
    autoStackingRef.current = false;
    autoStackCountRef.current = 0;
    pointMultiplierRef.current = 1;
    readjustingRef.current = false;
    readjustCountdownRef.current = 0;
    
    setScore(0);
    setCombo(0);
    setCountdown(3);
    setGameState("countdown");
    setErrorMessage(null);
    setLastPlacement(null);
    setActivePowerUp(null);
    
    const baseY = CANVAS_HEIGHT - BLOCK_HEIGHT - 50;
    blocksRef.current.push({
      x: (CANVAS_WIDTH - INITIAL_BLOCK_WIDTH) / 2,
      y: baseY,
      width: INITIAL_BLOCK_WIDTH,
      color: getBlockColor(0),
      settled: true,
    });
    
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
        spawnNewBlock();
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop, initAudioContext, initBgParticles, playCountdownSound, spawnNewBlock]);
  
  const handleTap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current && !autoStackingRef.current && !readjustingRef.current) {
      placeBlock();
    }
  }, [gameState, placeBlock]);
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/BdklKYkhvUwo/sprinkles";
    const castText = `🏗️ I just stacked ${score} blocks in Glaze Stack!\n\nThink you can stack higher? Play FREE now! 🏆`;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`);
    } catch {
      try {
        await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl);
        alert("Copied!");
      } catch {}
    }
  }, [score]);
  
  useEffect(() => {
    if (gameState === "playing") return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    if (bgParticlesRef.current.length === 0) {
      for (let i = 0; i < 40; i++) {
        bgParticlesRef.current.push({
          x: Math.random() * CANVAS_WIDTH,
          y: Math.random() * CANVAS_HEIGHT,
          size: 1 + Math.random() * 2,
          speed: 0.2 + Math.random() * 0.4,
          alpha: 0.1 + Math.random() * 0.2,
        });
      }
    }
    
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGradient.addColorStop(0, "#1a1a1a");
      bgGradient.addColorStop(1, "#0d0d0d");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      bgParticlesRef.current.forEach(p => {
        p.y -= p.speed;
        if (p.y < 0) {
          p.y = CANVAS_HEIGHT;
          p.x = Math.random() * CANVAS_WIDTH;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      
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
      
      const previewColors = [BRAND_PINK, BRAND_GREEN, BRAND_PINK, BRAND_GREEN, BRAND_PINK];
      const baseY = CANVAS_HEIGHT - 70;
      const floatOffset = Math.sin(Date.now() / 500) * 4;
      const depth = 12;
      
      previewColors.forEach((color, i) => {
        const width = 120 - i * 8;
        const x = (CANVAS_WIDTH - width) / 2;
        const y = baseY - i * (BLOCK_HEIGHT - 2) + floatOffset;
        
        ctx.fillStyle = shadeColor(color, -25);
        ctx.beginPath();
        ctx.moveTo(x + width, y);
        ctx.lineTo(x + width + depth, y - depth);
        ctx.lineTo(x + width + depth, y + BLOCK_HEIGHT - depth);
        ctx.lineTo(x + width, y + BLOCK_HEIGHT);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = shadeColor(color, 15);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + depth, y - depth);
        ctx.lineTo(x + width + depth, y - depth);
        ctx.lineTo(x + width, y);
        ctx.closePath();
        ctx.fill();
        
        const gradient = ctx.createLinearGradient(x, y, x, y + BLOCK_HEIGHT);
        gradient.addColorStop(0, shadeColor(color, 10));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, shadeColor(color, -15));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, BLOCK_HEIGHT);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + 4, y + 3, width - 8, 4);
      });
      
      ctx.fillStyle = BRAND_PINK;
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GLAZE STACK", CANVAS_WIDTH / 2, 60);
      
      if (gameState === "countdown") {
        const scale = 1 + Math.sin(Date.now() / 100) * 0.08;
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
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
        ctx.fillText("GET READY!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      }
      
      if (gameState === "gameover") {
        ctx.fillStyle = "#FF6B6B";
        ctx.font = "bold 24px monospace";
        ctx.fillText("TOWER COLLAPSED!", CANVAS_WIDTH / 2, 100);
        
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 56px monospace";
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 155);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = "#888888";
        ctx.font = "14px monospace";
        ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 185);
        
        if (combo >= 3) {
          ctx.fillStyle = "#FFD700";
          ctx.font = "bold 14px monospace";
          ctx.fillText(`Max Combo: ${combo}x`, CANVAS_WIDTH / 2, 210);
        }
      }
    };
    
    draw();
    if (gameState === "menu" || gameState === "gameover" || gameState === "countdown") {
      const interval = setInterval(draw, 50);
      return () => clearInterval(interval);
    }
  }, [gameState, score, highScore, combo]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTap]);
  
  const isPlayPending = playState === 'confirming' || playState === 'recording' || isPending || isConfirming;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes placement-pop {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 0; }
        }
        .placement-indicator { animation: placement-pop 0.5s ease-out forwards; }
        * { -webkit-tap-highlight-color: transparent !important; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <Header title="GLAZE STACK" user={context?.user} />
        
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
            {gameState === "playing" && (
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleTap(); }}
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
            
            {lastPlacement && gameState === "playing" && (
              <div className="absolute top-24 left-0 right-0 flex justify-center pointer-events-none z-20">
                <span className={`placement-indicator font-bold text-lg ${
                  lastPlacement === "perfect" ? "text-yellow-400" : 
                  lastPlacement === "good" ? "text-green-400" : "text-zinc-400"
                }`}>
                  {lastPlacement === "perfect" ? "PERFECT!" : lastPlacement === "good" ? "GOOD!" : "OK"}
                </span>
              </div>
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
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Confirming...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span>
                      </>
                    )}
                  </button>
                  <p className="text-zinc-500 text-[10px]">Games this week: {gamesPlayedThisWeek}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && (
              <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20">
                <p className="text-zinc-600 text-[10px]">Tap to place block</p>
              </div>
            )}
          </div>
        </div>
        
        {(gameState === "menu" || gameState === "gameover") && (
          <div className="py-3 flex items-center justify-center gap-2">
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <HelpCircle className="w-3 h-3 text-zinc-400" />
              <span className="text-xs">How to Play</span>
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
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowLeaderboard(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <button onClick={() => setShowLeaderboard(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10">
                <X className="h-4 w-4" />
              </button>
              <div className="p-4 pb-2 flex-shrink-0">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-white" />
                  Weekly Leaderboard
                </h2>
              </div>
              <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
                <span className="text-xs text-gray-400">Prize Pool</span>
                <span className="text-sm font-bold text-green-400">${prizeInfo.totalPrize} USDC</span>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', maxHeight: '50vh' }}>
                {leaderboard.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-zinc-500">No scores yet!</p>
                    <p className="text-zinc-600 text-xs mt-1">Be the first to play this week</p>
                  </div>
                ) : leaderboard.map((entry) => {
                  const prize = prizeInfo.prizeStructure.find(p => p.rank === entry.rank);
                  return (
                    <div key={entry.rank} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-green-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-green-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                      </span>
                      {entry.pfpUrl ? (
                        <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-700" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-white">{entry.displayName || entry.username || `fid:${entry.fid}`}</span>
                        {prize && <span className="text-xs text-green-400">+${prize.amount}</span>}
                      </div>
                      <span className="font-bold text-sm text-white">{entry.score}</span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0">
                <p className="text-[10px] text-zinc-500 text-center">Prizes distributed every Friday in USDC</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 160px)' }}>
              <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2 flex-shrink-0">
                <HelpCircle className="w-4 h-4 text-white" />
                How to Play
              </h2>
              <div className="space-y-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Gameplay</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Tap to place the moving block. Align it perfectly with the block below to keep building! Misaligned portions fall off, making your tower narrower.</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Perfect Placement</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Land blocks perfectly to build combos! Perfect placements keep your block the same size. Get 5+ combo for bonus points!</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">3</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Power-Ups</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 space-y-1">
                      <div className="flex items-center gap-2"><span className="text-green-400 font-bold">+3</span> Auto Stack - Stacks 3 perfect blocks</div>
                      <div className="flex items-center gap-2"><span className="text-blue-400">⏱</span> Slow - Slows blocks, then 3s to readjust</div>
                      <div className="flex items-center gap-2"><span className="text-yellow-400 font-bold">2X</span> Double Points - 2x points for 10 seconds</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">4</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Weekly Prizes</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">FREE TO PLAY! Top 10 players each week win USDC prizes distributed every Friday at 6PM EST.</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowHelp(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors flex-shrink-0">Got it</button>
            </div>
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