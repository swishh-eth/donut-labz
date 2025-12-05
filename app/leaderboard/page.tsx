"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Clock, Coins } from "lucide-react";
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

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatAddress = (addr: string) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

function LeaderboardRow({
  rank,
  entry,
  prizeAmount,
}: {
  rank: number;
  entry: LeaderboardEntry;
  prizeAmount: string | null;
}) {
  const { data: profile } = useQuery<{ user: FarcasterProfile | null }>({
    queryKey: ["farcaster-profile", entry.address],
    queryFn: async () => {
      const res = await fetch(
        `/api/neynar/user?address=${encodeURIComponent(entry.address)}`
      );
      if (!res.ok) return { user: null };
      return res.json();
    },
    staleTime: 300_000, // Cache for 5 minutes
  });

  const displayName = profile?.user?.displayName || formatAddress(entry.address);
  const username = profile?.user?.username ? `@${profile.user.username}` : "";
  const avatarUrl =
    profile?.user?.pfpUrl ||
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
      entry.address.toLowerCase()
    )}`;

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-yellow-400";
    if (rank === 2) return "text-gray-300";
    if (rank === 3) return "text-amber-600";
    return "text-gray-400";
  };

  return (
    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:bg-zinc-800 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`text-xl font-bold ${getRankColor(rank)} w-10 flex-shrink-0`}>
          {getRankEmoji(rank)}
        </span>

        <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
          <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
          <AvatarFallback className="bg-zinc-800 text-white text-xs">
            {initialsFrom(displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white truncate">{displayName}</div>
          {username && (
            <div className="text-xs text-gray-400 truncate">{username}</div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-white">{entry.points}</span>
          <span className="text-xs text-gray-400">pts</span>
        </div>
        {prizeAmount && (
          <div className="text-xs text-green-400 font-semibold">
            +Ξ{prizeAmount}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [timeUntilDistribution, setTimeUntilDistribution] = useState("");

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

  // Fetch leaderboard data
  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 10_000, // Refresh every 10 seconds
  });

  // Fetch prize pool balance
  const { data: prizePoolData } = useQuery({
    queryKey: ["prize-pool"],
    queryFn: async () => {
      const contractAddress = process.env.NEXT_PUBLIC_LEADERBOARD_CONTRACT_ADDRESS || "0xC8826f73206215CaE1327D1262A4bC5128b0973B";
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

  // Calculate time until next Friday 12pm UTC
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nextFriday = new Date("2024-12-13T12:00:00Z"); // First distribution
      
      // Calculate next Friday from first distribution
      const weeksSinceFirst = Math.floor(
        (now.getTime() - nextFriday.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      const nextDistribution = new Date(
        nextFriday.getTime() + (weeksSinceFirst + 1) * 7 * 24 * 60 * 60 * 1000
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
            {context?.user ? (
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
                  {userHandle ? (
                    <div className="text-xs text-gray-400">{userHandle}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
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
              </div>
              <div className="text-sm font-bold text-white">
                {timeUntilDistribution}
              </div>
            </div>
          </div>

          {/* Leaderboard List */}
          <div className="flex-1 overflow-y-auto space-y-2 pb-2">
{isLoading ? (
  <div className="flex items-center justify-center py-12">
    <div className="text-gray-400">Loading leaderboard...</div>
  </div>
) : leaderboard.length === 0 ? (
  <>
    {[1, 2, 3].map((rank) => {
      const emptyEntry: LeaderboardEntry = {
        address: `0x${'0'.repeat(40)}`,
        points: 0,
        total_glazes: 0,
        week_number: weekNumber,
        last_glaze_timestamp: new Date().toISOString(),
      };

      return (
        <div key={rank} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3 opacity-50">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className={`text-xl font-bold w-10 flex-shrink-0 ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-300' : 'text-amber-600'}`}>
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
            </span>

            <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
              <AvatarImage 
                src={`https://api.dicebear.com/7.x/shapes/svg?seed=empty${rank}`}
                alt="Empty spot" 
                className="object-cover" 
              />
              <AvatarFallback className="bg-zinc-800 text-white text-xs">
                --
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-500 truncate">No one yet</div>
              <div className="text-xs text-gray-600 truncate">Be the first!</div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-gray-600">0</span>
              <span className="text-xs text-gray-600">pts</span>
            </div>
            <div className="text-xs text-gray-600 font-semibold">
              +Ξ{rank === 1 ? firstPlacePrize : rank === 2 ? secondPlacePrize : thirdPlacePrize}
            </div>
          </div>
        </div>
      );
    })}
  </>
) : (
              leaderboard.map((entry: LeaderboardEntry, index: number) => {
                const rank = index + 1;
                let prizeAmount = null;
                if (rank === 1) prizeAmount = firstPlacePrize;
                if (rank === 2) prizeAmount = secondPlacePrize;
                if (rank === 3) prizeAmount = thirdPlacePrize;

                return (
                  <LeaderboardRow
                    key={entry.address}
                    rank={rank}
                    entry={entry}
                    prizeAmount={prizeAmount}
                  />
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