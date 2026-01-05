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
import { Share2, Gift, Loader2, CheckCircle, XCircle, UserPlus, Coins } from "lucide-react";
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
  tile?: boolean;
};

// Pink gradient style for DONUT
const pinkGradientActiveStyle = {
  background: 'linear-gradient(135deg, rgba(236,72,153,0.25) 0%, rgba(219,39,119,0.15) 100%)',
  border: '1px solid rgba(236,72,153,0.5)'
};

const pinkGradientStyle = {
  background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(219,39,119,0.1) 100%)',
  border: '1px solid rgba(236,72,153,0.3)'
};

// Green gradient style for SPRINKLES/USDC
const greenGradientActiveStyle = {
  background: 'linear-gradient(135deg, rgba(34,197,94,0.25) 0%, rgba(22,163,74,0.15) 100%)',
  border: '1px solid rgba(34,197,94,0.5)'
};

const greenGradientStyle = {
  background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)',
  border: '1px solid rgba(34,197,94,0.3)'
};

// Neutral gradient style for loading state
const neutralGradientActiveStyle = {
  background: 'linear-gradient(135deg, rgba(113,113,122,0.25) 0%, rgba(82,82,91,0.15) 100%)',
  border: '1px solid rgba(113,113,122,0.5)'
};

const neutralGradientStyle = {
  background: 'linear-gradient(135deg, rgba(113,113,122,0.15) 0%, rgba(82,82,91,0.1) 100%)',
  border: '1px solid rgba(113,113,122,0.3)'
};

// Green gradient style for SPRINKLES requirement (matches app theme)
const sprinklesRequirementGradientStyle = {
  background: 'linear-gradient(135deg, rgba(34,197,94,0.25) 0%, rgba(22,163,74,0.15) 100%)',
  border: '1px solid rgba(34,197,94,0.5)'
};

export function ShareRewardButton({ userFid, compact = false, tile = false }: ShareRewardButtonProps) {
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
  const [tokenLoading, setTokenLoading] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);
  const [showClaimSuccess, setShowClaimSuccess] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const [needsFollow, setNeedsFollow] = useState(false);
  const [needsSprinkles, setNeedsSprinkles] = useState(false);
  const [showSprinklesActions, setShowSprinklesActions] = useState(false);
  const [sprinklesBalance, setSprinklesBalance] = useState<number>(0);
  const [showClaimsLeft, setShowClaimsLeft] = useState(false);

  // Helper functions for token-specific styling
  const isDonutToken = tokenSymbol === "DONUT";
  const isUsdcToken = tokenSymbol === "USDC";
  
  const getActiveGradient = () => {
    if (tokenLoading) return neutralGradientActiveStyle;
    return isDonutToken ? pinkGradientActiveStyle : greenGradientActiveStyle;
  };
  const getGradient = () => {
    if (tokenLoading) return neutralGradientStyle;
    return isDonutToken ? pinkGradientStyle : greenGradientStyle;
  };
  const getTextColor = () => {
    if (tokenLoading) return "text-zinc-400";
    return isDonutToken ? "text-pink-400" : "text-green-400";
  };
  const getBorderColor = () => {
    if (tokenLoading) return "border border-zinc-500/30";
    return isDonutToken ? "border border-pink-500/30" : "border border-green-500/30";
  };
  const getSubTextColor = () => {
    if (tokenLoading) return "text-zinc-500";
    return isDonutToken ? "text-pink-500" : "text-green-500";
  };
  const getSubTextColor2 = () => {
    if (tokenLoading) return "text-zinc-400/80";
    return isDonutToken ? "text-pink-400/80" : "text-green-400/80";
  };

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

  // Text toggle effect: "Share to Claim" (8s) -> fade to "X claims left" (4s) -> fade back -> repeat
  useEffect(() => {
    if (!isActive || hasClaimed || hasShared) return;
    
    const toggleText = () => {
      // Fade in "claims left"
      setShowClaimsLeft(true);
      // Show "X claims left" for 4 seconds, then fade back
      setTimeout(() => {
        setShowClaimsLeft(false);
      }, 4000);
    };

    // Start with "Share to Claim", then toggle after 8 seconds
    const initialTimeout = setTimeout(toggleText, 8000);
    
    // Set up interval: 8s (Share to Claim) + 4s (claims left) = 12s cycle
    const interval = setInterval(toggleText, 12000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isActive, hasClaimed, hasShared]);

  // Fetch token info when campaign is active
  useEffect(() => {
    if (isNativeETH) {
      setTokenSymbol("ETH");
      setTokenDecimals(18);
      setTokenLoading(false);
    } else if (campaign?.[0] && campaign[0] !== "0x0000000000000000000000000000000000000000") {
      fetch(`https://base.blockscout.com/api/v2/tokens/${campaign[0]}`)
        .then((res) => res.json())
        .then((data) => {
          setTokenSymbol(data.symbol || "TOKEN");
          setTokenDecimals(data.decimals || 18);
          setTokenLoading(false);
        })
        .catch(() => {
          setTokenLoading(false);
        });
    } else if (campaign === undefined) {
      // Still loading campaign data
      setTokenLoading(true);
    } else {
      // No active campaign
      setTokenLoading(false);
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
      const amount = (estimatedReward * BigInt(claimData.neynarScore)) / 10000n;
      const formattedAmount = formatUnits(amount, tokenDecimals);
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

  // Calculate estimated amount for share message
  const getEstimatedAmount = useCallback(() => {
    if (!estimatedReward) return "some";
    const amount = formatUnits(estimatedReward, tokenDecimals);
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
    const shareText = `Free-to-play arcade games just landed on Sprinkles by @swishh.eth
$100+ in leaderboard prizes weekly! 🏆

Climb game leaderboards & earn: 
$DONUT, $USDC, & $SPRINKLES! 

I just claimed
${estimatedAmount} $${tokenSymbol} just for playing! ✨`;
    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: ["https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles"],
      });
      setHasShared(true);
    } catch (e) {
      try {
        const encodedText = encodeURIComponent(shareText);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles`,
        });
        setHasShared(true);
      } catch {
        const encodedText = encodeURIComponent(shareText);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles`,
          "_blank"
        );
        setHasShared(true);
      }
    }
  };

  // Share after claiming (brag about it!)
  const handleShareSuccess = useCallback(async () => {
    const shareText = `I just got free glaze from Donut Labs! by @swishh.eth 🧪\n\n${claimedAmount} $${tokenSymbol} claimed! 🎉\n\nJoin the lab, compete in leaderboards 👇`;

    try {
      await sdk.actions.composeCast({
        text: shareText,
        embeds: ["https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles"],
      });
    } catch (e) {
      try {
        const encodedText = encodeURIComponent(shareText);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles`,
        });
      } catch {
        const encodedText = encodeURIComponent(shareText);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles`,
          "_blank"
        );
      }
    }
  }, [claimedAmount, tokenSymbol]);

  const handleVerifyAndClaim = async () => {
    if (!userFid) {
      setVerifyError("Farcaster user not detected. Please open in Warpcast.");
      return;
    }

    if (!address) {
      setVerifyError("Please connect your wallet first");
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);
    setNeedsFollow(false);
    setNeedsSprinkles(false);
    setShowSprinklesActions(false);

    try {
      const res = await fetch("/api/share/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, fid: userFid }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needsFollow) {
          setNeedsFollow(true);
          setHasShared(true);
          return;
        }
        if (data.needsSprinkles) {
          setNeedsSprinkles(true);
          setSprinklesBalance(data.currentBalance || 0);
          setVerifyError(`Need 10K SPRINKLES (you have ${Math.floor(data.currentBalance || 0).toLocaleString()})`);
          return;
        }
        setVerifyError(data.message || data.error || "Verification failed");
        return;
      }

      setNeedsFollow(false);
      setNeedsSprinkles(false);
      setShowSprinklesActions(false);
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

  const handleFollow = async () => {
    try {
      await sdk.actions.openUrl("https://warpcast.com/swishh.eth");
    } catch (e) {
      window.open("https://warpcast.com/swishh.eth", "_blank");
    }
  };

  const handleBuySprinkles = async () => {
    try {
      // Try native Farcaster token view UI first (CAIP-19 asset ID format)
      const experimental = (sdk as any).experimental;
      if (experimental?.viewToken) {
        await experimental.viewToken({
          token: "eip155:8453/erc20:0xa890060BE1788a676dBC3894160f5dc5DeD2C98D"
        });
        return;
      }
      // Fallback - try actions.viewToken
      const actions = sdk.actions as any;
      if (actions.viewToken) {
        await actions.viewToken({
          token: "eip155:8453/erc20:0xa890060BE1788a676dBC3894160f5dc5DeD2C98D"
        });
        return;
      }
      // Final fallback - open Uniswap
      await sdk.actions.openUrl("https://app.uniswap.org/swap?outputCurrency=0xa890060BE1788a676dBC3894160f5dc5DeD2C98D&chain=base");
    } catch (e) {
      // If SDK fails, open Uniswap in browser
      window.open("https://app.uniswap.org/swap?outputCurrency=0xa890060BE1788a676dBC3894160f5dc5DeD2C98D&chain=base", "_blank");
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

  // ============== TILE MODE ==============
  if (tile) {
    // Just claimed success
    if (showClaimSuccess && claimedAmount) {
      return (
        <div className={cn("h-24 rounded-xl bg-zinc-900 p-2 flex flex-col items-center justify-center", getBorderColor())}>
          <CheckCircle className={cn("w-6 h-6 mb-1", getTextColor())} />
          <div className={cn("text-[10px] font-bold", getTextColor())}>Claimed!</div>
          <div className={cn("text-[9px]", getSubTextColor())}>+{claimedAmount} {tokenSymbol}</div>
        </div>
      );
    }

    // Already claimed
    if (hasClaimed && isActive) {
      return (
        <div className={cn("h-24 rounded-xl bg-zinc-900 p-2 flex flex-col items-center justify-center", getBorderColor())}>
          <CheckCircle className={cn("w-6 h-6 mb-1", getTextColor())} />
          <div className={cn("text-[10px] font-bold", getTextColor())}>Claimed!</div>
          <div className="text-[9px] text-gray-500">Check back later</div>
        </div>
      );
    }

    // No active campaign
    if (!isActive) {
      return (
        <div className="h-24 rounded-xl border border-zinc-800 bg-zinc-900 p-2 flex flex-col items-center justify-center">
          <Gift className="w-6 h-6 text-gray-500 mb-1" />
          <div className="text-[10px] font-bold text-gray-500">Share</div>
          <div className="text-[9px] text-gray-600">No campaign</div>
        </div>
      );
    }

    // Has claim data ready - show claim button
    if (claimData) {
      return (
        <button
          onClick={handleClaim}
          disabled={isWriting || isConfirming}
          className={cn(
            "h-24 rounded-xl bg-zinc-900 p-2 flex flex-col items-center justify-center transition-all",
            getBorderColor(),
            (isWriting || isConfirming) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isWriting || isConfirming ? (
            <Loader2 className={cn("w-6 h-6 mb-1 animate-spin", getTextColor())} />
          ) : (
            <Gift className={cn("w-6 h-6 mb-1", getTextColor())} />
          )}
          <div className={cn("text-[10px] font-bold", getTextColor())}>
            {isWriting ? "Confirm..." : isConfirming ? "Claiming..." : `Claim ${tokenSymbol}`}
          </div>
          <div className="text-[9px] text-gray-400">Tap to claim</div>
        </button>
      );
    }

    // Needs SPRINKLES
    if (needsSprinkles) {
      // First show "NOT ENOUGH SPRINKLES" message, then show action buttons on tap
      if (!showSprinklesActions) {
        return (
          <button
            onClick={() => setShowSprinklesActions(true)}
            className="h-24 rounded-xl p-2 flex flex-col items-center justify-center transition-all active:scale-[0.98]"
            style={sprinklesRequirementGradientStyle}
          >
            <Coins className="w-6 h-6 text-green-400 mb-1" />
            <div className="text-[10px] font-bold text-green-400">NOT ENOUGH SPRINKLES</div>
            <div className="text-[9px] text-green-400/70">Need 10K (have {Math.floor(sprinklesBalance).toLocaleString()})</div>
          </button>
        );
      }
      
      // Show action buttons after tap
      return (
        <div className="h-24 rounded-xl p-2 flex flex-col items-center justify-center gap-1" style={sprinklesRequirementGradientStyle}>
          <button
            onClick={handleBuySprinkles}
            className="flex-1 w-full bg-green-500 hover:bg-green-400 rounded-lg flex items-center justify-center gap-1 transition-all"
          >
            <Coins className="w-4 h-4 text-white" />
            <span className="font-bold text-[10px] text-white">Get SPRINKLES</span>
          </button>
          <button
            onClick={handleVerifyAndClaim}
            disabled={isVerifying}
            className="flex-1 w-full bg-zinc-700 hover:bg-zinc-600 rounded-lg flex items-center justify-center gap-1 transition-all"
          >
            {isVerifying ? (
              <Loader2 className="w-3 h-3 animate-spin text-white" />
            ) : (
              <CheckCircle className="w-3 h-3 text-white" />
            )}
            <span className="font-bold text-[10px] text-white">Verify</span>
          </button>
        </div>
      );
    }

    // Needs to follow
    if (needsFollow) {
      return (
        <div className="h-24 rounded-xl border border-zinc-800 bg-zinc-900 p-2 flex flex-col items-center justify-center gap-1">
          <button
            onClick={handleFollow}
            className="flex-1 w-full bg-purple-500 hover:bg-purple-400 rounded-lg flex items-center justify-center gap-1 transition-all"
          >
            <UserPlus className="w-4 h-4 text-white" />
            <span className="font-bold text-[10px] text-white">Follow</span>
          </button>
          <button
            onClick={handleVerifyAndClaim}
            disabled={isVerifying}
            className="flex-1 w-full bg-zinc-700 hover:bg-zinc-600 rounded-lg flex items-center justify-center gap-1 transition-all"
          >
            {isVerifying ? (
              <Loader2 className="w-3 h-3 animate-spin text-white" />
            ) : (
              <CheckCircle className="w-3 h-3 text-white" />
            )}
            <span className="font-bold text-[10px] text-white">Verify</span>
          </button>
        </div>
      );
    }

    // Has shared - show verify button (or error)
    if (hasShared) {
      if (verifyError) {
        return (
          <button
            onClick={() => {
              setVerifyError(null);
              setHasShared(false);
              setNeedsSprinkles(false);
              setShowSprinklesActions(false);
            }}
            className="h-24 rounded-xl border border-red-500/50 bg-red-950/30 p-2 flex flex-col items-center justify-center transition-colors"
          >
            <XCircle className="w-6 h-6 text-red-400 mb-1" />
            <div className="text-[9px] font-bold text-red-400 text-center line-clamp-2">
              {verifyError}
            </div>
            <div className="text-[8px] text-red-400/70">Tap to retry</div>
          </button>
        );
      }

      return (
        <button
          onClick={handleVerifyAndClaim}
          disabled={isVerifying}
          className={cn(
            "h-24 rounded-xl p-2 flex flex-col items-center justify-center transition-colors",
            isVerifying && "opacity-50 cursor-not-allowed"
          )}
          style={getActiveGradient()}
        >
          {isVerifying ? (
            <Loader2 className={cn("w-6 h-6 mb-1 animate-spin", getTextColor())} />
          ) : (
            <CheckCircle className={cn("w-6 h-6 mb-1", getTextColor())} />
          )}
          <div className={cn("text-[10px] font-bold", getTextColor())}>
            {isVerifying ? "Checking..." : "Verify"}
          </div>
          <div className={cn("text-[9px]", getSubTextColor2())}>Tap to verify</div>
        </button>
      );
    }

    // Default - show share to claim
    return (
      <button
        onClick={handleShareToQualify}
        disabled={!userFid}
        className={cn(
          "h-24 rounded-xl p-2 flex flex-col items-center justify-center transition-colors",
          !userFid && "opacity-50 cursor-not-allowed"
        )}
        style={isActive && claimsRemaining > 0 ? getActiveGradient() : { background: 'rgb(24,24,27)', border: '1px solid rgb(39,39,42)' }}
      >
        <Gift className={cn("w-6 h-6 mb-1", getTextColor())} />
        <div className={cn("text-[10px] font-bold", getTextColor())}>SHARE TO CLAIM</div>
      </button>
    );
  }

  // ============== COMPACT MODE (for games page) ==============
  // Just claimed success - show claimed state (disabled)
  if (showClaimSuccess && claimedAmount) {
    if (compact) {
      return (
        <div 
          className="rounded-xl p-2 flex items-center justify-center"
          style={getGradient()}
        >
          <div className={cn("flex items-center gap-1.5", getTextColor())}>
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="font-semibold text-xs">Claimed!</span>
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

  // Already claimed state (from previous session) - show claimed (disabled)
  if (hasClaimed && isActive) {
    if (compact) {
      return (
        <div 
          className="rounded-xl p-2 h-[36px] flex items-center justify-center"
          style={getGradient()}
        >
          <div className={cn("flex items-center gap-1.5", getTextColor())}>
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="font-semibold text-xs">Claimed!</span>
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
        <div 
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] flex items-center justify-center opacity-60"
        >
          <div className="flex items-center gap-1.5 text-gray-400">
            <Gift className="w-3.5 h-3.5" />
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
            "rounded-xl p-2 h-[36px] flex items-center justify-center gap-1.5 transition-all",
            (isWriting || isConfirming) && "opacity-50 cursor-not-allowed"
          )}
          style={getActiveGradient()}
        >
          {isWriting || isConfirming ? (
            <Loader2 className={cn("w-3.5 h-3.5 animate-spin", getTextColor())} />
          ) : (
            <Gift className={cn("w-3.5 h-3.5", getTextColor())} />
          )}
          <span className={cn("font-semibold text-xs", getTextColor())}>
            {isWriting ? "Approve..." : isConfirming ? "Claiming..." : `Claim ${tokenSymbol}`}
          </span>
        </button>
      );
    }
    return (
      <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-400">
            Ready to claim
          </div>
          <div className="text-xs text-amber-400 font-semibold">
            ~{estimatedReward
              ? formatUnits((estimatedReward * BigInt(claimData.neynarScore)) / 10000n, tokenDecimals)
              : "..."} {tokenSymbol}
          </div>
        </div>

        {verifyError && (
          <div className="flex rounded-lg overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)] mb-2">
            <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-lg p-2">
              <div className="flex items-start gap-2">
                <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-300/90 leading-relaxed break-words">
                  {verifyError}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setVerifyError(null);
                setHasShared(false);
                setNeedsFollow(false);
                setNeedsSprinkles(false);
                setShowSprinklesActions(false);
              }}
              className="flex items-center justify-center px-3 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-lg hover:bg-red-900/50 transition-colors"
            >
              <svg
                className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)] animate-[spin_3s_linear_infinite_reverse]"
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
            {isWriting ? "Confirm..." : isConfirming ? "Claiming..." : `Claim ${tokenSymbol}`}
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

  // Active campaign - main UI (COMPACT MODE)
  if (compact) {
    // Show error state if there's an error (including SPRINKLES requirement)
    if (verifyError) {
      // Special styling for SPRINKLES requirement
      if (needsSprinkles) {
        // First show "NOT ENOUGH SPRINKLES" message, then show action buttons on tap
        if (!showSprinklesActions) {
          return (
            <button
              onClick={() => setShowSprinklesActions(true)}
              className="rounded-xl p-2 h-[36px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
              style={sprinklesRequirementGradientStyle}
            >
              <Coins className="w-3.5 h-3.5 text-green-400" />
              <span className="font-semibold text-[10px] text-green-400">NEED 10K SPRINKLES</span>
            </button>
          );
        }
        
        // Show action buttons after tap
        return (
          <div className="flex gap-1.5 h-[36px]">
            <button
              onClick={handleBuySprinkles}
              className="flex-1 rounded-xl p-2 flex items-center justify-center gap-1 transition-all"
              style={sprinklesRequirementGradientStyle}
            >
              <Coins className="w-3.5 h-3.5 text-green-400" />
              <span className="font-semibold text-[10px] text-green-400">Get SPRINKLES</span>
            </button>
            <button
              onClick={() => {
                setVerifyError(null);
                setNeedsSprinkles(false);
                setShowSprinklesActions(false);
                handleVerifyAndClaim();
              }}
              disabled={isVerifying}
              className={cn(
                "flex-1 rounded-xl p-2 flex items-center justify-center gap-1 transition-all",
                isVerifying && "opacity-50 cursor-not-allowed"
              )}
              style={getGradient()}
            >
              {isVerifying ? (
                <Loader2 className={cn("w-3.5 h-3.5 animate-spin", getTextColor())} />
              ) : (
                <CheckCircle className={cn("w-3.5 h-3.5", getTextColor())} />
              )}
              <span className={cn("font-semibold text-[10px]", getTextColor())}>
                {isVerifying ? "..." : "Retry"}
              </span>
            </button>
          </div>
        );
      }

      return (
        <button
          onClick={() => {
            setVerifyError(null);
            setHasShared(false);
            setNeedsFollow(false);
            setNeedsSprinkles(false);
            setShowSprinklesActions(false);
          }}
          className="rounded-xl p-2 h-[36px] flex items-center justify-between transition-colors"
          style={{ 
            background: 'linear-gradient(135deg, rgba(127,29,29,0.3) 0%, rgba(153,27,27,0.2) 100%)',
            border: '1px solid rgba(239,68,68,0.5)'
          }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-[10px] text-red-300 leading-tight truncate">
              {verifyError}
            </span>
          </div>
          <svg
            className="w-4 h-4 text-red-400 flex-shrink-0 ml-2 animate-[spin_3s_linear_infinite_reverse]"
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
      );
    }

    // State 1: Initial - Show token icon, tap to share with animated text toggle
    if (!hasShared) {
      return (
        <button
          onClick={handleShareToQualify}
          disabled={!userFid}
          className={cn(
            "rounded-xl p-2 h-[36px] flex items-center justify-center transition-all relative overflow-hidden",
            !userFid && "opacity-50 cursor-not-allowed"
          )}
          style={getActiveGradient()}
        >
          {/* Share to Claim state */}
          <div
            className="flex items-center transition-opacity duration-300 ease-in-out absolute inset-0 justify-center"
            style={{ opacity: showClaimsLeft ? 0 : 1 }}
          >
            <span className={cn("font-semibold text-xs", getTextColor())}>SHARE TO CLAIM</span>
          </div>
          {/* Claims left state */}
          <div
            className="flex items-center transition-opacity duration-300 ease-in-out absolute inset-0 justify-center"
            style={{ opacity: showClaimsLeft ? 1 : 0 }}
          >
            <span className={cn("font-semibold text-xs", getTextColor())}>{claimsRemaining} CLAIMS LEFT</span>
          </div>
        </button>
      );
    }

    // State 2: Needs to follow @swishh.eth
    if (needsFollow) {
      return (
        <div className="flex gap-1.5 h-[36px]">
          <button
            onClick={handleFollow}
            className="flex-1 rounded-xl p-2 flex items-center justify-center gap-1 transition-all"
            style={{ 
              background: 'linear-gradient(135deg, rgba(147,51,234,0.25) 0%, rgba(126,34,206,0.15) 100%)',
              border: '1px solid rgba(147,51,234,0.5)'
            }}
          >
            <UserPlus className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold text-[10px] text-purple-400">Follow</span>
          </button>
          <button
            onClick={handleVerifyAndClaim}
            disabled={isVerifying}
            className={cn(
              "flex-1 rounded-xl p-2 flex items-center justify-center gap-1 transition-all",
              isVerifying && "opacity-50 cursor-not-allowed"
            )}
            style={getGradient()}
          >
            {isVerifying ? (
              <Loader2 className={cn("w-3.5 h-3.5 animate-spin", getTextColor())} />
            ) : (
              <CheckCircle className={cn("w-3.5 h-3.5", getTextColor())} />
            )}
            <span className={cn("font-semibold text-[10px]", getTextColor())}>
              {isVerifying ? "..." : "Verify"}
            </span>
          </button>
        </div>
      );
    }

    // State 3: Shared - Show verify button
    return (
      <button
        onClick={handleVerifyAndClaim}
        disabled={isVerifying || !userFid}
        className={cn(
          "rounded-xl p-2 h-[36px] flex items-center justify-center gap-1.5 transition-all",
          (isVerifying || !userFid) && "opacity-50 cursor-not-allowed"
        )}
        style={getActiveGradient()}
      >
        {isVerifying ? (
          <Loader2 className={cn("w-3.5 h-3.5 animate-spin", getTextColor())} />
        ) : (
          <CheckCircle className={cn("w-3.5 h-3.5", getTextColor())} />
        )}
        <span className="font-semibold text-xs text-white">
          {isVerifying ? "Checking..." : "Verify"}
        </span>
      </button>
    );
  }

  // ============== FULL MODE (non-compact) ==============
  return (
    <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Gift className={cn("w-4 h-4", getTextColor())} />
          <span className="font-bold text-white text-sm">SHARE TO CLAIM</span>
        </div>
        <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
          {claimsRemaining} left
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-3">
        Requires <span className="text-green-400 font-semibold">10,000 SPRINKLES</span> + follow @swishh.eth
      </div>

      {verifyError && (
        <div className="flex rounded-lg overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)] mb-2">
          <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-lg p-2">
            <div className="flex items-start gap-2">
              <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-300/90 leading-relaxed break-words">
                {verifyError}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setVerifyError(null);
              setHasShared(false);
              setNeedsFollow(false);
              setNeedsSprinkles(false);
              setShowSprinklesActions(false);
            }}
            className="flex items-center justify-center px-3 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-lg hover:bg-red-900/50 transition-colors"
          >
            <svg
              className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)] animate-[spin_3s_linear_infinite_reverse]"
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
      )}

      <div className="flex gap-2">
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