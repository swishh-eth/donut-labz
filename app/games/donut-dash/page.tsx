"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Play, Share2, X, HelpCircle, Volume2, VolumeX, AlertTriangle } from "lucide-react";

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2;
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;

// Physics - tuned for smooth jetpack feel
const GRAVITY = 0.25;
const THRUST = -0.55;
const MAX_VELOCITY = 5;
const PLAYER_X = 80;
const PLAYER_SIZE = 32;

// Game speed
const BASE_SPEED = 4;
const MAX_SPEED = 8;
const SPEED_INCREMENT = 0.0005;

// Obstacle types
type ObstacleType = 'zapper_h' | 'zapper_v' | 'zapper_diag' | 'missile';

interface Obstacle {
  x: number;
  y: number;
  type: ObstacleType;
  width: number;
  height: number;
  angle?: number;
  warning?: boolean;
  warningTime?: number;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

interface GroundBlock {
  x: number;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
};

export default function DonutDashPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [distance, setDistance] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Game state refs
  const playerRef = useRef({
    y: CANVAS_HEIGHT / 2,
    velocity: 0,
    isThrusting: false,
  });
  
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const groundBlocksRef = useRef<GroundBlock[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const distanceRef = useRef(0);
  const coinsCollectedRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameActiveRef = useRef(false);
  const lastObstacleX = useRef(0);
  const frameCountRef = useRef(0);
  const gameTimeRef = useRef(0);
  
  // Background elements
  const bgElementsRef = useRef<{ x: number; y: number; type: string; speed: number; height?: number }[]>([]);
  
  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInitializedRef = useRef(false);
  const thrustOscRef = useRef<OscillatorNode | null>(null);
  const thrustGainRef = useRef<GainNode | null>(null);
  
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
  
  const playSound = useCallback((freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) => {
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
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch {}
    }, 0);
  }, [isMuted]);
  
  const startThrustSound = useCallback(() => {
    if (isMuted || !audioInitializedRef.current || thrustOscRef.current) return;
    try {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.start();
      thrustOscRef.current = osc;
      thrustGainRef.current = gain;
    } catch {}
  }, [isMuted]);
  
  const stopThrustSound = useCallback(() => {
    try {
      if (thrustGainRef.current) {
        thrustGainRef.current.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current!.currentTime + 0.1);
      }
      if (thrustOscRef.current) {
        thrustOscRef.current.stop(audioContextRef.current!.currentTime + 0.1);
        thrustOscRef.current = null;
        thrustGainRef.current = null;
      }
    } catch {}
  }, []);
  
  const playCollectSound = useCallback(() => playSound(880, 0.1, 'sine', 0.15), [playSound]);
  const playCrashSound = useCallback(() => playSound(100, 0.4, 'sawtooth', 0.2), [playSound]);
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const ctx = await (sdk as any).context; if (!cancelled) setContext(ctx); } 
      catch { if (!cancelled) setContext(null); }
    })();
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  
  // Initialize background elements - lab equipment on ground
  const initBackground = useCallback(() => {
    bgElementsRef.current = [];
    // Lab equipment silhouettes - all anchored to floor
    const labTypes = ['beaker', 'flask', 'tube', 'machine', 'tank'];
    for (let i = 0; i < 8; i++) {
      bgElementsRef.current.push({
        x: i * 60 + Math.random() * 40,
        y: CANVAS_HEIGHT - 30, // Always on the floor
        type: labTypes[Math.floor(Math.random() * labTypes.length)],
        speed: 0.15 + Math.random() * 0.1,
        height: 50 + Math.random() * 60,
      });
    }
  }, []);
  
  // Spawn obstacle
  const spawnObstacle = useCallback(() => {
    const types: ObstacleType[] = ['zapper_h', 'zapper_v', 'zapper_diag'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    let obstacle: Obstacle;
    
    if (type === 'zapper_h') {
      // Horizontal zapper
      const y = 50 + Math.random() * (CANVAS_HEIGHT - 150);
      obstacle = {
        x: CANVAS_WIDTH + 50,
        y,
        type,
        width: 80 + Math.random() * 60,
        height: 20,
      };
    } else if (type === 'zapper_v') {
      // Vertical zapper
      const fromTop = Math.random() > 0.5;
      obstacle = {
        x: CANVAS_WIDTH + 50,
        y: fromTop ? 0 : CANVAS_HEIGHT - 120,
        type,
        width: 20,
        height: 100 + Math.random() * 80,
      };
    } else {
      // Diagonal zapper
      const y = 50 + Math.random() * (CANVAS_HEIGHT - 200);
      obstacle = {
        x: CANVAS_WIDTH + 50,
        y,
        type,
        width: 100,
        height: 20,
        angle: Math.random() > 0.5 ? 30 : -30,
      };
    }
    
    obstaclesRef.current.push(obstacle);
  }, []);
  
  // Spawn coins in patterns (sprinkles only)
  const spawnCoins = useCallback(() => {
    const patterns = ['line', 'arc', 'wave'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const startX = CANVAS_WIDTH + 50;
    const centerY = 80 + Math.random() * (CANVAS_HEIGHT - 200);
    
    if (pattern === 'line') {
      for (let i = 0; i < 5; i++) {
        coinsRef.current.push({
          x: startX + i * 30,
          y: centerY,
          collected: false,
        });
      }
    } else if (pattern === 'arc') {
      for (let i = 0; i < 7; i++) {
        const angle = (i / 6) * Math.PI;
        coinsRef.current.push({
          x: startX + i * 25,
          y: centerY + Math.sin(angle) * 40,
          collected: false,
        });
      }
    } else {
      // Wave pattern
      for (let i = 0; i < 6; i++) {
        coinsRef.current.push({
          x: startX + i * 25,
          y: centerY + Math.sin(i * 0.8) * 30,
          collected: false,
        });
      }
    }
  }, []);
  
  // Spawn ground blocks (after 10 seconds)
  const spawnGroundBlock = useCallback(() => {
    groundBlocksRef.current.push({
      x: CANVAS_WIDTH + 20,
      width: 30 + Math.random() * 40,
      height: 25 + Math.random() * 35,
    });
  }, []);
  
  // Add thrust particles
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
  
  // Draw background - laboratory style
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    // Solid dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Subtle gradient overlay
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(30, 30, 30, 0.5)');
    gradient.addColorStop(0.5, 'rgba(25, 25, 25, 0)');
    gradient.addColorStop(1, 'rgba(30, 30, 30, 0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Lab equipment silhouettes (all grounded on floor)
    const floorY = CANVAS_HEIGHT - 30;
    bgElementsRef.current.forEach(el => {
      el.x -= speed * el.speed;
      if (el.x < -60) {
        el.x = CANVAS_WIDTH + 60;
        el.height = 50 + Math.random() * 60;
      }
      
      const h = el.height || 60;
      ctx.fillStyle = 'rgba(45, 45, 45, 0.9)';
      
      if (el.type === 'beaker') {
        // Simple beaker shape sitting on floor
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
        // Round flask on floor
        ctx.beginPath();
        ctx.arc(el.x, floorY - h * 0.4, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(el.x - 5, floorY - h, 10, h * 0.5);
      } else if (el.type === 'tube') {
        // Test tube rack
        ctx.fillRect(el.x - 15, floorY - 15, 30, 15);
        ctx.fillRect(el.x - 10, floorY - h, 6, h - 10);
        ctx.fillRect(el.x + 4, floorY - h + 10, 6, h - 20);
      } else if (el.type === 'machine') {
        // Lab machine box
        ctx.fillRect(el.x - 18, floorY - h, 36, h);
        ctx.fillStyle = 'rgba(0, 150, 200, 0.15)';
        ctx.fillRect(el.x - 13, floorY - h + 8, 26, 18);
      } else if (el.type === 'tank') {
        // Cylindrical tank
        ctx.fillRect(el.x - 15, floorY - h, 30, h);
        ctx.beginPath();
        ctx.ellipse(el.x, floorY - h, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Floor and ceiling
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
    ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
    
    // Hazard stripes - black and white
    const stripeOffset = (frameCountRef.current * speed) % 30;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 15, 0);
      ctx.lineTo(x + 5, 30);
      ctx.lineTo(x - 10, 30);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(x, CANVAS_HEIGHT);
      ctx.lineTo(x + 15, CANVAS_HEIGHT);
      ctx.lineTo(x + 5, CANVAS_HEIGHT - 30);
      ctx.lineTo(x - 10, CANVAS_HEIGHT - 30);
      ctx.closePath();
      ctx.fill();
    }
    
    // Draw ground blocks (after 10 seconds)
    ctx.fillStyle = '#FF4444';
    groundBlocksRef.current.forEach(block => {
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, block.height);
      // Warning stripes on blocks
      ctx.fillStyle = '#CC0000';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, 5);
      ctx.fillStyle = '#FF4444';
    });
  }, []);
  
  // Draw player (donut with jetpack)
  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const x = PLAYER_X;
    const y = player.y;
    
    // Tilt based on velocity
    const tilt = Math.max(-0.3, Math.min(0.3, player.velocity * 0.03));
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    
    // Jetpack
    ctx.fillStyle = '#444';
    ctx.fillRect(-PLAYER_SIZE / 2 - 12, -8, 12, 24);
    ctx.fillStyle = '#666';
    ctx.fillRect(-PLAYER_SIZE / 2 - 10, -6, 8, 20);
    
    // Jetpack flames when thrusting
    if (player.isThrusting) {
      const flameSize = 10 + Math.sin(frameCountRef.current * 0.5) * 5;
      const gradient = ctx.createLinearGradient(
        -PLAYER_SIZE / 2 - 12, 16,
        -PLAYER_SIZE / 2 - 12, 16 + flameSize
      );
      gradient.addColorStop(0, '#FFD700');
      gradient.addColorStop(0.5, '#FF6B00');
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-PLAYER_SIZE / 2 - 6, 16);
      ctx.lineTo(-PLAYER_SIZE / 2 - 12, 16 + flameSize);
      ctx.lineTo(-PLAYER_SIZE / 2 - 18, 16);
      ctx.closePath();
      ctx.fill();
    }
    
    // Donut shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, PLAYER_SIZE / 2, PLAYER_SIZE / 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Donut body
    ctx.shadowColor = '#FF69B4';
    ctx.shadowBlur = player.isThrusting ? 20 : 10;
    
    const donutGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, PLAYER_SIZE / 2);
    donutGradient.addColorStop(0, '#FFB6C1');
    donutGradient.addColorStop(0.6, '#FF69B4');
    donutGradient.addColorStop(1, '#FF1493');
    
    ctx.fillStyle = donutGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Donut hole
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }, []);
  
  // Draw obstacles
  const drawObstacles = useCallback((ctx: CanvasRenderingContext2D) => {
    obstaclesRef.current.forEach(obstacle => {
      ctx.save();
      
      if (obstacle.type === 'zapper_h' || obstacle.type === 'zapper_v' || obstacle.type === 'zapper_diag') {
        ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
        if (obstacle.angle) ctx.rotate((obstacle.angle * Math.PI) / 180);
        
        // Glow effect
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 15;
        
        // End caps
        ctx.fillStyle = '#333';
        const isHorizontal = obstacle.width > obstacle.height;
        if (isHorizontal) {
          ctx.beginPath();
          ctx.arc(-obstacle.width / 2, 0, 12, 0, Math.PI * 2);
          ctx.arc(obstacle.width / 2, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, -obstacle.height / 2, 12, 0, Math.PI * 2);
          ctx.arc(0, obstacle.height / 2, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Electric beam
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (isHorizontal || obstacle.type === 'zapper_diag') {
          ctx.moveTo(-obstacle.width / 2, 0);
          // Jagged line
          const segments = 8;
          for (let i = 1; i <= segments; i++) {
            const px = -obstacle.width / 2 + (obstacle.width * i) / segments;
            const py = (Math.sin(frameCountRef.current * 0.3 + i) * 5);
            ctx.lineTo(px, py);
          }
        } else {
          ctx.moveTo(0, -obstacle.height / 2);
          const segments = 8;
          for (let i = 1; i <= segments; i++) {
            const py = -obstacle.height / 2 + (obstacle.height * i) / segments;
            const px = (Math.sin(frameCountRef.current * 0.3 + i) * 5);
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        
        // Inner glow
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      ctx.restore();
    });
  }, []);
  
  // Draw coins (sprinkles only)
  const drawCoins = useCallback((ctx: CanvasRenderingContext2D) => {
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      ctx.save();
      ctx.translate(coin.x, coin.y);
      
      // Float animation
      const float = Math.sin(frameCountRef.current * 0.1 + coin.x * 0.05) * 3;
      ctx.translate(0, float);
      
      // Colorful sprinkle
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
      const color = colors[Math.floor(coin.x / 50) % colors.length];
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.save();
      ctx.rotate(frameCountRef.current * 0.05);
      ctx.fillRect(-8, -3, 16, 6);
      ctx.restore();
      
      ctx.restore();
    });
  }, []);
  
  // Draw particles
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;
      
      if (particle.life <= 0) {
        particlesRef.current.splice(index, 1);
        return;
      }
      
      const alpha = particle.life / 30;
      ctx.fillStyle = particle.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', '');
      
      // Convert hex to rgba
      if (particle.color.startsWith('#')) {
        const r = parseInt(particle.color.slice(1, 3), 16);
        const g = parseInt(particle.color.slice(3, 5), 16);
        const b = parseInt(particle.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);
  
  // Check collisions
  const checkCollisions = useCallback((): boolean => {
    const player = playerRef.current;
    const playerLeft = PLAYER_X - PLAYER_SIZE / 2 + 5;
    const playerRight = PLAYER_X + PLAYER_SIZE / 2 - 5;
    const playerTop = player.y - PLAYER_SIZE / 2 + 5;
    const playerBottom = player.y + PLAYER_SIZE / 2 - 5;
    
    // Floor/ceiling collision
    if (playerTop < 30 || playerBottom > CANVAS_HEIGHT - 30) {
      return true;
    }
    
    // Obstacle collision
    for (const obstacle of obstaclesRef.current) {
      let obsLeft = obstacle.x;
      let obsRight = obstacle.x + obstacle.width;
      let obsTop = obstacle.y;
      let obsBottom = obstacle.y + obstacle.height;
      
      // Simple AABB collision
      if (playerRight > obsLeft && playerLeft < obsRight &&
          playerBottom > obsTop && playerTop < obsBottom) {
        return true;
      }
    }
    
    return false;
  }, []);
  
  // Check coin collection (1 point per sprinkle)
  const checkCoins = useCallback(() => {
    const player = playerRef.current;
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      const dx = PLAYER_X - coin.x;
      const dy = player.y - coin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < PLAYER_SIZE / 2 + 10) {
        coin.collected = true;
        coinsCollectedRef.current += 1;
        setCoins(coinsCollectedRef.current);
        playCollectSound();
      }
    });
  }, [playCollectSound]);
  
  // Check ground block collisions
  const checkGroundBlocks = useCallback((): boolean => {
    const player = playerRef.current;
    const playerLeft = PLAYER_X - PLAYER_SIZE / 2 + 5;
    const playerRight = PLAYER_X + PLAYER_SIZE / 2 - 5;
    const playerBottom = player.y + PLAYER_SIZE / 2 - 5;
    
    for (const block of groundBlocksRef.current) {
      const blockTop = CANVAS_HEIGHT - 30 - block.height;
      const blockLeft = block.x;
      const blockRight = block.x + block.width;
      
      if (playerRight > blockLeft && playerLeft < blockRight && playerBottom > blockTop) {
        return true;
      }
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
    
    // Update speed
    speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta, MAX_SPEED);
    const speed = speedRef.current;
    
    // Update distance (internal only, not shown)
    distanceRef.current += speed * delta;
    
    // Score is just sprinkles collected
    const newScore = coinsCollectedRef.current;
    setScore(newScore);
    
    // Update player physics
    const player = playerRef.current;
    if (player.isThrusting) {
      player.velocity += THRUST * delta;
    } else {
      player.velocity += GRAVITY * delta;
    }
    player.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, player.velocity));
    player.y += player.velocity * delta;
    
    // Clamp player position
    player.y = Math.max(30 + PLAYER_SIZE / 2, Math.min(CANVAS_HEIGHT - 30 - PLAYER_SIZE / 2, player.y));
    
    // Update obstacles
    obstaclesRef.current.forEach(obstacle => {
      obstacle.x -= speed * delta;
    });
    obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.width > -50);
    
    // Spawn obstacles
    const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
    if (!lastObs || lastObs.x < CANVAS_WIDTH - 200 - Math.random() * 150) {
      spawnObstacle();
    }
    
    // Update coins
    coinsRef.current.forEach(coin => {
      coin.x -= speed * delta;
    });
    coinsRef.current = coinsRef.current.filter(c => c.x > -50);
    
    // Spawn coins
    if (coinsRef.current.length < 10 && Math.random() < 0.02) {
      spawnCoins();
    }
    
    // Ground blocks - spawn after collecting 1000 sprinkles to prevent floor camping
    if (coinsCollectedRef.current >= 1000) {
      // Update existing ground blocks
      groundBlocksRef.current.forEach(block => {
        block.x -= speed * delta;
      });
      groundBlocksRef.current = groundBlocksRef.current.filter(b => b.x + b.width > -20);
      
      // Spawn new ground blocks
      const lastBlock = groundBlocksRef.current[groundBlocksRef.current.length - 1];
      if (!lastBlock || lastBlock.x < CANVAS_WIDTH - 150 - Math.random() * 100) {
        if (Math.random() < 0.3) { // 30% chance each opportunity
          spawnGroundBlock();
        }
      }
    }
    
    // Add thrust particles
    if (player.isThrusting && frameCountRef.current % 2 === 0) {
      addThrustParticles();
    }
    
    // Draw everything
    drawBackground(ctx, speed);
    drawParticles(ctx);
    drawCoins(ctx);
    drawObstacles(ctx);
    drawPlayer(ctx);
    
    // Check collisions
    checkCoins();
    if (checkCollisions() || checkGroundBlocks()) {
      playCrashSound();
      stopThrustSound();
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, newScore));
      return;
    }
    
    // UI - Score display (sprinkles only)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${newScore}`, 15, 58);
    
    // TEST MODE label
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('TEST MODE', CANVAS_WIDTH - 10, 55);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawBackground, drawPlayer, drawObstacles, drawCoins, drawParticles, checkCollisions, checkCoins, checkGroundBlocks, spawnObstacle, spawnCoins, spawnGroundBlock, addThrustParticles, playCrashSound, stopThrustSound]);
  
  // Input handlers
  const handleThrustStart = useCallback(() => {
    if (!gameActiveRef.current) return;
    playerRef.current.isThrusting = true;
    startThrustSound();
  }, [startThrustSound]);
  
  const handleThrustEnd = useCallback(() => {
    playerRef.current.isThrusting = false;
    stopThrustSound();
  }, [stopThrustSound]);
  
  // Start game
  const startGame = useCallback(() => {
    initAudioContext();
    initBackground();
    
    playerRef.current = {
      y: CANVAS_HEIGHT / 2,
      velocity: 0,
      isThrusting: false,
    };
    
    obstaclesRef.current = [];
    coinsRef.current = [];
    particlesRef.current = [];
    groundBlocksRef.current = [];
    speedRef.current = BASE_SPEED;
    distanceRef.current = 0;
    coinsCollectedRef.current = 0;
    frameCountRef.current = 0;
    gameTimeRef.current = 0;
    
    setScore(0);
    setCoins(0);
    setDistance(0);
    setGameState("playing");
    
    lastFrameTimeRef.current = performance.now();
    gameActiveRef.current = true;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, initAudioContext, initBackground]);
  
  // Handle share
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🍩🚀 I collected ${score} sprinkles in Donut Dash on the Sprinkles App by @swishh.eth!`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score]);
  
  // Draw menu
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    let animationId: number;
    
    const draw = () => {
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      const time = Date.now() * 0.001;
      
      // Lab background - solid dark
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Simple gradient overlay
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, 'rgba(40, 40, 40, 0.5)');
      gradient.addColorStop(0.5, 'rgba(30, 30, 30, 0)');
      gradient.addColorStop(1, 'rgba(40, 40, 40, 0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Simple static lab silhouettes (minimal shapes)
      ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
      // Beaker
      ctx.fillRect(45, CANVAS_HEIGHT - 100, 30, 70);
      // Flask base
      ctx.beginPath();
      ctx.arc(130, CANVAS_HEIGHT - 60, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(122, CANVAS_HEIGHT - 110, 16, 40);
      // Machine
      ctx.fillRect(280, CANVAS_HEIGHT - 110, 45, 80);
      // Tank
      ctx.fillRect(200, CANVAS_HEIGHT - 90, 40, 60);
      
      // Floor/ceiling
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, CANVAS_WIDTH, 30);
      ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      
      // Animated stripes - black and white
      const stripeOffset = (time * 60) % 30;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let x = -stripeOffset; x < CANVAS_WIDTH + 30; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 15, 0);
        ctx.lineTo(x + 5, 30);
        ctx.lineTo(x - 10, 30);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_HEIGHT);
        ctx.lineTo(x + 15, CANVAS_HEIGHT);
        ctx.lineTo(x + 5, CANVAS_HEIGHT - 30);
        ctx.lineTo(x - 10, CANVAS_HEIGHT - 30);
        ctx.closePath();
        ctx.fill();
      }
      
      // Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 15;
      ctx.fillText('DONUT', CANVAS_WIDTH / 2, 90);
      ctx.fillText('DASH', CANVAS_WIDTH / 2, 130);
      ctx.shadowBlur = 0;
      
      // Animated donut with jetpack
      const bounceY = Math.sin(time * 3) * 10;
      const tiltAngle = Math.sin(time * 2) * 0.12;
      
      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, 210 + bounceY);
      ctx.rotate(tiltAngle);
      
      // Jetpack
      ctx.fillStyle = '#444';
      ctx.fillRect(-26, -6, 10, 20);
      ctx.fillStyle = '#555';
      ctx.fillRect(-24, -4, 6, 16);
      
      // Flame
      const flameSize = 12 + Math.sin(time * 12) * 4;
      ctx.fillStyle = '#FF6B00';
      ctx.beginPath();
      ctx.moveTo(-20, 14);
      ctx.lineTo(-26, 14 + flameSize);
      ctx.lineTo(-32, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(-22, 14);
      ctx.lineTo(-26, 14 + flameSize * 0.6);
      ctx.lineTo(-30, 14);
      ctx.closePath();
      ctx.fill();
      
      // Donut
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#FF69B4';
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Donut hole
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(-7, -7, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 300);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 32px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 335);
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('points scored', CANVAS_WIDTH / 2, 358);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '12px monospace';
        ctx.fillText('Hold to fly • Release to fall', CANVAS_WIDTH / 2, 300);
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, score]);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleThrustStart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        handleThrustEnd();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleThrustStart, handleThrustEnd]);
  
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
          <h1 className="text-xl font-bold tracking-wide text-white">DONUT DASH</h1>
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
              onPointerDown={gameState === "playing" ? handleThrustStart : undefined}
              onPointerUp={handleThrustEnd}
              onPointerLeave={handleThrustEnd}
              onPointerCancel={handleThrustEnd}
            />
            
            {/* Menu/Gameover overlay */}
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-zinc-800 border border-zinc-600 text-white text-sm font-bold rounded-full hover:bg-zinc-700">
                      <Share2 className="w-3 h-3" /><span>Share</span>
                    </button>
                  )}
                  <button onClick={startGame} className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 active:scale-95">
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
                  <p className="text-xs text-zinc-400">Simple one-touch controls:</p>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• <span className="text-white">Hold screen</span> - Fire jetpack, fly up</li>
                    <li>• <span className="text-white">Release</span> - Fall down with gravity</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2">⚡ Obstacles</h3>
                  <p className="text-xs text-zinc-400">Avoid the electric zappers! They come in different orientations - horizontal, vertical, and diagonal.</p>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2">🍩 Collectibles</h3>
                  <ul className="text-xs text-zinc-400 mt-1 space-y-1 pl-4">
                    <li>• <span className="text-white">Sprinkles</span> - 10 points each</li>
                    <li>• <span className="text-yellow-400">Golden Donuts</span> - 100 points!</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-400" />Test Mode</h3>
                  <p className="text-xs text-zinc-400">This is a test version. No DONUT required to play. Scores are not saved to leaderboard.</p>
                </div>
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => setShowHelp(false)} className="w-full py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white font-bold rounded-full">
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