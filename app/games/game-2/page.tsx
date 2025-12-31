"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Play, Zap, Share2, X, HelpCircle, Volume2, VolumeX, ChevronRight, Clock, Layers } from "lucide-react";

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

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; username: string; pfpUrl?: string; score: number };

const getBlockColor = (index: number): string => {
  const colors = [
    '#FFFFFF', '#F0F0F0', '#E0E0E0', '#D0D0D0', '#C0C0C0',
    '#B0B0B0', '#A0A0A0', '#FFFFFF', '#F0F0F0', '#E0E0E0',
  ];
  return colors[index % colors.length];
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
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
  const [attempts, setAttempts] = useState(0);
  const [entryCost, setEntryCost] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prizePool, setPrizePool] = useState<string>("0");
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [costResetCountdown, setCostResetCountdown] = useState<string>(getTimeUntilCostReset());
  const [lastPlacement, setLastPlacement] = useState<"perfect" | "good" | "ok" | null>(null);
  
  const PRIZE_DISTRIBUTION = [30, 20, 15, 10, 8, 6, 5, 3, 2, 1];
  
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
    const colors = ['#FFD700', '#FFA500', '#FFFFFF', '#FFFF00'];
    for (let i = 0; i < 20; i++) {
      particlesRef.current.push({
        x: x + Math.random() * width,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        life: 1,
        maxLife: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
      });
    }
  }, []);
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const ctx = await (sdk as any).context; if (!cancelled) setContext(ctx); } 
      catch { if (!cancelled) setContext(null); }
    })();
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  
  useEffect(() => {
    setAttempts(0);
    setEntryCost(1);
    setPrizePool("250.00");
    setLeaderboard([
      { rank: 1, username: "stackmaster", score: 47, pfpUrl: undefined },
      { rank: 2, username: "towerpro", score: 42, pfpUrl: undefined },
      { rank: 3, username: "blockbuilder", score: 38, pfpUrl: undefined },
      { rank: 4, username: "skyreacher", score: 35, pfpUrl: undefined },
      { rank: 5, username: "precisionking", score: 31, pfpUrl: undefined },
    ]);
  }, [address]);
  
  useEffect(() => {
    const updateCountdown = () => {
      setResetCountdown(getTimeUntilReset());
      setCostResetCountdown(getTimeUntilCostReset());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);
  
  const drawBlock = useCallback((ctx: CanvasRenderingContext2D, block: Block, cameraY: number, time: number) => {
    const screenY = block.y - cameraY;
    const depth = 10;
    
    if (screenY > CANVAS_HEIGHT + 50 || screenY < -50) return;
    
    let bounceOffset = 0;
    if (block.landTime) {
      const timeSinceLand = time - block.landTime;
      if (timeSinceLand < 200) {
        bounceOffset = Math.sin(timeSinceLand / 200 * Math.PI) * 4;
      }
    }
    
    const drawY = screenY - bounceOffset;
    
    ctx.fillStyle = shadeColor(block.color, -30);
    ctx.beginPath();
    ctx.moveTo(block.x + block.width, drawY);
    ctx.lineTo(block.x + block.width + depth, drawY - depth);
    ctx.lineTo(block.x + block.width + depth, drawY + BLOCK_HEIGHT - depth);
    ctx.lineTo(block.x + block.width, drawY + BLOCK_HEIGHT);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = shadeColor(block.color, 15);
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
    gradient.addColorStop(1, shadeColor(block.color, -10));
    
    ctx.fillStyle = gradient;
    ctx.fillRect(block.x, drawY, block.width, BLOCK_HEIGHT);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(block.x, drawY + 1);
    ctx.lineTo(block.x + block.width, drawY + 1);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(block.x, drawY + BLOCK_HEIGHT);
    ctx.lineTo(block.x + block.width, drawY + BLOCK_HEIGHT);
    ctx.stroke();
  }, []);
  
  const drawFallingPiece = useCallback((ctx: CanvasRenderingContext2D, piece: FallingPiece, cameraY: number) => {
    const screenY = piece.y - cameraY;
    
    ctx.save();
    ctx.globalAlpha = piece.opacity;
    ctx.translate(piece.x + piece.width / 2, screenY + BLOCK_HEIGHT / 2);
    ctx.rotate(piece.rotation);
    
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.width / 2, -BLOCK_HEIGHT / 2, piece.width, BLOCK_HEIGHT);
    
    ctx.restore();
  }, []);
  
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
    
    if (perfectPulseRef.current > 0) {
      ctx.fillStyle = `rgba(255, 215, 0, ${perfectPulseRef.current * 0.1})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      perfectPulseRef.current -= 0.05 * deltaTime;
      if (perfectPulseRef.current < 0) perfectPulseRef.current = 0;
    }
    
    cameraYRef.current += (targetCameraYRef.current - cameraYRef.current) * 0.08 * deltaTime;
    
    blocksRef.current.forEach(block => {
      drawBlock(ctx, block, cameraYRef.current, now);
    });
    
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 0.3 * deltaTime;
      p.life -= 0.02 * deltaTime;
      return p.life > 0;
    });
    drawParticles(ctx, cameraYRef.current);
    
    fallingPiecesRef.current = fallingPiecesRef.current.filter(piece => {
      piece.y += piece.velocityY * deltaTime;
      piece.x += piece.velocityX * deltaTime;
      piece.velocityY += 0.8 * deltaTime;
      piece.rotation += piece.rotationSpeed * deltaTime;
      piece.opacity -= 0.025 * deltaTime;
      if (piece.opacity > 0 && piece.y - cameraYRef.current < CANVAS_HEIGHT + 100) {
        drawFallingPiece(ctx, piece, cameraYRef.current);
        return true;
      }
      return false;
    });
    
    if (currentBlockRef.current && !currentBlockRef.current.settled) {
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
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBlock, drawFallingPiece, drawParticles]);
  
  const placeBlock = useCallback(() => {
    if (!gameActiveRef.current || !currentBlockRef.current) return;
    
    const current = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    if (!lastBlock) {
      current.settled = true;
      current.landTime = performance.now();
      blocksRef.current.push({ ...current });
      scoreRef.current++;
      setScore(scoreRef.current);
      playPlaceSound(true, 1);
      triggerHaptic(true);
      setLastPlacement("perfect");
      spawnPerfectParticles(current.x, current.y, current.width);
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
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      playGameOverSound();
      triggerHaptic(true);
      screenShakeRef.current = 1;
      
      blocksRef.current.forEach((block, i) => {
        setTimeout(() => {
          fallingPiecesRef.current.push({
            x: block.x,
            y: block.y,
            width: block.width,
            color: block.color,
            velocityY: -2 - Math.random() * 3,
            velocityX: (Math.random() - 0.5) * 4,
            rotation: 0,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            opacity: 1,
          });
        }, i * 50);
      });
      
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
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
      spawnPerfectParticles(current.x, current.y, current.width);
      perfectPulseRef.current = 1;
      screenShakeRef.current = 0.2;
    } else {
      const cutOffLeft = currentLeft < lastLeft ? lastLeft - currentLeft : 0;
      const cutOffRight = currentRight > lastRight ? currentRight - lastRight : 0;
      
      if (cutOffLeft > 0) {
        fallingPiecesRef.current.push({
          x: currentLeft,
          y: current.y,
          width: cutOffLeft,
          color: current.color,
          velocityY: 0,
          velocityX: -2 - Math.random() * 2,
          rotation: 0,
          rotationSpeed: -0.1 - Math.random() * 0.1,
          opacity: 1,
        });
      }
      if (cutOffRight > 0) {
        fallingPiecesRef.current.push({
          x: overlapRight,
          y: current.y,
          width: cutOffRight,
          color: current.color,
          velocityY: 0,
          velocityX: 2 + Math.random() * 2,
          rotation: 0,
          rotationSpeed: 0.1 + Math.random() * 0.1,
          opacity: 1,
        });
      }
      
      current.x = overlapLeft;
      current.width = overlapWidth;
      
      comboRef.current = 0;
      setCombo(0);
      playPlaceSound(false, 0);
      triggerHaptic(false);
      screenShakeRef.current = 0.15;
      
      if (overlapWidth > lastBlock.width * 0.8) {
        setLastPlacement("good");
      } else {
        setLastPlacement("ok");
      }
    }
    
    setTimeout(() => setLastPlacement(null), 500);
    
    if (current.width < 12) {
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      playGameOverSound();
      triggerHaptic(true);
      screenShakeRef.current = 1;
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
      return;
    }
    
    current.settled = true;
    current.landTime = performance.now();
    blocksRef.current.push({ ...current });
    scoreRef.current++;
    setScore(scoreRef.current);
    
    const desiredScreenY = 180;
    const topBlockY = current.y - BLOCK_HEIGHT;
    const newCameraTarget = topBlockY - desiredScreenY;
    if (newCameraTarget < targetCameraYRef.current) {
      targetCameraYRef.current = newCameraTarget;
    }
    
    speedRef.current = Math.min(BASE_SPEED + scoreRef.current * SPEED_INCREMENT, MAX_SPEED);
    
    spawnNewBlock();
  }, [playPlaceSound, playGameOverSound, triggerHaptic, spawnPerfectParticles]);
  
  const spawnNewBlock = useCallback(() => {
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    const newY = lastBlock ? lastBlock.y - BLOCK_HEIGHT : CANVAS_HEIGHT - BLOCK_HEIGHT - 50;
    const newWidth = lastBlock ? lastBlock.width : INITIAL_BLOCK_WIDTH;
    const newX = directionRef.current === 1 ? -newWidth : CANVAS_WIDTH;
    
    currentBlockRef.current = {
      x: newX,
      y: newY,
      width: newWidth,
      color: getBlockColor(blocks.length),
      settled: false,
    };
  }, []);
  
  const startGame = useCallback(() => {
    initAudioContext();
    
    blocksRef.current = [];
    fallingPiecesRef.current = [];
    particlesRef.current = [];
    currentBlockRef.current = null;
    directionRef.current = 1;
    speedRef.current = BASE_SPEED;
    scoreRef.current = 0;
    comboRef.current = 0;
    cameraYRef.current = 0;
    targetCameraYRef.current = 0;
    countdownRef.current = 3;
    lastFrameTimeRef.current = performance.now();
    screenShakeRef.current = 0;
    perfectPulseRef.current = 0;
    
    setScore(0);
    setCombo(0);
    setCountdown(3);
    setGameState("countdown");
    setError(null);
    setLastPlacement(null);
    
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
  }, [gameLoop, initAudioContext, playCountdownSound, spawnNewBlock]);
  
  const handleTap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      placeBlock();
    }
  }, [gameState, placeBlock]);
  
  const handlePlay = () => {
    setIsLoading(true);
    setError(null);
    
    setTimeout(() => {
      setAttempts(prev => prev + 1);
      setEntryCost(prev => prev + 1);
      setIsLoading(false);
      startGame();
    }, 500);
  };
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🏗️ I just stacked ${score} blocks in Stack Tower on the Sprinkles App by @swishh.eth!\n\nThink you can build higher? Play now and compete for the ${prizePool} 🍩 weekly prize pool! 🏆`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score, prizePool]);
  
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    const draw = () => {
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
      
      const previewColors = ['#FFFFFF', '#F0F0F0', '#E0E0E0', '#D0D0D0', '#C0C0C0'];
      const baseY = CANVAS_HEIGHT - 70;
      const floatOffset = Math.sin(Date.now() / 500) * 4;
      const depth = 10;
      
      previewColors.forEach((color, i) => {
        const width = 130 - i * 10;
        const x = (CANVAS_WIDTH - width) / 2;
        // Subtract 1 less per block to create 1px overlap and eliminate gaps
        const y = baseY - i * (BLOCK_HEIGHT - 1) + floatOffset;
        
        ctx.fillStyle = shadeColor(color, -30);
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
        gradient.addColorStop(0, shadeColor(color, 5));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, shadeColor(color, -10));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, BLOCK_HEIGHT);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(x, y + 1);
        ctx.lineTo(x + width, y + 1);
        ctx.stroke();
      });
      
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";
      ctx.fillText("STACK TOWER", CANVAS_WIDTH / 2, 60);
      
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
      if (e.code === "Space") { e.preventDefault(); handleTap(); } 
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTap]);
  
  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes placement-pop {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 0; }
        }
        .placement-indicator {
          animation: placement-pop 0.5s ease-out forwards;
        }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-3 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        <div className="flex items-center justify-between mb-2 px-1">
          <h1 className="text-xl font-bold tracking-wide">STACK TOWER</h1>
          {context?.user && (
            <div className="flex items-center gap-2 rounded-full bg-black px-2 py-0.5">
              <Avatar className="h-6 w-6 border border-zinc-800">
                <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                <AvatarFallback className="bg-zinc-800 text-white text-[10px]">{initialsFrom(userDisplayName)}</AvatarFallback>
              </Avatar>
              <div className="leading-tight text-left">
                <div className="text-xs font-bold">{userDisplayName}</div>
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={() => setShowLeaderboard(true)}
          className="relative w-full mb-3 px-4 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl transition-all active:scale-[0.98] hover:border-amber-500/50 group"
          style={{ minHeight: '70px' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] text-amber-200/80 font-medium">Weekly Prize Pool</span>
              </div>
              <span className="text-2xl font-bold text-amber-400">{prizePool} 🍩</span>
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
        
        <div className="flex flex-col items-center">
          <div 
            className="relative w-full" 
            style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
          >
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
              style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }} 
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
              <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500">
                      <Share2 className="w-3 h-3" /><span>Share</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs">Entry: <span className="font-bold">{entryCost} 🍩</span></span>
                  </div>
                  <button onClick={handlePlay} disabled={isLoading} className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 active:scale-95 disabled:opacity-50">
                    {isLoading ? (
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Processing...</span></>
                    ) : (
                      <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>
                    )}
                  </button>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <p className="text-zinc-500 text-[10px]">Attempts today: {attempts} • Resets in {costResetCountdown}</p>
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
              <HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs">How to Play</span>
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>
              {isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}
              <span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          </div>
        )}
        
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
                  <span className="text-sm font-bold text-amber-400">{prizePool} 🍩</span>
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
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-amber-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                      </span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🏗️</div>}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{entry.username}</span>
                        <span className="text-xs text-amber-400">+{prizeAmount} 🍩</span>
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
        
        {showHelp && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><HelpCircle className="w-5 h-5 text-zinc-400" /><span className="font-bold">How to Play</span></div>
                <button onClick={() => setShowHelp(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-amber-400" />Gameplay</h3>
                  <p className="text-xs text-zinc-400">Tap to place the moving block. Align it perfectly with the block below to keep building! Misaligned portions fall off, making your tower narrower.</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Perfect Placement</h3>
                  <p className="text-xs text-zinc-400">Land blocks perfectly to build combos! Perfect placements keep your block the same size and increase your combo multiplier.</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" />Entry Cost</h3>
                  <p className="text-xs text-zinc-400">Each game costs DONUT to play. The cost increases with each attempt:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• 1st game: <span className="text-white">1 DONUT</span></li>
                    <li>• 2nd game: <span className="text-white">2 DONUT</span></li>
                    <li>• 3rd game: <span className="text-white">3 DONUT</span></li>
                    <li>• And so on...</li>
                  </ul>
                  <p className="text-xs text-zinc-500 mt-2">Cost resets daily at 6PM EST</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" />Weekly Rewards</h3>
                  <p className="text-xs text-zinc-400">Every week, the prize pool is distributed to the top 10 players based on their highest score:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                    <div className="flex justify-between"><span className="text-amber-400">🥇 1st</span><span className="text-white">30%</span></div>
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

function shadeColor(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + 
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + 
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + 
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}