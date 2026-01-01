"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Clock, Layers, Rocket, ArrowRight, Users, Award } from "lucide-react";

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

// Donut color palette - distinct primary colors that look very different
const DONUT_COLORS = [
  '#EF4444', // red
  '#3B82F6', // blue
  '#FACC15', // yellow
  '#EC4899', // pink
  '#FFFFFF', // white
  '#22C55E', // green
];

// Shuffle array and return first n unique items
const getUniqueRandomColors = (count: number): string[] => {
  const shuffled = [...DONUT_COLORS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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

// Achievements Tile - matches info page tile design
function AchievementsTile({ premiumCount }: { premiumCount: number }) {
  return (
    <button
      onClick={() => window.location.href = "/games/skin-market"}
      className="relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
    >
      {/* Large background users symbol - matching info page style */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <Users className="w-28 h-28 text-amber-900/80" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-base text-amber-400">Sprinkles Premium Arcade</span>
          </div>
          <div className="text-[10px] text-amber-200/60 mb-2">Complete Tasks To Unlock Skins For Each Game</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-amber-400">Burn Sprinkles</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">Customize Your Donut!</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Flappy Donut Game Tile - neutral white/zinc scheme with animated preview
function FlappyDonutTile({ recentPlayer, prizePool, isLoading, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean; donutColor: string }) {
  const [showPlayer, setShowPlayer] = useState(false);
  
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
      {/* Animated donut preview - fixed width container for alignment */}
      <div className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-center pointer-events-none">
        <div className="flappy-donut-float relative">
          <svg width="72" height="58" viewBox="0 0 72 58">
            <defs>
              <radialGradient id="wingGradLeft" cx="50%" cy="50%" r="80%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="70%" stopColor="rgba(240,240,255,0.9)" />
                <stop offset="100%" stopColor="rgba(200,200,220,0.8)" />
              </radialGradient>
              <radialGradient id="wingGradRight" cx="50%" cy="50%" r="80%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="70%" stopColor="rgba(240,240,255,0.9)" />
                <stop offset="100%" stopColor="rgba(200,200,220,0.8)" />
              </radialGradient>
            </defs>
            
            {/* Left wing */}
            <g className="wing-flap-left" style={{ transformOrigin: '22px 29px' }}>
              <path 
                d="M22 29 Q12 19 2 24 Q-1 29 6 34 Q14 37 22 32 Z" 
                fill="url(#wingGradLeft)" 
                stroke="rgba(180,180,200,0.6)" 
                strokeWidth="0.5"
              />
              <path d="M18 27 Q12 24 7 26" stroke="rgba(150,150,180,0.4)" strokeWidth="0.5" fill="none" />
              <path d="M17 31 Q10 29 5 31" stroke="rgba(150,150,180,0.4)" strokeWidth="0.5" fill="none" />
            </g>
            
            {/* Right wing */}
            <g className="wing-flap-right" style={{ transformOrigin: '50px 29px' }}>
              <path 
                d="M50 29 Q60 19 70 24 Q73 29 66 34 Q58 37 50 32 Z" 
                fill="url(#wingGradRight)" 
                stroke="rgba(180,180,200,0.6)" 
                strokeWidth="0.5"
              />
              <path d="M54 27 Q60 24 65 26" stroke="rgba(150,150,180,0.4)" strokeWidth="0.5" fill="none" />
              <path d="M55 31 Q62 29 67 31" stroke="rgba(150,150,180,0.4)" strokeWidth="0.5" fill="none" />
            </g>
            
            {/* Shadow */}
            <ellipse cx="38" cy="36" rx="12" ry="6" fill="rgba(0,0,0,0.15)" />
            
            {/* Donut body */}
            <circle cx="36" cy="29" r="15" fill={donutColor} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5"/>
            
            {/* Donut hole */}
            <circle cx="36" cy="29" r="5" fill="#1a1a1a" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"/>
            
            {/* Highlight */}
            <circle cx="31" cy="24" r="3" fill="rgba(255,255,255,0.3)"/>
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

// Glaze Stack Game Tile - neutral white/zinc scheme with animated stacking preview
function GlazeStackTile({ recentPlayer, prizePool, isLoading, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean; donutColor: string }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [stackPhase, setStackPhase] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPlayer(false);
    }
  }, [recentPlayer, isLoading]);
  
  // Animate the stacking sequence
  useEffect(() => {
    const interval = setInterval(() => {
      setStackPhase(prev => {
        const next = prev + 1;
        if (next === 6) {
          // Start fade out
          setIsVisible(false);
        } else if (next === 8) {
          // Reset and start fresh
          setIsVisible(true);
          return 0;
        }
        return next;
      });
    }, 450);
    return () => clearInterval(interval);
  }, []);
  
  const visibleBoxes = Math.min(stackPhase, 5);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-2"}
      className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '88px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Animated stacking glaze boxes preview - fixed width container for alignment */}
      <div className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-center pointer-events-none">
        <div 
          className="relative flex flex-col-reverse items-center"
          style={{ 
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.4s ease-out',
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const shouldShow = isVisible && i < visibleBoxes;
            const isNew = i === visibleBoxes - 1 && isVisible && stackPhase <= 5;
            const boxColors = ['#FFE4EC', '#FFDEE8', '#FFD8E4', '#FFD2E0', '#FFCCDC'];
            
            return (
              <div
                key={i}
                className="rounded-sm relative overflow-hidden"
                style={{
                  width: `${52 - i * 4}px`,
                  height: '12px',
                  marginBottom: i < 4 ? '2px' : '0',
                  backgroundColor: boxColors[i],
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  opacity: shouldShow ? 1 : 0,
                  transform: isNew ? 'translateY(-6px)' : 'translateY(0)',
                  transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
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
                      style={{ width: '7px', height: '7px', backgroundColor: donutColor }}
                    >
                      <div 
                        className="absolute rounded-full"
                        style={{
                          width: '2px',
                          height: '2px',
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
            );
          })}
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
function DonutDashTile({ recentPlayer, prizePool, isLoading, donutColor }: { recentPlayer: RecentPlayer | null; prizePool: number; isLoading: boolean; donutColor: string }) {
  const [showPlayer, setShowPlayer] = useState(false);
  
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
      {/* Donut with jetpack preview - fixed width container for alignment */}
      <div className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-center pointer-events-none">
        <div className="donut-dash-float relative">
          <svg width="70" height="65" viewBox="0 0 70 65">
            <defs>
              <linearGradient id="jetpackBody" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4a4a4a" />
                <stop offset="30%" stopColor="#6a6a6a" />
                <stop offset="70%" stopColor="#5a5a5a" />
                <stop offset="100%" stopColor="#3a3a3a" />
              </linearGradient>
              <linearGradient id="flameGradTile" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="40%" stopColor="#FF8C00" />
                <stop offset="70%" stopColor="#FF4500" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
              <linearGradient id="flameInner" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="30%" stopColor="#FFD700" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
            
            {/* Jetpack body */}
            <rect x="6" y="18" width="9" height="20" rx="2" fill="url(#jetpackBody)" />
            <rect x="8" y="20" width="5" height="16" rx="1" fill="#555" />
            <line x1="8" y1="24" x2="13" y2="24" stroke="#777" strokeWidth="0.5" />
            <line x1="8" y1="30" x2="13" y2="30" stroke="#777" strokeWidth="0.5" />
            
            {/* Jetpack connector */}
            <rect x="15" y="24" width="6" height="6" rx="1" fill="#4a4a4a" />
            <circle cx="18" cy="27" r="1.5" fill="#333" />
            
            {/* Nozzle */}
            <path d="M8 38 L6 42 L15 42 L13 38 Z" fill="#3a3a3a" />
            
            {/* Flames */}
            <ellipse cx="10.5" cy="50" rx="5" ry="10" fill="url(#flameGradTile)" className="flame-flicker" />
            <ellipse cx="10.5" cy="47" rx="2.5" ry="6" fill="url(#flameInner)" className="flame-flicker" />
            
            {/* Shadow */}
            <ellipse cx="42" cy="42" rx="14" ry="7" fill="rgba(0,0,0,0.15)" />
            
            {/* Donut body */}
            <circle cx="40" cy="30" r="18" fill={donutColor} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5"/>
            
            {/* Donut hole */}
            <circle cx="40" cy="30" r="6" fill="#1a1a2e" stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"/>
            
            {/* Highlight */}
            <circle cx="34" cy="24" r="4" fill="rgba(255,255,255,0.3)"/>
          </svg>
          
          {/* Motion lines */}
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
            <div className="w-4 h-0.5 bg-white/50 rounded motion-line-1" />
            <div className="w-6 h-0.5 bg-white/40 rounded motion-line-2" />
            <div className="w-3 h-0.5 bg-white/50 rounded motion-line-3" />
          </div>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-white" />
            <span className="font-bold text-base text-white">Donut Dash</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Jetpack through, collect sprinkles!</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <Trophy className="w-3 h-3 text-green-400" />
            <img 
              src="/coins/USDC_LOGO.png" 
              alt="USDC" 
              className="w-3 h-3 rounded-full"
            />
            <span className="text-green-400 font-medium">${prizePool} USDC PRIZE POOL</span>
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
      {/* Fixed width container for alignment */}
      <div className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-center pointer-events-none">
        <Settings className="w-14 h-14 text-zinc-800 gear-spin" />
      </div>
      <div className="relative z-10 p-4 pr-28">
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
  
  // Generate 3 unique random colors for the game tiles
  const [tileColors] = useState(() => getUniqueRandomColors(3));
  
  // Premium user count
  const [premiumCount, setPremiumCount] = useState(0);
  
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
  const [dashPrizePool, setDashPrizePool] = useState<number>(10); // USDC amount

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

  // Fetch premium user count
  useEffect(() => {
    fetch('/api/burn-stats')
      .then(r => r.json())
      .then(data => {
        if (data.premiumUsers !== undefined) setPremiumCount(data.premiumUsers);
      })
      .catch(console.error);
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
        // Fetch prize info from prize-distribute API
        const prizeRes = await fetch('/api/games/donut-dash/prize-distribute');
        if (prizeRes.ok) {
          const prizeData = await prizeRes.json();
          setDashPrizePool(prizeData.totalPrize || 10);
        }
        
        // Fetch recent player from recent endpoint
        const recentRes = await fetch('/api/games/donut-dash/recent');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.recentPlayer) {
            setDashRecentPlayer(recentData.recentPlayer);
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
        @keyframes wing-flap-left { 
          0%, 100% { transform: rotate(-8deg) scaleY(0.9); } 
          50% { transform: rotate(12deg) scaleY(1.1); } 
        }
        .wing-flap-left { animation: wing-flap-left 0.15s ease-in-out infinite; }
        @keyframes wing-flap-right { 
          0%, 100% { transform: rotate(8deg) scaleY(0.9); } 
          50% { transform: rotate(-12deg) scaleY(1.1); } 
        }
        .wing-flap-right { animation: wing-flap-right 0.15s ease-in-out infinite; }
        @keyframes donut-dash-float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-6px) rotate(3deg); } }
        .donut-dash-float { animation: donut-dash-float 0.8s ease-in-out infinite; }
        @keyframes motion-line { 0% { opacity: 0.6; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-12px); } }
        .motion-line-1 { animation: motion-line 0.4s ease-out infinite; }
        .motion-line-2 { animation: motion-line 0.4s ease-out infinite 0.1s; }
        .motion-line-3 { animation: motion-line 0.4s ease-out infinite 0.2s; }
        @keyframes flame-flicker { 
          0%, 100% { opacity: 1; transform: scaleY(1) scaleX(1); } 
          25% { opacity: 0.9; transform: scaleY(1.1) scaleX(0.9); }
          50% { opacity: 0.85; transform: scaleY(0.9) scaleX(1.1); } 
          75% { opacity: 0.95; transform: scaleY(1.05) scaleX(0.95); }
        }
        .flame-flicker { animation: flame-flicker 0.1s ease-in-out infinite; transform-origin: top center; }
        @keyframes thrust-particle-1 { 
          0% { opacity: 0.4; transform: translate(0, 0) scale(1); } 
          100% { opacity: 0; transform: translate(-8px, 10px) scale(0.5); } 
        }
        .thrust-particle-1 { animation: thrust-particle-1 0.5s ease-out infinite; }
        @keyframes thrust-particle-2 { 
          0% { opacity: 0.3; transform: translate(0, 0) scale(1); } 
          100% { opacity: 0; transform: translate(6px, 12px) scale(0.3); } 
        }
        .thrust-particle-2 { animation: thrust-particle-2 0.6s ease-out infinite 0.2s; }
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
              <AchievementsTile premiumCount={premiumCount} />
              <FlappyDonutTile recentPlayer={flappyRecentPlayer} prizePool={flappyPrizePool} isLoading={isLoadingFlappy} donutColor={tileColors[0]} />
              <GlazeStackTile recentPlayer={stackRecentPlayer} prizePool={stackPrizePool} isLoading={isLoadingStack} donutColor={tileColors[1]} />
              <DonutDashTile recentPlayer={dashRecentPlayer} prizePool={dashPrizePool} isLoading={isLoadingDash} donutColor={tileColors[2]} />
              {[...Array(3)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}