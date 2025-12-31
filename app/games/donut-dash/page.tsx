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
const GRAVITY = 0.38;
const THRUST = -0.65;
const MAX_VELOCITY = 6;
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

interface AirWall {
  x: number;
  y: number;
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
  type?: 'thrust' | 'collect' | 'trail';
}

interface SpeedLine {
  x: number;
  y: number;
  length: number;
  speed: number;
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
  const airWallsRef = useRef<AirWall[]>([]);
  const speedLinesRef = useRef<SpeedLine[]>([]);
  const speedRef = useRef(BASE_SPEED);
  const distanceRef = useRef(0);
  const coinsCollectedRef = useRef(0);
  const comboRef = useRef(0);
  const lastCollectTimeRef = useRef(0);
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
  
  // Spawn coins in patterns (sprinkles only) - more frequent and varied
  const spawnCoins = useCallback(() => {
    const patterns = ['line', 'arc', 'wave', 'diagonal', 'zigzag', 'cluster'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const startX = CANVAS_WIDTH + 50;
    const centerY = 80 + Math.random() * (CANVAS_HEIGHT - 200);
    
    if (pattern === 'line') {
      const count = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        coinsRef.current.push({
          x: startX + i * 28,
          y: centerY,
          collected: false,
        });
      }
    } else if (pattern === 'arc') {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 7) * Math.PI;
        coinsRef.current.push({
          x: startX + i * 24,
          y: centerY + Math.sin(angle) * 50,
          collected: false,
        });
      }
    } else if (pattern === 'wave') {
      for (let i = 0; i < 8; i++) {
        coinsRef.current.push({
          x: startX + i * 24,
          y: centerY + Math.sin(i * 0.9) * 35,
          collected: false,
        });
      }
    } else if (pattern === 'diagonal') {
      const goingUp = Math.random() > 0.5;
      for (let i = 0; i < 6; i++) {
        coinsRef.current.push({
          x: startX + i * 30,
          y: centerY + (goingUp ? -i * 20 : i * 20),
          collected: false,
        });
      }
    } else if (pattern === 'zigzag') {
      for (let i = 0; i < 8; i++) {
        coinsRef.current.push({
          x: startX + i * 25,
          y: centerY + (i % 2 === 0 ? -30 : 30),
          collected: false,
        });
      }
    } else {
      // Cluster - big group
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 20 + (i % 3) * 15;
        coinsRef.current.push({
          x: startX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          collected: false,
        });
      }
    }
  }, []);
  
  // Add collection burst particles
  const addCollectParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * 3 + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * 3 + (Math.random() - 0.5) * 2,
        life: 20 + Math.random() * 10,
        color,
        size: 4 + Math.random() * 3,
        type: 'collect',
      });
    }
  }, []);
  
  // Spawn ground blocks (after 100 points)
  const spawnGroundBlock = useCallback(() => {
    groundBlocksRef.current.push({
      x: CANVAS_WIDTH + 20,
      width: 30 + Math.random() * 40,
      height: 25 + Math.random() * 35,
    });
  }, []);
  
  // Spawn air walls (after 300 points)
  const spawnAirWall = useCallback(() => {
    airWallsRef.current.push({
      x: CANVAS_WIDTH + 20,
      y: 60 + Math.random() * (CANVAS_HEIGHT - 180), // Random height in playable area
      width: 25 + Math.random() * 35,
      height: 40 + Math.random() * 60,
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
  
  // Draw background - laboratory style with speed lines
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, speed: number) => {
    // Solid dark background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Dynamic gradient based on speed
    const intensity = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, `rgba(40, 20, 60, ${0.3 + intensity * 0.2})`);
    gradient.addColorStop(0.5, 'rgba(15, 15, 20, 0)');
    gradient.addColorStop(1, `rgba(40, 20, 60, ${0.3 + intensity * 0.2})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Speed lines - more intense as speed increases
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
    
    // Lab equipment silhouettes (all grounded on floor)
    const floorY = CANVAS_HEIGHT - 30;
    bgElementsRef.current.forEach(el => {
      el.x -= speed * el.speed;
      if (el.x < -60) {
        el.x = CANVAS_WIDTH + 60;
        el.height = 50 + Math.random() * 60;
      }
      
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
        // Glowing liquid
        ctx.fillStyle = `rgba(100, 255, 150, ${0.1 + Math.sin(frameCountRef.current * 0.05) * 0.05})`;
        ctx.fillRect(el.x - 8, floorY - h * 0.5, 16, h * 0.3);
      } else if (el.type === 'flask') {
        ctx.beginPath();
        ctx.arc(el.x, floorY - h * 0.4, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(el.x - 5, floorY - h, 10, h * 0.5);
        // Glowing liquid
        ctx.fillStyle = `rgba(255, 100, 200, ${0.1 + Math.sin(frameCountRef.current * 0.07 + el.x) * 0.05})`;
        ctx.beginPath();
        ctx.arc(el.x, floorY - h * 0.4, h * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (el.type === 'tube') {
        ctx.fillRect(el.x - 15, floorY - 15, 30, 15);
        ctx.fillRect(el.x - 10, floorY - h, 6, h - 10);
        ctx.fillRect(el.x + 4, floorY - h + 10, 6, h - 20);
      } else if (el.type === 'machine') {
        ctx.fillRect(el.x - 18, floorY - h, 36, h);
        // Screen glow
        ctx.fillStyle = `rgba(0, 200, 255, ${0.15 + Math.sin(frameCountRef.current * 0.1) * 0.05})`;
        ctx.fillRect(el.x - 13, floorY - h + 8, 26, 18);
        // Blinking light
        if (Math.sin(frameCountRef.current * 0.15 + el.x * 0.1) > 0.5) {
          ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
          ctx.beginPath();
          ctx.arc(el.x + 10, floorY - h + 32, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === 'tank') {
        ctx.fillStyle = 'rgba(35, 35, 40, 0.9)';
        ctx.fillRect(el.x - 15, floorY - h, 30, h);
        ctx.beginPath();
        ctx.ellipse(el.x, floorY - h, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Bubbles
        ctx.fillStyle = `rgba(100, 255, 200, 0.2)`;
        const bubbleOffset = (frameCountRef.current * 2) % 40;
        ctx.beginPath();
        ctx.arc(el.x - 5, floorY - bubbleOffset - 10, 3, 0, Math.PI * 2);
        ctx.arc(el.x + 5, floorY - bubbleOffset - 25, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Floor and ceiling with subtle glow
    ctx.fillStyle = '#0a0a0a';
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
    
    // Draw ground blocks (zinc colored with glow)
    groundBlocksRef.current.forEach(block => {
      // Subtle glow
      ctx.shadowColor = 'rgba(255, 100, 100, 0.3)';
      ctx.shadowBlur = 10;
      // Main block
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, block.height);
      ctx.shadowBlur = 0;
      // Top highlight
      ctx.fillStyle = '#71717a';
      ctx.fillRect(block.x, CANVAS_HEIGHT - 30 - block.height, block.width, 4);
      // Side shadow
      ctx.fillStyle = '#27272a';
      ctx.fillRect(block.x + block.width - 4, CANVAS_HEIGHT - 30 - block.height, 4, block.height);
    });
  }, []);
  
  // Draw player (donut with jetpack) with motion trail
  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const x = PLAYER_X;
    const y = player.y;
    
    // Tilt based on velocity
    const tilt = Math.max(-0.4, Math.min(0.4, player.velocity * 0.04));
    
    // Motion trail when thrusting
    if (player.isThrusting) {
      for (let i = 3; i > 0; i--) {
        const trailAlpha = 0.1 * (4 - i);
        const trailX = x - i * 8;
        ctx.fillStyle = `rgba(255, 105, 180, ${trailAlpha})`;
        ctx.beginPath();
        ctx.arc(trailX, y, PLAYER_SIZE / 2 - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    
    // Jetpack with metallic look
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-PLAYER_SIZE / 2 - 14, -10, 14, 28);
    ctx.fillStyle = '#555';
    ctx.fillRect(-PLAYER_SIZE / 2 - 12, -8, 10, 24);
    // Jetpack highlight
    ctx.fillStyle = '#777';
    ctx.fillRect(-PLAYER_SIZE / 2 - 12, -8, 3, 24);
    
    // Jetpack flames when thrusting
    if (player.isThrusting) {
      const flameSize = 15 + Math.sin(frameCountRef.current * 0.6) * 8;
      
      // Outer flame
      const gradient = ctx.createLinearGradient(
        -PLAYER_SIZE / 2 - 12, 18,
        -PLAYER_SIZE / 2 - 12, 18 + flameSize
      );
      gradient.addColorStop(0, '#FFD700');
      gradient.addColorStop(0.4, '#FF6B00');
      gradient.addColorStop(0.8, '#FF0000');
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-PLAYER_SIZE / 2 - 4, 18);
      ctx.lineTo(-PLAYER_SIZE / 2 - 12, 18 + flameSize);
      ctx.lineTo(-PLAYER_SIZE / 2 - 20, 18);
      ctx.closePath();
      ctx.fill();
      
      // Inner bright core
      const innerSize = flameSize * 0.6;
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-PLAYER_SIZE / 2 - 8, 18);
      ctx.lineTo(-PLAYER_SIZE / 2 - 12, 18 + innerSize);
      ctx.lineTo(-PLAYER_SIZE / 2 - 16, 18);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // Donut body with enhanced glow
    ctx.shadowColor = '#FF69B4';
    ctx.shadowBlur = player.isThrusting ? 25 : 15;
    
    const donutGradient = ctx.createRadialGradient(-3, -3, 0, 0, 0, PLAYER_SIZE / 2);
    donutGradient.addColorStop(0, '#FFD1DC');
    donutGradient.addColorStop(0.4, '#FF69B4');
    donutGradient.addColorStop(0.8, '#FF1493');
    donutGradient.addColorStop(1, '#C71585');
    
    ctx.fillStyle = donutGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Donut hole with depth
    const holeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, PLAYER_SIZE / 5);
    holeGradient.addColorStop(0, '#0a0a0a');
    holeGradient.addColorStop(1, '#1f1f1f');
    ctx.fillStyle = holeGradient;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE / 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(-6, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(4, -8, 3, 0, Math.PI * 2);
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
  
  // Draw coins (sprinkles only) with better visuals
  const drawCoins = useCallback((ctx: CanvasRenderingContext2D) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4', '#00CED1'];
    
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      
      ctx.save();
      ctx.translate(coin.x, coin.y);
      
      // Float and pulse animation
      const float = Math.sin(frameCountRef.current * 0.12 + coin.x * 0.05) * 4;
      const pulse = 1 + Math.sin(frameCountRef.current * 0.15 + coin.x * 0.03) * 0.15;
      ctx.translate(0, float);
      ctx.scale(pulse, pulse);
      
      // Colorful sprinkle with glow
      const color = colors[Math.floor(coin.x / 40) % colors.length];
      
      // Outer glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      
      ctx.save();
      ctx.rotate(frameCountRef.current * 0.06 + coin.x * 0.01);
      
      // Rounded sprinkle shape
      ctx.beginPath();
      ctx.roundRect(-9, -4, 18, 8, 4);
      ctx.fill();
      
      // Inner highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.roundRect(-6, -2, 8, 3, 2);
      ctx.fill();
      
      ctx.restore();
      ctx.shadowBlur = 0;
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
  
  // Check coin collection (1 point per sprinkle) with particles
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
        setCoins(coinsCollectedRef.current);
        playCollectSound();
        
        // Add collection particles
        const color = colors[Math.floor(coin.x / 50) % colors.length];
        addCollectParticles(coin.x, coin.y, color);
      }
    });
  }, [playCollectSound, addCollectParticles]);
  
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
  
  // Check air wall collisions
  const checkAirWalls = useCallback((): boolean => {
    const player = playerRef.current;
    const playerLeft = PLAYER_X - PLAYER_SIZE / 2 + 5;
    const playerRight = PLAYER_X + PLAYER_SIZE / 2 - 5;
    const playerTop = player.y - PLAYER_SIZE / 2 + 5;
    const playerBottom = player.y + PLAYER_SIZE / 2 - 5;
    
    for (const wall of airWallsRef.current) {
      if (playerRight > wall.x && playerLeft < wall.x + wall.width &&
          playerBottom > wall.y && playerTop < wall.y + wall.height) {
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
    
    // Update base speed
    speedRef.current = Math.min(speedRef.current + SPEED_INCREMENT * delta, MAX_SPEED);
    
    // Score-based speed boost: 300-400 points = 0-100% speed increase
    const scoreBoost = coinsCollectedRef.current >= 300 
      ? Math.min((coinsCollectedRef.current - 300) / 100, 1) 
      : 0;
    const speed = speedRef.current * (1 + scoreBoost);
    
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
    
    // Spawn coins - more frequent spawning
    if (coinsRef.current.length < 25 && Math.random() < 0.04) {
      spawnCoins();
    }
    
    // Ground blocks - spawn after 100 points to prevent floor camping
    if (coinsCollectedRef.current >= 100) {
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
    
    // Show speed boost indicator after 300 points
    if (scoreBoost > 0) {
      ctx.fillStyle = `rgba(255, ${255 - scoreBoost * 155}, 100, 0.9)`;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`SPEED +${Math.round(scoreBoost * 100)}%`, 15, 78);
    }
    
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
    airWallsRef.current = [];
    speedLinesRef.current = [];
    speedRef.current = BASE_SPEED;
    distanceRef.current = 0;
    coinsCollectedRef.current = 0;
    comboRef.current = 0;
    lastCollectTimeRef.current = 0;
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
      
      // Simple gradient overlay with purple tint like in-game
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, 'rgba(40, 20, 60, 0.4)');
      gradient.addColorStop(0.5, 'rgba(20, 20, 30, 0)');
      gradient.addColorStop(1, 'rgba(40, 20, 60, 0.4)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Speed lines like in-game
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const y = (time * 100 + i * 40) % CANVAS_HEIGHT;
        const lineLength = 40 + Math.sin(time + i) * 20;
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH, y);
        ctx.lineTo(CANVAS_WIDTH - lineLength, y);
        ctx.stroke();
      }
      
      // Simple static lab silhouettes (minimal shapes)
      ctx.fillStyle = 'rgba(35, 35, 40, 0.9)';
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
      ctx.fillStyle = '#0a0a0a';
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
      
      // Floating sprinkles in background
      const sprinkleColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF69B4'];
      for (let i = 0; i < 8; i++) {
        const sx = ((time * 50 + i * 60) % (CANVAS_WIDTH + 40)) - 20;
        const sy = 80 + Math.sin(time * 2 + i * 1.5) * 30 + (i % 3) * 100;
        const color = sprinkleColors[i % sprinkleColors.length];
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(time * 0.5 + i);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(-6, -3, 12, 6, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
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
      
      // Animated donut with jetpack - matching in-game style
      const bounceY = Math.sin(time * 3) * 10;
      const tiltAngle = Math.sin(time * 2) * 0.15;
      const donutX = CANVAS_WIDTH / 2;
      const donutY = 210 + bounceY;
      
      // Motion trail (always show on menu to look dynamic)
      for (let i = 3; i > 0; i--) {
        const trailAlpha = 0.12 * (4 - i);
        const trailX = donutX - i * 10;
        ctx.fillStyle = `rgba(255, 105, 180, ${trailAlpha})`;
        ctx.beginPath();
        ctx.arc(trailX, donutY, 28 - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.save();
      ctx.translate(donutX, donutY);
      ctx.rotate(tiltAngle);
      
      // Jetpack - matching in-game size and style
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(-42, -12, 16, 32);
      ctx.fillStyle = '#555';
      ctx.fillRect(-40, -10, 12, 28);
      ctx.fillStyle = '#777';
      ctx.fillRect(-40, -10, 4, 28);
      
      // Flame - bigger and more impressive
      const flameSize = 20 + Math.sin(time * 15) * 8;
      
      // Outer flame
      const flameGradient = ctx.createLinearGradient(-34, 20, -34, 20 + flameSize);
      flameGradient.addColorStop(0, '#FFD700');
      flameGradient.addColorStop(0.4, '#FF6B00');
      flameGradient.addColorStop(0.8, '#FF0000');
      flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(-26, 20);
      ctx.lineTo(-34, 20 + flameSize);
      ctx.lineTo(-42, 20);
      ctx.closePath();
      ctx.fill();
      
      // Inner bright core
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.moveTo(-30, 20);
      ctx.lineTo(-34, 20 + flameSize * 0.5);
      ctx.lineTo(-38, 20);
      ctx.closePath();
      ctx.fill();
      
      // Donut with gradient matching in-game
      ctx.shadowColor = '#FF69B4';
      ctx.shadowBlur = 25;
      
      const donutGradient = ctx.createRadialGradient(-4, -4, 0, 0, 0, 30);
      donutGradient.addColorStop(0, '#FFD1DC');
      donutGradient.addColorStop(0.4, '#FF69B4');
      donutGradient.addColorStop(0.8, '#FF1493');
      donutGradient.addColorStop(1, '#C71585');
      ctx.fillStyle = donutGradient;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Donut hole with depth
      const holeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      holeGradient.addColorStop(0, '#0a0a0a');
      holeGradient.addColorStop(1, '#1f1f1f');
      ctx.fillStyle = holeGradient;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(-8, -8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(5, -10, 4, 0, Math.PI * 2);
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
  
  // Prevent all touch selection behaviors on mobile
  useEffect(() => {
    const preventDefault = (e: Event) => {
      if (gameState === "playing") {
        e.preventDefault();
      }
    };
    
    const preventSelection = (e: Event) => {
      e.preventDefault();
      return false;
    };
    
    // Prevent context menu (long press menu)
    document.addEventListener('contextmenu', preventDefault, { passive: false });
    
    // Prevent selection
    document.addEventListener('selectstart', preventSelection, { passive: false });
    
    // Prevent touch move to stop scrolling during game
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchmove', preventDefault, { passive: false });
      canvas.addEventListener('touchstart', preventDefault, { passive: false });
      canvas.addEventListener('touchend', preventDefault, { passive: false });
    }
    
    return () => {
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('selectstart', preventSelection);
      if (canvas) {
        canvas.removeEventListener('touchmove', preventDefault);
        canvas.removeEventListener('touchstart', preventDefault);
        canvas.removeEventListener('touchend', preventDefault);
      }
    };
  }, [gameState]);
  
  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;
  
  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { 
          -webkit-tap-highlight-color: transparent !important;
          -webkit-touch-callout: none !important;
        }
        body, html {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          touch-action: manipulation;
        }
        .game-canvas-container, .game-canvas-container * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          touch-action: none !important;
        }
        canvas {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          touch-action: none !important;
          outline: none !important;
        }
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
        <div className="flex flex-col items-center game-canvas-container">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas
              ref={canvasRef}
              width={SCALED_WIDTH}
              height={SCALED_HEIGHT}
              className="rounded-2xl border border-zinc-800 w-full h-full select-none"
              style={{ 
                touchAction: "none", 
                WebkitUserSelect: 'none', 
                userSelect: 'none',
                WebkitTouchCallout: 'none',
                msTouchAction: 'none',
                pointerEvents: 'auto',
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (gameState === "playing") handleThrustStart();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleThrustEnd();
              }}
              onPointerLeave={handleThrustEnd}
              onPointerCancel={handleThrustEnd}
              onContextMenu={(e) => e.preventDefault()}
            />
            
            {/* Invisible touch capture overlay during gameplay */}
            {gameState === "playing" && (
              <div 
                className="absolute inset-0 z-10"
                style={{ 
                  touchAction: "none",
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleThrustStart();
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleThrustEnd();
                }}
                onPointerLeave={handleThrustEnd}
                onPointerCancel={handleThrustEnd}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleThrustStart();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleThrustEnd();
                }}
                onTouchMove={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
            
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