"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Clock, Layers } from "lucide-react";

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
      className="relative w-full rounded-2xl border-2 border-white/30 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/50 group"
      style={{ minHeight: '120px', background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)' }}
    >
      {/* Subtle shine effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
      
      {/* Large clipping donut preview */}
      <div className="absolute -right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative skin-float">
          {/* Amber glow */}
          <div 
            className="absolute inset-0 rounded-full blur-2xl opacity-50"
            style={{ backgroundColor: '#F59E0B', transform: 'scale(1.3)' }}
          />
          {/* Large donut */}
          <div 
            className="w-32 h-32 rounded-full relative border-2 border-amber-400/30 shadow-2xl"
            style={{ backgroundColor: '#F59E0B', boxShadow: '0 0 60px rgba(245, 158, 11, 0.4)' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-zinc-700" />
            </div>
            <div className="absolute top-4 left-6 w-6 h-6 rounded-full bg-white/25" />
          </div>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-white/10 border border-white/10">
              <Palette className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-white tracking-wide">Skin Market</span>
          </div>
          
          <div className="text-xs text-zinc-400">Limited Time Mints</div>
          
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-zinc-500">
            <Clock className="w-3 h-3" />
            <span>Ends in {timeLeft}</span>
          </div>
        </div>
      </div>
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

// Glaze Stack Game Tile
function GlazeStackTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-2"}
      className="relative w-full rounded-2xl border-2 border-pink-400/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-400/80"
      style={{ minHeight: '130px', background: 'linear-gradient(135deg, rgba(244,114,182,0.15) 0%, rgba(255,182,193,0.1) 100%)' }}
    >
      {/* Floating glaze box stack preview */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="stack-float relative flex flex-col-reverse items-center gap-0.5">
          {['#FFE4EC', '#FFDEE8', '#FFD8E4', '#FFD2E0', '#FFCCDC'].map((color, i) => (
            <div
              key={i}
              className="rounded-sm relative overflow-hidden"
              style={{
                width: `${52 - i * 6}px`,
                height: '12px',
                backgroundColor: color,
                boxShadow: `0 2px 4px rgba(0,0,0,0.2), 2px -2px 0 ${color}`,
              }}
            >
              {/* Window with donuts */}
              <div 
                className="absolute inset-y-0.5 left-1 right-1 rounded-[2px] flex items-center justify-center gap-1"
                style={{ backgroundColor: 'rgba(30, 20, 25, 0.8)' }}
              >
                {[...Array(Math.max(1, 3 - Math.floor(i / 2)))].map((_, j) => (
                  <div
                    key={j}
                    className="rounded-full relative"
                    style={{ 
                      width: '7px', 
                      height: '7px', 
                      backgroundColor: '#F472B6',
                    }}
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
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-base text-pink-400">Glaze Stack</span>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-pink-200/60 mb-2">Stack glaze boxes, don't let them fall!</div>
          
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

// Sprinkle Run Game Tile (Testing)
function SprinkleRunTile() {
  return (
    <button
      onClick={() => window.location.href = "/games/sprinkle-run"}
      className="relative w-full rounded-2xl border-2 border-cyan-400/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-cyan-400/80"
      style={{ minHeight: '130px', background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(236,72,153,0.1) 100%)' }}
    >
      {/* Running donut preview */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="sprinkle-run-float relative">
          {/* Donut body */}
          <svg width="65" height="65" viewBox="0 0 65 65">
            {/* Shadow */}
            <ellipse cx="35" cy="55" rx="22" ry="8" fill="rgba(0,0,0,0.2)" />
            {/* Body */}
            <circle cx="32" cy="32" r="24" fill="#FF69B4" stroke="rgba(0,0,0,0.2)" strokeWidth="2"/>
            {/* Hole */}
            <circle cx="32" cy="32" r="9" fill="#1a1a1a"/>
            {/* Highlight */}
            <circle cx="24" cy="24" r="5" fill="rgba(255,255,255,0.3)"/>
            {/* Sprinkles */}
            <rect x="18" y="15" width="8" height="3" rx="1" fill="#FF0000" transform="rotate(-30 22 16)"/>
            <rect x="38" y="18" width="8" height="3" rx="1" fill="#00FF00" transform="rotate(20 42 19)"/>
            <rect x="42" y="35" width="8" height="3" rx="1" fill="#0000FF" transform="rotate(60 46 36)"/>
            <rect x="15" y="38" width="8" height="3" rx="1" fill="#FFFF00" transform="rotate(-45 19 39)"/>
            <rect x="28" y="48" width="8" height="3" rx="1" fill="#FF00FF" transform="rotate(10 32 49)"/>
            {/* Eyes */}
            <circle cx="26" cy="28" r="4" fill="white"/>
            <circle cx="38" cy="28" r="4" fill="white"/>
            <circle cx="26" cy="28" r="2" fill="black"/>
            <circle cx="38" cy="28" r="2" fill="black"/>
          </svg>
          {/* Motion lines */}
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1">
            <div className="w-4 h-0.5 bg-cyan-400/60 rounded motion-line-1" />
            <div className="w-6 h-0.5 bg-pink-400/60 rounded motion-line-2" />
            <div className="w-3 h-0.5 bg-cyan-400/60 rounded motion-line-3" />
          </div>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-24">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="font-bold text-base text-cyan-400">Sprinkle Run</span>
            <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">TESTING</span>
          </div>
          <div className="text-[10px] text-cyan-200/60 mb-2">Endless runner - dodge & collect!</div>
          
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg w-fit">
            <span className="text-[9px] text-yellow-400 font-bold">⚠️ NOT REAL MONEY - FREE TO TEST</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-zinc-400">Swipe to move • Jump & slide to dodge</span>
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
  
  // Flappy Donut state
  const [flappyRecentPlayer, setFlappyRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingFlappy, setIsLoadingFlappy] = useState(true);
  const [flappyPrizePool, setFlappyPrizePool] = useState<string>("0");
  
  // Glaze Stack state
  const [stackRecentPlayer, setStackRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingStack, setIsLoadingStack] = useState(true);
  const [stackPrizePool, setStackPrizePool] = useState<string>("0");
  
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
          setFlappyRecentPlayer(data.recentPlayer);
          setFlappyPrizePool(data.prizePool || "0");
        }
      } catch (e) {
        console.error("Failed to fetch Flappy data:", e);
      } finally {
        setIsLoadingFlappy(false);
      }
    };
    fetchFlappyData();
    const interval = setInterval(fetchFlappyData, 30000);
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
        }
      } catch (e) {
        console.error("Failed to fetch Glaze Stack data:", e);
      } finally {
        setIsLoadingStack(false);
      }
    };
    fetchStackData();
    const interval = setInterval(fetchStackData, 30000);
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
        @keyframes skin-glow { 0%, 100% { box-shadow: 0 0 20px currentColor; } 50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; } }
        .skin-animated-glow { animation: skin-glow 2s ease-in-out infinite; }
        @keyframes scroll-donuts { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-scroll-donuts { animation: scroll-donuts 20s linear infinite; }
        @keyframes sprinkle-run-float { 0%, 100% { transform: translateY(0) translateX(0); } 25% { transform: translateY(-3px) translateX(2px); } 50% { transform: translateY(0) translateX(0); } 75% { transform: translateY(3px) translateX(-2px); } }
        .sprinkle-run-float { animation: sprinkle-run-float 0.4s ease-in-out infinite; }
        @keyframes motion-line { 0% { opacity: 0.6; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-10px); } }
        .motion-line-1 { animation: motion-line 0.5s ease-out infinite; }
        .motion-line-2 { animation: motion-line 0.5s ease-out infinite 0.1s; }
        .motion-line-3 { animation: motion-line 0.5s ease-out infinite 0.2s; }
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
              <FlappyDonutTile recentPlayer={flappyRecentPlayer} prizePool={flappyPrizePool} isLoading={isLoadingFlappy} />
              <GlazeStackTile recentPlayer={stackRecentPlayer} prizePool={stackPrizePool} isLoading={isLoadingStack} />
              <SprinkleRunTile />
              {[...Array(3)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}