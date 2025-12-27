"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Sparkles, Dices, Lock, Bomb, Layers, Flame, TrendingUp, ArrowRight, Trophy } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type LastWinner = {
  username: string;
  amount: string;
  pfpUrl?: string;
} | null;

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Custom Wheel Icon component
function WheelIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

// Falling item for leaderboard tile (donuts and sprinkles)
function FallingItem({ delay, duration, left, type }: { delay: number; duration: number; left: number; type: 'donut' | 'sprinkle' }) {
  return (
    <div
      className="falling-item absolute pointer-events-none select-none opacity-60"
      style={{
        left: `${left}%`,
        top: '-25px',
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      {type === 'donut' ? (
        <span className="text-sm">🍩</span>
      ) : (
        <Sparkles className="w-4 h-4 text-white" />
      )}
    </div>
  );
}

// Games Leaderboard Tile Component
function GamesLeaderboardTile({ onClick }: { onClick: () => void }) {
  const [items, setItems] = useState<Array<{ id: number; delay: number; duration: number; left: number; type: 'donut' | 'sprinkle' }>>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    const initialItems = Array.from({ length: 8 }, () => ({
      id: idCounter.current++,
      delay: Math.random() * 4,
      duration: 3.5 + Math.random() * 1.5,
      left: Math.random() * 90 + 5,
      type: (Math.random() > 0.5 ? 'donut' : 'sprinkle') as 'donut' | 'sprinkle',
    }));
    setItems(initialItems);

    const interval = setInterval(() => {
      setItems(prev => {
        const newItem = {
          id: idCounter.current++,
          delay: 0,
          duration: 3.5 + Math.random() * 1.5,
          left: Math.random() * 90 + 5,
          type: (Math.random() > 0.5 ? 'donut' : 'sprinkle') as 'donut' | 'sprinkle',
        };
        return [...prev.slice(-12), newItem];
      });
    }, 700);

    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onClick}
      className="leaderboard-tile relative w-full rounded-2xl border-2 border-amber-500/30 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/50"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(234,88,12,0.05) 100%)' }}
    >
      {/* Falling donuts and sprinkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {items.map((item) => (
          <FallingItem key={item.id} {...item} />
        ))}
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-2 right-2 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl" />
        <div className="absolute bottom-2 left-2 w-16 h-16 bg-amber-500/10 rounded-full blur-xl" />
      </div>
      
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between">
          <div className="text-left flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-base text-amber-400">Games Leaderboard</span>
            </div>
            <div className="text-[10px] text-amber-200/60 mb-2">Compete weekly for prize pool rewards</div>
            
            <div className="flex items-center gap-3 text-[9px]">
              <div className="flex items-center gap-1 text-amber-400">
                <Dices className="w-3 h-3" />
                <span>Play Games</span>
              </div>
              <ArrowRight className="w-3 h-3 text-amber-500/30" />
              <div className="flex items-center gap-1 text-amber-400">
                <TrendingUp className="w-3 h-3" />
                <span>Earn Points</span>
              </div>
              <ArrowRight className="w-3 h-3 text-amber-500/30" />
              <div className="flex items-center gap-1 text-amber-400">
                <Trophy className="w-3 h-3" />
                <span>Win Prizes</span>
              </div>
            </div>
          </div>
          
          <div className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 font-bold text-xs border border-amber-500/30">
            View →
          </div>
        </div>
      </div>
    </button>
  );
}

// Game tile component
function GameTile({ 
  title, 
  description, 
  icon: Icon, 
  comingSoon = true,
  isNew = false,
  isHot = false,
  iconClassName,
  lastWinner,
  scrollDirection = "left",
  onClick 
}: { 
  title: string;
  description: string;
  icon: React.ElementType;
  comingSoon?: boolean;
  isNew?: boolean;
  isHot?: boolean;
  iconClassName?: string;
  lastWinner?: LastWinner;
  scrollDirection?: "left" | "right";
  onClick?: () => void;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsFocused(true)}
      onMouseLeave={() => setIsFocused(false)}
      disabled={comingSoon}
      className={`game-tile flex items-center justify-between rounded-xl p-4 border transition-all duration-200 w-full text-left ${
        isFocused && !comingSoon
          ? "border-zinc-700 bg-zinc-800"
          : "bg-zinc-900 border-zinc-800"
      } ${comingSoon ? "opacity-60 cursor-not-allowed" : "hover:border-zinc-700 hover:bg-zinc-800 active:scale-[0.98]"}`}
      style={{ minHeight: '90px' }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-zinc-800 ${
          !comingSoon ? "border border-zinc-600" : ""
        }`}>
          <Icon className={`w-6 h-6 ${!comingSoon ? "text-white" : "text-gray-400"} ${iconClassName || (!comingSoon ? "icon-breathe" : "")}`} />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-base ${!comingSoon ? "text-white" : "text-gray-400"} flex-shrink-0`}>
              {title}
            </span>
            {comingSoon && (
              <span className="text-[9px] bg-zinc-700 text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                <Lock className="w-2.5 h-2.5" />
                Soon
              </span>
            )}
            {!comingSoon && isHot && (
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold hot-pulse flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5" /> HOT
              </span>
            )}
            {!comingSoon && isNew && !isHot && (
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold">
                NEW
              </span>
            )}
            {!comingSoon && !isNew && !isHot && (
              <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                LIVE
              </span>
            )}
            {!comingSoon && lastWinner && (
              <div className="winner-container min-w-0">
                <div className={scrollDirection === "right" ? "winner-track-right" : "winner-track"}>
                  <span className="winner-item">
                    {lastWinner.pfpUrl && (
                      <img src={lastWinner.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                    )}
                    @{lastWinner.username} +{lastWinner.amount}
                  </span>
                  <span className="winner-item">
                    {lastWinner.pfpUrl && (
                      <img src={lastWinner.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                    )}
                    @{lastWinner.username} +{lastWinner.amount}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{description}</div>
        </div>
      </div>
    </button>
  );
}

export default function GamesPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  
  // All last winners fetched from a single API call
  const [lastWinners, setLastWinners] = useState<{
    dice: LastWinner;
    mines: LastWinner;
    wheel: LastWinner;
    tower: LastWinner;
  }>({
    dice: null,
    mines: null,
    wheel: null,
    tower: null,
  });

  // Fetch all last winners from a single API endpoint
  useEffect(() => {
    const fetchLastWinners = async () => {
      try {
        const res = await fetch('/api/games/last-winners');
        if (res.ok) {
          const data = await res.json();
          setLastWinners(data);
        }
      } catch (error) {
        console.error('Failed to fetch last winners:', error);
      }
    };

    fetchLastWinners();
    const interval = setInterval(fetchLastWinners, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const games = [
    {
      id: "tower",
      title: "Donut Tower",
      description: "Climb levels to win some dough!",
      icon: Layers,
      comingSoon: false,
      isHot: true,
      lastWinner: lastWinners.tower,
      onClick: () => window.location.href = "/games/tower",
    },
    {
      id: "wheel",
      title: "Glaze Wheel",
      description: "Spin to win some real glaze!",
      icon: WheelIcon,
      comingSoon: false,
      iconClassName: "icon-spin",
      lastWinner: lastWinners.wheel,
      scrollDirection: "right" as const,
      onClick: () => window.location.href = "/games/glaze-wheel",
    },
    {
      id: "dice",
      title: "Sugar Cubes",
      description: "Roll over/under, set your multiplier!",
      icon: Dices,
      comingSoon: false,
      lastWinner: lastWinners.dice,
      onClick: () => window.location.href = "/games/dice",
    },
    {
      id: "mines",
      title: "Bakery Mines",
      description: "Avoid the bombs, cash out anytime",
      icon: Bomb,
      comingSoon: false,
      lastWinner: lastWinners.mines,
      scrollDirection: "right" as const,
      onClick: () => window.location.href = "/games/mines",
    },
    {
      id: "slots",
      title: "Donut Slots",
      description: "Match symbols to win big",
      icon: Sparkles,
      comingSoon: true,
      lastWinner: null,
    },
  ];

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        .game-tile { scroll-snap-align: start; }
        @keyframes icon-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes icon-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
        @keyframes hot-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); } }
        @keyframes item-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 0.6; }
          95% { opacity: 0.6; }
          100% { transform: translateY(140px) rotate(360deg); opacity: 0; }
        }
        .icon-breathe { animation: icon-breathe 2s ease-in-out infinite; }
        .icon-spin { animation: icon-spin 4s linear infinite; }
        .hot-pulse { animation: hot-pulse 2s ease-in-out infinite; }
        .falling-item { animation: item-fall linear infinite; }
        .winner-container { overflow: hidden; max-width: 140px; -webkit-mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent); mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent); }
        .winner-track { display: flex; width: max-content; animation: scroll-left 6s linear infinite; }
        .winner-track-right { display: flex; width: max-content; animation: scroll-right 6s linear infinite; }
        .winner-item { display: flex; align-items: center; gap: 4px; padding: 2px 8px; margin-right: 16px; font-size: 9px; color: #4ade80; background: rgba(34, 197, 94, 0.2); border-radius: 9999px; white-space: nowrap; }
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
            <div className="space-y-2 pb-4">
              {/* Games Leaderboard Tile */}
              <GamesLeaderboardTile onClick={() => window.location.href = "/games/leaderboard"} />
              
              {games.map((game) => (
                <GameTile
                  key={game.id}
                  title={game.title}
                  description={game.description}
                  icon={game.icon}
                  comingSoon={game.comingSoon}
                  isNew={(game as any).isNew}
                  isHot={(game as any).isHot}
                  iconClassName={(game as any).iconClassName}
                  lastWinner={game.lastWinner}
                  scrollDirection={(game as any).scrollDirection}
                  onClick={game.onClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}