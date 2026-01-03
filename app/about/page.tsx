"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Sparkles, ArrowRight, Dices, TrendingUp, Link2, Coins, Flame } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

// DONUT token address on Base
const DONUT_TOKEN = "0x7A5457f5A05a20008830f0d673e49655C5528f95";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// Base RPC endpoints with fallbacks
const BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
];

// ERC20 balanceOf ABI fragment
const BALANCE_OF_ABI = "0x70a08231";

// Fetch burned DONUT balance with fallbacks
async function fetchBurnedBalance(): Promise<bigint> {
  const paddedAddress = DEAD_ADDRESS.slice(2).padStart(64, '0');
  const data = BALANCE_OF_ABI + paddedAddress;
  
  for (const rpc of BASE_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: DONUT_TOKEN, data }, 'latest']
        })
      });
      
      const result = await response.json();
      if (result.result) {
        return BigInt(result.result);
      }
    } catch (e) {
      console.warn(`RPC ${rpc} failed:`, e);
      continue;
    }
  }
  
  return 0n;
}

// Format large numbers with commas
function formatBurnedAmount(amount: bigint): string {
  // DONUT has 18 decimals
  const value = Number(amount) / 1e18;
  return Math.floor(value).toLocaleString('en-US');
}

// Falling Sprinkles Animation Component
function FallingSprinkles() {
  const sprinkles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: `${10 + (i * 12) % 80}%`,
    delay: `${i * 0.4}s`,
    duration: `${3 + (i % 3)}s`,
    size: 12 + (i % 3) * 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {sprinkles.map((s) => (
        <div
          key={s.id}
          className="absolute animate-fall"
          style={{
            left: s.left,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        >
          <span 
            className="rounded-full overflow-hidden inline-flex items-center justify-center ring-1 ring-zinc-500/50"
            style={{ width: s.size, height: s.size }}
          >
            <img src="/media/icon.png" alt="" className="w-full h-full object-cover opacity-40" />
          </span>
        </div>
      ))}
    </div>
  );
}

// Burn Counter Tile Component
function BurnCounterTile({ burnedAmount, isLoading }: { burnedAmount: bigint; isLoading: boolean }) {
  const [displayAmount, setDisplayAmount] = useState(0);
  const targetAmount = Number(burnedAmount) / 1e18;
  
  // Animated counter effect
  useEffect(() => {
    if (isLoading || targetAmount === 0) return;
    
    const startAmount = Math.max(0, targetAmount - 1000); // Start 1000 behind for animation
    const duration = 2000; // 2 second animation
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startAmount + (targetAmount - startAmount) * eased;
      setDisplayAmount(Math.floor(current));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }, [targetAmount, isLoading]);

  // Slow increment effect (simulates live burning)
  useEffect(() => {
    if (isLoading || displayAmount === 0) return;
    
    const interval = setInterval(() => {
      setDisplayAmount(prev => prev + Math.floor(Math.random() * 3) + 1);
    }, 2000 + Math.random() * 3000);
    
    return () => clearInterval(interval);
  }, [isLoading, displayAmount]);

  return (
    <div
      className="burn-counter-tile relative w-full rounded-2xl border-2 border-green-500/50 overflow-hidden"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)' }}
    >
      {/* Falling sprinkles background */}
      <FallingSprinkles />
      
      <div className="relative z-10 p-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flame className="w-5 h-5 text-green-400" />
            <span className="font-bold text-sm text-green-400 uppercase tracking-wide">DONUT Burned</span>
            <Flame className="w-5 h-5 text-green-400" />
          </div>
          
          <div className="font-mono text-3xl font-bold text-white mb-1">
            {isLoading ? (
              <span className="text-green-400/50">Loading...</span>
            ) : (
              <span className="tabular-nums">{displayAmount.toLocaleString('en-US')}</span>
            )}
          </div>
          
          <div className="text-[10px] text-green-200/60">
            Permanently removed from circulation
          </div>
        </div>
      </div>
    </div>
  );
}

// Coin image component for DONUT
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover scale-[1.7]" />
  </span>
);

// Coin image component for PEEPLES
const PeeplesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/peeples_logo.png" alt="PEEPLES" className="w-full h-full object-cover scale-[1.7]" />
  </span>
);

// Coin image component for ECO
const EcoCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/eco_1.png" alt="ECO" className="w-full h-full object-cover scale-[1.2]" />
  </span>
);

// Donut Info Tile Component
function DonutInfoTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="donut-tile relative w-full rounded-2xl border-2 border-pink-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(219,39,119,0.1) 100%)' }}
    >
      {/* Large background donut coin logo */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover scale-[1.7]" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-pink-400">What is $DONUT</span>
          </div>
          <div className="text-[10px] text-pink-200/60 mb-2">Store-of-value token on Base</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-pink-400">Dutch Auction</span>
            <ArrowRight className="w-3 h-3 text-pink-500/50" />
            <span className="text-pink-400">Mine DONUT</span>
            <ArrowRight className="w-3 h-3 text-pink-500/50" />
            <span className="text-pink-400">LP Growth</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Sprinkles Info Tile Component
function SprinklesInfoTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sprinkles-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background sprinkles coin logo */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/media/icon.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">What is $SPRINKLES</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Companion token to $DONUT</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-white/80">Pay DONUT</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Mine SPRINKLES</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Sticky LP</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Revenue Flow Tile Component
function RevenueFlowTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="revenue-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background coins symbol */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Coins className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">Sprinkles App Revenue Flow</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">See where miner & game fees go</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <div className="flex items-center gap-1 text-pink-400">
              <Dices className="w-3 h-3" />
              <span>Games</span>
            </div>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <div className="flex items-center gap-1 text-green-400">
              <TrendingUp className="w-3 h-3" />
              <span>LP</span>
            </div>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <div className="flex items-center gap-1 text-white">
              <Sparkles className="w-3 h-3" />
              <span>Stakers</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// Links & Contracts Tile Component
function LinksContractsTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="links-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background chain symbol */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Link2 className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">Links & Contracts</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Smart contracts & useful links</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-white/80">Contracts</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Socials</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Resources</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Donut Dashboard Tile Component
function DonutDashboardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="donut-dashboard-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background donut coin logo */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover scale-[1.7]" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">Donut Dashboard</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">View Dune analytics & on-chain data</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-white/80">TVL</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Volume</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Holders</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Sprinkles Dashboard Tile Component
function SprinklesDashboardTile({ showComingSoon, onClick }: { showComingSoon: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sprinkles-dashboard-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] opacity-60"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background sprinkles coin logo - faded */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 opacity-30">
          <img src="/media/icon.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left relative">
          {/* Coming Soon Message */}
          <div className={`absolute inset-0 flex items-center transition-opacity duration-300 ${showComingSoon ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <span className="font-bold text-base text-gray-400">COMING SOON</span>
          </div>
          
          {/* Normal Content */}
          <div className={`transition-opacity duration-300 ${showComingSoon ? "opacity-0" : "opacity-100"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-base text-gray-500">Sprinkles Dashboard</span>
            </div>
            <div className="text-[10px] text-gray-600 mb-2">View Dune analytics & on-chain data</div>
            
            <div className="flex items-center gap-3 text-[9px]">
              <span className="text-gray-600">TVL</span>
              <ArrowRight className="w-3 h-3 text-gray-700" />
              <span className="text-gray-600">Volume</span>
              <ArrowRight className="w-3 h-3 text-gray-700" />
              <span className="text-gray-600">Holders</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function AboutPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [burnedAmount, setBurnedAmount] = useState<bigint>(0n);
  const [isBurnLoading, setIsBurnLoading] = useState(true);

  // Fetch burned DONUT amount
  useEffect(() => {
    const fetchBurned = async () => {
      setIsBurnLoading(true);
      try {
        const amount = await fetchBurnedBalance();
        setBurnedAmount(amount);
      } catch (e) {
        console.error("Failed to fetch burned amount:", e);
      }
      setIsBurnLoading(false);
    };
    
    fetchBurned();
    // Refresh every 5 minutes
    const interval = setInterval(fetchBurned, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
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

  // Mark animation as complete
  useEffect(() => {
    if (!hasAnimatedIn) {
      const timeout = setTimeout(() => {
        setHasAnimatedIn(true);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [hasAnimatedIn]);

  // Handle scroll fade
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

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .about-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .about-scroll::-webkit-scrollbar {
          display: none;
        }
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
        @keyframes fall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(120px) rotate(180deg);
            opacity: 0;
          }
        }
        .animate-fall {
          animation: fall linear infinite;
        }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header */}
          <div className="flex-shrink-0">
            <Header title="INFO" user={context?.user} />

            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.addMiniApp();
                  } catch (e) {
                    console.error("Failed to add mini app:", e);
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>App Added</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/fOIgVq2bFKru/glazecorp" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/fOIgVq2bFKru/glazecorp", "_blank");
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
              >
                <DonutCoin className="h-4 w-4" />
                <span>Stake Donut</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts", "_blank");
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
              >
                <PeeplesCoin className="h-4 w-4" />
                <span>Pool To Mine</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/yetHcJ1rdN-n/franchiser" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/yetHcJ1rdN-n/franchiser", "_blank");
                  }
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-zinc-800 active:scale-[0.98]"
              >
                <EcoCoin className="h-4 w-4" />
                <span>Eco Tokens</span>
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden about-scroll"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            <div className="space-y-3 pb-4">
              {/* Burn Counter Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '0ms', animationFillMode: 'forwards' } : {}}
              >
                <BurnCounterTile burnedAmount={burnedAmount} isLoading={isBurnLoading} />
              </div>

              {/* What is $DONUT Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '50ms', animationFillMode: 'forwards' } : {}}
              >
                <DonutInfoTile onClick={() => window.location.href = "/about/donut"} />
              </div>

              {/* What is $SPRINKLES Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '100ms', animationFillMode: 'forwards' } : {}}
              >
                <SprinklesInfoTile onClick={() => window.location.href = "/about/sprinkles"} />
              </div>

              {/* Revenue Flow Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '150ms', animationFillMode: 'forwards' } : {}}
              >
                <RevenueFlowTile onClick={() => window.location.href = "/about/revenue"} />
              </div>

              {/* Links & Contracts Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '200ms', animationFillMode: 'forwards' } : {}}
              >
                <LinksContractsTile onClick={() => window.location.href = "/about/links-contracts"} />
              </div>

              {/* Donut Dashboard Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '250ms', animationFillMode: 'forwards' } : {}}
              >
                <DonutDashboardTile onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://dune.com/xyk/donut-company" });
                  } catch {
                    window.open("https://dune.com/xyk/donut-company", "_blank");
                  }
                }} />
              </div>

              {/* Sprinkles Dashboard Tile */}
              <div 
                className={!hasAnimatedIn ? 'animate-tilePopIn' : ''}
                style={!hasAnimatedIn ? { opacity: 0, animationDelay: '300ms', animationFillMode: 'forwards' } : {}}
              >
                <SprinklesDashboardTile 
                  showComingSoon={showComingSoon}
                  onClick={() => {
                    if (!showComingSoon) {
                      setShowComingSoon(true);
                      setTimeout(() => setShowComingSoon(false), 3000);
                    }
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}