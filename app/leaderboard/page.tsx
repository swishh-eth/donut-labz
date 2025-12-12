"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Clock, Coins, HelpCircle, X, Sparkles } from "lucide-react";
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
  total_glazes?: number;
  week_number?: number;
  last_glaze_timestamp?: string;
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

const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586";
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

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

const getRandomRotation = (seed: string) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const duration = 8 + (hash % 7);
  const direction = hash % 2 === 0 ? 1 : -1;
  return { duration, direction };
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

const getRankStyles = () => {
  return {
    bg: "bg-zinc-900",
    border: "border-zinc-800",
  };
};

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutPrice, setDonutPrice] = useState<number>(0);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showUsdPrize, setShowUsdPrize] = useState(true);

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

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        setEthUsdPrice(data.ethereum.usd);
      } catch {
        console.error('Failed to fetch ETH price');
      }

      try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + DONUT_ADDRESS);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setDonutPrice(parseFloat(data.pairs[0].priceUsd || 0));
        }
      } catch {
        console.error('Failed to fetch DONUT price');
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  const { data: leaderboardData, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?limit=5");
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

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const firstDistribution = new Date("2025-12-12T12:00:00Z");
      
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
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeUntilDistribution(
        `${days}d ${hours}h ${minutes}m`
      );
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

  const totalPrizeUsd = (ethBalance * ethUsdPrice) + (donutBalance * donutPrice);

  const firstPlaceEth = (ethBalance * 0.5).toFixed(4);
  const secondPlaceEth = (ethBalance * 0.3).toFixed(4);
  const thirdPlaceEth = (ethBalance * 0.2).toFixed(4);

  const firstPlaceDonut = (donutBalance * 0.5).toFixed(2);
  const secondPlaceDonut = (donutBalance * 0.3).toFixed(2);
  const thirdPlaceDonut = (donutBalance * 0.2).toFixed(2);

  const firstPlaceSprinkles = (sprinklesBalance * 0.5).toFixed(0);
  const secondPlaceSprinkles = (sprinklesBalance * 0.3).toFixed(0);
  const thirdPlaceSprinkles = (sprinklesBalance * 0.2).toFixed(0);

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes fall-1 {
          0% { transform: translateY(-50px) rotate(0deg); }
          100% { transform: translateY(calc(100vh + 50px)) rotate(360deg); }
        }
        @keyframes fall-2 {
          0% { transform: translateY(-50px) rotate(0deg); }
          100% { transform: translateY(calc(100vh + 50px)) rotate(-360deg); }
        }
        @keyframes fall-3 {
          0% { transform: translateY(-50px) rotate(0deg); }
          100% { transform: translateY(calc(100vh + 50px)) rotate(180deg); }
        }
        .falling-1 { animation: fall-1 8s linear infinite; }
        .falling-2 { animation: fall-2 10s linear infinite; }
        .falling-3 { animation: fall-3 12s linear infinite; }
        .falling-4 { animation: fall-1 9s linear infinite; }
        .falling-5 { animation: fall-2 11s linear infinite; }
        .falling-6 { animation: fall-3 7s linear infinite; }
        
        .glow-symbol {
          filter: drop-shadow(0 0 4px rgba(255,255,255,0.8));
        }
        
        @keyframes spin-slow-cw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-slow-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .spin-avatar-1 { animation: spin-slow-cw 12s linear infinite; }
        .spin-avatar-2 { animation: spin-slow-ccw 10s linear infinite; }
        .spin-avatar-3 { animation: spin-slow-cw 14s linear infinite; }
        .spin-avatar-4 { animation: spin-slow-ccw 11s linear infinite; }
        .spin-avatar-5 { animation: spin-slow-cw 9s linear infinite; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <span className="absolute left-[5%] top-0 text-white/20 text-lg glow-symbol falling-1" style={{ animationDelay: '-2s' }}>Ξ</span>
          <span className="absolute left-[25%] top-0 text-white/15 text-xl glow-symbol falling-2" style={{ animationDelay: '-5s' }}>Ξ</span>
          <span className="absolute left-[80%] top-0 text-white/20 text-base glow-symbol falling-3" style={{ animationDelay: '-8s' }}>Ξ</span>
          <span className="absolute left-[60%] top-0 text-white/10 text-lg glow-symbol falling-4" style={{ animationDelay: '-3s' }}>Ξ</span>
          
          <span className="absolute left-[15%] top-0 text-white/20 text-lg glow-symbol falling-2" style={{ animationDelay: '-1s' }}>🍩</span>
          <span className="absolute left-[45%] top-0 text-white/15 text-base glow-symbol falling-4" style={{ animationDelay: '-6s' }}>🍩</span>
          <span className="absolute left-[70%] top-0 text-white/20 text-xl glow-symbol falling-1" style={{ animationDelay: '-4s' }}>🍩</span>
          <span className="absolute left-[90%] top-0 text-white/10 text-lg glow-symbol falling-5" style={{ animationDelay: '-7s' }}>🍩</span>
          
          <Sparkles className="absolute left-[10%] top-0 w-4 h-4 text-white/20 glow-symbol falling-3" style={{ animationDelay: '-2.5s' }} />
          <Sparkles className="absolute left-[35%] top-0 w-5 h-5 text-white/25 glow-symbol falling-5" style={{ animationDelay: '-5.5s' }} />
          <Sparkles className="absolute left-[55%] top-0 w-6 h-6 text-white/15 glow-symbol falling-6" style={{ animationDelay: '-1.5s' }} />
          <Sparkles className="absolute left-[85%] top-0 w-4 h-4 text-white/20 glow-symbol falling-1" style={{ animationDelay: '-4.5s' }} />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-1 mb-0.5">
                <Trophy className="w-3 h-3 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-[9px] text-gray-400 uppercase">Week</span>
              </div>
              <div className="text-lg font-bold text-white">#{weekNumber}</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-1 mb-0.5">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-[9px] text-gray-400 uppercase">Ends In</span>
              </div>
              <div className="text-sm font-bold text-amber-400">{timeUntilDistribution}</div>
            </div>

            <button
              onClick={() => setShowUsdPrize(!showUsdPrize)}
              className={`border rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all h-[72px] ${
                showUsdPrize 
                  ? "bg-amber-500/10 border-amber-500/50" 
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <Coins className={`w-3 h-3 ${showUsdPrize ? "text-amber-400" : "text-green-400"}`} />
                <span className="text-[9px] text-gray-400 uppercase">Prizes</span>
              </div>
              {showUsdPrize ? (
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-amber-400">${Math.floor(totalPrizeUsd).toLocaleString()}</span>
                  <span className="text-[8px] text-gray-500">tap to see tokens</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[10px] font-bold text-green-400">Ξ{ethBalance.toFixed(3)}</span>
                  <span className="text-[10px] font-bold text-amber-400">🍩{Math.floor(donutBalance)}</span>
                  <span className="text-[10px] font-bold text-white flex items-center drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                    <Sparkles className="w-2.5 h-2.5" />
                    {Math.floor(sprinklesBalance/1000)}k
                  </span>
                </div>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowHelpDialog(true)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 mb-3 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <Trophy className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
              <span className="text-xs font-semibold text-white">Claim Your Share</span>
              <HelpCircle className="w-3 h-3 text-gray-400" />
            </div>
          </button>

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
                        <div className="text-[11px] text-gray-400">ETH & DONUT from glazing fees. SPRINKLES from Donut Labs buybacks.</div>
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

          <div className="flex-1 overflow-y-auto space-y-2 pb-2 scrollbar-hide">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-400">Loading leaderboard...</div>
              </div>
            ) : (
              [0, 1, 2, 3, 4].map((index) => {
                const rank = index + 1;
                const entry = leaderboard[index];
                const isWinner = rank <= 3;
                let prizeEth: string | null = null;
                let prizeDonut: string | null = null;
                let prizeSprinkles: string | null = null;
                if (rank === 1) { prizeEth = firstPlaceEth; prizeDonut = firstPlaceDonut; prizeSprinkles = firstPlaceSprinkles; }
                if (rank === 2) { prizeEth = secondPlaceEth; prizeDonut = secondPlaceDonut; prizeSprinkles = secondPlaceSprinkles; }
                if (rank === 3) { prizeEth = thirdPlaceEth; prizeDonut = thirdPlaceDonut; prizeSprinkles = thirdPlaceSprinkles; }
                const styles = getRankStyles();
                const spinClass = `spin-avatar-${(rank % 5) + 1}`;

                if (!entry) {
                  return (
                    <div
                      key={`empty-${rank}`}
                      className={`flex items-center justify-between rounded-xl p-3 border min-h-[72px] ${styles.bg} ${styles.border}`}
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
                          <div className="font-semibold text-white truncate text-sm">No one yet</div>
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
                    className={`flex items-center justify-between rounded-xl p-3 border min-h-[72px] ${styles.bg} ${styles.border}`}
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
                          <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                          <AvatarFallback className="bg-zinc-800 text-white text-xs">
                            {displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate text-sm">{displayName}</div>
                        {username && (
                          <div className="text-[10px] text-gray-400 truncate">{username}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="text-xs font-bold text-white">
                        {entry.total_glazes ?? entry.total_points ?? 0} <span className="text-[10px] font-normal text-gray-400">pts</span>
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
      <NavBar />
    </main>
  );
}