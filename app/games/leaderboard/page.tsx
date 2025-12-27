"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Trophy, Clock, Gift, Lock, HelpCircle, History, X } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

export default function GamesLeaderboardPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [showHowToWin, setShowHowToWin] = useState(false);

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

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username ? `@${context.user.username}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .page-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .page-scroll::-webkit-scrollbar { display: none; }
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
        <div className="flex-shrink-0 mb-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-2xl font-bold tracking-wide">LEADERBOARD</h1>
            </div>
            {context?.user && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  <div className="text-[10px] text-gray-500">{userHandle}</div>
                </div>
                <Avatar className="h-9 w-9 border border-zinc-700">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white text-xs">
                    {initialsFrom(userDisplayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
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
            {/* Stats Row - Week, Ends In, Prizes */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 mb-1">
                  <Trophy className="w-3 h-3" />
                  <span>WEEK</span>
                </div>
                <div className="text-2xl font-bold text-white">--</div>
              </div>
              <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 mb-1">
                  <Clock className="w-3 h-3" />
                  <span>ENDS IN</span>
                </div>
                <div className="text-2xl font-bold text-white">--</div>
              </div>
              <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500 mb-1">
                  <Gift className="w-3 h-3" />
                  <span>PRIZES</span>
                </div>
                <div className="text-2xl font-bold text-amber-400">--</div>
                <div className="text-[9px] text-gray-600">tap for tokens</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setShowHowToWin(true)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  <span className="text-xs font-semibold text-white">How to Win</span>
                  <HelpCircle className="w-3 h-3 text-gray-400" />
                </div>
              </button>
              <button className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors">
                <div className="flex items-center justify-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-white">Past Winners</span>
                </div>
              </button>
            </div>

            {/* Your Stats */}
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

            {/* Coming Soon Leaderboard */}
            <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center">
              <Lock className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-amber-400 font-bold text-lg mb-1">Games Leaderboard</p>
              <p className="text-amber-400 font-bold text-lg mb-3">Coming Soon!</p>
              <p className="text-[11px] text-gray-500">Play games now to be ready when it launches</p>
            </div>

            <div className="h-4" />
          </div>
        </div>

        {/* How to Win Popup */}
        {showHowToWin && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setShowHowToWin(false)}
            />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button
                  onClick={() => setShowHowToWin(false)}
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
                      <div className="font-semibold text-amber-400 text-xs">Play Games = 1 Point</div>
                      <div className="text-[11px] text-gray-400">Play any house game and earn 1 leaderboard point per game.</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Win Games = +2 Bonus</div>
                      <div className="text-[11px] text-gray-400">Win a game and earn 2 bonus leaderboard points.</div>
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
                      <div className="text-[11px] text-gray-400">Top 3 players split the prize pool: ETH, DONUT, and SPRINKLES!</div>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">5</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Where Rewards Come From</div>
                      <div className="text-[11px] text-gray-400">Rewards funded from house game fees.</div>
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
                      <div className="text-gray-400 font-bold text-xs">30%</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]">3rd</div>
                      <div className="text-amber-600 font-bold text-xs">20%</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowHowToWin(false)}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}