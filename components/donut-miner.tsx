"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleUserRound, HelpCircle, X, MessageCircle, Trophy } from "lucide-react";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { cn, getEthPrice } from "@/lib/utils";
import { useAccountData } from "@/hooks/useAccountData";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type MinerState = {
  epochId: bigint | number;
  initPrice: bigint;
  startTime: bigint | number;
  glazed: bigint;
  price: bigint;
  dps: bigint;
  nextDps: bigint;
  donutPrice: bigint;
  miner: Address;
  uri: string;
  ethBalance: bigint;
  wethBalance: bigint;
  donutBalance: bigint;
};

type RecentMiner = {
  address: string;
  username: string | null;
  pfpUrl: string | null;
  amount: string;
  message: string;
  timestamp: number;
};

const DONUT_DECIMALS = 18;
const DEADLINE_BUFFER_SECONDS = 15 * 60;
const AUCTION_DURATION = 3600;
const MIN_PRICE = 100000000000000n;

const DEFAULT_MESSAGES = [
  "Every donut needs sprinkles - Donut Labs",
  "Sprinkling magic on Base - Donut Labs",
  "Powered by Chromium Donut Tech - Donut Labs",
  "Stay glazed, stay based - Donut Labs",
  "The donut shop never closes - Donut Labs",
  "More sprinkles, more fun - Donut Labs",
];

const getRandomDefaultMessage = () => {
  return DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
};

const ANON_PFPS = [
  "/media/anonpfp1.png",
  "/media/anonpfp2.png",
  "/media/anonpfp3.png",
  "/media/anonpfp4.png",
  "/media/anonpfp5.png",
  "/media/anonpfp6.png",
];

const getAnonPfp = (address: string): string => {
  const lastChar = address.slice(-1).toLowerCase();
  const charCode = lastChar.charCodeAt(0);
  const index = charCode % ANON_PFPS.length;
  return ANON_PFPS[index];
};

const toBigInt = (value: bigint | number) =>
  typeof value === "bigint" ? value : BigInt(value);

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

const formatEth = (value: bigint, maximumFractionDigits = 4) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const formatAddress = (addr?: string) => {
  if (!addr) return "—";
  const normalized = addr.toLowerCase();
  if (normalized === zeroAddress) return "No miner";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const calculatePrice = (initPrice: bigint, startTime: number | bigint): bigint => {
  const now = Math.floor(Date.now() / 1000);
  const start = typeof startTime === 'bigint' ? Number(startTime) : startTime;
  const elapsed = now - start;
  
  if (elapsed >= AUCTION_DURATION) return MIN_PRICE;
  if (elapsed <= 0) return initPrice;
  
  const priceRange = initPrice - MIN_PRICE;
  const decay = (priceRange * BigInt(elapsed)) / BigInt(AUCTION_DURATION);
  const currentPrice = initPrice - decay;
  
  return currentPrice > MIN_PRICE ? currentPrice : MIN_PRICE;
};

interface DonutMinerProps {
  context: MiniAppContext | null;
}

export default function DonutMiner({ context }: DonutMinerProps) {
  const autoConnectAttempted = useRef(false);
  const [customMessage, setCustomMessage] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [glazeResult, setGlazeResult] = useState<"success" | "failure" | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const glazeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultMessageRef = useRef<string>(getRandomDefaultMessage());
  const [interpolatedPrice, setInterpolatedPrice] = useState<bigint | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [recentMiners, setRecentMiners] = useState<RecentMiner[]>([]);

  const resetGlazeResult = useCallback(() => {
    if (glazeResultTimeoutRef.current) {
      clearTimeout(glazeResultTimeoutRef.current);
      glazeResultTimeoutRef.current = null;
    }
    setGlazeResult(null);
  }, []);

  const showGlazeResult = useCallback((result: "success" | "failure") => {
    if (glazeResultTimeoutRef.current) {
      clearTimeout(glazeResultTimeoutRef.current);
    }
    setGlazeResult(result);
    glazeResultTimeoutRef.current = setTimeout(() => {
      setGlazeResult(null);
      glazeResultTimeoutRef.current = null;
    }, 3000);
  }, []);

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

  useEffect(() => {
    return () => {
      if (glazeResultTimeoutRef.current) {
        clearTimeout(glazeResultTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationId: number;
    let position = 0;
    const speed = 0.5;

    const animate = () => {
      position += speed;
      const halfWidth = scrollContainer.scrollWidth / 2;

      if (position >= halfWidth) {
        position = 0;
      }

      scrollContainer.style.transform = `translateX(-${position}px)`;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // Scroll fade effect
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      if (scrollHeight > 0) {
        const topFade = Math.min(1, scrollTop / 50);
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 50);
        setScrollFade({ top: topFade, bottom: bottomFade });
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch recent miners
  useEffect(() => {
    const fetchRecentMiners = async () => {
      try {
        const res = await fetch('/api/miners/recent?type=donut&limit=3');
        if (res.ok) {
          const data = await res.json();
          setRecentMiners(data.miners || []);
        }
      } catch (error) {
        console.error('Failed to fetch recent miners:', error);
      }
    };

    fetchRecentMiners();
    const interval = setInterval(fetchRecentMiners, 30_000);
    return () => clearInterval(interval);
  }, []);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  const { data: rawMinerState, refetch: refetchMinerState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getMiner",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 15_000 },
  });

  const minerState = useMemo(() => {
    if (!rawMinerState) return undefined;
    return rawMinerState as unknown as MinerState;
  }, [rawMinerState]);

  useEffect(() => {
    if (!minerState) {
      setInterpolatedPrice(null);
      return;
    }
    setInterpolatedPrice(calculatePrice(minerState.initPrice, minerState.startTime));
    const interval = setInterval(() => {
      setInterpolatedPrice(calculatePrice(minerState.initPrice, minerState.startTime));
    }, 1_000);
    return () => clearInterval(interval);
  }, [minerState]);

  const { data: accountData } = useAccountData(address);

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === "success" || receipt.status === "reverted") {
      showGlazeResult(receipt.status === "success" ? "success" : "failure");

      if (receipt.status === "success" && address) {
        defaultMessageRef.current = getRandomDefaultMessage();
        
        const recordGlazeWithRetry = async (attempt = 1, maxAttempts = 3) => {
          try {
            const res = await fetch("/api/record-glaze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: address,
                txHash: receipt.transactionHash,
                mineType: "donut",
              }),
            });
            
            if (!res.ok && attempt < maxAttempts) {
              setTimeout(() => recordGlazeWithRetry(attempt + 1, maxAttempts), 3000);
            }
          } catch (err) {
            if (attempt < maxAttempts) {
              setTimeout(() => recordGlazeWithRetry(attempt + 1, maxAttempts), 3000);
            }
          }
        };
        setTimeout(() => recordGlazeWithRetry(), 2000);
        
        // Refresh recent miners list
        setTimeout(async () => {
          try {
            const res = await fetch('/api/miners/recent?type=donut&limit=3');
            if (res.ok) {
              const data = await res.json();
              setRecentMiners(data.miners || []);
            }
          } catch {}
        }, 3000);
      }

      refetchMinerState();
      const resetTimer = setTimeout(() => resetWrite(), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [receipt, refetchMinerState, resetWrite, showGlazeResult, address]);

  const minerAddress = minerState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;

  const { data: profileData } = useQuery<{
    profiles: Record<string, {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null>;
  }>({
    queryKey: ["cached-profile", minerAddress],
    queryFn: async () => {
      const res = await fetch(`/api/profiles?addresses=${encodeURIComponent(minerAddress)}`);
      if (!res.ok) throw new Error("Failed to load Farcaster profile.");
      return res.json();
    },
    enabled: hasMiner,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const neynarUser = profileData?.profiles?.[minerAddress.toLowerCase()]
    ? { user: profileData.profiles[minerAddress.toLowerCase()] }
    : { user: null };

  const handleGlaze = useCallback(async () => {
    if (!minerState) return;
    await refetchMinerState();
    resetGlazeResult();
    
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available yet.");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address.");
      
      const price = minerState.price;
      const epochId = toBigInt(minerState.epochId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;
      const messageToSend = customMessage.trim() || defaultMessageRef.current;
      
      await writeContract({
        account: targetAddress as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "mine",
        args: [CONTRACT_ADDRESSES.provider as Address, epochId, deadline, maxPrice, messageToSend],
        value: price,
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to glaze:", error);
      showGlazeResult("failure");
      resetWrite();
    }
  }, [address, connectAsync, customMessage, minerState, primaryConnector, refetchMinerState, resetGlazeResult, resetWrite, showGlazeResult, writeContract]);

  const [interpolatedGlazed, setInterpolatedGlazed] = useState<bigint | null>(null);
  const [glazeElapsedSeconds, setGlazeElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!minerState) { setInterpolatedGlazed(null); return; }
    setInterpolatedGlazed(minerState.glazed);
    const interval = setInterval(() => {
      if (minerState.nextDps > 0n) {
        setInterpolatedGlazed((prev) => prev ? prev + minerState.nextDps : minerState.glazed);
      }
    }, 1_000);
    return () => clearInterval(interval);
  }, [minerState]);

  useEffect(() => {
    if (!minerState) { setGlazeElapsedSeconds(0); return; }
    const startTimeSeconds = Number(minerState.startTime);
    setGlazeElapsedSeconds(Math.floor(Date.now() / 1000) - startTimeSeconds);
    const interval = setInterval(() => {
      setGlazeElapsedSeconds(Math.floor(Date.now() / 1000) - startTimeSeconds);
    }, 1_000);
    return () => clearInterval(interval);
  }, [minerState]);

  const occupantDisplay = useMemo(() => {
    if (!minerState) return { primary: "—", secondary: "", isYou: false, avatarUrl: null as string | null, isUnknown: true, addressLabel: "—" };
    const minerAddr = minerState.miner;
    const fallback = formatAddress(minerAddr);
    const isYou = !!address && minerAddr.toLowerCase() === (address as string).toLowerCase();
    const fallbackAvatarUrl = getAnonPfp(minerAddr);
    const profile = neynarUser?.user ?? null;
    const profileUsername = profile?.username ? `@${profile.username}` : null;
    const profileDisplayName = profile?.displayName ?? null;
    const contextProfile = context?.user ?? null;
    const contextHandle = contextProfile?.username ? `@${contextProfile.username}` : null;
    const contextDisplayName = contextProfile?.displayName ?? null;
    const addressLabel = fallback;
    const labelCandidates = [profileDisplayName, profileUsername, isYou ? contextDisplayName : null, isYou ? contextHandle : null, addressLabel].filter((label): label is string => !!label);
    const seenLabels = new Set<string>();
    const uniqueLabels = labelCandidates.filter((label) => { const key = label.toLowerCase(); if (seenLabels.has(key)) return false; seenLabels.add(key); return true; });
    const primary = uniqueLabels[0] ?? addressLabel;
    const secondary = uniqueLabels.find((label) => label !== primary && label.startsWith("@")) ?? "";
    const avatarUrl = profile?.pfpUrl ?? (isYou ? contextProfile?.pfpUrl ?? null : null) ?? fallbackAvatarUrl;
    const isUnknown = !profile && !(isYou && (contextHandle || contextDisplayName));
    return { primary, secondary, isYou, avatarUrl, isUnknown, addressLabel };
  }, [address, context?.user, minerState, neynarUser?.user]);

  const glazeRateDisplay = minerState ? formatTokenAmount(minerState.nextDps, DONUT_DECIMALS, 2) : "—";
  const displayPrice = interpolatedPrice ?? minerState?.price;
  const glazePriceDisplay = displayPrice ? formatEth(displayPrice, 6) : "—";
  const glazedDisplay = minerState && interpolatedGlazed !== null ? formatTokenAmount(interpolatedGlazed, DONUT_DECIMALS, 0) : "—";

  const formatGlazeTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const glazeTimeDisplay = minerState ? formatGlazeTime(glazeElapsedSeconds) : "—";
  
  const glazeRateUsdValue = minerState && minerState.donutPrice > 0n
    ? (Number(formatUnits(minerState.nextDps, DONUT_DECIMALS)) * Number(formatEther(minerState.donutPrice)) * ethUsdPrice).toFixed(4) : "0.0000";

  const glazedUsdValue = minerState && minerState.donutPrice > 0n && interpolatedGlazed !== null
    ? (Number(formatEther(interpolatedGlazed)) * Number(formatEther(minerState.donutPrice)) * ethUsdPrice).toFixed(2) : "0.00";

  const pnlData = useMemo(() => {
    if (!minerState || !displayPrice) return { eth: "+Ξ0.0000", isPositive: true };
    const pnl = (displayPrice * 80n) / 100n - minerState.initPrice / 2n;
    const isPositive = pnl >= 0n;
    const absolutePnl = pnl >= 0n ? pnl : -pnl;
    return { eth: `${isPositive ? "+" : "-"}Ξ${formatEth(absolutePnl, 4)}`, isPositive };
  }, [minerState, displayPrice]);

  const totalPnlUsd = useMemo(() => {
    if (!minerState || !displayPrice) return { value: "+$0.00", isPositive: true };
    const pnl = (displayPrice * 80n) / 100n - minerState.initPrice / 2n;
    const pnlEth = Number(formatEther(pnl >= 0n ? pnl : -pnl));
    const pnlUsd = pnlEth * ethUsdPrice * (pnl >= 0n ? 1 : -1);
    const glazedUsd = minerState.donutPrice > 0n && interpolatedGlazed
      ? Number(formatEther(interpolatedGlazed)) * Number(formatEther(minerState.donutPrice)) * ethUsdPrice
      : 0;
    const total = glazedUsd + pnlUsd;
    return { value: `${total >= 0 ? "+" : "-"}$${Math.abs(total).toFixed(2)}`, isPositive: total >= 0 };
  }, [minerState, displayPrice, ethUsdPrice, interpolatedGlazed]);

  const occupantInitialsSource = occupantDisplay.isUnknown ? occupantDisplay.addressLabel : occupantDisplay.primary || occupantDisplay.addressLabel;
  const occupantFallbackInitials = occupantDisplay.isUnknown ? (occupantInitialsSource?.slice(-2) ?? "??").toUpperCase() : initialsFrom(occupantInitialsSource);
  
  const ethBalanceDisplay = minerState && minerState.ethBalance !== undefined ? formatEth(minerState.ethBalance, 4) : "—";

  const scrollMessage = minerState?.uri && minerState.uri.trim() !== ""
    ? minerState.uri
    : "We Glaze The World - Donut Labs";

  const buttonLabel = useMemo(() => {
    if (!minerState) return "Loading…";
    if (glazeResult === "success") return "SUCCESS";
    if (glazeResult === "failure") return "FAILED";
    if (isWriting || isConfirming) return "GLAZING…";
    return "MINE";
  }, [glazeResult, isConfirming, isWriting, minerState]);

  const isGlazeDisabled = !minerState || isWriting || isConfirming || glazeResult !== null;

  const handleViewKingGlazerProfile = useCallback(async () => {
    const fid = neynarUser?.user?.fid;
    const username = neynarUser?.user?.username;
    const url = username ? `https://warpcast.com/${username}` : fid ? `https://warpcast.com/~/profiles/${fid}` : null;
    if (!url) return;
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.openUrl(url);
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [neynarUser?.user?.fid, neynarUser?.user?.username]);

  const handleCast = useCallback(async () => {
    const text = `I'm getting some glaze from the $SPRINKLES app 🍩\n\nCurrent price: Ξ${glazePriceDisplay}`;
    
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({
        text,
        embeds: ["https://donutlabs.vercel.app"],
      });
    } catch (e) {
      // Fallback to URL method
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const encodedText = encodeURIComponent(text);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
        });
      } catch {
        const encodedText = encodeURIComponent(text);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
          "_blank"
        );
      }
    }
  }, [glazePriceDisplay]);

  return (
    <div className="flex flex-col h-full -mx-2 overflow-hidden">
      <style>{`
        .miner-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .miner-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto miner-scroll"
        style={{ 
          WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
          maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`
        }}
      >
        {/* Video Section with Fades */}
        <div className="relative h-[280px] overflow-hidden">
          {/* Top fade */}
          <div 
            className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
          
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            src="/media/donut-loop.mp4"
          />
          
          {/* Bottom fade */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-2 px-2 pt-1 pb-4">
          {/* Scrolling Message Ticker */}
          <div className="relative overflow-hidden bg-black border border-zinc-800 rounded-lg">
            <div
              ref={scrollRef}
              className="flex whitespace-nowrap py-1.5 text-xs font-bold text-white"
            >
              {Array.from({ length: 20 }).map((_, i) => (
                <span key={i} className="inline-block px-8">
                  {scrollMessage}
                </span>
              ))}
            </div>
          </div>

          {/* Header with Miner label and Cast button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">Miner</span>
              <button onClick={() => setShowHelpDialog(true)} className="text-gray-500 hover:text-white">
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleCast}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-medium text-white">Cast</span>
            </button>
          </div>

          {/* Miner Info Row */}
          <div className="flex items-center justify-between">
            <div 
              className={cn(
                "flex items-center gap-3",
                neynarUser?.user?.fid && "cursor-pointer"
              )}
              onClick={neynarUser?.user?.fid ? handleViewKingGlazerProfile : undefined}
            >
              <Avatar className="h-10 w-10 border border-zinc-700">
                <AvatarImage
                  src={occupantDisplay.avatarUrl || undefined}
                  alt={occupantDisplay.primary}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white text-sm">
                  {minerState ? occupantFallbackInitials : <CircleUserRound className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-bold text-white">{occupantDisplay.primary}</div>
                <div className="text-xs text-gray-500">{formatAddress(minerAddress)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white">{glazeTimeDisplay}</div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <div className="text-xs text-gray-500">Mine rate</div>
              <div className="text-lg font-bold text-white">{glazeRateDisplay}/s</div>
              <div className="text-xs text-gray-500">${glazeRateUsdValue}/s</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mined</div>
              <div className="text-lg font-bold text-white flex items-center gap-1">
                <span className="text-amber-400">+</span>
                <span>🍩</span>
                <span>{glazedDisplay}</span>
              </div>
              <div className="text-xs text-gray-500">${glazedUsdValue}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className={cn("text-lg font-bold", totalPnlUsd.isPositive ? "text-green-400" : "text-red-400")}>
                {totalPnlUsd.value}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">PnL</div>
              <div className={cn("text-lg font-bold", pnlData.isPositive ? "text-green-400" : "text-red-400")}>
                {pnlData.eth}
              </div>
            </div>
          </div>

          {/* Message Input */}
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Add a message..."
            maxLength={100}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
            style={{ fontSize: '16px' }}
            disabled={isGlazeDisabled}
          />

          {/* Bottom Action Row */}
          <div className="flex items-end gap-4">
            <div className="flex-shrink-0">
              <div className="text-xs text-gray-500">Mine price</div>
              <div className="text-2xl font-bold text-white">Ξ{glazePriceDisplay}</div>
              <div className="text-xs text-gray-500">
                ${displayPrice ? (Number(formatEther(displayPrice)) * ethUsdPrice).toFixed(2) : "0.00"}
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1 flex-1">
              <div className="text-xs text-gray-500">Balance: Ξ{ethBalanceDisplay}</div>
              <button
                className={cn(
                  "w-full py-3 rounded-xl text-base font-bold transition-all duration-300",
                  glazeResult === "success"
                    ? "bg-green-500 text-white"
                    : glazeResult === "failure"
                      ? "bg-red-500 text-white"
                      : isGlazeDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-amber-500 text-black hover:bg-amber-400",
                  isPulsing && !isGlazeDisabled && !glazeResult && "scale-[0.95]"
                )}
                onClick={handleGlaze}
                disabled={isGlazeDisabled}
              >
                {buttonLabel}
              </button>
            </div>
          </div>

          {/* Recent Miners Section */}
          {recentMiners.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="text-xs text-gray-500 mb-2 font-semibold">Recent Miners</div>
              <div className="space-y-2">
                {recentMiners.map((miner, index) => (
                  <div 
                    key={`${miner.address}-${miner.timestamp}`}
                    className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900 border border-zinc-800"
                  >
                    <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={miner.pfpUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">
                        {miner.username ? initialsFrom(miner.username) : miner.address.slice(-2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white text-sm truncate">
                          {miner.username ? `@${miner.username}` : formatAddress(miner.address)}
                        </span>
                        <span className="text-amber-400 text-xs font-bold flex-shrink-0">
                          Ξ{miner.amount}
                        </span>
                      </div>
                      {miner.message && (
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          "{miner.message}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
              <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                How Mining Works
              </h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Become the Miner</div>
                    <div className="text-xs text-gray-400 mt-0.5">Pay the current price to take control.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">2</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Earn 🍩DONUT</div>
                    <div className="text-xs text-gray-400 mt-0.5">While mining, earn DONUT every second.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">3</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Dutch Auction</div>
                    <div className="text-xs text-gray-400 mt-0.5">Price starts high and decreases over time.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-amber-400 text-sm">Get Refunded</div>
                    <div className="text-xs text-gray-400 mt-0.5">When outbid, get 80% of their payment.</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowHelpDialog(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}