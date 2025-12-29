"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Play, Coins, Zap, Share2, Palette, Check, Lock, X } from "lucide-react";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const FLAPPY_POOL_ADDRESS = "0xA3419c6eFbb7a227fC3e24189d8099591327a14A" as const;

// ABIs
const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const FLAPPY_POOL_ABI = [
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "payEntry",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrizePool",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentWeek",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 540;
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
const SKIN_COST = 100;

// Donut skins
const DONUT_SKINS = [
  { id: "classic", name: "Classic Pink", frostingColor: "#FF69B4", sprinkleColors: ["#FFD700", "#00FF00", "#00BFFF", "#FF4500", "#FFFFFF", "#FF00FF"], owned: true },
  { id: "chocolate", name: "Chocolate", frostingColor: "#8B4513", sprinkleColors: ["#FFFFFF", "#FFD700", "#FF69B4", "#00BFFF", "#FF4500", "#00FF00"], owned: false },
  { id: "blueberry", name: "Blueberry", frostingColor: "#4169E1", sprinkleColors: ["#FFFFFF", "#FFD700", "#FF69B4", "#00FF00", "#FF4500", "#00BFFF"], owned: false },
  { id: "mint", name: "Mint Chip", frostingColor: "#98FB98", sprinkleColors: ["#8B4513", "#FFFFFF", "#FFD700", "#FF69B4", "#00BFFF", "#FF4500"], owned: false },
  { id: "sunset", name: "Sunset", frostingColor: "#FF6347", sprinkleColors: ["#FFD700", "#FF4500", "#FFFFFF", "#FF69B4", "#FFA500", "#FFFF00"], owned: false },
  { id: "galaxy", name: "Galaxy", frostingColor: "#9400D3", sprinkleColors: ["#FFFFFF", "#FFD700", "#00BFFF", "#FF69B4", "#4169E1", "#00FF00"], owned: false },
  { id: "gold", name: "Golden Glaze", frostingColor: "#FFD700", sprinkleColors: ["#FFFFFF", "#8B4513", "#FF4500", "#FF69B4", "#FFA500", "#FFFF00"], owned: false },
  { id: "rainbow", name: "Rainbow", frostingColor: "#FF1493", sprinkleColors: ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#9400D3"], owned: false },
];

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type LeaderboardEntry = {
  rank: number;
  username: string;
  pfpUrl?: string;
  score: number;
};

type DonutSkin = {
  id: string;
  name: string;
  frostingColor: string;
  sprinkleColors: string[];
  owned: boolean;
};

// Difficulty scaling
const getDifficulty = (score: number) => {
  const progress = Math.min(score / 50, 1);
  return {
    pipeGap: PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * progress,
    pipeSpeed: PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * progress,
  };
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function FlappyDonutPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  // Farcaster context
  const [context, setContext] = useState<MiniAppContext | null>(null);
  
  // Game state
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
  
  // Skins
  const [skins, setSkins] = useState<DonutSkin[]>(DONUT_SKINS);
  const [selectedSkin, setSelectedSkin] = useState<DonutSkin>(DONUT_SKINS[0]);
  const [previewSkin, setPreviewSkin] = useState<DonutSkin | null>(null);
  const [buyingSkin, setBuyingSkin] = useState<string | null>(null);
  
  // Game objects refs
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; gap: number; passed: boolean }[]>([]);
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  
  // Contract interactions
  const { writeContract, data: txHash, isPending: isWritePending, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, FLAPPY_POOL_ADDRESS] : undefined,
  });
  
  // Read balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });
  
  // Read prize pool
  const { data: prizePoolData } = useReadContract({
    address: FLAPPY_POOL_ADDRESS,
    abi: FLAPPY_POOL_ABI,
    functionName: "getPrizePool",
  });
  
  // Read current week
  const { data: currentWeek } = useReadContract({
    address: FLAPPY_POOL_ADDRESS,
    abi: FLAPPY_POOL_ABI,
    functionName: "currentWeek",
  });
  
  // Load Farcaster context
  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = await (sdk as any).context;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  
  // Load owned skins from localStorage
  useEffect(() => {
    if (address) {
      const savedSkins = localStorage.getItem(`flappy-skins-${address.toLowerCase()}`);
      if (savedSkins) {
        const ownedIds = JSON.parse(savedSkins);
        setSkins(prev => prev.map(s => ({ ...s, owned: s.id === "classic" || ownedIds.includes(s.id) })));
      }
      
      const savedSelected = localStorage.getItem(`flappy-selected-skin-${address.toLowerCase()}`);
      if (savedSelected) {
        const skin = DONUT_SKINS.find(s => s.id === savedSelected);
        if (skin) setSelectedSkin(skin);
      }
    }
  }, [address]);
  
  // Fetch attempts and leaderboard
  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        const attemptsRes = await fetch(`/api/games/flappy/attempts?address=${address}`);
        if (attemptsRes.ok) {
          const data = await attemptsRes.json();
          setAttempts(data.attempts);
          setEntryCost(data.nextCost);
        }
        
        const lbRes = await fetch('/api/games/flappy/leaderboard');
        if (lbRes.ok) {
          const data = await lbRes.json();
          setLeaderboard(data.leaderboard || []);
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      }
    };
    
    fetchData();
  }, [address]);
  
  // Update prize pool display
  useEffect(() => {
    if (prizePoolData) {
      setPrizePool(Number(formatUnits(prizePoolData, 18)).toFixed(2));
    }
  }, [prizePoolData]);
  
  // Handle transaction success for game entry
  useEffect(() => {
    if (isTxSuccess && gameState === "menu" && !buyingSkin) {
      setPaidCost(entryCost);
      refetchAllowance();
      refetchBalance();
      startGame();
      resetWrite();
    }
  }, [isTxSuccess, gameState, buyingSkin]);
  
  // Handle transaction success for skin purchase
  useEffect(() => {
    if (isTxSuccess && buyingSkin) {
      setSkins(prev => prev.map(s => s.id === buyingSkin ? { ...s, owned: true } : s));
      
      if (address) {
        const ownedIds = skins.filter(s => s.owned || s.id === buyingSkin).map(s => s.id);
        localStorage.setItem(`flappy-skins-${address.toLowerCase()}`, JSON.stringify(ownedIds));
      }
      
      refetchBalance();
      setBuyingSkin(null);
      resetWrite();
    }
  }, [isTxSuccess, buyingSkin, address, skins]);
  
  // Draw donut with current skin
  const drawDonut = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number, skin: DonutSkin = selectedSkin) => {
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
    
    // Outer donut body
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#D4A574";
    ctx.fill();
    ctx.strokeStyle = "#B8956C";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Frosting
    ctx.beginPath();
    ctx.arc(0, -2, DONUT_SIZE / 2 - 3, Math.PI * 1.15, Math.PI * -0.15);
    ctx.fillStyle = skin.frostingColor;
    ctx.fill();
    
    // Frosting drips
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 1.15 + (i / 4) * (Math.PI * 0.7);
      const dripX = Math.cos(angle) * (DONUT_SIZE / 2 - 3);
      const dripY = Math.sin(angle) * (DONUT_SIZE / 2 - 3) - 2;
      const dripLength = 4 + Math.sin(i * 2) * 3;
      
      ctx.beginPath();
      ctx.ellipse(dripX, dripY + dripLength / 2, 3, dripLength, 0, 0, Math.PI * 2);
      ctx.fillStyle = skin.frostingColor;
      ctx.fill();
    }
    
    // Inner hole
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 5, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#B8956C";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Sprinkles
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI + (i / 12) * Math.PI;
      const r = DONUT_SIZE / 3 + (i % 2) * 4;
      const sx = Math.cos(angle) * r;
      const sy = Math.sin(angle) * r - 2;
      const sprinkleAngle = angle + Math.PI / 4;
      
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sprinkleAngle);
      ctx.fillStyle = skin.sprinkleColors[i % skin.sprinkleColors.length];
      ctx.beginPath();
      ctx.roundRect(-3, -1, 6, 2, 1);
      ctx.fill();
      ctx.restore();
    }
    
    // Wings
    const wingFlap = Math.sin(frameCountRef.current * 0.3) * 5;
    const wingY = velocity < 0 ? -8 - wingFlap : -5;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-DONUT_SIZE / 2 - 10, wingY, 14, 9, -0.4 + (velocity < 0 ? -0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(DONUT_SIZE / 2 + 10, wingY, 14, 9, 0.4 + (velocity < 0 ? 0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    ctx.stroke();
    
    ctx.restore();
  }, [selectedSkin]);
  
  // Draw pipe
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
    for (let i = 0; i < topHeight; i += 15) {
      ctx.beginPath();
      ctx.moveTo(x + 10, i);
      ctx.lineTo(x + PIPE_WIDTH - 10, i);
      ctx.stroke();
    }
    
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, topHeight - 8, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
    
    const bottomY = topHeight + gap;
    const bottomHeight = CANVAS_HEIGHT - bottomY + 10;
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, bottomHeight, [12, 12, 0, 0]);
    ctx.fill();
    
    for (let i = bottomY + 20; i < CANVAS_HEIGHT; i += 15) {
      ctx.beginPath();
      ctx.moveTo(x + 10, i);
      ctx.lineTo(x + PIPE_WIDTH - 10, i);
      ctx.stroke();
    }
    
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, bottomY - 4, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
  }, []);
  
  // Game loop
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
    
    donutRef.current.velocity += GRAVITY;
    donutRef.current.velocity = Math.min(donutRef.current.velocity, 10);
    donutRef.current.y += donutRef.current.velocity;
    
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= difficulty.pipeSpeed;
      
      if (!pipe.passed && pipe.x + PIPE_WIDTH < DONUT_X) {
        pipe.passed = true;
        scoreRef.current++;
        setScore(scoreRef.current);
      }
      
      if (pipe.x + PIPE_WIDTH < -10) {
        pipesRef.current.splice(index, 1);
      }
    });
    
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < CANVAS_WIDTH - PIPE_SPAWN_DISTANCE) {
      const currentGap = difficulty.pipeGap;
      const minHeight = 60;
      const maxHeight = CANVAS_HEIGHT - currentGap - 60;
      const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
      pipesRef.current.push({ x: CANVAS_WIDTH + 20, topHeight, gap: currentGap, passed: false });
    }
    
    pipesRef.current.forEach(pipe => {
      drawPipe(ctx, pipe.x, pipe.topHeight, pipe.gap);
    });
    
    drawDonut(ctx, donutRef.current.y, donutRef.current.velocity);
    
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 60);
    ctx.shadowBlur = 0;
    
    const donutY = donutRef.current.y;
    const hitboxRadius = DONUT_SIZE / 2 - 6;
    
    const endGameInline = () => {
      gameActiveRef.current = false;
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
      
      if (address && scoreRef.current > 0) {
        fetch('/api/games/flappy/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerAddress: address,
            username: context?.user?.username || `${address.slice(0, 6)}...${address.slice(-4)}`,
            pfpUrl: context?.user?.pfpUrl,
            score: scoreRef.current,
            weekNumber: currentWeek ? Number(currentWeek) : 1,
            costPaid: paidCost,
          }),
        }).then(() => {
          fetch(`/api/games/flappy/attempts?address=${address}`).then(r => r.json()).then(data => {
            setAttempts(data.attempts);
            setEntryCost(data.nextCost);
          });
          fetch('/api/games/flappy/leaderboard').then(r => r.json()).then(data => {
            setLeaderboard(data.leaderboard || []);
          });
        }).catch(console.error);
      }
    };
    
    if (donutY - hitboxRadius < 0 || donutY + hitboxRadius > CANVAS_HEIGHT) {
      endGameInline();
      return;
    }
    
    for (const pipe of pipesRef.current) {
      if (DONUT_X + hitboxRadius > pipe.x && DONUT_X - hitboxRadius < pipe.x + PIPE_WIDTH) {
        if (donutY - hitboxRadius < pipe.topHeight || donutY + hitboxRadius > pipe.topHeight + pipe.gap) {
          endGameInline();
          return;
        }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawDonut, drawPipe, address, context, currentWeek, paidCost]);
  
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      donutRef.current.velocity = FLAP_STRENGTH;
    }
  }, [gameState]);
  
  const startGame = useCallback(() => {
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    setScore(0);
    setCountdown(3);
    setGameState("countdown");
    setError(null);
    
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
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
    if (!address) {
      setError("Connect wallet to play");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    const costWei = parseUnits(entryCost.toString(), 18);
    
    if (balance && balance < costWei) {
      setError(`Insufficient DONUT. Need ${entryCost} 🍩`);
      setIsLoading(false);
      return;
    }
    
    if (!allowance || allowance < costWei) {
      try {
        writeContract({
          address: DONUT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [FLAPPY_POOL_ADDRESS, parseUnits("100", 18)],
        });
      } catch (e) {
        setError("Approval failed");
        setIsLoading(false);
      }
      return;
    }
    
    try {
      writeContract({
        address: FLAPPY_POOL_ADDRESS,
        abi: FLAPPY_POOL_ABI,
        functionName: "payEntry",
        args: [costWei],
      });
    } catch (e) {
      setError("Payment failed");
      setIsLoading(false);
    }
  };
  
  const handleBuySkin = async (skin: DonutSkin) => {
    if (!address || skin.owned) return;
    
    const costWei = parseUnits(SKIN_COST.toString(), 18);
    
    if (balance && balance < costWei) {
      setError(`Need ${SKIN_COST} DONUT to buy skin`);
      return;
    }
    
    setBuyingSkin(skin.id);
    
    try {
      writeContract({
        address: FLAPPY_POOL_ADDRESS,
        abi: FLAPPY_POOL_ABI,
        functionName: "payEntry",
        args: [costWei],
      });
    } catch (e) {
      setError("Purchase failed");
      setBuyingSkin(null);
    }
  };
  
  const handleSelectSkin = (skin: DonutSkin) => {
    if (skin.owned) {
      setSelectedSkin(skin);
      if (address) {
        localStorage.setItem(`flappy-selected-skin-${address.toLowerCase()}`, skin.id);
      }
    }
  };
  
  const handleShare = useCallback(async () => {
    const castText = `🍩 I just scored ${score} in Flappy Donut on @sprinkles!\n\nThink you can beat me? Play now and compete for the weekly prize pool! 🏆`;
    
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=https://sprinklesapp.xyz/games/game-1`);
    } catch (e) {
      try {
        await navigator.clipboard.writeText(castText + "\n\nhttps://sprinklesapp.xyz/games/game-1");
        alert("Copied to clipboard!");
      } catch {
        console.error("Failed to share:", e);
      }
    }
  }, [score]);
  
  // Draw menu/countdown/gameover screen
  useEffect(() => {
    if (gameState === "playing") return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    const draw = () => {
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
      
      const floatOffset = Math.sin(Date.now() / 500) * 8;
      const skinToShow = previewSkin || selectedSkin;
      drawDonut(ctx, CANVAS_HEIGHT / 2 - 60 + floatOffset, 0, skinToShow);
      
      ctx.shadowColor = "#FF69B4";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";
      ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 70);
      ctx.shadowBlur = 0;
      
      if (gameState === "countdown") {
        const scale = 1 + Math.sin(Date.now() / 100) * 0.1;
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.scale(scale, scale);
        
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 40;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 140px monospace";
        ctx.textAlign = "center";
        ctx.fillText(countdown.toString(), 0, 40);
        ctx.shadowBlur = 0;
        ctx.restore();
        
        ctx.fillStyle = "#FF69B4";
        ctx.font = "bold 18px monospace";
        ctx.fillText("GET READY!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
      }
      
      if (gameState === "gameover") {
        ctx.fillStyle = "#FF6B6B";
        ctx.font = "bold 28px monospace";
        ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, 130);
        
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 56px monospace";
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 200);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = "#888888";
        ctx.font = "16px monospace";
        ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 235);
      }
    };
    
    draw();
    
    if (gameState === "menu" || gameState === "gameover") {
      const interval = setInterval(draw, 50);
      return () => clearInterval(interval);
    }
  }, [gameState, score, highScore, countdown, drawDonut, previewSkin, selectedSkin]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        handleFlap();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlap]);
  
  const isPaying = isWritePending || isTxLoading;
  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Player";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold tracking-wide">FLAPPY DONUT</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLeaderboard(true)} className="p-2 text-amber-400 hover:text-amber-300 transition-colors">
              <Trophy className="w-5 h-5" />
            </button>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
        </div>
        
        {/* Prize Pool */}
        <div className="mx-2 mb-3 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-200/60">Weekly Prize Pool</span>
            </div>
            <span className="text-lg font-bold text-amber-400">{prizePool} 🍩</span>
          </div>
        </div>
        
        {/* Game Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 pointer-events-none z-10 rounded-2xl" style={{ boxShadow: 'inset 0 0 60px 30px rgba(0,0,0,0.9)' }} />
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleFlap}
              onTouchStart={(e) => { e.preventDefault(); handleFlap(); }}
              className="rounded-2xl cursor-pointer"
              style={{ touchAction: "none" }}
            />
            
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none z-20">
                <div className="pointer-events-auto flex flex-col items-center gap-3">
                  {gameState === "gameover" && score > 0 && (
                    <button onClick={handleShare} className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-500 transition-all">
                      <Share2 className="w-4 h-4" />
                      <span>Share Score</span>
                    </button>
                  )}
                  
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm">Entry: <span className="font-bold text-white">{entryCost} 🍩</span></span>
                  </div>
                  
                  <button
                    onClick={handlePlay}
                    disabled={isPaying || isLoading}
                    className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isPaying ? (
                      <>
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        <span>{gameState === "gameover" ? "Play Again" : "Play"}</span>
                      </>
                    )}
                  </button>
                  
                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                  <p className="text-zinc-500 text-xs">Attempts today: {attempts}</p>
                </div>
              </div>
            )}
            
            {gameState === "playing" && (
              <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none z-20">
                <p className="text-zinc-500 text-xs">Tap to flap</p>
              </div>
            )}
          </div>
          
          {(gameState === "menu" || gameState === "gameover") && (
            <button onClick={() => setShowSkins(true)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500 transition-all">
              <Palette className="w-4 h-4 text-pink-400" />
              <span className="text-sm">Skins</span>
            </button>
          )}
        </div>
        
        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span className="font-bold">Weekly Leaderboard</span>
                </div>
                <button onClick={() => setShowLeaderboard(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No scores yet!</p>
                ) : (
                  leaderboard.map((entry, i) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-amber-500/10" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                      </span>
                      {entry.pfpUrl ? <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">🍩</div>}
                      <span className="flex-1 truncate">{entry.username}</span>
                      <span className="font-bold">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Skins Modal */}
        {showSkins && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-pink-400" />
                  <span className="font-bold">Donut Skins</span>
                </div>
                <button onClick={() => { setShowSkins(false); setPreviewSkin(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-4 grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                {skins.map((skin) => (
                  <button
                    key={skin.id}
                    onClick={() => skin.owned ? handleSelectSkin(skin) : handleBuySkin(skin)}
                    onMouseEnter={() => setPreviewSkin(skin)}
                    onMouseLeave={() => setPreviewSkin(null)}
                    disabled={buyingSkin === skin.id}
                    className={`relative p-3 rounded-xl border-2 transition-all ${selectedSkin.id === skin.id ? "border-pink-500 bg-pink-500/10" : skin.owned ? "border-zinc-700 hover:border-zinc-500" : "border-zinc-800 hover:border-zinc-600"}`}
                  >
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full relative" style={{ backgroundColor: "#D4A574" }}>
                      <div className="absolute inset-1 rounded-full" style={{ background: `linear-gradient(180deg, ${skin.frostingColor} 0%, ${skin.frostingColor} 50%, transparent 50%)` }} />
                      <div className="absolute inset-0 flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-zinc-900" /></div>
                    </div>
                    
                    <p className="text-xs font-bold truncate">{skin.name}</p>
                    
                    {skin.owned ? (
                      selectedSkin.id === skin.id ? (
                        <div className="flex items-center justify-center gap-1 mt-1"><Check className="w-3 h-3 text-green-400" /><span className="text-[10px] text-green-400">Equipped</span></div>
                      ) : (
                        <span className="text-[10px] text-zinc-500 mt-1 block">Owned</span>
                      )
                    ) : (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {buyingSkin === skin.id ? <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" /> : <><Lock className="w-3 h-3 text-amber-400" /><span className="text-[10px] text-amber-400">{SKIN_COST} 🍩</span></>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <p className="text-xs text-zinc-400 text-center">Hover to preview • Click to equip/buy</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}