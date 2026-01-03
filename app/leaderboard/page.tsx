"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
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

const formatAddress = (addr: string) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

// Coin image component for DONUT with zoom
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover scale-[1.7]" />
  </span>
);

// Coin image component for USDC with circular boundary
const UsdcCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-full h-full object-cover" />
  </span>
);

// Coin image component for SPRINKLES
const SprinklesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/media/icon.png" alt="SPRINKLES" className="w-full h-full object-cover" />
  </span>
);

type DistributionConfig = {
  USDC: number;
  DONUT: number;
  SPRINKLES: number;
};

type PrizePercentage = {
  rank: number;
  percent: number;
};

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState("");
  const [donutPrice, setDonutPrice] = useState<number>(0);
  const [sprinklesPrice, setSprinklesPrice] = useState<number>(0);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showPastWinnersDialog, setShowPastWinnersDialog] = useState(false);
  const [showUsdPrize, setShowUsdPrize] = useState(true);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  
  // Distribution config fetched from API
  const [distributionConfig, setDistributionConfig] = useState<DistributionConfig>({
    USDC: 50,
    DONUT: 1000,
    SPRINKLES: 100000,
  });
  const [prizePercentages, setPrizePercentages] = useState<PrizePercentage[]>([
    { rank: 1, percent: 40 },
    { rank: 2, percent: 20 },
    { rank: 3, percent: 15 },
    { rank: 4, percent: 8 },
    { rank: 5, percent: 5 },
    { rank: 6, percent: 4 },
    { rank: 7, percent: 3 },
    { rank: 8, percent: 2 },
    { rank: 9, percent: 2 },
    { rank: 10, percent: 1 },
  ]);

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

  // Fetch prices from our API (cached server-side, refreshes every 10 min)
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/prices');
        if (res.ok) {
          const data = await res.json();
          if (data.donutPrice) setDonutPrice(data.donutPrice);
          if (data.sprinklesPrice) setSprinklesPrice(data.sprinklesPrice);
          setPricesLoaded(true);
        }
      } catch {
        console.error('Failed to fetch prices from API');
        setPricesLoaded(true);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch distribution config from API
  useEffect(() => {
    const fetchDistributionConfig = async () => {
      try {
        const res = await fetch('/api/cron/miners-distribute');
        if (res.ok) {
          const data = await res.json();
          if (data.configuredDistribution) {
            setDistributionConfig(data.configuredDistribution);
          }
          if (data.prizePercentages) {
            setPrizePercentages(data.prizePercentages);
          }
        }
      } catch {
        console.error('Failed to fetch distribution config');
      }
    };

    fetchDistributionConfig();
  }, []);

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

  // Mark animation as complete after items have animated in
  useEffect(() => {
    if (!isLoading && leaderboardData && !hasAnimatedIn) {
      const timeout = setTimeout(() => {
        setHasAnimatedIn(true);
      }, 1000); // 10 items * 40ms delay + 500ms for last prize badge + buffer
      return () => clearTimeout(timeout);
    }
  }, [isLoading, leaderboardData, hasAnimatedIn]);

  // Handle scroll for fade effect only
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

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      // Friday 6pm EST = Friday 11pm UTC (EST is UTC-5)
      const firstDistribution = new Date("2025-12-05T23:00:00Z");
      
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

      if (days >= 1) {
        setTimeUntilDistribution(`${days}d ${hours}h`);
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

  // Calculate total prize value in USD using configured distribution amounts
  const totalPrizeUsd = distributionConfig.USDC + 
    (distributionConfig.DONUT * donutPrice) + 
    (distributionConfig.SPRINKLES * sprinklesPrice);

  // Build prize splits map from fetched percentages
  const prizeSplits: Record<number, number> = {};
  prizePercentages.forEach(p => {
    prizeSplits[p.rank] = p.percent / 100;
  });

  // Calculate prizes for each position based on configured amounts
  const getUsdcPrize = (rank: number) => {
    const percent = prizeSplits[rank] || 0;
    return (distributionConfig.USDC * percent).toFixed(2);
  };
  
  const getDonutPrize = (rank: number) => {
    const percent = prizeSplits[rank] || 0;
    return (distributionConfig.DONUT * percent).toFixed(0);
  };
  
  const getSprinklesPrize = (rank: number) => {
    const percent = prizeSplits[rank] || 0;
    return (distributionConfig.SPRINKLES * percent).toFixed(0);
  };

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
        }
        .leaderboard-scroll::-webkit-scrollbar {
          display: none;
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
        
        @keyframes leaderboardPopIn {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-leaderboardPopIn {
          animation: leaderboardPopIn 0.3s ease-out forwards;
        }
        
        @keyframes prizeBadgePopIn {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-prizeBadge {
          opacity: 0;
          animation: prizeBadgePopIn 0.25s ease-out forwards;
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
            <Header title="LEADERBOARD" user={context?.user} />

            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* Week Tile */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
                <div className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-white/90" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Week</span>
                </div>
                <div className="text-2xl font-bold text-white fade-in-up stagger-1 opacity-0">#{weekNumber}</div>
              </div>

              {/* Ends In Tile */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-white" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Ends In</span>
                </div>
                <div className="text-xl font-bold text-white fade-in-up stagger-2 opacity-0 whitespace-nowrap">{timeUntilDistribution}</div>
              </div>

              {/* Prize Tile */}
              <button
                onClick={() => setShowUsdPrize(!showUsdPrize)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all h-[80px] relative overflow-hidden"
              >
                {showUsdPrize ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-white" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Prizes</span>
                    </div>
                    <div className="text-2xl font-bold text-white fade-in-up stagger-3 opacity-0">
                      ${Math.floor(totalPrizeUsd).toLocaleString()}
                    </div>
                    <span className="absolute bottom-1 text-[7px] text-gray-600 animate-pulse">tap for tokens</span>
                  </>
                ) : (
                  <div className="flex flex-col w-full h-full justify-center gap-0.5">
                    <div className="flex items-center justify-between w-full px-1">
                      <UsdcCoin className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold text-green-400">${distributionConfig.USDC}</span>
                    </div>
                    <div className="flex items-center justify-between w-full px-1">
                      <DonutCoin className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold text-pink-400">{distributionConfig.DONUT.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between w-full px-1">
                      <SprinklesCoin className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                        {distributionConfig.SPRINKLES >= 1000 ? `${(distributionConfig.SPRINKLES/1000).toFixed(0)}k` : distributionConfig.SPRINKLES}
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
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  <span className="text-xs font-semibold text-white">How to Win</span>
                  <HelpCircle className="w-3 h-3 text-gray-400" />
                </div>
              </button>

              <button
                onClick={() => setShowPastWinnersDialog(true)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <History className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
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
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                      <div>
                        <div className="font-semibold text-green-400 text-xs">Mine DONUT = 3 Points</div>
                        <div className="text-[11px] text-gray-400">Glaze the factory and earn 3 leaderboard points per mine.</div>
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
                        <div className="text-[11px] text-gray-400">Compete weekly. Leaderboard resets every Friday at 6pm EST.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                      <div>
                        <div className="font-semibold text-green-400 text-xs mb-1">Win Prizes</div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-green-500/20 px-1.5 py-0.5 rounded">
                            <UsdcCoin className="w-3 h-3" />
                            <span className="text-green-400 text-[10px] font-bold">USDC</span>
                          </div>
                          <div className="flex items-center gap-1 bg-pink-500/20 px-1.5 py-0.5 rounded">
                            <DonutCoin className="w-3 h-3" />
                            <span className="text-pink-400 text-[10px] font-bold">DONUT</span>
                          </div>
                          <div className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded">
                            <SprinklesCoin className="w-3 h-3" />
                            <span className="text-white text-[10px] font-bold">SPRNKL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <div className="text-[9px] text-gray-500 uppercase mb-1.5 text-center">Prize Distribution</div>
                    <div className="grid grid-cols-5 gap-1 text-center mb-1">
                      {prizePercentages.slice(0, 5).map((p) => (
                        <div key={p.rank}>
                          <div className={`text-sm font-bold ${p.rank <= 3 ? 'text-white' : 'text-gray-400'} ${p.rank === 1 ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]' : p.rank === 2 ? 'drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]' : p.rank === 3 ? 'drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]' : ''}`}>
                            {p.rank === 1 ? '1st' : p.rank === 2 ? '2nd' : p.rank === 3 ? '3rd' : `${p.rank}th`}
                          </div>
                          <div className={`font-bold text-[10px] ${p.rank <= 3 ? 'text-green-400' : 'text-gray-400'}`}>{p.percent}%</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {prizePercentages.slice(5, 10).map((p) => (
                        <div key={p.rank}>
                          <div className="text-sm font-bold text-gray-500">{p.rank}th</div>
                          <div className="text-gray-500 font-bold text-[10px]">{p.percent}%</div>
                        </div>
                      ))}
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
                                    +${parseFloat(week.first_amount).toFixed(2)}
                                  </span>
                                  {parseFloat(week.first_donut_amount || '0') > 0 && (
                                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5">
                                      +<DonutCoin className="w-2.5 h-2.5" />{parseFloat(week.first_donut_amount).toFixed(0)}
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
                                      +${parseFloat(week.second_amount).toFixed(2)}
                                    </span>
                                    {parseFloat(week.second_donut_amount || '0') > 0 && (
                                      <span className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5">
                                        +<DonutCoin className="w-2.5 h-2.5" />{parseFloat(week.second_donut_amount).toFixed(0)}
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
                                      +${parseFloat(week.third_amount).toFixed(2)}
                                    </span>
                                    {parseFloat(week.third_donut_amount || '0') > 0 && (
                                      <span className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5">
                                        +<DonutCoin className="w-2.5 h-2.5" />{parseFloat(week.third_donut_amount).toFixed(0)}
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
            <div className="space-y-3 pb-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-400">Loading leaderboard...</div>
                </div>
              ) : (
                Array.from({ length: 10 }).map((_, index) => {
                  const rank = index + 1;
                  const entry = leaderboard[index];
                  const isWinner = rank <= 3;
                  const hasPrize = rank <= 10;
                  
                  // Get prizes for this rank using the helper functions
                  const prizeUsdc = hasPrize ? getUsdcPrize(rank) : 0;
                  const prizeDonut = hasPrize ? getDonutPrize(rank) : '0';
                  const prizeSprinkles = hasPrize ? getSprinklesPrize(rank) : '0';
                  
                  const spinClass = `spin-avatar-${(rank % 5) + 1}`;

                  // Tile styling based on rank
                  const tileStyle = isWinner
                    ? {
                        minHeight: '90px',
                        background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)',
                      }
                    : {
                        minHeight: '90px',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                      };

                  const tileBorderClass = isWinner
                    ? "border-2 border-green-500/50 hover:border-green-500/80"
                    : "border-2 border-white/20 hover:border-white/40";

                  // Format sprinkles display
                  const sprinklesNum = parseFloat(prizeSprinkles || '0');
                  const sprinklesDisplay = sprinklesNum >= 1000 
                    ? `${(sprinklesNum / 1000).toFixed(sprinklesNum % 1000 === 0 ? 0 : 1)}K`
                    : sprinklesNum.toFixed(0);

                  if (!entry) {
                    return (
                      <div
                        key={`empty-${rank}`}
                        className={`relative flex items-center justify-between rounded-2xl p-4 overflow-hidden transition-all duration-300 ${tileBorderClass} ${!hasAnimatedIn ? 'animate-leaderboardPopIn' : ''}`}
                        style={{ 
                          ...tileStyle,
                          ...(!hasAnimatedIn ? {
                            opacity: 0,
                            animationDelay: `${index * 40}ms`,
                            animationFillMode: 'forwards',
                          } : {})
                        }}
                      >
                        {/* Large background rank number */}
                        <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <span className={`text-8xl font-black ${isWinner ? 'text-green-900/30' : 'text-zinc-800/50'}`}>
                            {rank}
                          </span>
                        </div>

                        <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                          <div className={spinClass}>
                            <Avatar className="h-11 w-11 border-2 border-zinc-700 flex-shrink-0">
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
                            <span className="font-bold truncate text-white block">No one yet</span>
                            <div className="text-[11px] text-gray-400">
                              {hasPrize ? "Claim this spot!" : "Keep grinding"}
                            </div>
                            {hasPrize && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span 
                                  className={`text-green-400 text-[10px] font-bold bg-green-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                  style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 300}ms` } : undefined}
                                >
                                  <UsdcCoin className="w-3 h-3" />
                                  +${prizeUsdc}
                                </span>
                                {parseFloat(prizeDonut || '0') > 0 && (
                                  <span 
                                    className={`text-pink-400 text-[10px] font-bold bg-pink-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                    style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 400}ms` } : undefined}
                                  >
                                    <DonutCoin className="w-3 h-3" />
                                    +{Math.floor(parseFloat(prizeDonut || '0'))}
                                  </span>
                                )}
                                {sprinklesNum > 0 && (
                                  <span 
                                    className={`text-white text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                    style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 500}ms` } : undefined}
                                  >
                                    <SprinklesCoin className="w-3 h-3" />
                                    +{sprinklesDisplay}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="relative z-10 flex flex-col items-end gap-0.5 flex-shrink-0">
                          <div className="text-sm font-bold text-white">
                            0 <span className="text-[10px] font-normal text-gray-400">pts</span>
                          </div>
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
                      className={`relative flex items-center justify-between rounded-2xl p-4 overflow-hidden transition-all duration-300 ${tileBorderClass} ${!hasAnimatedIn ? 'animate-leaderboardPopIn' : ''}`}
                      style={{ 
                        ...tileStyle,
                        ...(!hasAnimatedIn ? {
                          opacity: 0,
                          animationDelay: `${index * 40}ms`,
                          animationFillMode: 'forwards',
                        } : {})
                      }}
                    >
                      {/* Large background rank number */}
                      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className={`text-8xl font-black ${isWinner ? 'text-green-900/30' : 'text-zinc-800/50'}`}>
                          {rank}
                        </span>
                      </div>

                      <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                        <div 
                          className={`${spinClass} ${profile?.fid ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                          onClick={() => handleViewProfile(profile)}
                        >
                          <Avatar className="h-11 w-11 border-2 border-zinc-700 flex-shrink-0">
                            <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                            <AvatarFallback className="bg-zinc-800 text-white text-xs">
                              {displayName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="font-bold truncate text-white block">{displayName}</span>
                          {username && (
                            <div className="text-[11px] text-gray-400">{username}</div>
                          )}
                          {hasPrize && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span 
                                className={`text-green-400 text-[10px] font-bold bg-green-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 300}ms` } : undefined}
                              >
                                <UsdcCoin className="w-3 h-3" />
                                +${prizeUsdc}
                              </span>
                              {parseFloat(prizeDonut || '0') > 0 && (
                                <span 
                                  className={`text-pink-400 text-[10px] font-bold bg-pink-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                  style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 400}ms` } : undefined}
                                >
                                  <DonutCoin className="w-3 h-3" />
                                  +{Math.floor(parseFloat(prizeDonut || '0'))}
                                </span>
                              )}
                              {sprinklesNum > 0 && (
                                <span 
                                  className={`text-white text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded flex items-center gap-1 ${!hasAnimatedIn ? 'animate-prizeBadge' : ''}`}
                                  style={!hasAnimatedIn ? { animationDelay: `${index * 40 + 500}ms` } : undefined}
                                >
                                  <SprinklesCoin className="w-3 h-3" />
                                  +{sprinklesDisplay}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="relative z-10 flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="text-sm font-bold text-white">
                          {entry.total_points} <span className="text-[10px] font-normal text-gray-400">pts</span>
                        </div>
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