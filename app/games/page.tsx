"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Sparkles, Star, Clock, ChevronRight } from "lucide-react";

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

type WeeklySkin = {
  id: string;
  name: string;
  frostingColor: string;
  price: number;
  artistUsername: string;
  mintCount: number;
  animated?: boolean;
  animationType?: string;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Calculate time until next Friday 11PM UTC
function getTimeUntilReset(): string {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  const nextReset = new Date(utcNow);
  const currentDay = utcNow.getUTCDay();
  const currentHour = utcNow.getUTCHours();
  
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0 && currentHour >= 23) {
    daysUntilFriday = 7;
  }
  
  nextReset.setUTCDate(utcNow.getUTCDate() + daysUntilFriday);
  nextReset.setUTCHours(23, 0, 0, 0);
  
  const diff = nextReset.getTime() - utcNow.getTime();
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return days + "d " + hours + "h";
  } else {
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return hours + "h " + minutes + "m";
  }
}

// Weekly Skin Tile - links to skin market (amber theme)
function WeeklySkinTile({ skin, isLoading }: { skin: WeeklySkin | null; isLoading: boolean }) {
  const [timeLeft, setTimeLeft] = useState(getTimeUntilReset());
  
  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeUntilReset()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <button
      onClick={() => window.location.href = "/games/skin-market"}
      className="relative w-full rounded-2xl border border-amber-500/30 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/50 group bg-gradient-to-r from-amber-500/20 to-orange-500/20"
      style={{ minHeight: '120px' }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-white/5 to-amber-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Sparkles className="absolute top-3 right-12 w-4 h-4 text-yellow-400/60 animate-pulse" />
        <Sparkles className="absolute bottom-4 right-24 w-3 h-3 text-amber-400/60 animate-pulse" style={{ animationDelay: '0.5s' }} />
        <Star className="absolute top-6 right-32 w-3 h-3 text-orange-400/50 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {skin && !isLoading && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <div 
            className={`w-16 h-16 rounded-full relative shadow-xl ${skin.animated ? 'skin-animated-glow' : ''}`}
            style={{ backgroundColor: skin.frostingColor, boxShadow: '0 0 30px ' + skin.frostingColor + '40' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-zinc-900 border-2 border-zinc-700" />
            </div>
            <div className="absolute top-1.5 left-3 w-3 h-3 rounded-full bg-white/30" />
          </div>
        </div>
      )}
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <Palette className="w-5 h-5 text-amber-400" />
            </div>
            <span className="font-bold text-lg text-white">Skin Market</span>
            <span className="text-[10px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-medium animate-pulse">NEW</span>
          </div>
          
          {isLoading ? (
            <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse mb-2" />
          ) : skin ? (
            <>
              <div className="text-sm text-amber-200/90 font-medium mb-1">"{skin.name}" by @{skin.artistUsername}</div>
              <div className="flex items-center gap-3 text-xs text-amber-200/60">
                <span className="flex items-center gap-1">🍩 {skin.price}</span>
                <span className="flex items-center gap-1">👥 {skin.mintCount} minted</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-amber-200/70">Weekly artist collaboration skins</div>
          )}
          
          <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-300/50">
            <Clock className="w-3 h-3" />
            <span>Ends in {timeLeft}</span>
            <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
      
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 blur-xl" />
    </button>
  );
}

// Flappy Donut Game Tile
function FlappyDonutTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-pink-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-500/80"
      style={{ minHeight: '130px', background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(251,146,60,0.1) 100%)' }}
    >
      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="flappy-donut-float relative">
          <svg className="absolute -left-5 top-1/2 wing-flap" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'right center' }}>
            <ellipse cx="10" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          <svg className="absolute -right-5 top-1/2 wing-flap-reverse" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'left center' }}>
            <ellipse cx="14" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          <svg width="60" height="60" viewBox="0 0 60 60">
            <ellipse cx="33" cy="35" rx="20" ry="14" fill="rgba(0,0,0,0.15)" />
            <circle cx="30" cy="30" r="22" fill="#F472B6" stroke="rgba(0,0,0,0.2)" strokeWidth="2"/>
            <circle cx="30" cy="30" r="7" fill="#1a1a1a" stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
            <circle cx="23" cy="23" r="4" fill="rgba(255,255,255,0.3)"/>
          </svg>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-base text-pink-400">Flappy Donut</span>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-pink-200/60 mb-2">Tap to fly, dodge the rolling pins!</div>
          
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
          
          <div className="flex items-center gap-2 h-5">
            <span className="text-[9px] text-zinc-400">Last play:</span>
            <div className={`transition-opacity duration-300 ${showPlayer ? 'opacity-100' : 'opacity-0'}`}>
              {recentPlayer && (
                <span className="text-[9px] text-white bg-zinc-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />}
                  @{recentPlayer.username} scored {recentPlayer.score}
                </span>
              )}
            </div>
            {isLoading && <div className="w-24 h-4 bg-zinc-800/50 rounded-full animate-pulse" />}
          </div>
        </div>
      </div>
    </button>
  );
}

// Coming Soon Tile
function ComingSoonTile() {
  return (
    <div className="relative w-full rounded-2xl border border-zinc-800 overflow-hidden opacity-60" style={{ minHeight: '90px', background: 'rgba(39,39,42,0.3)' }}>
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
  const { address } = useAccount();
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [recentPlayer, setRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [prizePool, setPrizePool] = useState<string>("0");
  const [weeklySkin, setWeeklySkin] = useState<WeeklySkin | null>(null);
  const [isLoadingSkin, setIsLoadingSkin] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await (sdk as any).context;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    })();
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
    const fetchGameData = async () => {
      setIsLoadingRecent(true);
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          setRecentPlayer(data.recentPlayer);
          setPrizePool(data.prizePool || "0");
        }
      } catch (e) {
        console.error("Failed to fetch game data:", e);
      } finally {
        setIsLoadingRecent(false);
      }
    };
    fetchGameData();
    const interval = setInterval(fetchGameData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchSkin = async () => {
      setIsLoadingSkin(true);
      try {
        const res = await fetch('/api/games/skin-market/current');
        if (res.ok) {
          const data = await res.json();
          if (data.skin && data.skin.price > 0) {
            setWeeklySkin({
              id: data.skin.id,
              name: data.skin.name,
              frostingColor: data.skin.frostingColor,
              price: data.skin.price,
              artistUsername: data.skin.artist.username,
              mintCount: data.skin.mintCount,
              animated: data.skin.animated,
              animationType: data.skin.animationType,
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch skin:", e);
      } finally {
        setIsLoadingSkin(false);
      }
    };
    fetchSkin();
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      if (scrollHeight > 0) {
        setScrollFade({ top: Math.min(1, scrollTop / 100), bottom: Math.min(1, (scrollHeight - scrollTop) / 100) });
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
        @keyframes gear-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .gear-spin { animation: gear-spin 8s linear infinite; }
        @keyframes flappy-donut-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .flappy-donut-float { animation: flappy-donut-float 1.5s ease-in-out infinite; }
        @keyframes wing-flap { 0%, 100% { transform: translateY(-50%) rotate(-10deg) scaleY(0.8); } 50% { transform: translateY(-50%) rotate(10deg) scaleY(1); } }
        .wing-flap { animation: wing-flap 0.2s ease-in-out infinite; }
        @keyframes wing-flap-reverse { 0%, 100% { transform: translateY(-50%) rotate(10deg) scaleY(0.8); } 50% { transform: translateY(-50%) rotate(-10deg) scaleY(1); } }
        .wing-flap-reverse { animation: wing-flap-reverse 0.2s ease-in-out infinite; }
        @keyframes skin-glow { 0%, 100% { box-shadow: 0 0 20px currentColor; } 50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; } }
        .skin-animated-glow { animation: skin-glow 2s ease-in-out infinite; }
      `}</style>

      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
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
                    {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-3 pb-4">
              <WeeklySkinTile skin={weeklySkin} isLoading={isLoadingSkin} />
              <FlappyDonutTile recentPlayer={recentPlayer} prizePool={prizePool} isLoading={isLoadingRecent} />
              {[...Array(5)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}