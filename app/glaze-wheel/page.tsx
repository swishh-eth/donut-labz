"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked, decodeEventLog } from "viem";
import { NavBar } from "@/components/nav-bar";
import { History, HelpCircle, X, Loader2, Shield, Target } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const GLAZE_WHEEL_ADDRESS = "0xDa7faD8C62826997e8945C20685b02f7B5Dd8799" as const;
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

// Hash the secret
const hashSecret = (secret: `0x${string}`): `0x${string}` => {
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

// Get multipliers for wheel config (client-side calculation matching contract)
const getWheelMultipliers = (riskLevel: number, segments: number): number[] => {
  const multipliers: number[] = [];
  
  for (let i = 0; i < segments; i++) {
    let mult = 0;
    
    if (segments === 10) {
      if (riskLevel === 0) {
        if (i < 3) mult = 15000;
        else if (i < 6) mult = 12000;
      } else if (riskLevel === 1) {
        if (i < 2) mult = 20000;
        else if (i < 4) mult = 15000;
      } else {
        if (i === 0) mult = 50000;
        else if (i === 1) mult = 40000;
      }
    } else if (segments === 20) {
      if (riskLevel === 0) {
        if (i < 6) mult = 15000;
        else if (i < 12) mult = 12000;
      } else if (riskLevel === 1) {
        if (i < 2) mult = 30000;
        else if (i < 4) mult = 20000;
        else if (i < 8) mult = 15000;
      } else {
        if (i === 0) mult = 100000;
        else if (i === 1) mult = 50000;
        else if (i < 4) mult = 30000;
      }
    } else if (segments === 30) {
      if (riskLevel === 0) {
        if (i < 9) mult = 15000;
        else if (i < 18) mult = 12000;
      } else if (riskLevel === 1) {
        if (i < 2) mult = 40000;
        else if (i < 5) mult = 25000;
        else if (i < 10) mult = 15000;
      } else {
        if (i === 0) mult = 150000;
        else if (i === 1) mult = 80000;
        else if (i < 5) mult = 30000;
      }
    } else if (segments === 40) {
      if (riskLevel === 0) {
        if (i < 12) mult = 15000;
        else if (i < 24) mult = 12000;
      } else if (riskLevel === 1) {
        if (i < 2) mult = 50000;
        else if (i < 5) mult = 30000;
        else if (i < 12) mult = 15000;
      } else {
        if (i === 0) mult = 200000;
        else if (i === 1) mult = 100000;
        else if (i < 4) mult = 50000;
        else if (i < 6) mult = 30000;
      }
    } else if (segments === 50) {
      if (riskLevel === 0) {
        if (i < 15) mult = 15000;
        else if (i < 30) mult = 12000;
      } else if (riskLevel === 1) {
        if (i < 2) mult = 60000;
        else if (i < 5) mult = 40000;
        else if (i < 10) mult = 20000;
        else if (i < 15) mult = 15000;
      } else {
        if (i === 0) mult = 495000;
        else if (i === 1) mult = 150000;
        else if (i < 4) mult = 80000;
        else if (i < 7) mult = 40000;
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
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const size = canvas.width;
    const center = size / 2;
    const radius = size / 2 - 10;
    
    // Clear
    ctx.clearRect(0, 0, size, size);
    
    // Save and rotate
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center, -center);
    
    // Draw segments
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
    
    ctx.restore();
    
    // Draw center circle
    ctx.beginPath();
    ctx.arc(center, center, 30, 0, 2 * Math.PI);
    ctx.fillStyle = "#18181b";
    ctx.fill();
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw pointer (at top)
    ctx.beginPath();
    ctx.moveTo(center - 15, 5);
    ctx.lineTo(center + 15, 5);
    ctx.lineTo(center, 25);
    ctx.closePath();
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 2;
    ctx.stroke();
    
  }, [segments, multipliers, rotation, result]);
  
  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        width={280} 
        height={280}
        className={cn(
          "transition-transform",
          isSpinning && "drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]"
        )}
      />
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
      
      // Start the wheel animation immediately
      setIsSpinning(true);
      
      // After a small delay, get the spinId and reveal
      setTimeout(async () => {
        if (pendingSpin.secret) {
          try {
            const result = await refetchPendingSpins();
            const ids = result.data as bigint[] | undefined;
            
            if (ids && ids.length > 0) {
              // Get the most recent spin (should be ours)
              const spinId = ids[ids.length - 1];
              setCurrentSpinId(spinId);
              saveSpinSecret(spinId.toString(), pendingSpin.secret);
              
              // Now reveal the spin
              setGameStep("revealing");
              writeRevealSpin({
                address: GLAZE_WHEEL_ADDRESS,
                abi: WHEEL_ABI,
                functionName: "revealSpin",
                args: [spinId, pendingSpin.secret]
              });
            } else {
              // No pending spins found, something went wrong
              setErrorMessage("Spin not found, please try again");
              setGameStep("idle");
              setIsSpinning(false);
              setPendingSpin(null);
            }
          } catch (e) {
            console.error("Error fetching spin:", e);
            setErrorMessage("Error revealing spin");
            setGameStep("idle");
            setIsSpinning(false);
          }
        }
      }, 500);
      
      try { sdk.haptics.impactOccurred("medium"); } catch {}
    }
  }, [isStartSuccess, gameStep, pendingSpin, resetStart, refetchPendingSpins, writeRevealSpin]);

  // Handle reveal success - animate to result
  useEffect(() => {
    if (isRevealSuccess && revealReceipt && gameStep === "revealing") {
      resetReveal();
      
      // Parse the SpinRevealed event from transaction logs
      let resultSegment = 0;
      let resultMult = 0;
      let resultPayout = BigInt(0);
      
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
              resultSegment = args.result;
              resultMult = Number(args.multiplier);
              resultPayout = args.payout;
              break;
            }
          } catch {
            // Not the event we're looking for, continue
          }
        }
      } catch (e) {
        console.error("Error parsing reveal event:", e);
      }
      
      const payoutNum = parseFloat(formatUnits(resultPayout, 18));
      
      // Calculate final rotation to land on result segment
      // The wheel has segment 0 at the top, going clockwise
      const segmentAngle = 360 / segments;
      // Pointer is at top (0 degrees), so we need to rotate to put result segment at top
      const targetAngle = 360 - (resultSegment * segmentAngle) - (segmentAngle / 2);
      const fullSpins = 5 * 360; // 5 full rotations for drama
      const finalRotation = fullSpins + targetAngle;
      
      // Start the rotation animation
      setWheelRotation(finalRotation);
      
      // After animation completes, show the result
      setTimeout(() => {
        setIsSpinning(false);
        setSpinResult({
          segment: resultSegment,
          multiplier: resultMult,
          payout: payoutNum
        });
        
        if (payoutNum > 0) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
          try {
            sdk.haptics.impactOccurred("heavy");
            setTimeout(() => sdk.haptics.impactOccurred("medium"), 100);
          } catch {}
        } else {
          try { sdk.haptics.impactOccurred("heavy"); } catch {}
        }
        
        setGameStep("idle");
        setPendingSpin(null);
        setCurrentSpinId(null);
        refetchBalance();
        refetchPendingSpins();
      }, 4000); // Animation duration
    }
  }, [isRevealSuccess, revealReceipt, gameStep, segments, resetReveal, refetchBalance, refetchPendingSpins]);

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
  const allPendingSpinIds = (pendingSpinIds as bigint[]) || [];
  
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
          <div 
            className="wheel-spin"
            style={{ transform: `rotate(${wheelRotation}deg)` }}
          >
            <WheelDisplay
              segments={segments}
              multipliers={multipliers}
              rotation={0}
              isSpinning={isSpinning}
              result={spinResult?.segment ?? null}
            />
          </div>
          
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
                <p className="text-[10px] text-gray-500 mb-3">Pending spins can be claimed after expiry</p>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {allPendingSpinIds.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <p>No pending spins</p>
                    </div>
                  ) : (
                    allPendingSpinIds.map((spinId, index) => (
                      <div 
                        key={index}
                        className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                            <div>
                              <span className="text-xs text-amber-400 font-bold">Pending</span>
                              <div className="text-[9px] text-gray-500">Spin #{spinId.toString()}</div>
                            </div>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            writeClaimExpired({
                              address: GLAZE_WHEEL_ADDRESS,
                              abi: WHEEL_ABI,
                              functionName: "claimExpired",
                              args: [spinId]
                            });
                          }}
                          disabled={isClaimPending}
                          className="mt-2 w-full py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold disabled:opacity-50"
                        >
                          {isClaimPending ? "Claiming..." : "Claim 98% Back"}
                        </button>
                      </div>
                    ))
                  )}
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