"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked, decodeEventLog, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const GLAZE_WHEEL_ADDRESS = "0x82296c4Fc7B24bF1Fc87d2E2A1D9600F2028BA32" as const;
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;

// Create a public client for direct RPC calls
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g'),
});

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

const WHEEL_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" },
      { name: "commitHash", type: "bytes32" }
    ],
    name: "startSpin",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "spinId", type: "uint256" },
      { name: "secret", type: "bytes32" }
    ],
    name: "revealSpin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "claimExpired",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPendingSpins",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "getSpin",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "commitBlock", type: "uint256" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" },
      { name: "result", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "payout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "riskLevel", type: "uint8" }, { name: "segments", type: "uint8" }],
    name: "getWheelConfig",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "pure",
    type: "function"
  },
  {
    inputs: [{ name: "spinId", type: "uint256" }],
    name: "spins",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "commitBlock", type: "uint256" },
      { name: "commitHash", type: "bytes32" },
      { name: "revealedSecret", type: "bytes32" },
      { name: "riskLevel", type: "uint8" },
      { name: "segments", type: "uint8" },
      { name: "result", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "payout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  // Events for parsing
  {
    type: "event",
    name: "SpinRevealed",
    inputs: [
      { name: "spinId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "result", type: "uint8", indexed: false },
      { name: "multiplier", type: "uint256", indexed: false },
      { name: "payout", type: "uint256", indexed: false }
    ]
  }
] as const;

// Local storage keys
const SPIN_SECRETS_KEY = "glaze-wheel-secrets";
const SEEN_APPROVAL_KEY = "glaze-wheel-seen-approval";

// Save spin secret to localStorage
const saveSpinSecret = (spinId: string, secret: string) => {
  try {
    const secrets = JSON.parse(localStorage.getItem(SPIN_SECRETS_KEY) || "{}");
    secrets[spinId] = secret;
    localStorage.setItem(SPIN_SECRETS_KEY, JSON.stringify(secrets));
  } catch {}
};

// Get spin secret from localStorage
const getSpinSecret = (spinId: string): `0x${string}` | null => {
  try {
    const secrets = JSON.parse(localStorage.getItem(SPIN_SECRETS_KEY) || "{}");
    return secrets[spinId] || null;
  } catch {
    return null;
  }
};

// Generate a random bytes32 secret
const generateSecret = (): `0x${string}` => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
};

// Hash the secret - must match Solidity's keccak256(abi.encodePacked(secret))
const hashSecret = (secret: `0x${string}`): `0x${string}` => {
  // abi.encodePacked(bytes32) just returns the 32 bytes
  // We use encodePacked which handles this correctly
  return keccak256(encodePacked(['bytes32'], [secret]));
};

// Wheel segment colors
const SEGMENT_COLORS = [
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#10b981", // green
  "#ec4899", // pink
  "#f97316", // orange
  "#06b6d4", // cyan
];

// Get multipliers for wheel config (client-side calculation matching contract V2)
// Fair multipliers with ~98% RTP (2% house edge)
const getWheelMultipliers = (riskLevel: number, segments: number): number[] => {
  const multipliers: number[] = [];
  
  for (let i = 0; i < segments; i++) {
    let mult = 0;
    
    if (segments === 10) {
      // Low: 8 win at 1.25x, Med: 5 win at 2x, High: 1 win at 9.9x
      if (riskLevel === 0) {
        mult = i < 8 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 5 ? 20000 : 0;
      } else {
        mult = i === 0 ? 99000 : 0;
      }
    } else if (segments === 20) {
      // Low: 16 win at 1.25x, Med: 10 win at 2x, High: 2 win at 9.9x
      if (riskLevel === 0) {
        mult = i < 16 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 10 ? 20000 : 0;
      } else {
        mult = i < 2 ? 99000 : 0;
      }
    } else if (segments === 30) {
      // Low: 24 win at 1.25x, Med: 15 win at 2x, High: 2 win at 14.85x
      if (riskLevel === 0) {
        mult = i < 24 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 15 ? 20000 : 0;
      } else {
        mult = i < 2 ? 148500 : 0;
      }
    } else if (segments === 40) {
      // Low: 32 win at 1.25x, Med: 20 win at 2x, High: 2 win at 19.8x
      if (riskLevel === 0) {
        mult = i < 32 ? 12500 : 0;
      } else if (riskLevel === 1) {
        mult = i < 20 ? 20000 : 0;
      } else {
        mult = i < 2 ? 198000 : 0;
      }
    } else if (segments === 50) {
      // Low: 40 win at 1.25x, Med: 25 win at 2x, High: 1 win at 49.5x
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
  if (mult === 0) return "#27272a"; // zinc-800 for losing
  if (mult >= 400000) return "#fbbf24"; // gold for jackpot
  if (mult >= 100000) return "#ef4444"; // red for big wins
  if (mult >= 50000) return "#8b5cf6"; // purple
  if (mult >= 30000) return "#3b82f6"; // blue
  if (mult >= 20000) return "#10b981"; // green
  if (mult >= 15000) return "#f59e0b"; // amber
  return "#6b7280"; // gray for small
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
  
  // Idle rotation animation - slow constant spin when not spinning
  useEffect(() => {
    if (isSpinning) return;
    
    const interval = setInterval(() => {
      setIdleRotation(prev => (prev + 0.5) % 360);
    }, 16);
    
    return () => clearInterval(interval);
  }, [isSpinning]);
  
  // Handle rotation - use idle when not spinning, animated spin when spinning
  useEffect(() => {
    if (isSpinning && rotation > 0) {
      // When spinning, animate to the target rotation
      setDisplayRotation(rotation);
    } else if (!isSpinning && rotation === 0) {
      // Reset to idle rotation when spin ends
      setDisplayRotation(idleRotation);
    }
  }, [isSpinning, rotation, idleRotation]);
  
  // For idle, update display rotation
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
    const radius = size / 2 - 15; // Slightly smaller to make room for pointer
    
    // Clear
    ctx.clearRect(0, 0, size, size);
    
    // Draw segments (canvas doesn't rotate - we use CSS transform)
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
      
      // Segment border
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw multiplier text for larger segments
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
    
    // Draw center circle
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
      {/* Pointer - fixed at top */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
        <div 
          className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-amber-500"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
      </div>
      {/* Wheel canvas with rotation */}
      <div 
        className={cn(
          isSpinning && rotation > 0 ? "transition-transform duration-[4000ms] ease-out" : "transition-none"
        )}
        style={{ 
          transform: `rotate(${displayRotation}deg)`,
        }}
      >
        <canvas 
          ref={canvasRef} 
          width={280} 
          height={280}
          className={cn(
            isSpinning && "drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]"
          )}
        />
      </div>
    </div>
  );
}

// Multiplier legend
function MultiplierLegend({ multipliers }: { multipliers: number[] }) {
  // Get unique multipliers and their counts
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

type PendingSpin = {
  secret: `0x${string}`;
  commitHash: `0x${string}`;
  spinId: bigint | null;
  riskLevel: number;
  segments: number;
  amount: string;
};

type SpinHistoryItem = {
  spinId: bigint;
  betAmount: bigint;
  riskLevel: number;
  segments: number;
  commitBlock: bigint;
  status: 'pending' | 'won' | 'lost';
  result?: number;
  multiplier?: number;
  payout?: bigint;
  revealedSecret?: `0x${string}`;
  blockHash?: `0x${string}`;
};

export default function GlazeWheelPage() {
  const readyRef = useRef(false);
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [riskLevel, setRiskLevel] = useState<number>(1); // 0=Low, 1=Medium, 2=High
  const [segments, setSegments] = useState<number>(20);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [customApprovalAmount, setCustomApprovalAmount] = useState<string>("");
  const [pendingSpin, setPendingSpin] = useState<PendingSpin | null>(null);
  const [gameStep, setGameStep] = useState<"idle" | "starting" | "spinning" | "revealing">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiData, setConfettiData] = useState<Array<{left: number, size: number, delay: number, duration: number}>>([]);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<{ segment: number; multiplier: number; payout: number } | null>(null);
  const [currentSpinId, setCurrentSpinId] = useState<bigint | null>(null);
  const [spinHistory, setSpinHistory] = useState<SpinHistoryItem[]>([]);
  const [currentBlock, setCurrentBlock] = useState<bigint>(BigInt(0));
  const [expandedSpinId, setExpandedSpinId] = useState<string | null>(null);
  const [hasSeenApprovalModal, setHasSeenApprovalModal] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SEEN_APPROVAL_KEY) === 'true';
  });

  const { address, isConnected } = useAccount();
  
  // Get wheel multipliers
  const multipliers = useMemo(() => getWheelMultipliers(riskLevel, segments), [riskLevel, segments]);

  // Generate confetti data
  useEffect(() => {
    if (showConfetti) {
      const data = Array.from({ length: 40 }, () => ({
        left: Math.random() * 100,
        size: 18 + Math.random() * 24,
        delay: Math.random() * 1.5,
        duration: 3 + Math.random() * 2,
      }));
      setConfettiData(data);
    }
  }, [showConfetti]);

  // Load Farcaster context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // Notify Farcaster ready
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
    args: address ? [address, GLAZE_WHEEL_ADDRESS] : undefined,
  });

  // Read pending spins
  const { data: pendingSpinIds, refetch: refetchPendingSpins } = useReadContract({
    address: GLAZE_WHEEL_ADDRESS,
    abi: WHEEL_ABI,
    functionName: "getPendingSpins",
    args: address ? [address] : undefined,
  });

  const allPendingSpinIds = (pendingSpinIds as bigint[]) || [];

  // Refetch on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchBalance();
        refetchAllowance();
        refetchPendingSpins();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchBalance, refetchAllowance, refetchPendingSpins]);

  // Fetch spin history from events when history modal opens
  useEffect(() => {
    if (!showHistory || !address) return;
    
    const fetchHistory = async () => {
      try {
        const block = await publicClient.getBlockNumber();
        setCurrentBlock(block);
        
        // Look back ~3 hours (5400 blocks)
        const fromBlock = block > 5400n ? block - 5400n : 0n;
        
        // Fetch SpinRevealed events for this user
        const revealedLogs = await publicClient.getLogs({
          address: GLAZE_WHEEL_ADDRESS,
          event: {
            type: 'event',
            name: 'SpinRevealed',
            inputs: [
              { type: 'uint256', name: 'spinId', indexed: true },
              { type: 'address', name: 'player', indexed: true },
              { type: 'uint8', name: 'result', indexed: false },
              { type: 'uint256', name: 'multiplier', indexed: false },
              { type: 'uint256', name: 'payout', indexed: false }
            ]
          },
          args: { player: address },
          fromBlock,
          toBlock: 'latest'
        });
        
        // Build history items from completed spins
        const completedSpins: SpinHistoryItem[] = [];
        
        for (const log of revealedLogs) {
          const spinId = log.args.spinId as bigint;
          const result = log.args.result as number;
          const multiplier = Number(log.args.multiplier as bigint);
          const payout = log.args.payout as bigint;
          
          // Fetch spin details
          try {
            const spinData = await publicClient.readContract({
              address: GLAZE_WHEEL_ADDRESS,
              abi: WHEEL_ABI,
              functionName: 'spins',
              args: [spinId],
            }) as [string, string, bigint, bigint, `0x${string}`, `0x${string}`, number, number, number, number, bigint];
            
            // Get block hash for verification
            let blockHash: `0x${string}` | undefined;
            try {
              const blockData = await publicClient.getBlock({ blockNumber: spinData[3] });
              blockHash = blockData.hash;
            } catch {}
            
            completedSpins.push({
              spinId,
              betAmount: spinData[2],
              riskLevel: spinData[6],
              segments: spinData[7],
              commitBlock: spinData[3],
              status: payout > 0n ? 'won' : 'lost',
              result,
              multiplier,
              payout,
              revealedSecret: spinData[5],
              blockHash
            });
          } catch {}
        }
        
        // Fetch pending spin details
        const pendingIds = allPendingSpinIds || [];
        const pendingSpins: SpinHistoryItem[] = [];
        
        for (const spinId of pendingIds) {
          try {
            const spinData = await publicClient.readContract({
              address: GLAZE_WHEEL_ADDRESS,
              abi: WHEEL_ABI,
              functionName: 'spins',
              args: [spinId],
            }) as [string, string, bigint, bigint, `0x${string}`, `0x${string}`, number, number, number, number, bigint];
            
            pendingSpins.push({
              spinId,
              betAmount: spinData[2],
              riskLevel: spinData[6],
              segments: spinData[7],
              commitBlock: spinData[3],
              status: 'pending'
            });
          } catch {}
        }
        
        // Combine and sort by spinId desc
        const allHistory = [...pendingSpins, ...completedSpins].sort((a, b) => 
          Number(b.spinId - a.spinId)
        );
        
        setSpinHistory(allHistory);
      } catch (e) {
        console.error("Error fetching history:", e);
      }
    };
    
    fetchHistory();
  }, [showHistory, address, allPendingSpinIds]);

  // Auto-show approvals modal
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals && !hasSeenApprovalModal) {
      const timer = setTimeout(() => {
        setShowApprovals(true);
        setHasSeenApprovalModal(true);
        localStorage.setItem(SEEN_APPROVAL_KEY, 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals, hasSeenApprovalModal]);

  // Write contracts
  const { 
    writeContract: writeApprove, 
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove
  } = useWriteContract();

  const { 
    writeContract: writeStartSpin, 
    data: startHash,
    isPending: isStartPending,
    error: startError,
    reset: resetStart
  } = useWriteContract();

  const { 
    writeContract: writeRevealSpin, 
    data: revealHash,
    isPending: isRevealPending,
    error: revealError,
    reset: resetReveal
  } = useWriteContract();

  const { 
    writeContract: writeClaimExpired, 
    isPending: isClaimPending,
    error: claimExpiredError
  } = useWriteContract();

  // Transaction receipts
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: isStartSuccess } = useWaitForTransactionReceipt({ hash: startHash });
  const { isSuccess: isRevealSuccess, data: revealReceipt } = useWaitForTransactionReceipt({ hash: revealHash });

  // Handle errors
  useEffect(() => {
    const error = approveError || startError || revealError || claimExpiredError;
    if (error) {
      const msg = error.message || "";
      let displayMsg = "Transaction failed";
      
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        displayMsg = "Try again, transaction failed";
      } else if (msg.includes("insufficient") || msg.includes("Insufficient")) {
        displayMsg = "Insufficient balance";
      } else if (msg.includes("Insufficient pool")) {
        displayMsg = "Pool empty - try smaller bet";
      } else if (msg.includes("Already revealed")) {
        displayMsg = "Spin already revealed";
      } else if (msg.includes("Expired")) {
        displayMsg = "Spin expired - claim refund in history";
      }
      
      setErrorMessage(displayMsg);
      setGameStep("idle");
      setIsSpinning(false);
      setPendingSpin(null);
      setCurrentSpinId(null);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [approveError, startError, revealError, claimExpiredError]);

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      resetApprove();
      refetchAllowance();
      try { sdk.haptics.notificationOccurred("success"); } catch {}
    }
  }, [isApproveSuccess, resetApprove, refetchAllowance]);

  // Handle start spin success
  useEffect(() => {
    if (isStartSuccess && gameStep === "starting" && pendingSpin) {
      resetStart();
      setGameStep("spinning");
      
      // Start the wheel spinning fast
      setIsSpinning(true);
      
      // Function to wait for next block and get block hash
      const waitForNextBlockAndGetHash = async (commitBlock: bigint): Promise<`0x${string}` | null> => {
        let currentBlock = await publicClient.getBlockNumber();
        let attempts = 0;
        while (currentBlock <= commitBlock && attempts < 30) {
          console.log("Waiting for next block... current:", currentBlock.toString(), "commit:", commitBlock.toString());
          await new Promise(resolve => setTimeout(resolve, 500));
          currentBlock = await publicClient.getBlockNumber();
          attempts++;
        }
        
        // Get the block hash of the commit block
        try {
          const block = await publicClient.getBlock({ blockNumber: commitBlock });
          return block.hash;
        } catch (e) {
          console.error("Error getting block hash:", e);
          return null;
        }
      };
      
      // Function to fetch spin with retries using direct RPC
      const fetchSpinWithRetries = async (retriesLeft: number): Promise<{ spinId: bigint; commitBlock: bigint } | null> => {
        try {
          const ids = await publicClient.readContract({
            address: GLAZE_WHEEL_ADDRESS,
            abi: WHEEL_ABI,
            functionName: 'getPendingSpins',
            args: [address as `0x${string}`],
          }) as bigint[];
          
          console.log("Fetched pending spins:", ids.length, ids.map(id => id.toString()));
          
          if (ids && ids.length > 0) {
            for (let i = ids.length - 1; i >= 0; i--) {
              const spinId = ids[i];
              try {
                const spinData = await publicClient.readContract({
                  address: GLAZE_WHEEL_ADDRESS,
                  abi: WHEEL_ABI,
                  functionName: 'spins',
                  args: [spinId],
                }) as [string, string, bigint, bigint, `0x${string}`, `0x${string}`, number, number, number, number, bigint];
                
                const onChainCommitHash = spinData[4];
                const commitBlock = spinData[3];
                
                if (onChainCommitHash.toLowerCase() === pendingSpin.commitHash.toLowerCase()) {
                  console.log("Found matching spin:", spinId.toString());
                  return { spinId, commitBlock };
                }
              } catch (e) {
                console.error("Error reading spin data:", e);
              }
            }
          }
          
          if (retriesLeft > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchSpinWithRetries(retriesLeft - 1);
          }
          
          return null;
        } catch (e) {
          console.error("Error fetching spins:", e);
          if (retriesLeft > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchSpinWithRetries(retriesLeft - 1);
          }
          return null;
        }
      };
      
      // Pre-calculate result (same as contract logic)
      const calculateResult = (blockHash: `0x${string}`, secret: `0x${string}`, spinId: bigint, numSegments: number): number => {
        const packed = encodePacked(
          ['bytes32', 'bytes32', 'uint256'],
          [blockHash, secret, spinId]
        );
        const seed = keccak256(packed);
        const seedNum = BigInt(seed);
        return Number(seedNum % BigInt(numSegments));
      };
      
      // Main flow
      setTimeout(async () => {
        if (pendingSpin.secret && address) {
          try {
            const result = await fetchSpinWithRetries(5);
            
            if (result) {
              const { spinId, commitBlock } = result;
              setCurrentSpinId(spinId);
              saveSpinSecret(spinId.toString(), pendingSpin.secret);
              
              // Wait for next block and get block hash
              console.log("Waiting for block after commit block", commitBlock.toString());
              const blockHash = await waitForNextBlockAndGetHash(commitBlock);
              
              if (!blockHash) {
                setErrorMessage("Could not get block hash");
                setGameStep("idle");
                setIsSpinning(false);
                setPendingSpin(null);
                return;
              }
              
              // Pre-calculate the result
              const resultSegment = calculateResult(blockHash, pendingSpin.secret, spinId, pendingSpin.segments);
              const resultMult = multipliers[resultSegment];
              console.log("Pre-calculated result:", resultSegment, "multiplier:", resultMult);
              
              // Calculate wheel rotation to land on result
              const segmentAngle = 360 / pendingSpin.segments;
              const targetAngle = 360 - (resultSegment * segmentAngle) - (segmentAngle / 2);
              const fullSpins = 5 * 360;
              const finalRotation = fullSpins + targetAngle;
              
              // Animate the wheel
              setWheelRotation(finalRotation);
              
              // After animation completes, prompt for reveal
              setTimeout(() => {
                setIsSpinning(false);
                
                // Calculate expected payout for display
                const betAmount = parseFloat(pendingSpin.amount);
                const expectedPayout = resultMult > 0 
                  ? betAmount * (resultMult / 10000) * 0.98 
                  : 0;
                
                // Show pre-result
                setSpinResult({
                  segment: resultSegment,
                  multiplier: resultMult,
                  payout: expectedPayout
                });
                
                if (expectedPayout > 0) {
                  setShowConfetti(true);
                  setTimeout(() => setShowConfetti(false), 5000);
                  try { sdk.haptics.impactOccurred("heavy"); } catch {}
                } else {
                  try { sdk.haptics.impactOccurred("heavy"); } catch {}
                }
                
                // Now send the reveal transaction
                console.log("Animation complete, revealing spin", spinId.toString());
                setGameStep("revealing");
                writeRevealSpin({
                  address: GLAZE_WHEEL_ADDRESS,
                  abi: WHEEL_ABI,
                  functionName: "revealSpin",
                  args: [spinId, pendingSpin.secret]
                });
              }, 4000);
              
            } else {
              setErrorMessage("Spin not found, check history");
              setGameStep("idle");
              setIsSpinning(false);
              setPendingSpin(null);
            }
          } catch (e) {
            console.error("Error:", e);
            setErrorMessage("Error processing spin");
            setGameStep("idle");
            setIsSpinning(false);
            setPendingSpin(null);
          }
        }
      }, 1000);
      
      try { sdk.haptics.impactOccurred("medium"); } catch {}
    }
  }, [isStartSuccess, gameStep, pendingSpin, address, multipliers, resetStart, writeRevealSpin]);

  // Handle reveal success - just cleanup, animation already happened
  useEffect(() => {
    if (isRevealSuccess && revealReceipt && gameStep === "revealing") {
      resetReveal();
      
      // Parse actual payout from event to update display if different
      try {
        for (const log of revealReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: WHEEL_ABI,
              data: log.data,
              topics: log.topics,
            });
            
            if (decoded.eventName === "SpinRevealed") {
              const args = decoded.args as { result: number; multiplier: bigint; payout: bigint };
              const actualPayout = parseFloat(formatUnits(args.payout, 18));
              
              // Update with actual payout from contract
              setSpinResult(prev => prev ? {
                ...prev,
                payout: actualPayout
              } : null);
              
              console.log("Reveal confirmed, actual payout:", actualPayout);
              break;
            }
          } catch {
            // Not the event we're looking for
          }
        }
      } catch (e) {
        console.error("Error parsing reveal event:", e);
      }
      
      // Cleanup
      setGameStep("idle");
      setPendingSpin(null);
      setCurrentSpinId(null);
      refetchBalance();
      refetchPendingSpins();
    }
  }, [isRevealSuccess, revealReceipt, gameStep, resetReveal, refetchBalance, refetchPendingSpins]);

  const handleSpin = async () => {
    if (!isConnected || !address) return;
    if (gameStep !== "idle" || isStartPending) return;
    
    const betNum = parseFloat(betAmount);
    if (isNaN(betNum) || betNum < 0.1 || betNum > 10) {
      setErrorMessage("Bet must be between 0.1 and 10 DONUT");
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    
    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      setErrorMessage("Need more approval");
      return;
    }
    
    // Reset result
    setSpinResult(null);
    setWheelRotation(0);
    
    const secret = generateSecret();
    const commitHash = hashSecret(secret);
    
    setPendingSpin({
      secret,
      commitHash,
      spinId: null,
      riskLevel,
      segments,
      amount: betAmount
    });
    
    saveSpinSecret(commitHash, secret);
    setGameStep("starting");
    
    writeStartSpin({
      address: GLAZE_WHEEL_ADDRESS,
      abi: WHEEL_ABI,
      functionName: "startSpin",
      args: [DONUT_TOKEN_ADDRESS, amountWei, riskLevel, segments, commitHash]
    });
  };

  const isProcessing = gameStep !== "idle";
  
  const formattedBalance = tokenBalance 
    ? parseFloat(formatUnits(tokenBalance, 18)).toFixed(2)
    : "0.00";

  const maxMultiplier = Math.max(...multipliers) / 10000;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes toast-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin-wheel {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(var(--final-rotation)); }
        }
        .confetti { animation: confetti-fall linear forwards; }
        .toast-animate { animation: toast-in 0.2s ease-out forwards; }
        .wheel-spin {
          transition: transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99);
        }
      `}</style>

      {/* Confetti */}
      {showConfetti && confettiData.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {confettiData.map((item, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                position: 'absolute',
                left: `${item.left}%`,
                top: '-60px',
                fontSize: `${item.size}px`,
                animationDelay: `${item.delay}s`,
                animationDuration: `${item.duration}s`,
              }}
            >
              🍩
            </div>
          ))}
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div 
          className="fixed left-1/2 -translate-x-1/2 z-[100] toast-animate"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
        >
          <div className="bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border border-red-400">
            <span className="text-sm font-bold">{errorMessage}</span>
            <button 
              onClick={() => setErrorMessage(null)}
              className="ml-1 hover:bg-red-400/30 rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">GLAZE WHEEL</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
              BETA
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1 opacity-50">
              <span className="text-[8px] text-gray-500 whitespace-nowrap">Earn GLAZE soon</span>
            </div>
            {context?.user?.pfpUrl ? (
              <img src={context.user.pfpUrl} alt="pfp" className="w-7 h-7 rounded-full border border-zinc-700" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>
        </div>

        {/* Token Selector */}
        <div className="flex gap-2 mb-2 flex-shrink-0">
          <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500 text-black font-bold text-sm">
            <span>🍩</span> DONUT
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-gray-500 font-bold text-sm opacity-50">
            <span>✨</span> SPRINKLES
            <span className="text-[8px] text-gray-600 ml-1">SOON</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-2 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Balance</span>
            <span className="text-sm font-bold text-white">🍩{formattedBalance}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Risk</span>
            <span className="text-sm font-bold text-white">
              {riskLevel === 0 ? "LOW" : riskLevel === 1 ? "MED" : "HIGH"}
            </span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center justify-center text-center">
            <span className="text-[8px] text-gray-500 uppercase">Max Win</span>
            <span className="text-sm font-bold text-amber-400">{maxMultiplier}x</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => setShowApprovals(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <Shield className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <History className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Wheel */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <WheelDisplay
            segments={segments}
            multipliers={multipliers}
            rotation={wheelRotation}
            isSpinning={isSpinning}
            result={spinResult?.segment ?? null}
          />
          
          {/* Result Display */}
          {spinResult && (
            <div className="mt-4 text-center">
              <div className={cn(
                "text-2xl font-bold",
                spinResult.multiplier > 0 ? "text-green-400" : "text-red-400"
              )}>
                {spinResult.multiplier > 0 
                  ? `🎉 ${(spinResult.multiplier / 10000).toFixed(2)}x WIN!`
                  : "💥 NO WIN"
                }
              </div>
              {spinResult.payout > 0 && (
                <div className="text-lg text-amber-400 font-bold">
                  +{spinResult.payout.toFixed(4)} 🍩
                </div>
              )}
            </div>
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
            {/* Risk Level */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="text-[8px] text-gray-500 uppercase mb-1 text-center">Risk Level</div>
              <div className="flex gap-1">
                {[0, 1, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRiskLevel(r);
                      try { sdk.haptics.selectionChanged(); } catch {}
                    }}
                    disabled={isProcessing}
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
            
            {/* Segments */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="text-[8px] text-gray-500 uppercase mb-1 text-center">Segments</div>
              <div className="flex gap-1">
                {[10, 20, 30].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSegments(s);
                      try { sdk.haptics.selectionChanged(); } catch {}
                    }}
                    disabled={isProcessing}
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
              {/* Bet presets */}
              <div className="flex gap-1">
                {["0.5", "1", "2"].map((val) => (
                  <button
                    key={val}
                    onClick={() => {
                      setBetAmount(val);
                      try { sdk.haptics.selectionChanged(); } catch {}
                    }}
                    disabled={isProcessing}
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
              
              {/* Custom input */}
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
                disabled={isProcessing}
              />
              
              {/* Spin Button */}
              <button
                onClick={handleSpin}
                disabled={isProcessing || !isConnected}
                className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base disabled:opacity-50 flex items-center justify-center"
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "SPIN"
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
                <button
                  onClick={() => setShowHelp(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  How to Play Glaze Wheel
                </h2>

                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Choose Risk & Segments</div>
                      <div className="text-[11px] text-gray-400">Higher risk = bigger potential wins but fewer winning segments.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Set Your Bet</div>
                      <div className="text-[11px] text-gray-400">Choose how much DONUT to wager on each spin.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">3</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Spin the Wheel</div>
                      <div className="text-[11px] text-gray-400">Watch the wheel spin and land on your multiplier!</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="font-semibold text-amber-400 text-xs mb-1">2% House Edge on Wins</div>
                  <div className="text-[11px] text-gray-400">1% → Pool Growth</div>
                  <div className="text-[11px] text-gray-400">0.5% → LP Burn Rewards</div>
                  <div className="text-[11px] text-gray-400">0.5% → Treasury</div>
                  
                  <div className="font-semibold text-red-400 text-xs mb-1 mt-2">On Loss</div>
                  <div className="text-[11px] text-gray-400">50% → Pool Growth</div>
                  <div className="text-[11px] text-gray-400">25% → LP Burn Rewards</div>
                  <div className="text-[11px] text-gray-400">25% → Treasury</div>
                </div>

                <button
                  onClick={() => setShowHelp(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[80vh]">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
                <button
                  onClick={() => setShowHistory(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Spin History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">All spins are provably fair. Tap any spin to verify.</p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {spinHistory.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p>No spins yet</p>
                    </div>
                  ) : (
                    spinHistory.map((spin) => {
                      const blocksLeft = spin.status === 'pending' ? Math.max(0, 256 - Number(currentBlock - spin.commitBlock)) : 0;
                      const minutesLeft = Math.ceil(blocksLeft * 2 / 60);
                      const canClaim = spin.status === 'pending' && blocksLeft === 0;
                      const riskName = spin.riskLevel === 0 ? "Low" : spin.riskLevel === 1 ? "Med" : "High";
                      const betAmountFormatted = parseFloat(formatUnits(spin.betAmount, 18)).toFixed(2);
                      
                      if (spin.status === 'pending') {
                        return (
                          <div 
                            key={spin.spinId.toString()}
                            className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                <div>
                                  <span className="text-sm text-amber-400 font-bold">Pending Reveal</span>
                                  <div className="text-[10px] text-gray-500">{riskName} • {spin.segments} segments</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-white">{betAmountFormatted}</span>
                                <div className="text-[10px] text-gray-500">🍩 DONUT</div>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-2">
                              <span>~{minutesLeft} min remaining</span>
                              <span>{blocksLeft} blocks left</span>
                            </div>
                            
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
                              <div 
                                className="bg-amber-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${Math.min(100, ((256 - blocksLeft) / 256) * 100)}%` }}
                              />
                            </div>
                            
                            <p className="text-[9px] text-gray-500 mb-2">
                              Your secret was lost when you left. The spin must wait 256 blocks (~8 min) to expire before you can claim 98% back.
                            </p>
                            
                            <button
                              onClick={() => {
                                writeClaimExpired({
                                  address: GLAZE_WHEEL_ADDRESS,
                                  abi: WHEEL_ABI,
                                  functionName: "claimExpired",
                                  args: [spin.spinId]
                                });
                              }}
                              disabled={!canClaim || isClaimPending}
                              className="w-full py-2 rounded-lg bg-zinc-700 text-white text-xs font-bold disabled:opacity-50"
                            >
                              {isClaimPending ? "Claiming..." : canClaim ? "Claim 98% Back" : `Wait ${minutesLeft} min...`}
                            </button>
                          </div>
                        );
                      }
                      
                      // Completed spin
                      const isWin = spin.status === 'won';
                      const multiplierDisplay = spin.multiplier ? (spin.multiplier / 10000).toFixed(2) : "0";
                      const payoutFormatted = spin.payout ? parseFloat(formatUnits(spin.payout, 18)).toFixed(4) : "0";
                      const profitLoss = isWin 
                        ? `+${payoutFormatted}` 
                        : `-${betAmountFormatted}`;
                      const isExpanded = expandedSpinId === spin.spinId.toString();
                      
                      return (
                        <div 
                          key={spin.spinId.toString()}
                          onClick={() => setExpandedSpinId(isExpanded ? null : spin.spinId.toString())}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            isWin ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20" : "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-2xl font-bold",
                                isWin ? "text-green-400" : "text-red-400"
                              )}>
                                {multiplierDisplay}x
                              </span>
                              <div>
                                <div className="text-[10px] text-gray-500">{riskName} • {spin.segments} seg</div>
                                <div className="text-[10px] text-gray-500">Segment #{spin.result}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={cn(
                                "text-sm font-bold",
                                isWin ? "text-green-400" : "text-red-400"
                              )}>
                                {profitLoss}
                              </span>
                              <div className="text-[10px] text-gray-500">🍩 DONUT</div>
                            </div>
                          </div>
                          <div className="text-[9px] text-gray-500 mt-1">Tap to verify</div>
                          
                          {isExpanded && (
                            <div className="mt-3 p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                              <div className="text-[9px] text-gray-400 space-y-1 font-mono break-all">
                                <div><span className="text-gray-500">Spin ID:</span> {spin.spinId.toString()}</div>
                                <div><span className="text-gray-500">Block:</span> {spin.commitBlock.toString()}</div>
                                {spin.blockHash && (
                                  <div><span className="text-gray-500">Block Hash:</span> {spin.blockHash.slice(0, 20)}...</div>
                                )}
                                {spin.revealedSecret && spin.revealedSecret !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                                  <div><span className="text-gray-500">Secret:</span> {spin.revealedSecret.slice(0, 20)}...</div>
                                )}
                                <div className="pt-1 border-t border-zinc-700 mt-1">
                                  <span className="text-amber-400">Result = keccak256(blockHash + secret + spinId) % {spin.segments}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                
                {/* Provably Fair Formula */}
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[9px] text-gray-500 text-center font-mono">
                    Result = keccak256(blockhash + secret + spinId) % segments
                  </p>
                </div>

                <button
                  onClick={() => setShowHistory(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approvals Modal */}
        {showApprovals && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowApprovals(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button
                  onClick={() => setShowApprovals(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Token Approvals
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Approve DONUT tokens to play</p>

                <div className="space-y-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">🍩 DONUT</span>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full",
                        allowance && allowance > BigInt(0) 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-red-500/20 text-red-400"
                      )}>
                        {allowance ? parseFloat(formatUnits(allowance, 18)).toFixed(2) : "0"} approved
                      </span>
                    </div>
                    
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => {
                          writeApprove({
                            address: DONUT_TOKEN_ADDRESS,
                            abi: ERC20_ABI,
                            functionName: "approve",
                            args: [GLAZE_WHEEL_ADDRESS, parseUnits("100", 18)]
                          });
                        }}
                        disabled={isApprovePending}
                        className="flex-1 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
                      >
                        {isApprovePending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Approve 100"}
                      </button>
                      <button
                        onClick={() => {
                          writeApprove({
                            address: DONUT_TOKEN_ADDRESS,
                            abi: ERC20_ABI,
                            functionName: "approve",
                            args: [GLAZE_WHEEL_ADDRESS, BigInt(0)]
                          });
                        }}
                        disabled={isApprovePending}
                        className="py-2 px-3 rounded-lg bg-zinc-800 text-gray-400 text-sm font-bold disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Custom amount"
                        value={customApprovalAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setCustomApprovalAmount(val);
                          }
                        }}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-center"
                      />
                      <button
                        onClick={() => {
                          const amount = parseFloat(customApprovalAmount);
                          if (!isNaN(amount) && amount > 0) {
                            writeApprove({
                              address: DONUT_TOKEN_ADDRESS,
                              abi: ERC20_ABI,
                              functionName: "approve",
                              args: [GLAZE_WHEEL_ADDRESS, parseUnits(customApprovalAmount, 18)]
                            });
                            setCustomApprovalAmount("");
                          }
                        }}
                        disabled={isApprovePending || !customApprovalAmount}
                        className="py-1.5 px-3 rounded-lg bg-zinc-700 text-white text-sm font-bold disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowApprovals(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black"
                >
                  Done
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