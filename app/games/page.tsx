"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Ticket, Clock, HelpCircle, X, Sparkles, Dices, Lock, Bomb, Layers, Flame, Users } from "lucide-react";

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

// Falling donut for lottery tile
function FallingDonut({ delay, duration, left }: { delay: number; duration: number; left: number }) {
  return (
    <div
      className="lottery-donut absolute text-base pointer-events-none select-none opacity-60"
      style={{
        left: `${left}%`,
        top: '-25px',
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      🍩
    </div>
  );
}

// Special Lottery Tile Component
function LotteryTile({ 
  currentPot, 
  totalTickets, 
  timeRemaining, 
  lastWinner,
  onClick 
}: { 
  currentPot: number;
  totalTickets: number;
  timeRemaining: string;
  lastWinner?: LastWinner;
  onClick: () => void;
}) {
  const [donuts, setDonuts] = useState<Array<{ id: number; delay: number; duration: number; left: number }>>([]);
  const [isHovered, setIsHovered] = useState(false);
  const idCounter = useRef(0);
  
  const isComingSoon = currentPot === 0 && totalTickets === 0;

  useEffect(() => {
    const initialDonuts = Array.from({ length: 10 }, () => ({
      id: idCounter.current++,
      delay: Math.random() * 4,
      duration: 3.5 + Math.random() * 1.5,
      left: Math.random() * 90 + 5,
    }));
    setDonuts(initialDonuts);

    const interval = setInterval(() => {
      setDonuts(prev => {
        const newDonut = {
          id: idCounter.current++,
          delay: 0,
          duration: 3.5 + Math.random() * 1.5,
          left: Math.random() * 90 + 5,
        };
        return [...prev.slice(-14), newDonut];
      });
    }, 600);

    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="lottery-tile-main relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-300 active:scale-[0.98]"
      style={{ minHeight: '130px' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {donuts.map((donut) => (
          <FallingDonut key={donut.id} {...donut} />
        ))}
      </div>
      
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white">Daily Donut Lottery</span>
              {isComingSoon ? (
                <span className="text-[8px] bg-zinc-700 text-gray-400 px-1.5 py-0.5 rounded-full font-bold">
                  SOON
                </span>
              ) : (
                <span className="text-[8px] bg-[#22c55e] text-black px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <div className="text-[9px] text-white/80">1 DONUT = 1 Ticket • Winner Takes All</div>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-white/60">
              <Clock className="w-2.5 h-2.5" />
              <span className="text-[8px]">{isComingSoon ? "Launches" : "Draws"}</span>
            </div>
            <span className="text-xs font-bold text-white font-mono">{isComingSoon ? "Soon™" : timeRemaining}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-left">
            <div className="text-[8px] text-white/60 uppercase tracking-wider">Prize Pool</div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl">🍩</span>
              {isComingSoon ? (
                <span className="text-2xl font-black text-white/50">Coming Soon</span>
              ) : (
                <span className="text-3xl font-black text-amber-400">
                  {currentPot.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[9px] text-white/50 mt-0.5">
              <span className="flex items-center gap-1">
                <Ticket className="w-2.5 h-2.5" />
                {isComingSoon ? "0" : totalTickets.toLocaleString()} tickets
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-2.5 h-2.5" />
                {isComingSoon ? "0" : Math.floor(totalTickets / 8) || 1}+ players
              </span>
            </div>
          </div>
          
          <div className={`px-4 py-2.5 rounded-xl bg-white text-black font-bold text-sm ${isHovered ? 'scale-105' : ''} transition-transform`}>
            {isComingSoon ? "View Details →" : "Buy Tickets →"}
          </div>
        </div>
        
        {lastWinner && !isComingSoon && (
          <div className="mt-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-center gap-2 text-[9px]">
              <span className="text-white/50">Last winner:</span>
              {lastWinner.pfpUrl && (
                <img src={lastWinner.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
              )}
              <span className="text-green-400 font-bold">@{lastWinner.username}</span>
              <span className="text-amber-400">won {lastWinner.amount}</span>
            </div>
          </div>
        )}
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
  const [showHelpDialog, setShowHelpDialog] = useState(false);
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
  
  // Lottery state - Coming soon
  const [lotteryPot] = useState(0);
  const [lotteryTickets] = useState(0);
  const [lotteryTimeRemaining] = useState("--:--:--");
  const [lotteryLastWinner] = useState<LastWinner>(null);

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
    // Only refresh every 5 minutes instead of 15 minutes with 4 separate calls
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
      onClick: () => window.location.href = "/tower",
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
      onClick: () => router.push("/glaze-wheel"),
    },
    {
      id: "dice",
      title: "Sugar Cubes",
      description: "Roll over/under, set your multiplier!",
      icon: Dices,
      comingSoon: false,
      lastWinner: lastWinners.dice,
      onClick: () => router.push("/dice"),
    },
    {
      id: "mines",
      title: "Bakery Mines",
      description: "Avoid the bombs, cash out anytime",
      icon: Bomb,
      comingSoon: false,
      lastWinner: lastWinners.mines,
      scrollDirection: "right" as const,
      onClick: () => router.push("/mines"),
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
      <style jsx global>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        .game-tile { scroll-snap-align: start; }
        @keyframes icon-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes icon-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
        @keyframes hot-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); } }
        .icon-breathe { animation: icon-breathe 2s ease-in-out infinite; }
        .icon-spin { animation: icon-spin 4s linear infinite; }
        .hot-pulse { animation: hot-pulse 2s ease-in-out infinite; }
        .winner-container { overflow: hidden; max-width: 140px; -webkit-mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent); mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent); }
        .winner-track { display: flex; width: max-content; animation: scroll-left 6s linear infinite; }
        .winner-track-right { display: flex; width: max-content; animation: scroll-right 6s linear infinite; }
        .winner-item { display: flex; align-items: center; gap: 4px; padding: 2px 8px; margin-right: 16px; font-size: 9px; color: #4ade80; background: rgba(34, 197, 94, 0.2); border-radius: 9999px; white-space: nowrap; }
        
        @keyframes lottery-donut-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 0.6; }
          95% { opacity: 0.6; }
          100% { transform: translateY(180px) rotate(360deg); opacity: 0; }
        }
        .lottery-donut { animation: lottery-donut-fall linear infinite; }
        .lottery-tile-main { 
          background: rgba(245, 158, 11, 0.1);
          border-color: rgb(251, 191, 36);
        }
        .lottery-tile-main:hover {
          border-color: rgb(251, 191, 36);
        }
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

            <button onClick={() => setShowHelpDialog(true)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 mb-2 hover:bg-zinc-800 transition-colors">
              <div className="flex items-center justify-center gap-2">
                <Dices className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-xs font-semibold text-white">How Games Work</span>
                <HelpCircle className="w-3 h-3 text-gray-400" />
              </div>
            </button>
          </div>

          {showHelpDialog && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2"><Dices className="w-4 h-4 text-white" /> Donut Labs Games</h2>
                  <div className="space-y-2.5">
                    <div className="flex gap-2.5"><div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div><div><div className="font-semibold text-amber-400 text-xs">100% Onchain</div><div className="text-[11px] text-gray-400">All games run entirely on Base.</div></div></div>
                    <div className="flex gap-2.5"><div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div><div><div className="font-semibold text-white text-xs">Provably Fair</div><div className="text-[11px] text-gray-400">All randomness is verifiable.</div></div></div>
                    <div className="flex gap-2.5"><div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div><div><div className="font-semibold text-amber-400 text-xs">Transparent Fees</div><div className="text-[11px] text-gray-400">2% house edge: 1% pool, 0.5% LP, 0.5% treasury.</div></div></div>
                  </div>
                  <button onClick={() => setShowHelpDialog(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
                </div>
              </div>
            </div>
          )}

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-2 pb-4">
              <LotteryTile
                currentPot={lotteryPot}
                totalTickets={lotteryTickets}
                timeRemaining={lotteryTimeRemaining}
                lastWinner={lotteryLastWinner}
                onClick={() => window.location.href = "/games/lottery"}
              />
              
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