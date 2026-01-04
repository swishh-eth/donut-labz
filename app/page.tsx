"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, zeroAddress, type Address } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";
import DonutMiner from "@/components/donut-miner";
import SprinklesMiner from "@/components/sprinkles-miner";
import { Flame, Sparkles, X, Zap, ExternalLink } from "lucide-react";
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
const FEE_SPLITTER = "0xcB2604D87fe3e5b6fe33C5d5Ff05781602357D59" as Address;
const SPRINKLES_TOKEN = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as Address;

const DEADLINE_BUFFER_SECONDS = 5 * 60;
const SPRINKLES_MIN_BALANCE = 10000n * 10n ** 18n; // 10,000 SPRINKLES

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

const FEE_SPLITTER_ABI = [
  {
    inputs: [],
    name: "pendingDistribution",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "distribute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "lastDistributionTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
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

// Coin image component for SPRINKLES
const SprinklesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/sprinkles_logo.png" alt="SPRINKLES" className="w-full h-full object-cover" />
  </span>
);

// Coin image component for DONUT
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover" />
  </span>
);

// Coin image component for USDC
const UsdcCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-full h-full object-cover" />
  </span>
);

// Coin image component for ETH
const EthCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <img src="/coins/eth_logo.png" alt="ETH" className={`${className} rounded-full object-cover`} />
);

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



// Falling coin animation component
function FallingCoins({ coinSrc, count = 12 }: { coinSrc: string; count?: number }) {
  const coins = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
      size: 16 + Math.random() * 20,
      opacity: 0.15 + Math.random() * 0.25,
    }));
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((coin) => (
        <img
          key={coin.id}
          src={coinSrc}
          alt=""
          className="absolute rounded-full animate-falling"
          style={{
            left: `${coin.left}%`,
            width: coin.size,
            height: coin.size,
            opacity: coin.opacity,
            animationDelay: `${coin.delay}s`,
            animationDuration: `${coin.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// Matrix-style text animation for miner tiles
function MatrixText({ 
  text, 
  isReady,
  className = ""
}: { 
  text: string; 
  isReady: boolean;
  className?: string;
}) {
  const [displayText, setDisplayText] = useState(text);
  const [isAnimating, setIsAnimating] = useState(false);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (isReady && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      setIsAnimating(true);
      
      let cycleCount = 0;
      const maxCycles = 10;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      
      const interval = setInterval(() => {
        if (cycleCount < maxCycles) {
          // Generate random text of same length
          const randomText = text.split('').map(char => 
            char === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)]
          ).join('');
          setDisplayText(randomText);
          cycleCount++;
        } else {
          setDisplayText(text);
          setIsAnimating(false);
          clearInterval(interval);
        }
      }, 50);
      
      return () => clearInterval(interval);
    }
  }, [isReady, text]);

  return (
    <span className={`${className} ${isAnimating ? 'text-green-400/80' : ''} transition-colors duration-200`}>
      {displayText}
    </span>
  );
}

// Matrix-style price animation
function MatrixPrice({ 
  value, 
  isReady,
  prefix = "",
  suffix = "",
  className = ""
}: { 
  value: string; 
  isReady: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState("—");
  const [isAnimating, setIsAnimating] = useState(false);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (isReady && value && value !== "—" && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      setIsAnimating(true);
      
      let cycleCount = 0;
      const maxCycles = 12;
      
      const interval = setInterval(() => {
        if (cycleCount < maxCycles) {
          // Generate random number-like string
          const randomValue = value.split('').map(char => {
            if (char === '.' || char === ',') return char;
            return Math.floor(Math.random() * 10).toString();
          }).join('');
          setDisplayValue(randomValue);
          cycleCount++;
        } else {
          setDisplayValue(value);
          setIsAnimating(false);
          clearInterval(interval);
        }
      }, 50);
      
      return () => clearInterval(interval);
    } else if (!isReady) {
      setDisplayValue("—");
    }
  }, [isReady, value]);

  return (
    <span className={`tabular-nums ${className} ${isAnimating ? 'text-green-400/80' : ''} transition-colors duration-200`}>
      {prefix}{displayValue}{suffix}
    </span>
  );
}

// Miner tile component with falling coins
function MinerTile({ 
  coinSrc,
  title,
  titleColor,
  priceIcon,
  priceValue,
  isReady,
  recentMiner,
  onClick,
}: { 
  coinSrc: string;
  title: string;
  titleColor: string;
  priceIcon: React.ReactNode;
  priceValue: string;
  isReady: boolean;
  recentMiner: { username: string; pfpUrl?: string } | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ 
        height: '200px', 
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' 
      }}
    >
      {/* Falling coins background */}
      <FallingCoins coinSrc={coinSrc} count={15} />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className={`text-3xl font-bold mb-3 text-center ${titleColor}`} style={{ textShadow: `0 0 12px currentColor` }}>
          <MatrixText text={title} isReady={isReady} />
        </div>
        
        <div className="text-lg text-white/90 mb-3 flex items-center justify-center gap-2">
          <span className="text-white/70">Price:</span>
          <span className="font-bold text-white flex items-center gap-1" style={{ textShadow: '0 0 10px rgba(255,255,255,0.7)' }}>
            {priceIcon}
            <MatrixPrice value={priceValue} isReady={isReady && priceValue !== "—"} />
          </span>
        </div>
        
        {recentMiner && (
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 border border-zinc-700/50">
            {recentMiner.pfpUrl && (
              <img 
                src={recentMiner.pfpUrl} 
                alt="" 
                className="w-4 h-4 rounded-full border border-zinc-600"
              />
            )}
            <span className="text-[9px] text-white/70 font-medium">
              {recentMiner.username?.startsWith('@') ? recentMiner.username : `@${recentMiner.username}`} has control
            </span>
          </div>
        )}
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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="w-full max-w-sm bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
            <span className="font-bold text-white">LP Burn Auction</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-full hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Pay / Get Row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 rounded-xl border border-pink-500/30 bg-zinc-900 px-3 py-2">
              <div className="text-[9px] text-gray-400 uppercase">Pay</div>
              <div className="text-base font-bold text-pink-400">{sprinklesPriceDisplay} LP</div>
              <div className="text-[9px] text-gray-500 h-3">
                {lpPayUsd ? `$${lpPayUsd}` : sprinklesLpPrice === 0 ? "loading..." : ""}
              </div>
            </div>
            <div className="text-gray-600">→</div>
            <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2">
              <div className="text-[9px] text-gray-400 uppercase">Get</div>
              <div className="text-base font-bold text-white flex items-center gap-1">
                <img src="/coins/donut_logo.png" alt="DONUT" className="w-4 h-4 rounded-full" />
                {sprinklesRewardsDisplay}
              </div>
              <div className="text-[9px] text-gray-500 h-3">
                {donutGetUsd ? `$${donutGetUsd}` : donutUsdPrice === 0 ? "loading..." : ""}
              </div>
            </div>
          </div>

          {/* Profit/Loss */}
          {sprinklesProfitLoss && (
            <div className={cn(
              "text-center text-[10px] font-semibold px-2 py-1 rounded-lg mb-3",
              sprinklesProfitLoss.isProfitable ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"
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
            <div className="text-center text-[9px] text-green-400 mb-3 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
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
              "w-full rounded-xl py-2.5 text-sm font-bold transition-all",
              sprinklesBurnResult === "success"
                ? "bg-green-500 text-white"
                : sprinklesBurnResult === "failure"
                  ? "bg-red-500 text-white"
                  : isSprinklesBurnDisabled
                    ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                    : "bg-white text-black hover:bg-gray-200 active:scale-[0.98]"
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
              className="text-green-400 hover:text-green-300 font-semibold transition-colors"
            >
              Get LP on Aerodrome →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoized user section to prevent re-renders
const MinerUserSection = memo(function MinerUserSection({ 
  user,
  address,
  isConnected,
  isConnecting,
  onConnect,
}: { 
  user?: MiniAppContext["user"];
  address?: Address;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  if (user) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
        <img 
          src={user.pfpUrl || undefined} 
          alt={user.displayName || user.username || "User"} 
          className="h-8 w-8 rounded-full border border-zinc-800 object-cover"
        />
        <div className="leading-tight text-left">
          <div className="text-sm font-bold">{user.displayName || user.username || "Player"}</div>
          {user.username && <div className="text-xs text-gray-400">@{user.username}</div>}
        </div>
      </div>
    );
  }
  
  if (!isConnected) {
    return (
      <button
        onClick={onConnect}
        disabled={isConnecting}
        className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
      >
        {isConnecting ? "Connecting…" : "Connect"}
      </button>
    );
  }
  
  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs font-mono text-white">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      </div>
    );
  }
  
  return null;
});

// Header for miner subpages
function MinerHeader({ 
  title, 
  user,
  address,
  isConnected,
  isConnecting,
  onConnect,
}: { 
  title: string;
  user?: MiniAppContext["user"];
  address?: Address;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  const [displayedTitle, setDisplayedTitle] = useState(title);
  const [animationState, setAnimationState] = useState<"idle" | "fading-out" | "fading-in">("fading-in");
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setAnimationState("fading-in");
      return;
    }

    if (title !== displayedTitle) {
      setAnimationState("fading-out");
      
      const timeout = setTimeout(() => {
        setDisplayedTitle(title);
        setAnimationState("fading-in");
      }, 250);
      
      return () => clearTimeout(timeout);
    }
  }, [title, displayedTitle]);

  return (
    <>
      <style>{`
        @keyframes headerFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes headerFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .header-fade-in {
          animation: headerFadeIn 0.4s ease-out forwards;
        }
        .header-fade-out {
          animation: headerFadeOut 0.25s ease-in forwards;
        }
      `}</style>
      <div className="flex items-center justify-between mb-4 h-12">
        <h1 
          className={`text-2xl font-bold tracking-wide ${
            animationState === "fading-out" ? "header-fade-out" : "header-fade-in"
          }`}
        >
          {displayedTitle}
        </h1>
        <MinerUserSection
          user={user}
          address={address}
          isConnected={isConnected}
          isConnecting={isConnecting}
          onConnect={onConnect}
        />
      </div>
    </>
  );
}

export default function HomePage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<"donut" | "sprinkles" | null>(null);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  
  // Data readiness tracking
  const [dataReady, setDataReady] = useState(false);
  
  // Recent miners
  const [recentDonutMiner, setRecentDonutMiner] = useState<{ username: string; pfpUrl?: string } | null>(null);
  const [recentSprinklesMiner, setRecentSprinklesMiner] = useState<{ username: string; pfpUrl?: string } | null>(null);
  
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
  const donutMinerAddress = rawMinerState ? (rawMinerState as any).miner as string : undefined;
  
  const sprinklesInitPrice = sprinklesSlot0 
    ? BigInt((sprinklesSlot0 as any).initPrice ?? (sprinklesSlot0 as any)[2] ?? 0)
    : undefined;
  const sprinklesStartTime = sprinklesSlot0 
    ? Number((sprinklesSlot0 as any).startTime ?? (sprinklesSlot0 as any)[3] ?? 0)
    : undefined;
  const sprinklesMinerAddress = sprinklesSlot0
    ? ((sprinklesSlot0 as any).miner ?? (sprinklesSlot0 as any)[0]) as string
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

  // Fee splitter balance
  const { data: splitterBalance, refetch: refetchSplitter } = useReadContract({
    address: FEE_SPLITTER,
    abi: FEE_SPLITTER_ABI,
    functionName: "pendingDistribution",
    chainId: base.id,
    query: { refetchInterval: 10_000 },
  });

  const { data: lastSplitTime } = useReadContract({
    address: FEE_SPLITTER,
    abi: FEE_SPLITTER_ABI,
    functionName: "lastDistributionTime",
    chainId: base.id,
    query: { refetchInterval: 30_000 },
  });

  // User's SPRINKLES balance for split requirement
  const { data: userSprinklesBalance, refetch: refetchSprinklesBalance } = useReadContract({
    address: SPRINKLES_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 30_000, enabled: !!address },
  });

  const hasEnoughSprinkles = userSprinklesBalance ? userSprinklesBalance >= SPRINKLES_MIN_BALANCE : false;

  // Calculate time since last split
  const [timeSinceLastSplit, setTimeSinceLastSplit] = useState<string>("");
  
  useEffect(() => {
    if (!lastSplitTime || lastSplitTime === 0n) {
      setTimeSinceLastSplit("");
      return;
    }

    const updateTimeSince = () => {
      const now = Math.floor(Date.now() / 1000);
      const lastSplit = Number(lastSplitTime);
      const diff = now - lastSplit;

      if (diff < 60) {
        setTimeSinceLastSplit("just now");
      } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        setTimeSinceLastSplit(`${mins}m ago`);
      } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        setTimeSinceLastSplit(`${hours}h ago`);
      } else {
        const days = Math.floor(diff / 86400);
        setTimeSinceLastSplit(`${days}d ago`);
      }
    };

    updateTimeSince();
    const interval = setInterval(updateTimeSince, 60_000);
    return () => clearInterval(interval);
  }, [lastSplitTime]);

  // Split to Earn state
  const [splitResult, setSplitResult] = useState<"success" | "failure" | "rewarded" | null>(null);
  const [showNothingToSplit, setShowNothingToSplit] = useState(false);
  const [showMustHoldSprinkles, setShowMustHoldSprinkles] = useState(false);
  const splitResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: splitTxHash,
    writeContract: writeSplitContract,
    isPending: isSplitWriting,
    reset: resetSplitWrite,
    error: splitWriteError,
  } = useWriteContract();

  const { data: splitReceipt, isLoading: isSplitConfirming } = useWaitForTransactionReceipt({
    hash: splitTxHash,
    chainId: base.id,
  });

  const showSplitResult = useCallback((result: "success" | "failure" | "rewarded") => {
    if (splitResultTimeoutRef.current) clearTimeout(splitResultTimeoutRef.current);
    setSplitResult(result);
    
    // Play haptic melody and sound on success/rewarded
    if (result === "success" || result === "rewarded") {
      // Haptic feedback melody - fire multiple times
      const playHapticMelody = async () => {
        try {
          const actions = sdk.actions as any;
          const haptic = actions.hapticFeedback || actions.haptic;
          if (haptic) {
            // Play a quick melody pattern
            await haptic({ impactStyle: "light" }).catch(() => {});
            await new Promise(r => setTimeout(r, 100));
            await haptic({ impactStyle: "medium" }).catch(() => {});
            await new Promise(r => setTimeout(r, 100));
            await haptic({ impactStyle: "heavy" }).catch(() => {});
            await new Promise(r => setTimeout(r, 150));
            await haptic({ impactStyle: "medium" }).catch(() => {});
          }
        } catch {
          // Fallback to vibration API pattern
          if (navigator.vibrate) navigator.vibrate([30, 50, 50, 50, 80, 80, 50]);
        }
      };
      playHapticMelody();
      
      // Play soothing success chime using Web Audio API
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Create a pleasant ascending chime
        const playNote = (freq: number, startTime: number, duration: number, volume: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.frequency.value = freq;
          osc.type = "sine";
          gain.gain.setValueAtTime(0, audioCtx.currentTime + startTime);
          gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + startTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);
          osc.start(audioCtx.currentTime + startTime);
          osc.stop(audioCtx.currentTime + startTime + duration);
        };
        
        // Pleasant ascending chord: C5 -> E5 -> G5 -> C6
        playNote(523.25, 0, 0.3, 0.15);      // C5
        playNote(659.25, 0.08, 0.3, 0.12);   // E5
        playNote(783.99, 0.16, 0.35, 0.1);   // G5
        playNote(1046.5, 0.24, 0.5, 0.08);   // C6
      } catch {}
    }
    
    splitResultTimeoutRef.current = setTimeout(() => {
      setSplitResult(null);
      splitResultTimeoutRef.current = null;
    }, 4000);
  }, []);

  const handleSplit = useCallback(async () => {
    // Always refetch splitter first to get latest state
    const { data: latestBalance } = await refetchSplitter();
    
    // If user is connected, check SPRINKLES balance
    if (address) {
      const { data: latestSprinklesBalance } = await refetchSprinklesBalance();
      const userHasEnough = latestSprinklesBalance ? latestSprinklesBalance >= SPRINKLES_MIN_BALANCE : false;
      if (!userHasEnough) {
        setShowMustHoldSprinkles(true);
        setTimeout(() => setShowMustHoldSprinkles(false), 3000);
        return;
      }
    }
    
    // Use the freshly fetched balance
    if (!latestBalance || latestBalance === 0n) {
      setShowNothingToSplit(true);
      setTimeout(() => {
        setShowNothingToSplit(false);
        // Refetch again after message clears to show latest state
        refetchSplitter();
      }, 3000);
      return;
    }
    
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
        
        // After connecting, check SPRINKLES balance
        const { data: newSprinklesBalance } = await refetchSprinklesBalance();
        const userHasEnough = newSprinklesBalance ? newSprinklesBalance >= SPRINKLES_MIN_BALANCE : false;
        if (!userHasEnough) {
          setShowMustHoldSprinkles(true);
          setTimeout(() => setShowMustHoldSprinkles(false), 3000);
          return;
        }
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address");

      writeSplitContract({
        account: targetAddress as Address,
        address: FEE_SPLITTER,
        abi: FEE_SPLITTER_ABI,
        functionName: "distribute",
        chainId: base.id,
      });
    } catch (error) {
      console.error("Split failed:", error);
      showSplitResult("failure");
    }
  }, [address, connectAsync, primaryConnector, writeSplitContract, showSplitResult, refetchSplitter, refetchSprinklesBalance]);

  // Handle split write error
  useEffect(() => {
    if (splitWriteError) {
      const isUserRejection = splitWriteError.message?.includes("User rejected") || 
                              splitWriteError.message?.includes("user rejected") ||
                              splitWriteError.message?.includes("User denied");
      if (!isUserRejection) {
        showSplitResult("failure");
      }
      resetSplitWrite();
    }
  }, [splitWriteError, showSplitResult, resetSplitWrite]);

  // Handle split receipt and claim reward
  useEffect(() => {
    if (!splitReceipt || !splitTxHash) return;
    
    if (splitReceipt.status === "reverted") {
      showSplitResult("failure");
      resetSplitWrite();
      return;
    }

    // Split succeeded - now claim the reward
    const claimReward = async () => {
      try {
        const res = await fetch("/api/split-reward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: splitTxHash,
            address: splitReceipt.from,
          }),
        });
        
        if (res.ok) {
          showSplitResult("rewarded");
        } else {
          // Split worked but reward failed - still show success
          showSplitResult("success");
        }
      } catch {
        showSplitResult("success");
      }
      
      resetSplitWrite();
      
      // Refetch immediately and then again after delays to ensure UI updates
      refetchSplitter();
      setTimeout(() => refetchSplitter(), 2000);
      setTimeout(() => refetchSplitter(), 5000);
    };
    
    claimReward();
  }, [splitReceipt, splitTxHash, showSplitResult, resetSplitWrite, refetchSplitter]);

  // Cleanup split result timeout
  useEffect(() => {
    return () => {
      if (splitResultTimeoutRef.current) clearTimeout(splitResultTimeoutRef.current);
    };
  }, []);

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

  // Fetch current miner profiles from contract state
  useEffect(() => {
    const fetchMinerProfiles = async () => {
      const addressesToFetch: string[] = [];
      
      if (donutMinerAddress && donutMinerAddress !== zeroAddress) {
        addressesToFetch.push(donutMinerAddress);
      }
      if (sprinklesMinerAddress && sprinklesMinerAddress !== zeroAddress) {
        addressesToFetch.push(sprinklesMinerAddress);
      }
      
      if (addressesToFetch.length === 0) {
        setRecentDonutMiner(null);
        setRecentSprinklesMiner(null);
        return;
      }
      
      try {
        const res = await fetch(`/api/profiles?addresses=${encodeURIComponent(addressesToFetch.join(','))}`);
        if (res.ok) {
          const data = await res.json();
          const profiles = data.profiles || {};
          
          // Set donut miner
          if (donutMinerAddress && donutMinerAddress !== zeroAddress) {
            const profile = profiles[donutMinerAddress.toLowerCase()];
            setRecentDonutMiner({
              username: profile?.username || donutMinerAddress.slice(0, 6) + '...' + donutMinerAddress.slice(-4),
              pfpUrl: profile?.pfpUrl || undefined,
            });
          } else {
            setRecentDonutMiner(null);
          }
          
          // Set sprinkles miner
          if (sprinklesMinerAddress && sprinklesMinerAddress !== zeroAddress) {
            const profile = profiles[sprinklesMinerAddress.toLowerCase()];
            setRecentSprinklesMiner({
              username: profile?.username || sprinklesMinerAddress.slice(0, 6) + '...' + sprinklesMinerAddress.slice(-4),
              pfpUrl: profile?.pfpUrl || undefined,
            });
          } else {
            setRecentSprinklesMiner(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch miner profiles:", error);
      }
    };
    
    fetchMinerProfiles();
  }, [donutMinerAddress, sprinklesMinerAddress]);

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

  // Check if all data is ready for animation
  useEffect(() => {
    const pricesReady = donutPrice !== undefined && sprinklesPriceValue !== undefined;
    
    if (pricesReady && !dataReady) {
      // Small delay to let layout settle
      const timeout = setTimeout(() => {
        setDataReady(true);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [donutPrice, sprinklesPriceValue, dataReady]);

  // Mark animation as complete after data is ready
  useEffect(() => {
    if (dataReady && !hasAnimatedIn) {
      const timeout = setTimeout(() => {
        setHasAnimatedIn(true);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [dataReady, hasAnimatedIn]);

  // Handle scroll fade
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      
      if (scrollHeight > 0) {
        const topFade = Math.min(1, scrollTop / 100);
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 100);
        setScrollFade({ top: topFade, bottom: bottomFade });
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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
            <MinerHeader
              title="DONUT"
              user={context?.user}
              address={address}
              isConnected={isConnected}
              isConnecting={isConnecting}
              onConnect={handleConnect}
            />
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
            <MinerHeader
              title="SPRINKLES"
              user={context?.user}
              address={address}
              isConnected={isConnected}
              isConnecting={isConnecting}
              onConnect={handleConnect}
            />
            <SprinklesMiner context={context} />
          </div>
        </div>
        <NavBar onMineClick={resetMiner} />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .mine-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .mine-scroll::-webkit-scrollbar {
          display: none;
        }
        @keyframes tilePopIn {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-tilePopIn {
          animation: tilePopIn 0.3s ease-out forwards;
        }
        @keyframes profitablePulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(0.98);
          }
        }
        .animate-profitablePulse {
          animation: profitablePulse 2s ease-in-out infinite;
        }
        @keyframes falling {
          0% {
            transform: translateY(-60px) rotate(0deg);
            opacity: 0;
          }
          5% {
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          95% {
            opacity: 0;
          }
          100% {
            transform: translateY(260px) rotate(360deg);
            opacity: 0;
          }
        }
        .animate-falling {
          animation: falling linear infinite;
        }
      `}</style>
      
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
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header */}
          <div className="flex-shrink-0">
            <Header title="MINE" user={context?.user} />
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden mine-scroll"
            style={{ 
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
            }}
          >
            <div className="space-y-3 pb-4">
              {/* Miner Tiles - Hidden until data ready, then animate */}
              <div 
                className={dataReady && !hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!dataReady ? { opacity: 0 } : (!hasAnimatedIn ? { opacity: 0, animationDelay: '0ms', animationFillMode: 'forwards' } : {})}
              >
                <MinerTile
                  coinSrc="/coins/donut_logo.png"
                  title="MINE DONUT"
                  titleColor="text-white"
                  priceIcon={<EthCoin className="w-5 h-5" />}
                  priceValue={donutPrice ? formatEth(donutPrice, 2) : "—"}
                  isReady={dataReady}
                  recentMiner={recentDonutMiner}
                  onClick={() => setSelectedMiner("donut")}
                />
              </div>

              <div 
                className={dataReady && !hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!dataReady ? { opacity: 0 } : (!hasAnimatedIn ? { opacity: 0, animationDelay: '50ms', animationFillMode: 'forwards' } : {})}
              >
                <MinerTile
                  coinSrc="/coins/sprinkles_logo.png"
                  title="MINE SPRINKLES"
                  titleColor="text-pink-400"
                  priceIcon={<DonutCoin className="w-5 h-5" />}
                  priceValue={sprinklesPriceValue ? formatTokenAmount(sprinklesPriceValue, 18, 0) : "—"}
                  isReady={dataReady}
                  recentMiner={recentSprinklesMiner}
                  onClick={() => setSelectedMiner("sprinkles")}
                />
              </div>

              {/* Burn Tile */}
              <div 
                className={dataReady && !hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!dataReady ? { opacity: 0 } : (!hasAnimatedIn ? { opacity: 0, animationDelay: '100ms', animationFillMode: 'forwards' } : {})}
              >
                <button
                  onClick={() => setShowBurnModal(true)}
                  className={cn(
                    "relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-300 active:scale-[0.98]",
                    isBurnProfitable
                      ? "border-green-500/50 hover:border-green-500/80 animate-profitablePulse"
                      : "border-white/20 hover:border-white/40"
                  )}
                  style={{ 
                    minHeight: '100px', 
                    background: isBurnProfitable 
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                  }}
                >
                  {/* Stacked background icons - sprinkles and donut inline */}
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                    {/* Sprinkles icon - left/behind */}
                    <span className="w-20 h-20 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 -mr-6 relative z-0">
                      <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover" />
                    </span>
                    {/* Donut icon - right/front */}
                    <span className="w-20 h-20 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 relative z-10">
                      <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover" />
                    </span>
                  </div>
                  
                  <div className="relative z-10 p-4 pr-20">
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("font-bold text-base", isBurnProfitable ? "text-green-400" : "text-gray-500")}>
                          LP Burn Auction
                        </span>
                        {isBurnProfitable && (
                          <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-bold">
                            PROFITABLE
                          </span>
                        )}
                      </div>
                      <div className={cn("text-[10px] mb-2", isBurnProfitable ? "text-green-200/60" : "text-gray-600")}>
                        Burn SPRINKLES LP to receive DONUT
                      </div>
                      <div className={cn("text-[9px] flex items-center gap-1", isBurnProfitable ? "text-green-400" : "text-gray-600")}>
                        {isBurnProfitable 
                          ? <span className="flex items-center gap-1">Earn ${burnPoolUsd} in <DonutCoin className="w-3 h-3" /> DONUT</span>
                          : parseFloat(burnPoolUsd) > 0 
                            ? `$${burnPoolUsd} in rewards available` 
                            : "No rewards available"}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Split to Earn Tile */}
              <div 
                className={dataReady && !hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!dataReady ? { opacity: 0 } : (!hasAnimatedIn ? { opacity: 0, animationDelay: '125ms', animationFillMode: 'forwards' } : {})}
              >
                <div
                  className={cn(
                    "relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-300",
                    splitResult === "rewarded"
                      ? "border-green-500/50"
                      : splitResult === "success"
                        ? "border-green-500/50"
                        : splitResult === "failure"
                          ? "border-red-500/50"
                          : splitterBalance && splitterBalance > 0n
                            ? "border-pink-500/50 hover:border-pink-500/80"
                            : "border-white/20 hover:border-white/30"
                  )}
                  style={{ 
                    minHeight: '80px', 
                    background: splitResult === "rewarded" || splitResult === "success"
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)'
                      : splitResult === "failure"
                        ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.1) 100%)'
                        : splitterBalance && splitterBalance > 0n
                          ? 'linear-gradient(135deg, rgba(244,114,182,0.15) 0%, rgba(219,39,119,0.1) 100%)'
                          : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                  }}
                >
                  {/* Large background sprinkles icon */}
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <span className={cn(
                      "w-20 h-20 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50",
                      splitResult === "rewarded" || splitResult === "success"
                        ? "opacity-100"
                        : splitResult === "failure"
                          ? "opacity-20"
                          : splitterBalance && splitterBalance > 0n
                            ? "opacity-100"
                            : "opacity-10"
                    )}>
                      <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover" />
                    </span>
                  </div>
                  
                  {/* Main clickable area */}
                  <button
                    onClick={handleSplit}
                    disabled={isSplitWriting || isSplitConfirming || splitResult !== null || showNothingToSplit || showMustHoldSprinkles}
                    className="w-full h-full text-left active:scale-[0.98] transition-transform disabled:active:scale-100"
                  >
                    <div className="relative z-10 p-4 pr-16">
                      <div className="text-left relative">
                        {/* Nothing to Split Message */}
                        <div className={cn(
                          "absolute inset-0 flex items-center transition-opacity duration-300",
                          showNothingToSplit ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}>
                          <span className="font-bold text-base text-gray-400">NOTHING TO SPLIT</span>
                        </div>
                        
                        {/* Normal Content */}
                        <div className={cn(
                          "transition-opacity duration-300",
                          (showNothingToSplit || showMustHoldSprinkles) ? "opacity-0" : "opacity-100"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "font-bold text-base",
                              splitResult === "rewarded" || splitResult === "success"
                                ? "text-green-400"
                                : splitResult === "failure"
                                  ? "text-red-400"
                                  : splitterBalance && splitterBalance > 0n
                                    ? "text-pink-400"
                                    : "text-gray-500"
                            )}>
                              {splitResult === "rewarded" 
                                ? <span className="flex items-center gap-1"><SprinklesCoin className="w-4 h-4" /> +100 SPRINKLES!</span>
                                : splitResult === "success"
                                  ? "Split Complete!"
                                  : splitResult === "failure"
                                    ? "Split Failed"
                                    : isSplitWriting || isSplitConfirming
                                      ? "Splitting..."
                                      : "Split to Earn"}
                            </span>
                            {splitterBalance && splitterBalance > 0n && !splitResult && !isSplitWriting && !isSplitConfirming && (
                              <span className="text-[9px] bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded font-bold">
                                READY
                              </span>
                            )}
                          </div>
                          <div className={cn(
                            "text-[10px]",
                            splitResult === "rewarded" || splitResult === "success"
                              ? "text-green-200/60"
                              : splitResult === "failure"
                                ? "text-red-200/60"
                                : splitterBalance && splitterBalance > 0n
                                  ? "text-pink-200/60"
                                  : "text-gray-600"
                          )}>
                            {splitResult === "rewarded"
                              ? "Reward sent to your wallet"
                              : splitterBalance && splitterBalance > 0n
                                ? <span className="flex items-center gap-1">{formatTokenAmount(splitterBalance, 18, 0)} DONUT ready to split • Earn 100 <SprinklesCoin className="w-3 h-3 inline" /></span>
                                : timeSinceLastSplit 
                                  ? `Last split ${timeSinceLastSplit}`
                                  : "No splits yet"}
                          </div>
                          <div className="text-[8px] text-gray-500 mt-1">
                            Free to split • Gas only
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  {/* Must Hold SPRINKLES Message - Overlay that's always clickable */}
                  <div className={cn(
                    "absolute inset-0 flex items-center p-4 transition-opacity duration-300 z-20",
                    showMustHoldSprinkles ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          // Use experimental viewToken with CAIP-19 asset ID format
                          const experimental = (sdk as any).experimental;
                          if (experimental?.viewToken) {
                            await experimental.viewToken({
                              token: "eip155:8453/erc20:0xa890060BE1788a676dBC3894160f5dc5DeD2C98D"
                            });
                          } else {
                            // Fallback - try actions.viewToken
                            const actions = sdk.actions as any;
                            if (actions.viewToken) {
                              await actions.viewToken({
                                token: "eip155:8453/erc20:0xa890060BE1788a676dBC3894160f5dc5DeD2C98D"
                              });
                            }
                          }
                        } catch (err) {
                          console.error("viewToken failed:", err);
                        }
                      }}
                      className="flex items-center gap-2 font-bold text-sm text-pink-400 hover:text-pink-300 active:scale-95 transition-all"
                    >
                      <span>HOLD 10,000 $SPRINKLES</span>
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Activate Auction Burn Tile */}
              <div 
                className={dataReady && !hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!dataReady ? { opacity: 0 } : (!hasAnimatedIn ? { opacity: 0, animationDelay: '175ms', animationFillMode: 'forwards' } : {})}
              >
                <div
                  className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden cursor-not-allowed opacity-60"
                  style={{ height: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
                >
                  {/* Large background icon */}
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Flame className="w-24 h-24 text-zinc-800" />
                  </div>
                  
                  <div className="relative z-10 p-4 pr-20 h-full flex flex-col justify-center">
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-base text-gray-500">Activate Auction Burn</span>
                      </div>
                      <div className="text-[10px] text-gray-600 whitespace-nowrap">5% togglable burn voted on by holders</div>
                      <div className="text-[9px] text-gray-600 mt-1">Coming soon...</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}