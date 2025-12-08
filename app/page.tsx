"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, zeroAddress } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";
import DonutMiner from "@/components/donut-miner";
import SprinklesMiner from "@/components/sprinkles-miner";
import { ShareRewardButton } from "@/components/share-reward-button";
import { ArrowLeft } from "lucide-react";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { SPRINKLES_MINER_ADDRESS, SPRINKLES_MINER_ABI } from "@/lib/contracts/sprinkles";
import { useAccount } from "wagmi";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

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

export default function HomePage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<"donut" | "sprinkles" | null>(null);
  const donutVideoRef = useRef<HTMLVideoElement>(null);
  const sprinklesVideoRef = useRef<HTMLVideoElement>(null);

  const { address } = useAccount();

  // Fetch DONUT miner price
  const { data: rawMinerState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getMiner",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  // Fetch SPRINKLES miner price
  const { data: sprinklesPrice } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getPrice",
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  const donutPrice = rawMinerState ? (rawMinerState as any).price as bigint : undefined;
  const sprinklesPriceValue = sprinklesPrice as bigint | undefined;

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

  // If a miner is selected, show that miner's UI
  if (selectedMiner === "donut") {
    return (
      <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header with back button */}
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
      <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header with back button */}
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
            </div>
            <SprinklesMiner context={context} />
          </div>
        </div>
        <NavBar onMineClick={resetMiner} />
      </main>
    );
  }

  // Mining selection screen
  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <AddToFarcasterDialog showOnFirstVisit={true} />
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col">
          {/* Header */}
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
          </div>

          {/* Top Row - Wheel & Claim Rewards (equal size) */}
          <div className="grid grid-cols-2 gap-2 px-2 mb-3">
            {/* Daily Wheel - Coming Soon */}
            <div className="h-24 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col items-center justify-center cursor-not-allowed opacity-60">
              <div className="text-2xl mb-1">🎡</div>
              <div className="text-xs font-bold text-gray-500">Daily Wheel</div>
              <div className="text-[10px] text-gray-600">???</div>
            </div>

            {/* Share Rewards - Wrapper to match height */}
            <div className="h-24 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center">
              <ShareRewardButton userFid={context?.user?.fid} compact />
            </div>
          </div>

          {/* Miner Tiles - Stacked Vertically */}
          <div className="flex-1 flex flex-col gap-3 px-2">
            {/* Donut Tile */}
            <button
              onClick={() => setSelectedMiner("donut")}
              className="relative flex-1 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all active:scale-[0.98]"
            >
              {/* Video Background */}
              <video
                ref={donutVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                playsInline
                loop
                preload="auto"
                src="/media/donut-loop.mp4"
              />
              {/* Dark Overlay */}
              <div className="absolute inset-0 bg-black/60" />
              
              {/* Content */}
              <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
                <div className="text-base font-bold text-white mb-1 text-center" style={{ textShadow: '0 0 10px rgba(255,255,255,0.8)' }}>
                  Pay ETH
                </div>
                <div className="text-xl font-bold text-amber-400 mb-2 text-center" style={{ textShadow: '0 0 10px rgba(251,191,36,0.8)' }}>
                  Mine DONUT
                </div>
                <div className="text-sm text-white/80">
                  Price: <span className="font-bold text-white" style={{ textShadow: '0 0 8px rgba(255,255,255,0.6)' }}>
                    Ξ{donutPrice ? formatEth(donutPrice, 2) : "—"}
                  </span>
                </div>
              </div>
            </button>

            {/* Sprinkles Tile */}
            <button
              onClick={() => setSelectedMiner("sprinkles")}
              className="relative flex-1 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all active:scale-[0.98]"
            >
              <video
                ref={sprinklesVideoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                playsInline
                loop
                preload="auto"
                src="/media/sprinkles-loop.mp4"
              />
              <div className="absolute inset-0 bg-black/60" />
              
              <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
                <div className="text-base font-bold text-white mb-1 text-center" style={{ textShadow: '0 0 10px rgba(255,255,255,0.8)' }}>
                  Pay DONUT
                </div>
                <div className="text-xl font-bold text-amber-400 mb-2 text-center" style={{ textShadow: '0 0 10px rgba(251,191,36,0.8)' }}>
                  Mine SPRINKLES
                </div>
                <div className="text-sm text-white/80">
                  Price: <span className="font-bold text-white" style={{ textShadow: '0 0 8px rgba(255,255,255,0.6)' }}>
                    🍩{sprinklesPriceValue ? formatTokenAmount(sprinklesPriceValue, 18, 2) : "—"}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}