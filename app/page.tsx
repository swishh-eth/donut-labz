"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useConnect, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, zeroAddress } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";
import DonutMiner from "@/components/donut-miner";
import SprinklesMiner from "@/components/sprinkles-miner";
import { ShareRewardButton } from "@/components/share-reward-button";
import { ArrowLeft, Flame, Droplets } from "lucide-react";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { SPRINKLES_MINER_ADDRESS, SPRINKLES_MINER_ABI } from "@/lib/contracts/sprinkles";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

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
  decimals: number,
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

export default function HomePage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<"donut" | "sprinkles" | null>(null);
  
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

  // OPTIMIZED: Reduced from 3s to 15s - we interpolate price client-side
  const { data: rawMinerState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getMiner",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 15_000, // Was 3_000
    },
  });

  // OPTIMIZED: Reduced from 3s to 15s - we interpolate price client-side
  const { data: sprinklesSlot0 } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getSlot0",
    chainId: base.id,
    query: {
      refetchInterval: 15_000, // Was 3_000
    },
  });

  // Extract initPrice and startTime for client-side interpolation
  const donutInitPrice = rawMinerState ? (rawMinerState as any).initPrice as bigint : undefined;
  const donutStartTime = rawMinerState ? (rawMinerState as any).startTime as bigint : undefined;
  
  const sprinklesInitPrice = sprinklesSlot0 ? (sprinklesSlot0 as any)[1] as bigint : undefined;
  const sprinklesStartTime = sprinklesSlot0 ? (sprinklesSlot0 as any)[2] as bigint : undefined;

  // Client-side price interpolation for DONUT - updates every second
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

  // Client-side price interpolation for SPRINKLES - updates every second
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

  // Use interpolated prices for display, fallback to on-chain if not available
  const donutPrice = interpolatedDonutPrice ?? (rawMinerState ? (rawMinerState as any).price as bigint : undefined);
  const sprinklesPriceValue = interpolatedSprinklesPrice;

  // OPTIMIZED: Reduced from 10s to 30s for burn tile data
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
      refetchInterval: 30_000, // Was 10_000
    },
  });

  // OPTIMIZED: Reduced from 10s to 30s
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
      refetchInterval: 30_000, // Was 10_000
    },
  });

  // OPTIMIZED: Reduced from 10s to 30s
  const { data: pendingSplitterDonut } = useReadContract({
    address: "0x99DABA873CC4c701280624603B28d3e3F286b590" as `0x${string}`,
    abi: [
      {
        inputs: [],
        name: "pendingDonut",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "pendingDonut",
    chainId: base.id,
    query: {
      refetchInterval: 30_000, // Was 10_000
    },
  });

  // DONUT price for USD conversion - fetched from cached API
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/prices");
        if (res.ok) {
          const data = await res.json();
          if (data.donutPrice) {
            setDonutUsdPrice(data.donutPrice);
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

  // Calculate total burn pool value
  const auctionRewardsValue = sprinklesAuctionRewards 
    ? Number(formatEther(sprinklesAuctionRewards as bigint)) 
    : 0;
  const pendingSplitterValue = pendingSplitterDonut 
    ? Number(formatEther(pendingSplitterDonut as bigint)) / 2 
    : 0;
  const totalBurnPoolDonut = auctionRewardsValue + pendingSplitterValue;
  const burnPoolUsd = donutUsdPrice > 0 
    ? (totalBurnPoolDonut * donutUsdPrice).toFixed(2) 
    : "0.00";
  
  // Calculate if burn is profitable
  const LP_PRICE_USD = 0.022;
  const auctionPriceValue = sprinklesAuctionPrice 
    ? Number(formatEther(sprinklesAuctionPrice as bigint)) 
    : 0;
  const lpCostUsd = auctionPriceValue * LP_PRICE_USD;
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
              onClick={() => router.push("/burn")}
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