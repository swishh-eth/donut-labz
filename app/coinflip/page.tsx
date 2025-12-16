"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - TODO: Replace with actual CoinFlip contract
const DONUT_COINFLIP_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // PLACEHOLDER
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;

const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("100");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_COINFLIP_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    const parsedAmount = parseFloat(amount || "0");
    if (parsedAmount <= 0) return;
    
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_COINFLIP_ADDRESS, parseUnits(amount, 18)]
    }, {
      onSuccess: () => {
        refetchLocal();
        refetchAllowance();
      }
    });
  };

  const handleRevoke = () => {
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_COINFLIP_ADDRESS, BigInt(0)]
    }, {
      onSuccess: () => {
        refetchLocal();
        refetchAllowance();
      }
    });
  };

  const isApproved = allowance && allowance > BigInt(0);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Token Approvals
          </h2>
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Coin Flip contract.</p>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍩</span>
                <div>
                  <div className="text-sm font-bold text-white">DONUT</div>
                  <div className="text-[10px] text-gray-500">
                    {isApproved 
                      ? `Approved: ${parseFloat(formatUnits(allowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "Not approved"
                    }
                  </div>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full", isApproved ? "bg-green-500" : "bg-red-500")} />
            </div>
            
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={approvalAmount}
                  onChange={(e) => setApprovalAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-gray-500">DONUT</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(approvalAmount)}
                disabled={isPending || parseFloat(approvalAmount || "0") <= 0}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {isPending ? "..." : "Approve"}
              </button>
              {isApproved && (
                <button
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {isPending ? "..." : "Revoke"}
                </button>
              )}
            </div>
          </div>
          
          <button onClick={onClose} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function CoinFlipPage() {
  const readyRef = useRef(false);
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [selectedSide, setSelectedSide] = useState<"heads" | "tails">("heads");
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [coinRotation, setCoinRotation] = useState(0);
  const [lastResult, setLastResult] = useState<{ side: "heads" | "tails"; won: boolean; payout: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "bet">("none");
  const [streak, setStreak] = useState(0);
  const [gameHistory, setGameHistory] = useState<Array<{ side: "heads" | "tails"; won: boolean; amount: number; payout: number }>>([]);

  const { address, isConnected } = useAccount();

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playFlipSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 200 + Math.random() * 100;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, [isMuted]);

  const playWinSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const frequencies = [523, 659, 784, 1047];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const startTime = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    } catch {}
  }, [isMuted]);

  const playLoseSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, [isMuted]);

  // Load context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // SDK ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Read token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_COINFLIP_ADDRESS] : undefined,
  });

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const multiplier = 1.96; // 2% house edge on 50/50
  const potentialWin = parseFloat(betAmount || "0") * multiplier;

  // Simulate a flip (TEST MODE - no contract)
  const handleFlip = async () => {
    if (!isConnected) return;
    if (isFlipping || cooldown) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet must be 0.1-10 DONUT");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsFlipping(true);
    setLastResult(null);
    setExpandedPanel("none");

    // Determine result first (so we know where to land)
    const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    
    // Animate coin flip - rotateX for vertical flip
    const flipDuration = 2000;
    const startTime = Date.now();
    const startRotation = coinRotation;
    const totalRotations = 4 + Math.random() * 2; // 4-6 full rotations
    
    // Calculate final rotation - heads = 0deg (or 360*n), tails = 180deg (or 360*n + 180)
    const baseRotation = Math.ceil((startRotation + totalRotations * 360) / 360) * 360;
    const finalRotation = result === "heads" ? baseRotation : baseRotation + 180;
    const totalDelta = finalRotation - startRotation;
    
    // Play flip sounds during animation
    const flipInterval = setInterval(() => {
      playFlipSound();
    }, 120);

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / flipDuration, 1);
      
      // Ease out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (totalDelta * eased);
      setCoinRotation(currentRotation);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        clearInterval(flipInterval);
        
        // Ensure we land exactly on the right position
        setCoinRotation(finalRotation);
        
        const won = result === selectedSide;
        const payout = won ? amount * multiplier : 0;

        setLastResult({ side: result, won, payout });
        setIsFlipping(false);
        setCooldown(true);

        // Update history
        setGameHistory(prev => [{
          side: result,
          won,
          amount,
          payout
        }, ...prev.slice(0, 19)]);

        if (won) {
          playWinSound();
          setStreak(prev => prev + 1);
          setShowConfetti(true);
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
          setTimeout(() => setShowConfetti(false), 3000);
        } else {
          playLoseSound();
          setStreak(0);
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
        }

        setTimeout(() => setCooldown(false), 1500);
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${(i * 37 + 13) % 100}%`,
                top: '-60px',
                animationDelay: `${(i * 0.05) % 0.8}s`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      <div className="w-full max-w-md flex flex-col h-full pb-16">
        <NavBar />
        
        <div className="flex-1 px-4 py-2 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wide">COIN FLIP</h1>
              <span className="px-2 py-0.5 text-[9px] bg-purple-500/20 text-purple-400 rounded-full font-bold border border-purple-500/30">
                TEST
              </span>
            </div>
            {context?.user?.pfpUrl ? (
              <img src={context.user.pfpUrl} alt="" className="w-7 h-7 rounded-full border border-zinc-700" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>

          {/* Token selector */}
          <div className="flex gap-2 mb-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-amber-500 text-black">
              🍩 DONUT
            </button>
            <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-zinc-900 border border-zinc-800 text-gray-600 opacity-50">
              ✨ SPRINKLES <span className="text-[8px]">SOON</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">BALANCE</div>
              <div className="text-sm font-bold text-amber-400">{balance.toFixed(0)} 🍩</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">MULTIPLIER</div>
              <div className="text-sm font-bold text-green-400">{multiplier}x</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">STREAK</div>
              <div className="text-sm font-bold text-purple-400">🔥 {streak}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">WIN</div>
              <div className="text-sm font-bold text-amber-400">{potentialWin.toFixed(2)}</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mb-3">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={cn(
                "p-2 rounded-lg border transition-colors",
                isMuted ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-zinc-900 border-zinc-800"
              )}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowApprovals(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <Shield className="w-4 h-4" />
            </button>
            <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <History className="w-4 h-4" />
            </button>
            <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Coin Area */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* The 3D Coin */}
            <div 
              className="relative w-36 h-36 mb-6"
              style={{ perspective: '1000px' }}
            >
              <div
                className="w-full h-full relative"
                style={{ 
                  transformStyle: 'preserve-3d',
                  transform: `rotateX(${coinRotation}deg)`,
                  transition: isFlipping ? 'none' : 'transform 0.3s ease-out'
                }}
              >
                {/* Heads side (front) - Donut */}
                <div 
                  className="absolute inset-0 rounded-full flex items-center justify-center border-4 shadow-2xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    background: 'linear-gradient(145deg, #f59e0b, #d97706)',
                    borderColor: '#fbbf24',
                    boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.3), inset 0 -2px 10px rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.4)'
                  }}
                >
                  <div className="text-5xl">🍩</div>
                  <div className="absolute bottom-4 text-[10px] font-bold text-amber-900 tracking-wider">HEADS</div>
                  {/* Shine effect */}
                  <div 
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, transparent 100%)',
                    }}
                  />
                  {/* Edge detail */}
                  <div 
                    className="absolute inset-1 rounded-full border-2 border-amber-400/30 pointer-events-none"
                  />
                </div>
                
                {/* Tails side (back) - Sparkles */}
                <div 
                  className="absolute inset-0 rounded-full flex items-center justify-center border-4 shadow-2xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateX(180deg)',
                    background: 'linear-gradient(145deg, #71717a, #52525b)',
                    borderColor: '#a1a1aa',
                    boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.2), inset 0 -2px 10px rgba(0,0,0,0.3), 0 10px 30px rgba(0,0,0,0.4)'
                  }}
                >
                  <div className="text-5xl">✨</div>
                  <div className="absolute bottom-4 text-[10px] font-bold text-zinc-300 tracking-wider">TAILS</div>
                  {/* Shine effect */}
                  <div 
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%, transparent 100%)',
                    }}
                  />
                  {/* Edge detail */}
                  <div 
                    className="absolute inset-1 rounded-full border-2 border-zinc-400/30 pointer-events-none"
                  />
                </div>

                {/* Coin edge (thickness) - multiple layers for 3D effect */}
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 rounded-full"
                    style={{
                      transform: `translateZ(${-2 - i * 0.5}px)`,
                      background: i < 4 ? '#b45309' : '#92400e',
                      border: '1px solid #78350f',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Result Display */}
            {lastResult && !isFlipping && (
              <div className={cn(
                "text-center py-3 px-6 rounded-xl mb-2",
                lastResult.won ? "bg-green-500/20 border border-green-500/50" : "bg-red-500/20 border border-red-500/50"
              )}>
                <div className={cn(
                  "text-xl font-bold",
                  lastResult.won ? "text-green-400" : "text-red-400"
                )}>
                  {lastResult.side === "heads" ? "🍩 HEADS" : "✨ TAILS"}
                </div>
                <div className={cn(
                  "text-sm",
                  lastResult.won ? "text-green-400" : "text-red-400"
                )}>
                  {lastResult.won ? `YOU WIN! +${lastResult.payout.toFixed(2)} 🍩` : "Better luck next time!"}
                </div>
              </div>
            )}

            {isFlipping && (
              <div className="text-amber-400 text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Flipping...
              </div>
            )}
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-center text-red-400 text-sm mb-2">
              {errorMessage}
            </div>
          )}

          {/* Controls */}
          <div className="space-y-2 pb-2 mt-auto">
            {/* Side selection */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              <div className="flex items-center gap-2">
                {/* Heads button */}
                <button
                  onClick={() => {
                    setSelectedSide("heads");
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  disabled={isFlipping}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border-2",
                    selectedSide === "heads" 
                      ? "bg-amber-500 text-black border-amber-400" 
                      : "bg-zinc-800 text-gray-400 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  🍩 HEADS
                </button>

                {/* Tails button */}
                <button
                  onClick={() => {
                    setSelectedSide("tails");
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  disabled={isFlipping}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border-2",
                    selectedSide === "tails" 
                      ? "bg-zinc-400 text-black border-zinc-300" 
                      : "bg-zinc-800 text-gray-400 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  ✨ TAILS
                </button>
              </div>
            </div>

            {/* Bet amount */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              {expandedPanel === "bet" ? (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1">
                    {["0.5", "1", "2", "5"].map((val) => (
                      <button
                        key={val}
                        onClick={() => {
                          setBetAmount(val);
                          try { sdk.haptics.impactOccurred("light"); } catch {}
                        }}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] rounded border font-bold",
                          betAmount === val ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-800 text-gray-400 border-zinc-700"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={betAmount}
                      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBetAmount(e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-center text-sm font-bold"
                      disabled={isFlipping}
                    />
                    <button
                      onClick={() => setExpandedPanel("none")}
                      className="px-4 rounded-lg bg-amber-500 text-black text-xs font-bold"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedPanel("bet")}
                  disabled={isFlipping}
                  className="w-full h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center gap-2"
                >
                  <span className="text-[10px] text-gray-500">BET</span>
                  <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                  <span className="text-[10px] text-gray-500">🍩</span>
                </button>
              )}
            </div>

            {/* Flip button */}
            <button
              onClick={handleFlip}
              disabled={isFlipping || cooldown || !isConnected}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                isFlipping || cooldown ? "bg-zinc-600 text-zinc-300" : "bg-white text-black hover:bg-gray-100"
              )}
            >
              {isFlipping ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Flipping...
                </span>
              ) : cooldown && lastResult ? (
                <span className={lastResult.won ? "text-green-500" : "text-red-500"}>
                  {lastResult.won ? `🎉 +${lastResult.payout.toFixed(2)} 🍩` : "Try again!"}
                </span>
              ) : (
                `FLIP COIN`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" /> How to Play
              </h2>
              <div className="space-y-2.5">
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Pick a Side</div>
                    <div className="text-[11px] text-gray-400">Choose Heads 🍩 or Tails ✨</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">2</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Set Your Bet</div>
                    <div className="text-[11px] text-gray-400">Choose how much DONUT to wager (0.1 - 10).</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                  <div>
                    <div className="font-semibold text-green-400 text-xs">Flip & Win!</div>
                    <div className="text-[11px] text-gray-400">50/50 odds. Win = 1.96x your bet!</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Simple Math:</div>
                <div className="text-[10px] text-gray-400">50% chance to win</div>
                <div className="text-[10px] text-gray-400">Win = 1.96x payout (2% house edge)</div>
              </div>
              
              <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Fee Structure:</div>
                <div className="text-[10px] text-gray-400">On Win: 2% house edge</div>
                <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
              </div>
              
              <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col">
              <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <History className="w-4 h-4" /> Flip History
              </h2>
              <p className="text-[10px] text-gray-500 mb-3">Recent flips this session (TEST MODE)</p>
              
              <div className="flex-1 overflow-y-auto space-y-2">
                {gameHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No flips yet</p>
                ) : (
                  gameHistory.map((game, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "p-2 rounded-lg border", 
                        game.won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">
                            {game.side === "heads" ? "🍩" : "✨"}
                          </span>
                          <div>
                            <span className="text-xs text-gray-400">{game.side.toUpperCase()}</span>
                            <div className="text-[9px] text-gray-500">{game.won ? "Won" : "Lost"}</div>
                          </div>
                        </div>
                        <div className={cn("text-sm font-bold", game.won ? "text-green-400" : "text-red-400")}>
                          {game.won ? `+${game.payout.toFixed(2)}` : `-${game.amount.toFixed(2)}`} 🍩
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Approvals Modal */}
      {showApprovals && (
        <ApprovalsModal 
          onClose={() => setShowApprovals(false)} 
          refetchAllowance={refetchAllowance}
        />
      )}
    </main>
  );
}