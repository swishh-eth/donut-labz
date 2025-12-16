"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target, Volume2, VolumeX, ChevronDown, Sparkles, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - TODO: Replace with actual Keno contract
const DONUT_KENO_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // PLACEHOLDER
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

// Risk level configurations
const RISK_LEVELS = [
  { name: "Classic", color: "blue" },
  { name: "Low", color: "green" },
  { name: "Medium", color: "amber" },
  { name: "High", color: "red" },
];

// Payout tables for each risk level and pick count
// Format: PAYOUTS[riskLevel][pickCount][hits] = multiplier (in basis points, 10000 = 1x)
// Based on Stake's actual payout structure - max 1000x for 10/10
const PAYOUTS: Record<number, Record<number, Record<number, number>>> = {
  // Classic - balanced payouts
  0: {
    1: { 1: 38600 }, // 3.86x
    2: { 1: 0, 2: 90000 }, // 9x
    3: { 1: 0, 2: 14000, 3: 260000 }, // 1.4x, 26x
    4: { 1: 0, 2: 11000, 3: 35000, 4: 720000 }, // 1.1x, 3.5x, 72x
    5: { 1: 0, 2: 0, 3: 23000, 4: 80000, 5: 2300000 }, // 2.3x, 8x, 230x
    6: { 1: 0, 2: 0, 3: 16000, 4: 48000, 5: 180000, 6: 3900000 }, // 1.6x, 4.8x, 18x, 390x
    7: { 1: 0, 2: 0, 3: 12000, 4: 32000, 5: 110000, 6: 350000, 7: 5500000 }, // 1.2x, 3.2x, 11x, 35x, 550x
    8: { 1: 0, 2: 0, 3: 10000, 4: 22000, 5: 68000, 6: 200000, 7: 560000, 8: 7500000 }, // 1x, 2.2x, 6.8x, 20x, 56x, 750x
    9: { 1: 0, 2: 0, 3: 10000, 4: 16000, 5: 46000, 6: 120000, 7: 320000, 8: 800000, 9: 9000000 }, // 1x, 1.6x, 4.6x, 12x, 32x, 80x, 900x
    10: { 1: 0, 2: 0, 3: 10000, 4: 13000, 5: 30000, 6: 75000, 7: 200000, 8: 480000, 9: 1200000, 10: 10000000 }, // 1x, 1.3x, 3x, 7.5x, 20x, 48x, 120x, 1000x
  },
  // Low - more frequent small wins
  1: {
    1: { 1: 38600 },
    2: { 1: 18000, 2: 54000 }, // 1.8x, 5.4x
    3: { 1: 10000, 2: 23000, 3: 80000 }, // 1x, 2.3x, 8x
    4: { 1: 10000, 2: 16000, 3: 50000, 4: 220000 },
    5: { 1: 0, 2: 12000, 3: 30000, 4: 100000, 5: 500000 },
    6: { 1: 0, 2: 10000, 3: 22000, 4: 60000, 5: 200000, 6: 1000000 },
    7: { 1: 0, 2: 10000, 3: 16000, 4: 42000, 5: 120000, 6: 400000, 7: 2000000 },
    8: { 1: 0, 2: 10000, 3: 12000, 4: 30000, 5: 80000, 6: 250000, 7: 700000, 8: 3500000 },
    9: { 1: 0, 2: 10000, 3: 10000, 4: 22000, 5: 55000, 6: 160000, 7: 420000, 8: 1100000, 9: 5500000 },
    10: { 1: 0, 2: 10000, 3: 10000, 4: 16000, 5: 38000, 6: 100000, 7: 260000, 8: 650000, 9: 1600000, 10: 8000000 },
  },
  // Medium - balanced risk/reward
  2: {
    1: { 1: 38600 },
    2: { 1: 0, 2: 130000 }, // 13x
    3: { 1: 0, 2: 0, 3: 470000 }, // 47x
    4: { 1: 0, 2: 0, 3: 40000, 4: 1000000 }, // 4x, 100x
    5: { 1: 0, 2: 0, 3: 24000, 4: 120000, 5: 3000000 }, // 2.4x, 12x, 300x
    6: { 1: 0, 2: 0, 3: 16000, 4: 65000, 5: 300000, 6: 5000000 },
    7: { 1: 0, 2: 0, 3: 12000, 4: 40000, 5: 160000, 6: 650000, 7: 7500000 },
    8: { 1: 0, 2: 0, 3: 10000, 4: 26000, 5: 95000, 6: 360000, 7: 1200000, 8: 10000000 },
    9: { 1: 0, 2: 0, 3: 10000, 4: 18000, 5: 60000, 6: 200000, 7: 650000, 8: 2000000, 9: 10000000 },
    10: { 1: 0, 2: 0, 3: 10000, 4: 14000, 5: 40000, 6: 120000, 7: 380000, 8: 1100000, 9: 3500000, 10: 10000000 },
  },
  // High - big jackpots, need more hits
  3: {
    1: { 1: 38600 },
    2: { 1: 0, 2: 170000 }, // 17x
    3: { 1: 0, 2: 0, 3: 815000 }, // 81.5x
    4: { 1: 0, 2: 0, 3: 0, 4: 2100000 }, // 210x
    5: { 1: 0, 2: 0, 3: 0, 4: 90000, 5: 5000000 }, // 9x, 500x
    6: { 1: 0, 2: 0, 3: 0, 4: 50000, 5: 250000, 6: 8000000 },
    7: { 1: 0, 2: 0, 3: 0, 4: 30000, 5: 130000, 6: 700000, 7: 10000000 },
    8: { 1: 0, 2: 0, 3: 0, 4: 20000, 5: 75000, 6: 350000, 7: 1500000, 8: 10000000 },
    9: { 1: 0, 2: 0, 3: 0, 4: 15000, 5: 48000, 6: 200000, 7: 800000, 8: 3000000, 9: 10000000 },
    10: { 1: 0, 2: 0, 3: 0, 4: 11000, 5: 32000, 6: 120000, 7: 450000, 8: 1600000, 9: 5000000, 10: 10000000 },
  },
};

// Get multiplier for given picks, hits, and risk level
const getMultiplier = (riskLevel: number, picks: number, hits: number): number => {
  if (picks < 1 || picks > 10 || hits < 0 || hits > picks) return 0;
  return PAYOUTS[riskLevel]?.[picks]?.[hits] || 0;
};

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("100");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_KENO_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    const parsedAmount = parseFloat(amount || "0");
    if (parsedAmount <= 0) return;
    
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_KENO_ADDRESS, parseUnits(amount, 18)]
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
      args: [DONUT_KENO_ADDRESS, BigInt(0)]
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
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Keno contract.</p>
          
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

export default function KenoPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [riskLevel, setRiskLevel] = useState<number>(0); // Classic
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [drawnNumbers, setDrawnNumbers] = useState<Set<number>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [lastResult, setLastResult] = useState<{ hits: number; multiplier: number; payout: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "risk" | "bet">("none");
  const [revealIndex, setRevealIndex] = useState(0);

  const { address, isConnected } = useAccount();

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playSelectSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800 + Math.random() * 200;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }, [isMuted]);

  const playRevealSound = useCallback((isHit: boolean) => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isHit ? 1200 : 400;
      osc.type = isHit ? 'sine' : 'triangle';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
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
    args: address ? [address, DONUT_KENO_ADDRESS] : undefined,
  });

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const pickCount = selectedNumbers.size;
  const maxMultiplier = pickCount > 0 ? getMultiplier(riskLevel, pickCount, pickCount) / 10000 : 0;

  // Toggle number selection
  const toggleNumber = (num: number) => {
    if (isPlaying || isRevealing) return;
    
    const newSet = new Set(selectedNumbers);
    if (newSet.has(num)) {
      newSet.delete(num);
    } else if (newSet.size < 10) {
      newSet.add(num);
      playSelectSound();
      try { sdk.haptics.impactOccurred("light"); } catch {}
    }
    setSelectedNumbers(newSet);
    setLastResult(null);
    setDrawnNumbers(new Set());
  };

  // Random pick
  const randomPick = (count: number) => {
    if (isPlaying || isRevealing) return;
    
    const available = Array.from({ length: 40 }, (_, i) => i + 1);
    const shuffled = available.sort(() => Math.random() - 0.5);
    const picked = new Set(shuffled.slice(0, count));
    setSelectedNumbers(picked);
    setLastResult(null);
    setDrawnNumbers(new Set());
    playSelectSound();
    try { sdk.haptics.impactOccurred("medium"); } catch {}
  };

  // Clear selection
  const clearSelection = () => {
    if (isPlaying || isRevealing) return;
    setSelectedNumbers(new Set());
    setDrawnNumbers(new Set());
    setLastResult(null);
  };

  // Simulate a game (TEST MODE - no contract)
  const handlePlay = async () => {
    if (!isConnected || selectedNumbers.size === 0) return;
    if (isPlaying || isRevealing || cooldown) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet must be 0.1-10 DONUT");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    // TEST MODE: Simulate game locally
    setIsPlaying(true);
    setLastResult(null);
    setDrawnNumbers(new Set());
    setRevealIndex(0);

    // Generate 10 random drawn numbers
    const available = Array.from({ length: 40 }, (_, i) => i + 1);
    const shuffled = available.sort(() => Math.random() - 0.5);
    const drawn = shuffled.slice(0, 10);

    // Reveal numbers one by one
    setIsRevealing(true);
    for (let i = 0; i < drawn.length; i++) {
      await new Promise(r => setTimeout(r, 200));
      const num = drawn[i];
      const isHit = selectedNumbers.has(num);
      playRevealSound(isHit);
      if (isHit) {
        try { sdk.haptics.impactOccurred("medium"); } catch {}
      }
      setDrawnNumbers(prev => new Set([...prev, num]));
      setRevealIndex(i + 1);
    }

    // Calculate result
    const hits = drawn.filter(n => selectedNumbers.has(n)).length;
    const multiplier = getMultiplier(riskLevel, selectedNumbers.size, hits);
    const payout = multiplier > 0 ? amount * (multiplier / 10000) * 0.98 : 0;

    setIsRevealing(false);
    setIsPlaying(false);
    setCooldown(true);

    setLastResult({ hits, multiplier, payout });

    if (payout > 0) {
      playWinSound();
      setShowConfetti(true);
      try { sdk.haptics.impactOccurred("heavy"); } catch {}
      setTimeout(() => setShowConfetti(false), 3000);
    } else {
      playLoseSound();
      try { sdk.haptics.impactOccurred("heavy"); } catch {}
    }

    setTimeout(() => setCooldown(false), 2000);
  };

  // Payout table for current selection
  const payoutTable = pickCount > 0 ? PAYOUTS[riskLevel][pickCount] : null;

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes pulse-hit {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes reveal-pop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
        .pulse-hit { animation: pulse-hit 0.3s ease-out; }
        .reveal-pop { animation: reveal-pop 0.2s ease-out forwards; }
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
              💎
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
              <h1 className="text-xl font-bold tracking-wide">DONUT KENO</h1>
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
              <div className="text-[8px] text-gray-500">PICKS</div>
              <div className="text-sm font-bold">{pickCount}/10</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">HITS</div>
              <div className="text-sm font-bold text-green-400">
                {lastResult ? lastResult.hits : "-"}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
              <div className="text-[8px] text-gray-500">MAX WIN</div>
              <div className="text-sm font-bold text-purple-400">
                {maxMultiplier > 0 ? `${maxMultiplier >= 1000 ? `${(maxMultiplier/1000).toFixed(0)}K` : maxMultiplier.toFixed(0)}x` : "-"}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex gap-1">
              <button
                onClick={() => randomPick(5)}
                disabled={isPlaying || isRevealing}
                className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Shuffle className="w-3 h-3" /> 5
              </button>
              <button
                onClick={() => randomPick(10)}
                disabled={isPlaying || isRevealing}
                className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Shuffle className="w-3 h-3" /> 10
              </button>
              <button
                onClick={clearSelection}
                disabled={isPlaying || isRevealing || selectedNumbers.size === 0}
                className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-red-400 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div className="flex gap-2">
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
          </div>

          {/* Keno Grid - 8x5 = 40 numbers */}
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            <div className="grid grid-cols-8 gap-1.5 mb-2">
              {Array.from({ length: 40 }, (_, i) => i + 1).map((num) => {
                const isSelected = selectedNumbers.has(num);
                const isDrawn = drawnNumbers.has(num);
                const isHit = isSelected && isDrawn;
                const isMiss = isDrawn && !isSelected;

                return (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={isPlaying || isRevealing}
                    className={cn(
                      "aspect-square rounded-lg font-bold text-sm flex items-center justify-center transition-all border-2",
                      // Not drawn yet
                      !isDrawn && isSelected && "bg-purple-500 border-purple-400 text-white",
                      !isDrawn && !isSelected && "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500",
                      // Drawn - hit
                      isHit && "bg-green-500 border-green-400 text-white pulse-hit",
                      // Drawn - miss (selected but not hit is handled above, this is drawn but not selected)
                      isMiss && "bg-zinc-700 border-zinc-600 text-zinc-500",
                      // Drawn - not selected, just mark it
                      isDrawn && !isSelected && !isMiss && "bg-zinc-700 border-zinc-600 text-zinc-400",
                      // Disabled state
                      (isPlaying || isRevealing) && "cursor-not-allowed",
                      isDrawn && "reveal-pop"
                    )}
                  >
                    {isHit ? "💎" : num}
                  </button>
                );
              })}
            </div>

            {/* Result display */}
            {lastResult && (
              <div className={cn(
                "text-center py-2 rounded-xl mb-2",
                lastResult.payout > 0 ? "bg-green-500/20 border border-green-500/50" : "bg-red-500/20 border border-red-500/50"
              )}>
                <div className={cn(
                  "text-lg font-bold",
                  lastResult.payout > 0 ? "text-green-400" : "text-red-400"
                )}>
                  {lastResult.payout > 0 
                    ? `🎉 ${lastResult.hits} HITS! +${lastResult.payout.toFixed(2)} 🍩`
                    : `${lastResult.hits} hits - No win`
                  }
                </div>
                {lastResult.multiplier > 0 && (
                  <div className="text-xs text-gray-400">
                    {(lastResult.multiplier / 10000).toFixed(2)}x multiplier
                  </div>
                )}
              </div>
            )}

            {/* Payout table */}
            {payoutTable && !lastResult && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                <div className="text-[9px] text-gray-500 mb-1 text-center">PAYOUTS FOR {pickCount} PICKS</div>
                <div className="flex flex-wrap justify-center gap-1">
                  {Object.entries(payoutTable).map(([hits, mult]) => (
                    <div key={hits} className={cn(
                      "px-2 py-0.5 rounded text-[9px]",
                      mult > 0 ? "bg-zinc-800" : "bg-zinc-900 text-zinc-600"
                    )}>
                      <span className="text-gray-400">{hits}:</span>
                      <span className={cn("font-bold ml-1", mult > 0 ? "text-green-400" : "text-zinc-600")}>
                        {mult > 0 ? `${(mult / 10000).toFixed(mult >= 10000 ? 0 : 1)}x` : "0"}
                      </span>
                    </div>
                  ))}
                </div>
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
            {/* Risk + Bet controls */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              <div className="flex items-center gap-2 h-12">
                {/* Risk Level */}
                {expandedPanel === "risk" ? (
                  <div className="flex-1 flex items-center gap-1">
                    {RISK_LEVELS.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setRiskLevel(i);
                          setExpandedPanel("none");
                          try { sdk.haptics.impactOccurred("light"); } catch {}
                        }}
                        disabled={isPlaying || isRevealing}
                        className={cn(
                          "flex-1 py-2 text-[9px] rounded font-bold border transition-all",
                          riskLevel === i
                            ? r.color === "blue" ? "bg-blue-500 text-white border-blue-500" 
                            : r.color === "green" ? "bg-green-500 text-black border-green-500"
                            : r.color === "amber" ? "bg-amber-500 text-black border-amber-500"
                            : "bg-red-500 text-white border-red-500"
                            : "bg-zinc-800 text-gray-400 border-zinc-700"
                        )}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedPanel("risk")}
                    disabled={isPlaying || isRevealing}
                    className={cn(
                      "h-full px-3 rounded-lg flex flex-col items-center justify-center border transition-all",
                      riskLevel === 0 ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                      : riskLevel === 1 ? "bg-green-500/20 border-green-500/50 text-green-400"
                      : riskLevel === 2 ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                      : "bg-red-500/20 border-red-500/50 text-red-400"
                    )}
                  >
                    <span className="text-[8px] text-gray-400">RISK</span>
                    <span className="text-[10px] font-bold">{RISK_LEVELS[riskLevel].name}</span>
                  </button>
                )}

                {/* Bet Amount */}
                {expandedPanel === "bet" ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      {["0.5", "1", "2", "5"].map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setBetAmount(val);
                            try { sdk.haptics.impactOccurred("light"); } catch {}
                          }}
                          className={cn(
                            "flex-1 py-1 text-[10px] rounded border font-bold",
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
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-center text-sm font-bold"
                        disabled={isPlaying || isRevealing}
                      />
                      <button
                        onClick={() => setExpandedPanel("none")}
                        className="px-3 rounded-lg bg-amber-500 text-black text-xs font-bold"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedPanel("bet")}
                    disabled={isPlaying || isRevealing}
                    className="flex-1 h-full rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center gap-2"
                  >
                    <span className="text-[10px] text-gray-500">BET</span>
                    <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                    <span className="text-[10px] text-gray-500">🍩</span>
                  </button>
                )}
              </div>
            </div>

            {/* Play button */}
            <button
              onClick={handlePlay}
              disabled={isPlaying || isRevealing || cooldown || !isConnected || selectedNumbers.size === 0}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                isPlaying || isRevealing || cooldown ? "bg-zinc-600 text-zinc-300" : "bg-white text-black hover:bg-gray-100"
              )}
            >
              {isPlaying || isRevealing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isRevealing ? `Drawing... ${revealIndex}/10` : "Starting..."}
                </span>
              ) : cooldown && lastResult ? (
                <span className={lastResult.payout > 0 ? "text-green-500" : "text-red-500"}>
                  {lastResult.payout > 0 ? `🎉 +${lastResult.payout.toFixed(2)} 🍩` : "Try again!"}
                </span>
              ) : selectedNumbers.size === 0 ? (
                "Select 1-10 numbers"
              ) : (
                `PLAY KENO (${selectedNumbers.size} picks)`
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
                <Target className="w-4 h-4" /> How to Play Keno
              </h2>
              <div className="space-y-2.5">
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Pick Your Numbers</div>
                    <div className="text-[11px] text-gray-400">Select 1-10 numbers from the 40-tile grid. Use Quick Pick for random selection.</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">2</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Choose Risk Level</div>
                    <div className="text-[11px] text-gray-400">Higher risk = bigger payouts but need more hits to win.</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                  <div>
                    <div className="font-semibold text-white text-xs">Set Your Bet</div>
                    <div className="text-[11px] text-gray-400">Choose how much DONUT to wager (0.1 - 10).</div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-green-400 text-xs">Watch the Draw!</div>
                    <div className="text-[11px] text-gray-400">10 numbers are drawn. More hits = bigger multiplier!</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Risk Levels:</div>
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  <div><span className="text-blue-400">Classic:</span> Balanced payouts, frequent small wins</div>
                  <div><span className="text-green-400">Low:</span> More frequent wins, lower max</div>
                  <div><span className="text-amber-400">Medium:</span> Balanced risk/reward</div>
                  <div><span className="text-red-400">High:</span> Big jackpots, need more hits</div>
                </div>
              </div>
              
              <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-amber-400 font-bold mb-1">Max Payouts (10 picks, all 10 hit):</div>
                <div className="text-[10px] text-gray-400">Up to 10,000x on High risk!</div>
              </div>
              
              <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal - Placeholder for TEST */}
      {showHistory && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <History className="w-4 h-4" /> Game History
              </h2>
              
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🧪</div>
                <div className="text-sm text-gray-400">TEST MODE</div>
                <div className="text-xs text-gray-500 mt-1">History will be available when contract is deployed</div>
              </div>
              
              <button onClick={() => setShowHistory(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
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