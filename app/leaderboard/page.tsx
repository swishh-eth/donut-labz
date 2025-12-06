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

// Anonymous PFP options - deterministically select based on address
const ANON_PFPS = [
  "/media/anonpfp1.png",
  "/media/anonpfp2.png",
  "/media/anonpfp3.png",
  "/media/anonpfp4.png",
  "/media/anonpfp5.png",
  "/media/anonpfp6.png",
];

const getAnonPfp = (address: string): string => {
  // Use the last character of the address to deterministically select a PFP
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

  // Fetch leaderboard data
  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?limit=5");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  // Fetch prize pool balance
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
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  // Fetch Farcaster profiles for all leaderboard entries
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
    staleTime: 300_000, // Cache for 5 minutes
  });

  // Calculate time until next Friday 12pm UTC
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
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
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
                    <h2 className="text-xl font-bold text-white mb-2">
                      How to Get on the Leaderboard
                    </h2>
                  </div>

                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">1.</span>
                      <p>
                        <span className="text-white font-semibold">Glaze the Factory</span> - Every time you successfully win the auction by clicking "GLAZE" on the main page, you earn 1 point.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">2.</span>
                      <p>
                        <span className="text-white font-semibold">Compete Weekly</span> - The leaderboard resets every Friday at 12pm UTC. Your points only count for the current week.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">3.</span>
                      <p>
                        <span className="text-white font-semibold">Win Prizes</span> - Top 3 at the end of the week split the prize pool:
                      </p>
                    </div>

                    <div className="ml-8 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-yellow-400">🥇 1st Place:</span>
                        <span className="text-white font-semibold">50% of pool</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">🥈 2nd Place:</span>
                        <span className="text-white font-semibold">30% of pool</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">🥉 3rd Place:</span>
                        <span className="text-white font-semibold">20% of pool</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-800">
                      <p className="text-xs text-gray-400 italic">
                        Prize pool grows from 2.5% of all glazing fees collected during the week.
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

                  return (
                    <div
                      key={rank}
                      className={`flex items-center justify-between bg-zinc-900 border rounded-lg p-3 ${
                        isWinner ? "border-zinc-700 opacity-50" : "border-zinc-800 opacity-30"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`text-xl font-bold w-10 flex-shrink-0 ${
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

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-500 truncate">No one yet</div>
                          <div className="text-xs text-gray-600 truncate">
                            {isWinner ? "Be the first!" : "So close!"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold text-gray-600">0</span>
                          <span className="text-xs text-gray-600">pts</span>
                        </div>
                        {isWinner && (
                          <div className="text-xs text-gray-600 font-semibold">
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

                return (
                  <div
                    key={entry.address}
                    className={`flex items-center justify-between bg-zinc-900 border rounded-lg p-3 hover:bg-zinc-800 transition-colors ${
                      isWinner ? "border-zinc-700" : "border-zinc-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`text-xl font-bold w-10 flex-shrink-0 ${
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

                      <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
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
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold text-white">{entry.points}</span>
                        <span className="text-xs text-gray-400">pts</span>
                      </div>
                      {prizeAmount && (
                        <div className="text-xs text-green-400 font-semibold">
                          +Ξ{prizeAmount} (${(parseFloat(prizeAmount) * ethUsdPrice).toFixed(2)})
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