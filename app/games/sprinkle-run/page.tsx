"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Play, Share2, X, HelpCircle, Volume2, VolumeX, ChevronRight, Clock, AlertTriangle } from "lucide-react";

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 640;
const CANVAS_SCALE = 2;
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;

// Game mechanics
const LANE_WIDTH = 80;
const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH];
const PLAYER_SIZE = 40;
const GROUND_Y = CANVAS_HEIGHT - 120;
const JUMP_FORCE = -18;
const GRAVITY = 0.8;
const SLIDE_DURATION = 500;

// Speed progression
const BASE_SPEED = 6;
const MAX_SPEED = 14;
const SPEED_INCREMENT = 0.001;

type ObstacleType = 'low' | 'high' | 'full';
type CollectibleType = 'sprinkle' | 'donut';

interface Obstacle {
  lane: number;
  z: number;
  type: ObstacleType;
  width: number;
  height: number;
}

interface Collectible {
  lane: number;
  z: number;
  type: CollectibleType;
  collected: boolean;
}

interface TrackSegment {
  z: number;
  color: string;
}

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
};

const TUNNEL_COLORS = [
  '#FF69B4', '#00CED1', '#FF1493', '#00BFFF', '#FF6B9D',
  '#40E0D0', '#FF85A2', '#48D1CC', '#FFB6C1', '#20B2AA'
];

export default function SprinkleRunPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "countdown" | "playing" | "gameover">("menu");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [sprinkles, setSprinkles] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Game state refs
  const playerRef = useRef({
    lane: 1,
    targetLane: 1,
    x: 0,
    y: GROUND_Y,
    velocityY: 0,
    isJumping: false,
    isSliding: false,
    slideEndTime: 0,
  });
  
  const obstaclesRef = useRef<Obstacle[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);
  const trackSegmentsRef = useRef<TrackSegment[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const distanceRef = useRef(0);
  const sprinklesRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameActiveRef = useRef(false);
  const countdownRef = useRef(3);
  
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInitializedRef = useRef(false);
  
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
  
  const playSound = useCallback((freq: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMuted || !audioInitializedRef.current) return;
    setTimeout(() => {
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const playCollectSound = useCallback(() => playSound(880, 0.1), [playSound]);
  const playJumpSound = useCallback(() => playSound(440, 0.15, 'triangle'), [playSound]);
  const playCrashSound = useCallback(() => playSound(150, 0.3, 'sawtooth'), [playSound]);
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const ctx = await (sdk as any).context; if (!cancelled) setContext(ctx); } 
      catch { if (!cancelled) setContext(null); }
    })();
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  
  const spawnObstacle = useCallback(() => {
    const lane = Math.floor(Math.random() * 3);
    const types: ObstacleType[] = ['low', 'high', 'full'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    obstaclesRef.current.push({
      lane,
      z: 1000,
      type,
      width: 60,
      height: type === 'low' ? 40 : type === 'high' ? 60 : 80,
    });
  }, []);
  
  const spawnCollectible = useCallback(() => {
    const lane = Math.floor(Math.random() * 3);
    const type: CollectibleType = Math.random() > 0.8 ? 'donut' : 'sprinkle';
    
    collectiblesRef.current.push({
      lane,
      z: 1000,
      type,
      collected: false,
    });
  }, []);
  
  const initTrack = useCallback(() => {
    trackSegmentsRef.current = [];
    for (let i = 0; i < 20; i++) {
      trackSegmentsRef.current.push({
        z: i * 100,
        color: TUNNEL_COLORS[i % TUNNEL_COLORS.length],
      });
    }
  }, []);
  
  const project = useCallback((x: number, z: number): { x: number; y: number; scale: number } => {
    const fov = 200;
    const cameraZ = -100;
    const scale = fov / (z - cameraZ + fov);
    const projX = CANVAS_WIDTH / 2 + x * scale;
    const projY = CANVAS_HEIGHT / 2 + (GROUND_Y - CANVAS_HEIGHT / 2) * scale;
    return { x: projX, y: projY, scale };
  }, []);
  
  const drawTrack = useCallback((ctx: CanvasRenderingContext2D) => {
    trackSegmentsRef.current.forEach((segment, i) => {
      if (segment.z < 0 || segment.z > 1200) return;
      
      const { scale } = project(0, segment.z);
      const ringRadius = 300 * scale;
      
      if (ringRadius < 5) return;
      
      ctx.strokeStyle = segment.color;
      ctx.lineWidth = Math.max(2, 15 * scale);
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50 * scale, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      if (i % 2 === 0) {
        const sprinkleColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
        for (let j = 0; j < 8; j++) {
          const angle = (j / 8) * Math.PI * 2 + segment.z * 0.01;
          const sx = CANVAS_WIDTH / 2 + Math.cos(angle) * ringRadius * 0.9;
          const sy = CANVAS_HEIGHT / 2 - 50 * scale + Math.sin(angle) * ringRadius * 0.9;
          ctx.fillStyle = sprinkleColors[j % sprinkleColors.length];
          ctx.fillRect(sx - 3 * scale, sy - 1 * scale, 6 * scale, 2 * scale);
        }
      }
    });
    
    for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
      const laneX = LANE_POSITIONS[laneIdx];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let z = 0; z < 1000; z += 50) {
        const { x, y } = project(laneX, z);
        if (z === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    const gradient = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - 200);
    gradient.addColorStop(0, '#FF69B4');
    gradient.addColorStop(0.5, '#FF1493');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    const { x: rx } = project(150, 800);
    const { x: lx } = project(-150, 800);
    ctx.lineTo(rx, CANVAS_HEIGHT - 150);
    ctx.lineTo(lx, CANVAS_HEIGHT - 150);
    ctx.closePath();
    ctx.fill();
  }, [project]);
  
  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const targetX = LANE_POSITIONS[player.targetLane];
    
    player.x += (targetX - player.x) * 0.2;
    
    const { x, y, scale } = project(player.x, 50);
    const size = PLAYER_SIZE * scale * 1.5;
    
    let drawY = y;
    if (player.isJumping) {
      drawY = y + (player.y - GROUND_Y) * scale;
    }
    if (player.isSliding) {
      drawY = y + 15 * scale;
    }
    
    ctx.save();
    ctx.translate(x, drawY);
    
    const runCycle = Math.sin(Date.now() * 0.015) * 5;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, size / 2 + 5, size / 2, size / 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = '#FF69B4';
    ctx.shadowBlur = 20;
    
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    gradient.addColorStop(0, '#FFB6C1');
    gradient.addColorStop(0.7, '#FF69B4');
    gradient.addColorStop(1, '#FF1493');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, player.isSliding ? size / 4 : 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, player.isSliding ? size / 4 : 0, size / 5, 0, Math.PI * 2);
    ctx.fill();
    
    const sprinkleColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Date.now() * 0.002;
      const dist = size / 3;
      const sx = Math.cos(angle) * dist;
      const sy = (player.isSliding ? size / 4 : 0) + Math.sin(angle) * dist * 0.7;
      ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.fillRect(-4, -1.5, 8, 3);
      ctx.restore();
    }
    
    if (!player.isSliding) {
      ctx.fillStyle = '#8B4513';
      ctx.save();
      ctx.translate(-size / 4, size / 2);
      ctx.rotate(Math.sin(Date.now() * 0.02) * 0.5);
      ctx.fillRect(-5, 0, 10, 20 + runCycle);
      ctx.fillStyle = '#FF69B4';
      ctx.fillRect(-7, 18 + runCycle, 14, 8);
      ctx.restore();
      
      ctx.save();
      ctx.translate(size / 4, size / 2);
      ctx.rotate(-Math.sin(Date.now() * 0.02) * 0.5);
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(-5, 0, 10, 20 - runCycle);
      ctx.fillStyle = '#FF69B4';
      ctx.fillRect(-7, 18 - runCycle, 14, 8);
      ctx.restore();
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-8, player.isSliding ? size / 4 - 5 : -5, 6, 0, Math.PI * 2);
    ctx.arc(8, player.isSliding ? size / 4 - 5 : -5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-8, player.isSliding ? size / 4 - 5 : -5, 3, 0, Math.PI * 2);
    ctx.arc(8, player.isSliding ? size / 4 - 5 : -5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }, [project]);
  
  const drawObstacles = useCallback((ctx: CanvasRenderingContext2D) => {
    obstaclesRef.current.forEach(obstacle => {
      if (obstacle.z < 0 || obstacle.z > 1200) return;
      
      const laneX = LANE_POSITIONS[obstacle.lane];
      const { x, y, scale } = project(laneX, obstacle.z);
      
      const width = obstacle.width * scale;
      const height = obstacle.height * scale;
      
      ctx.save();
      ctx.translate(x, y);
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(0, height / 2, width / 2, height / 6, 0, 0, Math.PI * 2);
      ctx.fill();
      
      const pinGradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
      pinGradient.addColorStop(0, '#D4A574');
      pinGradient.addColorStop(0.3, '#F5DEB3');
      pinGradient.addColorStop(0.5, '#FFEFD5');
      pinGradient.addColorStop(0.7, '#F5DEB3');
      pinGradient.addColorStop(1, '#D4A574');
      
      ctx.fillStyle = pinGradient;
      
      if (obstacle.type === 'low') {
        ctx.fillRect(-width / 2, -height / 4, width, height / 2);
        ctx.beginPath();
        ctx.arc(-width / 2, 0, height / 4, 0, Math.PI * 2);
        ctx.arc(width / 2, 0, height / 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (obstacle.type === 'high') {
        ctx.fillRect(-width / 2, -height, width, height / 2);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-width / 2 - 5, -height - 10, 10, height + 20);
        ctx.fillRect(width / 2 - 5, -height - 10, 10, height + 20);
      } else {
        ctx.fillRect(-width / 3, -height, width / 1.5, height);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-width / 3 - 8, -height + 10, 12, 20);
        ctx.fillRect(width / 3 - 4, -height + 10, 12, 20);
      }
      
      ctx.restore();
    });
  }, [project]);
  
  const drawCollectibles = useCallback((ctx: CanvasRenderingContext2D) => {
    collectiblesRef.current.forEach(collectible => {
      if (collectible.collected || collectible.z < 0 || collectible.z > 1200) return;
      
      const laneX = LANE_POSITIONS[collectible.lane];
      const { x, y, scale } = project(laneX, collectible.z);
      
      ctx.save();
      ctx.translate(x, y - 30 * scale);
      
      const float = Math.sin(Date.now() * 0.005 + collectible.z * 0.01) * 5;
      ctx.translate(0, float);
      
      if (collectible.type === 'sprinkle') {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
        const color = colors[Math.floor(collectible.z / 100) % colors.length];
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.save();
        ctx.rotate(Date.now() * 0.003);
        ctx.fillRect(-10 * scale, -3 * scale, 20 * scale, 6 * scale);
        ctx.restore();
      } else {
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, 15 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    });
  }, [project]);
  
  const checkCollisions = useCallback((): boolean => {
    const player = playerRef.current;
    const playerLane = player.targetLane;
    const playerZ = 50;
    
    for (const obstacle of obstaclesRef.current) {
      if (Math.abs(obstacle.z - playerZ) < 40 && obstacle.lane === playerLane) {
        if (obstacle.type === 'low' && player.isJumping && player.y < GROUND_Y - 30) {
          continue;
        }
        if (obstacle.type === 'high' && player.isSliding) {
          continue;
        }
        return true;
      }
    }
    
    return false;
  }, []);
  
  const checkCollectibles = useCallback(() => {
    const player = playerRef.current;
    const playerLane = player.targetLane;
    const playerZ = 50;
    
    collectiblesRef.current.forEach(collectible => {
      if (!collectible.collected && Math.abs(collectible.z - playerZ) < 50 && collectible.lane === playerLane) {
        collectible.collected = true;
        if (collectible.type === 'sprinkle') {
          sprinklesRef.current += 1;
        } else {
          sprinklesRef.current += 10;
        }
        setSprinkles(sprinklesRef.current);
        playCollectSound();
      }
    });
  }, [playCollectSound]);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    const now = performance.now();
    const delta = Math.min((now - lastFrameTimeRef.current) / 16.667, 2);
    lastFrameTimeRef.current = now;
    
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGradient.addColorStop(0, '#87CEEB');
    skyGradient.addColorStop(0.5, '#00BFFF');
    skyGradient.addColorStop(1, '#FF69B4');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta, MAX_SPEED);
    const speed = speedRef.current;
    
    distanceRef.current += speed * delta;
    const newScore = Math.floor(distanceRef.current / 10) + sprinklesRef.current * 5;
    setScore(newScore);
    
    trackSegmentsRef.current.forEach(segment => {
      segment.z -= speed * delta;
      if (segment.z < -100) {
        segment.z += 2000;
        segment.color = TUNNEL_COLORS[Math.floor(Math.random() * TUNNEL_COLORS.length)];
      }
    });
    
    obstaclesRef.current.forEach(obstacle => {
      obstacle.z -= speed * delta;
    });
    obstaclesRef.current = obstaclesRef.current.filter(o => o.z > -100);
    
    if (obstaclesRef.current.length === 0 || obstaclesRef.current[obstaclesRef.current.length - 1].z < 700) {
      spawnObstacle();
    }
    
    collectiblesRef.current.forEach(collectible => {
      collectible.z -= speed * delta;
    });
    collectiblesRef.current = collectiblesRef.current.filter(c => c.z > -100 && !c.collected);
    
    if (collectiblesRef.current.length < 5 && Math.random() < 0.02) {
      spawnCollectible();
    }
    
    const player = playerRef.current;
    if (player.isJumping) {
      player.velocityY += GRAVITY * delta;
      player.y += player.velocityY * delta;
      
      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.velocityY = 0;
        player.isJumping = false;
      }
    }
    
    if (player.isSliding && Date.now() > player.slideEndTime) {
      player.isSliding = false;
    }
    
    drawTrack(ctx);
    drawCollectibles(ctx);
    drawObstacles(ctx);
    drawPlayer(ctx);
    
    checkCollectibles();
    if (checkCollisions()) {
      playCrashSound();
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, newScore));
      return;
    }
    
    // UI
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${newScore}`, 20, 40);
    
    ctx.font = '14px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`🍩 ${sprinklesRef.current}`, 20, 65);
    
    // TEST MODE label
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('TEST MODE', CANVAS_WIDTH - 10, 30);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawTrack, drawPlayer, drawObstacles, drawCollectibles, checkCollisions, checkCollectibles, spawnObstacle, spawnCollectible, playCrashSound]);
  
  const moveLeft = useCallback(() => {
    if (!gameActiveRef.current) return;
    const player = playerRef.current;
    if (player.targetLane > 0) {
      player.targetLane--;
      playSound(300, 0.05);
    }
  }, [playSound]);
  
  const moveRight = useCallback(() => {
    if (!gameActiveRef.current) return;
    const player = playerRef.current;
    if (player.targetLane < 2) {
      player.targetLane++;
      playSound(300, 0.05);
    }
  }, [playSound]);
  
  const jump = useCallback(() => {
    if (!gameActiveRef.current) return;
    const player = playerRef.current;
    if (!player.isJumping && !player.isSliding) {
      player.isJumping = true;
      player.velocityY = JUMP_FORCE;
      playJumpSound();
    }
  }, [playJumpSound]);
  
  const slide = useCallback(() => {
    if (!gameActiveRef.current) return;
    const player = playerRef.current;
    if (!player.isJumping && !player.isSliding) {
      player.isSliding = true;
      player.slideEndTime = Date.now() + SLIDE_DURATION;
      playSound(200, 0.1);
    }
  }, [playSound]);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    
    const minSwipe = 30;
    const maxTime = 300;
    
    if (dt < maxTime) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipe) {
        if (dx > 0) moveRight();
        else moveLeft();
      } else if (Math.abs(dy) > minSwipe) {
        if (dy < 0) jump();
        else slide();
      }
    }
    
    touchStartRef.current = null;
  }, [moveLeft, moveRight, jump, slide]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft();
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight();
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') jump();
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') slide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveLeft, moveRight, jump, slide]);
  
  const startGame = useCallback(() => {
    initAudioContext();
    
    playerRef.current = {
      lane: 1,
      targetLane: 1,
      x: 0,
      y: GROUND_Y,
      velocityY: 0,
      isJumping: false,
      isSliding: false,
      slideEndTime: 0,
    };
    
    obstaclesRef.current = [];
    collectiblesRef.current = [];
    speedRef.current = BASE_SPEED;
    distanceRef.current = 0;
    sprinklesRef.current = 0;
    countdownRef.current = 3;
    
    initTrack();
    
    setScore(0);
    setSprinkles(0);
    setCountdown(3);
    setGameState("countdown");
    
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      countdownRef.current = count;
      setCountdown(count);
      
      if (count <= 0) {
        clearInterval(countdownInterval);
        lastFrameTimeRef.current = performance.now();
        gameActiveRef.current = true;
        setGameState("playing");
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop, initAudioContext, initTrack]);
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🏃‍♂️🍩 I just ran ${Math.floor(distanceRef.current)}m and scored ${score} in Sprinkle Run on the Sprinkles App by @swishh.eth!`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score]);
  
  // Draw menu
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      const time = Date.now() * 0.001;
      const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      skyGradient.addColorStop(0, '#87CEEB');
      skyGradient.addColorStop(0.5, '#00BFFF');
      skyGradient.addColorStop(1, '#FF69B4');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      for (let i = 0; i < 10; i++) {
        const z = ((i * 100 + time * 50) % 1000);
        const scale = 200 / (z + 200);
        const radius = 300 * scale;
        ctx.strokeStyle = TUNNEL_COLORS[i % TUNNEL_COLORS.length];
        ctx.lineWidth = Math.max(2, 15 * scale);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 20;
      ctx.fillText('SPRINKLE', CANVAS_WIDTH / 2, 80);
      ctx.fillText('RUN', CANVAS_WIDTH / 2, 120);
      ctx.shadowBlur = 0;
      
      // Animated donut
      const bounceY = Math.sin(time * 3) * 10;
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + bounceY);
      
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#FF69B4';
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      
      const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + time;
        const x = Math.cos(angle) * 32;
        const y = Math.sin(angle) * 32;
        ctx.fillStyle = colors[i % colors.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillRect(-6, -2, 12, 4);
        ctx.restore();
      }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-12, -8, 8, 0, Math.PI * 2);
      ctx.arc(12, -8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(-12, -8, 4, 0, Math.PI * 2);
      ctx.arc(12, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      
      if (gameState === "countdown") {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 100px monospace';
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 40;
        ctx.fillText(countdownRef.current.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 150);
        ctx.shadowBlur = 0;
      }
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 28px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 200);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 150);
        ctx.fillStyle = '#888888';
        ctx.font = '14px monospace';
        ctx.fillText(`Distance: ${Math.floor(distanceRef.current)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 120);
      }
    };
    
    draw();
    const interval = setInterval(draw, 50);
    return () => clearInterval(interval);
  }, [gameState, score]);
  
  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;
  
  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-3 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <h1 className="text-xl font-bold tracking-wide text-pink-400">SPRINKLE RUN</h1>
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
        
        {/* Test Mode Banner */}
        <div className="w-full mb-3 px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <span className="text-xs text-yellow-300 font-bold">TEST MODE - NOT REAL MONEY</span>
        </div>
        
        {/* Game Canvas */}
        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={SCALED_WIDTH}
              height={SCALED_HEIGHT}
              className="rounded-2xl border border-zinc-800 w-full h-full select-none"
              style={{ touchAction: "none" }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            />
            
            {/* Controls during gameplay */}
            {gameState === "playing" && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 pointer-events-auto">
                <button onPointerDown={moveLeft} className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center active:bg-white/40">
                  <span className="text-2xl">◀</span>
                </button>
                <button onPointerDown={jump} className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center active:bg-white/40">
                  <span className="text-2xl">▲</span>
                </button>
                <button onPointerDown={slide} className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center active:bg-white/40">
                  <span className="text-2xl">▼</span>
                </button>
                <button onPointerDown={moveRight} className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center active:bg-white/40">
                  <span className="text-2xl">▶</span>
                </button>
              </div>
            )}
            
            {/* Menu/Gameover overlay */}
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500">
                      <Share2 className="w-3 h-3" /><span>Share</span>
                    </button>
                  )}
                  <button onClick={startGame} className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-pink-500 to-cyan-500 text-white font-bold rounded-full hover:opacity-90 active:scale-95">
                    <Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play (Free Test)"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Help and Sound buttons */}
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
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-pink-400" />Controls</h3>
                  <p className="text-xs text-zinc-400">Swipe or use buttons:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• <span className="text-white">◀ ▶</span> - Switch lanes</li>
                    <li>• <span className="text-white">▲</span> - Jump over low obstacles</li>
                    <li>• <span className="text-white">▼</span> - Slide under high obstacles</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-400" />Scoring</h3>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• <span className="text-white">Distance</span> - 1 point per 10m</li>
                    <li>• <span className="text-white">Sprinkles</span> - 5 points each</li>
                    <li>• <span className="text-yellow-400">Golden Donuts</span> - 50 points!</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-400" />Test Mode</h3>
                  <p className="text-xs text-zinc-400">This is a test version. No DONUT required to play. Scores are not saved to leaderboard.</p>
                </div>
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-gradient-to-r from-pink-500 to-cyan-500 text-white font-bold rounded-full">
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