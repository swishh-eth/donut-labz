"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Ticket, Clock, Coins, HelpCircle, X, Sparkles, Dices, Trophy, Lock, Bomb, Layers, Flame, Grid3X3, Users } from "lucide-react";

// Contract addresses - V5 contracts
const DONUT_DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
const DONUT_MINES_ADDRESS = "0xc5D771DaEEBCEdf8e7e53512eA533C9B07F8bE4f" as const;
const GLAZE_WHEEL_ADDRESS = "0xDd89E2535e460aDb63adF09494AcfB99C33c43d8" as const;
const DONUT_TOWER_ADDRESS = "0x59c140b50FfBe620ea8d770478A833bdF60387bA" as const;

// Create a public client for Base
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g'),
});

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

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
        top: '-20px',
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
  lastWinner?: { username: string; amount: string; pfpUrl?: string } | null;
  onClick: () => void;
}) {
  const [donuts, setDonuts] = useState<Array<{ id: number; delay: number; duration: number; left: number }>>([]);
  const [isHovered, setIsHovered] = useState(false);
  const idCounter = useRef(0);
  
  const isComingSoon = currentPot === 0 && totalTickets === 0;

  // Generate falling donuts
  useEffect(() => {
    const initialDonuts = Array.from({ length: 6 }, () => ({
      id: idCounter.current++,
      delay: Math.random() * 4,
      duration: 4 + Math.random() * 2,
      left: Math.random() * 85 + 5,
    }));
    setDonuts(initialDonuts);

    const interval = setInterval(() => {
      setDonuts(prev => {
        const newDonut = {
          id: idCounter.current++,
          delay: 0,
          duration: 4 + Math.random() * 2,
          left: Math.random() * 85 + 5,
        };
        return [...prev.slice(-9), newDonut];
      });
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="lottery-tile-main relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-300 active:scale-[0.98] mb-3"
      style={{ minHeight: '130px' }}
    >
      {/* Falling donuts container */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
        {donuts.map((donut) => (
          <FallingDonut key={donut.id} {...donut} />
        ))}
      </div>
      
      {/* Content */}
      <div className="relative z-10 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white">Daily Lottery</span>
              {isComingSoon ? (
                <span className="text-[8px] bg-zinc-700 text-gray-400 px-1.5 py-0.5 rounded-full font-bold">
                  SOON
                </span>
              ) : (
                <span className="text-[8px] bg-green-500 text-black px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <div className="text-[9px] text-amber-400/80">1 DONUT = 1 Ticket • Winner Takes All</div>
          </div>
          
          {/* Timer */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-gray-400">
              <Clock className="w-2.5 h-2.5" />
              <span className="text-[8px]">{isComingSoon ? "Launches" : "Draws"}</span>
            </div>
            <span className="text-xs font-bold text-white font-mono">{isComingSoon ? "Soon™" : timeRemaining}</span>
          </div>
        </div>
        
        {/* Main pot display */}
        <div className="flex items-center justify-between">
          <div className="text-left">
            <div className="text-[8px] text-gray-400 uppercase tracking-wider">Prize Pool</div>
            <div className="flex items-center gap-1.5">
              <span className="text-2xl">🍩</span>
              {isComingSoon ? (
                <span className="text-2xl font-black text-gray-500">Coming Soon</span>
              ) : (
                <span className="text-3xl font-black text-amber-400">
                  {currentPot.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
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
          
          {/* CTA */}
          <div className={`px-4 py-2.5 rounded-xl bg-white text-black font-bold text-sm ${isHovered ? 'scale-105' : ''} transition-transform`}>
            {isComingSoon ? "View Details →" : "Buy Tickets →"}
          </div>
        </div>
        
        {/* Last winner */}
        {lastWinner && !isComingSoon && (
          <div className="mt-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-center gap-2 text-[9px]">
              <span className="text-gray-500">Last winner:</span>
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
  isTest = false,
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
  isTest?: boolean;
  iconClassName?: string;
  lastWinner?: { username: string; amount: string; pfpUrl?: string } | null;
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
            {!comingSoon && isTest && (
              <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold border border-purple-500/30">
                TEST
              </span>
            )}
            {!comingSoon && isHot && !isTest && (
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold hot-pulse flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5" /> HOT
              </span>
            )}
            {!comingSoon && isNew && !isHot && !isTest && (
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold">
                NEW
              </span>
            )}
            {!comingSoon && !isNew && !isHot && !isTest && (
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
  const [diceLastWinner, setDiceLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [wheelLastWinner, setWheelLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [minesLastWinner, setMinesLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [towerLastWinner, setTowerLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  
  // Lottery state - Coming soon, no live data yet
  const [lotteryPot, setLotteryPot] = useState(0);
  const [lotteryTickets, setLotteryTickets] = useState(0);
  const [lotteryTimeRemaining, setLotteryTimeRemaining] = useState("--:--:--");
  const [lotteryLastWinner, setLotteryLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);

  // Lottery countdown timer - disabled for now (coming soon)
  // useEffect(() => {
  //   const now = new Date();
  //   const endOfDay = new Date(now);
  //   endOfDay.setUTCHours(24, 0, 0, 0);
  //   
  //   const updateTimer = () => {
  //     const nowMs = Date.now();
  //     const diff = Math.max(0, endOfDay.getTime() - nowMs);
  //     
  //     const hours = Math.floor(diff / (1000 * 60 * 60));
  //     const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  //     const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  //     
  //     setLotteryTimeRemaining(
  //       `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  //     );
  //   };
  //   
  //   updateTimer();
  //   const interval = setInterval(updateTimer, 1000);
  //   return () => clearInterval(interval);
  // }, []);

  // Fetch last winner for dice game
  useEffect(() => {
    const fetchLastDiceWinner = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 900n ? currentBlock - 900n : 0n;
        
        const logs = await publicClient.getLogs({
          address: DONUT_DICE_ADDRESS,
          event: {
            type: 'event',
            name: 'BetRevealed',
            inputs: [
              { name: 'betId', type: 'uint256', indexed: true },
              { name: 'player', type: 'address', indexed: true },
              { name: 'blockHash', type: 'bytes32', indexed: false },
              { name: 'result', type: 'uint8', indexed: false },
              { name: 'won', type: 'bool', indexed: false },
              { name: 'payout', type: 'uint256', indexed: false },
            ],
          },
          fromBlock,
          toBlock: 'latest',
        });

        let lastWin: { player: string; payout: bigint } | null = null;
        for (let i = logs.length - 1; i >= 0 && i >= logs.length - 50; i--) {
          const log = logs[i];
          if (log.args.won && log.args.player && log.args.payout) {
            lastWin = { player: log.args.player, payout: log.args.payout };
            break;
          }
        }
        
        if (!lastWin) { setDiceLastWinner(null); return; }
        
        try {
          const response = await fetch(`/api/profiles?addresses=${lastWin.player}`);
          if (response.ok) {
            const data = await response.json();
            const profile = data.profiles[lastWin.player.toLowerCase()];
            if (profile?.username) {
              setDiceLastWinner({
                username: profile.username,
                amount: `${parseFloat(formatUnits(lastWin.payout, 18)).toFixed(2)} 🍩`,
                pfpUrl: profile.pfpUrl || undefined
              });
              return;
            }
          }
        } catch {}
        
        setDiceLastWinner({
          username: `${lastWin.player.slice(0, 6)}...${lastWin.player.slice(-4)}`,
          amount: `${parseFloat(formatUnits(lastWin.payout, 18)).toFixed(2)} 🍩`
        });
      } catch { setDiceLastWinner(null); }
    };

    fetchLastDiceWinner();
    const interval = setInterval(fetchLastDiceWinner, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch last mines winner
  useEffect(() => {
    const fetchLastMinesWinner = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 900n ? currentBlock - 900n : 0n;
        
        const logs = await publicClient.getLogs({
          address: DONUT_MINES_ADDRESS,
          event: {
            type: 'event',
            name: 'GameCashedOut',
            inputs: [
              { type: 'uint256', name: 'gameId', indexed: true },
              { type: 'address', name: 'player', indexed: true },
              { type: 'uint256', name: 'tilesRevealed', indexed: false },
              { type: 'uint256', name: 'multiplier', indexed: false },
              { type: 'uint256', name: 'payout', indexed: false }
            ]
          },
          fromBlock,
          toBlock: 'latest'
        });

        if (logs.length === 0) { setMinesLastWinner(null); return; }

        const lastLog = logs[logs.length - 1];
        const player = lastLog.args.player as string;
        const payout = lastLog.args.payout as bigint;

        try {
          const response = await fetch(`/api/profiles?addresses=${player}`);
          if (response.ok) {
            const data = await response.json();
            const profile = data.profiles[player.toLowerCase()];
            if (profile?.username) {
              setMinesLastWinner({
                username: profile.username,
                amount: `${parseFloat(formatUnits(payout, 18)).toFixed(2)} 🍩`,
                pfpUrl: profile.pfpUrl || undefined
              });
              return;
            }
          }
        } catch {}
        
        setMinesLastWinner({
          username: `${player.slice(0, 6)}...${player.slice(-4)}`,
          amount: `${parseFloat(formatUnits(payout, 18)).toFixed(2)} 🍩`
        });
      } catch { setMinesLastWinner(null); }
    };

    fetchLastMinesWinner();
    const interval = setInterval(fetchLastMinesWinner, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch last wheel winner
  useEffect(() => {
    const fetchLastWheelWinner = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 900n ? currentBlock - 900n : 0n;
        
        const logs = await publicClient.getLogs({
          address: GLAZE_WHEEL_ADDRESS,
          event: {
            type: 'event',
            name: 'SpinRevealed',
            inputs: [
              { type: 'uint256', name: 'spinId', indexed: true },
              { type: 'address', name: 'player', indexed: true },
              { type: 'uint8', name: 'result', indexed: false },
              { type: 'uint256', name: 'multiplier', indexed: false },
              { type: 'uint256', name: 'payout', indexed: false }
            ]
          },
          fromBlock,
          toBlock: 'latest'
        });

        let lastWin: { player: string; payout: bigint } | null = null;
        for (let i = logs.length - 1; i >= 0 && i >= logs.length - 50; i--) {
          const log = logs[i];
          const payout = log.args.payout as bigint;
          const player = log.args.player as string;
          if (payout && payout > 0n && player) {
            lastWin = { player, payout };
            break;
          }
        }

        if (!lastWin) { setWheelLastWinner(null); return; }

        try {
          const response = await fetch(`/api/profiles?addresses=${lastWin.player}`);
          if (response.ok) {
            const data = await response.json();
            const profile = data.profiles[lastWin.player.toLowerCase()];
            if (profile?.username) {
              setWheelLastWinner({
                username: profile.username,
                amount: `${parseFloat(formatUnits(lastWin.payout, 18)).toFixed(2)} 🍩`,
                pfpUrl: profile.pfpUrl || undefined
              });
              return;
            }
          }
        } catch {}
        
        setWheelLastWinner({
          username: `${lastWin.player.slice(0, 6)}...${lastWin.player.slice(-4)}`,
          amount: `${parseFloat(formatUnits(lastWin.payout, 18)).toFixed(2)} 🍩`
        });
      } catch { setWheelLastWinner(null); }
    };

    fetchLastWheelWinner();
    const interval = setInterval(fetchLastWheelWinner, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch last tower winner
  useEffect(() => {
    const fetchLastTowerWinner = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 900n ? currentBlock - 900n : 0n;
        
        const logs = await publicClient.getLogs({
          address: DONUT_TOWER_ADDRESS,
          event: {
            type: 'event',
            name: 'GameCashedOut',
            inputs: [
              { type: 'uint256', name: 'gameId', indexed: true },
              { type: 'address', name: 'player', indexed: true },
              { type: 'uint8', name: 'levelReached', indexed: false },
              { type: 'uint256', name: 'multiplier', indexed: false },
              { type: 'uint256', name: 'payout', indexed: false }
            ]
          },
          fromBlock,
          toBlock: 'latest'
        });

        if (logs.length === 0) { setTowerLastWinner(null); return; }

        const lastLog = logs[logs.length - 1];
        const player = lastLog.args.player as string;
        const payout = lastLog.args.payout as bigint;

        try {
          const response = await fetch(`/api/profiles?addresses=${player}`);
          if (response.ok) {
            const data = await response.json();
            const profile = data.profiles[player.toLowerCase()];
            if (profile?.username) {
              setTowerLastWinner({
                username: profile.username,
                amount: `${parseFloat(formatUnits(payout, 18)).toFixed(2)} 🍩`,
                pfpUrl: profile.pfpUrl || undefined
              });
              return;
            }
          }
        } catch {}
        
        setTowerLastWinner({
          username: `${player.slice(0, 6)}...${player.slice(-4)}`,
          amount: `${parseFloat(formatUnits(payout, 18)).toFixed(2)} 🍩`
        });
      } catch { setTowerLastWinner(null); }
    };

    fetchLastTowerWinner();
    const interval = setInterval(fetchLastTowerWinner, 15 * 60 * 1000);
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

  // Games list - Tournaments is separate and shown right after lottery tile
  const games = [
    {
      id: "tower",
      title: "Donut Tower",
      description: "Climb levels to win some dough!",
      icon: Layers,
      comingSoon: false,
      isHot: true,
      lastWinner: towerLastWinner,
      onClick: () => window.location.href = "/tower",
    },
    {
      id: "wheel",
      title: "Glaze Wheel",
      description: "Spin to win some real glaze!",
      icon: WheelIcon,
      comingSoon: false,
      iconClassName: "icon-spin",
      lastWinner: wheelLastWinner,
      scrollDirection: "right" as const,
      onClick: () => router.push("/glaze-wheel"),
    },
    {
      id: "dice",
      title: "Sugar Cubes",
      description: "Roll over/under, set your multiplier!",
      icon: Dices,
      comingSoon: false,
      lastWinner: diceLastWinner,
      onClick: () => router.push("/dice"),
    },
    {
      id: "mines",
      title: "Bakery Mines",
      description: "Avoid the bombs, cash out anytime",
      icon: Bomb,
      comingSoon: false,
      lastWinner: minesLastWinner,
      scrollDirection: "right" as const,
      onClick: () => router.push("/mines"),
    },
    {
      id: "coinflip",
      title: "Coin Flip",
      description: "Heads or tails, 1.96x payout!",
      icon: Coins,
      comingSoon: false,
      isTest: true,
      lastWinner: null,
      onClick: () => window.location.href = "/coinflip",
    },
    {
      id: "keno",
      title: "Donut Keno",
      description: "Pick numbers, match the draw, win big!",
      icon: Grid3X3,
      comingSoon: false,
      isTest: true,
      lastWinner: null,
      onClick: () => window.location.href = "/keno",
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
        
        /* Lottery tile styles */
        @keyframes lottery-donut-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 0.6; }
          95% { opacity: 0.6; }
          100% { transform: translateY(160px) rotate(360deg); opacity: 0; }
        }
        @keyframes lottery-border {
          0%, 100% { border-color: rgba(251, 191, 36, 0.4); }
          50% { border-color: rgba(251, 191, 36, 0.6); }
        }
        .lottery-donut { animation: lottery-donut-fall linear infinite; }
        .lottery-tile-main { 
          background: rgb(24, 24, 27);
          animation: lottery-border 3s ease-in-out infinite;
        }
        .lottery-tile-main:hover {
          animation: none;
          border-color: rgba(251, 191, 36, 0.8) !important;
        }
        
        /* Tournaments tile styles */
        @keyframes trophy-bounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(-5deg); }
          75% { transform: translateY(-3px) rotate(5deg); }
        }
        @keyframes tournaments-border {
          0%, 100% { border-color: rgba(255, 255, 255, 0.3); }
          50% { border-color: rgba(255, 255, 255, 0.5); }
        }
        .trophy-bounce { animation: trophy-bounce 2s ease-in-out infinite; }
        .tournaments-tile {
          background: rgb(24, 24, 27);
          animation: tournaments-border 3s ease-in-out infinite;
        }
        .tournaments-tile:hover {
          animation: none;
          border-color: rgba(255, 255, 255, 0.7) !important;
        }
      `}</style>

      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold tracking-wide">GAMES</h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1 opacity-50">
                  <span className="text-[8px] text-gray-500 whitespace-nowrap">Earn GLAZE soon</span>
                </div>
                {context?.user && (
                  <Avatar className="h-7 w-7 border border-zinc-700">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>

            {/* How It Works */}
            <button onClick={() => setShowHelpDialog(true)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 mb-3 hover:bg-zinc-800 transition-colors">
              <div className="flex items-center justify-center gap-2">
                <Dices className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-xs font-semibold text-white">How Games Work</span>
                <HelpCircle className="w-3 h-3 text-gray-400" />
              </div>
            </button>
          </div>

          {/* Help Dialog */}
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

          {/* Scrollable Games List */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-2 pb-4">
              {/* Special Lottery Tile at the top */}
              <LotteryTile
                currentPot={lotteryPot}
                totalTickets={lotteryTickets}
                timeRemaining={lotteryTimeRemaining}
                lastWinner={lotteryLastWinner}
                onClick={() => window.location.href = "/games/lottery"}
              />
              
              {/* Tournaments Tile - Right under lottery */}
              <button
                onClick={() => window.location.href = "/games/tournaments"}
                className="tournaments-tile relative w-full rounded-xl p-4 border-2 overflow-hidden transition-all duration-300 active:scale-[0.98]"
                style={{ minHeight: '90px' }}
              >
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-600 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-white trophy-bounce" />
                  </div>
                  
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-white">Tournaments</span>
                      <span className="text-[8px] bg-green-500 text-black px-1.5 py-0.5 rounded-full font-bold">
                        LIVE
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Compete in Stream Challenges Hosted By Sprinkles!</div>
                  </div>
                  
                  <div className="text-amber-400 text-lg">→</div>
                </div>
              </button>
              
              {/* Regular game tiles */}
              {games.map((game) => (
                <GameTile
                  key={game.id}
                  title={game.title}
                  description={game.description}
                  icon={game.icon}
                  comingSoon={game.comingSoon}
                  isNew={(game as any).isNew}
                  isHot={(game as any).isHot}
                  isTest={(game as any).isTest}
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