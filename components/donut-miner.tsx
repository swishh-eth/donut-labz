"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleUserRound, HelpCircle, X, MessageCircle, Trophy } from "lucide-react";

// Coin image components
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover" />
  </span>
);

const EthCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <img src="/coins/eth_logo.png" alt="ETH" className={`${className} rounded-full object-cover`} />
);
import {
  useAccount,
  useConnect,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, http, fallback, formatEther, formatUnits, zeroAddress, type Address } from "viem";

// Alchemy RPC (primary) with fallbacks for reliability
const ALCHEMY_RPC = "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";
const FALLBACK_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.meowrpc.com",
];

// Create a public client with Alchemy as primary and fallbacks
const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http(ALCHEMY_RPC, { timeout: 10_000 }),
    http(FALLBACK_RPCS[0], { timeout: 15_000 }),
    http(FALLBACK_RPCS[1], { timeout: 15_000 }),
    http(FALLBACK_RPCS[2], { timeout: 15_000 }),
    http(FALLBACK_RPCS[3], { timeout: 15_000 }),
  ]),
});

// Helper function to read contract with Alchemy RPC
async function readContractWithAlchemy<T>(
  address: Address,
  abi: any,
  functionName: string,
  args?: readonly any[]
): Promise<T> {
  const params: any = {
    address,
    abi,
    functionName,
  };
  if (args && args.length > 0) {
    params.args = args;
  }
  return publicClient.readContract(params) as Promise<T>;
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { cn, getEthPrice } from "@/lib/utils";

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

const DONUT_DECIMALS = 18;
const DEADLINE_BUFFER_SECONDS = 15 * 60;
const AUCTION_DURATION = 3600;
const MIN_PRICE = 100000000000000n;

const DEFAULT_MESSAGES = [
  "Every donut needs sprinkles!",
  "Sprinkling magic on Base!",
  "Powered by Chromium Donut Tech.",
  "Stay glazed, stay based!",
  "The donut shop never closes...",
  "More sprinkles, more fun!",
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

// Matrix-style single digit component
function MatrixDigit({ char, delay = 0, isReady }: { char: string; delay?: number; isReady: boolean }) {
  const [displayChar, setDisplayChar] = useState(char === '.' || char === ',' || char === '-' || char === '+' || char === '$' || char === 'h' || char === 'm' || char === 's' || char === 'r' || char === ' ' ? char : '0');
  const [isAnimating, setIsAnimating] = useState(false);
  const hasAnimatedRef = useRef(false);
  
  // Don't animate punctuation, letter suffixes, or spaces
  const isNonNumeric = char === '.' || char === ',' || char === '-' || char === '+' || char === '$' || char === 'h' || char === 'm' || char === 's' || char === 'r' || char === ' ';
  
  useEffect(() => {
    if (isNonNumeric) {
      setDisplayChar(char);
      setIsAnimating(false);
      return;
    }
    
    // If already animated, just show the char (live updates)
    if (hasAnimatedRef.current) {
      setDisplayChar(char);
      setIsAnimating(false);
      return;
    }
    
    // Wait for ready signal
    if (!isReady) return;
    
    hasAnimatedRef.current = true;
    setIsAnimating(true);
    
    let cycleCount = 0;
    const maxCycles = 8 + Math.floor(delay / 30);
    
    const cycleInterval = setInterval(() => {
      if (cycleCount < maxCycles) {
        setDisplayChar(Math.floor(Math.random() * 10).toString());
        cycleCount++;
      } else {
        setDisplayChar(char);
        setIsAnimating(false);
        clearInterval(cycleInterval);
      }
    }, 50);
    
    return () => {
      clearInterval(cycleInterval);
      setIsAnimating(false);
    };
  }, [char, delay, isReady, isNonNumeric]);
  
  return (
    <span 
      className={`transition-colors duration-100 ${isAnimating ? 'text-pink-400/70' : ''}`}
    >
      {displayChar}
    </span>
  );
}

// Matrix-style number display
function MatrixNumber({ 
  value, 
  isReady,
  className = ""
}: { 
  value: string; 
  isReady: boolean;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  const initializedRef = useRef(false);
  
  useEffect(() => {
    if (!initializedRef.current && isReady && value && value !== "—") {
      initializedRef.current = true;
      setKey(1);
    }
  }, [isReady, value]);
  
  if (!value || value === "—" || !initializedRef.current) {
    return <span className={`tabular-nums ${className}`}>—</span>;
  }
  
  const chars = value.split('');
  
  return (
    <span key={key} className={`tabular-nums ${className}`}>
      {chars.map((char, index) => (
        <MatrixDigit 
          key={`${key}-${index}`} 
          char={char} 
          delay={index * 30} 
          isReady={isReady}
        />
      ))}
    </span>
  );
}

// Falling Donut Coins Component
function FallingDonutCoins() {
  const coins = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${5 + (i * 5) % 90}%`,
      delay: `${(Math.sin(i * 12.9898) * 43758.5453 % 1) * 8}s`,
      duration: `${5 + (i % 4)}s`,
      size: 20 + (i % 4) * 8,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute falling-coin"
          style={{
            left: c.left,
            top: '-60px',
            animationDelay: c.delay,
            animationDuration: c.duration,
          }}
        >
          <span 
            className="rounded-full overflow-hidden inline-flex items-center justify-center ring-1 ring-pink-500/30"
            style={{ width: c.size, height: c.size }}
          >
            <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover" />
          </span>
        </div>
      ))}
    </div>
  );
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const glazeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultMessageRef = useRef<string>(getRandomDefaultMessage());
  const prevMinerRef = useRef<string>("");
  const [interpolatedPrice, setInterpolatedPrice] = useState<bigint | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });

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

  // ETH price - refresh every 30 seconds (was 60)
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 30_000);
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

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Use Alchemy RPC for miner state - refresh every 5 seconds (was 10)
  const { data: rawMinerState, refetch: refetchMinerState } = useQuery({
    queryKey: ["minerState", CONTRACT_ADDRESSES.multicall, address],
    queryFn: async () => {
      return readContractWithAlchemy<MinerState>(
        CONTRACT_ADDRESSES.multicall as Address,
        MULTICALL_ABI,
        "getMiner",
        [address ?? zeroAddress]
      );
    },
    refetchInterval: 5_000, // Refresh every 5 seconds
    staleTime: 3_000,
  });

  const minerState = useMemo(() => {
    if (!rawMinerState) return undefined;
    return rawMinerState as MinerState;
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

      if (receipt.status === "success") {
        import("@farcaster/miniapp-sdk").then(({ sdk }) => {
          sdk.haptics.notificationOccurred("success").catch(() => {});
        }).catch(() => {});
        
        defaultMessageRef.current = getRandomDefaultMessage();
        
        // Record to glaze_transactions table
        if (address) {
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
        }
      }

      refetchMinerState();
      const resetTimer = setTimeout(() => resetWrite(), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [receipt, refetchMinerState, resetWrite, showGlazeResult, address]);

  const minerAddress = minerState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;

  // Detect when miner changes
  useEffect(() => {
    if (prevMinerRef.current && minerAddress !== prevMinerRef.current && minerAddress !== zeroAddress) {
      import("@farcaster/miniapp-sdk").then(({ sdk }) => {
        sdk.haptics.impactOccurred("light").catch(() => {});
      }).catch(() => {});
    }
    prevMinerRef.current = minerAddress;
  }, [minerAddress]);


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
  const glazePriceDisplay = displayPrice ? formatEth(displayPrice, 3) : "—";
  const glazedDisplay = minerState && interpolatedGlazed !== null ? formatTokenAmount(interpolatedGlazed, DONUT_DECIMALS, 0) : "—";

  const formatGlazeTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      if (minutes === 0) return `${hours}hr`;
      return `${hours}hr ${minutes}m`;
    }
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const glazeTimeDisplay = minerState ? formatGlazeTime(glazeElapsedSeconds) : "—";
  
  const glazeRateUsdValue = minerState && minerState.donutPrice > 0n
    ? (Number(formatUnits(minerState.nextDps, DONUT_DECIMALS)) * Number(formatEther(minerState.donutPrice)) * ethUsdPrice).toFixed(4) : "0.0000";

  const glazedUsdValue = minerState && minerState.donutPrice > 0n && interpolatedGlazed !== null
    ? (Number(formatEther(interpolatedGlazed)) * Number(formatEther(minerState.donutPrice)) * ethUsdPrice).toFixed(2) : "0.00";

  const pnlData = useMemo(() => {
    if (!minerState || !displayPrice) return { value: "0.0000", isPositive: true };
    const pnl = (displayPrice * 80n) / 100n - minerState.initPrice / 2n;
    const isPositive = pnl >= 0n;
    const absolutePnl = pnl >= 0n ? pnl : -pnl;
    return { value: `${isPositive ? "+" : "-"}${formatEth(absolutePnl, 4)}`, isPositive };
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
    : "We Glaze The World - Sprinkles App";

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
        embeds: ["https://sprinkles.wtf"],
      });
    } catch (e) {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const encodedText = encodeURIComponent(text);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://sprinkles.wtf`,
        });
      } catch {
        const encodedText = encodeURIComponent(text);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://sprinkles.wtf`,
          "_blank"
        );
      }
    }
  }, [glazePriceDisplay]);

  const paidAmountDisplay = minerState ? Number(formatEther(minerState.initPrice / 2n)).toFixed(3) : '—';

  return (
    <div className="flex flex-col h-full -mx-2 overflow-hidden">
      <style>{`
        .miner-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .miner-scroll::-webkit-scrollbar { display: none; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-scale { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
        @keyframes falling-coin {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(280px) rotate(360deg); opacity: 0; }
        }
        .spin-slow { animation: spin-slow 8s linear infinite; }
        .pulse-scale { animation: pulse-scale 3s ease-in-out infinite; }
        .falling-coin { animation: falling-coin linear infinite; }
      `}</style>
      
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto miner-scroll"
        style={{ 
          WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
          maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`
        }}
      >
        <div className="relative h-[240px] overflow-hidden bg-black">
          {/* Falling donut coins background */}
          <FallingDonutCoins />
          
          {/* Top fade */}
          <div 
            className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
          
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div 
              className={cn(
                "flex flex-col items-center pulse-scale",
                neynarUser?.user?.fid && "cursor-pointer pointer-events-auto"
              )}
              onClick={neynarUser?.user?.fid ? handleViewKingGlazerProfile : undefined}
            >
              <div className="rounded-full bg-black p-0.5 spin-slow">
                <Avatar className="h-24 w-24 border-2 border-pink-400/50">
                  <AvatarImage
                    src={occupantDisplay.avatarUrl || undefined}
                    alt={occupantDisplay.primary}
                    className="object-cover bg-black"
                  />
                  <AvatarFallback className="bg-zinc-900 text-white text-lg">
                    {minerState ? occupantFallbackInitials : <CircleUserRound className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="mt-2 text-center">
                <div className="font-bold text-pink-400 text-sm drop-shadow-lg">{occupantDisplay.primary}</div>
                <div className="text-[10px] text-pink-400/70 drop-shadow-lg">{formatAddress(minerAddress)}</div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] font-bold text-pink-400 drop-shadow-lg uppercase tracking-wider">Current Miner</span>
              </div>
            </div>
          </div>
          
          {/* Bottom fade */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
        </div>

        <div className="flex flex-col gap-2 px-2 pt-1 pb-4">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 relative overflow-hidden bg-black border border-zinc-800 rounded-lg">
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
            <button
              onClick={handleCast}
              className="flex items-center gap-1.5 px-3 rounded-lg border border-zinc-800 bg-black hover:bg-zinc-900 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-medium text-white">Cast</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-gray-500">Paid</div>
              <div className="text-xl font-bold text-white flex items-center gap-1">
                <EthCoin className="w-5 h-5" />
                <MatrixNumber value={paidAmountDisplay} isReady={!!minerState} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mined</div>
              <div className="text-xl font-bold text-white flex items-center gap-1 whitespace-nowrap">
                <span>+</span>
                <DonutCoin className="w-5 h-5" />
                <MatrixNumber value={glazedDisplay} isReady={!!minerState} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Time</div>
              <div className="text-xl font-bold text-white whitespace-nowrap">
                <MatrixNumber value={glazeTimeDisplay} isReady={!!minerState} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mine rate</div>
              <div className="text-xl font-bold text-white flex items-center gap-1">
                <MatrixNumber value={glazeRateDisplay} isReady={!!minerState} />
                <span>/s</span>
              </div>
              <div className="text-xs text-pink-400">
                $<MatrixNumber value={glazeRateUsdValue} isReady={!!minerState} className="text-pink-400" />/s
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">PnL</div>
              <div className={cn("text-xl font-bold flex items-center gap-1", pnlData.isPositive ? "text-pink-400" : "text-red-400")}>
                <EthCoin className="w-5 h-5" />
                <MatrixNumber value={pnlData.value} isReady={!!minerState} className={pnlData.isPositive ? "text-pink-400" : "text-red-400"} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className={cn("text-xl font-bold", totalPnlUsd.isPositive ? "text-pink-400" : "text-red-400")}>
                <MatrixNumber value={totalPnlUsd.value} isReady={!!minerState} className={totalPnlUsd.isPositive ? "text-pink-400" : "text-red-400"} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 items-end mt-1">
            <div 
              className="cursor-pointer"
              onClick={() => setShowHelpDialog(true)}
            >
              <div className="text-xs text-gray-500 flex items-center gap-1">
                Mine price
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-white flex items-center gap-1">
                <EthCoin className="w-7 h-7" />
                <MatrixNumber value={glazePriceDisplay} isReady={!!minerState} />
              </div>
              <div className="text-xs text-gray-500">
                $<MatrixNumber value={displayPrice ? (Number(formatEther(displayPrice)) * ethUsdPrice).toFixed(2) : "0.00"} isReady={!!minerState} className="text-gray-500" />
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <div className="text-xs text-gray-500 flex items-center gap-1">
                Balance: <EthCoin className="w-3 h-3" />
                <MatrixNumber value={ethBalanceDisplay} isReady={!!minerState} className="text-gray-500" />
              </div>
              <button
                className={cn(
                  "w-full py-3 rounded-xl text-base font-bold transition-all duration-300",
                  glazeResult === "success"
                    ? "bg-green-500 text-white"
                    : glazeResult === "failure"
                      ? "bg-red-500 text-white"
                      : isGlazeDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-white text-black hover:bg-gray-200",
                  isPulsing && !isGlazeDisabled && !glazeResult && "scale-[0.95]"
                )}
                onClick={handleGlaze}
                disabled={isGlazeDisabled}
              >
                {buttonLabel}
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a message..."
              maxLength={100}
              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
              style={{ fontSize: '16px' }}
              disabled={isGlazeDisabled}
            />
          </div>

        </div>
      </div>

      {showHelpDialog && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
              <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-pink-400" />
                How Mining Works
              </h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-xs font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Become the Miner</div>
                    <div className="text-xs text-gray-400 mt-0.5">Pay the current price to take control.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">2</div>
                  <div>
                    <div className="font-semibold text-white text-sm flex items-center gap-1">Earn <DonutCoin className="w-4 h-4" /> DONUT</div>
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-xs font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-pink-400 text-sm">Get Refunded</div>
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