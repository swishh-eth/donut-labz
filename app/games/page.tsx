"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type RecentPlayer = {
  username: string;
  score: number;
  pfpUrl?: string;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Ad Carousel Tile Component - static ads baked in at build time
const AD_FILES: string[] = [
  "adspot1.png",
  "adspot2.png",
  "adspot3.png",
];

function AdCarouselTile() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const ads = AD_FILES.map(f => `/adspot/${f}`);

  // Auto-rotate ads
  useEffect(() => {
    if (ads.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % ads.length);
        setIsTransitioning(false);
      }, 500);
    }, 5000);
    return () => clearInterval(interval);
  }, [ads.length]);

  // Don't render if no ads configured
  if (ads.length === 0) return null;

  const currentAd = ads[currentIndex];
  const isVideo = currentAd?.endsWith('.mp4') || currentAd?.endsWith('.webm');

  return (
    <div
      className="relative w-full rounded-2xl border-2 border-zinc-700/50 overflow-hidden"
      style={{ minHeight: '120px', background: 'linear-gradient(135deg, rgba(63,63,70,0.3) 0%, rgba(39,39,42,0.3) 100%)' }}
    >
      <div className={`w-full h-full transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {isVideo ? (
          <video
            src={currentAd}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-32 object-cover"
          />
        ) : (
          <img
            src={currentAd}
            alt="Ad"
            className="w-full h-32 object-cover"
          />
        )}
      </div>
    </div>
  );
}

// Flappy Donut Game Tile
function FlappyDonutTile({ recentPlayer, prizePool }: { recentPlayer: RecentPlayer | null; prizePool: string }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-pink-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-500/80"
      style={{ minHeight: '120px', background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(251,146,60,0.1) 100%)' }}
    >
      {/* Animated donut background */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="donut-float">
          <svg width="100" height="100" viewBox="0 0 100 100" className="text-pink-900/50">
            {/* Outer donut */}
            <circle cx="50" cy="50" r="40" fill="currentColor" />
            {/* Inner hole */}
            <circle cx="50" cy="50" r="16" fill="#1a1a1a" />
            {/* Frosting arc */}
            <path d="M 20 50 A 30 30 0 0 1 80 50" fill="rgba(236,72,153,0.3)" />
          </svg>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-base text-pink-400">Flappy Donut</span>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-pink-200/60 mb-2">Tap to fly, dodge the rolling pins!</div>
          
          {/* Prize Pool */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400">Pool: {prizePool} 🍩</span>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400">Weekly prizes</span>
            </div>
          </div>
          
          {/* Recent Player */}
          {recentPlayer ? (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-zinc-400">Last play:</span>
              <span className="text-[9px] text-white bg-zinc-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                {recentPlayer.pfpUrl && (
                  <img src={recentPlayer.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                )}
                @{recentPlayer.username} scored {recentPlayer.score}
              </span>
            </div>
          ) : (
            <span className="text-[9px] text-zinc-500">Be the first to play today!</span>
          )}
        </div>
      </div>
    </button>
  );
}

// Coming Soon Tile with spinning gear
function ComingSoonTile() {
  return (
    <div
      className="relative w-full rounded-2xl border-2 border-zinc-700/30 overflow-hidden opacity-60"
      style={{ minHeight: '90px', background: 'rgba(39,39,42,0.3)' }}
    >
      {/* Spinning gear background */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Settings className="w-20 h-20 text-zinc-800 gear-spin" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-gray-500" />
            <span className="font-bold text-base text-gray-500">NEW GAMES SOON</span>
          </div>
          <div className="text-[10px] text-gray-600">Something fun is in the works...</div>
        </div>
      </div>
    </div>
  );
}

export default function GamesPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [recentPlayer, setRecentPlayer] = useState<RecentPlayer | null>(null);
  const [prizePool, setPrizePool] = useState<string>("0");

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

  // Fetch recent player and prize pool
  useEffect(() => {
    const fetchGameData = async () => {
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          setRecentPlayer(data.recentPlayer);
          setPrizePool(data.prizePool || "0");
        }
      } catch (e) {
        console.error("Failed to fetch game data:", e);
      }
    };
    
    fetchGameData();
    const interval = setInterval(fetchGameData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
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
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        
        /* Gear spin animation */
        @keyframes gear-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .gear-spin { animation: gear-spin 8s linear infinite; }
        
        /* Donut float animation */
        @keyframes donut-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(10deg); }
        }
        .donut-float { animation: donut-float 3s ease-in-out infinite; }
      `}</style>

      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold tracking-wide">GAMES</h1>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {context.user.username && (
                      <div className="text-xs text-gray-400">@{context.user.username}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-3 pb-4">
              {/* Ad Carousel */}
              <AdCarouselTile />
              
              {/* Flappy Donut - Live Game */}
              <FlappyDonutTile recentPlayer={recentPlayer} prizePool={prizePool} />
              
              {/* 5 Coming Soon tiles */}
              {[...Array(5)].map((_, i) => (
                <ComingSoonTile key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}