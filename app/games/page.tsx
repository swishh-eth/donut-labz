"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Layers, Rocket, ArrowRight, Award } from "lucide-react";

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

// Donut color palette
const DONUT_COLORS = [
  '#EF4444', // red
  '#3B82F6', // blue
  '#FACC15', // yellow
  '#EC4899', // pink
  '#FFFFFF', // white
  '#22C55E', // green
];

const getUniqueRandomColors = (count: number): string[] => {
  const shuffled = [...DONUT_COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// Clean glowing donut component
function GlowingDonut({ color, size = 56 }: { color: string; size?: number }) {
  const isWhite = color === '#FFFFFF' || color === '#ffffff';
  return (
    <div 
      className="donut-pulse relative rounded-full"
      style={{ 
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: isWhite 
          ? `0 0 20px rgba(255,255,255,0.4), 0 0 40px rgba(255,255,255,0.2)`
          : `0 0 20px ${color}50, 0 0 40px ${color}30`
      }}
    >
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" 
        style={{ width: size * 0.35, height: size * 0.35 }}
      />
      <div 
        className="absolute rounded-full bg-white/30" 
        style={{ width: size * 0.18, height: size * 0.18, top: size * 0.15, left: size * 0.15 }}
      />
    </div>
  );
}

// Total Prizes Tile - shows USDC prize pools
function TotalPrizesTile({ prizes }: { prizes: { donutDash: number } }) {
  const totalUSDC = prizes.donutDash;
  
  return (
    <button
      onClick={() => window.location.href = "/games/prizes"}
      className="relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Trophy className="w-28 h-28 text-amber-900/80" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-base text-amber-400">Weekly Prize Pools</span>
          </div>
          <div className="text-[10px] text-amber-200/60 mb-2">Free to play, win real USDC</div>
          
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5">
              <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-5 h-5 rounded-full" />
              <span className="text-xl font-bold text-white">${totalUSDC}</span>
              <span className="text-xs text-amber-400/60">USDC</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-amber-400">Free to play</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">Resets Friday 6PM EST</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Flappy Donut Tile
function FlappyDonutTile({ recentPlayer, prizePool, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: string; donutColor: string }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <GlowingDonut color={donutColor} />
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Flappy Donut</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Tap to fly, dodge rolling pins!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-amber-400 whitespace-nowrap">{prizePool} 🍩</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1 whitespace-nowrap">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full flex-shrink-0" />}
                  @{recentPlayer.username} {recentPlayer.score}pts
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Glaze Stack Tile
function GlazeStackTile({ recentPlayer, prizePool, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: string; donutColor: string }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-2"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <GlowingDonut color={donutColor} />
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Glaze Stack</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Stack boxes, don't let them fall!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-amber-400 whitespace-nowrap">{prizePool} 🍩</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1 whitespace-nowrap">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full flex-shrink-0" />}
                  @{recentPlayer.username} {recentPlayer.score}pts
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Donut Dash Tile
function DonutDashTile({ recentPlayer, prizePool, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: number; donutColor: string }) {
  return (
    <button
      onClick={() => window.location.href = "/games/donut-dash"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <GlowingDonut color={donutColor} />
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Donut Dash</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Jetpack through, collect sprinkles!</div>
          
          <div className="flex items-center gap-1.5 text-[9px]">
            <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-3 h-3 rounded-full flex-shrink-0" />
            <span className="text-green-400 font-medium whitespace-nowrap">${prizePool} USDC</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1 whitespace-nowrap">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full flex-shrink-0" />}
                  @{recentPlayer.username} {recentPlayer.score}pts
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Coming Soon Tile
function ComingSoonTile() {
  return (
    <div 
      className="relative w-full rounded-2xl border-2 border-white/10 overflow-hidden opacity-50"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Settings className="w-12 h-12 text-zinc-800 gear-spin" />
      </div>
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-zinc-600" />
            <span className="font-bold text-base text-zinc-600">Coming Soon</span>
          </div>
          <div className="text-[10px] text-zinc-700 mb-2">New game in development</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-zinc-600">Stay tuned</span>
            <ArrowRight className="w-3 h-3 text-zinc-700" />
            <span className="text-zinc-600">More games coming</span>
          </div>
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
  
  const [tileColors] = useState(() => getUniqueRandomColors(3));
  
  const [flappyRecentPlayer, setFlappyRecentPlayer] = useState<RecentPlayer | null>(null);
  const [flappyPrizePool, setFlappyPrizePool] = useState<number>(0);
  
  const [stackRecentPlayer, setStackRecentPlayer] = useState<RecentPlayer | null>(null);
  const [stackPrizePool, setStackPrizePool] = useState<number>(0);
  
  const [dashRecentPlayer, setDashRecentPlayer] = useState<RecentPlayer | null>(null);
  const [dashPrizePool, setDashPrizePool] = useState<number>(5);

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
    const fetchData = async () => {
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          if (data.recentPlayer) setFlappyRecentPlayer(data.recentPlayer);
          setFlappyPrizePool(parseFloat(data.prizePool) || 0);
        }
      } catch (e) {
        console.error("Failed to fetch Flappy data:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/games/stack-tower/leaderboard');
        if (res.ok) {
          const data = await res.json();
          setStackPrizePool(parseFloat(data.prizePool) || 0);
          if (data.recentPlayer) {
            setStackRecentPlayer({
              username: data.recentPlayer.username,
              score: data.recentPlayer.score,
              pfpUrl: data.recentPlayer.pfpUrl,
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch Stack data:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const prizeRes = await fetch('/api/games/donut-dash/prize-distribute');
        if (prizeRes.ok) {
          const prizeData = await prizeRes.json();
          setDashPrizePool(prizeData.totalPrize || 5);
        }
        
        const recentRes = await fetch('/api/games/donut-dash/recent');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.recentPlayer) setDashRecentPlayer(recentData.recentPlayer);
        }
      } catch (e) {
        console.error("Failed to fetch Dash data:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
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
  const userHandle = context?.user?.username ? `@${context.user.username}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        @keyframes gear-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .gear-spin { animation: gear-spin 8s linear infinite; }
        @keyframes donut-pulse { 
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px currentColor, 0 0 40px currentColor; } 
          50% { transform: scale(1.03); box-shadow: 0 0 25px currentColor, 0 0 50px currentColor; } 
        }
        .donut-pulse { animation: donut-pulse 2.5s ease-in-out infinite; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold tracking-wide">GAMES</h1>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div 
            ref={scrollContainerRef} 
            className="flex-1 overflow-y-auto overflow-x-hidden games-scroll"
            style={{ 
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
            }}
          >
            <div className="space-y-3 pb-4">
              <TotalPrizesTile prizes={{ donutDash: dashPrizePool }} />
              <FlappyDonutTile recentPlayer={flappyRecentPlayer} prizePool={flappyPrizePool.toLocaleString()} donutColor={tileColors[0]} />
              <GlazeStackTile recentPlayer={stackRecentPlayer} prizePool={stackPrizePool.toLocaleString()} donutColor={tileColors[1]} />
              <DonutDashTile recentPlayer={dashRecentPlayer} prizePool={dashPrizePool} donutColor={tileColors[2]} />
              {[...Array(3)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}