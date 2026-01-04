"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Pickaxe, Flame, Building, Code, TrendingUp, Users, Coins } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type SectionProps = {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
};

// Donut coin image component
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover" />
  </span>
);

const Section = ({ icon, title, children }: SectionProps) => {
  return (
    <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      <div className="text-xs text-gray-400 space-y-1.5">
        {children}
      </div>
    </div>
  );
};

export default function AboutDonutPage() {
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

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .page-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .page-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex-shrink-0">
            <Header title="ABOUT DONUT" user={context?.user} />
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden page-scroll"
            style={{ 
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, 
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` 
            }}
          >
            <div className="space-y-3 pb-8">
              {/* Overview Card */}
              <div className="rounded-xl p-4 border border-pink-500/50 bg-gradient-to-br from-pink-500/10 to-pink-600/5">
                <div className="flex items-center gap-3 mb-3">
                  <DonutCoin className="w-10 h-10" />
                  <div>
                    <h2 className="text-lg font-bold text-white">$DONUT</h2>
                    <p className="text-[10px] text-pink-400">Store-of-value token on Base</p>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Mined through a continuous Dutch auction instead of proof-of-work or staking. Auction revenue increases $DONUT's liquidity and scarcity.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-pink-400">4/sec</div>
                  <div className="text-[10px] text-gray-500">Start Rate</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-pink-400">30 days</div>
                  <div className="text-[10px] text-gray-500">Halving</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-pink-400">0.01/s</div>
                  <div className="text-[10px] text-gray-500">Tail Rate</div>
                </div>
              </div>

              {/* Revenue Split */}
              <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-pink-400" />
                  DONUT Revenue Split
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-pink-400" />
                      <span className="text-xs text-gray-300">Previous Glazer</span>
                    </div>
                    <span className="text-sm font-bold text-pink-400">80%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-pink-400" />
                      <span className="text-xs text-gray-300">Treasury (LP buybacks)</span>
                    </div>
                    <span className="text-sm font-bold text-pink-400">15%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-300">Provider Fee</span>
                    </div>
                    <span className="text-sm font-bold text-gray-400">5%</span>
                  </div>
                </div>
              </div>

              {/* How Mining Works */}
              <Section
                icon={<Pickaxe className="w-4 h-4 text-pink-400" />}
                title="How DONUT Mining Works"
              >
                <p>Only one active miner at a time, called the <span className="text-white font-semibold">King Glazer</span>.</p>
                <p className="mt-2">The right to mine is bought through a continuous Dutch auction:</p>
                <div className="pl-2 border-l border-pink-500/30 ml-1 space-y-1 mt-2">
                  <p>• Price doubles after each purchase</p>
                  <p>• Then decays to 0 over one hour</p>
                  <p>• Anyone can purchase control at current price</p>
                </div>
              </Section>

              {/* Proof of Just-In-Time Stake */}
              <Section
                icon={<Flame className="w-4 h-4 text-pink-400" />}
                title="Proof of Just-In-Time Stake"
              >
                <p>ETH is "staked" only while controlling emissions.</p>
                <p>Profit if the next purchase pays more, lose if it pays less.</p>
                <p>Earn <span className="text-pink-400 font-semibold">$DONUT</span> the entire time you hold control.</p>
              </Section>

              {/* Treasury */}
              <Section
                icon={<Building className="w-4 h-4 text-pink-400" />}
                title="Treasury"
              >
                <p>Treasury ETH is used to buy and burn DONUT-WETH LP in the Blazery.</p>
                <p className="mt-2">Once sufficient liquidity is established, governance can decide to buy/burn DONUT directly or reinvest.</p>
              </Section>

              {/* Builder Codes */}
              <Section
                icon={<Code className="w-4 h-4 text-pink-400" />}
                title="Builder Codes"
              >
                <p>Anyone can host their own Donut Shop by deploying a frontend.</p>
                <p>Add your builder code to earn 5% of all purchases made through your shop.</p>
                <div className="mt-3 pt-2 border-t border-zinc-800">
                  <p className="text-[10px] text-gray-500 mb-2">Official Donut Shops:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-zinc-800 px-2 py-1 rounded text-[10px] text-white">GlazeCorp @heesh</span>
                    <span className="bg-zinc-800 px-2 py-1 rounded text-[10px] text-white">Pinky Glazer @bigbroc</span>
                  </div>
                </div>
              </Section>

              <div className="h-4" />
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}