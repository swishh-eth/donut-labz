// components/share-reward-button.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";
import { Share2, Gift, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SHARE_REWARDS_ADDRESS,
  SHARE_REWARDS_ABI,
} from "@/lib/contracts/share-rewards";

type CampaignInfo = [
  string,   // token
  bigint,   // totalAmount
  bigint,   // remainingAmount
  bigint,   // maxClaims
  bigint,   // claimCount
  boolean,  // active
  bigint,   // startTime
  bigint    // endTime
];

type ShareRewardButtonProps = {
  userFid?: number;
  compact?: boolean;
};

export function ShareRewardButton({ userFid, compact = false }: ShareRewardButtonProps) {
  const { address } = useAccount();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [claimData, setClaimData] = useState<{
    neynarScore: number;
    castHash: string;
    signature: string;
  } | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("TOKEN");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [isPulsing, setIsPulsing] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);
  const [showClaimSuccess, setShowClaimSuccess] = useState(false);
  const [hasShared, setHasShared] = useState(false);

  // Pulsing effect for active campaign
  useEffect(() => {
    const triggerPulse = () => {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);
      const nextPulse = 3000 + Math.random() * 5000;
      setTimeout(triggerPulse, nextPulse);
    };

    const initialDelay = setTimeout(triggerPulse, 2000);
    return () => clearTimeout(initialDelay);
  }, []);

  // Read campaign info
  const { data: campaignInfo, refetch: refetchCampaign } = useReadContract({
    address: SHARE_REWARDS_ADDRESS as `0x${string}`,
    abi: SHARE_REWARDS_ABI,
    functionName: "getCampaignInfo",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  // Check if user has claimed
  const { data: hasClaimed, refetch: refetchClaimed } = useReadContract({
    address: SHARE_REWARDS_ADDRESS as `0x${string}`,
    abi: SHARE_REWARDS_ABI,
    functionName: "hasUserClaimed",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
    },
  });

  // Check if native ETH campaign
  const { data: isNativeETH } = useReadContract({
    address: SHARE_REWARDS_ADDRESS as `0x${string}`,
    abi: SHARE_REWARDS_ABI,
    functionName: "isNativeETH",
    chainId: base.id,
  });

  // Get estimated reward (using 10000 = 1.0x base reward for display)
  const { data: estimatedReward } = useReadContract({
    address: SHARE_REWARDS_ADDRESS as `0x${string}`,
    abi: SHARE_REWARDS_ABI,
    functionName: "calculateReward",
    args: [BigInt(10000)], // 10000 = 1.0x multiplier (neutral/base reward)
    chainId: base.id,
  });

  const campaign = campaignInfo as CampaignInfo | undefined;
  const isActive = campaign?.[5] && campaign[2] > 0n;
  const claimsRemaining = campaign ? Number(campaign[3] - campaign[4]) : 0;

  // Fetch token info when campaign is active
  useEffect(() => {
    if (isNativeETH) {
      setTokenSymbol("ETH");
      setTokenDecimals(18);
    } else if (campaign?.[0] && campaign[0] !== "0x0000000000000000000000000000000000000000") {
      fetch(`https://base.blockscout.com/api/v2/tokens/${campaign[0]}`)
        .then((res) => res.json())
        .then((data) => {
          setTokenSymbol(data.symbol || "TOKEN");
          setTokenDecimals(data.decimals || 18);
        })
        .catch(() => {});
    }
  }, [campaign, isNativeETH]);

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

  // Handle successful claim - calculate and store the claimed amount
  useEffect(() => {
    if (isSuccess && claimData && estimatedReward) {
      // Calculate what they actually claimed
      const amount = (estimatedReward * BigInt(claimData.neynarScore)) / 10000n;
      const formattedAmount = formatUnits(amount, tokenDecimals);
      // Round to reasonable decimals
      const roundedAmount = parseFloat(formattedAmount).toFixed(
        tokenDecimals > 4 ? 4 : 2
      );
      setClaimedAmount(roundedAmount);
      setShowClaimSuccess(true);
      refetchCampaign();
      refetchClaimed();
      setClaimData(null);
    }
  }, [isSuccess, claimData, estimatedReward, tokenDecimals, refetchCampaign, refetchClaimed]);

  // Calculate estimated amount for share message (same as displayed in UI)
  const getEstimatedAmount = useCallback(() => {
    if (!estimatedReward) return "some";
    const amount = formatUnits(estimatedReward, tokenDecimals);
    // Show same precision as UI - don't over-round
    const num = parseFloat(amount);
    if (num >= 1) {
      return num.toFixed(2);
    } else if (num >= 0.01) {
      return num.toFixed(4);
    } else {
      return num.toFixed(6);
    }
  }, [estimatedReward, tokenDecimals]);

  // Share before claiming (to qualify)
  const handleShareToQualify = async () => {
    const estimatedAmount = getEstimatedAmount();
    const shareText = `I just got some free glaze at the Donut Labs by @swishh.eth 🍩\n\n${estimatedAmount} $${tokenSymbol} claimed! 🎉\n\nGet your free tokens too 👇`;
    
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

  // Share after claiming (brag about it!)
  const handleShareSuccess = useCallback(async () => {
    const shareText = `I just got some free glaze at the Donut Lab! 🍩🍩🍩\n\n${claimedAmount} $${tokenSymbol} claimed! 🎉\n\nGet your free tokens too 👇`;
    
    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: ["https://donutlabs.vercel.app"],
      });
    } catch (e) {
      try {
        const encodedText = encodeURIComponent(shareText);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
        });
      } catch {
        const encodedText = encodeURIComponent(shareText);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
          "_blank"
        );
      }
    }
  }, [claimedAmount, tokenSymbol]);

  const handleVerifyAndClaim = async () => {
    if (!userFid) return;

    // If no address, try to connect wallet first
    if (!address) {
      try {
        // Trigger wallet connection via Farcaster SDK
        await sdk.actions.openUrl("https://warpcast.com");
      } catch (e) {
        setVerifyError("Please connect your wallet first");
      }
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);

    try {
      const res = await fetch("/api/share/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, fid: userFid }),
      });

      const data = await res.json();

      if (!res.ok) {
        setVerifyError(data.message || data.error || "Verification failed");
        return;
      }

      setClaimData({
        neynarScore: data.scoreBps || data.neynarScore,
        castHash: data.castHash,
        signature: data.signature,
      });
    } catch (e) {
      setVerifyError("Failed to verify share");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClaim = async () => {
    if (!claimData || !address) return;

    try {
      writeContract({
        address: SHARE_REWARDS_ADDRESS as `0x${string}`,
        abi: SHARE_REWARDS_ABI,
        functionName: "claimReward",
        args: [
          BigInt(claimData.neynarScore),
          claimData.castHash as `0x${string}`,
          claimData.signature as `0x${string}`,
        ],
        chainId: base.id,
      });
    } catch (e) {
      console.error("Claim error:", e);
    }
  };

  // Just claimed success - show share button
  if (showClaimSuccess && claimedAmount) {
    if (compact) {
      return (
        <div className="bg-zinc-900 border border-green-500/30 rounded-lg p-2 flex items-center justify-center">
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle className="w-3 h-3" />
            <span className="font-semibold text-xs">+{claimedAmount} 🍩</span>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/40 rounded-lg p-3">
        <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
          <CheckCircle className="w-5 h-5" />
          <span className="font-bold">Claimed {claimedAmount} ${tokenSymbol}!</span>
        </div>
        <button
          onClick={handleShareSuccess}
          className={cn(
            "w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
            isPulsing && "scale-[0.97]"
          )}
        >
          <Share2 className="w-4 h-4" />
          Share Your Glaze! 🍩
        </button>
        <button
          onClick={() => setShowClaimSuccess(false)}
          className="w-full text-xs text-gray-500 hover:text-gray-400 mt-2"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Already claimed state (from previous session)
  if (hasClaimed && isActive) {
    if (compact) {
      return (
        <div className="bg-zinc-900 border border-green-500/30 rounded-lg p-2 flex items-center justify-center">
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle className="w-3 h-3" />
            <span className="font-semibold text-xs">Claimed! 🍩</span>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-zinc-900 border border-green-500/30 rounded-lg p-3">
        <div className="flex items-center justify-center gap-2 text-green-400">
          <CheckCircle className="w-4 h-4" />
          <span className="font-semibold text-sm">Reward Claimed! 🍩</span>
        </div>
      </div>
    );
  }

  // No active campaign - greyed out state
  if (!isActive) {
    if (compact) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 opacity-60 flex items-center justify-center">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Share2 className="w-3 h-3" />
            <span className="font-semibold text-xs">No Campaign</span>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 opacity-60">
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-gray-600" />
          <div>
            <div className="font-semibold text-gray-500 text-sm">No Share Campaign Available</div>
            <div className="text-xs text-gray-600">Check back later for rewards 🍩</div>
          </div>
        </div>
      </div>
    );
  }

  // Active campaign with claim data - show claim UI
  if (claimData) {
    if (compact) {
      return (
        <button
          onClick={handleClaim}
          disabled={isWriting || isConfirming}
          className={cn(
            "bg-green-500 hover:bg-green-400 border border-green-400 rounded-lg p-2 flex items-center justify-center gap-1.5 transition-all",
            (isWriting || isConfirming) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isWriting || isConfirming ? (
            <Loader2 className="w-3 h-3 animate-spin text-black" />
          ) : (
            <Gift className="w-3 h-3 text-black" />
          )}
          <span className="font-bold text-xs text-black">
            {isWriting ? "Approve..." : isConfirming ? "Claiming..." : "Claim"}
          </span>
        </button>
      );
    }
    return (
      <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-400">
            Score: {(claimData.neynarScore / 10000).toFixed(2)}x
          </div>
          <div className="text-xs text-amber-400 font-semibold">
            ~{estimatedReward
              ? formatUnits((estimatedReward * BigInt(claimData.neynarScore)) / 10000n, tokenDecimals)
              : "..."} {tokenSymbol}
          </div>
        </div>

        {verifyError && (
          <div className="flex items-center gap-2 text-red-400 text-xs mb-2">
            <XCircle className="w-3 h-3" />
            <span>{verifyError}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClaim}
            disabled={isWriting || isConfirming}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
              (isWriting || isConfirming) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isWriting || isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Gift className="w-4 h-4" />
            )}
            {isWriting ? "Confirm..." : isConfirming ? "Claiming..." : "Claim"}
          </button>
          <button
            onClick={() => {
              setClaimData(null);
              setVerifyError(null);
              resetWrite();
            }}
            className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-400 rounded-lg text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Active campaign - main UI
  if (compact) {
    // Show error state if there's an error
    if (verifyError) {
      return (
        <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span className="font-bold text-[10px] text-red-400 truncate">
                {verifyError}
              </span>
            </div>
            <button
              onClick={() => {
                setVerifyError(null);
                setHasShared(false);
              }}
              className="text-[9px] text-red-300 underline flex-shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    // State 1: Initial - Show gift icon, tap to share
    if (!hasShared) {
      return (
        <button
          onClick={handleShareToQualify}
          disabled={!userFid}
          className={cn(
            "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg p-2 flex items-center justify-center gap-1.5 transition-all",
            isPulsing && "scale-[0.97]",
            !userFid && "opacity-50 cursor-not-allowed"
          )}
        >
          <Gift className="w-3 h-3 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
          <span className="font-bold text-xs text-amber-400">
            {claimsRemaining} left
          </span>
        </button>
      );
    }

    // State 2: Shared - Show verify button
    return (
      <button
        onClick={handleVerifyAndClaim}
        disabled={isVerifying || !userFid}
        className={cn(
          "bg-amber-500 hover:bg-amber-400 border border-amber-400 rounded-lg p-2 flex items-center justify-center gap-1.5 transition-all",
          (isVerifying || !userFid) && "opacity-50 cursor-not-allowed"
        )}
      >
        {isVerifying ? (
          <Loader2 className="w-3 h-3 animate-spin text-black" />
        ) : (
          <CheckCircle className="w-3 h-3 text-black" />
        )}
        <span className="font-bold text-xs text-black">
          {isVerifying ? "Checking..." : "Verify"}
        </span>
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-white text-sm">Share for Rewards!</span>
        </div>
        <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
          {claimsRemaining} left
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-3">
        Earn ~<span className="text-amber-400 font-semibold">
          {estimatedReward ? formatUnits(estimatedReward, tokenDecimals) : "..."} {tokenSymbol}
        </span>{" "}
        (±10% based on Neynar score)
      </div>

      {verifyError && (
        <div className="flex items-center gap-2 text-red-400 text-xs mb-2 bg-red-500/10 rounded p-2">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          <span>{verifyError}</span>
        </div>
      )}

      <div className="flex gap-2">
        {/* Share Button - Pulsing */}
        <button
          onClick={handleShareToQualify}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 px-3 rounded-lg transition-all text-sm",
            isPulsing && "scale-[0.97]"
          )}
        >
          <Share2 className="w-4 h-4" />
          Share 🍩
        </button>

        {/* Verify Button */}
        <button
          onClick={handleVerifyAndClaim}
          disabled={isVerifying || !userFid}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 px-3 rounded-lg transition-colors text-sm",
            (isVerifying || !userFid) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isVerifying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Verify
        </button>
      </div>
    </div>
  );
}