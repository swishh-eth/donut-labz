// components/sprinkles-claim-button.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, parseUnits } from "viem";
import { Sparkles, Gift, Loader2, CheckCircle, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract address - DEPLOYED
const SPRINKLES_CLAIM_ADDRESS = "0x07fcAAEAcdFFA65fDe02191Cd1C4cd4CC2cCE17e";

const SPRINKLES_CLAIM_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "isClaimWindowOpen",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "timeUntilClaimWindow",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "timeRemainingInClaimWindow",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentEpoch",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "hasUserClaimedCurrentEpoch",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPoolBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type SprinklesClaimButtonProps = {
  userFid?: number;
  compact?: boolean;
};

const formatCountdown = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

export function SprinklesClaimButton({ userFid, compact = false }: SprinklesClaimButtonProps) {
  const { address } = useAccount();
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [claimSignature, setClaimSignature] = useState<`0x${string}` | null>(null);
  const [isGettingSignature, setIsGettingSignature] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Read if claim window is open
  const { data: isClaimOpen, refetch: refetchClaimOpen } = useReadContract({
    address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
    abi: SPRINKLES_CLAIM_ABI,
    functionName: "isClaimWindowOpen",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  // Read time until claim window
  const { data: timeUntilClaim, refetch: refetchTimeUntil } = useReadContract({
    address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
    abi: SPRINKLES_CLAIM_ABI,
    functionName: "timeUntilClaimWindow",
    chainId: base.id,
    query: {
      enabled: !isClaimOpen,
      refetchInterval: 60_000,
    },
  });

  // Read time remaining in claim window
  const { data: timeRemaining } = useReadContract({
    address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
    abi: SPRINKLES_CLAIM_ABI,
    functionName: "timeRemainingInClaimWindow",
    chainId: base.id,
    query: {
      enabled: !!isClaimOpen,
      refetchInterval: 60_000,
    },
  });

  // Read current epoch
  const { data: currentEpoch } = useReadContract({
    address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
    abi: SPRINKLES_CLAIM_ABI,
    functionName: "currentEpoch",
    chainId: base.id,
  });

  // Check if user has claimed current epoch
  const { data: hasClaimed, refetch: refetchClaimed } = useReadContract({
    address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
    abi: SPRINKLES_CLAIM_ABI,
    functionName: "hasUserClaimedCurrentEpoch",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Update countdown every second
  useEffect(() => {
    const targetTime = isClaimOpen ? timeRemaining : timeUntilClaim;
    if (targetTime === undefined) return;

    setCountdown(Number(targetTime));

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refetchClaimOpen();
          refetchTimeUntil();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeUntilClaim, timeRemaining, isClaimOpen, refetchClaimOpen, refetchTimeUntil]);

  // Fetch user points from Supabase
  useEffect(() => {
    const fetchPoints = async () => {
      if (!address) return;

      setIsLoadingPoints(true);
      try {
        const res = await fetch(`/api/chat/leaderboard?address=${address}`);
        if (res.ok) {
          const data = await res.json();
          const userEntry = data.leaderboard?.find(
            (e: any) => e.address.toLowerCase() === address.toLowerCase()
          );
          setUserPoints(userEntry?.total_points || 0);
        }
      } catch (e) {
        console.error("Failed to fetch points:", e);
      } finally {
        setIsLoadingPoints(false);
      }
    };

    fetchPoints();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPoints, 30_000);
    return () => clearInterval(interval);
  }, [address]);

  // Write contract for claiming
  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Handle successful claim - reset points in Supabase
  useEffect(() => {
    if (isSuccess && address) {
      // Call API to reset user's points
      fetch("/api/sprinkles-claim/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then(() => {
        setUserPoints(0);
        refetchClaimed();
        setClaimSignature(null);
        setClaimError(null);
      });
    }
  }, [isSuccess, address, refetchClaimed]);

  const handleClaim = async () => {
    if (!address || !userPoints || userPoints <= 0) return;

    setClaimError(null);
    setIsGettingSignature(true);

    try {
      // Get signature from backend
      const res = await fetch("/api/sprinkles-claim/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          amount: userPoints,
          epoch: Number(currentEpoch),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get signature");
      }

      const { signature } = await res.json();
      setClaimSignature(signature);
      setIsGettingSignature(false);

      // Execute claim
      const amountWei = parseUnits(userPoints.toString(), 18);
      writeContract({
        address: SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
        abi: SPRINKLES_CLAIM_ABI,
        functionName: "claim",
        args: [amountWei, signature],
        chainId: base.id,
      });
    } catch (e: any) {
      console.error("Claim failed:", e);
      setClaimError(e.message || "Claim failed");
      setIsGettingSignature(false);
    }
  };

  const hasClaimableAmount = userPoints !== null && userPoints > 0;
  const isClaimingInProgress = isWriting || isConfirming || isGettingSignature;

  // COMPACT VIEW (for chat page stats row)
  if (compact) {
    // Already claimed this epoch
    if (hasClaimed) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-[9px] text-gray-400 uppercase">Week {currentEpoch?.toString()}</span>
          </div>
          <div className="text-sm font-bold text-green-400">Claimed!</div>
          <div className="text-[9px] text-gray-500 mt-0.5">
            Next Friday in {formatCountdown(countdown)}
          </div>
        </div>
      );
    }

    // Claim window is open (it's Friday!) and user has points
    if (isClaimOpen && hasClaimableAmount) {
      return (
        <button
          onClick={handleClaim}
          disabled={isClaimingInProgress}
          className={cn(
            "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border border-amber-400/50 rounded-lg p-2 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)] flex flex-col items-center justify-center text-center",
            isClaimingInProgress && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <Gift className="w-3 h-3 text-white animate-pulse" />
            <span className="text-[9px] text-white/80 uppercase font-semibold">It's Friday!</span>
          </div>
          <div className="text-sm font-bold text-white">
            {isClaimingInProgress ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isGettingSignature ? "Signing..." : isWriting ? "Confirm..." : "Claiming..."}
              </span>
            ) : (
              `Claim ${userPoints?.toFixed(2)} ✨`
            )}
          </div>
          <div className="text-[9px] text-white/60 mt-0.5">
            {formatCountdown(countdown)} left today
          </div>
        </button>
      );
    }

    // Claim window open (Friday) but no points
    if (isClaimOpen && !hasClaimableAmount) {
      return (
        <div className="bg-zinc-900 border border-amber-500/30 rounded-lg p-2 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1 mb-0.5">
            <Calendar className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-gray-400 uppercase">It's Friday!</span>
          </div>
          <div className="text-sm font-bold text-gray-500">0 points</div>
          <div className="text-[9px] text-gray-600 mt-0.5">
            Chat this week to earn!
          </div>
        </div>
      );
    }

    // Countdown to Friday
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
        <div className="flex items-center gap-1 mb-0.5">
          <Sparkles className="w-3 h-3 text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.8)]" />
          <span className="text-[9px] text-gray-400 uppercase">Friday Drop</span>
        </div>
        <div className="text-sm font-bold text-white flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-400" />
          <span className="text-amber-400">{formatCountdown(countdown)}</span>
        </div>
        {hasClaimableAmount && (
          <div className="text-[9px] text-gray-500 mt-0.5">
            {userPoints?.toFixed(2)} to claim
          </div>
        )}
      </div>
    );
  }

  // FULL VIEW - not used currently but available
  return (
    <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-white text-sm">Friday Sprinkles Drop</span>
        </div>
        {isClaimOpen ? (
          <span className="text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
            🎉 IT'S FRIDAY
          </span>
        ) : (
          <span className="text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatCountdown(countdown)}
          </span>
        )}
      </div>

      {claimError && (
        <div className="bg-red-950/50 border border-red-500/50 rounded-lg p-2 mb-2">
          <p className="text-xs text-red-400">{claimError}</p>
        </div>
      )}

      {hasClaimed ? (
        <p className="text-xs text-green-400">
          ✓ You've claimed this week's SPRINKLES! See you next Friday.
        </p>
      ) : isClaimOpen && hasClaimableAmount ? (
        <button
          onClick={handleClaim}
          disabled={isClaimingInProgress}
          className={cn(
            "w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
            isClaimingInProgress && "opacity-50 cursor-not-allowed"
          )}
        >
          {isClaimingInProgress ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Claiming...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Claim {userPoints?.toFixed(2)} SPRINKLES
            </>
          )}
        </button>
      ) : (
        <p className="text-xs text-gray-400">
          {hasClaimableAmount
            ? `${userPoints?.toFixed(2)} SPRINKLES ready! Claim opens Friday.`
            : "Chat to earn sprinkles points! Claim every Friday."}
        </p>
      )}
    </div>
  );
}