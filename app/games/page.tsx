"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { ShareRewardButton } from "@/components/share-reward-button";
import { Settings, Gamepad2, Trophy, Layers, Rocket, ArrowRight, Clock, Coins, HelpCircle, X } from "lucide-react";

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

// Donut coin image component
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover scale-[1.7]" />
  </span>
);

// USDC coin image component with circular boundary
const UsdcCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-full h-full object-cover" />
  </span>
);

// Flappy Donut Tile
function FlappyDonutTile({ recentPlayer, prizePool, weeklyPlays }: { recentPlayer: RecentPlayer | null; prizePool: string; weeklyPlays: number }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Gamepad2 className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Flappy Donut</span>
            <span className="text-[8px] bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded-full">ENTRY FEE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Tap to fly, dodge rolling pins!</div>
          
          <div className="flex items-center gap-1.5 text-[9px]">
            <DonutCoin className="w-3 h-3" />
            <span className="text-pink-400 font-medium whitespace-nowrap">{prizePool} DONUT</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500 whitespace-nowrap">{weeklyPlays.toLocaleString()} plays</span>
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

// Glaze Stack Tile (Free to Play with USDC prizes)
function GlazeStackTile({ recentPlayer, prizePool, weeklyPlays }: { recentPlayer: RecentPlayer | null; prizePool: number; weeklyPlays: number }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-2"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Layers className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Glaze Stack</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">FREE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Stack boxes, don't let them fall!</div>
          
          <div className="flex items-center gap-1.5 text-[9px]">
            <UsdcCoin className="w-3 h-3" />
            <span className="text-green-400 font-medium whitespace-nowrap">${prizePool} USDC</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500 whitespace-nowrap">{weeklyPlays.toLocaleString()} plays</span>
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
function DonutDashTile({ recentPlayer, prizePool, weeklyPlays }: { recentPlayer: RecentPlayer | null; prizePool: number; weeklyPlays: number }) {
  return (
    <button
      onClick={() => window.location.href = "/games/donut-dash"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Rocket className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Donut Dash</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">FREE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Jetpack through, collect sprinkles!</div>
          
          <div className="flex items-center gap-1.5 text-[9px]">
            <UsdcCoin className="w-3 h-3" />
            <span className="text-green-400 font-medium whitespace-nowrap">${prizePool} USDC</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500 whitespace-nowrap">{weeklyPlays.toLocaleString()} plays</span>
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
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Settings className="w-24 h-24 text-zinc-800 gear-spin" />
      </div>
      <div className="relative z-10 p-4 pr-20">
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
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  
  const [flappyRecentPlayer, setFlappyRecentPlayer] = useState<RecentPlayer | null>(null);
  const [flappyPrizePool, setFlappyPrizePool] = useState<number>(0);
  
  const [stackRecentPlayer, setStackRecentPlayer] = useState<RecentPlayer | null>(null);
  const [stackPrizePool, setStackPrizePool] = useState<number>(5);
  
  const [dashRecentPlayer, setDashRecentPlayer] = useState<RecentPlayer | null>(null);
  const [dashPrizePool, setDashPrizePool] = useState<number>(5);
  
  const [totalGamesPlayed, setTotalGamesPlayed] = useState<number>(0);
  const [flappyWeeklyPlays, setFlappyWeeklyPlays] = useState<number>(0);
  const [stackWeeklyPlays, setStackWeeklyPlays] = useState<number>(0);
  const [dashWeeklyPlays, setDashWeeklyPlays] = useState<number>(0);
  const [timeUntilReset, setTimeUntilReset] = useState<string>("");
  const [showUsdPrize, setShowUsdPrize] = useState(true);
  
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  
  // Loading states
  const [isStatsLoaded, setIsStatsLoaded] = useState(false);
  const [isTimeLoaded, setIsTimeLoaded] = useState(false);

  // Calculate time until Friday 6PM EST
  useEffect(() => {
    const calculateTimeUntilFriday = () => {
      const now = new Date();
      const estOffset = -5;
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const estTime = new Date(utc + 3600000 * estOffset);
      
      const daysUntilFriday = (5 - estTime.getDay() + 7) % 7;
      const targetDate = new Date(estTime);
      targetDate.setDate(estTime.getDate() + (daysUntilFriday === 0 && estTime.getHours() >= 18 ? 7 : daysUntilFriday));
      targetDate.setHours(18, 0, 0, 0);
      
      const diff = targetDate.getTime() - estTime.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h`;
      }
      return `${hours}h ${minutes}m`;
    };

    setTimeUntilReset(calculateTimeUntilFriday());
    setIsTimeLoaded(true);
    const interval = setInterval(() => {
      setTimeUntilReset(calculateTimeUntilFriday());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

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

  // Mark animation as complete - only after data is loaded
  useEffect(() => {
    if (!hasAnimatedIn && isStatsLoaded && isTimeLoaded) {
      const timeout = setTimeout(() => {
        setHasAnimatedIn(true);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [hasAnimatedIn, isStatsLoaded, isTimeLoaded]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          if (data.recentPlayer) setFlappyRecentPlayer(data.recentPlayer);
          setFlappyPrizePool(parseFloat(data.prizePool) || 0);
          if (data.gamesThisWeek !== undefined) {
            setFlappyWeeklyPlays(data.gamesThisWeek);
          }
        }
      } catch (e) {
        console.error("Failed to fetch Flappy data:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Glaze Stack data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch prize info
        const prizeRes = await fetch('/api/cron/stack-tower-distribute');
        if (prizeRes.ok) {
          const prizeData = await prizeRes.json();
          setStackPrizePool(prizeData.totalPrize || 5);
        }
        
        // Fetch recent player and weekly plays
        const recentRes = await fetch('/api/games/stack-tower/recent');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.recentPlayer) {
            setStackRecentPlayer(recentData.recentPlayer);
          }
          if (recentData.gamesThisWeek !== undefined) {
            setStackWeeklyPlays(recentData.gamesThisWeek);
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
        const prizeRes = await fetch('/api/cron/donut-dash-distribute');
        if (prizeRes.ok) {
          const prizeData = await prizeRes.json();
          setDashPrizePool(prizeData.totalPrize || 5);
        }
        
        const recentRes = await fetch('/api/games/donut-dash/recent');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.recentPlayer) setDashRecentPlayer(recentData.recentPlayer);
          if (recentData.gamesThisWeek !== undefined) {
            setDashWeeklyPlays(recentData.gamesThisWeek);
          }
        }
      } catch (e) {
        console.error("Failed to fetch Dash data:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch total games played this week (fallback for individual game stats)
  useEffect(() => {
    const fetchGamesCount = async () => {
      try {
        const res = await fetch('/api/games/stats');
        if (res.ok) {
          const data = await res.json();
          setTotalGamesPlayed(data.totalGamesThisWeek || 0);
          // Only set individual game plays if not already set by individual API calls
          if (data.flappyGamesThisWeek !== undefined && flappyWeeklyPlays === 0) {
            setFlappyWeeklyPlays(data.flappyGamesThisWeek);
          }
          if (data.stackGamesThisWeek !== undefined && stackWeeklyPlays === 0) {
            setStackWeeklyPlays(data.stackGamesThisWeek);
          }
          if (data.dashGamesThisWeek !== undefined && dashWeeklyPlays === 0) {
            setDashWeeklyPlays(data.dashGamesThisWeek);
          }
          setIsStatsLoaded(true);
        }
      } catch (e) {
        console.error("Failed to fetch games stats:", e);
        setIsStatsLoaded(true); // Still show UI even if fetch fails
      }
    };
    fetchGamesCount();
    const interval = setInterval(fetchGamesCount, 60000);
    return () => clearInterval(interval);
  }, [flappyWeeklyPlays, stackWeeklyPlays, dashWeeklyPlays]);

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

  // Calculate total USDC prizes for display
  const totalUsdcPrizes = dashPrizePool + stackPrizePool;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        @keyframes gear-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .gear-spin { animation: gear-spin 8s linear infinite; }
        @keyframes tilePopIn {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-tilePopIn {
          animation: tilePopIn 0.3s ease-out forwards;
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          <div className="flex-shrink-0">
            <Header title="GAMES" user={context?.user} />

            {/* Top Stats Tiles - Dark zinc style matching How to Play */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* Games Played Tile */}
              <div 
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]"
              >
                {isStatsLoaded && (
                  <>
                    <div className="flex items-center gap-1">
                      <Gamepad2 className="w-3.5 h-3.5 text-white" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Total</span>
                    </div>
                    <div className="text-2xl font-bold text-white fade-in-up opacity-0" style={{ animationDelay: '0.1s' }}>{totalGamesPlayed.toLocaleString()}</div>
                  </>
                )}
              </div>

              {/* Ends In Tile */}
              <div 
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]"
              >
                {isTimeLoaded && (
                  <>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-white" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Resets In</span>
                    </div>
                    <div className="text-xl font-bold text-white fade-in-up opacity-0 whitespace-nowrap" style={{ animationDelay: '0.2s' }}>{timeUntilReset}</div>
                  </>
                )}
              </div>

              {/* Prize Tile */}
              <button
                onClick={() => setShowUsdPrize(!showUsdPrize)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all h-[80px] relative overflow-hidden hover:bg-zinc-800"
              >
                {isStatsLoaded && (
                  <>
                    {showUsdPrize ? (
                      <>
                        <div className="flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-white" />
                          <span className="text-[10px] text-gray-400 uppercase tracking-wide">Prizes</span>
                        </div>
                        <div className="text-2xl font-bold text-white fade-in-up opacity-0" style={{ animationDelay: '0.3s' }}>
                          ${totalUsdcPrizes}
                        </div>
                        <span className="absolute bottom-1 text-[7px] text-gray-500 animate-pulse">tap for tokens</span>
                      </>
                    ) : (
                      <div className="flex flex-col w-full h-full justify-center gap-1">
                        <div className="flex items-center justify-between w-full px-1">
                          <DonutCoin className="w-4 h-4" />
                          <span className="text-sm font-bold text-pink-400">{Math.floor(flappyPrizePool)}</span>
                        </div>
                        <div className="flex items-center justify-between w-full px-1">
                          <UsdcCoin className="w-4 h-4" />
                          <span className="text-sm font-bold text-green-400">${totalUsdcPrizes}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* Split Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setShowHelpDialog(true)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center gap-2 h-full">
                  <Gamepad2 className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                  <span className="text-xs font-semibold text-white">How to Play</span>
                  <HelpCircle className="w-3 h-3 text-gray-400" />
                </div>
              </button>

              <ShareRewardButton userFid={context?.user?.fid} compact />
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
              {isStatsLoaded && (
                <>
                  <div 
                    className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                    style={!hasAnimatedIn ? { opacity: 0, animationDelay: '0ms', animationFillMode: 'forwards' } : {}}
                  >
                    <FlappyDonutTile recentPlayer={flappyRecentPlayer} prizePool={flappyPrizePool.toLocaleString()} weeklyPlays={flappyWeeklyPlays} />
                  </div>
                  
                  <div 
                    className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                    style={!hasAnimatedIn ? { opacity: 0, animationDelay: '50ms', animationFillMode: 'forwards' } : {}}
                  >
                    <DonutDashTile recentPlayer={dashRecentPlayer} prizePool={dashPrizePool} weeklyPlays={dashWeeklyPlays} />
                  </div>
                  
                  <div 
                    className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                    style={!hasAnimatedIn ? { opacity: 0, animationDelay: '100ms', animationFillMode: 'forwards' } : {}}
                  >
                    <GlazeStackTile recentPlayer={stackRecentPlayer} prizePool={stackPrizePool} weeklyPlays={stackWeeklyPlays} />
                  </div>
                  
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i}
                      className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                      style={!hasAnimatedIn ? { opacity: 0, animationDelay: `${150 + i * 50}ms`, animationFillMode: 'forwards' } : {}}
                    >
                      <ComingSoonTile />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* How to Play Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setShowHelpDialog(false)}
          />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-white" />
                  How to Play
                </h2>
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-white" />
                    Flappy Donut
                  </h3>
                  <p className="text-gray-400 text-xs">
                    Tap to fly your donut through the rolling pins! Each gap passed = 1 point. 
                    Top 10 weekly scores split the <DonutCoin className="w-3 h-3 inline-block align-middle mx-0.5" /> DONUT prize pool.
                  </p>
                </div>

                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-white" />
                    Donut Dash
                  </h3>
                  <p className="text-gray-400 text-xs">
                    Hold to jetpack up, release to fall! Collect sprinkles and avoid obstacles. 
                    Top 10 weekly scores split the USDC prize pool. FREE to play!
                  </p>
                </div>

                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-white" />
                    Glaze Stack
                  </h3>
                  <p className="text-gray-400 text-xs">
                    Tap to drop blocks and stack them perfectly! Overhanging parts fall off. 
                    Top 10 weekly scores split the USDC prize pool. FREE to play!
                  </p>
                </div>

                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                  <h3 className="font-bold text-green-400 mb-2">🏆 Weekly Prizes</h3>
                  <p className="text-gray-400 text-xs">
                    All games reset every Friday at 6PM EST. Top 10 players on each leaderboard 
                    win prizes automatically sent to their wallet!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowHelpDialog(false)}
                className="mt-4 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
      
      <NavBar />
    </main>
  );
}