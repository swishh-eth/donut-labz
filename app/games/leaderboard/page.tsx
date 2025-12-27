"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Trophy, Dices, Clock, Gift, Lock, Crown, Medal, Award } from "lucide-react";
import { NavBar } from "@/components/nav-bar";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

// Mock leaderboard data
const mockLeaderboard = [
  { rank: 1, username: "glazemaster", displayName: "Glaze Master", points: 12450, pfpUrl: null, gamesPlayed: 89 },
  { rank: 2, username: "donutlord", displayName: "Donut Lord", points: 11200, pfpUrl: null, gamesPlayed: 76 },
  { rank: 3, username: "sprinkleking", displayName: "Sprinkle King", points: 9875, pfpUrl: null, gamesPlayed: 68 },
  { rank: 4, username: "bakeryqueen", displayName: "Bakery Queen", points: 8340, pfpUrl: null, gamesPlayed: 54 },
  { rank: 5, username: "sugarcube", displayName: "Sugar Cube", points: 7650, pfpUrl: null, gamesPlayed: 51 },
  { rank: 6, username: "crispycrust", displayName: "Crispy Crust", points: 6420, pfpUrl: null, gamesPlayed: 43 },
  { rank: 7, username: "glazerunner", displayName: "Glaze Runner", points: 5890, pfpUrl: null, gamesPlayed: 39 },
  { rank: 8, username: "donutdegen", displayName: "Donut Degen", points: 4560, pfpUrl: null, gamesPlayed: 32 },
  { rank: 9, username: "sweetooth", displayName: "Sweet Tooth", points: 3210, pfpUrl: null, gamesPlayed: 24 },
  { rank: 10, username: "frostybaker", displayName: "Frosty Baker", points: 2100, pfpUrl: null, gamesPlayed: 18 },
];

const prizePool = {
  eth: "0.05",
  donut: "500",
  sprinkles: "10,000",
};

export default function GamesLeaderboardPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });

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

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="text-sm text-gray-500 font-bold w-5 text-center">{rank}</span>;
  };

  const getRankBg = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30";
    if (rank === 2) return "bg-gradient-to-r from-gray-400/20 to-gray-500/10 border-gray-400/30";
    if (rank === 3) return "bg-gradient-to-r from-amber-600/20 to-orange-600/10 border-amber-600/30";
    return "bg-zinc-900 border-zinc-800";
  };

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .page-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .page-scroll::-webkit-scrollbar { display: none; }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.5); }
        }
        
        .prize-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Top fade overlay */}
        <div 
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: 0,
            height: "calc(env(safe-area-inset-top, 0px) + 70px)",
            background: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            zIndex: 5,
          }}
        />
        
        {/* Bottom fade overlay */}
        <div 
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: 0,
            height: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            zIndex: 5,
          }}
        />

        {/* Header */}
        <div className="flex-shrink-0 mb-3 relative z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-wide flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Games Leaderboard
              </h1>
              <p className="text-[10px] text-gray-500">Weekly competition for prizes</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30">
              <Lock className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-bold">COMING SOON</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden page-scroll relative z-10"
          style={{ 
            WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, 
            maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` 
          }}
        >
          <div className="space-y-3 pb-8">
            {/* Coming Soon Banner */}
            <div className="rounded-xl p-4 border-2 border-dashed border-amber-500/30 bg-amber-500/5 text-center">
              <Lock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-amber-400 font-bold text-sm">Games Leaderboard Coming Soon!</p>
              <p className="text-[10px] text-gray-500 mt-1">Play games now to be ready when it launches</p>
            </div>

            {/* Time Remaining */}
            <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400">Week Ends In</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-zinc-800 px-2 py-1 rounded text-center">
                    <span className="text-lg font-bold text-white">5</span>
                    <span className="text-[8px] text-gray-500 block">DAYS</span>
                  </div>
                  <div className="bg-zinc-800 px-2 py-1 rounded text-center">
                    <span className="text-lg font-bold text-white">12</span>
                    <span className="text-[8px] text-gray-500 block">HRS</span>
                  </div>
                  <div className="bg-zinc-800 px-2 py-1 rounded text-center">
                    <span className="text-lg font-bold text-white">34</span>
                    <span className="text-[8px] text-gray-500 block">MIN</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Prize Pool */}
            <div className="rounded-xl p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30 prize-glow">
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-400">Weekly Prize Pool</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-black/30">
                  <div className="text-lg font-bold text-white">Ξ {prizePool.eth}</div>
                  <div className="text-[9px] text-gray-500">ETH</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-black/30">
                  <div className="text-lg font-bold text-amber-400">🍩 {prizePool.donut}</div>
                  <div className="text-[9px] text-gray-500">DONUT</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-black/30">
                  <div className="text-lg font-bold text-white">✨ {prizePool.sprinkles}</div>
                  <div className="text-[9px] text-gray-500">SPRINKLES</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-500/20">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>🥇 1st: 50%</span>
                  <span>🥈 2nd: 30%</span>
                  <span>🥉 3rd: 20%</span>
                </div>
              </div>
            </div>

            {/* How Points Work */}
            <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <Dices className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white">How to Earn Points</span>
              </div>
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50">
                  <span>Play any game</span>
                  <span className="text-amber-400 font-bold">+1 point per game</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50">
                  <span>Win a game</span>
                  <span className="text-green-400 font-bold">+2 bonus points</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50">
                  <span>Win streak (3+)</span>
                  <span className="text-purple-400 font-bold">+5 bonus points</span>
                </div>
              </div>
            </div>

            {/* Your Stats (Mock) */}
            <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800 opacity-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">Your Stats</span>
                <span className="text-[9px] bg-zinc-700 text-gray-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Coming Soon
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-lg font-bold text-gray-500">--</div>
                  <div className="text-[9px] text-gray-600">Rank</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-lg font-bold text-gray-500">--</div>
                  <div className="text-[9px] text-gray-600">Points</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                  <div className="text-lg font-bold text-gray-500">--</div>
                  <div className="text-[9px] text-gray-600">Games</div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Top Players</span>
                </div>
                <span className="text-[9px] text-gray-500">Preview Data</span>
              </div>
              
              <div className="divide-y divide-zinc-800/50">
                {mockLeaderboard.map((player) => (
                  <div 
                    key={player.rank}
                    className={`p-3 flex items-center gap-3 border-l-2 ${getRankBg(player.rank)}`}
                  >
                    <div className="w-8 flex items-center justify-center">
                      {getRankIcon(player.rank)}
                    </div>
                    
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-gray-400">
                      {player.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{player.displayName}</div>
                      <div className="text-[10px] text-gray-500">@{player.username} • {player.gamesPlayed} games</div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-400">{player.points.toLocaleString()}</div>
                      <div className="text-[9px] text-gray-500">points</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-4" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}