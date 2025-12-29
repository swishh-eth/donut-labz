"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Sparkles, ArrowRight, Dices, TrendingUp, Link2, Coins, BarChart3 } from "lucide-react";

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

// Donut Circle Icon Component
function DonutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="black" />
    </svg>
  );
}

// Donut Info Tile Component
function DonutInfoTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="donut-tile relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-amber-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
    >
      {/* Large background donut symbol */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <DonutIcon className="w-28 h-28 text-amber-950/50" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <DonutIcon className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-base text-amber-400">What is $DONUT</span>
          </div>
          <div className="text-[10px] text-amber-200/60 mb-2">Store-of-value token on Base</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-amber-400">Dutch Auction</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">Mine DONUT</span>
            <ArrowRight className="w-3 h-3 text-amber-500/50" />
            <span className="text-amber-400">LP Growth</span>
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
      {/* Large background sparkles symbol */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Sparkles className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
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
            <Coins className="w-4 h-4 text-white" />
            <span className="font-bold text-base text-white">Sprinkles App Revenue Flow</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">See where miner & game fees go</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <div className="flex items-center gap-1 text-amber-400">
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
            <Link2 className="w-4 h-4 text-white" />
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

// Dune Dashboard Tile Component
function DuneDashboardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="dune-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      {/* Large background chart symbol */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <BarChart3 className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-white" />
            <span className="font-bold text-base text-white">Dune Dashboard</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">View analytics & on-chain data</div>
          
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

export default function AboutPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });

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

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

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
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold tracking-wide">INFO</h1>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage
                      src={userAvatarUrl || undefined}
                      alt={userDisplayName}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-zinc-800 text-white">
                      {initialsFrom(userDisplayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && (
                      <div className="text-xs text-gray-400">{userHandle}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                <DonutIcon className="h-4 w-4 text-amber-400" />
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
                <Coins className="h-4 w-4 text-amber-400" />
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
                <Sparkles className="h-4 w-4 text-amber-400" />
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
              {/* What is $DONUT Tile */}
              <DonutInfoTile onClick={() => window.location.href = "/about/donut"} />

              {/* What is $SPRINKLES Tile */}
              <SprinklesInfoTile onClick={() => window.location.href = "/about/sprinkles"} />

              {/* Revenue Flow Tile */}
              <RevenueFlowTile onClick={() => window.location.href = "/about/revenue"} />

              {/* Links & Contracts Tile */}
              <LinksContractsTile onClick={() => window.location.href = "/about/links-contracts"} />

              {/* Dune Dashboard Tile */}
              <DuneDashboardTile onClick={async () => {
                try {
                  await sdk.actions.openUrl({ url: "https://dune.com/chromium_donut_tech/donut-labs" });
                } catch {
                  window.open("https://dune.com/chromium_donut_tech/donut-labs", "_blank");
                }
              }} />
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}