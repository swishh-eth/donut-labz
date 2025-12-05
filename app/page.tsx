"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { CircleUserRound, HelpCircle, X, Coins, Timer, TrendingUp } from "lucide-react";
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
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";

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
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function HomePage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [glazeResult, setGlazeResult] = useState<"success" | "failure" | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const glazeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (glazeResultTimeoutRef.current) {
        clearTimeout(glazeResultTimeoutRef.current);
      }
    };
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

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);

    return () => clearInterval(interval);
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

  const { data: rawMinerState, refetch: refetchMinerState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getMiner",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  const minerState = useMemo(() => {
    if (!rawMinerState) return undefined;
    return rawMinerState as unknown as MinerState;
  }, [rawMinerState]);

  const { data: accountData } = useAccountData(address);

  useEffect(() => {
    if (!readyRef.current && minerState) {
      readyRef.current = true;
      sdk.actions.ready().catch(() => {});
    }
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

      if (receipt.status === "success" && address) {
        fetch("/api/record-glaze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: address,
            txHash: receipt.transactionHash,
          }),
        }).catch(console.error);
      }

      refetchMinerState();
      const resetTimer = setTimeout(() => {
        resetWrite();
      }, 500);
      return () => clearTimeout(resetTimer);
    }
    return;
  }, [receipt, refetchMinerState, resetWrite, showGlazeResult, address]);

  const minerAddress = minerState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;

  const claimedHandleParam = (minerState?.uri ?? "").trim();

  const { data: neynarUser } = useQuery<{
    user: {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null;
  }>({
    queryKey: ["neynar-user", minerAddress],
    queryFn: async () => {
      const res = await fetch(
        `/api/neynar/user?address=${encodeURIComponent(minerAddress)}`
      );
      if (!res.ok) {
        throw new Error("Failed to load Farcaster profile.");
      }
      return (await res.json()) as {
        user: {
          fid: number | null;
          username: string | null;
          displayName: string | null;
          pfpUrl: string | null;
        } | null;
      };
    },
    enabled: hasMiner,
    staleTime: 60_000,
    retry: false,
  });

  const handleGlaze = useCallback(async () => {
    if (!minerState) return;
    resetGlazeResult();
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
      const price = minerState.price;
      const epochId = toBigInt(minerState.epochId);
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
      );
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;
      await writeContract({
        account: targetAddress as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "mine",
        args: [
          CONTRACT_ADDRESSES.provider as Address,
          epochId,
          deadline,
          maxPrice,
          customMessage.trim() || "DONUT LABS - RESEARCH DEPARTMENT",
        ],
        value: price,
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to glaze:", error);
      showGlazeResult("failure");
      resetWrite();
    }
  }, [
    address,
    connectAsync,
    customMessage,
    minerState,
    primaryConnector,
    resetGlazeResult,
    resetWrite,
    showGlazeResult,
    writeContract,
  ]);

  const [interpolatedGlazed, setInterpolatedGlazed] = useState<bigint | null>(null);
  const [glazeElapsedSeconds, setGlazeElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!minerState) {
      setInterpolatedGlazed(null);
      return;
    }

    setInterpolatedGlazed(minerState.glazed);

    const interval = setInterval(() => {
      if (minerState.nextDps > 0n) {
        setInterpolatedGlazed((prev) => {
          if (!prev) return minerState.glazed;
          return prev + minerState.nextDps;
        });
      }
    }, 1_000);

    return () => clearInterval(interval);
  }, [minerState]);

  useEffect(() => {
    if (!minerState) {
      setGlazeElapsedSeconds(0);
      return;
    }

    const startTimeSeconds = Number(minerState.startTime);
    const initialElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
    setGlazeElapsedSeconds(initialElapsed);

    const interval = setInterval(() => {
      const currentElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
      setGlazeElapsedSeconds(currentElapsed);
    }, 1_000);

    return () => clearInterval(interval);
  }, [minerState]);

  const occupantDisplay = useMemo(() => {
    if (!minerState) {
      return {
        primary: "—",
        secondary: "",
        isYou: false,
        avatarUrl: null as string | null,
        isUnknown: true,
        addressLabel: "—",
      };
    }
    const minerAddr = minerState.miner;
    const fallback = formatAddress(minerAddr);
    const isYou =
      !!address && minerAddr.toLowerCase() === (address as string).toLowerCase();

    const fallbackAvatarUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
      minerAddr.toLowerCase()
    )}`;

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
      !profile && !claimedHandleParam && !(isYou && (contextHandle || contextDisplayName));

    return {
      primary,
      secondary,
      isYou,
      avatarUrl,
      isUnknown,
      addressLabel,
    };
  }, [
    address,
    claimedHandleParam,
    context?.user,
    minerState,
    neynarUser?.user,
  ]);

  const glazeRateDisplay = minerState
    ? formatTokenAmount(minerState.nextDps, DONUT_DECIMALS, 4)
    : "—";
  const glazePriceDisplay = minerState
    ? formatEth(minerState.price, minerState.price === 0n ? 0 : 5)
    : "—";
  const glazedDisplay =
    minerState && interpolatedGlazed !== null
      ? formatTokenAmount(interpolatedGlazed, DONUT_DECIMALS, 2)
      : "—";

  const formatGlazeTime = (seconds: number): string => {
    if (seconds < 0) return "0s";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const glazeTimeDisplay = minerState ? formatGlazeTime(glazeElapsedSeconds) : "—";

  const glazedUsdValue =
    minerState && minerState.donutPrice > 0n && interpolatedGlazed !== null
      ? (
          Number(formatEther(interpolatedGlazed)) *
          Number(formatEther(minerState.donutPrice)) *
          ethUsdPrice
        ).toFixed(2)
      : "0.00";

  const glazeRateUsdValue =
    minerState && minerState.donutPrice > 0n
      ? (
          Number(formatUnits(minerState.nextDps, DONUT_DECIMALS)) *
          Number(formatEther(minerState.donutPrice)) *
          ethUsdPrice
        ).toFixed(4)
      : "0.0000";

  const pnlData = useMemo(() => {
    if (!minerState) return { eth: "0", usd: "$0.00", isPositive: true };
    const pnl = (minerState.price * 80n) / 100n - minerState.initPrice / 2n;
    const isPositive = pnl >= 0n;
    const absolutePnl = pnl >= 0n ? pnl : -pnl;
    const pnlEth = Number(formatEther(absolutePnl));
    const pnlUsd = pnlEth * ethUsdPrice;
    return {
      eth: `${isPositive ? "+" : "-"}Ξ${formatEth(absolutePnl, 5)}`,
      usd: `${isPositive ? "+" : "-"}$${pnlUsd.toFixed(2)}`,
      isPositive,
    };
  }, [minerState, ethUsdPrice]);

  const totalPnl = useMemo(() => {
    if (!minerState) return { value: "$0.00", isPositive: true };
    const pnl = (minerState.price * 80n) / 100n - minerState.initPrice / 2n;
    const pnlEth = Number(formatEther(pnl >= 0n ? pnl : -pnl));
    const pnlUsd = pnlEth * ethUsdPrice * (pnl >= 0n ? 1 : -1);
    const glazedUsd = Number(glazedUsdValue);
    const total = glazedUsd + pnlUsd;
    return {
      value: `${total >= 0 ? "+" : "-"}$${Math.abs(total).toFixed(2)}`,
      isPositive: total >= 0,
    };
  }, [minerState, ethUsdPrice, glazedUsdValue]);

  const occupantInitialsSource = occupantDisplay.isUnknown
    ? occupantDisplay.addressLabel
    : occupantDisplay.primary || occupantDisplay.addressLabel;

  const occupantFallbackInitials = occupantDisplay.isUnknown
    ? (occupantInitialsSource?.slice(-2) ?? "??").toUpperCase()
    : initialsFrom(occupantInitialsSource);

  const donutBalanceDisplay =
    minerState && minerState.donutBalance !== undefined
      ? formatTokenAmount(minerState.donutBalance, DONUT_DECIMALS, 2)
      : "—";
  const ethBalanceDisplay =
    minerState && minerState.ethBalance !== undefined
      ? formatEth(minerState.ethBalance, 4)
      : "—";

  const buttonLabel = useMemo(() => {
    if (!minerState) return "Loading…";
    if (glazeResult === "success") return "SUCCESS";
    if (glazeResult === "failure") return "FAILURE";
    if (isWriting || isConfirming) {
      return "GLAZING…";
    }
    return "GLAZE";
  }, [glazeResult, isConfirming, isWriting, minerState]);

  const isGlazeDisabled =
    !minerState || isWriting || isConfirming || glazeResult !== null;

  const handleViewKingGlazerProfile = useCallback(() => {
    const fid = neynarUser?.user?.fid;
    const username = neynarUser?.user?.username;

    if (username) {
      window.open(`https://warpcast.com/${username}`, "_blank", "noopener,noreferrer");
    } else if (fid) {
      window.open(`https://warpcast.com/~/profiles/${fid}`, "_blank", "noopener,noreferrer");
    }
  }, [neynarUser?.user?.fid, neynarUser?.user?.username]);

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  // Get the scrolling message text
  const scrollMessage = minerState?.uri && minerState.uri.trim() !== ""
    ? minerState.uri
    : "We Glaze The World";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <AddToFarcasterDialog showOnFirstVisit={true} />

      {/* Smooth scroll animation styles */}
      <style jsx>{`
        @keyframes smoothScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .smooth-scroll {
          animation: smoothScroll 20s linear infinite;
        }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header - Original Size */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">AUCTION</h1>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage
                    src={userAvatarUrl || undefined}
                    alt={userDisplayName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-zinc-800 text-white">
                    {initialsFrom(userDisplayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle && (
                    <div className="text-xs text-gray-400">{userHandle}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Video Player */}
          <div className="-mx-2 w-[calc(100%+1rem)] overflow-hidden flex-1">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              src="/media/donut-loop.mp4"
            />
          </div>

          {/* Bottom Content - Pushed to bottom */}
          <div className="mt-auto flex flex-col gap-2">
            {/* Scrolling Global Message - Smooth infinite loop */}
            <div className="relative overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="smooth-scroll flex whitespace-nowrap py-1.5 text-xs font-bold text-white">
                {/* Duplicate content for seamless loop */}
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={`a-${i}`} className="inline-block px-8">
                    {scrollMessage}
                  </span>
                ))}
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={`b-${i}`} className="inline-block px-8">
                    {scrollMessage}
                  </span>
                ))}
              </div>
            </div>

            {/* King Glazer Card - Compact */}
            <div
              className={cn(
                "bg-zinc-900 border rounded-lg p-2",
                occupantDisplay.isYou
                  ? "border-white shadow-[inset_0_0_16px_rgba(255,255,255,0.2)]"
                  : "border-zinc-800"
              )}
            >
              <div className="flex items-center gap-2">
                {/* Avatar */}
                <div
                  className={cn(
                    "flex-shrink-0",
                    neynarUser?.user?.fid && "cursor-pointer hover:opacity-80 transition-opacity"
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
                      {minerState ? (
                        occupantFallbackInitials
                      ) : (
                        <CircleUserRound className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Profile Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] text-gray-500 uppercase tracking-wider">King Glazer</div>
                  <div className="font-bold text-white text-sm truncate">{occupantDisplay.primary}</div>
                  {minerState && minerState.initPrice > 0n && (
                    <div className="text-[9px] text-gray-500">
                      Paid Ξ{parseFloat(formatEther(minerState.initPrice / 2n)).toFixed(4)}
                    </div>
                  )}
                </div>

                {/* Stats - Compact 2x2 Grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-right flex-shrink-0">
                  <div>
                    <div className="text-[8px] text-gray-500">TIME</div>
                    <div className="text-xs font-bold text-white">{glazeTimeDisplay}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-gray-500">EARNED</div>
                    <div className="text-xs font-bold text-white">🍩{glazedDisplay}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-gray-500">PNL</div>
                    <div className={cn("text-xs font-bold", pnlData.isPositive ? "text-green-400" : "text-red-400")}>
                      {pnlData.eth}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-gray-500">TOTAL</div>
                    <div className={cn("text-xs font-bold", totalPnl.isPositive ? "text-green-400" : "text-red-400")}>
                      {totalPnl.value}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Cards - Compact */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingUp className="w-3 h-3 text-white" />
                  <span className="text-[9px] text-gray-400 uppercase">Glaze Rate</span>
                </div>
                <div className="text-lg font-bold text-white">
                  🍩{glazeRateDisplay}<span className="text-xs text-gray-400">/s</span>
                </div>
                <div className="text-[10px] text-gray-400">${glazeRateUsdValue}/s</div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <Coins className="w-3 h-3 text-white" />
                  <span className="text-[9px] text-gray-400 uppercase">Glaze Price</span>
                </div>
                <div className="text-lg font-bold text-white">Ξ{glazePriceDisplay}</div>
                <div className="text-[10px] text-gray-400">
                  ${minerState ? (Number(formatEther(minerState.price)) * ethUsdPrice).toFixed(2) : "0.00"}
                </div>
              </div>
            </div>

            {/* Dutch Auction Info - Compact */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Timer className="w-4 h-4 text-white" />
                  <span className="text-xs font-semibold text-white">Dutch Auction</span>
                  <button
                    onClick={() => setShowHelpDialog(true)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[10px] text-gray-400">Price drops over time</div>
              </div>
            </div>

            {/* Help Dialog */}
            {showHelpDialog && (
              <div className="fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  onClick={() => setShowHelpDialog(false)}
                />
                <div className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
                  <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-black p-6 shadow-2xl">
                    <button
                      onClick={() => setShowHelpDialog(false)}
                      className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>

                    <div className="mb-4">
                      <h2 className="text-xl font-bold text-white mb-2">How Glazing Works</h2>
                    </div>

                    <div className="space-y-3 text-sm text-gray-300">
                      <div className="flex gap-3">
                        <span className="text-white font-bold flex-shrink-0">1.</span>
                        <p>
                          <span className="text-white font-semibold">Become King Glazer</span> - Pay the current glaze price to take control of the donut mine.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="text-white font-bold flex-shrink-0">2.</span>
                        <p>
                          <span className="text-white font-semibold">Earn $DONUT</span> - While you are King Glazer, you earn $DONUT tokens every second.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="text-white font-bold flex-shrink-0">3.</span>
                        <p>
                          <span className="text-white font-semibold">Dutch Auction</span> - The glaze price starts high and decreases over time until someone glazes.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <span className="text-white font-bold flex-shrink-0">4.</span>
                        <p>
                          <span className="text-white font-semibold">Get Refunded</span> - When someone else glazes, you get 80% of their payment back.
                        </p>
                      </div>

                      <div className="pt-3 border-t border-zinc-800">
                        <p className="text-xs text-gray-400 italic">
                          Compete on the leaderboard by glazing to earn points and win weekly ETH prizes!
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowHelpDialog(false)}
                      className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                    >
                      Got it!
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Message Input - Compact */}
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a GLOBAL message (optional)"
              maxLength={100}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isGlazeDisabled}
            />

            {/* Glaze Button - Pulsing */}
            <button
              className={cn(
                "w-full rounded-xl py-4 text-lg font-bold transition-all duration-300",
                glazeResult === "success"
                  ? "bg-green-500 text-white"
                  : glazeResult === "failure"
                    ? "bg-red-500 text-white"
                    : isGlazeDisabled
                      ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                      : "bg-white text-black hover:bg-gray-200",
                isPulsing && !isGlazeDisabled && !glazeResult && "scale-[1.03] shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              )}
              onClick={handleGlaze}
              disabled={isGlazeDisabled}
            >
              {buttonLabel}
            </button>

            {/* Your Balances - Fixed Layout */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-2">
                Your Balances
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* DONUT Column */}
                <div className="text-center">
                  <div className="text-sm font-bold text-white">🍩 {donutBalanceDisplay}</div>
                  <div className="text-[9px] text-gray-500 mt-1">Mined</div>
                  <div className="text-xs font-semibold text-white">
                    🍩 {address && accountData?.mined
                      ? Number(accountData.mined).toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : "0"}
                  </div>
                </div>

                {/* ETH Column */}
                <div className="text-center">
                  <div className="text-sm font-bold text-white">Ξ {ethBalanceDisplay}</div>
                  <div className="text-[9px] text-gray-500 mt-1">Spent</div>
                  <div className="text-xs font-semibold text-white">
                    Ξ {address && accountData?.spent
                      ? Number(accountData.spent).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : "0"}
                  </div>
                </div>

                {/* WETH Column */}
                <div className="text-center">
                  <div className="text-sm font-bold text-white">
                    wΞ {minerState && minerState.wethBalance !== undefined
                      ? formatEth(minerState.wethBalance, 4)
                      : "—"}
                  </div>
                  <div className="text-[9px] text-gray-500 mt-1">Earned</div>
                  <div className="text-xs font-semibold text-white">
                    wΞ {address && accountData?.earned
                      ? Number(accountData.earned).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : "0"}
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