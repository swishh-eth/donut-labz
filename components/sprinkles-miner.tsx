"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleUserRound, HelpCircle, X, Coins, Timer, TrendingUp, Sparkles } from "lucide-react";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, parseUnits, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SPRINKLES_MINER_ADDRESS, SPRINKLES_MINER_ABI, DONUT_ADDRESS, DONUT_ABI } from "@/lib/contracts/sprinkles";
import { cn, getEthPrice } from "@/lib/utils";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type Slot0 = {
  locked: number;
  epochId: number;
  initPrice: bigint;
  startTime: number;
  dps: bigint;
  miner: Address;
  uri: string;
};

const SPRINKLES_DECIMALS = 18;
const DONUT_DECIMALS = 18;
const DEADLINE_BUFFER_SECONDS = 15 * 60;

// DEXScreener pair address for SPRINKLES/DONUT pricing
const SPRINKLES_DONUT_PAIR = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668";

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

const formatAddress = (addr?: string) => {
  if (!addr) return "—";
  const normalized = addr.toLowerCase();
  if (normalized === zeroAddress) return "No miner";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

interface SprinklesMinerProps {
  context: MiniAppContext | null;
}

export default function SprinklesMiner({ context }: SprinklesMinerProps) {
  const autoConnectAttempted = useRef(false);
  const [customMessage, setCustomMessage] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [sprinklesPerDonut, setSprinklesPerDonut] = useState<number>(0);
  const [mineResult, setMineResult] = useState<"success" | "failure" | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState("");
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [pendingTxType, setPendingTxType] = useState<"mine" | "approve" | null>(null);
  const pendingTxTypeRef = useRef<"mine" | "approve" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mineResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvalInputRef = useRef<HTMLInputElement>(null);

  const resetMineResult = useCallback(() => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
      mineResultTimeoutRef.current = null;
    }
    setMineResult(null);
  }, []);

  const showMineResult = useCallback((result: "success" | "failure") => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
    }
    setMineResult(result);
    mineResultTimeoutRef.current = setTimeout(() => {
      setMineResult(null);
      mineResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Fetch SPRINKLES/DONUT price ratio from DEXScreener using specific pair
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${SPRINKLES_DONUT_PAIR}`);
        const data = await res.json();
        if (data.pair) {
          const priceInDonut = parseFloat(data.pair.priceNative || "0");
          if (priceInDonut > 0) {
            setSprinklesPerDonut(1 / priceInDonut);
          }
        }
      } catch (e) {
        console.error("Failed to fetch SPRINKLES/DONUT price:", e);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
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
      if (mineResultTimeoutRef.current) {
        clearTimeout(mineResultTimeoutRef.current);
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

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  useEffect(() => {
    if (
      autoConnectAttempted.current ||
      isConnected ||
      !primaryConnector ||
      isConnecting
    ) {
      return;
    }
    autoConnectAttempted.current = true;
    connectAsync({
      connector: primaryConnector,
      chainId: base.id,
    }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  const { data: rawSlot0, refetch: refetchSlot0 } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getSlot0",
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  const { data: currentPrice, refetch: refetchPrice } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getPrice",
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  const { data: currentDps } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getDps",
    chainId: base.id,
    query: {
      refetchInterval: 30_000,
    },
  });

  const { data: donutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: DONUT_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 10_000,
      enabled: !!address,
    },
  });

  const { data: donutAllowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: DONUT_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, SPRINKLES_MINER_ADDRESS],
    chainId: base.id,
    query: {
      refetchInterval: 10_000,
      enabled: !!address,
    },
  });

  const slot0 = useMemo(() => {
    if (!rawSlot0) return undefined;
    const s = rawSlot0 as any;
    return {
      locked: Number(s.locked ?? s[0]),
      epochId: Number(s.epochId ?? s[1]),
      initPrice: BigInt(s.initPrice ?? s[2]),
      startTime: Number(s.startTime ?? s[3]),
      dps: BigInt(s.dps ?? s[4]),
      miner: (s.miner ?? s[5]) as Address,
      uri: (s.uri ?? s[6]) as string,
    } as Slot0;
  }, [rawSlot0]);

  const price = currentPrice as bigint | undefined;
  const dps = currentDps as bigint | undefined;

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
    
    const txType = pendingTxTypeRef.current;
    
    if (receipt.status === "success" || receipt.status === "reverted") {
      showMineResult(receipt.status === "success" ? "success" : "failure");
      refetchSlot0();
      refetchPrice();
      refetchAllowance();
      
      if (receipt.status === "success" && txType === "approve") {
        setIsApprovalMode(false);
        setApprovalAmount("");
      }
      
      // Award spin and post to chat for successful mine
      if (receipt.status === "success" && txType === "mine" && address) {
        // Helper function for retry logic
        const fetchWithRetry = async (url: string, body: object, attempt = 1, maxAttempts = 3) => {
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await res.json();
            
            if (!res.ok && attempt < maxAttempts) {
              console.log(`${url} attempt ${attempt} failed, retrying in 3s...`);
              setTimeout(() => fetchWithRetry(url, body, attempt + 1, maxAttempts), 3000);
            } else if (res.ok) {
              console.log(`${url} success:`, data);
              return true; // Signal success
            } else {
              console.error(`${url} failed after retries:`, data);
              return false;
            }
          } catch (err) {
            if (attempt < maxAttempts) {
              console.log(`${url} attempt ${attempt} error, retrying in 3s...`);
              setTimeout(() => fetchWithRetry(url, body, attempt + 1, maxAttempts), 3000);
            } else {
              console.error(`${url} error after retries:`, err);
            }
            return false;
          }
        };

        // Initial delay of 2 seconds before first attempt
        setTimeout(async () => {
          const success = await fetchWithRetry("/api/spins/award-sprinkles-mine", {
            address: address,
            txHash: receipt.transactionHash,
          });
          
          // Only post to chat AFTER successful verification
          if (success) {
            fetch("/api/chat/mining", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: address,
                type: "mine_sprinkles",
                txHash: receipt.transactionHash,
              }),
            }).catch(console.error);
          }
        }, 2000);
      }
      
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
      
      const resetTimer = setTimeout(() => {
        resetWrite();
      }, 500);
      return () => clearTimeout(resetTimer);
    }
    return;
  }, [receipt, refetchSlot0, refetchPrice, refetchAllowance, resetWrite, showMineResult, address]);

  const minerAddress = slot0?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;

  const { data: profileData } = useQuery<{
    profiles: Record<string, {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null>;
  }>({
    queryKey: ["cached-profile-sprinkles", minerAddress],
    queryFn: async () => {
      const res = await fetch(
        `/api/profiles?addresses=${encodeURIComponent(minerAddress)}`
      );
      if (!res.ok) {
        throw new Error("Failed to load Farcaster profile.");
      }
      return res.json();
    },
    enabled: hasMiner,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const neynarUser = profileData?.profiles?.[minerAddress.toLowerCase()]
    ? { user: profileData.profiles[minerAddress.toLowerCase()] }
    : { user: null };

  const needsApproval = useMemo(() => {
    if (!price || !donutAllowance) return true;
    return (donutAllowance as bigint) < price;
  }, [price, donutAllowance]);

  const parsedApprovalAmount = useMemo(() => {
    if (!approvalAmount || approvalAmount === "") return 0n;
    try {
      return parseUnits(approvalAmount, DONUT_DECIMALS);
    } catch {
      return 0n;
    }
  }, [approvalAmount]);

  const handleApprove = useCallback(async () => {
    if (!address || parsedApprovalAmount === 0n) return;
    setPendingTxType("approve");
    pendingTxTypeRef.current = "approve";
    try {
      await writeContract({
        account: address as Address,
        address: DONUT_ADDRESS,
        abi: DONUT_ABI,
        functionName: "approve",
        args: [SPRINKLES_MINER_ADDRESS, parsedApprovalAmount],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to approve:", error);
      showMineResult("failure");
      resetWrite();
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
    }
  }, [address, parsedApprovalAmount, writeContract, showMineResult, resetWrite]);

  const handleMine = useCallback(async () => {
    if (!slot0 || !price) return;
    resetMineResult();
    setPendingTxType("mine");
    pendingTxTypeRef.current = "mine";
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) {
          throw new Error("Wallet connector not available yet.");
        }
        const result = await connectAsync({
          connector: primaryConnector,
          chainId: base.id,
        });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) {
        throw new Error("Unable to determine wallet address.");
      }

      const epochId = slot0.epochId;
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
      );
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;

      await writeContract({
        account: targetAddress as Address,
        address: SPRINKLES_MINER_ADDRESS,
        abi: SPRINKLES_MINER_ABI,
        functionName: "mine",
        args: [
          targetAddress as Address,
          zeroAddress,
          BigInt(epochId),
          deadline,
          maxPrice,
          customMessage.trim() || "Every donut needs sprinkles - Donut Labs",
        ],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      resetWrite();
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
    }
  }, [
    address,
    connectAsync,
    customMessage,
    slot0,
    price,
    primaryConnector,
    resetMineResult,
    resetWrite,
    showMineResult,
    writeContract,
  ]);

  const [mineElapsedSeconds, setMineElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!slot0) {
      setMineElapsedSeconds(0);
      return;
    }

    const startTimeSeconds = slot0.startTime;
    const initialElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
    setMineElapsedSeconds(initialElapsed);

    const interval = setInterval(() => {
      const currentElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
      setMineElapsedSeconds(currentElapsed);
    }, 1_000);

    return () => clearInterval(interval);
  }, [slot0]);

  const earnedSprinkles = useMemo(() => {
    if (!slot0 || !dps) return 0n;
    return BigInt(mineElapsedSeconds) * dps;
  }, [slot0, dps, mineElapsedSeconds]);

  const occupantDisplay = useMemo(() => {
    if (!slot0) {
      return {
        primary: "—",
        secondary: "",
        isYou: false,
        avatarUrl: null as string | null,
        isUnknown: true,
        addressLabel: "—",
      };
    }
    const minerAddr = slot0.miner;
    const fallback = formatAddress(minerAddr);
    const isYou =
      !!address && minerAddr.toLowerCase() === (address as string).toLowerCase();

    const fallbackAvatarUrl = getAnonPfp(minerAddr);

    const profile = neynarUser?.user ?? null;
    const profileUsername = profile?.username ? `@${profile.username}` : null;
    const profileDisplayName = profile?.displayName ?? null;

    const contextProfile = context?.user ?? null;
    const contextHandle = contextProfile?.username
      ? `@${contextProfile.username}`
      : null;
    const contextDisplayName = contextProfile?.displayName ?? null;

    const addressLabel = fallback;

    const labelCandidates = [
      profileDisplayName,
      profileUsername,
      isYou ? contextDisplayName : null,
      isYou ? contextHandle : null,
      addressLabel,
    ].filter((label): label is string => !!label);

    const seenLabels = new Set<string>();
    const uniqueLabels = labelCandidates.filter((label) => {
      const key = label.toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });

    const primary = uniqueLabels[0] ?? addressLabel;

    const secondary =
      uniqueLabels.find(
        (label) => label !== primary && label.startsWith("@")
      ) ?? "";

    const avatarUrl =
      profile?.pfpUrl ??
      (isYou ? contextProfile?.pfpUrl ?? null : null) ??
      fallbackAvatarUrl;

    const isUnknown =
      !profile && !(isYou && (contextHandle || contextDisplayName));

    return {
      primary,
      secondary,
      isYou,
      avatarUrl,
      isUnknown,
      addressLabel,
    };
  }, [address, context?.user, slot0, neynarUser?.user]);

  const mineRateDisplay = dps
    ? formatTokenAmount(dps, SPRINKLES_DECIMALS, 4)
    : "—";
  const minePriceDisplay = price
    ? Math.floor(Number(formatUnits(price, DONUT_DECIMALS))).toLocaleString()
    : "—";
  const earnedDisplay = formatTokenAmount(earnedSprinkles, SPRINKLES_DECIMALS, 2);

  const minerPaidDisplay = useMemo(() => {
    if (!slot0 || !slot0.initPrice) return "—";
    const actualPaid = slot0.initPrice / 2n;
    return Math.floor(Number(formatUnits(actualPaid, DONUT_DECIMALS))).toLocaleString();
  }, [slot0]);

  // PNL calculation: (SPRINKLES earned in DONUT) + (80% of current price) - (what they paid)
  const pnlData = useMemo(() => {
    if (!slot0 || !slot0.initPrice || !price || sprinklesPerDonut === 0) {
      return { donut: "0", isPositive: true };
    }
    
    // What they paid (initPrice / 2)
    const paid = slot0.initPrice / 2n;
    const paidNumber = Number(formatUnits(paid, DONUT_DECIMALS));
    
    // What they'd get back (80% of current price)
    const refund = (price * 80n) / 100n;
    const refundNumber = Number(formatUnits(refund, DONUT_DECIMALS));
    
    // SPRINKLES earned converted to DONUT value
    const sprinklesEarnedNumber = Number(formatUnits(earnedSprinkles, SPRINKLES_DECIMALS));
    const sprinklesValueInDonut = sprinklesEarnedNumber / sprinklesPerDonut;
    
    // Total PNL
    const pnl = sprinklesValueInDonut + refundNumber - paidNumber;
    const isPositive = pnl >= 0;
    
    return {
      donut: `${isPositive ? "+" : ""}${Math.floor(pnl).toLocaleString()}`,
      isPositive,
    };
  }, [slot0, price, earnedSprinkles, sprinklesPerDonut]);

  const donutPerSecondDisplay = useMemo(() => {
    if (!dps || sprinklesPerDonut === 0) return null;
    const sprinklesPerSecond = Number(dps) / 1e18;
    const donutEquivalent = sprinklesPerSecond / sprinklesPerDonut;
    
    if (donutEquivalent < 0.0001) return null;
    return donutEquivalent.toFixed(4);
  }, [dps, sprinklesPerDonut]);

  const formatMineTime = (seconds: number): string => {
    if (seconds < 0) return "0s";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const mineTimeDisplay = slot0 ? formatMineTime(mineElapsedSeconds) : "—";

  const occupantInitialsSource = occupantDisplay.isUnknown
    ? occupantDisplay.addressLabel
    : occupantDisplay.primary || occupantDisplay.addressLabel;

  const occupantFallbackInitials = occupantDisplay.isUnknown
    ? (occupantInitialsSource?.slice(-2) ?? "??").toUpperCase()
    : initialsFrom(occupantInitialsSource);

  const donutBalanceDisplay = donutBalance
    ? Math.floor(Number(formatUnits(donutBalance as bigint, DONUT_DECIMALS))).toLocaleString()
    : "—";

  const currentAllowanceDisplay = donutAllowance
    ? Math.floor(Number(formatUnits(donutAllowance as bigint, DONUT_DECIMALS))).toLocaleString()
    : "0";

  const buttonLabel = useMemo(() => {
    if (!slot0 || price === undefined) return "Loading…";
    if (mineResult === "success") return "SUCCESS";
    if (mineResult === "failure") return "FAILURE";
    if (isWriting || isConfirming) {
      return pendingTxType === "approve" ? "APPROVING…" : "MINING…";
    }
    if (needsApproval && !isApprovalMode) return "APPROVE";
    return "MINE";
  }, [mineResult, isConfirming, isWriting, slot0, price, needsApproval, isApprovalMode, pendingTxType]);

  const isMineDisabled =
    !slot0 || price === undefined || isWriting || isConfirming || mineResult !== null;

  const isApproveButtonDisabled = 
    isMineDisabled || parsedApprovalAmount === 0n || !approvalAmount;

  const handleViewMinerProfile = useCallback(() => {
    const fid = neynarUser?.user?.fid;
    const username = neynarUser?.user?.username;

    if (username) {
      window.open(`https://warpcast.com/${username}`, "_blank", "noopener,noreferrer");
    } else if (fid) {
      window.open(`https://warpcast.com/~/profiles/${fid}`, "_blank", "noopener,noreferrer");
    }
  }, [neynarUser?.user?.fid, neynarUser?.user?.username]);

  const scrollMessage =
    slot0?.uri && slot0.uri.trim() !== ""
      ? slot0.uri
      : "Every donut needs sprinkles - Donut Labs";

  const handleApproveClick = useCallback(() => {
    if (needsApproval && !isApprovalMode) {
      setIsApprovalMode(true);
      setTimeout(() => {
        approvalInputRef.current?.focus();
      }, 100);
    }
  }, [needsApproval, isApprovalMode]);

  return (
    <>
      <div className="-mx-2 w-[calc(100%+1rem)] overflow-hidden flex-1">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          src="/media/sprinkles-loop.mp4"
        />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg">
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

        <div
          className={cn(
            "bg-zinc-900 border rounded-lg p-2",
            occupantDisplay.isYou
              ? "border-white shadow-[inset_0_0_16px_rgba(255,255,255,0.2)]"
              : "border-zinc-800"
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex-shrink-0",
                neynarUser?.user?.fid &&
                  "cursor-pointer hover:opacity-80 transition-opacity"
              )}
              onClick={
                neynarUser?.user?.fid ? handleViewMinerProfile : undefined
              }
            >
              <Avatar className="h-10 w-10 border border-zinc-700">
                <AvatarImage
                  src={occupantDisplay.avatarUrl || undefined}
                  alt={occupantDisplay.primary}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white text-sm">
                  {slot0 ? (
                    occupantFallbackInitials
                  ) : (
                    <CircleUserRound className="h-4 w-4" />
                  )}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[8px] text-gray-500 uppercase tracking-wider">
                Current Miner
              </div>
              <div className="font-bold text-white text-sm truncate">
                {occupantDisplay.primary}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-right flex-shrink-0">
              <div>
                <div className="text-[8px] text-gray-500">PAID</div>
                <div className="text-xs font-bold text-amber-400">
                  🍩{minerPaidDisplay}
                </div>
              </div>
              <div>
                <div className="text-[8px] text-gray-500">PNL</div>
                <div className={cn(
                  "text-xs font-bold",
                  pnlData.isPositive ? "text-green-400" : "text-red-400"
                )}>
                  🍩{pnlData.donut}
                </div>
              </div>
              <div>
                <div className="text-[8px] text-gray-500">TIME</div>
                <div className="text-xs font-bold text-white">
                  {mineTimeDisplay}
                </div>
              </div>
              <div>
                <div className="text-[8px] text-gray-500">EARNED</div>
                <div className="text-xs font-bold text-white flex items-center justify-end gap-0.5">
                  <Sparkles className="w-3 h-3 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />{earnedDisplay}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-white" />
              <span className="text-[9px] text-gray-400 uppercase">
                Mine Rate
              </span>
            </div>
            <div className="text-lg font-bold text-white flex items-center justify-center gap-0.5">
              <Sparkles className="w-4 h-4 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />{mineRateDisplay}
              <span className="text-xs text-gray-400">/s</span>
            </div>
            {donutPerSecondDisplay && (
              <div className="text-[10px] text-amber-400 mt-0.5">
                ≈ 🍩{donutPerSecondDisplay}/s
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Coins className="w-3 h-3 text-white" />
              <span className="text-[9px] text-gray-400 uppercase">
                Mine Price
              </span>
            </div>
            <div className="text-lg font-bold text-white">
              🍩{minePriceDisplay}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowHelpDialog(true)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
              <span className="text-xs font-semibold text-white">
                Dutch Auction
              </span>
              <HelpCircle className="w-3 h-3 text-gray-400" />
            </div>
            <div className="text-[10px] text-gray-400">
              Price drops over time
            </div>
          </div>
        </button>

        {showHelpDialog && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setShowHelpDialog(false)}
            />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Timer className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  How <Sparkles className="w-4 h-4 inline drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />SPRINKLES Mining Works
                </h2>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-sm">Pay 🍩DONUT to Mine</div>
                      <div className="text-xs text-gray-400 mt-0.5">Pay the current price in DONUT to become the miner.</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-sm flex items-center gap-1">Earn <Sparkles className="w-3 h-3 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />SPRINKLES</div>
                      <div className="text-xs text-gray-400 mt-0.5">While you are the miner, you earn SPRINKLES every second.</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">3</div>
                    <div>
                      <div className="font-semibold text-white text-sm">Dutch Auction</div>
                      <div className="text-xs text-gray-400 mt-0.5">Price starts high and drops to 1 🍩DONUT over 1 hour.</div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">4</div>
                    <div>
                      <div className="font-semibold text-white text-sm">Get Paid Back</div>
                      <div className="text-xs text-gray-400 mt-0.5">When someone outbids you, you get 80% of their 🍩DONUT payment.</div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-gray-500 text-center mt-4 flex items-center justify-center gap-1">
                  10% of all 🍩DONUT payments are used to buy and burn <Sparkles className="w-3 h-3 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />SPRINKLES!
                </p>

                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          type="text"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Add a GLOBAL message (optional)"
          maxLength={100}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontSize: '16px' }}
          disabled={isMineDisabled}
        />

        {needsApproval && isApprovalMode ? (
          <div className="flex w-full rounded-xl overflow-hidden">
            <input
              ref={approvalInputRef}
              type="text"
              inputMode="decimal"
              value={approvalAmount}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                const parts = value.split('.');
                if (parts.length > 2) return;
                setApprovalAmount(value);
              }}
              placeholder="Enter DONUT amount"
              className="flex-1 bg-zinc-800 text-white px-4 py-4 text-lg font-bold placeholder-gray-500 focus:outline-none"
              style={{ fontSize: '16px' }}
              disabled={isWriting || isConfirming}
            />
            <button
              className={cn(
                "px-6 py-4 text-lg font-bold transition-all duration-300",
                isApproveButtonDisabled
                  ? "bg-zinc-700 text-gray-500 cursor-not-allowed"
                  : "bg-amber-500 text-black hover:bg-amber-400",
                mineResult === "success" && "bg-green-500 text-white",
                mineResult === "failure" && "bg-red-500 text-white"
              )}
              onClick={handleApprove}
              disabled={isApproveButtonDisabled}
            >
              {isWriting || isConfirming ? "…" : mineResult === "success" ? "✓" : mineResult === "failure" ? "✗" : "APPROVE"}
            </button>
          </div>
        ) : (
          <button
            className={cn(
              "w-full rounded-xl py-4 text-lg font-bold transition-all duration-300",
              mineResult === "success"
                ? "bg-green-500 text-white"
                : mineResult === "failure"
                  ? "bg-red-500 text-white"
                  : isMineDisabled
                    ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                    : needsApproval
                      ? "bg-amber-500 text-black hover:bg-amber-400"
                      : "bg-white text-black hover:bg-gray-200",
              isPulsing && !isMineDisabled && !mineResult && "scale-[0.95]"
            )}
            onClick={needsApproval ? handleApproveClick : handleMine}
            disabled={isMineDisabled}
          >
            {buttonLabel}
          </button>
        )}

        <div className="w-full border border-zinc-800 rounded-lg p-2 bg-zinc-900">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-gray-400 uppercase tracking-wider">
              Your DONUT Balance
            </div>
            {(donutAllowance as bigint) > 0n && (
              <div className="text-[9px] text-amber-400">
                Approved: 🍩{currentAllowanceDisplay}
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">
              🍩 {donutBalanceDisplay}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}