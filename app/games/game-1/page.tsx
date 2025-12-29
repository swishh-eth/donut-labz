"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Trophy, Play, Coins, Zap, Share2, RotateCcw } from "lucide-react";

// Game constants - TWEAK THESE FOR FEEL
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 540;
const GRAVITY = 0.32;           // How fast donut falls (lower = floatier)
const FLAP_STRENGTH = -5.5;     // How strong each flap is (more negative = stronger)
const PIPE_WIDTH = 60;          // Width of rolling pins
const PIPE_GAP_START = 190;     // Starting gap between pipes (bigger = easier)
const PIPE_GAP_MIN = 130;       // Minimum gap at high scores
const PIPE_SPEED_START = 2.0;   // Starting pipe speed (lower = easier)
const PIPE_SPEED_MAX = 4.0;     // Maximum pipe speed at high scores
const PIPE_SPAWN_DISTANCE = 240; // Distance between pipes (bigger = easier)
const DONUT_SIZE = 36;          // Size of the donut
const DONUT_X = 80;             // Donut's X position

// Difficulty scaling - returns values based on current score
const getDifficulty = (score: number) => {
  // Gradually increase difficulty every 5 points
  const progress = Math.min(score / 50, 1); // Max difficulty at score 50
  
  return {
    pipeGap: PIPE_GAP_START - (PIPE_GAP_START - PIPE_GAP_MIN) * progress,
    pipeSpeed: PIPE_SPEED_START + (PIPE_SPEED_MAX - PIPE_SPEED_START) * progress,
  };
};

// Mock leaderboard data for testing
const MOCK_LEADERBOARD = [
  { rank: 1, username: "donutking", pfpUrl: null, score: 42 },
  { rank: 2, username: "sprinklemaster", pfpUrl: null, score: 38 },
  { rank: 3, username: "glazedgamer", pfpUrl: null, score: 35 },
  { rank: 4, username: "flapjack", pfpUrl: null, score: 29 },
  { rank: 5, username: "sugarhigh", pfpUrl: null, score: 24 },
  { rank: 6, username: "doughboy", pfpUrl: null, score: 21 },
  { rank: 7, username: "crispycream", pfpUrl: null, score: 18 },
  { rank: 8, username: "bakersman", pfpUrl: null, score: 15 },
  { rank: 9, username: "sweetooth", pfpUrl: null, score: 12 },
  { rank: 10, username: "rollingpin", pfpUrl: null, score: 8 },
];

export default function FlappyDonutTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<"menu" | "countdown" | "playing" | "gameover">("menu");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState(MOCK_LEADERBOARD);
  
  // Game objects refs
  const donutRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; gap: number; passed: boolean }[]>([]);
  const scoreRef = useRef(0);
  const gameActiveRef = useRef(false);
  const frameCountRef = useRef(0);
  
  // Draw donut with wings
  const drawDonut = useCallback((ctx: CanvasRenderingContext2D, y: number, velocity: number) => {
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
    
    // Pink frosting (wavy top half)
    ctx.beginPath();
    ctx.arc(0, -2, DONUT_SIZE / 2 - 3, Math.PI * 1.15, Math.PI * -0.15);
    ctx.fillStyle = "#FF69B4";
    ctx.fill();
    
    // Frosting drips
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 1.15 + (i / 4) * (Math.PI * 0.7);
      const dripX = Math.cos(angle) * (DONUT_SIZE / 2 - 3);
      const dripY = Math.sin(angle) * (DONUT_SIZE / 2 - 3) - 2;
      const dripLength = 4 + Math.sin(i * 2) * 3;
      
      ctx.beginPath();
      ctx.ellipse(dripX, dripY + dripLength / 2, 3, dripLength, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#FF69B4";
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
    
    // Sprinkles on frosting
    const sprinkleColors = ["#FFD700", "#00FF00", "#00BFFF", "#FF4500", "#FFFFFF", "#FF00FF"];
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI + (i / 12) * Math.PI;
      const r = DONUT_SIZE / 3 + (i % 2) * 4;
      const sx = Math.cos(angle) * r;
      const sy = Math.sin(angle) * r - 2;
      const sprinkleAngle = angle + Math.PI / 4;
      
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sprinkleAngle);
      ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
      ctx.beginPath();
      ctx.roundRect(-3, -1, 6, 2, 1);
      ctx.fill();
      ctx.restore();
    }
    
    // Wings - flapping based on velocity
    const wingFlap = Math.sin(frameCountRef.current * 0.3) * 5;
    const wingY = velocity < 0 ? -8 - wingFlap : -5;
    
    // Left wing
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-DONUT_SIZE / 2 - 10, wingY, 14, 9, -0.4 + (velocity < 0 ? -0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Left wing detail
    ctx.beginPath();
    ctx.ellipse(-DONUT_SIZE / 2 - 8, wingY + 2, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(150, 150, 150, 0.3)";
    ctx.stroke();
    
    // Right wing
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(DONUT_SIZE / 2 + 10, wingY, 14, 9, 0.4 + (velocity < 0 ? 0.2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Right wing detail
    ctx.beginPath();
    ctx.ellipse(DONUT_SIZE / 2 + 8, wingY + 2, 8, 5, 0.3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(150, 150, 150, 0.3)";
    ctx.stroke();
    
    ctx.restore();
  }, []);
  
  // Draw rolling pin pipe
  const drawPipe = useCallback((ctx: CanvasRenderingContext2D, x: number, topHeight: number, gap: number) => {
    // Top pipe (rolling pin)
    const gradient = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, "#C4A77D");
    gradient.addColorStop(0.3, "#E8D5B7");
    gradient.addColorStop(0.5, "#F5E6D3");
    gradient.addColorStop(0.7, "#E8D5B7");
    gradient.addColorStop(1, "#C4A77D");
    
    // Top rolling pin body
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, -10, PIPE_WIDTH, topHeight + 10, [0, 0, 12, 12]);
    ctx.fill();
    
    // Top wood grain lines
    ctx.strokeStyle = "rgba(139, 90, 43, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < topHeight; i += 15) {
      ctx.beginPath();
      ctx.moveTo(x + 10, i);
      ctx.lineTo(x + PIPE_WIDTH - 10, i);
      ctx.stroke();
    }
    
    // Top handle end cap
    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.roundRect(x + 8, topHeight - 8, PIPE_WIDTH - 16, 12, 6);
    ctx.fill();
    
    // Bottom pipe
    const bottomY = topHeight + gap;
    const bottomHeight = CANVAS_HEIGHT - bottomY + 10;
    
    // Bottom rolling pin body
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, bottomY, PIPE_WIDTH, bottomHeight, [12, 12, 0, 0]);
    ctx.fill();
    
    // Bottom wood grain lines
    for (let i = bottomY + 20; i < CANVAS_HEIGHT; i += 15) {
      ctx.beginPath();
      ctx.moveTo(x + 10, i);
      ctx.lineTo(x + PIPE_WIDTH - 10, i);
      ctx.stroke();
    }
    
    // Bottom handle end cap
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
    
    // Get current difficulty based on score
    const difficulty = getDifficulty(scoreRef.current);
    
    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw subtle grid pattern
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
    
    // Update donut physics
    donutRef.current.velocity += GRAVITY;
    donutRef.current.velocity = Math.min(donutRef.current.velocity, 10); // Terminal velocity
    donutRef.current.y += donutRef.current.velocity;
    
    // Update pipes with dynamic speed
    pipesRef.current.forEach((pipe, index) => {
      pipe.x -= difficulty.pipeSpeed;
      
      // Check if passed
      if (!pipe.passed && pipe.x + PIPE_WIDTH < DONUT_X) {
        pipe.passed = true;
        scoreRef.current++;
        setScore(scoreRef.current);
      }
      
      // Remove off-screen pipes
      if (pipe.x + PIPE_WIDTH < -10) {
        pipesRef.current.splice(index, 1);
      }
    });
    
    // Add new pipes with dynamic gap
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < CANVAS_WIDTH - PIPE_SPAWN_DISTANCE) {
      const currentGap = difficulty.pipeGap;
      const minHeight = 60;
      const maxHeight = CANVAS_HEIGHT - currentGap - 60;
      const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
      pipesRef.current.push({ x: CANVAS_WIDTH + 20, topHeight, gap: currentGap, passed: false });
    }
    
    // Draw pipes
    pipesRef.current.forEach(pipe => {
      drawPipe(ctx, pipe.x, pipe.topHeight, pipe.gap);
    });
    
    // Draw donut
    drawDonut(ctx, donutRef.current.y, donutRef.current.velocity);
    
    // Draw score with glow
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, 60);
    ctx.shadowBlur = 0;
    
    // Draw difficulty indicator
    const diffPercent = Math.round((scoreRef.current / 50) * 100);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "10px monospace";
    ctx.fillText(`Difficulty: ${Math.min(diffPercent, 100)}%`, CANVAS_WIDTH / 2, 80);
    
    // Collision detection
    const donutY = donutRef.current.y;
    const hitboxRadius = DONUT_SIZE / 2 - 6; // Slightly smaller hitbox for fairness
    
    // Floor/ceiling collision
    if (donutY - hitboxRadius < 0 || donutY + hitboxRadius > CANVAS_HEIGHT) {
      // End game inline to avoid circular dependency
      gameActiveRef.current = false;
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      setGameState("gameover");
      setHighScore(prev => Math.max(prev, scoreRef.current));
      setAttempts(prev => prev + 1);
      setLeaderboard(prev => {
        const newEntry = { rank: 0, username: "you", pfpUrl: null, score: scoreRef.current };
        const combined = [...prev.filter(e => e.username !== "you"), newEntry].sort((a, b) => b.score - a.score);
        return combined.slice(0, 10).map((entry, i) => ({ ...entry, rank: i + 1 }));
      });
      return;
    }
    
    // Pipe collision
    for (const pipe of pipesRef.current) {
      if (
        DONUT_X + hitboxRadius > pipe.x &&
        DONUT_X - hitboxRadius < pipe.x + PIPE_WIDTH
      ) {
        if (donutY - hitboxRadius < pipe.topHeight || donutY + hitboxRadius > pipe.topHeight + pipe.gap) {
          // End game inline
          gameActiveRef.current = false;
          if (gameLoopRef.current) {
            cancelAnimationFrame(gameLoopRef.current);
          }
          setGameState("gameover");
          setHighScore(prev => Math.max(prev, scoreRef.current));
          setAttempts(prev => prev + 1);
          setLeaderboard(prev => {
            const newEntry = { rank: 0, username: "you", pfpUrl: null, score: scoreRef.current };
            const combined = [...prev.filter(e => e.username !== "you"), newEntry].sort((a, b) => b.score - a.score);
            return combined.slice(0, 10).map((entry, i) => ({ ...entry, rank: i + 1 }));
          });
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
  
  // Start game with countdown
  const startGame = useCallback(() => {
    // Reset game state
    donutRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    setScore(0);
    setCountdown(3);
    setGameState("countdown");
    
    // Start countdown
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      
      if (count <= 0) {
        clearInterval(countdownInterval);
        gameActiveRef.current = true;
        setGameState("playing");
        
        // Start game loop
        if (gameLoopRef.current) {
          cancelAnimationFrame(gameLoopRef.current);
        }
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [gameLoop]);
  
  // Draw menu/countdown/gameover screen
  useEffect(() => {
    if (gameState === "playing") return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, "#1a1a1a");
    bgGradient.addColorStop(1, "#0d0d0d");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Grid pattern
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
    
    // Draw static donut (floating animation)
    const floatOffset = Math.sin(Date.now() / 500) * 8;
    drawDonut(ctx, CANVAS_HEIGHT / 2 - 60 + floatOffset, 0);
    
    // Title with glow
    ctx.shadowColor = "#FF69B4";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FLAPPY DONUT", CANVAS_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    
    // Subtitle
    ctx.fillStyle = "#888888";
    ctx.font = "12px monospace";
    ctx.fillText("TEST MODE - No wallet required", CANVAS_WIDTH / 2, 95);
    
    if (gameState === "countdown") {
      // Big countdown number with pulse effect
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
      // Game over text
      ctx.fillStyle = "#FF6B6B";
      ctx.font = "bold 28px monospace";
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, 130);
      
      // Score with glow
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 56px monospace";
      ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 200);
      ctx.shadowBlur = 0;
      
      // High score
      ctx.fillStyle = "#888888";
      ctx.font = "16px monospace";
      ctx.fillText(`Best: ${Math.max(score, highScore)}`, CANVAS_WIDTH / 2, 235);
    }
    
    // Animate the menu screen
    if (gameState === "menu" || gameState === "gameover") {
      const animFrame = requestAnimationFrame(() => {
        // Trigger re-render for floating animation
        setScore(s => s);
      });
      return () => cancelAnimationFrame(animFrame);
    }
  }, [gameState, score, highScore, countdown, drawDonut]);
  
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

  const entryCost = attempts + 1;

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
          
          <div className="flex items-center gap-2 px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded-full">
            <span className="text-[10px] text-yellow-400 font-bold">⚠️ TEST MODE</span>
          </div>
          
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-sm">Leaderboard</span>
          </button>
        </div>
        
        {/* Prize Pool Banner (Mock) */}
        <div className="mx-4 mb-3 px-4 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-200/60">Weekly Prize Pool (Test)</span>
            </div>
            <span className="text-lg font-bold text-amber-400">1,234 🍩</span>
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
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center gap-3">
                  {/* Share Button (Game Over only) */}
                  {gameState === "gameover" && score > 0 && (
                    <button
                      onClick={() => alert(`Would share: "I scored ${score} in Flappy Donut! 🍩"`)}
                      className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-500 transition-all"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share Score</span>
                    </button>
                  )}
                  
                  {/* Entry Cost (Mock) */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 rounded-full border border-zinc-700">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm">Entry: <span className="font-bold text-white">{entryCost} 🍩</span></span>
                    <span className="text-[10px] text-zinc-500">(mock)</span>
                  </div>
                  
                  {/* Play Button */}
                  <button
                    onClick={startGame}
                    className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all active:scale-95"
                  >
                    <Play className="w-5 h-5" />
                    <span>{gameState === "gameover" ? "Play Again" : "Play"}</span>
                  </button>
                  
                  {/* Reset attempts */}
                  {attempts > 0 && (
                    <button
                      onClick={() => setAttempts(0)}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset attempts
                    </button>
                  )}
                  
                  {/* Attempt counter */}
                  <p className="text-zinc-500 text-xs">
                    Today's attempts: {attempts} (test mode)
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
        
        {/* Game feel tweaks info */}
        <div className="mx-4 mt-2 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <p className="text-[10px] text-zinc-500 text-center">
            Flap: {FLAP_STRENGTH} | Gap: {PIPE_GAP_START}→{PIPE_GAP_MIN} | Speed: {PIPE_SPEED_START}→{PIPE_SPEED_MAX}
          </p>
          <p className="text-[10px] text-zinc-600 text-center mt-1">
            Difficulty increases as you score (max at 50 pts)
          </p>
        </div>
        
        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span className="font-bold">Weekly Leaderboard</span>
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">TEST</span>
                </div>
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="text-zinc-400 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {leaderboard.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${
                      entry.rank <= 3 ? "bg-amber-500/10" : ""
                    } ${entry.username === "you" ? "bg-green-500/10" : ""}`}
                  >
                    <span className={`w-6 text-center font-bold ${
                      entry.rank === 1 ? "text-amber-400" :
                      entry.rank === 2 ? "text-zinc-300" :
                      entry.rank === 3 ? "text-orange-400" :
                      "text-zinc-500"
                    }`}>
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm">
                      {entry.username === "you" ? "👤" : "🍩"}
                    </div>
                    <span className={`flex-1 truncate ${entry.username === "you" ? "text-green-400 font-bold" : ""}`}>
                      {entry.username === "you" ? "You" : `@${entry.username}`}
                    </span>
                    <span className="font-bold">{entry.score}</span>
                  </div>
                ))}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                <p className="text-xs text-zinc-400 text-center">
                  Top 10 split the weekly prize pool!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}