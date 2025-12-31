"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Clock, Layers, Rocket, ArrowRight } from "lucide-react";

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

// Donut color palette for randomization
const DONUT_COLORS = [
  '#F472B6', // pink
  '#FB923C', // orange
  '#A78BFA', // purple
  '#34D399', // green
  '#60A5FA', // blue
  '#FBBF24', // yellow
  '#F87171', // red
  '#2DD4BF', // teal
  '#E879F9', // fuchsia
  '#4ADE80', // lime
];

// Get random color from palette
const getRandomDonutColor = () => {
  return DONUT_COLORS[Math.floor(Math.random() * DONUT_COLORS.length)];
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

// Weekly Skin Tile - amber hero tile
function WeeklySkinTile({ skin, isLoading }: { skin: WeeklySkin | null; isLoading: boolean }) {
  const [timeLeft, setTimeLeft] = useState(getTimeUntilReset());
  
  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeUntilReset()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <button
      onClick={() => window.location.href = "/games/skin-market"}
      className="relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/80"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
    >
      {/* Large floating donut preview */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative skin-float">
          <div 
            className="w-20 h-20 rounded-full relative border-2 border-amber-400/30"
            style={{ backgroundColor: '#F59E0B', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-7 h-7 rounded-full bg-zinc-900 border-2 border-zinc-700" />
            </div>
            <div className="absolute top-2 left-3.5 w-3.5 h-3.5 rounded-full bg-white/25" />
          </div>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-base text-amber-400">Skin Market</span>
          </div>
          <div className="text-[10px] text-amber-200/60 mb-2">Limited edition donut skins</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Clock className="w-3 h-3 text-amber-400/60" />
            <span className="text-amber-400/80">Ends in {timeLeft}</span>
            <ArrowRight className="w-3 h-3 text-amber-500/30" />
            <span className="text-amber-400/80">View Skins</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Flappy Donut Game Tile - neutral white/zinc scheme with animated preview
function FlappyDonutTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [donutColor] = useState(() => getRandomDonutColor());
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPlayer(false);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Animated donut preview */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="flappy-donut-float relative">
          <svg className="absolute -left-5 top-1/2 wing-flap" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'right center' }}>
            <ellipse cx="10" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          <svg className="absolute -right-5 top-1/2 wing-flap-reverse" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'left center' }}>
            <ellipse cx="14" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          <svg width="72" height="72" viewBox="0 0 60 60">
            <ellipse cx="33" cy="35" rx="18" ry="12" fill="rgba(0,0,0,0.15)" />
            <circle cx="30" cy="30" r="20" fill={donutColor} stroke="rgba(0,0,0,0.2)" strokeWidth="2"/>
            <circle cx="30" cy="30" r="6" fill="#1a1a1a" stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
            <circle cx="24" cy="24" r="4" fill="rgba(255,255,255,0.3)"/>
          </svg>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Flappy Donut</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Tap to fly, dodge rolling pins!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">{prizePool} 🍩</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full" />}
                  @{recentPlayer.username} scored {recentPlayer.score}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Glaze Stack Game Tile - neutral white/zinc scheme with animated preview
function GlazeStackTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [donutColor] = useState(() => getRandomDonutColor());
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPlayer(false);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-2"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Floating glaze box stack preview */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="stack-float relative flex flex-col-reverse items-center gap-0.5">
          {['#FFE4EC', '#FFDEE8', '#FFD8E4', '#FFD2E0', '#FFCCDC'].map((color, i) => (
            <div
              key={i}
              className="rounded-sm relative overflow-hidden"
              style={{
                width: `${56 - i * 6}px`,
                height: '12px',
                backgroundColor: color,
                boxShadow: `0 2px 4px rgba(0,0,0,0.2)`,
              }}
            >
              <div 
                className="absolute inset-y-0.5 left-0.5 right-0.5 rounded-[2px] flex items-center justify-center gap-0.5"
                style={{ backgroundColor: 'rgba(30, 20, 25, 0.8)' }}
              >
                {[...Array(Math.max(1, 3 - Math.floor(i / 2)))].map((_, j) => (
                  <div
                    key={j}
                    className="rounded-full relative"
                    style={{ width: '8px', height: '8px', backgroundColor: donutColor }}
                  >
                    <div 
                      className="absolute rounded-full"
                      style={{
                        width: '2.5px',
                        height: '2.5px',
                        backgroundColor: 'rgba(30, 20, 25, 0.9)',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Glaze Stack</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Stack boxes, don't let them fall!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">{prizePool} 🍩</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full" />}
                  @{recentPlayer.username} scored {recentPlayer.score}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Donut Dash Game Tile - neutral white/zinc scheme with animated preview
function DonutDashTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [donutColor] = useState(() => getRandomDonutColor());
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPlayer(false);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/donut-dash"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Donut with jetpack preview */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="donut-dash-float relative">
          <svg width="75" height="75" viewBox="0 0 70 70">
            {/* Jetpack */}
            <rect x="10" y="26" width="12" height="22" rx="2" fill="#444" />
            <rect x="12" y="28" width="8" height="18" rx="1" fill="#666" />
            {/* Flame */}
            <path d="M16 48 L10 62 L22 48 Z" fill="url(#flameGrad)" className="flame-flicker" />
            <defs>
              <linearGradient id="flameGrad" x1="16" y1="48" x2="16" y2="62" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="50%" stopColor="#FF6B00" />
                <stop offset="100%" stopColor="#FF000000" />
              </linearGradient>
            </defs>
            {/* Donut body */}
            <circle cx="40" cy="35" r="22" fill={donutColor} />
            {/* Donut hole */}
            <circle cx="40" cy="35" r="8" fill="#1a1a2e" />
            {/* Highlight */}
            <circle cx="33" cy="28" r="5" fill="rgba(255,255,255,0.3)" />
          </svg>
          {/* Motion lines */}
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
            <div className="w-4 h-0.5 bg-white/40 rounded motion-line-1" />
            <div className="w-6 h-0.5 bg-white/30 rounded motion-line-2" />
            <div className="w-3 h-0.5 bg-white/40 rounded motion-line-3" />
          </div>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Donut Dash</span>
            <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Jetpack through, collect sprinkles!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">{prizePool} 🍩</span>
            {recentPlayer && (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3 h-3 rounded-full" />}
                  @{recentPlayer.username} scored {recentPlayer.score}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Coming Soon Tile - matches about page style
function ComingSoonTile() {
  return (
    <div 
      className="relative w-full rounded-2xl border-2 border-white/10 overflow-hidden opacity-50"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}
    >
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Settings className="w-16 h-16 text-zinc-800 gear-spin" />
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
  
  // Flappy Donut state
  const [flappyRecentPlayer, setFlappyRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingFlappy, setIsLoadingFlappy] = useState(true);
  const [flappyPrizePool, setFlappyPrizePool] = useState<string>("0");
  
  // Glaze Stack state
  const [stackRecentPlayer, setStackRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingStack, setIsLoadingStack] = useState(true);
  const [stackPrizePool, setStackPrizePool] = useState<string>("0");
  
  // Donut Dash state
  const [dashRecentPlayer, setDashRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingDash, setIsLoadingDash] = useState(true);
  const [dashPrizePool, setDashPrizePool] = useState<string>("0");
  
  // Skin market state
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

  // Fetch Flappy Donut data
  useEffect(() => {
    const fetchFlappyData = async () => {
      setIsLoadingFlappy(true);
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          if (data.recentPlayer) {
            setFlappyRecentPlayer(data.recentPlayer);
          }
          setFlappyPrizePool(data.prizePool || "0");
        } else {
          console.error("Flappy API returned:", res.status);
        }
      } catch (e) {
        console.error("Failed to fetch Flappy data:", e);
      } finally {
        setIsLoadingFlappy(false);
      }
    };
    fetchFlappyData();
    const interval = setInterval(fetchFlappyData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Glaze Stack data
  useEffect(() => {
    const fetchStackData = async () => {
      setIsLoadingStack(true);
      try {
        const res = await fetch('/api/games/stack-tower/leaderboard');
        if (res.ok) {
          const data = await res.json();
          setStackPrizePool(parseFloat(data.prizePool || "0").toFixed(2));
          if (data.recentPlayer) {
            setStackRecentPlayer({
              username: data.recentPlayer.username,
              score: data.recentPlayer.score,
              pfpUrl: data.recentPlayer.pfpUrl,
            });
          }
        } else {
          console.error("Stack API returned:", res.status);
        }
      } catch (e) {
        console.error("Failed to fetch Glaze Stack data:", e);
      } finally {
        setIsLoadingStack(false);
      }
    };
    fetchStackData();
    const interval = setInterval(fetchStackData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Donut Dash data
  useEffect(() => {
    const fetchDashData = async () => {
      setIsLoadingDash(true);
      try {
        // Fetch prize pool from distribute endpoint
        const prizeRes = await fetch('/api/games/donut-dash/distribute');
        if (prizeRes.ok) {
          const prizeData = await prizeRes.json();
          const poolValue = prizeData.prizePoolFormatted?.replace(' DONUT', '') || "0";
          setDashPrizePool(poolValue);
        }
        
        // Fetch most recent score from leaderboard
        const res = await fetch('/api/games/donut-dash/leaderboard');
        if (res.ok) {
          const data = await res.json();
          // Find the most recent entry by looking at all entries
          if (data.leaderboard && data.leaderboard.length > 0) {
            // The leaderboard is sorted by score, but we want most recent
            // For now just show the top scorer as "recent" since we don't have timestamp
            const recent = data.leaderboard[0];
            setDashRecentPlayer({
              username: recent.username || recent.displayName || `${recent.address?.slice(0,6)}...`,
              score: recent.score,
              pfpUrl: recent.pfpUrl,
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch Donut Dash data:", e);
      } finally {
        setIsLoadingDash(false);
      }
    };
    fetchDashData();
    const interval = setInterval(fetchDashData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch skin data
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
  const userHandle = context?.user?.username ? `@${context.user.username}` : "";
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
        @keyframes stack-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .stack-float { animation: stack-float 2s ease-in-out infinite; }
        @keyframes skin-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .skin-float { animation: skin-float 2.5s ease-in-out infinite; }
        @keyframes wing-flap { 0%, 100% { transform: translateY(-50%) rotate(-10deg) scaleY(0.8); } 50% { transform: translateY(-50%) rotate(10deg) scaleY(1); } }
        .wing-flap { animation: wing-flap 0.2s ease-in-out infinite; }
        @keyframes wing-flap-reverse { 0%, 100% { transform: translateY(-50%) rotate(10deg) scaleY(0.8); } 50% { transform: translateY(-50%) rotate(-10deg) scaleY(1); } }
        .wing-flap-reverse { animation: wing-flap-reverse 0.2s ease-in-out infinite; }
        @keyframes donut-dash-float { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-8px) rotate(5deg); } }
        .donut-dash-float { animation: donut-dash-float 1s ease-in-out infinite; }
        @keyframes motion-line { 0% { opacity: 0.6; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-10px); } }
        .motion-line-1 { animation: motion-line 0.5s ease-out infinite; }
        .motion-line-2 { animation: motion-line 0.5s ease-out infinite 0.1s; }
        .motion-line-3 { animation: motion-line 0.5s ease-out infinite 0.2s; }
        @keyframes flame-flicker { 0%, 100% { opacity: 1; transform: scaleY(1); } 50% { opacity: 0.8; transform: scaleY(0.8); } }
        .flame-flicker { animation: flame-flicker 0.1s ease-in-out infinite; transform-origin: top center; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header */}
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

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef} 
            className="flex-1 overflow-y-auto overflow-x-hidden games-scroll"
            style={{ 
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
            }}
          >
            <div className="space-y-3 pb-4">
              <WeeklySkinTile skin={weeklySkin} isLoading={isLoadingSkin} />
              <FlappyDonutTile recentPlayer={flappyRecentPlayer} prizePool={flappyPrizePool} isLoading={isLoadingFlappy} />
              <GlazeStackTile recentPlayer={stackRecentPlayer} prizePool={stackPrizePool} isLoading={isLoadingStack} />
              <DonutDashTile recentPlayer={dashRecentPlayer} prizePool={dashPrizePool} isLoading={isLoadingDash} />
              {[...Array(3)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}