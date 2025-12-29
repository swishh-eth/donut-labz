"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Sparkles, Dices, Lock, Bomb, Layers, ArrowRight, Trophy, Grid3X3 } from "lucide-react";

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
};

type GameWinners = LastWinner[];

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Ad Carousel Tile Component - static ads baked in at build time
// To add/remove ads, update this array with files from /public/adspot/
const AD_FILES: string[] = [
  "adspot1.png",
  "adspot2.png",
  "adspot3.mp4",
  "adspot4.gif",
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
      {ads.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {ads.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIndex ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Custom Wheel Icon component with spin animation
function WheelIcon({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={`${className} ${animated ? 'wheel-spin text-zinc-800' : ''}`}
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

// Animated Tower Icon
function AnimatedTowerIcon({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <div className={`${className} ${animated ? 'tower-stack' : ''} text-zinc-800`}>
      <Layers className="w-full h-full" />
    </div>
  );
}

// Animated Dice Icon
function AnimatedDiceIcon({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <div className={`${className} ${animated ? 'dice-shake' : ''} text-zinc-800`}>
      <Dices className="w-full h-full" />
    </div>
  );
}

// Animated Bomb Icon
function AnimatedBombIcon({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <div className={`${className} relative ${animated ? 'bomb-pulse' : ''} text-zinc-800`}>
      <Bomb className="w-full h-full" />
      {animated && <div className="bomb-fuse absolute -top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />}
    </div>
  );
}

// Games Leaderboard Tile Component
function GamesLeaderboardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
    >
      {/* Large background trophy symbol - solid color */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Trophy className="w-28 h-28" style={{ color: 'rgb(69, 26, 3)' }} />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-base text-amber-400">Games Leaderboard</span>
          </div>
          <div className="text-[10px] text-amber-200/60 mb-2">Compete weekly for prize pool rewards</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-amber-400">Play Games</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">Earn Points</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">Win Prizes</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Game tile component - new design matching info page
function GameTile({ 
  title, 
  description, 
  icon: Icon, 
  comingSoon = true,
  winners = [],
  animationType,
  onClick 
}: { 
  title: string;
  description: string;
  icon: React.ElementType;
  comingSoon?: boolean;
  winners?: GameWinners;
  animationType?: 'wheel' | 'tower' | 'dice' | 'bomb';
  onClick?: () => void;
}) {
  const [winnerIndex, setWinnerIndex] = useState(0);
  
  // Cycle through winners every 4 seconds
  useEffect(() => {
    if (winners.length <= 1) return;
    const interval = setInterval(() => {
      setWinnerIndex((prev) => (prev + 1) % winners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [winners.length]);
  
  const currentWinner = winners[winnerIndex] || null;

  // Render the appropriate animated background icon
  const renderBackgroundIcon = () => {
    const baseClass = "w-24 h-24";
    const colorClass = "text-zinc-800";
    
    if (comingSoon) {
      return <Icon className={`${baseClass} text-zinc-900`} />;
    }
    
    switch (animationType) {
      case 'wheel':
        return <WheelIcon className={`${baseClass} ${colorClass}`} animated />;
      case 'tower':
        return <AnimatedTowerIcon className={baseClass} animated />;
      case 'dice':
        return <AnimatedDiceIcon className={baseClass} animated />;
      case 'bomb':
        return <AnimatedBombIcon className={baseClass} animated />;
      default:
        return <Icon className={`${baseClass} ${colorClass}`} />;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={`relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-300 active:scale-[0.98] ${
        comingSoon 
          ? "border-zinc-700/30 opacity-50 cursor-not-allowed" 
          : "border-white/20 hover:border-white/40"
      }`}
      style={{ minHeight: '100px', background: comingSoon ? 'rgba(39,39,42,0.3)' : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background icon - solid color, no transparency */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-100">
        {renderBackgroundIcon()}
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-5 h-5 ${comingSoon ? "text-gray-500" : "text-white"}`} />
            <span className={`font-bold text-base ${comingSoon ? "text-gray-500" : "text-white"}`}>{title}</span>
            {comingSoon && (
              <span className="text-[9px] bg-zinc-700 text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Soon
              </span>
            )}
          </div>
          <div className={`text-[10px] mb-2 ${comingSoon ? "text-gray-600" : "text-white/60"}`}>{description}</div>
          
          {/* Last Winner - show winner or placeholder for consistent height */}
          <div className="flex items-center gap-2 h-5">
            {!comingSoon && currentWinner ? (
              <span className="text-[9px] text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 transition-opacity duration-300">
                {currentWinner.pfpUrl && (
                  <img src={currentWinner.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                )}
                @{currentWinner.username} +{currentWinner.amount}
              </span>
            ) : !comingSoon ? (
              <span className="text-[9px] text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full">
                Be the first to win!
              </span>
            ) : null}
          </div>
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
  
  // All winners fetched from database
  const [gameWinners, setGameWinners] = useState<{
    dice: GameWinners;
    mines: GameWinners;
    wheel: GameWinners;
    tower: GameWinners;
  }>({
    dice: [],
    mines: [],
    wheel: [],
    tower: [],
  });

  // Fetch winners from database
  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const res = await fetch('/api/games/last-winners');
        if (res.ok) {
          const data = await res.json();
          setGameWinners(data);
        }
      } catch (error) {
        console.error('Failed to fetch winners:', error);
      }
    };

    fetchWinners();
    const interval = setInterval(fetchWinners, 60 * 1000); // Refresh every minute
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
      winners: gameWinners.tower,
      animationType: "tower" as const,
      onClick: () => window.location.href = "/games/tower",
    },
    {
      id: "wheel",
      title: "Glaze Wheel",
      description: "Spin to win some real glaze!",
      icon: WheelIcon,
      comingSoon: false,
      winners: gameWinners.wheel,
      animationType: "wheel" as const,
      onClick: () => window.location.href = "/games/glaze-wheel",
    },
    {
      id: "dice",
      title: "Sugar Cubes",
      description: "Roll over/under, set your multiplier!",
      icon: Dices,
      comingSoon: false,
      winners: gameWinners.dice,
      animationType: "dice" as const,
      onClick: () => window.location.href = "/games/dice",
    },
    {
      id: "mines",
      title: "Bakery Mines",
      description: "Avoid the bombs, cash out anytime",
      icon: Bomb,
      comingSoon: false,
      winners: gameWinners.mines,
      animationType: "bomb" as const,
      onClick: () => window.location.href = "/games/mines",
    },
    {
      id: "keno",
      title: "Keno",
      description: "Pick numbers, win multipliers",
      icon: Grid3X3,
      comingSoon: true,
      winners: [],
    },
    {
      id: "slots",
      title: "Donut Slots",
      description: "Match symbols to win big",
      icon: Sparkles,
      comingSoon: true,
      winners: [],
    },
  ];

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        
        /* Wheel spin animation */
        @keyframes wheel-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .wheel-spin { animation: wheel-spin 8s linear infinite; }
        
        /* Tower stack animation - layers dropping */
        @keyframes tower-stack {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-3px); }
          50% { transform: translateY(0); }
          75% { transform: translateY(-2px); }
        }
        .tower-stack { animation: tower-stack 2s ease-in-out infinite; }
        
        /* Dice shake animation - slowed down */
        @keyframes dice-shake {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-5deg); }
          20% { transform: rotate(5deg); }
          30% { transform: rotate(-4deg); }
          40% { transform: rotate(4deg); }
          50% { transform: rotate(-3deg); }
          60% { transform: rotate(3deg); }
          70% { transform: rotate(-2deg); }
          80% { transform: rotate(2deg); }
          90% { transform: rotate(0deg); }
        }
        .dice-shake { animation: dice-shake 3s ease-in-out infinite; }
        
        /* Bomb pulse animation - slowed down */
        @keyframes bomb-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .bomb-pulse { animation: bomb-pulse 2.5s ease-in-out infinite; }
        
        @keyframes fuse-glow {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px 2px rgba(251, 146, 60, 0.8); }
          50% { opacity: 0.5; box-shadow: 0 0 8px 4px rgba(239, 68, 68, 1); }
        }
        .bomb-fuse { animation: fuse-glow 0.5s ease-in-out infinite; }
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
              
              {/* Games Leaderboard Tile */}
              <GamesLeaderboardTile onClick={() => window.location.href = "/games/leaderboard"} />
              
              {games.map((game) => (
                <GameTile
                  key={game.id}
                  title={game.title}
                  description={game.description}
                  icon={game.icon}
                  comingSoon={game.comingSoon}
                  winners={game.winners}
                  animationType={(game as any).animationType}
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