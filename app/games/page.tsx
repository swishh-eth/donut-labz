"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Ticket, Clock, Coins, HelpCircle, X, Sparkles, Dices, Trophy, Lock, Bomb, Layers, Flame, Grid3X3 } from "lucide-react";

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
  const [showBuyTicketsDialog, setShowBuyTicketsDialog] = useState(false);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [diceLastWinner, setDiceLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [wheelLastWinner, setWheelLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [minesLastWinner, setMinesLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);
  const [towerLastWinner, setTowerLastWinner] = useState<{ username: string; amount: string; pfpUrl?: string } | null>(null);

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

  // Games list - Tower HOT, Coin Flip and Keno as TEST
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
      id: "lottery",
      title: "Daily Lottery",
      description: "Buy tickets for the daily DONUT pool",
      icon: Ticket,
      comingSoon: true,
      lastWinner: null,
    },
    {
      id: "tournaments",
      title: "Tournaments",
      description: "Compete in weekly mining tournaments",
      icon: Trophy,
      comingSoon: true,
      lastWinner: null,
    },
    {
      id: "slots",
      title: "Donut Slots",
      description: "Match symbols to win big",
      icon: Sparkles,
      comingSoon: true,
      lastWinner: null,
    },
    {
      id: "mystery",
      title: "Mystery Game",
      description: "Something special coming...",
      icon: HelpCircle,
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

            {/* Daily Pool Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center h-[72px]">
                <div className="flex items-center gap-1 mb-0.5">
                  <Ticket className="w-3 h-3 text-gray-500" />
                  <span className="text-[9px] text-gray-400 uppercase">Tickets</span>
                </div>
                <div className="text-lg font-bold text-gray-500">0</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center h-[72px]">
                <div className="flex items-center gap-1 mb-0.5">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-[9px] text-gray-400 uppercase">Resets In</span>
                </div>
                <div className="text-xs font-bold text-gray-500">Coming Soon</div>
              </div>
              <button onClick={() => setShowBuyTicketsDialog(true)} className="border border-amber-500 bg-gradient-to-br from-amber-600/20 to-orange-600/20 rounded-lg p-2 flex flex-col items-center justify-center text-center transition-all hover:from-amber-600/30 hover:to-orange-600/30 active:scale-[0.98] h-[72px]">
                <div className="flex items-center gap-1 mb-0.5">
                  <Coins className="w-3 h-3 text-amber-400" />
                  <span className="text-[9px] text-gray-400 uppercase">Prize Pool</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold text-amber-400">Coming Soon</span>
                  <span className="text-[8px] text-amber-400/80">tap for details</span>
                </div>
              </button>
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

          {/* Buy Tickets Dialog */}
          {showBuyTicketsDialog && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowBuyTicketsDialog(false)} />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button onClick={() => setShowBuyTicketsDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2"><Ticket className="w-4 h-4 text-amber-400" /> Daily Lottery</h2>
                  <div className="text-center py-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-2"><Lock className="w-6 h-6 text-gray-500" /></div>
                    <p className="text-sm font-semibold text-gray-400">Coming Soon</p>
                  </div>
                  <button onClick={() => setShowBuyTicketsDialog(false)} className="mt-3 w-full rounded-xl bg-zinc-800 py-2 text-sm font-bold text-gray-400 cursor-not-allowed" disabled>Buy Tickets (Coming Soon)</button>
                </div>
              </div>
            </div>
          )}

          {/* Scrollable Games List */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-2 pb-4">
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