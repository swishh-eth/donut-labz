"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Play, Coins, Zap, Share2, Palette, Check, X, ExternalLink } from "lucide-react";
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

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
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
const EDGE_FADE = 40; // Pixels for edge fade

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
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prizePool, setPrizePool] = useState<string>("0");
  
  const [ownedSkins, setOwnedSkins] = useState<GameSkin[]>([GAME_SKINS[0]]);
  const [selectedSkin, setSelectedSkin] = useState<GameSkin>(GAME_SKINS[0]);
  const [previewSkin, setPreviewSkin] = useState<GameSkin | null>(null);
  
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; gap: number; passed: boolean }[]>([]);
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  const countdownRef = useRef(3);
  
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
  
  useEffect(() => {
    if (isTxSuccess && gameState === "menu") {
      setPaidCost(entryCost);
      refetchAllowance();
      refetchBalance();
      startGame();
      resetWrite();
    }
  }, [isTxSuccess, gameState]);
  
  // Draw edge fade overlay
  const drawEdgeFade = useCallback((ctx: CanvasRenderingContext2D) => {
    // Top fade
    const topGrad = ctx.createLinearGradient(0, 0, 0, EDGE_FADE);
    topGrad.addColorStop(0, "rgba(0, 0, 0, 1)");
    topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, EDGE_FADE);
    
    // Bottom fade
    const botGrad = ctx.createLinearGradient(0, CANVAS_HEIGHT - EDGE_FADE, 0, CANVAS_HEIGHT);
    botGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    botGrad.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, CANVAS_HEIGHT - EDGE_FADE, CANVAS_WIDTH, EDGE_FADE);
    
    // Left fade
    const leftGrad = ctx.createLinearGradient(0, 0, EDGE_FADE, 0);
    leftGrad.addColorStop(0, "rgba(0, 0, 0, 0.8)");
    leftGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, EDGE_FADE, CANVAS_HEIGHT);
    
    // Right fade
    const rightGrad = ctx.createLinearGradient(CANVAS_WIDTH - EDGE_FADE, 0, CANVAS_WIDTH, 0);
    rightGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    rightGrad.addColorStop(1, "rgba(0, 0, 0, 0.8)");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(CANVAS_WIDTH - EDGE_FADE, 0, EDGE_FADE, CANVAS_HEIGHT);
  }, []);
  
  const drawDonut = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number, skin: GameSkin = selectedSkin) => {
    const x = DONUT_X;
    const rotation = Math.min(Math.max(velocity * 0.04, -0.5), 0.5);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    ctx.beginPath();
    ctx.ellipse(3, 5, DONUT_SIZE / 2, DONUT_SIZE / 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#D4A574";
    ctx.fill();
    ctx.strokeStyle = "#B8956C";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, -2, DONUT_SIZE / 2 - 3, Math.PI * 1.15, Math.PI * -0.15);
    ctx.fillStyle = skin.frostingColor;
    ctx.fill();
    
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 1.15 + (i / 4) * (Math.PI * 0.7);
      const dripX = Math.cos(angle) * (DONUT_SIZE / 2 - 3);
      const dripY = Math.sin(angle) * (DONUT_SIZE / 2 - 3) - 2;
      ctx.beginPath();
      ctx.ellipse(dripX, dripY + (4 + Math.sin(i * 2) * 3) / 2, 3, 4 + Math.sin(i * 2) * 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = skin.frostingColor;
      ctx.fill();
    }
    
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 5, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#B8956C";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI + (i / 12) * Math.PI;
      const r = DONUT_SIZE / 3 + (i % 2) * 4;
      ctx.save();
      ctx.translate(Math.cos(angle) * r, Math.sin(angle) * r - 2);
      ctx.rotate(angle + Math.PI / 4);
      ctx.fillStyle = skin.sprinkleColors[i % skin.sprinkleColors.length];
      ctx.beginPath();
      ctx.roundRect(-3, -1, 6, 2, 1);
      ctx.fill();
      ctx.restore();
    }
    
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
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, -10, PIPE_WIDTH, topHeight + 10, [0, 0, 12, 12]);
    ctx.fill();
    
    ctx.strokeStyle = "rgba(139, 90, 43, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < topHeight; i += 15) { ctx.beginPath(); ctx.moveTo(x + 10, i); ctx.lineTo(x + PIPE_WIDTH - 10, i); ctx.stroke(); }
    
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, topHeight - 8, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
    
    const bottomY = topHeight + gap;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY + 10, [12, 12, 0, 0]);
    ctx.fill();
    
    for (let i = bottomY + 20; i < CANVAS_HEIGHT; i += 15) { ctx.beginPath(); ctx.moveTo(x + 10, i); ctx.lineTo(x + PIPE_WIDTH - 10, i); ctx.stroke(); }
    
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, bottomY - 4, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
  }, []);
  
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
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
    
    donutRef.current.velocity += GRAVITY;
    donutRef.current.velocity = Math.min(donutRef.current.velocity, 10);
    donutRef.current.y += donutRef.current.velocity;
    
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= difficulty.pipeSpeed;
      if (!pipe.passed && pipe.x + PIPE_WIDTH < DONUT_X) { pipe.passed = true; scoreRef.current++; setScore(scoreRef.current); }
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
    
    // Draw edge fades
    drawEdgeFade(ctx);
    
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
        fetch('/api/games/flappy/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerAddress: address, username: context?.user?.username || `${address.slice(0, 6)}...${address.slice(-4)}`, pfpUrl: context?.user?.pfpUrl, score: scoreRef.current, costPaid: paidCost }),
        }).then(() => {
          fetch(`/api/games/flappy/attempts?address=${address}`).then(r => r.json()).then(data => { setAttempts(data.attempts); setEntryCost(data.nextCost); });
          fetch('/api/games/flappy/leaderboard').then(r => r.json()).then(data => setLeaderboard(data.leaderboard || []));
        }).catch(console.error);
      }
    };
    
    if (donutY - hitboxRadius < 0 || donutY + hitboxRadius > CANVAS_HEIGHT) { endGameInline(); return; }
    for (const pipe of pipesRef.current) {
      if (DONUT_X + hitboxRadius > pipe.x && DONUT_X - hitboxRadius < pipe.x + PIPE_WIDTH) {
        if (donutY - hitboxRadius < pipe.topHeight || donutY + hitboxRadius > pipe.topHeight + pipe.gap) { endGameInline(); return; }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawDonut, drawPipe, drawEdgeFade, address, context, paidCost]);
  
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) donutRef.current.velocity = FLAP_STRENGTH;
  }, [gameState]);
  
  const startGame = useCallback(() => {
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    countdownRef.current = 3;
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
    const castText = `🍩 I just scored ${score} in Flappy Donut on @sprinkles!\n\nThink you can beat me? Play now and compete for the weekly prize pool! 🏆`;
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=https://sprinklesapp.xyz/games/game-1`); } 
    catch { try { await navigator.clipboard.writeText(castText + "\n\nhttps://sprinklesapp.xyz/games/game-1"); alert("Copied!"); } catch {} }
  }, [score]);
  
  // Draw menu/countdown/gameover - donut position is fixed
  useEffect(() => {
    if (gameState === "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    // Fixed donut Y position for menu/countdown/gameover
    const menuDonutY = CANVAS_HEIGHT / 2 - 40;
    
    const draw = () => {
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
      
      // Draw edge fades
      drawEdgeFade(ctx);
      
      // Title
      ctx.shadowColor = "#FF69B4";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 60);
      ctx.shadowBlur = 0;
      
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
        
        ctx.fillStyle = "#FF69B4";
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
  }, [gameState, score, highScore, drawDonut, drawEdgeFade, previewSkin, selectedSkin]);
  
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
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold tracking-wide">FLAPPY DONUT</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLeaderboard(true)} className="p-2 text-amber-400 hover:text-amber-300"><Trophy className="w-5 h-5" /></button>
            {context?.user && (
              <Avatar className="h-7 w-7 border border-zinc-800">
                <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(userDisplayName)}</AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
        
        {/* Prize Pool */}
        <div className="mx-1 mb-2 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Coins className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-amber-200/60">Weekly Pool</span></div>
            <span className="text-sm font-bold text-amber-400">{prizePool} 🍩</span>
          </div>
        </div>
        
        {/* Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <div className="relative">
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onClick={handleFlap} onTouchStart={(e) => { e.preventDefault(); handleFlap(); }} className="rounded-2xl cursor-pointer" style={{ touchAction: "none", maxHeight: "calc(100vh - 280px)" }} />
            
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
          
          {/* Skins button - always visible below canvas */}
          {(gameState === "menu" || gameState === "gameover") && (
            <button onClick={() => setShowSkins(true)} className="mt-3 flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500">
              <Palette className="w-3 h-3 text-pink-400" /><span className="text-xs">Skins</span>
            </button>
          )}
        </div>
        
        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /><span className="font-bold">Weekly Leaderboard</span></div>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? <p className="text-zinc-500 text-center py-8">No scores yet!</p> : leaderboard.map((entry, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-amber-500/10" : ""}`}>
                    <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                    {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🍩</div>}
                    <span className="flex-1 truncate">{entry.username}</span>
                    <span className="font-bold">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Skins Modal */}
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-pink-400" /><span className="font-bold">My Skins</span></div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-4 grid grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                {ownedSkins.map((skin) => (
                  <button
                    key={skin.id}
                    onClick={() => handleSelectSkin(skin)}
                    onMouseEnter={() => setPreviewSkin(skin)}
                    onMouseLeave={() => setPreviewSkin(null)}
                    className={`relative p-3 rounded-xl border-2 transition-all ${selectedSkin.id === skin.id ? "border-pink-500 bg-pink-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
                  >
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: "#D4A574" }}>
                      <div className="absolute inset-1 rounded-full" style={{ background: `linear-gradient(180deg, ${skin.frostingColor} 0%, ${skin.frostingColor} 50%, transparent 50%)` }} />
                      <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-zinc-900" /></div>
                    </div>
                    <p className="text-[10px] font-bold truncate text-center">{skin.name}</p>
                    {selectedSkin.id === skin.id && <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /></div>}
                  </button>
                ))}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <button onClick={() => { setShowSkins(false); window.location.href = "/games"; }} className="w-full flex items-center justify-center gap-2 py-2 text-purple-400 hover:text-purple-300">
                  <ExternalLink className="w-4 h-4" /><span className="text-sm">Get More Skins</span>
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