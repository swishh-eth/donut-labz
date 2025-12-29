"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { ArrowLeft, Trophy, Play, Coins, Zap, Share2 } from "lucide-react";

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

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 540;
const GRAVITY = 0.4;
const FLAP_STRENGTH = -7;
const PIPE_WIDTH = 60;
const PIPE_GAP = 160;
const PIPE_SPEED = 2.5;
const DONUT_SIZE = 36;

export default function FlappyDonutPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  // Farcaster context
  const [context, setContext] = useState<MiniAppContext | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [entryCost, setEntryCost] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [prizePool, setPrizePool] = useState<string>("0");
  
  // Game objects refs
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; passed: boolean }[]>([]);
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  
  // Contract interactions
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, FLAPPY_POOL_ADDRESS] : undefined,
  });
  
  // Read balance
  const { data: balance } = useReadContract({
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
  
  // Fetch attempts and leaderboard
  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        // Fetch attempts
        const attemptsRes = await fetch(`/api/games/flappy/attempts?address=${address}`);
        if (attemptsRes.ok) {
          const data = await attemptsRes.json();
          setAttempts(data.attempts);
          setEntryCost(data.attempts + 1);
        }
        
        // Fetch leaderboard
        const lbRes = await fetch('/api/games/flappy/leaderboard');
        if (lbRes.ok) {
          const data = await lbRes.json();
          setLeaderboard(data.leaderboard);
          setPlayerRank(data.playerRank);
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
  
  // Handle transaction success
  useEffect(() => {
    if (isTxSuccess && gameState === "menu") {
      refetchAllowance();
      startGame();
    }
  }, [isTxSuccess]);
  
  // Draw donut
  const drawDonut = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number) => {
    const x = 80;
    const rotation = velocity * 0.05;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Outer donut
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#D4A574";
    ctx.fill();
    ctx.strokeStyle = "#8B6914";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Frosting (top half)
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 2 - 2, Math.PI, 0);
    ctx.fillStyle = "#FF69B4";
    ctx.fill();
    
    // Inner hole
    ctx.beginPath();
    ctx.arc(0, 0, DONUT_SIZE / 5, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    
    // Sprinkles
    const sprinkleColors = ["#FFD700", "#00FF00", "#00BFFF", "#FF4500", "#FFFFFF"];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI + Math.PI;
      const r = DONUT_SIZE / 3;
      const sx = Math.cos(angle) * r;
      const sy = Math.sin(angle) * r * 0.5 - 2;
      ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
      ctx.fillRect(sx - 2, sy - 1, 4, 2);
    }
    
    // Wings
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    // Left wing
    ctx.beginPath();
    ctx.ellipse(-DONUT_SIZE / 2 - 8, -5, 12, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.stroke();
    // Right wing  
    ctx.beginPath();
    ctx.ellipse(DONUT_SIZE / 2 + 8, -5, 12, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }, []);
  
  // Draw rolling pin pipe
  const drawPipe = useCallback((ctx: CanvasRenderingContext2D, x: number, topHeight: number) => {
    // Top pipe (rolling pin pointing down)
    const topY = topHeight;
    
    // Rolling pin handle (top)
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x + 10, 0, PIPE_WIDTH - 20, 20);
    
    // Rolling pin body (top)
    const gradient = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, "#D2B48C");
    gradient.addColorStop(0.5, "#F5DEB3");
    gradient.addColorStop(1, "#D2B48C");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, 20, PIPE_WIDTH, topY - 20, [0, 0, 10, 10]);
    ctx.fill();
    ctx.strokeStyle = "#8B7355";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Bottom pipe
    const bottomY = topHeight + PIPE_GAP;
    const bottomHeight = CANVAS_HEIGHT - bottomY;
    
    // Rolling pin body (bottom)
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, bottomHeight - 20, [10, 10, 0, 0]);
    ctx.fill();
    ctx.stroke();
    
    // Rolling pin handle (bottom)
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x + 10, CANVAS_HEIGHT - 20, PIPE_WIDTH - 20, 20);
  }, []);
  
  // Game loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw grid pattern
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 30) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }
    
    // Update donut physics
    donutRef.current.velocity += GRAVITY;
    donutRef.current.y += donutRef.current.velocity;
    
    // Update pipes
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= PIPE_SPEED;
      
      // Check if passed
      if (!pipe.passed && pipe.x + PIPE_WIDTH < 80) {
        pipe.passed = true;
        scoreRef.current++;
        setScore(scoreRef.current);
      }
      
      // Remove off-screen pipes
      if (pipe.x + PIPE_WIDTH < 0) {
        pipesRef.current.splice(index, 1);
      }
    });
    
    // Add new pipes
    if (pipesRef.current.length === 0 || pipesRef.current[pipesRef.current.length - 1].x < CANVAS_WIDTH - 200) {
      const minHeight = 60;
      const maxHeight = CANVAS_HEIGHT - PIPE_GAP - 60;
      const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
      pipesRef.current.push({ x: CANVAS_WIDTH, topHeight, passed: false });
    }
    
    // Draw pipes
    pipesRef.current.forEach(pipe => {
      drawPipe(ctx, pipe.x, pipe.topHeight);
    });
    
    // Draw donut
    drawDonut(ctx, donutRef.current.y, donutRef.current.velocity);
    
    // Draw score
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 50);
    
    // Collision detection
    const donutX = 80;
    const donutY = donutRef.current.y;
    const donutRadius = DONUT_SIZE / 2 - 4;
    
    // Floor/ceiling collision
    if (donutY - donutRadius < 0 || donutY + donutRadius > CANVAS_HEIGHT) {
      endGame();
      return;
    }
    
    // Pipe collision
    for (const pipe of pipesRef.current) {
      if (
        donutX + donutRadius > pipe.x &&
        donutX - donutRadius < pipe.x + PIPE_WIDTH
      ) {
        if (donutY - donutRadius < pipe.topHeight || donutY + donutRadius > pipe.topHeight + PIPE_GAP) {
          endGame();
          return;
        }
      }
    }
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [drawDonut, drawPipe]);
  
  // Handle flap
  const handleFlap = useCallback(() => {
    if (gameState === "playing" && gameActiveRef.current) {
      donutRef.current.velocity = FLAP_STRENGTH;
    }
  }, [gameState]);
  
  // Start game
  const startGame = useCallback(() => {
    // Reset game state
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    setError(null);
    gameActiveRef.current = true;
    setGameState("playing");
    
    // Start game loop
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);
  
  // End game
  const endGame = useCallback(async () => {
    gameActiveRef.current = false;
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    
    const finalScore = scoreRef.current;
    if (finalScore > highScore) {
      setHighScore(finalScore);
    }
    
    setGameState("gameover");
    
    // Submit score to backend
    if (address && finalScore > 0) {
      try {
        await fetch('/api/games/flappy/submit-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerAddress: address,
            username: context?.user?.username || `${address.slice(0, 6)}...${address.slice(-4)}`,
            pfpUrl: context?.user?.pfpUrl,
            score: finalScore,
            weekNumber: currentWeek ? Number(currentWeek) : 1,
          }),
        });
        
        // Refresh leaderboard
        const lbRes = await fetch('/api/games/flappy/leaderboard');
        if (lbRes.ok) {
          const data = await lbRes.json();
          setLeaderboard(data.leaderboard);
        }
      } catch (e) {
        console.error("Failed to submit score:", e);
      }
    }
    
    // Update attempts
    setAttempts(prev => prev + 1);
    setEntryCost(prev => prev + 1);
  }, [address, context, currentWeek, highScore]);
  
  // Handle play button
  const handlePlay = async () => {
    if (!address) {
      setError("Connect wallet to play");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    const costWei = parseUnits(entryCost.toString(), 18);
    
    // Check balance
    if (balance && balance < costWei) {
      setError(`Insufficient DONUT. Need ${entryCost} 🍩`);
      setIsLoading(false);
      return;
    }
    
    // Check allowance - only approve 100 more if needed
    if (!allowance || allowance < costWei) {
      // Approve 100 DONUT at a time
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
    
    // Pay entry and start
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
  
  // Draw menu/gameover screen
  useEffect(() => {
    if (gameState === "playing") return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Grid pattern
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 30) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }
    
    // Draw static donut
    drawDonut(ctx, CANVAS_HEIGHT / 2 - 50, 0);
    
    // Title
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 80);
    
    if (gameState === "gameover") {
      ctx.fillStyle = "#FF6B6B";
      ctx.font = "bold 24px monospace";
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, 130);
      
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 36px monospace";
      ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 180);
      
      ctx.fillStyle = "#888888";
      ctx.font = "14px monospace";
      ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 210);
      
      ctx.fillStyle = "#A855F7";
      ctx.font = "12px monospace";
      ctx.fillText("Share your score to challenge friends!", CANVAS_WIDTH / 2, 250);
    }
    
  }, [gameState, score, highScore, drawDonut]);
  
  // Keyboard controls
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
  
  // Share score to Farcaster
  const handleShare = useCallback(async () => {
    const username = context?.user?.username || "someone";
    const castText = `🍩 I just scored ${score} in Flappy Donut on @sprinkles!\n\nThink you can beat me? Play now and compete for the weekly prize pool! 🏆`;
    
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=https://sprinklesapp.xyz/games/game-1`);
    } catch (e) {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(castText + "\n\nhttps://sprinklesapp.xyz/games/game-1");
        alert("Copied to clipboard!");
      } catch {
        console.error("Failed to share:", e);
      }
    }
  }, [score, context]);

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => window.location.href = "/games"}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
          
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-sm">Leaderboard</span>
          </button>
        </div>
        
        {/* Prize Pool Banner */}
        <div className="mx-4 mb-3 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-200/60">Weekly Prize Pool</span>
            </div>
            <span className="text-lg font-bold text-amber-400">{prizePool} 🍩</span>
          </div>
        </div>
        
        {/* Game Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleFlap}
              onTouchStart={(e) => { e.preventDefault(); handleFlap(); }}
              className="rounded-2xl border-2 border-zinc-800 cursor-pointer"
              style={{ touchAction: "none" }}
            />
            
            {/* Overlay UI */}
            {gameState !== "playing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center gap-3">
                  {/* Share Button (Game Over only) */}
                  {gameState === "gameover" && score > 0 && (
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-500 transition-all"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share Score</span>
                    </button>
                  )}
                  
                  {/* Entry Cost */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm">Entry: <span className="font-bold text-white">{entryCost} 🍩</span></span>
                  </div>
                  
                  {/* Play Button */}
                  <button
                    onClick={handlePlay}
                    disabled={isPaying || isLoading}
                    className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                  
                  {/* Error */}
                  {error && (
                    <p className="text-red-400 text-sm text-center">{error}</p>
                  )}
                  
                  {/* Attempt counter */}
                  <p className="text-zinc-500 text-xs">
                    Today's attempts: {attempts} (resets 6pm EST)
                  </p>
                </div>
              </div>
            )}
            
            {/* Playing instructions */}
            {gameState === "playing" && (
              <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                <p className="text-zinc-500 text-xs">Tap or press Space to flap</p>
              </div>
            )}
          </div>
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
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No scores yet. Be the first!</p>
                ) : (
                  leaderboard.map((entry, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${
                        entry.rank <= 3 ? "bg-amber-500/10" : ""
                      }`}
                    >
                      <span className={`w-6 text-center font-bold ${
                        entry.rank === 1 ? "text-amber-400" :
                        entry.rank === 2 ? "text-zinc-300" :
                        entry.rank === 3 ? "text-orange-400" :
                        "text-zinc-500"
                      }`}>
                        {entry.rank}
                      </span>
                      {entry.pfpUrl ? (
                        <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-700" />
                      )}
                      <span className="flex-1 truncate">{entry.username}</span>
                      <span className="font-bold">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>
              
              {playerRank && playerRank > 10 && (
                <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                  <p className="text-sm text-zinc-400 text-center">
                    Your rank: <span className="text-white font-bold">#{playerRank}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}