"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";
import { Sparkles, Gift, Loader2, CheckCircle, Clock, Calendar, Share2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract address - NEW VERIFIED CONTRACT
const SPRINKLES_CLAIM_ADDRESS = "0xD3FAc8568B887C2069BA9B1dEd9A4f6ea5e82701";

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
    name: "getPoolBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ============== EPOCH CALCULATION (FRONTEND) ==============
// Week 1 started on Friday, December 5, 2025 at 6pm EST (11pm UTC)
// Claim window is 24 hours: Friday 6pm EST to Saturday 6pm EST
const EPOCH_START_TIME = 1764975600; // Friday Dec 5, 2025 23:00:00 UTC (6pm EST)
const EPOCH_DURATION = 7 * 24 * 60 * 60; // 1 week in seconds
const CLAIM_WINDOW_DURATION = 24 * 60 * 60; // 24 hours

// Calculate current epoch based on time
const calculateCurrentEpoch = (): number => {
  const now = Math.floor(Date.now() / 1000);
  if (now < EPOCH_START_TIME) return 0;
  return Math.floor((now - EPOCH_START_TIME) / EPOCH_DURATION) + 1;
};

// Check if claim window is open (it's Friday 6pm EST or within 24 hours after)
const isClaimWindowOpen = (): boolean => {
  const now = Math.floor(Date.now() / 1000);
  if (now < EPOCH_START_TIME) return false;
  
  const timeSinceStart = now - EPOCH_START_TIME;
  const timeInCurrentEpoch = timeSinceStart % EPOCH_DURATION;
  
  // Claim window is open during the first 24 hours of each epoch (starting Friday 6pm EST)
  return timeInCurrentEpoch < CLAIM_WINDOW_DURATION;
};

// Get time until next claim window (next Friday 6pm EST)
const getTimeUntilClaimWindow = (): number => {
  const now = Math.floor(Date.now() / 1000);
  if (now < EPOCH_START_TIME) return EPOCH_START_TIME - now;
  
  const timeSinceStart = now - EPOCH_START_TIME;
  const timeInCurrentEpoch = timeSinceStart % EPOCH_DURATION;
  
  if (timeInCurrentEpoch < CLAIM_WINDOW_DURATION) {
    // We're in the claim window
    return 0;
  }
  
  // Time until next epoch starts
  return EPOCH_DURATION - timeInCurrentEpoch;
};

// Get time remaining in current claim window
const getTimeRemainingInClaimWindow = (): number => {
  const now = Math.floor(Date.now() / 1000);
  if (now < EPOCH_START_TIME) return 0;
  
  const timeSinceStart = now - EPOCH_START_TIME;
  const timeInCurrentEpoch = timeSinceStart % EPOCH_DURATION;
  
  if (timeInCurrentEpoch >= CLAIM_WINDOW_DURATION) {
    // Not in claim window
    return 0;
  }
  
  return CLAIM_WINDOW_DURATION - timeInCurrentEpoch;
};

type SprinklesClaimButtonProps = {
  userFid?: number;
  compact?: boolean;
  hideClaimAmount?: boolean;
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

export function SprinklesClaimButton({ userFid, compact = false, hideClaimAmount = false }: SprinklesClaimButtonProps) {
  const { address } = useAccount();
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [isGettingSignature, setIsGettingSignature] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [hasClaimed, setHasClaimed] = useState<boolean | null>(null);
  const [isCheckingClaim, setIsCheckingClaim] = useState(false);
  
  // Calculate epoch on frontend
  const [currentEpoch, setCurrentEpoch] = useState(calculateCurrentEpoch());
  const [isClaimOpen, setIsClaimOpen] = useState(isClaimWindowOpen());
  
  // Share flow states
  const [hasShared, setHasShared] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Update epoch and claim window status every second
  useEffect(() => {
    const updateTime = () => {
      const newEpoch = calculateCurrentEpoch();
      const newIsClaimOpen = isClaimWindowOpen();
      
      // If epoch changed, reset share states and refetch claim status
      if (newEpoch !== currentEpoch) {
        console.log(`[SprinklesClaim] Epoch changed from ${currentEpoch} to ${newEpoch}`);
        setCurrentEpoch(newEpoch);
        setHasShared(false);
        setIsVerified(false);
        setHasClaimed(null); // Will trigger refetch
      }
      
      setIsClaimOpen(newIsClaimOpen);
      
      // Update countdown
      if (newIsClaimOpen) {
        setCountdown(getTimeRemainingInClaimWindow());
      } else {
        setCountdown(getTimeUntilClaimWindow());
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [currentEpoch]);

  // Check if user has claimed current epoch from database
  useEffect(() => {
    const checkClaimStatus = async () => {
      if (!address) {
        setHasClaimed(false);
        return;
      }
      
      setIsCheckingClaim(true);
      try {
        const res = await fetch(`/api/sprinkles-claim/status?address=${address}&epoch=${currentEpoch}`);
        if (res.ok) {
          const data = await res.json();
          setHasClaimed(data.hasClaimed ?? false);
          console.log(`[SprinklesClaim] Claim status for epoch ${currentEpoch}: ${data.hasClaimed}`);
        } else {
          // API error - assume not claimed so user can try
          console.warn(`[SprinklesClaim] Status API returned ${res.status}, assuming not claimed`);
          setHasClaimed(false);
        }
      } catch (e) {
        console.error("Failed to check claim status:", e);
        // On error, assume not claimed so user can try
        setHasClaimed(false);
      } finally {
        setIsCheckingClaim(false);
      }
    };
    
    checkClaimStatus();
  }, [address, currentEpoch]);

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

  // Handle successful claim - reset points in Supabase and record claim
  useEffect(() => {
    if (isSuccess && address) {
      console.log("Claim successful! Recording claim and resetting points...");
      
      // Record the claim in database
      fetch("/api/sprinkles-claim/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, epoch: currentEpoch }),
      });
      
      // Reset points
      fetch("/api/sprinkles-claim/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).then(() => {
        setUserPoints(0);
        setHasClaimed(true);
        setClaimError(null);
        setHasShared(false);
        setIsVerified(false);
      });
    }
  }, [isSuccess, address, currentEpoch]);

  // Share to qualify
  const handleShare = async () => {
    if (!userPoints) return;
    
    const hoursLeft = Math.floor(countdown / 3600);
    const minsLeft = Math.floor((countdown % 3600) / 60);
    const timeLeftText = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`;
    
    const shareText = `I just claimed my weekly airdrop of ${userPoints.toFixed(2)} $SPRINKLES by @swishh.eth! ✨🍩\n\nOnly ${timeLeftText} left to claim yours! 👇`;

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
          epoch: currentEpoch, // Use frontend-calculated epoch
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

  // Debug logging
  useEffect(() => {
    console.log(`[SprinklesClaim] State: epoch=${currentEpoch}, isClaimOpen=${isClaimOpen}, hasClaimed=${hasClaimed}, address=${address?.slice(0,8)}`);
  }, [currentEpoch, isClaimOpen, hasClaimed, address]);

  // COMPACT VIEW (for chat page stats row)
  if (compact) {
    // Claim window is CLOSED - show countdown to Friday 6pm EST
    if (!isClaimOpen) {
      return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-white" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Friday Drop</span>
          </div>
          <div className="text-2xl font-bold text-white fade-in-up stagger-2 opacity-0 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatCountdown(countdown)}
          </div>
        </div>
      );
    }

    // Claim window is OPEN (Friday 6pm EST!) - check if already claimed this epoch
    if (hasClaimed) {
      return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Week {currentEpoch}</span>
          </div>
          <div className="text-2xl font-bold text-green-400 fade-in-up stagger-2 opacity-0">Claimed!</div>
        </div>
      );
    }

    // Claim window is open (it's Friday 6pm EST!) and user has points
    if (hasClaimableAmount) {
      
      // Show error state
      if (verifyError || claimError) {
        return (
          <div className="flex flex-col h-[80px]">
            <div className="flex rounded-xl overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)] h-full">
              <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-xl p-2 flex items-center">
                <div className="flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[9px] text-red-300/90 leading-relaxed break-words">
                    {verifyError || claimError}
                  </span>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center justify-center px-2.5 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-xl hover:bg-red-900/50 transition-colors"
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
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border border-amber-400/50 rounded-xl p-3 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)] flex flex-col items-center justify-center text-center h-[80px]"
          >
            <div className="flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5 text-white" />
              <span className="text-[10px] text-white/80 uppercase font-semibold tracking-wide">It's Friday!</span>
            </div>
            <div className="text-lg font-bold text-white">
              Share to Claim ✨
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
              "bg-amber-500 hover:bg-amber-400 border border-amber-400 rounded-xl p-3 transition-all flex flex-col items-center justify-center text-center h-[80px]",
              isVerifying && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-1">
              {isVerifying ? (
                <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 text-black" />
              )}
              <span className="text-[10px] text-black/80 uppercase font-semibold tracking-wide">Shared!</span>
            </div>
            <div className="text-lg font-bold text-black">
              {isVerifying ? "Verifying..." : "Verify Share"}
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
              "bg-green-500 hover:bg-green-400 border border-green-400 rounded-xl p-3 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] flex flex-col items-center justify-center text-center h-[80px]",
              isClaimingInProgress && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-1">
              {isClaimingInProgress ? (
                <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
              ) : (
                <Gift className="w-3.5 h-3.5 text-black" />
              )}
              <span className="text-[10px] text-black/80 uppercase font-semibold tracking-wide">Verified!</span>
            </div>
            <div className="text-lg font-bold text-black">
              {isGettingSignature ? "Signing..." : isWriting ? "Confirm..." : isConfirming ? "Claiming..." : `Claim ${userPoints?.toFixed(2)} ✨`}
            </div>
          </button>
        );
      }
    }

    // Claim window open (Friday 6pm EST) but no points
    return (
      <div className="bg-zinc-900/50 border border-amber-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">It's Friday!</span>
        </div>
        <div className="text-2xl font-bold text-gray-500 fade-in-up stagger-2 opacity-0">0 pts</div>
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
            ? `${userPoints?.toFixed(2)} SPRINKLES ready! Claim opens Friday 6pm EST.`
            : "Chat to earn sprinkles points! Claim every Friday at 6pm EST."}
        </p>
      )}
    </div>
  );
}