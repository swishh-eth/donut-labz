"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Trophy, Dices, Clock, Gift, Lock, HelpCircle, History } from "lucide-react";
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
              <button className="flex items-center justify-center gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-semibold text-sm hover:bg-zinc-800 transition-colors">
                <Trophy className="w-4 h-4" />
                <span>How to Win</span>
                <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <button className="flex items-center justify-center gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-semibold text-sm hover:bg-zinc-800 transition-colors">
                <History className="w-4 h-4" />
                <span>Past Winners</span>
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

            <div className="h-4" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}