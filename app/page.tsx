"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, zeroAddress, type Address } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";
import DonutMiner from "@/components/donut-miner";
import SprinklesMiner from "@/components/sprinkles-miner";
import { ShareRewardButton } from "@/components/share-reward-button";
import { ArrowLeft, Flame, Droplets, Sparkles, X } from "lucide-react";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { SPRINKLES_MINER_ADDRESS, SPRINKLES_MINER_ABI } from "@/lib/contracts/sprinkles";
import { cn } from "@/lib/utils";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

// Contract addresses for burn
const SPRINKLES_LP_TOKEN = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668" as Address;
const SPRINKLES_AUCTION = "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as Address;

const DEADLINE_BUFFER_SECONDS = 5 * 60;

const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const SPRINKLES_AUCTION_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPaymentTokenAmount", type: "uint256" },
    ],
    name: "buy",
    outputs: [
      { internalType: "uint256", name: "paymentAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardAmount", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getAuctionState",
    outputs: [
      { internalType: "uint16", name: "epochId", type: "uint16" },
      { internalType: "uint192", name: "initPrice", type: "uint192" },
      { internalType: "uint40", name: "startTime", type: "uint40" },
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "uint256", name: "rewardsAvailable", type: "uint256" },
      { internalType: "uint256", name: "userLPBalance", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Dutch auction constants for DONUT miner
const DONUT_AUCTION_DURATION = 3600; // 1 hour
const DONUT_MIN_PRICE = 100000000000000n; // 0.0001 ETH

// Dutch auction constants for SPRINKLES miner
const SPRINKLES_AUCTION_DURATION = 3600; // 1 hour
const SPRINKLES_MIN_PRICE = 1000000000000000000n; // 1 DONUT

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatEth = (value: bigint, maximumFractionDigits = 2) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const formatTokenAmount = (
  value: bigint,
  decimals: number = 18,
  maximumFractionDigits = 2
) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return formatUnits(value, decimals);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

// Client-side price calculation for Dutch auction
const calculateDonutPrice = (initPrice: bigint, startTime: number | bigint): bigint => {
  const now = Math.floor(Date.now() / 1000);
  const start = typeof startTime === 'bigint' ? Number(startTime) : startTime;
  const elapsed = now - start;
  
  if (elapsed >= DONUT_AUCTION_DURATION) return DONUT_MIN_PRICE;
  if (elapsed <= 0) return initPrice;
  
  const priceRange = initPrice - DONUT_MIN_PRICE;
  const decay = (priceRange * BigInt(elapsed)) / BigInt(DONUT_AUCTION_DURATION);
  const currentPrice = initPrice - decay;
  
  return currentPrice > DONUT_MIN_PRICE ? currentPrice : DONUT_MIN_PRICE;
};

const calculateSprinklesPrice = (initPrice: bigint, startTime: number | bigint): bigint => {
  const now = Math.floor(Date.now() / 1000);
  const start = typeof startTime === 'bigint' ? Number(startTime) : startTime;
  const elapsed = now - start;
  
  if (elapsed >= SPRINKLES_AUCTION_DURATION) return SPRINKLES_MIN_PRICE;
  if (elapsed <= 0) return initPrice;
  
  const priceRange = initPrice - SPRINKLES_MIN_PRICE;
  const decay = (priceRange * BigInt(elapsed)) / BigInt(SPRINKLES_AUCTION_DURATION);
  const currentPrice = initPrice - decay;
  
  return currentPrice > SPRINKLES_MIN_PRICE ? currentPrice : SPRINKLES_MIN_PRICE;
};

// Video tile component with lazy loading
function VideoTile({ 
  videoSrc, 
  onClick,
  children 
}: { 
  videoSrc: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setIsLoaded(true);
    video.addEventListener('canplay', handleCanPlay);
    
    const timeout = setTimeout(() => {
      video.load();
    }, 100);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <button
      onClick={onClick}
      className="relative flex-1 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all active:scale-[0.98]"
    >
      <div className="absolute inset-0 bg-black" />
      
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        autoPlay
        muted
        playsInline
        loop
        preload="none"
        src={videoSrc}
      />
      
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        {children}
      </div>
    </button>
  );
}

// Burn Modal Component
function BurnModal({ 
  isOpen, 
  onClose, 
  address,
  donutUsdPrice,
  sprinklesLpPrice,
  primaryConnector,
  connectAsync,
}: { 
  isOpen: boolean; 
  onClose: () => void;
  address: Address | undefined;
  donutUsdPrice: number;
  sprinklesLpPrice: number;
  primaryConnector: any;
  connectAsync: any;
}) {
  const [sprinklesBurnResult, setSprinklesBurnResult] = useState<"success" | "failure" | null>(null);
  const [sprinklesTxStep, setSprinklesTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const sprinklesResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBuyingRef = useRef(false);

  const { data: sprinklesAuctionData, refetch: refetchSprinklesAuction } = useReadContract({
    address: SPRINKLES_AUCTION,
    abi: SPRINKLES_AUCTION_ABI,
    functionName: "getAuctionState",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 15_000, enabled: isOpen },
  });

  const sprinklesAuctionState = useMemo(() => {
    if (!sprinklesAuctionData) return undefined;
    const [epochId, initPrice, startTime, price, rewardsAvailable, userLPBalance] = sprinklesAuctionData;
    return { epochId, initPrice, startTime, price, rewardsAvailable, userLPBalance };
  }, [sprinklesAuctionData]);

  const {
    data: sprinklesTxHash,
    writeContract: writeSprinklesContract,
    isPending: isSprinklesWriting,
    reset: resetSprinklesWrite,
    error: sprinklesWriteError,
  } = useWriteContract();

  const { data: sprinklesReceipt, isLoading: isSprinklesConfirming } = useWaitForTransactionReceipt({
    hash: sprinklesTxHash,
    chainId: base.id,
  });

  const showSprinklesResult = useCallback((result: "success" | "failure") => {
    if (sprinklesResultTimeoutRef.current) clearTimeout(sprinklesResultTimeoutRef.current);
    setSprinklesBurnResult(result);
    sprinklesResultTimeoutRef.current = setTimeout(() => {
      setSprinklesBurnResult(null);
      sprinklesResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  const resetSprinklesState = useCallback(() => {
    setSprinklesTxStep("idle");
    isBuyingRef.current = false;
    resetSprinklesWrite();
  }, [resetSprinklesWrite]);

  const handleSprinklesBurn = useCallback(async () => {
    if (!sprinklesAuctionState) return;
    if (isBuyingRef.current && sprinklesTxStep === "buying") return;
    
    await refetchSprinklesAuction();
    setSprinklesBurnResult(null);
    
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address");

      const price = sprinklesAuctionState.price;
      const epochId = BigInt(sprinklesAuctionState.epochId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

      if (sprinklesTxStep === "idle") {
        setSprinklesTxStep("approving");
        writeSprinklesContract({
          account: targetAddress as Address,
          address: SPRINKLES_LP_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SPRINKLES_AUCTION, price],
          chainId: base.id,
        });
        return;
      }

      if (sprinklesTxStep === "buying") {
        isBuyingRef.current = true;
        writeSprinklesContract({
          account: targetAddress as Address,
          address: SPRINKLES_AUCTION,
          abi: SPRINKLES_AUCTION_ABI,
          functionName: "buy",
          args: [epochId, deadline, price],
          chainId: base.id,
        });
      }
    } catch (error) {
      console.error("SPRINKLES burn failed:", error);
      showSprinklesResult("failure");
      resetSprinklesState();
    }
  }, [address, connectAsync, sprinklesAuctionState, primaryConnector, sprinklesTxStep, writeSprinklesContract, showSprinklesResult, resetSprinklesState, refetchSprinklesAuction]);

  useEffect(() => {
    if (sprinklesWriteError) {
      const isUserRejection = sprinklesWriteError.message?.includes("User rejected") || 
                              sprinklesWriteError.message?.includes("user rejected") ||
                              sprinklesWriteError.message?.includes("User denied");
      if (!isUserRejection) {
        showSprinklesResult("failure");
      }
      resetSprinklesState();
    }
  }, [sprinklesWriteError, showSprinklesResult, resetSprinklesState]);

  useEffect(() => {
    if (!sprinklesReceipt) return;
    
    if (sprinklesReceipt.status === "reverted") {
      showSprinklesResult("failure");
      resetSprinklesState();
      refetchSprinklesAuction();
      return;
    }
    
    if (sprinklesTxStep === "approving") {
      resetSprinklesWrite();
      setSprinklesTxStep("buying");
      isBuyingRef.current = false;
      return;
    }
    
    if (sprinklesTxStep === "buying") {
      showSprinklesResult("success");
      resetSprinklesState();
      refetchSprinklesAuction();
    }
  }, [sprinklesReceipt, refetchSprinklesAuction, resetSprinklesWrite, showSprinklesResult, sprinklesTxStep, resetSprinklesState]);

  useEffect(() => {
    if (
      sprinklesTxStep === "buying" && 
      !isSprinklesWriting && 
      !isSprinklesConfirming && 
      !sprinklesTxHash &&
      !isBuyingRef.current
    ) {
      handleSprinklesBurn();
    }
  }, [sprinklesTxStep, isSprinklesWriting, isSprinklesConfirming, sprinklesTxHash, handleSprinklesBurn]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (sprinklesResultTimeoutRef.current) clearTimeout(sprinklesResultTimeoutRef.current);
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetSprinklesState();
      setSprinklesBurnResult(null);
    }
  }, [isOpen, resetSprinklesState]);

  const handleExternalLink = useCallback(async (url: string) => {
    try {
      await sdk.actions.openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const displayPrice = sprinklesAuctionState?.price;
  const sprinklesPriceDisplay = displayPrice ? formatTokenAmount(displayPrice, 18, 2) : "—";
  const sprinklesRewardsDisplay = sprinklesAuctionState ? formatTokenAmount(sprinklesAuctionState.rewardsAvailable, 18, 2) : "—";
  const sprinklesUserLPDisplay = sprinklesAuctionState ? formatTokenAmount(sprinklesAuctionState.userLPBalance, 18, 2) : "0";

  const lpPayUsd = displayPrice && sprinklesLpPrice > 0
    ? (Number(formatEther(displayPrice)) * sprinklesLpPrice).toFixed(2)
    : null;
  const donutGetUsd = sprinklesAuctionState && donutUsdPrice > 0
    ? (Number(formatEther(sprinklesAuctionState.rewardsAvailable)) * donutUsdPrice).toFixed(2)
    : null;

  const sprinklesButtonLabel = useMemo(() => {
    if (!sprinklesAuctionState) return "Loading…";
    if (sprinklesBurnResult === "success") return "SUCCESS";
    if (sprinklesBurnResult === "failure") return "FAILED";
    if (isSprinklesWriting || isSprinklesConfirming) {
      if (sprinklesTxStep === "approving") return "APPROVING…";
      if (sprinklesTxStep === "buying") return "BURNING…";
      return "PROCESSING…";
    }
    return "BURN";
  }, [sprinklesBurnResult, isSprinklesConfirming, isSprinklesWriting, sprinklesAuctionState, sprinklesTxStep]);

  const hasInsufficientSprinklesLP = sprinklesAuctionState && displayPrice && sprinklesAuctionState.userLPBalance < displayPrice;
  const hasNoSprinklesRewards = sprinklesAuctionState && sprinklesAuctionState.rewardsAvailable === 0n;
  const sprinklesPriceIsZero = displayPrice === 0n;

  const isSprinklesBurnDisabled = !sprinklesAuctionState || isSprinklesWriting || isSprinklesConfirming || sprinklesBurnResult !== null || hasInsufficientSprinklesLP || hasNoSprinklesRewards || sprinklesPriceIsZero;

  const sprinklesProfitLoss = useMemo(() => {
    if (!sprinklesAuctionState || !displayPrice || sprinklesLpPrice <= 0 || donutUsdPrice <= 0) return null;
    const lpValueUsd = Number(formatEther(displayPrice)) * sprinklesLpPrice;
    const rewardsValueUsd = Number(formatEther(sprinklesAuctionState.rewardsAvailable)) * donutUsdPrice;
    const profitLoss = rewardsValueUsd - lpValueUsd;
    return { profitLoss, isProfitable: profitLoss > 0, lpValueUsd, rewardsValueUsd };
  }, [sprinklesAuctionState, displayPrice, sprinklesLpPrice, donutUsdPrice]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span className="font-bold">SPRINKLES LP Burn</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Pay / Get Row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 rounded-lg border border-amber-500/30 bg-black/50 px-3 py-2">
              <div className="text-[9px] text-gray-400 uppercase">Pay</div>
              <div className="text-base font-bold text-amber-400">{sprinklesPriceDisplay} LP</div>
              <div className="text-[9px] text-gray-500 h-3">
                {lpPayUsd ? `$${lpPayUsd}` : sprinklesLpPrice === 0 ? "loading..." : ""}
              </div>
            </div>
            <div className="text-gray-600">→</div>
            <div className="flex-1 rounded-lg border border-zinc-700 bg-black/50 px-3 py-2">
              <div className="text-[9px] text-gray-400 uppercase">Get</div>
              <div className="text-base font-bold text-white">🍩 {sprinklesRewardsDisplay}</div>
              <div className="text-[9px] text-gray-500 h-3">
                {donutGetUsd ? `$${donutGetUsd}` : donutUsdPrice === 0 ? "loading..." : ""}
              </div>
            </div>
          </div>

          {/* Profit/Loss */}
          {sprinklesProfitLoss && (
            <div className={cn(
              "text-center text-[10px] font-semibold px-2 py-1 rounded mb-3",
              sprinklesProfitLoss.isProfitable ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
            )}>
              {sprinklesProfitLoss.isProfitable ? "💰 +" : "⚠️ "}${Math.abs(sprinklesProfitLoss.profitLoss).toFixed(2)}
            </div>
          )}

          {/* Status Messages */}
          {sprinklesPriceIsZero && (
            <div className="text-center text-[9px] text-gray-400 mb-3">
              Epoch ended - waiting for next auction
            </div>
          )}
          
          {hasInsufficientSprinklesLP && !sprinklesPriceIsZero && (
            <div className="text-center text-[9px] text-amber-400 mb-3 py-1 bg-amber-500/10 rounded">
              Insufficient LP balance
            </div>
          )}

          {hasNoSprinklesRewards && !sprinklesPriceIsZero && !hasInsufficientSprinklesLP && (
            <div className="text-center text-[9px] text-gray-400 mb-3">
              No rewards available
            </div>
          )}

          {/* Burn Button */}
          <button
            onClick={handleSprinklesBurn}
            disabled={isSprinklesBurnDisabled}
            className={cn(
              "w-full rounded-lg py-2.5 text-sm font-bold transition-all",
              sprinklesBurnResult === "success"
                ? "bg-green-500 text-white"
                : sprinklesBurnResult === "failure"
                  ? "bg-red-500 text-white"
                  : isSprinklesBurnDisabled
                    ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                    : "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]"
            )}
          >
            {sprinklesButtonLabel}
          </button>

          {/* LP Balance & Get LP Link */}
          <div className="flex items-center justify-between mt-3 text-[10px]">
            <span className="text-gray-400">
              Balance: <span className="text-white font-semibold">{sprinklesUserLPDisplay}</span> LP
            </span>
            <button
              onClick={() => handleExternalLink("https://aerodrome.finance/deposit?token0=0xa890060BE1788a676dBC3894160f5dc5DeD2C98D&token1=0xAE4a37d554C6D6F3E398546d8566B25052e0169C&type=-1")}
              className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
            >
              Get LP on Aerodrome →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<"donut" | "sprinkles" | null>(null);
  const [showBurnModal, setShowBurnModal] = useState(false);
  
  // Client-side interpolated prices
  const [interpolatedDonutPrice, setInterpolatedDonutPrice] = useState<bigint | null>(null);
  const [interpolatedSprinklesPrice, setInterpolatedSprinklesPrice] = useState<bigint | null>(null);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();

  const getConnector = useCallback(() => {
    const injected = connectors.find(c => c.id === 'injected' || c.name === 'MetaMask');
    if (injected) return injected;
    const coinbase = connectors.find(c => c.id === 'coinbaseWalletSDK' || c.name === 'Coinbase Wallet');
    if (coinbase) return coinbase;
    return connectors[0];
  }, [connectors]);

  const primaryConnector = getConnector();

  const handleConnect = useCallback(async () => {
    if (!primaryConnector) {
      alert("No wallet connector available. Do you have MetaMask or Rabby installed?");
      return;
    }
    try {
      await connectAsync({ connector: primaryConnector, chainId: base.id });
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  }, [connectAsync, primaryConnector]);

  const { data: rawMinerState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getMiner",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 15_000,
    },
  });

  const { data: sprinklesSlot0 } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getSlot0",
    chainId: base.id,
    query: {
      refetchInterval: 15_000,
    },
  });

  const { data: sprinklesPriceFallback } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getPrice",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  const donutInitPrice = rawMinerState ? (rawMinerState as any).initPrice as bigint : undefined;
  const donutStartTime = rawMinerState ? (rawMinerState as any).startTime as bigint : undefined;
  
  const sprinklesInitPrice = sprinklesSlot0 
    ? BigInt((sprinklesSlot0 as any).initPrice ?? (sprinklesSlot0 as any)[2] ?? 0)
    : undefined;
  const sprinklesStartTime = sprinklesSlot0 
    ? Number((sprinklesSlot0 as any).startTime ?? (sprinklesSlot0 as any)[3] ?? 0)
    : undefined;

  useEffect(() => {
    if (!donutInitPrice || !donutStartTime) {
      setInterpolatedDonutPrice(null);
      return;
    }
    
    setInterpolatedDonutPrice(calculateDonutPrice(donutInitPrice, donutStartTime));
    
    const interval = setInterval(() => {
      setInterpolatedDonutPrice(calculateDonutPrice(donutInitPrice, donutStartTime));
    }, 1_000);
    
    return () => clearInterval(interval);
  }, [donutInitPrice, donutStartTime]);

  useEffect(() => {
    if (!sprinklesInitPrice || !sprinklesStartTime) {
      setInterpolatedSprinklesPrice(null);
      return;
    }
    
    setInterpolatedSprinklesPrice(calculateSprinklesPrice(sprinklesInitPrice, sprinklesStartTime));
    
    const interval = setInterval(() => {
      setInterpolatedSprinklesPrice(calculateSprinklesPrice(sprinklesInitPrice, sprinklesStartTime));
    }, 1_000);
    
    return () => clearInterval(interval);
  }, [sprinklesInitPrice, sprinklesStartTime]);

  const donutPrice = interpolatedDonutPrice ?? (rawMinerState ? (rawMinerState as any).price as bigint : undefined);
  const sprinklesPriceValue = interpolatedSprinklesPrice ?? (sprinklesPriceFallback as bigint | undefined);

  const { data: sprinklesAuctionRewards } = useReadContract({
    address: "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as `0x${string}`,
    abi: [
      {
        inputs: [],
        name: "getRewardsAvailable",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "getRewardsAvailable",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  const { data: sprinklesAuctionPrice } = useReadContract({
    address: "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as `0x${string}`,
    abi: [
      {
        inputs: [],
        name: "getPrice",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "getPrice",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  // Prices for burn modal and tile
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0);
  const [sprinklesLpPrice, setSprinklesLpPrice] = useState<number>(0);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/prices");
        if (res.ok) {
          const data = await res.json();
          if (data.donutPrice) {
            setDonutUsdPrice(data.donutPrice);
          }
          if (data.sprinklesLpPrice) {
            setSprinklesLpPrice(data.sprinklesLpPrice);
          }
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Calculate burn tile display values
  const auctionRewardsValue = sprinklesAuctionRewards 
    ? Number(formatEther(sprinklesAuctionRewards as bigint)) 
    : 0;
  const burnPoolUsd = donutUsdPrice > 0 
    ? (auctionRewardsValue * donutUsdPrice).toFixed(2) 
    : "0.00";
  
  const auctionPriceValue = sprinklesAuctionPrice 
    ? Number(formatEther(sprinklesAuctionPrice as bigint)) 
    : 0;
  const lpCostUsd = auctionPriceValue * sprinklesLpPrice;
  const rewardsValueUsd = auctionRewardsValue * donutUsdPrice;
  const isBurnProfitable = rewardsValueUsd > lpCostUsd && auctionRewardsValue > 0 && donutUsdPrice > 0;

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const resetMiner = () => setSelectedMiner(null);

  if (selectedMiner === "donut") {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMiner(null)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-2xl font-bold tracking-wide">DONUT</h1>
              </div>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                  </div>
                </div>
              )}
              {!isConnected && !context?.user && (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {isConnecting ? "Connecting…" : "Connect"}
                </button>
              )}
              {isConnected && address && !context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-mono text-white">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                </div>
              )}
            </div>
            <DonutMiner context={context} />
          </div>
        </div>
        <NavBar onMineClick={resetMiner} />
      </main>
    );
  }

  if (selectedMiner === "sprinkles") {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMiner(null)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-2xl font-bold tracking-wide">SPRINKLES</h1>
              </div>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                  </div>
                </div>
              )}
              {!isConnected && !context?.user && (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {isConnecting ? "Connecting…" : "Connect"}
                </button>
              )}
              {isConnected && address && !context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-mono text-white">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                </div>
              )}
            </div>
            <SprinklesMiner context={context} />
          </div>
        </div>
        <NavBar onMineClick={resetMiner} />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <AddToFarcasterDialog showOnFirstVisit={true} />
      
      {/* Burn Modal */}
      <BurnModal
        isOpen={showBurnModal}
        onClose={() => setShowBurnModal(false)}
        address={address}
        donutUsdPrice={donutUsdPrice}
        sprinklesLpPrice={sprinklesLpPrice}
        primaryConnector={primaryConnector}
        connectAsync={connectAsync}
      />

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold tracking-wide">MINE</h1>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                </div>
              </div>
            )}
            {!isConnected && !context?.user && (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect"}
              </button>
            )}
            {isConnected && address && !context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-mono text-white">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 px-2 mb-3">
            <div
              className="h-24 rounded-xl border border-zinc-800 bg-zinc-900 p-2 flex flex-col items-center justify-center cursor-not-allowed opacity-60"
            >
              <Droplets className="w-6 h-6 mb-1 text-gray-500" />
              <div className="text-[10px] font-bold text-gray-500">
                Pool To Own
              </div>
              <div className="text-[9px] text-gray-600">
                coming soon...
              </div>
            </div>

            <button
              onClick={() => setShowBurnModal(true)}
              className={`h-24 rounded-xl border p-2 flex flex-col items-center justify-center transition-all ${
                isBurnProfitable
                  ? "border-amber-500 bg-gradient-to-br from-amber-600/20 to-orange-600/20"
                  : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
              }`}
              style={isBurnProfitable ? {
                animation: "pulse-scale 2s ease-in-out infinite"
              } : undefined}
            >
              <Flame className={`w-6 h-6 mb-1 ${isBurnProfitable ? "text-amber-400" : "text-gray-500"}`} />
              <div className={`text-[10px] font-bold ${isBurnProfitable ? "text-amber-400" : "text-gray-500"}`}>
                Burn
              </div>
              <div className={`text-[9px] ${isBurnProfitable ? "text-amber-400/80" : "text-gray-600"}`}>
                {isBurnProfitable 
                  ? `Earn $${burnPoolUsd}` 
                  : parseFloat(burnPoolUsd) > 0 
                    ? `$${burnPoolUsd} in rewards` 
                    : "No rewards"}
              </div>
            </button>

            <ShareRewardButton userFid={context?.user?.fid} tile />
          </div>

          <style jsx>{`
            @keyframes pulse-scale {
              0%, 100% {
                transform: scale(1);
              }
              50% {
                transform: scale(1.02);
              }
            }
          `}</style>

          <div className="flex-1 flex flex-col gap-3 px-2">
            <VideoTile
              videoSrc="/media/donut-loop.mp4"
              onClick={() => setSelectedMiner("donut")}
            >
              <div className="text-xl font-bold text-white mb-1 text-center" style={{ textShadow: '0 0 12px rgba(255,255,255,0.9)' }}>
                Pay ETH
              </div>
              <div className="text-3xl font-bold text-amber-400 mb-2 text-center" style={{ textShadow: '0 0 12px rgba(251,191,36,0.9)' }}>
                Mine DONUT
              </div>
              <div className="text-lg text-white/90">
                Price: <span className="font-bold text-white" style={{ textShadow: '0 0 10px rgba(255,255,255,0.7)' }}>
                  Ξ{donutPrice ? formatEth(donutPrice, 2) : "—"}
                </span>
              </div>
            </VideoTile>

            <VideoTile
              videoSrc="/media/sprinkles-loop.mp4"
              onClick={() => setSelectedMiner("sprinkles")}
            >
              <div className="text-xl font-bold text-white mb-1 text-center" style={{ textShadow: '0 0 12px rgba(255,255,255,0.9)' }}>
                Pay DONUT
              </div>
              <div className="text-3xl font-bold text-amber-400 mb-2 text-center" style={{ textShadow: '0 0 12px rgba(251,191,36,0.9)' }}>
                Mine SPRINKLES
              </div>
              <div className="text-lg text-white/90">
                Price: <span className="font-bold text-white" style={{ textShadow: '0 0 10px rgba(255,255,255,0.7)' }}>
                  🍩{sprinklesPriceValue ? formatTokenAmount(sprinklesPriceValue, 18, 2) : "—"}
                </span>
              </div>
            </VideoTile>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}