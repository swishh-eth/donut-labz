"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther } from "viem";
import { X, Loader2 } from "lucide-react";

const SPIN_WHEEL_ADDRESS = "0x3ed3c1Cf26050D98B1E610fBC899a6577982c4fc" as `0x${string}`;

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

// Wheel segments with colors and labels
const SEGMENTS = [
  { label: "Nothing", color: "#374151", chance: 50, prize: 0 },
  { label: "0.1%", color: "#059669", chance: 25, prize: 0.1 },
  { label: "0.5%", color: "#0891b2", chance: 15, prize: 0.5 },
  { label: "1%", color: "#7c3aed", chance: 8, prize: 1 },
  { label: "5% 🎉", color: "#f59e0b", chance: 2, prize: 5 },
];

// Segment angles for wheel (each segment's center position in degrees)
const SEGMENT_ANGLES = [
  36,   // Nothing (0) - center at 36°
  108,  // 0.1% (1) - center at 108°
  180,  // 0.5% (2) - center at 180°
  252,  // 1% (3) - center at 252°
  324,  // 5% (4) - center at 324°
];

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

  const ethPool = poolData?.[0] ? Number(formatEther(poolData[0])) : 0;
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
    if (!address || availableSpins <= 0) return;
    
    setError(null);
    const newSecret = generateSecret();
    setSecret(newSecret);
    
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
    }
  }, [address, availableSpins, generateSecret, writeCommit]);

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

  // Watch for can reveal
  useEffect(() => {
    if (stage === "waiting" && canRevealData === true) {
      // Auto-reveal when ready
      handleReveal();
    }
  }, [stage, canRevealData, handleReveal]);

  // Watch reveal confirmation and parse result
  useEffect(() => {
    if (revealReceipt?.status === "success") {
      // Parse the SpinRevealed event to get segment
      const spinRevealedTopic = "0x" + keccak256(encodePacked(["string"], ["SpinRevealed(address,uint256,uint256)"])).slice(2);
      
      const revealLog = revealReceipt.logs.find(log => 
        log.topics[0]?.toLowerCase() === spinRevealedTopic.toLowerCase()
      );
      
      let segment = 0;
      if (revealLog && revealLog.topics[2]) {
        segment = Number(BigInt(revealLog.topics[2]));
      }
      
      setResultSegment(segment);
      setStage("spinning");
      
      // Calculate final rotation to land on segment
      const targetAngle = SEGMENT_ANGLES[segment];
      const spins = 5; // Number of full rotations
      const finalRotation = (spins * 360) + (360 - targetAngle) + 90; // +90 to account for pointer at top
      
      setRotation(finalRotation);
      
      // After spin animation, show result
      setTimeout(() => {
        setStage("result");
        
        // Call API to use the spin
        fetch("/api/spins/use", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            revealTxHash: revealReceipt.transactionHash,
            segment,
            prizes: {}, // Could parse from logs
          }),
        }).then(() => {
          onSpinComplete?.();
        }).catch(console.error);
        
      }, 5000); // Match spin animation duration
      
    } else if (revealReceipt?.status === "reverted") {
      setError("Reveal transaction failed");
      setStage("idle");
    }
  }, [revealReceipt, address, onSpinComplete]);

  // Reset on close
  const handleClose = useCallback(() => {
    setStage("idle");
    setSecret(null);
    setRotation(0);
    setResultSegment(null);
    setError(null);
    resetCommit();
    resetReveal();
    onClose();
  }, [onClose, resetCommit, resetReveal]);

  if (!isOpen) return null;

  const isProcessing = stage !== "idle" && stage !== "result";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={!isProcessing ? handleClose : undefined} />
      
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
          {/* Close button */}
          {!isProcessing && (
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <h2 className="text-lg font-bold text-white mb-2 text-center">🎡 Spin the Wheel</h2>
          
          {/* Boost Banner */}
          {isBoostActive && (
            <div className="mb-3 p-2 rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/50 animate-pulse">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">🔥</span>
                <div className="text-center">
                  <div className="text-amber-400 font-bold text-sm">
                    {boostMultiplier}x BOOST ACTIVE!
                  </div>
                  <div className="text-amber-400/70 text-[10px]">
                    {formatBoostTime(boostTimeRemaining)} remaining
                  </div>
                </div>
                <span className="text-xl">🔥</span>
              </div>
            </div>
          )}
          
          {/* Pool info */}
          <div className="text-center text-xs text-gray-400 mb-4">
            Pool: Ξ{ethPool.toFixed(4)}
            {isBoostActive && (
              <span className="text-amber-400 ml-2">• Prizes {boostMultiplier}x</span>
            )}
          </div>

          {/* Wheel */}
          <div className={`relative w-64 h-64 mx-auto mb-4 ${isBoostActive ? "drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" : ""}`}>
            {/* Boost ring effect */}
            {isBoostActive && (
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/50 animate-ping" style={{ animationDuration: "2s" }} />
            )}
            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
              <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
            </div>
            
            {/* Wheel SVG */}
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full transition-transform"
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration: stage === "spinning" ? "5s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              {SEGMENTS.map((seg, i) => {
                const startAngle = i * 72 - 90;
                const endAngle = startAngle + 72;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                
                const x1 = 100 + 95 * Math.cos(startRad);
                const y1 = 100 + 95 * Math.sin(startRad);
                const x2 = 100 + 95 * Math.cos(endRad);
                const y2 = 100 + 95 * Math.sin(endRad);
                
                const labelAngle = startAngle + 36;
                const labelRad = (labelAngle * Math.PI) / 180;
                const labelX = 100 + 60 * Math.cos(labelRad);
                const labelY = 100 + 60 * Math.sin(labelRad);
                
                return (
                  <g key={i}>
                    <path
                      d={`M 100 100 L ${x1} ${y1} A 95 95 0 0 1 ${x2} ${y2} Z`}
                      fill={seg.color}
                      stroke="#1f2937"
                      strokeWidth="2"
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      fill="white"
                      fontSize="12"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${labelAngle + 90}, ${labelX}, ${labelY})`}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="15" fill="#1f2937" stroke="#374151" strokeWidth="2" />
            </svg>
          </div>

          {/* Status / Actions */}
          <div className="text-center">
            {error && (
              <div className="text-red-400 text-sm mb-3">{error}</div>
            )}
            
            {stage === "idle" && (
              <>
                <div className="text-sm text-gray-400 mb-3">
                  You have <span className="text-amber-400 font-bold">{availableSpins}</span> spin{availableSpins !== 1 ? "s" : ""}
                </div>
                <button
                  onClick={handleSpin}
                  disabled={availableSpins <= 0}
                  className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                    availableSpins > 0
                      ? "bg-amber-500 text-black hover:bg-amber-400"
                      : "bg-zinc-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {availableSpins > 0 ? "SPIN!" : "No Spins Available"}
                </button>
                <div className="text-[10px] text-gray-500 mt-2">
                  Mine SPRINKLES to earn spins
                </div>
              </>
            )}
            
            {stage === "committing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Committing...</span>
              </div>
            )}
            
            {stage === "waiting" && (
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Waiting for block...</span>
              </div>
            )}
            
            {stage === "revealing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Revealing...</span>
              </div>
            )}
            
            {stage === "spinning" && (
              <div className="text-amber-400 font-bold animate-pulse">
                🎰 Spinning...
              </div>
            )}
            
            {stage === "result" && resultSegment !== null && (
              <>
                <div className={`text-2xl font-bold mb-2 ${resultSegment === 0 ? "text-gray-400" : "text-green-400"}`}>
                  {resultSegment === 0 ? "😢 Nothing" : `🎉 Won ${(SEGMENTS[resultSegment].prize * boostMultiplier).toFixed(1)}%!`}
                </div>
                {resultSegment > 0 && (
                  <div className="text-sm text-gray-400 mb-3">
                    {isBoostActive && <span className="text-amber-400">🔥 {boostMultiplier}x Boosted! </span>}
                    Prizes sent to your wallet!
                  </div>
                )}
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl font-bold bg-white text-black hover:bg-gray-200 transition-colors"
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