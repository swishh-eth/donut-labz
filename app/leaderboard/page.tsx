"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Clock, Coins, HelpCircle, X } from "lucide-react";
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
  points: number;
  total_glazes: number;
  week_number: number;
  last_glaze_timestamp: string;
};

type FarcasterProfile = {
  fid: number | null;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
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

// Rank styles - 1st brightest, 5th darkest (solid colors)
const getRankStyles = (rank: number) => {
  switch (rank) {
    case 1:
      return {
        bg: "bg-zinc-600",
        border: "border-zinc-500",
      };
    case 2:
      return {
        bg: "bg-zinc-700",
        border: "border-zinc-600",
      };
    case 3:
      return {
        bg: "bg-zinc-800",
        border: "border-zinc-700",
      };
    case 4:
      return {
        bg: "bg-zinc-900",
        border: "border-zinc-800",
      };
    case 5:
    default:
      return {
        bg: "bg-zinc-950",
        border: "border-zinc-900",
      };
  }
};

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

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
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        setEthUsdPrice(data.ethereum.usd);
      } catch {
        console.error('Failed to fetch ETH price');
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?limit=5");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: prizePoolData } = useQuery({
    queryKey: ["prize-pool"],
    queryFn: async () => {
      const contractAddress = "0xC8826f73206215CaE1327D1262A4bC5128b0973B";
      const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;
      
      if (!rpcUrl) return { balance: "0" };

      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [contractAddress, "latest"],
          id: 1,
        }),
      });

      const data = await res.json();
      return { balance: data.result || "0x0" };
    },
    refetchInterval: 30_000,
  });

  const addresses = leaderboardData?.leaderboard?.map((entry: LeaderboardEntry) => entry.address) || [];
  
  const { data: profiles } = useQuery<Record<string, FarcasterProfile | null>>({
    queryKey: ["farcaster-profiles", addresses],
    queryFn: async () => {
      if (addresses.length === 0) return {};
      
      const profilePromises = addresses.map(async (address: string) => {
        try {
          const res = await fetch(
            `/api/neynar/user?address=${encodeURIComponent(address)}`
          );
          if (!res.ok) return [address, null];
          const data = await res.json();
          return [address, data.user];
        } catch {
          return [address, null];
        }
      });

      const results = await Promise.all(profilePromises);
      return Object.fromEntries(results);
    },
    enabled: addresses.length > 0,
    staleTime: 300_000,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const firstDistribution = new Date("2024-12-13T12:00:00Z");
      
      const weeksSinceFirst = Math.floor(
        (now.getTime() - firstDistribution.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      const nextDistribution = new Date(
        firstDistribution.getTime() + (weeksSinceFirst + 1) * 7 * 24 * 60 * 60 * 1000
      );

      const diff = nextDistribution.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeUntilDistribution("Distribution pending...");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeUntilDistribution(
        `${days}d ${hours}h ${minutes}m ${seconds}s`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const leaderboard = leaderboardData?.leaderboard || [];
  const weekNumber = leaderboardData?.weekNumber || 0;
  
  const prizePoolBalance = prizePoolData?.balance
    ? parseFloat(formatEther(BigInt(prizePoolData.balance)))
    : 0;

  const firstPlacePrize = (prizePoolBalance * 0.5).toFixed(4);
  const secondPlacePrize = (prizePoolBalance * 0.3).toFixed(4);
  const thirdPlacePrize = (prizePoolBalance * 0.2).toFixed(4);

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
      {/* Floating Trophies CSS */}
      <style jsx global>{`
        @keyframes float-trophy-1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(10px, -15px) rotate(5deg); }
          50% { transform: translate(-5px, -25px) rotate(-3deg); }
          75% { transform: translate(-15px, -10px) rotate(3deg); }
        }
        @keyframes float-trophy-2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-12px, -20px) rotate(-5deg); }
          50% { transform: translate(8px, -30px) rotate(4deg); }
          75% { transform: translate(15px, -12px) rotate(-2deg); }
        }
        @keyframes float-trophy-3 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(15px, -18px) rotate(6deg); }
          66% { transform: translate(-10px, -28px) rotate(-4deg); }
        }
        @keyframes float-trophy-4 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-8px, -22px) rotate(-3deg); }
          40% { transform: translate(12px, -35px) rotate(5deg); }
          60% { transform: translate(-15px, -20px) rotate(-5deg); }
          80% { transform: translate(5px, -10px) rotate(2deg); }
        }
        .floating-trophy-1 { animation: float-trophy-1 6s ease-in-out infinite; }
        .floating-trophy-2 { animation: float-trophy-2 8s ease-in-out infinite; }
        .floating-trophy-3 { animation: float-trophy-3 7s ease-in-out infinite; }
        .floating-trophy-4 { animation: float-trophy-4 9s ease-in-out infinite; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Floating Trophies */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Trophy className="absolute top-32 left-4 w-8 h-8 text-white/10 floating-trophy-1" />
          <Trophy className="absolute top-48 right-6 w-7 h-7 text-white/8 floating-trophy-2" />
          <Trophy className="absolute top-64 left-8 w-6 h-6 text-white/6 floating-trophy-3" />
          <Trophy className="absolute top-40 right-12 w-7 h-7 text-white/10 floating-trophy-4" />
          <Trophy className="absolute top-56 left-16 w-6 h-6 text-white/8 floating-trophy-1" style={{ animationDelay: '2s' }} />
          <Trophy className="absolute top-72 right-4 w-8 h-8 text-white/6 floating-trophy-2" style={{ animationDelay: '1s' }} />
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

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-gray-400 uppercase">Week</span>
              </div>
              <div className="text-2xl font-bold text-white">#{weekNumber}</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400 uppercase">Prize Pool</span>
              </div>
              <div className="text-2xl font-bold text-green-400">
                Ξ{prizePoolBalance.toFixed(4)}
              </div>
              <div className="text-xs text-gray-400">
                (${(prizePoolBalance * ethUsdPrice).toFixed(2)})
              </div>
            </div>
          </div>

          {/* Countdown */}
          <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-700 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-white" />
                <span className="text-sm font-semibold text-white">
                  Next Distribution
                </span>
                <button
                  onClick={() => setShowHelpDialog(true)}
                  className="ml-1 text-gray-400 hover:text-white transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm font-bold text-white">
                {timeUntilDistribution}
              </div>
            </div>
          </div>

          {/* Help Dialog - Clean & Aligned */}
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
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    How to Earn Glazes
                  </h2>

                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        1
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Glaze the Factory</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Win the Dutch auction on the home page. Each win = 1 glaze.
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        2
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Compete Weekly</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Leaderboard resets every Friday 12pm UTC.
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        3
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Win ETH Prizes</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Top 3 glazers split the prize pool.
                        </div>
                      </div>
                    </div>

                    {/* Prize Distribution */}
                    <div className="bg-zinc-900/50 rounded-lg p-3 mt-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-yellow-400 text-lg">🥇</div>
                          <div className="text-white font-bold text-sm">50%</div>
                        </div>
                        <div>
                          <div className="text-gray-300 text-lg">🥈</div>
                          <div className="text-white font-bold text-sm">30%</div>
                        </div>
                        <div>
                          <div className="text-amber-600 text-lg">🥉</div>
                          <div className="text-white font-bold text-sm">20%</div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 text-center">
                      Prize pool grows from 2.5% of all glazing fees
                    </p>
                  </div>

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

          {/* Leaderboard List */}
          <div className="flex-1 overflow-y-auto space-y-2 pb-2 scrollbar-hide">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-400">Loading leaderboard...</div>
              </div>
            ) : leaderboard.length === 0 ? (
              <>
                {[1, 2, 3, 4, 5].map((rank) => {
                  const isWinner = rank <= 3;
                  const styles = getRankStyles(rank);

                  return (
                    <div
                      key={rank}
                      className={`flex items-center justify-between rounded-xl p-3 border ${styles.bg} ${styles.border} transition-all`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`text-xl font-bold w-8 flex-shrink-0 text-center ${
                            rank === 1
                              ? "text-yellow-400"
                              : rank === 2
                                ? "text-gray-300"
                                : rank === 3
                                  ? "text-amber-600"
                                  : "text-gray-600"
                          }`}
                        >
                          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                        </span>

                        <Avatar className="h-10 w-10 border border-zinc-600 flex-shrink-0">
                          <AvatarImage
                            src={ANON_PFPS[rank % ANON_PFPS.length]}
                            alt="Empty spot"
                            className="object-cover opacity-50"
                          />
                          <AvatarFallback className="bg-zinc-800 text-white text-xs">
                            --
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-500 truncate">No one yet</div>
                          <div className="text-xs text-gray-600 truncate">
                            {isWinner ? "Be the first!" : "Keep grinding"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="text-sm font-bold text-gray-600">
                          0 <span className="text-xs font-normal">glazes</span>
                        </div>
                        {isWinner && (
                          <div className="text-[10px] text-gray-600">
                            +Ξ{rank === 1 ? firstPlacePrize : rank === 2 ? secondPlacePrize : thirdPlacePrize}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              leaderboard.map((entry: LeaderboardEntry, index: number) => {
                const rank = index + 1;
                const isWinner = rank <= 3;
                let prizeAmount = null;
                if (rank === 1) prizeAmount = firstPlacePrize;
                if (rank === 2) prizeAmount = secondPlacePrize;
                if (rank === 3) prizeAmount = thirdPlacePrize;

                const profile = profiles?.[entry.address];
                const displayName = profile?.displayName || formatAddress(entry.address);
                const username = profile?.username ? `@${profile.username}` : "";
                const avatarUrl = profile?.pfpUrl || getAnonPfp(entry.address);
                const styles = getRankStyles(rank);

                return (
                  <div
                    key={entry.address}
                    className={`flex items-center justify-between rounded-xl p-3 border ${styles.bg} ${styles.border} hover:brightness-110 transition-all`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`text-xl font-bold w-8 flex-shrink-0 text-center ${
                          rank === 1
                            ? "text-yellow-400"
                            : rank === 2
                              ? "text-gray-300"
                              : rank === 3
                                ? "text-amber-600"
                                : "text-gray-500"
                        }`}
                      >
                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                      </span>

                      <Avatar className="h-10 w-10 border border-zinc-600 flex-shrink-0">
                        <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-white text-xs">
                          {initialsFrom(displayName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">{displayName}</div>
                        {username && <div className="text-xs text-gray-400 truncate">{username}</div>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="text-base font-bold text-white">
                        {entry.points} <span className="text-xs font-normal text-gray-400">glazes</span>
                      </div>
                      {prizeAmount && (
                        <div className="text-[10px] text-green-400 font-medium">
                          +Ξ{prizeAmount}
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