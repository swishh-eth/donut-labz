"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - V5
const GLAZE_WHEEL_ADDRESS = "0xDd89E2535e460aDb63adF09494AcfB99C33c43d8" as const;
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

// V5 ABI - simplified, house reveals
const WHEEL_V5_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" }
    ],
    name: "startSpin",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "claimExpiredSpin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "getSpin",
    outputs: [{
      type: "tuple",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "riskLevel", type: "uint8" },
        { name: "segments", type: "uint8" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "result", type: "uint8" },
        { name: "multiplier", type: "uint256" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerSpins",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "spins",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" },
      { name: "commitBlock", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "result", type: "uint8" },
      { name: "multiplier", type: "uint256" },
      { name: "payout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "spinId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "riskLevel", type: "uint8" },
      { indexed: false, name: "segments", type: "uint8" },
      { indexed: false, name: "commitBlock", type: "uint256" }
    ],
    name: "SpinStarted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "spinId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "result", type: "uint8" },
      { indexed: false, name: "multiplier", type: "uint256" },
      { indexed: false, name: "payout", type: "uint256" }
    ],
    name: "SpinRevealed",
    type: "event"
  }
] as const;

type OnchainSpin = {
  player: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  riskLevel: number;
  segments: number;
  commitBlock: bigint;
  status: number;
  result: number;
  multiplier: bigint;
  payout: bigint;
};

// Get multipliers for wheel config (matching contract exactly)
const getWheelMultipliers = (riskLevel: number, segments: number): number[] => {
  if (riskLevel === 0) { // LOW RISK
    if (segments === 10) {
      return [15000, 12000, 11000, 10000, 9000, 15000, 12000, 11000, 10000, 9000];
    } else if (segments === 20) {
      const mults = [];
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) mults.push(18000);
        else if (i % 5 === 1) mults.push(12000);
        else if (i % 5 === 2) mults.push(10000);
        else if (i % 5 === 3) mults.push(8000);
        else mults.push(6000);
      }
      return mults;
    } else if (segments === 30) {
      const mults = [];
      for (let i = 0; i < 30; i++) {
        if (i % 6 === 0) mults.push(20000);
        else if (i % 6 === 1) mults.push(15000);
        else if (i % 6 === 2) mults.push(10000);
        else if (i % 6 === 3) mults.push(8000);
        else if (i % 6 === 4) mults.push(5000);
        else mults.push(0);
      }
      return mults;
    }
  } else if (riskLevel === 1) { // MEDIUM RISK
    if (segments === 10) {
      return [30000, 20000, 15000, 10000, 0, 25000, 15000, 10000, 5000, 0];
    } else if (segments === 20) {
      const mults = [];
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) mults.push(40000);
        else if (i % 5 === 1) mults.push(20000);
        else if (i % 5 === 2) mults.push(10000);
        else if (i % 5 === 3) mults.push(5000);
        else mults.push(0);
      }
      return mults;
    } else if (segments === 30) {
      const mults = [];
      for (let i = 0; i < 30; i++) {
        if (i % 6 === 0) mults.push(50000);
        else if (i % 6 === 1) mults.push(25000);
        else if (i % 6 === 2) mults.push(15000);
        else if (i % 6 === 3) mults.push(5000);
        else mults.push(0);
      }
      return mults;
    }
  } else { // HIGH RISK
    if (segments === 10) {
      return [98000, 20000, 0, 15000, 0, 50000, 0, 10000, 0, 0];
    } else if (segments === 20) {
      const mults = [];
      for (let i = 0; i < 20; i++) {
        if (i === 0) mults.push(196000);
        else if (i % 5 === 0) mults.push(30000);
        else if (i % 5 === 1) mults.push(10000);
        else mults.push(0);
      }
      return mults;
    } else if (segments === 30) {
      const mults = [];
      for (let i = 0; i < 30; i++) {
        if (i === 0) mults.push(294000);
        else if (i % 6 === 0) mults.push(50000);
        else if (i % 6 === 1) mults.push(15000);
        else mults.push(0);
      }
      return mults;
    }
  }
  return Array(segments).fill(10000);
};

// Wheel component with improved visuals
function WheelDisplay({ 
  segments, 
  multipliers, 
  rotation, 
  isSpinning,
  isWaiting,
  onTick,
  isMuted
}: { 
  segments: number;
  multipliers: number[];
  rotation: number;
  isSpinning: boolean;
  isWaiting?: boolean;
  onTick: (isWaiting?: boolean) => void;
  isMuted: boolean;
}) {
  const [displayRotation, setDisplayRotation] = useState(0);
  const lastSegmentRef = useRef<number>(-1);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const startRotationRef = useRef<number>(0);
  
  // Idle rotation OR fast spin while waiting for result
  useEffect(() => {
    if (isSpinning && rotation > 0) return;
    
    const speed = isWaiting ? 4 : 0.2;
    let lastTickSegment = -1;
    
    const animate = () => {
      setDisplayRotation(prev => {
        const newRot = (prev + speed) % 360;
        
        // Play tick sounds while waiting (not during idle)
        if (isWaiting) {
          const segmentAngle = 360 / segments;
          const currentSegment = Math.floor(((360 - newRot + segmentAngle / 2) % 360) / segmentAngle);
          if (currentSegment !== lastTickSegment) {
            lastTickSegment = currentSegment;
            onTick(true); // Pass true to indicate waiting state
          }
        }
        
        return newRot;
      });
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSpinning, rotation, isWaiting, segments, onTick]);
  
  // Spinning animation with easing and tick sounds
  useEffect(() => {
    if (!isSpinning || rotation === 0) return;
    
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    startTimeRef.current = performance.now();
    startRotationRef.current = displayRotation;
    const targetRotation = rotation;
    const duration = 5000;
    
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      
      const currentRotation = startRotationRef.current + (targetRotation - startRotationRef.current) * eased;
      setDisplayRotation(currentRotation);
      
      const normalizedRotation = currentRotation % 360;
      const segmentAngle = 360 / segments;
      const currentSegment = Math.floor(((360 - normalizedRotation + segmentAngle / 2) % 360) / segmentAngle);
      
      if (currentSegment !== lastSegmentRef.current && progress < 0.95) {
        lastSegmentRef.current = currentSegment;
        onTick(false); // Not waiting, full spin animation
      }
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        lastSegmentRef.current = -1;
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSpinning, rotation, segments, onTick]);

  // SVG wheel dimensions
  const size = 240;
  const center = size / 2;
  const radius = size / 2 - 6;
  const innerRadius = 22;
  
  const getSegmentPath = (index: number) => {
    const anglePerSegment = (2 * Math.PI) / segments;
    const startAngle = index * anglePerSegment - Math.PI / 2;
    const endAngle = startAngle + anglePerSegment;
    
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const x3 = center + innerRadius * Math.cos(endAngle);
    const y3 = center + innerRadius * Math.sin(endAngle);
    const x4 = center + innerRadius * Math.cos(startAngle);
    const y4 = center + innerRadius * Math.sin(startAngle);
    
    const largeArc = anglePerSegment > Math.PI ? 1 : 0;
    
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };
  
  const getSegmentColor = (mult: number) => {
    if (mult === 0) return "#1f1f23";
    if (mult >= 50000) return "#ffffff";
    if (mult >= 15000) return "#e4e4e7";
    if (mult >= 10000) return "#a1a1aa";
    return "#71717a";
  };
  
  const getTextPosition = (index: number) => {
    const anglePerSegment = (2 * Math.PI) / segments;
    const midAngle = index * anglePerSegment - Math.PI / 2 + anglePerSegment / 2;
    const textRadius = radius * 0.68;
    return {
      x: center + textRadius * Math.cos(midAngle),
      y: center + textRadius * Math.sin(midAngle),
      rotation: (midAngle * 180 / Math.PI) + 90
    };
  };
  
  return (
    <div className="relative flex items-center justify-center">
      {/* Pointer */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10">
        <div 
          className={cn(
            "w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent",
            (isSpinning || isWaiting) ? "border-t-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "border-t-white/90"
          )}
        />
      </div>
      
      {/* Wheel SVG */}
      <svg 
        width={size} 
        height={size} 
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${displayRotation}deg)` }}
        className={cn(
          (isSpinning || isWaiting) && "drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]"
        )}
      >
        {/* Segments */}
        {multipliers.map((mult, i) => (
          <path
            key={i}
            d={getSegmentPath(i)}
            fill={getSegmentColor(mult)}
            stroke="#000"
            strokeWidth="1"
          />
        ))}
        
        {/* Text labels */}
        {segments <= 20 && multipliers.map((mult, i) => {
          const pos = getTextPosition(i);
          return (
            <text
              key={`text-${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${pos.rotation}, ${pos.x}, ${pos.y})`}
              fill={mult > 0 ? "#000" : "#52525b"}
              fontSize={segments <= 10 ? "11" : "8"}
              fontWeight="bold"
              fontFamily="ui-monospace, monospace"
            >
              {mult > 0 ? `${(mult / 10000).toFixed(1)}x` : "0"}
            </text>
          );
        })}
        
        {/* Outer ring - white */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#fff"
          strokeWidth="3"
        />
        
        {/* Inner circle */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="#18181b"
          stroke="#fff"
          strokeWidth="2"
        />
      </svg>
      
      {/* Center donut emoji */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-lg">🍩</span>
      </div>
    </div>
  );
}

// Multiplier legend
function MultiplierLegend({ multipliers }: { multipliers: number[] }) {
  const uniqueMults = useMemo(() => {
    const counts: Record<number, number> = {};
    multipliers.forEach(m => {
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([mult, count]) => ({ mult: Number(mult), count }))
      .filter(({ mult }) => mult > 0) // Only show winning multipliers
      .sort((a, b) => b.mult - a.mult);
  }, [multipliers]);
  
  return (
    <div className="flex flex-wrap gap-1.5 justify-center px-2">
      {uniqueMults.slice(0, 5).map(({ mult, count }) => (
        <div 
          key={mult}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-zinc-900 border border-zinc-800"
        >
          <span className="font-bold text-white">
            {(mult / 10000).toFixed(1)}x
          </span>
          <span className="text-zinc-500">×{count}</span>
        </div>
      ))}
    </div>
  );
}

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("100");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, GLAZE_WHEEL_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    const parsedAmount = parseFloat(amount || "0");
    if (parsedAmount <= 0) return;
    
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [GLAZE_WHEEL_ADDRESS, parseUnits(amount, 18)]
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
      args: [GLAZE_WHEEL_ADDRESS, BigInt(0)]
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
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Wheel contract.</p>
          
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

export default function GlazeWheelPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  const currentSpinIdRef = useRef<string | null>(null);
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [riskLevel, setRiskLevel] = useState<number>(1);
  const [segments, setSegments] = useState<number>(10);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastResult, setLastResult] = useState<{ result: number; multiplier: number; won: boolean; payout: bigint } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [expandedSpinId, setExpandedSpinId] = useState<string | null>(null);
  const [hasShownApproval, setHasShownApproval] = useState(false);
  const [recentSpins, setRecentSpins] = useState<OnchainSpin[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "risk" | "segments" | "bet">("none");

  const { address, isConnected } = useAccount();
  
  const multipliers = useMemo(() => getWheelMultipliers(riskLevel, segments), [riskLevel, segments]);

  // Audio context for sounds
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  // Tick sound for wheel - frequency varies with speed
  const playTickSound = useCallback((isWaiting?: boolean) => {
    // Light haptic on each tick
    try { sdk.haptics.impactOccurred("light"); } catch {}
    
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      // Higher pitch when spinning fast (waiting), lower when slow
      oscillator.frequency.value = isWaiting ? 600 + Math.random() * 200 : 800 + Math.random() * 400;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(isWaiting ? 0.04 : 0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    } catch {}
  }, [isMuted]);

  const playWinSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const frequencies = [523, 659, 784, 1047];
      frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        const startTime = ctx.currentTime + i * 0.1;
        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch {}
  }, [isMuted]);

  const playLoseSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
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

  // Fetch current block
  useEffect(() => {
    const fetchBlock = async () => {
      if (!publicClient) return;
      try {
        const block = await publicClient.getBlockNumber();
        setCurrentBlock(Number(block));
      } catch {}
    };
    fetchBlock();
    const interval = setInterval(fetchBlock, 5000);
    return () => clearInterval(interval);
  }, [publicClient]);

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
    args: address ? [address, GLAZE_WHEEL_ADDRESS] : undefined,
  });

  // Read player spin IDs
  const { data: playerSpinIds, refetch: refetchSpins } = useReadContract({
    address: GLAZE_WHEEL_ADDRESS,
    abi: WHEEL_V5_ABI,
    functionName: "getPlayerSpins",
    args: address ? [address] : undefined,
  });

  // Auto-show approvals (only once per session)
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals && !hasShownApproval) {
      const timer = setTimeout(() => {
        setShowApprovals(true);
        setHasShownApproval(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals, hasShownApproval]);

  // Refetch on visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchBalance();
        refetchAllowance();
        refetchSpins();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchBalance, refetchAllowance, refetchSpins]);

  // Fetch spin details when history opens
  useEffect(() => {
    if (!showHistory || !playerSpinIds || !publicClient) return;
    
    const fetchSpinDetails = async () => {
      const spinIds = playerSpinIds as bigint[];
      if (!spinIds || spinIds.length === 0) {
        setRecentSpins([]);
        return;
      }
      
      // Only fetch last 5 to reduce RPC calls
      const idsToFetch = spinIds.slice(-5).reverse();
      const spins: OnchainSpin[] = [];
      
      for (const spinId of idsToFetch) {
        try {
          const spin = await publicClient.readContract({
            address: GLAZE_WHEEL_ADDRESS,
            abi: WHEEL_V5_ABI,
            functionName: "spins",
            args: [spinId],
          }) as [string, string, bigint, number, number, bigint, number, number, bigint, bigint];
          
          spins.push({
            player: spin[0] as `0x${string}`,
            token: spin[1] as `0x${string}`,
            amount: spin[2],
            riskLevel: spin[3],
            segments: spin[4],
            commitBlock: spin[5],
            status: spin[6],
            result: spin[7],
            multiplier: spin[8],
            payout: spin[9],
          });
          
          // Small delay between fetches to avoid rate limiting
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error("Error fetching spin:", spinId.toString(), e);
        }
      }
      
      setRecentSpins(spins);
    };
    
    fetchSpinDetails();
  }, [showHistory, playerSpinIds, publicClient]);

  // Contract writes
  const { data: startSpinHash, writeContract: writeStartSpin, isPending: isStartPending, reset: resetStartSpin, error: startError } = useWriteContract();
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startSpinHash });
  const { writeContract: writeClaim, isPending: isClaimPending } = useWriteContract();

  // Handle start spin error
  useEffect(() => {
    if (startError && isSpinning) {
      const msg = startError.message || "Spin failed";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setErrorMessage("Transaction cancelled");
      } else if (msg.includes("Insufficient contract balance") || msg.includes("Insufficient pool")) {
        setErrorMessage("Pool is empty - try a smaller bet");
      } else if (msg.includes("Token not supported")) {
        setErrorMessage("Token not enabled on contract");
      } else {
        setErrorMessage("Spin failed - try again");
      }
      setIsSpinning(false);
      setWheelRotation(0);
      resetStartSpin();
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [startError, isSpinning, resetStartSpin]);

  // Handle start spin success - poll for result
  useEffect(() => {
    if (isStartSuccess && isSpinning && startSpinHash) {
      console.log("Spin placed, polling for result...");
      
      const getSpinIdAndPoll = async () => {
        try {
          const receipt = await publicClient?.getTransactionReceipt({ hash: startSpinHash });
          
          const spinStartedLog = receipt?.logs.find(log => 
            log.address.toLowerCase() === GLAZE_WHEEL_ADDRESS.toLowerCase()
          );
          
          if (spinStartedLog && spinStartedLog.topics[1]) {
            const spinId = BigInt(spinStartedLog.topics[1]);
            const spinIdStr = spinId.toString();
            currentSpinIdRef.current = spinIdStr;
            console.log("Got spin ID:", spinIdStr);
            
            // Trigger reveal API
            try {
              await fetch('/api/reveal?game=wheel');
            } catch {}
            
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            // Poll for result - slower to reduce RPC calls
            const maxAttempts = 15;
            let attempts = 0;
            
            while (attempts < maxAttempts) {
              if (currentSpinIdRef.current !== spinIdStr) return;
              
              try {
                await fetch('/api/reveal?game=wheel');
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                const spin = await publicClient?.readContract({
                  address: GLAZE_WHEEL_ADDRESS,
                  abi: WHEEL_V5_ABI,
                  functionName: "getSpin",
                  args: [spinId],
                  blockTag: 'latest',
                }) as OnchainSpin;
                
                if (spin.status === 2) {
                  if (currentSpinIdRef.current !== spinIdStr) return;
                  
                  const resultSegment = spin.result;
                  const resultMult = Number(spin.multiplier);
                  const won = spin.payout > BigInt(0);
                  
                  // Animate wheel to result
                  const segmentAngle = 360 / segments;
                  const targetAngle = 360 - (resultSegment * segmentAngle) - (segmentAngle / 2);
                  const fullSpins = 5 * 360;
                  setWheelRotation(fullSpins + targetAngle);
                  
                  // Wait for animation
                  setTimeout(() => {
                    if (currentSpinIdRef.current !== spinIdStr) return;
                    
                    flushSync(() => {
                      setLastResult({
                        result: resultSegment,
                        multiplier: resultMult,
                        won: won,
                        payout: spin.payout
                      });
                      setIsSpinning(false);
                      setCooldown(true);
                    });
                    
                    setTimeout(() => setCooldown(false), 3000);
                    
if (won) {
  playWinSound();
  flushSync(() => setShowConfetti(true));
  try { sdk.haptics.impactOccurred("heavy"); } catch {}
  setTimeout(() => setShowConfetti(false), 3000);
  
  // Record win to database
  const formattedAmount = `${parseFloat(formatUnits(spin.payout, 18)).toFixed(2)} 🍩`;
  fetch('/api/games/record-win', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game: 'wheel',
      username: context?.user?.username || `${address?.slice(0, 6)}...${address?.slice(-4)}`,
      amount: formattedAmount,
      pfpUrl: context?.user?.pfpUrl,
      playerAddress: address,
    }),
  }).catch(() => {});
} else {
                      playLoseSound();
                      try { sdk.haptics.impactOccurred("heavy"); } catch {}
                    }
                    
                    refetchSpins();
                    refetchBalance();
                    currentSpinIdRef.current = null;
                  }, 5000);
                  
                  return;
                }
              } catch {}
              
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 4000));
            }
            
            setErrorMessage("Timeout - check history");
            setIsSpinning(false);
            setWheelRotation(0);
            currentSpinIdRef.current = null;
          }
        } catch (e) {
          console.error("Failed:", e);
          setIsSpinning(false);
          setWheelRotation(0);
        }
      };
      
      getSpinIdAndPoll();
    }
  }, [isStartSuccess, isSpinning, startSpinHash, publicClient, segments, refetchSpins, refetchBalance, playWinSound, playLoseSound]);

  const handleSpin = async () => {
    if (!isConnected || !address) return;
    if (isSpinning || isStartPending || cooldown) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 10) {
      setErrorMessage("Bet must be between 0.1 and 10");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Insufficient balance");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      setErrorMessage("Need approval - tap shield icon");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    currentSpinIdRef.current = null;
    setLastResult(null);
    setWheelRotation(0);
    setErrorMessage(null);
    setIsSpinning(true);
    
    writeStartSpin({
      address: GLAZE_WHEEL_ADDRESS,
      abi: WHEEL_V5_ABI,
      functionName: "startSpin",
      args: [DONUT_TOKEN_ADDRESS, amountWei, riskLevel, segments]
    });
  };

  const handleClaimExpired = (spinId: bigint) => {
    writeClaim({
      address: GLAZE_WHEEL_ADDRESS,
      abi: WHEEL_V5_ABI,
      functionName: "claimExpiredSpin",
      args: [spinId]
    }, {
      onSuccess: () => {
        refetchSpins();
        refetchBalance();
      }
    });
  };

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const maxMultiplier = Math.max(...multipliers) / 10000;

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 40px rgba(245, 158, 11, 0.6); }
        }
        @keyframes result-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .confetti { animation: confetti-fall 3s linear forwards; }
        .pulse-glow { animation: pulse-glow 1s ease-in-out infinite; }
        .result-pop { animation: result-pop 0.4s ease-out forwards; }
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
                fontSize: `${20 + (i % 3) * 8}px`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">GLAZE WHEEL</h1>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/30 animate-pulse">LIVE</span>
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
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">BALANCE</div>
            <div className="text-sm font-bold">🍩{balance.toFixed(0)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">RISK</div>
            <div className={cn(
              "text-sm font-bold",
              riskLevel === 0 ? "text-green-400" : riskLevel === 1 ? "text-amber-400" : "text-red-400"
            )}>
              {riskLevel === 0 ? "LOW" : riskLevel === 1 ? "MED" : "HIGH"}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MAX WIN</div>
            <div className="text-sm font-bold text-amber-400">{maxMultiplier.toFixed(1)}x</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-2">
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

        {/* Wheel & Result */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 relative overflow-hidden">
          <WheelDisplay
            segments={segments}
            multipliers={multipliers}
            rotation={wheelRotation}
            isSpinning={isSpinning}
            isWaiting={isSpinning && wheelRotation === 0}
            onTick={playTickSound}
            isMuted={isMuted}
          />
          
          {/* Result Display - Overlay on wheel */}
          {lastResult && !isSpinning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className={cn(
                "result-pop text-center px-6 py-4 rounded-2xl",
                lastResult.won 
                  ? "bg-green-500/90 border-2 border-green-400" 
                  : "bg-red-500/90 border-2 border-red-400"
              )}>
                <div className="text-3xl font-bold text-white mb-1">
                  {lastResult.won 
                    ? `${(lastResult.multiplier / 10000).toFixed(2)}x`
                    : "0x"
                  }
                </div>
                <div className="text-sm font-bold text-white/90">
                  {lastResult.won 
                    ? `+${parseFloat(formatUnits(lastResult.payout, 18)).toFixed(2)} 🍩`
                    : "Better luck next time!"
                  }
                </div>
              </div>
            </div>
          )}
          
          {/* Status text below wheel */}
          {isSpinning && wheelRotation === 0 && (
            <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for result...
            </div>
          )}
          
          {errorMessage && (
            <div className="mt-2 text-xs text-red-400">{errorMessage}</div>
          )}
          
          {/* Info text like dice page */}
          {!isSpinning && !lastResult && (
            <div className="text-center mt-2">
              <div className="text-[10px] text-gray-500">
                {riskLevel === 0 ? "Low" : riskLevel === 1 ? "Med" : "High"} Risk • {segments} Seg • Max {maxMultiplier.toFixed(1)}x
              </div>
            </div>
          )}
        </div>

        {/* Controls - Compact with expandable panels */}
        <div className="space-y-2 pb-1">
          {/* All controls in one row */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
            <div className="flex items-center gap-2">
              {/* Risk Level - compact button or expanded */}
              {expandedPanel === "risk" ? (
                <div className="flex-1 flex items-center gap-1">
                  {[0, 1, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRiskLevel(r);
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      disabled={isSpinning}
                      className={cn(
                        "flex-1 py-2 text-[10px] rounded font-bold border",
                        riskLevel === r
                          ? r === 0 ? "bg-green-500 text-black border-green-500" : r === 1 ? "bg-amber-500 text-black border-amber-500" : "bg-red-500 text-white border-red-500"
                          : "bg-zinc-800 text-gray-400 border-zinc-700"
                      )}
                    >
                      {r === 0 ? "LOW" : r === 1 ? "MED" : "HIGH"}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setExpandedPanel("risk");
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  disabled={isSpinning}
                  className={cn(
                    "w-12 h-12 rounded-lg flex flex-col items-center justify-center border",
                    riskLevel === 0 ? "bg-green-500/20 border-green-500/50 text-green-400" 
                      : riskLevel === 1 ? "bg-amber-500/20 border-amber-500/50 text-amber-400" 
                      : "bg-red-500/20 border-red-500/50 text-red-400"
                  )}
                >
                  <span className="text-[8px] text-gray-400">RISK</span>
                  <span className="text-[10px] font-bold">{riskLevel === 0 ? "LOW" : riskLevel === 1 ? "MED" : "HIGH"}</span>
                </button>
              )}

              {/* Segments - compact button or expanded */}
              {expandedPanel === "segments" ? (
                <div className="flex-1 flex items-center gap-1">
                  {[10, 20, 30].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSegments(s);
                        try { sdk.haptics.impactOccurred("light"); } catch {}
                      }}
                      disabled={isSpinning}
                      className={cn(
                        "flex-1 py-2 text-[10px] rounded font-bold border",
                        segments === s
                          ? "bg-amber-500 text-black border-amber-500"
                          : "bg-zinc-800 text-gray-400 border-zinc-700"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setExpandedPanel("segments");
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  disabled={isSpinning}
                  className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center"
                >
                  <span className="text-[8px] text-gray-400">SEG</span>
                  <span className="text-sm font-bold text-white">{segments}</span>
                </button>
              )}

              {/* Bet Amount - compact button or expanded */}
              {expandedPanel === "bet" ? (
                <div className="flex-1 flex items-center gap-1">
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
                            "flex-1 py-1.5 text-[10px] rounded border font-bold",
                            betAmount === val ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-800 text-gray-400 border-zinc-700"
                          )}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={betAmount}
                      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBetAmount(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-bold"
                      disabled={isSpinning}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setExpandedPanel("bet");
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  disabled={isSpinning}
                  className="flex-1 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center gap-2"
                >
                  <span className="text-[10px] text-gray-500">BET</span>
                  <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                  <span className="text-[10px] text-gray-500">🍩</span>
                </button>
              )}
            </div>
          </div>

          {/* Spin button - white like dice */}
          <button
            onClick={handleSpin}
            disabled={isSpinning || isStartPending || cooldown || !isConnected || parseFloat(betAmount || "0") <= 0}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-lg transition-all",
              isSpinning || isStartPending || cooldown ? "bg-zinc-500 text-zinc-300" : "bg-white text-black hover:bg-gray-100"
            )}
          >
            {isSpinning ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Spinning...
              </span>
            ) : isStartPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Confirm in wallet...
              </span>
            ) : cooldown && lastResult ? (
              <span className={lastResult.won ? "text-green-500" : "text-red-500"}>
                {lastResult.won ? `🎉 WON +${parseFloat(formatUnits(lastResult.payout, 18)).toFixed(2)} 🍩` : "Better luck next time!"}
              </span>
            ) : (
              "SPIN WHEEL"
            )}
          </button>
        </div>

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
                  <History className="w-4 h-4" /> Spin History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Tap any spin to verify. All results are provably fair.</p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {recentSpins.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No spins yet</p>
                  ) : (
                    recentSpins.map((spin, index) => {
                      const isPending = spin.status === 1;
                      const spinIds = playerSpinIds as bigint[] | undefined;
                      const spinId = spinIds ? spinIds[spinIds.length - 1 - index] : null;
                      const spinIdStr = spinId?.toString() || index.toString();
                      const isExpanded = expandedSpinId === spinIdStr;
                      const riskName = spin.riskLevel === 0 ? "Low" : spin.riskLevel === 1 ? "Med" : "High";
                      
                      if (isPending) {
                        const expiryBlock = Number(spin.commitBlock) + 256;
                        const blocksRemaining = Math.max(0, expiryBlock - currentBlock);
                        const isExpiredNow = currentBlock > 0 && blocksRemaining === 0;
                        const minutesRemaining = Math.ceil(blocksRemaining * 2 / 60);
                        
                        return (
                          <div key={index} className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                                <div>
                                  <span className="text-xs text-amber-400 font-bold">Waiting for reveal...</span>
                                  <div className="text-[9px] text-gray-500">{riskName} • {spin.segments} seg</div>
                                </div>
                              </div>
                              <div className="text-sm font-bold text-amber-400">
                                {parseFloat(formatUnits(spin.amount, 18)).toFixed(2)} 🍩
                              </div>
                            </div>
                            
                            {isExpiredNow && spinId ? (
                              <button
                                onClick={() => handleClaimExpired(spinId)}
                                disabled={isClaimPending}
                                className="w-full py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold mt-2 disabled:opacity-50"
                              >
                                {isClaimPending ? "Claiming..." : "Claim 98% Back"}
                              </button>
                            ) : (
                              <div className="mt-2 text-[9px] text-gray-500">
                                House should reveal soon. If not, claim back in ~{minutesRemaining} min.
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      const isWin = spin.payout > BigInt(0);
                      const multiplierDisplay = (Number(spin.multiplier) / 10000).toFixed(2);
                      
                      return (
                        <div 
                          key={index}
                          onClick={() => setExpandedSpinId(isExpanded ? null : spinIdStr)}
                          className={cn(
                            "p-2 rounded-lg border cursor-pointer transition-all", 
                            isWin ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20" : "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xl font-bold", isWin ? "text-green-400" : "text-red-400")}>
                                {multiplierDisplay}x
                              </span>
                              <div>
                                <span className="text-xs text-gray-400">{riskName} • {spin.segments} seg</span>
                                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                  Segment #{spin.result} <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
                                </div>
                              </div>
                            </div>
                            <div className={cn("text-sm font-bold", isWin ? "text-green-400" : "text-red-400")}>
                              {isWin 
                                ? `+${parseFloat(formatUnits(spin.payout, 18)).toFixed(2)}` 
                                : `-${parseFloat(formatUnits(spin.amount, 18)).toFixed(2)}`
                              } 🍩
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-3 p-2 bg-zinc-900/80 rounded-lg border border-zinc-700 space-y-2">
                              <div className="text-[10px] text-amber-400 font-bold">🔐 Verification Data</div>
                              
                              <div className="space-y-1 text-[9px] font-mono">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Spin ID:</span>
                                  <span className="text-white">{spinId?.toString() || "N/A"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Commit Block:</span>
                                  <span className="text-white">{spin.commitBlock.toString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Segments:</span>
                                  <span className="text-white">{spin.segments}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Result:</span>
                                  <span className={isWin ? "text-green-400" : "text-red-400"}>#{spin.result}</span>
                                </div>
                              </div>
                              
                              <div className="pt-2 border-t border-zinc-700">
                                <div className="text-[8px] text-amber-400/80 font-mono bg-zinc-800 p-1.5 rounded break-all">
                                  segment = keccak256(blockhash + spinId) % {spin.segments}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                
                <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

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
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Choose Risk Level</div>
                      <div className="text-[11px] text-gray-400">Low = frequent small wins. High = rare big jackpots.</div>
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
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Spin & Win!</div>
                      <div className="text-[11px] text-gray-400">One transaction - house reveals automatically!</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Fee Structure:</div>
                  <div className="text-[10px] text-gray-400">On Win: 2% edge (1% pool, 0.5% LP, 0.5% treasury)</div>
                  <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
                </div>
                
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
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
      </div>
      <NavBar />
    </main>
  );
}