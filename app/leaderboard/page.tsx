"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Clock, Coins, HelpCircle, X, Sparkles, History, ExternalLink } from "lucide-react";
import { formatEther } from "viem";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type LeaderboardEntry = {
  address: string;
  total_points: number;
  total_mines: number;
  last_mine_timestamp?: string;
};

type FarcasterProfile = {
  fid: number | null;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
};

type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  weekNumber: number;
};

type PastWinner = {
  week_number: number;
  first_place: string;
  second_place: string | null;
  third_place: string | null;
  first_amount: string;
  second_amount: string;
  third_amount: string;
  first_donut_amount: string;
  second_donut_amount: string;
  third_donut_amount: string;
  first_sprinkles_amount: string;
  second_sprinkles_amount: string;
  third_sprinkles_amount: string;
  tx_hash: string;
  created_at?: string;
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

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatAddress = (addr: string) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutPrice, setDonutPrice] = useState<number>(0);
  const [sprinklesPrice, setSprinklesPrice] = useState<number>(0);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showPastWinnersDialog, setShowPastWinnersDialog] = useState(false);
  const [showUsdPrize, setShowUsdPrize] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const lastFocusedRef = useRef(0);

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
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch prices from our API (includes SPRINKLES price based on DONUT)
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch from our prices API which calculates SPRINKLES price
        const res = await fetch('/api/prices');
        if (res.ok) {
          const data = await res.json();
          if (data.ethPrice) setEthUsdPrice(data.ethPrice);
          if (data.donutPrice) setDonutPrice(data.donutPrice);
          if (data.sprinklesPrice) setSprinklesPrice(data.sprinklesPrice);
        }
      } catch {
        console.error('Failed to fetch prices from API');
      }

      // Fallback: fetch ETH price from CoinGecko if API fails
      if (ethUsdPrice === 3500) {
        try {
          const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
          const data = await res.json();
          setEthUsdPrice(data.ethereum.usd);
        } catch {
          console.error('Failed to fetch ETH price');
        }
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, [ethUsdPrice]);

  const { data: leaderboardData, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?limit=10");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: prizePoolData } = useQuery<{
    ethBalance: string;
    donutBalance: string;
    sprinklesBalance: string;
  }>({
    queryKey: ["prize-pool"],
    queryFn: async () => {
      const res = await fetch("/api/prize-pool");
      if (!res.ok) throw new Error("Failed to fetch prize pool");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: pastWinnersData } = useQuery<{ 
    winners: PastWinner[]; 
    profiles: Record<string, FarcasterProfile | null>;
  }>({
    queryKey: ["past-winners"],
    queryFn: async () => {
      const res = await fetch("/api/past-winners?limit=10");
      if (!res.ok) throw new Error("Failed to fetch past winners");
      return res.json();
    },
    enabled: showPastWinnersDialog,
    staleTime: 5 * 60 * 1000,
  });

  const addresses: string[] = leaderboardData?.leaderboard?.map((entry) => entry.address) || [];
  
  const { data: profilesData } = useQuery<{ profiles: Record<string, FarcasterProfile | null> }>({
    queryKey: ["farcaster-profiles-batch", addresses.join(",")],
    queryFn: async () => {
      if (addresses.length === 0) return { profiles: {} };
      
      const res = await fetch(
        `/api/profiles?addresses=${encodeURIComponent(addresses.join(","))}`
      );
      if (!res.ok) return { profiles: {} };
      return res.json();
    },
    enabled: addresses.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const profiles = profilesData?.profiles || {};
  const pastWinnerProfiles = pastWinnersData?.profiles || {};

  const handleViewProfile = useCallback(async (profile: FarcasterProfile | null) => {
    if (!profile) return;
    
    const url = profile.username 
      ? `https://warpcast.com/${profile.username}`
      : profile.fid 
        ? `https://warpcast.com/~/profiles/${profile.fid}`
        : null;

    if (!url) return;

    try {
      await sdk.actions.openUrl(url);
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleOpenBasescan = useCallback(async (txHash: string) => {
    const url = `https://basescan.org/tx/${txHash}`;
    try {
      await sdk.actions.openUrl(url);
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });

  // Haptic feedback helper
  const triggerHaptic = useCallback(async () => {
    try {
      await sdk.haptics.impactOccurred("light");
    } catch {
      // Silent fail if haptics not supported
    }
  }, []);

  // Handle scroll to detect focused item based on scroll percentage
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      
      // Calculate fade amounts based on scroll position (smoother with larger threshold)
      if (scrollHeight > 0) {
        const scrollPercentage = scrollTop / scrollHeight;
        // Top fade: 0 at top, 1 when scrolled down (smooth over 100px)
        const topFade = Math.min(1, scrollTop / 100);
        // Bottom fade: 1 at top, 0 at bottom (smooth over 100px)
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 100);
        setScrollFade({ top: topFade, bottom: bottomFade });
        
        // Calculate which item should be focused
        const newIndex = Math.round(scrollPercentage * 9);
        const clampedIndex = Math.max(0, Math.min(9, newIndex));
        
        if (clampedIndex !== lastFocusedRef.current) {
          lastFocusedRef.current = clampedIndex;
          setFocusedIndex(clampedIndex);
          triggerHaptic();
        }
      }
    };

    // Initial call to set fade state
    handleScroll();

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [triggerHaptic]);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const firstDistribution = new Date("2025-12-05T12:00:00Z");
      
      const weeksSinceFirst = Math.floor(
        (now.getTime() - firstDistribution.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      const nextDistribution = new Date(
        firstDistribution.getTime() + (weeksSinceFirst + 1) * 7 * 24 * 60 * 60 * 1000
      );

      const diff = nextDistribution.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeUntilDistribution("Soon...");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      // Show only days if more than 24 hours, otherwise show hours and minutes
      if (days > 0) {
        setTimeUntilDistribution(`${days}d`);
      } else {
        setTimeUntilDistribution(`${hours}h ${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const leaderboard: LeaderboardEntry[] = leaderboardData?.leaderboard || [];
  const weekNumber = leaderboardData?.weekNumber || 0;
  
  const ethBalance = prizePoolData?.ethBalance
    ? parseFloat(formatEther(BigInt(prizePoolData.ethBalance)))
    : 0;

  const donutBalance = prizePoolData?.donutBalance
    ? parseFloat(formatEther(BigInt(prizePoolData.donutBalance)))
    : 0;

  const sprinklesBalance = prizePoolData?.sprinklesBalance
    ? parseFloat(formatEther(BigInt(prizePoolData.sprinklesBalance)))
    : 0;

  // Total prize USD now includes SPRINKLES value
  const totalPrizeUsd = (ethBalance * ethUsdPrice) + (donutBalance * donutPrice) + (sprinklesBalance * sprinklesPrice);

  const firstPlaceEth = (ethBalance * 0.5).toFixed(4);
  const secondPlaceEth = (ethBalance * 0.3).toFixed(4);
  const thirdPlaceEth = (ethBalance * 0.2).toFixed(4);

  const firstPlaceDonut = (donutBalance * 0.5).toFixed(2);
  const secondPlaceDonut = (donutBalance * 0.3).toFixed(2);
  const thirdPlaceDonut = (donutBalance * 0.2).toFixed(2);

  const firstPlaceSprinkles = (sprinklesBalance * 0.5).toFixed(0);
  const secondPlaceSprinkles = (sprinklesBalance * 0.3).toFixed(0);
  const thirdPlaceSprinkles = (sprinklesBalance * 0.2).toFixed(0);

  // USD values now include SPRINKLES
  const firstPlaceUsd = Math.floor(totalPrizeUsd * 0.5);
  const secondPlaceUsd = Math.floor(totalPrizeUsd * 0.3);
  const thirdPlaceUsd = Math.floor(totalPrizeUsd * 0.2);

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes spin-slow-cw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-slow-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .spin-avatar-1 { animation: spin-slow-cw 12s linear infinite; }
        .spin-avatar-2 { animation: spin-slow-ccw 10s linear infinite; }
        .spin-avatar-3 { animation: spin-slow-cw 14s linear infinite; }
        .spin-avatar-4 { animation: spin-slow-ccw 11s linear infinite; }
        .spin-avatar-5 { animation: spin-slow-cw 9s linear infinite; }
        
        .leaderboard-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
          scroll-snap-stop: always;
        }
        .leaderboard-scroll::-webkit-scrollbar {
          display: none;
        }
        .leaderboard-item {
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes pulseGlow {
          0%, 100% {
            text-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
          }
          50% {
            text-shadow: 0 0 16px rgba(251, 191, 36, 0.9), 0 0 24px rgba(251, 191, 36, 0.4);
          }
        }
        
        .fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
        
        .prize-pulse {
          animation: pulseGlow 2s ease-in-out infinite;
        }
        
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
        .stagger-3 { animation-delay: 0.3s; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header Section */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold tracking-wide">LEADERBOARD</h1>
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

            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* Week Tile */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col items-center justify-center text-center h-[80px]">
                <div className="flex items-center gap-1 mb-1">
                  <Trophy className="w-3.5 h-3.5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Week</span>
                </div>
                <div className="text-2xl font-bold text-white fade-in-up stagger-1 opacity-0">#{weekNumber}</div>
              </div>

              {/* Ends In Tile */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col items-center justify-center text-center h-[80px]">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Ends In</span>
                </div>
                <div className="text-2xl font-bold text-amber-400 fade-in-up stagger-2 opacity-0">{timeUntilDistribution}</div>
              </div>

              {/* Prize Tile */}
              <button
                onClick={() => setShowUsdPrize(!showUsdPrize)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col items-center justify-center text-center transition-all h-[80px] relative overflow-hidden"
              >
                {showUsdPrize ? (
                  <>
                    <div className="flex items-center gap-1 mb-1">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Prizes</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-400 prize-pulse fade-in-up stagger-3 opacity-0">
                      ${Math.floor(totalPrizeUsd).toLocaleString()}
                    </div>
                    <span className="text-[8px] text-gray-500 mt-0.5">tap for tokens</span>
                  </>
                ) : (
                  <div className="flex flex-col w-full h-full justify-center">
                    <div className="flex items-center justify-between w-full px-1">
                      <span className="text-green-400 text-sm">Ξ</span>
                      <span className="text-sm font-bold text-green-400">{ethBalance.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full px-1">
                      <span className="text-amber-400 text-sm">🍩</span>
                      <span className="text-sm font-bold text-amber-400">{Math.floor(donutBalance)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full px-1">
                      <Sparkles className="w-3.5 h-3.5 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                      <span className="text-sm font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                        {sprinklesBalance >= 1000 ? `${(sprinklesBalance/1000).toFixed(0)}k` : Math.floor(sprinklesBalance)}
                      </span>
                    </div>
                  </div>
                )}
              </button>
            </div>

            {/* Split Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setShowHelpDialog(true)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  <span className="text-xs font-semibold text-white">How to Win</span>
                  <HelpCircle className="w-3 h-3 text-gray-400" />
                </div>
              </button>

              <button
                onClick={() => setShowPastWinnersDialog(true)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-white">Past Winners</span>
                </div>
              </button>
            </div>
          </div>

          {/* Help Dialog */}
          {showHelpDialog && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={() => setShowHelpDialog(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    How to Win Prizes
                  </h2>

                  <div className="space-y-2.5">
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Mine DONUT = 2 Points</div>
                        <div className="text-[11px] text-gray-400">Pay ETH to glaze the factory and earn 2 leaderboard points per mine.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                      <div>
                        <div className="font-semibold text-white text-xs flex items-center gap-1">Mine <Sparkles className="w-3 h-3 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />SPRINKLES = 1 Point</div>
                        <div className="text-[11px] text-gray-400">Pay DONUT to mine SPRINKLES and earn 1 leaderboard point per mine.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">3</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Climb the Ranks</div>
                        <div className="text-[11px] text-gray-400">Compete weekly. Leaderboard resets every Friday at 12pm UTC.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Win Prizes</div>
                        <div className="text-[11px] text-gray-400">Top 3 glazers split the prize pool: ETH, DONUT, and SPRINKLES!</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">5</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Where Rewards Come From</div>
                        <div className="text-[11px] text-gray-400">ETH & DONUT from glazing fees. SPRINKLES from weekly Treasury Buybacks.</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <div className="text-[9px] text-gray-500 uppercase mb-1.5 text-center">Prize Distribution</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-base font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">1st</div>
                        <div className="text-amber-400 font-bold text-xs">50%</div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]">2nd</div>
                        <div className="text-amber-400 font-bold text-xs">30%</div>
                      </div>
                      <div>
                        <div className="text-base font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]">3rd</div>
                        <div className="text-amber-400 font-bold text-xs">20%</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Past Winners Dialog */}
          {showPastWinnersDialog && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={() => setShowPastWinnersDialog(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[80vh]">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <button
                    onClick={() => setShowPastWinnersDialog(false)}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2 flex-shrink-0">
                    <History className="w-4 h-4 text-amber-400" />
                    Past Winners
                  </h2>

                  <div className="overflow-y-auto flex-1 -mx-4 px-4">
                    {!pastWinnersData?.winners || pastWinnersData.winners.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No winners yet</p>
                        <p className="text-xs mt-1">Be the first to claim victory!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pastWinnersData.winners.map((week) => (
                          <div
                            key={week.week_number}
                            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-white">Week #{week.week_number}</span>
                              <button
                                onClick={() => handleOpenBasescan(week.tx_hash)}
                                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                              >
                                <span>View TX</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              {/* First Place */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] w-5">1st</span>
                                  <Avatar className="h-6 w-6 border border-zinc-700">
                                    <AvatarImage
                                      src={pastWinnerProfiles[week.first_place.toLowerCase()]?.pfpUrl || getAnonPfp(week.first_place)}
                                      alt="1st"
                                      className="object-cover"
                                    />
                                    <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                                      {formatAddress(week.first_place).slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs text-white truncate max-w-[80px]">
                                    {pastWinnerProfiles[week.first_place.toLowerCase()]?.displayName || formatAddress(week.first_place)}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] text-green-400 font-medium">
                                    +Ξ{parseFloat(week.first_amount).toFixed(4)}
                                  </span>
                                  {parseFloat(week.first_donut_amount || '0') > 0 && (
                                    <span className="text-[10px] text-amber-400 font-medium">
                                      +🍩{parseFloat(week.first_donut_amount).toFixed(0)}
                                    </span>
                                  )}
                                  {parseFloat(week.first_sprinkles_amount || '0') > 0 && (
                                    <span className="text-[10px] text-white font-medium flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                                      +<Sparkles className="w-2 h-2" />{parseFloat(week.first_sprinkles_amount).toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Second Place */}
                              {week.second_place && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)] w-5">2nd</span>
                                    <Avatar className="h-6 w-6 border border-zinc-700">
                                      <AvatarImage
                                        src={pastWinnerProfiles[week.second_place.toLowerCase()]?.pfpUrl || getAnonPfp(week.second_place)}
                                        alt="2nd"
                                        className="object-cover"
                                      />
                                      <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                                        {formatAddress(week.second_place).slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-white truncate max-w-[80px]">
                                      {pastWinnerProfiles[week.second_place.toLowerCase()]?.displayName || formatAddress(week.second_place)}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-green-400 font-medium">
                                      +Ξ{parseFloat(week.second_amount).toFixed(4)}
                                    </span>
                                    {parseFloat(week.second_donut_amount || '0') > 0 && (
                                      <span className="text-[10px] text-amber-400 font-medium">
                                        +🍩{parseFloat(week.second_donut_amount).toFixed(0)}
                                      </span>
                                    )}
                                    {parseFloat(week.second_sprinkles_amount || '0') > 0 && (
                                      <span className="text-[10px] text-white font-medium flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                                        +<Sparkles className="w-2 h-2" />{parseFloat(week.second_sprinkles_amount).toFixed(0)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Third Place */}
                              {week.third_place && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)] w-5">3rd</span>
                                    <Avatar className="h-6 w-6 border border-zinc-700">
                                      <AvatarImage
                                        src={pastWinnerProfiles[week.third_place.toLowerCase()]?.pfpUrl || getAnonPfp(week.third_place)}
                                        alt="3rd"
                                        className="object-cover"
                                      />
                                      <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                                        {formatAddress(week.third_place).slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-white truncate max-w-[80px]">
                                      {pastWinnerProfiles[week.third_place.toLowerCase()]?.displayName || formatAddress(week.third_place)}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-green-400 font-medium">
                                      +Ξ{parseFloat(week.third_amount).toFixed(4)}
                                    </span>
                                    {parseFloat(week.third_donut_amount || '0') > 0 && (
                                      <span className="text-[10px] text-amber-400 font-medium">
                                        +🍩{parseFloat(week.third_donut_amount).toFixed(0)}
                                      </span>
                                    )}
                                    {parseFloat(week.third_sprinkles_amount || '0') > 0 && (
                                      <span className="text-[10px] text-white font-medium flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                                        +<Sparkles className="w-2 h-2" />{parseFloat(week.third_sprinkles_amount).toFixed(0)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowPastWinnersDialog(false)}
                    className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors flex-shrink-0"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable Leaderboard */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden leaderboard-scroll"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            <div className="space-y-2 pb-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-400">Loading leaderboard...</div>
                </div>
              ) : (
                Array.from({ length: 10 }).map((_, index) => {
                  const rank = index + 1;
                  const entry = leaderboard[index];
                  const isWinner = rank <= 3;
                  const isFocused = focusedIndex === index;
                  
                  let prizeEth: string | null = null;
                  let prizeDonut: string | null = null;
                  let prizeSprinkles: string | null = null;
                  let prizeUsd: number = 0;
                  
                  if (rank === 1) { 
                    prizeEth = firstPlaceEth; 
                    prizeDonut = firstPlaceDonut; 
                    prizeSprinkles = firstPlaceSprinkles; 
                    prizeUsd = firstPlaceUsd; 
                  }
                  if (rank === 2) { 
                    prizeEth = secondPlaceEth; 
                    prizeDonut = secondPlaceDonut; 
                    prizeSprinkles = secondPlaceSprinkles; 
                    prizeUsd = secondPlaceUsd; 
                  }
                  if (rank === 3) { 
                    prizeEth = thirdPlaceEth; 
                    prizeDonut = thirdPlaceDonut; 
                    prizeSprinkles = thirdPlaceSprinkles; 
                    prizeUsd = thirdPlaceUsd; 
                  }
                  
                  const spinClass = `spin-avatar-${(rank % 5) + 1}`;

                  if (!entry) {
                    return (
                      <div
                        key={`empty-${rank}`}
                        className={`leaderboard-item flex items-center justify-between rounded-xl p-3 border transition-all duration-200 ${
                          isFocused 
                            ? "border-amber-400" 
                            : "bg-zinc-900 border-zinc-800"
                        }`}
                        style={{ 
                          minHeight: '80px',
                          backgroundColor: isFocused ? 'rgba(245, 158, 11, 0.1)' : undefined
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`text-xl font-bold w-7 flex-shrink-0 text-center ${
                              rank === 1
                                ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                                : rank === 2
                                  ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]"
                                  : rank === 3
                                    ? "text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]"
                                    : "text-gray-500"
                            }`}
                          >
                            {rank}
                          </span>

                          <div className={spinClass}>
                            <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
                              <AvatarImage
                                src={ANON_PFPS[rank % ANON_PFPS.length]}
                                alt="Empty spot"
                                className="object-cover"
                              />
                              <AvatarFallback className="bg-zinc-800 text-white text-xs">
                                --
                              </AvatarFallback>
                            </Avatar>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white truncate text-sm">No one yet</span>
                              {isWinner && prizeUsd > 0 && (
                                <span className="text-amber-400 text-xs font-bold">+${prizeUsd}</span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {isWinner ? "Claim this spot!" : "Keep grinding"}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <div className="text-xs font-bold text-white">
                            0 <span className="text-[10px] font-normal text-gray-400">pts</span>
                          </div>
                          {isWinner && (
                            <div className="flex flex-col items-end">
                              <div className="text-[10px] text-green-400 font-medium">+Ξ{prizeEth}</div>
                              <div className="text-[10px] text-amber-400 font-medium">+🍩{prizeDonut}</div>
                              <div className="text-[10px] text-white font-medium flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                                +<Sparkles className="w-2.5 h-2.5" />{prizeSprinkles}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const profile = profiles?.[entry.address];
                  const displayName = profile?.displayName || formatAddress(entry.address);
                  const username = profile?.username ? `@${profile.username}` : "";
                  const avatarUrl = profile?.pfpUrl || getAnonPfp(entry.address);

                  return (
                    <div
                      key={entry.address}
                      className={`leaderboard-item flex items-center justify-between rounded-xl p-3 border transition-all duration-200 ${
                        isFocused 
                          ? "border-amber-400" 
                          : "bg-zinc-900 border-zinc-800"
                      }`}
                      style={{ 
                        minHeight: '80px',
                        backgroundColor: isFocused ? 'rgba(245, 158, 11, 0.1)' : undefined
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`text-xl font-bold w-7 flex-shrink-0 text-center ${
                            rank === 1
                              ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                              : rank === 2
                                ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]"
                                : rank === 3
                                  ? "text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]"
                                  : "text-gray-500"
                          }`}
                        >
                          {rank}
                        </span>

                        <div 
                          className={`${spinClass} ${profile?.fid ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                          onClick={() => handleViewProfile(profile)}
                        >
                          <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
                            <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                            <AvatarFallback className="bg-zinc-800 text-white text-xs">
                              {displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white truncate text-sm">{displayName}</span>
                            {isWinner && prizeUsd > 0 && (
                              <span className="text-amber-400 text-xs font-bold">+${prizeUsd}</span>
                            )}
                          </div>
                          {username && (
                            <div className="text-[10px] text-gray-400 truncate">{username}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="text-xs font-bold text-white">
                          {entry.total_points} <span className="text-[10px] font-normal text-gray-400">pts</span>
                        </div>
                        {isWinner && (
                          <div className="flex flex-col items-end">
                            <div className="text-[10px] text-green-400 font-medium">+Ξ{prizeEth}</div>
                            <div className="text-[10px] text-amber-400 font-medium">+🍩{prizeDonut}</div>
                            <div className="text-[10px] text-white font-medium flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                              +<Sparkles className="w-2.5 h-2.5" />{prizeSprinkles}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}