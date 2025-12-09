"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther, formatUnits } from "viem";
import { X, Loader2, Sparkles, ArrowLeft } from "lucide-react";

const SPIN_WHEEL_ADDRESS = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C" as `0x${string}`;

// Token addresses on Base
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C".toLowerCase();
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D".toLowerCase();

const SPIN_WHEEL_ABI = [
  {
    inputs: [{ name: "_commitHash", type: "bytes32" }],
    name: "commit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_secret", type: "bytes32" }],
    name: "reveal",
    outputs: [{ name: "segment", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "canReveal",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getCommitment",
    outputs: [
      { name: "commitHash", type: "bytes32" },
      { name: "commitBlock", type: "uint256" },
      { name: "revealed", type: "bool" },
      { name: "canRevealNow", type: "bool" },
      { name: "blocksUntilExpiry", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPoolBalances",
    outputs: [
      { name: "ethBalance", type: "uint256" },
      { name: "tokens", type: "address[]" },
      { name: "balances", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBoostInfo",
    outputs: [
      { name: "active", type: "bool" },
      { name: "multiplier", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "timeRemaining", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Wheel segments - dark theme colors
const SEGMENTS = [
  { label: "💀", color: "#18181b", glowColor: "#3f3f46", chance: 50, prize: 0 },
  { label: "0.1%", color: "#166534", glowColor: "#22c55e", chance: 25, prize: 0.1 },
  { label: "0.5%", color: "#0e7490", glowColor: "#06b6d4", chance: 15, prize: 0.5 },
  { label: "1%", color: "#6d28d9", glowColor: "#a855f7", chance: 8, prize: 1 },
  { label: "5%", color: "#b45309", glowColor: "#f59e0b", chance: 2, prize: 5 },
];

// Segment angles for wheel (each segment's center position in degrees)
const SEGMENT_ANGLES = [
  36,   // Nothing (0) - center at 36°
  108,  // 0.1% (1) - center at 108°
  180,  // 0.5% (2) - center at 180°
  252,  // 1% (3) - center at 252°
  324,  // 5% (4) - center at 324°
];

// Custom Roulette Wheel Icon - matches the gift icon style
const RouletteIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="9" />
    <line x1="12" y1="15" x2="12" y2="22" />
    <line x1="2" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
  </svg>
);

interface SpinWheelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableSpins: number;
  onSpinComplete?: () => void;
}

export function SpinWheelDialog({ isOpen, onClose, availableSpins, onSpinComplete }: SpinWheelDialogProps) {
  const { address } = useAccount();
  const [stage, setStage] = useState<"idle" | "committing" | "waiting" | "revealing" | "spinning" | "result">("idle");
  const [secret, setSecret] = useState<`0x${string}` | null>(null);
  const [rotation, setRotation] = useState(0);
  const [resultSegment, setResultSegment] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [hasRecordedSpin, setHasRecordedSpin] = useState(false);
  const [localSpins, setLocalSpins] = useState(availableSpins);
  const [floatOffset, setFloatOffset] = useState(0);
  const isProcessingRef = useRef(false);
  const hasStartedRef = useRef(false);

  // Storage key for secret backup
  const getSecretKey = (addr: string) => `spin-secret-${addr.toLowerCase()}`;

  // Save secret to localStorage
  const saveSecret = useCallback((addr: string, sec: `0x${string}`) => {
    try {
      localStorage.setItem(getSecretKey(addr), sec);
    } catch (e) {
      console.error("Failed to save secret:", e);
    }
  }, []);

  // Load secret from localStorage
  const loadSecret = useCallback((addr: string): `0x${string}` | null => {
    try {
      const saved = localStorage.getItem(getSecretKey(addr));
      return saved as `0x${string}` | null;
    } catch (e) {
      console.error("Failed to load secret:", e);
      return null;
    }
  }, []);

  // Clear secret from localStorage
  const clearSecret = useCallback((addr: string) => {
    try {
      localStorage.removeItem(getSecretKey(addr));
    } catch (e) {
      console.error("Failed to clear secret:", e);
    }
  }, []);

  // Update local spins only when dialog opens or when idle
  useEffect(() => {
    if (isOpen && stage === "idle" && !hasStartedRef.current) {
      setLocalSpins(availableSpins);
    }
  }, [isOpen, availableSpins, stage]);

  // Floating animation for center icons
  useEffect(() => {
    if (!isOpen) return;
    
    let frame: number;
    const animate = () => {
      setFloatOffset(Math.sin(Date.now() / 800) * 3);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Fetch ETH price
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then(res => res.json())
      .then(data => setEthPrice(data.ethereum?.usd || 0))
      .catch(() => setEthPrice(0));
  }, [isOpen]);

  // Contract writes
  const { data: commitHash, writeContract: writeCommit, isPending: isCommitting, reset: resetCommit } = useWriteContract();
  const { data: revealHash, writeContract: writeReveal, isPending: isRevealing, reset: resetReveal } = useWriteContract();

  // Transaction receipts
  const { data: commitReceipt, isLoading: isCommitConfirming } = useWaitForTransactionReceipt({
    hash: commitHash,
    chainId: base.id,
  });

  const { data: revealReceipt, isLoading: isRevealConfirming } = useWaitForTransactionReceipt({
    hash: revealHash,
    chainId: base.id,
  });

  // Check if user can reveal
  const { data: canRevealData, refetch: refetchCanReveal } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "canReveal",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && stage === "waiting",
      refetchInterval: 2000,
    },
  });

  // Check for existing commitment when dialog opens
  const { data: commitmentData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getCommitment",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && isOpen,
    },
  });

  // Check if there's a pending (unrevealed, unexpired) commitment
  const hasPendingCommit = commitmentData && 
    commitmentData[1] > 0n && // commitBlock > 0
    !commitmentData[2] && // not revealed
    commitmentData[4] > 0n; // blocksUntilExpiry > 0 (not expired)
  
  const canRevealPending = commitmentData?.[3] ?? false; // canRevealNow

  // Check for saved secret when dialog opens with pending commit
  useEffect(() => {
    if (isOpen && address && hasPendingCommit && canRevealPending && stage === "idle" && !secret) {
      const savedSecret = loadSecret(address);
      if (savedSecret) {
        console.log("Found saved secret for pending commit");
        setSecret(savedSecret);
      }
    }
  }, [isOpen, address, hasPendingCommit, canRevealPending, stage, loadSecret, secret]);

  // Get pool balances
  const { data: poolData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getPoolBalances",
    chainId: base.id,
  });

  // Get boost info
  const { data: boostData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getBoostInfo",
    chainId: base.id,
    query: {
      refetchInterval: 10000,
    },
  });

  // Parse pool data
  const ethPool = poolData?.[0] ? Number(formatEther(poolData[0])) : 0;
  const tokenAddresses = poolData?.[1] || [];
  const tokenBalances = poolData?.[2] || [];
  
  // Find DONUT and SPRINKLES balances
  let donutPool = 0;
  let sprinklesPool = 0;
  
  for (let i = 0; i < tokenAddresses.length; i++) {
    const addr = (tokenAddresses[i] as string).toLowerCase();
    const balance = tokenBalances[i] as bigint;
    if (addr === DONUT_ADDRESS) {
      donutPool = Number(formatUnits(balance, 18));
    } else if (addr === SPRINKLES_ADDRESS) {
      sprinklesPool = Number(formatUnits(balance, 18));
    }
  }

  const isBoostActive = boostData?.[0] ?? false;
  const boostMultiplier = boostData?.[1] ? Number(boostData[1]) / 100 : 1;
  const boostTimeRemaining = boostData?.[3] ? Number(boostData[3]) : 0;

  // Format boost time remaining
  const formatBoostTime = (seconds: number) => {
    if (seconds <= 0) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Generate random secret
  const generateSecret = useCallback(() => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return ("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  }, []);

  // Handle commit
  const handleSpin = useCallback(async () => {
    if (!address || localSpins <= 0 || stage !== "idle" || isProcessingRef.current || hasStartedRef.current) return;
    
    hasStartedRef.current = true;
    isProcessingRef.current = true;
    setError(null);
    const newSecret = generateSecret();
    setSecret(newSecret);
    
    // Save secret to localStorage for recovery
    saveSecret(address, newSecret);
    
    // Create commit hash: keccak256(secret, address)
    const commitHashValue = keccak256(encodePacked(["bytes32", "address"], [newSecret, address]));
    
    setStage("committing");
    
    try {
      await writeCommit({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "commit",
        args: [commitHashValue],
        chainId: base.id,
      });
    } catch (err) {
      console.error("Commit error:", err);
      setError("Failed to commit. Please try again.");
      setStage("idle");
      isProcessingRef.current = false;
      hasStartedRef.current = false;
      clearSecret(address);
    }
  }, [address, localSpins, generateSecret, writeCommit, stage, saveSecret, clearSecret]);

  // Handle reveal
  const handleReveal = useCallback(async () => {
    if (!secret) return;
    
    setStage("revealing");
    
    try {
      await writeReveal({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "reveal",
        args: [secret],
        chainId: base.id,
      });
    } catch (err) {
      console.error("Reveal error:", err);
      setError("Failed to reveal. Please try again.");
      setStage("waiting");
    }
  }, [secret, writeReveal]);

  // Watch commit confirmation
  useEffect(() => {
    if (commitReceipt?.status === "success") {
      setStage("waiting");
    } else if (commitReceipt?.status === "reverted") {
      setError("Commit transaction failed");
      setStage("idle");
    }
  }, [commitReceipt]);

  // Auto-reveal when ready
  useEffect(() => {
    if (stage === "waiting" && canRevealData === true && secret) {
      handleReveal();
    }
  }, [stage, canRevealData, secret, handleReveal]);

  // Watch reveal confirmation and animate wheel
  useEffect(() => {
    // Guard against multiple fires
    if (revealReceipt?.status === "success" && stage === "revealing") {
      // Parse the SpinRevealed event from logs
      const logs = revealReceipt.logs;
      let segment = 0;
      
      // Event: SpinRevealed(address indexed user, uint256 segment, uint256 randomNumber, uint256 boostMultiplier)
      // Only 'user' is indexed (topics[1]), segment/randomNumber/boostMultiplier are in data
      for (const log of logs) {
        if (log.address.toLowerCase() === SPIN_WHEEL_ADDRESS.toLowerCase()) {
          try {
            // data contains: segment (32 bytes) + randomNumber (32 bytes) + boostMultiplier (32 bytes)
            // Each uint256 is 32 bytes (64 hex chars)
            const data = log.data;
            if (data && data.length >= 66) { // 0x + 64 chars minimum
              // First 32 bytes (chars 2-66) is the segment
              const segmentHex = data.slice(2, 66);
              segment = parseInt(segmentHex, 16);
              console.log("Parsed segment from log:", segment, "raw hex:", segmentHex);
            }
          } catch (e) {
            console.error("Failed to parse segment:", e);
          }
          break;
        }
      }
      
      // Validate segment is in valid range
      if (segment < 0 || segment > 4) {
        console.warn("Invalid segment:", segment, "defaulting to 0");
        segment = 0;
      }
      
      setResultSegment(segment);
      setStage("spinning");
      
      // Calculate rotation to land on correct segment
      // Wheel spins 5 full rotations plus lands on segment
      const targetAngle = SEGMENT_ANGLES[segment];
      const fullSpins = 5 * 360;
      const finalRotation = fullSpins + (360 - targetAngle);
      
      setRotation(finalRotation);
      
      // After animation, show result
      setTimeout(() => {
        setStage("result");
        
        // Record spin usage - only once per spin
        if (!hasRecordedSpin) {
          setHasRecordedSpin(true);
          console.log("Recording spin usage:", { address, revealTxHash: revealReceipt.transactionHash, segment });
          
          fetch("/api/spins/use", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              revealTxHash: revealReceipt.transactionHash,
              segment,
              prizes: {},
            }),
          })
          .then(res => res.json())
          .then(data => {
            console.log("Spin use response:", data);
            onSpinComplete?.();
          })
          .catch(err => console.error("Spin use error:", err));
        }
        
      }, 5000);
      
    } else if (revealReceipt?.status === "reverted") {
      setError("Reveal transaction failed");
      setStage("idle");
    }
  }, [revealReceipt, address, onSpinComplete, hasRecordedSpin, stage]);

  // Reset on close
  const handleClose = useCallback(() => {
    // Only clear secret if spin is complete (result shown)
    if (stage === "result" && address) {
      clearSecret(address);
    }
    setStage("idle");
    setSecret(null);
    setRotation(0);
    setResultSegment(null);
    setError(null);
    setHasRecordedSpin(false);
    isProcessingRef.current = false;
    hasStartedRef.current = false;
    resetCommit();
    resetReveal();
    onClose();
  }, [onClose, resetCommit, resetReveal, stage, address, clearSecret]);

  if (!isOpen) return null;

  const isProcessing = stage !== "idle" && stage !== "result";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={!isProcessing ? handleClose : undefined} />
      
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          {/* Header with back button */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={!isProcessing ? handleClose : undefined}
              disabled={isProcessing}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <RouletteIcon className="w-5 h-5 text-amber-400" />
              Glaze Roulette
            </h2>
            
            <button
              onClick={!isProcessing ? handleClose : undefined}
              disabled={isProcessing}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          
          {/* Boost Banner */}
          {isBoostActive && (
            <div className="mb-3 p-2 rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/50">
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">🔥</span>
                <div className="text-center">
                  <div className="text-amber-400 font-bold text-xs">
                    {boostMultiplier}x BOOST ACTIVE!
                  </div>
                  <div className="text-amber-400/70 text-[9px]">
                    {formatBoostTime(boostTimeRemaining)} remaining
                  </div>
                </div>
                <span className="text-base">🔥</span>
              </div>
            </div>
          )}
          
          {/* Pool info - styled like leaderboard */}
          <div className="mb-3 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5 text-center">Prize Pool</div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm font-bold text-green-400">Ξ{ethPool.toFixed(2)}</span>
              <span className="text-sm font-bold text-amber-400">🍩{donutPool.toFixed(2)}</span>
              <span className="text-sm font-bold text-white flex items-center gap-0.5 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]">
                <Sparkles className="w-3.5 h-3.5" />
                {Math.floor(sprinklesPool).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Donut Wheel */}
          <div className={`relative w-52 h-52 mx-auto mb-3 ${isBoostActive ? "drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]" : ""}`}>
            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
              <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>
            
            {/* Wheel SVG - Donut Shape */}
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration: stage === "spinning" ? "5s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              {/* Outer glow ring */}
              <circle cx="100" cy="100" r="98" fill="none" stroke="rgba(251, 191, 36, 0.15)" strokeWidth="3" />
              
              {/* Segments */}
              {SEGMENTS.map((seg, i) => {
                const startAngle = i * 72 - 90;
                const endAngle = startAngle + 72;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                
                // Outer arc
                const outerR = 95;
                const innerR = 40;
                
                const ox1 = 100 + outerR * Math.cos(startRad);
                const oy1 = 100 + outerR * Math.sin(startRad);
                const ox2 = 100 + outerR * Math.cos(endRad);
                const oy2 = 100 + outerR * Math.sin(endRad);
                
                const ix1 = 100 + innerR * Math.cos(startRad);
                const iy1 = 100 + innerR * Math.sin(startRad);
                const ix2 = 100 + innerR * Math.cos(endRad);
                const iy2 = 100 + innerR * Math.sin(endRad);
                
                // Label position
                const labelAngle = startAngle + 36;
                const labelRad = (labelAngle * Math.PI) / 180;
                const labelR = (outerR + innerR) / 2;
                const labelX = 100 + labelR * Math.cos(labelRad);
                const labelY = 100 + labelR * Math.sin(labelRad);
                
                return (
                  <g key={i}>
                    {/* Segment */}
                    <path
                      d={`M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 0 0 ${ix1} ${iy1} Z`}
                      fill={seg.color}
                      stroke="#27272a"
                      strokeWidth="1.5"
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      fill="white"
                      fontSize={seg.prize === 0 ? "16" : "11"}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${labelAngle + 90}, ${labelX}, ${labelY})`}
                      style={{ textShadow: "0 0 4px rgba(0,0,0,0.9)" }}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              
              {/* Inner donut hole */}
              <circle cx="100" cy="100" r="40" fill="#09090b" />
              <circle cx="100" cy="100" r="38" fill="none" stroke="#27272a" strokeWidth="2" />
            </svg>

            {/* Floating Center Icons - counter-rotate to stay upright */}
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ 
                transform: `rotate(${-rotation}deg)`,
                transitionDuration: stage === "spinning" ? "5s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              <div className="relative w-16 h-16 flex items-center justify-center">
                {/* Donut emoji - floats up */}
                <span 
                  className="absolute text-2xl transition-transform"
                  style={{ 
                    transform: `translateY(${floatOffset}px)`,
                  }}
                >
                  🍩
                </span>
                {/* Sparkle - floats opposite direction, positioned to top-right */}
                <Sparkles 
                  className="absolute w-4 h-4 text-white transition-transform"
                  style={{ 
                    top: '4px',
                    right: '4px',
                    transform: `translateY(${-floatOffset * 0.8}px)`,
                    filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.9))',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Status / Actions */}
          <div className="text-center">
            {error && (
              <div className="text-red-400 text-sm mb-3">{error}</div>
            )}
            
            {stage === "idle" && hasPendingCommit && (
              <>
                <div className="text-xs text-amber-400 mb-2">
                  ⚠️ Previous spin pending
                </div>
                {canRevealPending && secret ? (
                  <>
                    <button
                      onClick={() => {
                        hasStartedRef.current = true;
                        setStage("revealing");
                        handleReveal();
                      }}
                      className="w-full py-2.5 rounded-xl font-bold text-base bg-green-500 text-white hover:bg-green-400 transition-all"
                    >
                      RESUME SPIN!
                    </button>
                    <div className="text-[9px] text-gray-500 mt-1.5">
                      Tap to finish your spin
                    </div>
                  </>
                ) : canRevealPending ? (
                  <div className="text-[10px] text-gray-400">
                    Secret not found - waiting for expiry (~{commitmentData?.[4] ? Math.ceil(Number(commitmentData[4]) * 2 / 60) : "?"} min)
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400">
                    Waiting for next block...
                  </div>
                )}
              </>
            )}
            
            {stage === "idle" && !hasPendingCommit && (
              <>
                <div className="text-sm text-gray-400 mb-2">
                  You have <span className="text-amber-400 font-bold">{localSpins}</span> spin{localSpins !== 1 ? "s" : ""}
                </div>
                <button
                  onClick={handleSpin}
                  disabled={localSpins <= 0 || hasStartedRef.current}
                  className={`w-full py-2.5 rounded-xl font-bold text-base transition-all ${
                    localSpins > 0
                      ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]"
                      : "bg-zinc-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {localSpins > 0 ? "SPIN!" : "No Spins Available"}
                </button>
                <div className="text-[9px] text-gray-600 mt-1.5">
                  Mine SPRINKLES to earn spins
                </div>
              </>
            )}
            
            {stage === "committing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Committing...</span>
              </div>
            )}
            
            {stage === "waiting" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Waiting for block...</span>
              </div>
            )}
            
            {stage === "revealing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Revealing...</span>
              </div>
            )}
            
            {stage === "spinning" && (
              <div className="text-amber-400 font-bold py-2 flex items-center justify-center gap-2">
                <span className="animate-pulse">🎰</span>
                <span>Spinning...</span>
              </div>
            )}
            
            {stage === "result" && resultSegment !== null && (
              <>
                <div className={`text-xl font-bold mb-1.5 ${resultSegment === 0 ? "text-gray-400" : "text-green-400"}`}>
                  {resultSegment === 0 ? "💀 Nothing" : `🎉 Won ${(SEGMENTS[resultSegment].prize * boostMultiplier).toFixed(1)}%!`}
                </div>
                {resultSegment > 0 && (
                  <div className="text-xs text-gray-400 mb-2">
                    {isBoostActive && <span className="text-amber-400">🔥 {boostMultiplier}x Boosted! </span>}
                    Prizes sent to your wallet!
                  </div>
                )}
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 rounded-xl font-bold text-base bg-white text-black hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}