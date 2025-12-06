// components/share-reward-button.tsx
"use client";

import { useState, useEffect } from "react";
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
};

export function ShareRewardButton({ userFid }: ShareRewardButtonProps) {
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

  // Get estimated reward (using a default score of 5000 = 0.5)
  const { data: estimatedReward } = useReadContract({
    address: SHARE_REWARDS_ADDRESS as `0x${string}`,
    abi: SHARE_REWARDS_ABI,
    functionName: "calculateReward",
    args: [BigInt(5000)],
    chainId: base.id,
  });

  const campaign = campaignInfo as CampaignInfo | undefined;
  const isActive = campaign?.[5] && campaign[2] > 0n;
  const claimsRemaining = campaign
    ? Number(campaign[3] - campaign[4])
    : 0;

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

  // Handle successful claim
  useEffect(() => {
    if (isSuccess) {
      refetchCampaign();
      refetchClaimed();
      setClaimData(null);
    }
  }, [isSuccess, refetchCampaign, refetchClaimed]);

  const handleShare = async () => {
    try {
      await sdk.actions.openUrl({
        url: "https://warpcast.com/~/compose?text=Check%20out%20Donut%20Labs%20%F0%9F%8D%A9&embeds[]=https://warpcast.com/miniapps/donutlabs",
      });
    } catch (e) {
      window.open(
        "https://warpcast.com/~/compose?text=Check%20out%20Donut%20Labs%20%F0%9F%8D%A9&embeds[]=https://warpcast.com/miniapps/donutlabs",
        "_blank"
      );
    }
  };

  const handleVerifyAndClaim = async () => {
    if (!address || !userFid) return;

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
        neynarScore: data.neynarScore,
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

  // Already claimed state
  if (hasClaimed && isActive) {
    return (
      <div className="bg-zinc-900 border border-green-500/30 rounded-xl p-4">
        <div className="flex items-center justify-center gap-2 text-green-400">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">Reward Claimed!</span>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          Thanks for sharing Donut Labs 🍩
        </p>
      </div>
    );
  }

  // No active campaign - greyed out state
  if (!isActive) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 opacity-60">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-500">
              No Share Campaign Available
            </div>
            <div className="text-xs text-gray-600">
              Check back later for rewards 🍩
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active campaign - full UI
  return (
    <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          <span className="font-bold text-white">Share for Rewards!</span>
        </div>
        <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
          {claimsRemaining} spots left
        </div>
      </div>

      <div className="text-sm text-gray-400 mb-4">
        Share the mini app and earn up to{" "}
        <span className="text-amber-400 font-semibold">
          {estimatedReward
            ? formatUnits(estimatedReward * 3n, tokenDecimals)
            : "..."}{" "}
          {tokenSymbol}
        </span>{" "}
        based on your Neynar score!
      </div>

      {verifyError && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-3 bg-red-500/10 rounded-lg p-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{verifyError}</span>
        </div>
      )}

      {!claimData ? (
        <div className="space-y-2">
          {/* Main Share Button - Pulsing */}
          <button
            onClick={handleShare}
            className={cn(
              "w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 px-4 rounded-xl transition-all duration-300",
              isPulsing && "scale-[0.97]"
            )}
          >
            <Share2 className="w-5 h-5" />
            Share Mini App for 🍩
          </button>

          {/* Verify Button */}
          <button
            onClick={handleVerifyAndClaim}
            disabled={isVerifying || !userFid}
            className={cn(
              "w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors",
              (isVerifying || !userFid) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Already Shared? Verify & Claim
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-400 mb-1">Your Neynar Score</div>
                <div className="text-lg font-bold text-white">
                  {(claimData.neynarScore / 10000).toFixed(4)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">Your Reward</div>
                <div className="text-lg font-bold text-amber-400">
                  ~
                  {estimatedReward
                    ? formatUnits(
                        (estimatedReward * BigInt(claimData.neynarScore)) / 5000n,
                        tokenDecimals
                      )
                    : "..."}{" "}
                  {tokenSymbol}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={isWriting || isConfirming}
            className={cn(
              "w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-4 px-4 rounded-xl transition-all duration-300",
              (isWriting || isConfirming) && "opacity-50 cursor-not-allowed",
              isPulsing && !isWriting && !isConfirming && "scale-[0.97]"
            )}
          >
            {isWriting || isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isWriting ? "Confirm in wallet..." : "Claiming..."}
              </>
            ) : (
              <>
                <Gift className="w-5 h-5" />
                Claim {tokenSymbol} Reward
              </>
            )}
          </button>

          <button
            onClick={() => {
              setClaimData(null);
              setVerifyError(null);
              resetWrite();
            }}
            className="w-full text-sm text-gray-400 hover:text-white py-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Campaign info footer */}
      <div className="mt-3 pt-3 border-t border-amber-500/20 flex justify-between text-xs text-gray-500">
        <span>Reward: {tokenSymbol}</span>
        <span>
          Ends:{" "}
          {campaign?.[7]
            ? new Date(Number(campaign[7]) * 1000).toLocaleDateString()
            : "—"}
        </span>
      </div>
    </div>
  );
}