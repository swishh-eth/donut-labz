"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Play, Coins, Zap, Share2, Palette, Check, X, ExternalLink, HelpCircle, Volume2, VolumeX, ChevronRight, Clock } from "lucide-react";
import { GAME_SKINS, getOwnedSkins, getSelectedSkin, saveSelectedSkin, getSkinById, type GameSkin } from "@/lib/game-skins";

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

// Game constants - Base dimensions (will be scaled 2x for retina)
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2; // 2x resolution for crisp graphics
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;
const GRAVITY = 0.32;
const FLAP_STRENGTH = -5.5;
const PIPE_WIDTH = 60;
const PIPE_GAP_START = 190;
const PIPE_GAP_MIN = 130;
const PIPE_SPEED_START = 2.0;
const PIPE_SPEED_MAX = 4.0;
const PIPE_SPAWN_DISTANCE = 240;
const DONUT_SIZE = 36;
const DONUT_X = 80;

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };
type LeaderboardEntry = { rank: number; username: string; pfpUrl?: string; score: number };

const getDifficulty = (score: number) => {
  const progress = Math.min(score / 50, 1);
  return { pipeGap: PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * progress, pipeSpeed: PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * progress };
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
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
            <circle cx="20" cy="20" r="16" fill="#F59E0B" />
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
  
  // Prize distribution percentages for top 10
  const PRIZE_DISTRIBUTION = [30, 20, 15, 10, 8, 6, 5, 3, 2, 1];
  
  // Audio context and sounds
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScoreRef = useRef(0);
  
  const [ownedSkins, setOwnedSkins] = useState<GameSkin[]>([GAME_SKINS[0]]);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(GAME_SKINS[0]);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; gap: number; passed: boolean }[]>([]);
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const countdownRef = useRef(3);
  const paidCostRef = useRef(1);
  const graceFramesRef = useRef(0); // Grace period frames at start
  
  // Initialize audio context on first interaction
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);
  
  // Play flap sound - short whoosh
  const playFlapSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
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
  }, [isMuted, getAudioContext]);
  
  // Play point sound - happy ding
  const playPointSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
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
  }, [isMuted, getAudioContext]);
  
  // Haptic feedback - light for flap
  const triggerFlapHaptic = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate(10);
    } catch {}
  }, []);
  
  // Haptic feedback - stronger for point
  const triggerPointHaptic = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
    } catch {}
  }, []);
  
  const { writeContract, data: txHash, isPending: isWritePending, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
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
  
  // Load owned skins
  useEffect(() => {
    if (address) {
      const ownedIds = getOwnedSkins(address);
      const owned = GAME_SKINS.filter(s => ownedIds.includes(s.id));
      setOwnedSkins(owned.length > 0 ? owned : [GAME_SKINS[0]]);
      const selectedId = getSelectedSkin(address);
      const selected = getSkinById(selectedId);
      if (ownedIds.includes(selected.id)) setSelectedSkin(selected);
    }
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
  
  // Update reset countdown every minute
  useEffect(() => {
    const updateCountdown = () => setResetCountdown(getTimeUntilReset());
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);
  
  useEffect(() => {
    if (isTxSuccess && gameState === "menu") {
      setPaidCost(entryCost);
      paidCostRef.current = entryCost;
      refetchAllowance();
      refetchBalance();
      startGame();
      resetWrite();
    }
  }, [isTxSuccess, gameState]);
  

  
  const drawDonut = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number, skin: GameSkin = selectedSkin) => {
    const x = DONUT_X;
    const rotation = Math.min(Math.max(velocity * 0.04, -0.5), 0.5);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Shadow
    ctx.beginPath();
    ctx.ellipse(3, 5, DONUT_SIZE / 2, DONUT_SIZE / 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    
    // Main donut body - full skin color
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = skin.frostingColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Donut hole
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 5, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Wings
    const wingFlap = Math.sin(frameCountRef.current * 0.3) * 5;
    const wingY = velocity < 0 ? -8 - wingFlap : -5;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-DONUT_SIZE / 2 - 10, wingY, 14, 9, -0.4 + (velocity < 0 ? -0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    ctx.stroke();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(DONUT_SIZE / 2 + 10, wingY, 14, 9, 0.4 + (velocity < 0 ? 0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }, [selectedSkin]);
  
  const drawPipe = useCallback((ctx: CanvasRenderingContext2D, x: number, topHeight: number, gap: number) => {
    const gradient = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, "#C4A77D");
    gradient.addColorStop(0.3, "#E8D5B7");
    gradient.addColorStop(0.5, "#F5E6D3");
    gradient.addColorStop(0.7, "#E8D5B7");
    gradient.addColorStop(1, "#C4A77D");
    
    // Top pipe
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, -10, PIPE_WIDTH, topHeight + 10, [0, 0, 12, 12]);
    ctx.fill();
    
    // Top pipe cap
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, topHeight - 8, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
    
    // Bottom pipe
    const bottomY = topHeight + gap;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY + 10, [12, 12, 0, 0]);
    ctx.fill();
    
    // Bottom pipe cap
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, bottomY - 4, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
  }, []);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    // Scale the context for high-DPI rendering
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
    
    // Grace period: reduced gravity for first 60 frames (about 1 second)
    const currentGravity = graceFramesRef.current < 60 ? GRAVITY * 0.3 : GRAVITY;
    graceFramesRef.current++;
    
    donutRef.current.velocity += currentGravity;
    donutRef.current.velocity = Math.min(donutRef.current.velocity, 10);
    donutRef.current.y += donutRef.current.velocity;
    
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= difficulty.pipeSpeed;
      if (!pipe.passed && pipe.x + PIPE_WIDTH < DONUT_X) { 
        pipe.passed = true; 
        scoreRef.current++; 
        setScore(scoreRef.current);
        // Play point sound and haptic
        playPointSound();
        triggerPointHaptic();
      }
      if (pipe.x + PIPE_WIDTH < -10) pipesRef.current.splice(index, 1);
    });
    
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < CANVAS_WIDTH - PIPE_SPAWN_DISTANCE) {
      const currentGap = difficulty.pipeGap;
      const topHeight = Math.random() * (CANVAS_HEIGHT - currentGap - 120) + 60;
      pipesRef.current.push({ x: CANVAS_WIDTH + 20, topHeight, gap: currentGap, passed: false });
    }
    
    pipesRef.current.forEach(pipe => drawPipe(ctx, pipe.x, pipe.topHeight, pipe.gap));
    drawDonut(ctx, donutRef.current.y, donutRef.current.velocity);
    
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    
    const donutY = donutRef.current.y;
    const hitboxRadius = DONUT_SIZE / 2 - 6;
    
    const endGameInline = () => {
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
      
      if (address && scoreRef.current >= 0) {
        // Submit score to leaderboard
        fetch('/api/games/flappy/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerAddress: address, username: context?.user?.username || `${address.slice(0, 6)}...${address.slice(-4)}`, pfpUrl: context?.user?.pfpUrl, score: scoreRef.current, costPaid: paidCostRef.current }),
        }).then(() => {
          fetch(`/api/games/flappy/attempts?address=${address}`).then(r => r.json()).then(data => { setAttempts(data.attempts); setEntryCost(data.nextCost); });
          fetch('/api/games/flappy/leaderboard').then(r => r.json()).then(data => setLeaderboard(data.leaderboard || []));
        }).catch(console.error);
        
        // Send game announcement to chat (only if score > 0)
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
    
    if (donutY - hitboxRadius < 0 || donutY + hitboxRadius > CANVAS_HEIGHT) { endGameInline(); return; }
    for (const pipe of pipesRef.current) {
      if (DONUT_X + hitboxRadius > pipe.x && DONUT_X - hitboxRadius < pipe.x + PIPE_WIDTH) {
        if (donutY - hitboxRadius < pipe.topHeight || donutY + hitboxRadius > pipe.topHeight + pipe.gap) { endGameInline(); return; }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawDonut, drawPipe, address, context, playPointSound, triggerPointHaptic, selectedSkin]);
  
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      donutRef.current.velocity = FLAP_STRENGTH;
      playFlapSound();
      triggerFlapHaptic();
    }
  }, [gameState, playFlapSound, triggerFlapHaptic]);
  
  const startGame = useCallback(() => {
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    countdownRef.current = 3;
    graceFramesRef.current = 0; // Reset grace period
    setScore(0);
    setCountdown(3);
    setGameState("countdown");
    setError(null);
    
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      countdownRef.current = count;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countdownInterval);
        gameActiveRef.current = true;
        setGameState("playing");
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop]);
  
  const handlePlay = async () => {
    if (!address) { setError("Connect wallet to play"); return; }
    setIsLoading(true);
    setError(null);
    const costWei = parseUnits(entryCost.toString(), 18);
    if (balance && balance < costWei) { setError(`Insufficient DONUT. Need ${entryCost} 🍩`); setIsLoading(false); return; }
    if (!allowance || allowance < costWei) { writeContract({ address: DONUT_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [FLAPPY_POOL_ADDRESS, parseUnits("100", 18)] }); return; }
    writeContract({ address: FLAPPY_POOL_ADDRESS, abi: FLAPPY_POOL_ABI, functionName: "payEntry", args: [costWei] });
  };
  
  const handleSelectSkin = (skin: GameSkin) => {
    setSelectedSkin(skin);
    if (address) saveSelectedSkin(address, skin.id);
  };
  
  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🍩 I just scored ${score} in Flappy Donut on the Sprinkles App by @swishh.eth!\n\nThink you can beat me? Play now and compete for the ${prizePool} 🍩 weekly prize pool! 🏆`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {} }
  }, [score, prizePool]);
  
  // Draw menu/countdown/gameover - donut position is fixed
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    // Fixed donut Y position for menu/countdown/gameover
    const menuDonutY = CANVAS_HEIGHT / 2 - 40;
    
    const draw = () => {
      // Scale the context for high-DPI rendering
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      
      const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGradient.addColorStop(0, "#1a1a1a");
      bgGradient.addColorStop(1, "#0d0d0d");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      for (let i = 0; i < CANVAS_WIDTH; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke(); }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke(); }
      
      // Draw donut at fixed position with gentle float
      const floatOffset = Math.sin(Date.now() / 500) * 6;
      drawDonut(ctx, menuDonutY + floatOffset, 0, previewSkin || selectedSkin);
      
      // Title - clean white text
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 60);
      
      if (gameState === "countdown") {
        // Countdown number - centered, pulsing
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
        ctx.shadowColor = "#FFD700";
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
  }, [gameState, score, highScore, drawDonut, previewSkin, selectedSkin]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); handleFlap(); } };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlap]);
  
  const isPaying = isWritePending || isTxLoading;
  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

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
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)" }}>
        
        {/* Header - matching Games page style */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h1 className="text-2xl font-bold tracking-wide">FLAPPY DONUT</h1>
          {context?.user && (
            <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
              <Avatar className="h-8 w-8 border border-zinc-800">
                <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(userDisplayName)}</AvatarFallback>
              </Avatar>
              <div className="leading-tight text-left">
                <div className="text-sm font-bold">{userDisplayName}</div>
                {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
              </div>
            </div>
          )}
        </div>
        
        {/* Prize Pool Tile - Clickable to open leaderboard */}
        <button
          onClick={() => setShowLeaderboard(true)}
          className="relative w-full px-4 py-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl overflow-hidden transition-all active:scale-[0.98] hover:border-amber-500/50 group"
        >
          <FallingDonuts />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-200/80 font-medium">Weekly Prize Pool</span>
              </div>
              <span className="text-3xl font-bold text-amber-400">{prizePool} 🍩</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-amber-400/60 group-hover:text-amber-400 transition-colors">
                <span className="text-xs">View Leaderboard</span>
                <ChevronRight className="w-4 h-4" />
              </div>
              <div className="text-xs text-amber-200/60 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Resets in <span className="font-bold text-amber-300">{resetCountdown}</span></span>
              </div>
            </div>
          </div>
        </button>
        
        {/* Game Area - with consistent spacing */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-3">
          <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas 
              ref={canvasRef} 
              width={SCALED_WIDTH} 
              height={SCALED_HEIGHT} 
              onClick={handleFlap} 
              onTouchStart={(e) => { e.preventDefault(); handleFlap(); }} 
              className="rounded-2xl cursor-pointer border border-zinc-800 w-full h-full" 
              style={{ touchAction: "none" }} 
            />
            
            {/* Menu/Gameover overlay buttons */}
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-5 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500"><Share2 className="w-3 h-3" /><span>Share</span></button>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/90 rounded-full border border-zinc-700"><Zap className="w-3 h-3 text-yellow-400" /><span className="text-xs">Entry: <span className="font-bold">{entryCost} 🍩</span></span></div>
                  <button onClick={handlePlay} disabled={isPaying || isLoading} className="flex items-center gap-2 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 active:scale-95 disabled:opacity-50">
                    {isPaying ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /><span className="text-sm">Processing...</span></> : <><Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span></>}
                  </button>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <p className="text-zinc-500 text-[10px]">Attempts today: {attempts}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none z-20"><p className="text-zinc-600 text-[10px]">Tap to flap</p></div>}
          </div>
        </div>
          
        {/* Skins, Help, and Mute buttons - always visible below canvas */}
        {(gameState === "menu" || gameState === "gameover") && (
          <div className="py-3 flex items-center justify-center gap-2">
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
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🍩</div>}
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
        
        {/* Skins Modal */}
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-zinc-400" /><span className="font-bold">My Skins</span></div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-4 grid grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                {ownedSkins.map((skin) => (
                  <button
                    key={skin.id}
                    onClick={() => handleSelectSkin(skin)}
                    onMouseEnter={() => setPreviewSkin(skin)}
                    onMouseLeave={() => setPreviewSkin(null)}
                    className={`relative p-3 rounded-xl border-2 transition-all ${selectedSkin.id === skin.id ? "border-white bg-zinc-800" : "border-zinc-700 hover:border-zinc-500"}`}
                  >
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: skin.frostingColor }}>
                      <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700" /></div>
                    </div>
                    <p className="text-[10px] font-bold truncate text-center">{skin.name}</p>
                    {selectedSkin.id === skin.id && <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /></div>}
                  </button>
                ))}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => { setShowSkins(false); window.location.href = "/games"; }} className="w-full flex items-center justify-center gap-2 py-2 text-zinc-400 hover:text-white">
                  <ExternalLink className="w-4 h-4" /><span className="text-sm">Get More Skins</span>
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
                  <p className="text-xs text-zinc-400">Tap or click to make your donut flap and fly. Navigate through the rolling pin obstacles without hitting them or the edges!</p>
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
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Coins className="w-4 h-4 text-amber-400" />Prize Pool</h3>
                  <p className="text-xs text-zinc-400">90% of all entry fees go to the weekly prize pool. 5% goes to LP rewards, 5% to treasury.</p>
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
                
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Palette className="w-4 h-4 text-zinc-400" />Skins</h3>
                  <p className="text-xs text-zinc-400">Customize your donut with skins! Buy them from the Skin Shop on the Games page. Skins work across all Donut Labs games.</p>
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