"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { flushSync } from "react-dom";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target, Volume2, VolumeX } from "lucide-react";
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

// V5 ABI - simplified, no commit hash from user
const WHEEL_V5_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" }
    ],
    name: "placeSpin",
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
    name: "getPlayerSpinIds",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }, { name: "count", type: "uint256" }],
    name: "getPlayerRecentSpins",
    outputs: [{
      type: "tuple[]",
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
    inputs: [{ name: "token", type: "address" }],
    name: "getBalance",
    outputs: [{ type: "uint256" }],
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
    name: "SpinPlaced",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "spinId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "blockHash", type: "bytes32" },
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
  status: number; // 0=None, 1=Pending, 2=Revealed, 3=Expired
  result: number;
  multiplier: bigint;
  payout: bigint;
};

// Get multipliers for wheel config (client-side calculation matching contract)
const getWheelMultipliers = (riskLevel: number, segments: number): number[] => {
  const multipliers: number[] = [];
  
  for (let i = 0; i < segments; i++) {
    let mult = 0;
    
    if (segments === 10) {
      if (riskLevel === 0) {
        mult = i < 8 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 5 ? 20000 : 0;
      } else {
        mult = i === 0 ? 99000 : 0;
      }
    } else if (segments === 20) {
      if (riskLevel === 0) {
        mult = i < 16 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 10 ? 20000 : 0;
      } else {
        mult = i < 2 ? 99000 : 0;
      }
    } else if (segments === 30) {
      if (riskLevel === 0) {
        mult = i < 24 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 15 ? 20000 : 0;
      } else {
        mult = i < 2 ? 148500 : 0;
      }
    } else if (segments === 40) {
      if (riskLevel === 0) {
        mult = i < 32 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 20 ? 20000 : 0;
      } else {
        mult = i < 2 ? 198000 : 0;
      }
    } else if (segments === 50) {
      if (riskLevel === 0) {
        mult = i < 40 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 25 ? 20000 : 0;
      } else {
        mult = i === 0 ? 495000 : 0;
      }
    }
    
    multipliers.push(mult);
  }
  
  return multipliers;
};

// Get color for a multiplier
const getColorForMultiplier = (mult: number): string => {
  if (mult === 0) return "#27272a";
  if (mult >= 400000) return "#fbbf24";
  if (mult >= 100000) return "#ef4444";
  if (mult >= 50000) return "#8b5cf6";
  if (mult >= 30000) return "#3b82f6";
  if (mult >= 20000) return "#10b981";
  if (mult >= 15000) return "#f59e0b";
  return "#6b7280";
};

// Wheel component
function WheelDisplay({ 
  segments, 
  multipliers, 
  rotation, 
  isSpinning,
  result
}: { 
  segments: number;
  multipliers: number[];
  rotation: number;
  isSpinning: boolean;
  result: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [idleRotation, setIdleRotation] = useState(0);
  const [displayRotation, setDisplayRotation] = useState(0);
  
  // Idle rotation animation
  useEffect(() => {
    if (isSpinning) return;
    
    const interval = setInterval(() => {
      setIdleRotation(prev => (prev + 0.5) % 360);
    }, 16);
    
    return () => clearInterval(interval);
  }, [isSpinning]);
  
  useEffect(() => {
    if (isSpinning && rotation > 0) {
      setDisplayRotation(rotation);
    } else if (!isSpinning && rotation === 0) {
      setDisplayRotation(idleRotation);
    }
  }, [isSpinning, rotation, idleRotation]);
  
  useEffect(() => {
    if (!isSpinning && rotation === 0) {
      setDisplayRotation(idleRotation);
    }
  }, [idleRotation, isSpinning, rotation]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const size = canvas.width;
    const center = size / 2;
    const radius = size / 2 - 15;
    
    ctx.clearRect(0, 0, size, size);
    
    const anglePerSegment = (2 * Math.PI) / segments;
    
    for (let i = 0; i < segments; i++) {
      const startAngle = i * anglePerSegment - Math.PI / 2;
      const endAngle = startAngle + anglePerSegment;
      
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      
      ctx.fillStyle = getColorForMultiplier(multipliers[i]);
      ctx.fill();
      
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      if (segments <= 20) {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(startAngle + anglePerSegment / 2);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = multipliers[i] > 0 ? "#fff" : "#71717a";
        ctx.font = `bold ${segments <= 10 ? 14 : 10}px monospace`;
        const mult = multipliers[i] / 10000;
        ctx.fillText(mult > 0 ? `${mult}x` : "0", radius - 15, 0);
        ctx.restore();
      }
    }
    
    ctx.beginPath();
    ctx.arc(center, center, 25, 0, 2 * Math.PI);
    ctx.fillStyle = "#18181b";
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.stroke();
    
  }, [segments, multipliers, result]);
  
  return (
    <div className="relative">
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
        <div 
          className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-amber-500"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
      </div>
      <div 
        className={cn(
          isSpinning && rotation > 0 ? "transition-transform duration-[4000ms] ease-out" : "transition-none"
        )}
        style={{ transform: `rotate(${displayRotation}deg)` }}
      >
        <canvas 
          ref={canvasRef} 
          width={280} 
          height={280}
          className={cn(isSpinning && "drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]")}
        />
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
      .sort((a, b) => b.mult - a.mult);
  }, [multipliers]);
  
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {uniqueMults.map(({ mult, count }) => (
        <div 
          key={mult}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
          style={{ backgroundColor: `${getColorForMultiplier(mult)}30` }}
        >
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: getColorForMultiplier(mult) }}
          />
          <span className="text-white font-bold">{mult > 0 ? `${mult / 10000}x` : "0x"}</span>
          <span className="text-gray-400">×{count}</span>
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
                className="flex-1 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
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

          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex gap-2">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-400">
                When you run out of approval, tap the <span className="font-bold">shield icon</span> to add more.
              </p>
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
  const [segments, setSegments] = useState<number>(20);
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

  const playWinSound = () => {
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
  };

  const playLoseSound = () => {
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
  };

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

  // Read recent spins
  const { data: recentSpins, refetch: refetchSpins } = useReadContract({
    address: GLAZE_WHEEL_ADDRESS,
    abi: WHEEL_V5_ABI,
    functionName: "getPlayerRecentSpins",
    args: address ? [address, BigInt(20)] : undefined,
  });

  // Read spin IDs
  const { data: playerSpinIds } = useReadContract({
    address: GLAZE_WHEEL_ADDRESS,
    abi: WHEEL_V5_ABI,
    functionName: "getPlayerSpinIds",
    args: address ? [address] : undefined,
  });

  // Auto-show approvals
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals) {
      const timer = setTimeout(() => setShowApprovals(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals]);

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

  // Contract writes
  const { data: placeSpinHash, writeContract: writePlaceSpin, isPending: isPlacePending, reset: resetPlaceSpin, error: placeError } = useWriteContract();
  const { isSuccess: isPlaceSuccess } = useWaitForTransactionReceipt({ hash: placeSpinHash });
  const { writeContract: writeClaim, isPending: isClaimPending } = useWriteContract();

  // Handle place spin error
  useEffect(() => {
    if (placeError && isSpinning) {
      const msg = placeError.message || "Spin failed";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setErrorMessage("Transaction cancelled");
      } else if (msg.includes("Insufficient contract balance")) {
        setErrorMessage("Pool is empty - try a smaller bet");
      } else {
        setErrorMessage("Spin failed - try again");
      }
      setIsSpinning(false);
      setWheelRotation(0);
      resetPlaceSpin();
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [placeError, isSpinning, resetPlaceSpin]);

  // Handle place spin success - start polling
  useEffect(() => {
    if (isPlaceSuccess && isSpinning && placeSpinHash) {
      console.log("Spin placed, starting to poll for result...");
      
      const getSpinIdAndPoll = async () => {
        try {
          const receipt = await publicClient?.getTransactionReceipt({ hash: placeSpinHash });
          
          const spinPlacedLog = receipt?.logs.find(log => 
            log.address.toLowerCase() === GLAZE_WHEEL_ADDRESS.toLowerCase()
          );
          
          if (spinPlacedLog && spinPlacedLog.topics[1]) {
            const spinId = BigInt(spinPlacedLog.topics[1]);
            const spinIdStr = spinId.toString();
            currentSpinIdRef.current = spinIdStr;
            console.log("Got spin ID:", spinIdStr);
            
            // Trigger reveal API
            try {
              console.log("Calling reveal API...");
              const response = await fetch('/api/reveal?game=wheel');
              const data = await response.json();
              console.log("Reveal API response:", data);
            } catch (e) {
              console.log("Reveal API call failed:", e);
            }
            
            // Wait before polling
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Poll for result
            const pollForResult = async () => {
              const maxAttempts = 30;
              let attempts = 0;
              
              while (attempts < maxAttempts) {
                if (currentSpinIdRef.current !== spinIdStr) {
                  console.log("Spin ID changed, stopping poll");
                  return;
                }
                
                try {
                  console.log(`Poll attempt ${attempts + 1}...`);
                  
                  // Call reveal API again
                  try {
                    await fetch('/api/reveal?game=wheel');
                  } catch {}
                  
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  
                  const spin = await publicClient?.readContract({
                    address: GLAZE_WHEEL_ADDRESS,
                    abi: WHEEL_V5_ABI,
                    functionName: "getSpin",
                    args: [spinId],
                    blockTag: 'latest',
                  }) as OnchainSpin;
                  
                  console.log("Spin status:", spin.status, "result:", spin.result);
                  
                  if (spin.status === 2) {
                    if (currentSpinIdRef.current !== spinIdStr) return;
                    
                    const resultSegment = spin.result;
                    const resultMult = Number(spin.multiplier);
                    const won = spin.payout > BigInt(0);
                    
                    console.log("Spin revealed! Result:", resultSegment, "Multiplier:", resultMult, "Won:", won);
                    
                    // Calculate wheel rotation to land on result
                    const segmentAngle = 360 / segments;
                    const targetAngle = 360 - (resultSegment * segmentAngle) - (segmentAngle / 2);
                    const fullSpins = 5 * 360;
                    const finalRotation = fullSpins + targetAngle;
                    
                    setWheelRotation(finalRotation);
                    
                    // Wait for animation then show result
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
                      } else {
                        playLoseSound();
                        try { sdk.haptics.impactOccurred("heavy"); } catch {}
                      }
                      
                      refetchSpins();
                      refetchBalance();
                      currentSpinIdRef.current = null;
                    }, 4000);
                    
                    return;
                  }
                } catch (e) {
                  console.log("Poll error:", e);
                }
                
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              // Timeout
              setErrorMessage("Waiting for reveal... check history");
              setIsSpinning(false);
              setWheelRotation(0);
              currentSpinIdRef.current = null;
            };
            
            pollForResult();
          }
        } catch (e) {
          console.error("Failed to get spinId:", e);
          setIsSpinning(false);
          setWheelRotation(0);
        }
      };
      
      getSpinIdAndPoll();
    }
  }, [isPlaceSuccess, isSpinning, placeSpinHash, publicClient, segments, refetchSpins, refetchBalance]);

  const handleSpin = async () => {
    if (!isConnected || !address) return;
    if (isSpinning || isPlacePending || cooldown) return;
    
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

    // Reset state
    currentSpinIdRef.current = null;
    setLastResult(null);
    setWheelRotation(0);
    setErrorMessage(null);
    setIsSpinning(true);
    
    writePlaceSpin({
      address: GLAZE_WHEEL_ADDRESS,
      abi: WHEEL_V5_ABI,
      functionName: "placeSpin",
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
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${(i * 37 + 13) % 100}%`,
                top: '-60px',
                animationDelay: `${(i * 0.07) % 1}s`,
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
            <h1 className="text-xl font-bold">Glaze Wheel</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 animate-pulse">LIVE</span>
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
            <div className="text-sm font-bold text-white">
              {riskLevel === 0 ? "LOW" : riskLevel === 1 ? "MED" : "HIGH"}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MAX WIN</div>
            <div className="text-sm font-bold text-amber-400">{maxMultiplier}x</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={cn(
              "p-2 rounded-lg border",
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

        {/* Wheel */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <WheelDisplay
            segments={segments}
            multipliers={multipliers}
            rotation={wheelRotation}
            isSpinning={isSpinning}
            result={lastResult?.result ?? null}
          />
          
          {/* Result Display */}
          {lastResult && !isSpinning && (
            <div className="mt-4 text-center">
              <div className={cn(
                "text-2xl font-bold",
                lastResult.won ? "text-green-400" : "text-red-400"
              )}>
                {lastResult.won 
                  ? `🎉 ${(lastResult.multiplier / 10000).toFixed(2)}x WIN!`
                  : "💥 NO WIN"
                }
              </div>
              {lastResult.won && (
                <div className="text-lg text-amber-400 font-bold">
                  +{parseFloat(formatUnits(lastResult.payout, 18)).toFixed(4)} 🍩
                </div>
              )}
            </div>
          )}
          
          {/* Status */}
          {isSpinning && (
            <div className="mt-4 text-amber-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {wheelRotation > 0 ? "Revealing..." : "Waiting for result..."}
            </div>
          )}
          
          {errorMessage && (
            <div className="mt-2 text-xs text-red-400">{errorMessage}</div>
          )}
          
          {/* Multiplier Legend */}
          <div className="mt-3 w-full max-w-[320px]">
            <MultiplierLegend multipliers={multipliers} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 space-y-2">
          {/* Risk & Segments */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="text-[8px] text-gray-500 uppercase mb-1 text-center">Risk Level</div>
              <div className="flex gap-1">
                {[0, 1, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskLevel(r)}
                    disabled={isSpinning}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] rounded font-bold transition-colors",
                      riskLevel === r
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                    )}
                  >
                    {r === 0 ? "LOW" : r === 1 ? "MED" : "HIGH"}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="text-[8px] text-gray-500 uppercase mb-1 text-center">Segments</div>
              <div className="flex gap-1">
                {[10, 20, 30].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSegments(s)}
                    disabled={isSpinning}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] rounded font-bold transition-colors",
                      segments === s
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bet Amount & Spin Button */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
            <div className="flex items-center gap-2 h-12">
              <div className="flex gap-1">
                {["0.5", "1", "2"].map((val) => (
                  <button
                    key={val}
                    onClick={() => setBetAmount(val)}
                    disabled={isSpinning}
                    className={cn(
                      "px-2 py-1.5 text-[10px] rounded font-bold transition-colors",
                      betAmount === val
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-800 text-gray-400"
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
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                    setBetAmount(val);
                  }
                }}
                className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-center text-sm font-bold"
                disabled={isSpinning}
              />
              
              <button
                onClick={handleSpin}
                disabled={isSpinning || isPlacePending || cooldown || !isConnected || parseFloat(betAmount || "0") <= 0}
                className={cn(
                  "flex-1 h-12 rounded-xl font-bold text-base transition-all",
                  isSpinning || isPlacePending || cooldown ? "bg-zinc-500 text-zinc-300" : "bg-amber-500 text-black hover:bg-amber-400"
                )}
              >
                {isSpinning ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : isPlacePending ? (
                  "Confirm..."
                ) : cooldown && lastResult ? (
                  <span className={lastResult.won ? "text-green-400" : "text-red-400"}>
                    {lastResult.won ? `🎉 +${parseFloat(formatUnits(lastResult.payout, 18)).toFixed(2)}` : "Try again!"}
                  </span>
                ) : (
                  "SPIN"
                )}
              </button>
            </div>
          </div>
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
                <p className="text-[10px] text-gray-500 mb-3">All spins are provably fair. House reveals automatically.</p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {!recentSpins || (recentSpins as OnchainSpin[]).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No spins yet</p>
                  ) : (
                    (recentSpins as OnchainSpin[]).map((spin, index) => {
                      const isPending = spin.status === 1;
                      const spinIds = playerSpinIds as bigint[] | undefined;
                      const spinId = spinIds ? spinIds[spinIds.length - 1 - index] : null;
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
                            
                            {isExpiredNow && spinId && (
                              <button
                                onClick={() => handleClaimExpired(spinId)}
                                disabled={isClaimPending}
                                className="w-full py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold mt-2 disabled:opacity-50"
                              >
                                {isClaimPending ? "Claiming..." : "Claim 98% Back"}
                              </button>
                            )}
                            
                            {!isExpiredNow && (
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
                          className={cn(
                            "p-2 rounded-lg border", 
                            isWin ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xl font-bold", isWin ? "text-green-400" : "text-red-400")}>
                                {multiplierDisplay}x
                              </span>
                              <div>
                                <span className="text-xs text-gray-400">{riskName} • {spin.segments} seg</span>
                                <div className="text-[9px] text-gray-600">Segment #{spin.result}</div>
                              </div>
                            </div>
                            <div className={cn("text-sm font-bold", isWin ? "text-green-400" : "text-red-400")}>
                              {isWin 
                                ? `+${parseFloat(formatUnits(spin.payout, 18)).toFixed(2)}` 
                                : `-${parseFloat(formatUnits(spin.amount, 18)).toFixed(2)}`
                              } 🍩
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[9px] text-gray-500 text-center">
                    Result = keccak256(blockhash + spinId) % segments
                  </p>
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
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Choose Risk & Segments</div>
                      <div className="text-[11px] text-gray-400">Higher risk = bigger wins but fewer winning segments.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Set Your Bet</div>
                      <div className="text-[11px] text-gray-400">Choose how much DONUT to wager.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Spin & Wait</div>
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