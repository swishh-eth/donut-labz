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
import { sdk } from "@farcaster/miniapp-sdk";
import { Sparkles, Gift, Loader2, CheckCircle, Clock, Calendar, Share2, XCircle } from "lucide-react";
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
  
  // Share flow states
  const [hasShared, setHasShared] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

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
    const interval = setInterval(fetchPoints, 30_000);
    return () => clearInterval(interval);
  }, [address]);

  // Write contract for claiming
  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Log write errors
  useEffect(() => {
    if (writeError) {
      console.error("Write contract error:", writeError);
      setClaimError(writeError.message || "Transaction failed");
      setIsGettingSignature(false);
    }
  }, [writeError]);

  // Handle successful claim - reset points in Supabase
  useEffect(() => {
    if (isSuccess && address) {
      console.log("Claim successful! Resetting points...");
      fetch("/api/sprinkles-claim/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then(() => {
        setUserPoints(0);
        refetchClaimed();
        setClaimSignature(null);
        setClaimError(null);
        // Reset share states for next time
        setHasShared(false);
        setIsVerified(false);
      });
    }
  }, [isSuccess, address, refetchClaimed]);

  // Share to qualify
  const handleShare = async () => {
    if (!userPoints) return;
    
    const hoursLeft = Math.floor(countdown / 3600);
    const minsLeft = Math.floor((countdown % 3600) / 60);
    const timeLeftText = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`;
    
    const shareText = `I just claimed my weekly airdrop of ${userPoints.toFixed(2)} $SPRINKLES from @donutlabs by @swishh.eth! ✨🍩\n\nOnly ${timeLeftText} left to claim yours! 👇`;

    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: ["https://donutlabs.vercel.app"],
      });
      setHasShared(true);
    } catch (e) {
      try {
        const encodedText = encodeURIComponent(shareText);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
        });
        setHasShared(true);
      } catch {
        const encodedText = encodeURIComponent(shareText);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
          "_blank"
        );
        setHasShared(true);
      }
    }
  };

  // Verify share
  const handleVerify = async () => {
    if (!userFid || !address) {
      setVerifyError("Wallet or Farcaster not connected");
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);

    try {
      const res = await fetch("/api/sprinkles-claim/verify-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fid: userFid,
          address,
          expectedAmount: userPoints 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setVerifyError(data.error || "Verification failed");
        return;
      }

      // Verified! Now they can claim
      setIsVerified(true);
      setVerifyError(null);
    } catch (e) {
      setVerifyError("Failed to verify share");
    } finally {
      setIsVerifying(false);
    }
  };

  // Claim after verification
  const handleClaim = async () => {
    console.log("handleClaim called");

    if (!address) {
      setClaimError("Wallet not connected");
      return;
    }
    
    if (!userPoints || userPoints <= 0) {
      setClaimError("No points to claim");
      return;
    }

    setClaimError(null);
    setIsGettingSignature(true);

    try {
      console.log("Fetching signature from /api/sprinkles-claim/sign...");
      
      const res = await fetch("/api/sprinkles-claim/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          amount: userPoints,
          epoch: Number(currentEpoch),
        }),
      });

      console.log("Sign API response status:", res.status);

      if (!res.ok) {
        const data = await res.json();
        console.error("Sign API error:", data);
        throw new Error(data.error || "Failed to get signature");
      }

      const { signature } = await res.json();
      console.log("Got signature:", signature);
      
      setClaimSignature(signature);
      setIsGettingSignature(false);

      const amountWei = parseUnits(userPoints.toString(), 18);
      console.log("Calling writeContract with amount:", amountWei.toString());
      
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

  // Reset states
  const handleReset = () => {
    setVerifyError(null);
    setClaimError(null);
    setHasShared(false);
    setIsVerified(false);
  };

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
      
      // Show error state
      if (verifyError || claimError) {
        return (
          <div className="flex flex-col">
            <div className="flex rounded-lg overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)]">
              <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-lg p-2">
                <div className="flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[9px] text-red-300/90 leading-relaxed break-words">
                    {verifyError || claimError}
                  </span>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center justify-center px-2.5 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-lg hover:bg-red-900/50 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)] animate-[spin_3s_linear_infinite_reverse]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>
        );
      }

      // Step 1: Share first
      if (!hasShared) {
        return (
          <button
            onClick={handleShare}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border border-amber-400/50 rounded-lg p-2 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)] flex flex-col items-center justify-center text-center"
          >
            <div className="flex items-center gap-1 mb-0.5">
              <Share2 className="w-3 h-3 text-white" />
              <span className="text-[9px] text-white/80 uppercase font-semibold">It's Friday!</span>
            </div>
            <div className="text-sm font-bold text-white">
              Share to Claim ✨
            </div>
            <div className="text-[9px] text-white/60 mt-0.5">
              {userPoints?.toFixed(2)} SPRINKLES
            </div>
          </button>
        );
      }

      // Step 2: Verify share
      if (hasShared && !isVerified) {
        return (
          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className={cn(
              "bg-amber-500 hover:bg-amber-400 border border-amber-400 rounded-lg p-2 transition-all flex flex-col items-center justify-center text-center",
              isVerifying && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-1 mb-0.5">
              {isVerifying ? (
                <Loader2 className="w-3 h-3 text-black animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3 text-black" />
              )}
              <span className="text-[9px] text-black/80 uppercase font-semibold">Shared!</span>
            </div>
            <div className="text-sm font-bold text-black">
              {isVerifying ? "Verifying..." : "Verify Share"}
            </div>
            <div className="text-[9px] text-black/60 mt-0.5">
              Tap to continue
            </div>
          </button>
        );
      }

      // Step 3: Claim (after verified)
      if (isVerified) {
        return (
          <button
            onClick={handleClaim}
            disabled={isClaimingInProgress}
            className={cn(
              "bg-green-500 hover:bg-green-400 border border-green-400 rounded-lg p-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] flex flex-col items-center justify-center text-center",
              isClaimingInProgress && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-1 mb-0.5">
              {isClaimingInProgress ? (
                <Loader2 className="w-3 h-3 text-black animate-spin" />
              ) : (
                <Gift className="w-3 h-3 text-black" />
              )}
              <span className="text-[9px] text-black/80 uppercase font-semibold">Verified!</span>
            </div>
            <div className="text-sm font-bold text-black">
              {isGettingSignature ? "Signing..." : isWriting ? "Confirm..." : isConfirming ? "Claiming..." : `Claim ${userPoints?.toFixed(2)} ✨`}
            </div>
            <div className="text-[9px] text-black/60 mt-0.5">
              {formatCountdown(countdown)} left today
            </div>
          </button>
        );
      }
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

      {(claimError || verifyError) && (
        <div className="bg-red-950/50 border border-red-500/50 rounded-lg p-2 mb-2">
          <p className="text-xs text-red-400">{claimError || verifyError}</p>
          <button onClick={handleReset} className="text-xs text-red-300 underline mt-1">
            Try again
          </button>
        </div>
      )}

      {hasClaimed ? (
        <p className="text-xs text-green-400">
          ✓ You've claimed this week's SPRINKLES! See you next Friday.
        </p>
      ) : isClaimOpen && hasClaimableAmount ? (
        <div className="space-y-2">
          {!hasShared ? (
            <button
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-2.5 px-3 rounded-lg transition-all text-sm"
            >
              <Share2 className="w-4 h-4" />
              Share to Claim {userPoints?.toFixed(2)} SPRINKLES
            </button>
          ) : !isVerified ? (
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className={cn(
                "w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
                isVerifying && "opacity-50 cursor-not-allowed"
              )}
            >
              {isVerifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {isVerifying ? "Verifying..." : "Verify Share"}
            </button>
          ) : (
            <button
              onClick={handleClaim}
              disabled={isClaimingInProgress}
              className={cn(
                "w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
                isClaimingInProgress && "opacity-50 cursor-not-allowed"
              )}
            >
              {isClaimingInProgress ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Gift className="w-4 h-4" />
              )}
              {isClaimingInProgress ? "Claiming..." : `Claim ${userPoints?.toFixed(2)} SPRINKLES`}
            </button>
          )}
        </div>
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