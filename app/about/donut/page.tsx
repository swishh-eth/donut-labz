"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Pickaxe, Flame, Building, Code, TrendingUp, Users, Coins } from "lucide-react";
import { NavBar } from "@/components/nav-bar";

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
  const router = useRouter();
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
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Top fade overlay */}
        <div 
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: 0,
            height: "calc(env(safe-area-inset-top, 0px) + 70px)",
            background: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            zIndex: 5,
          }}
        />
        
        {/* Bottom fade overlay */}
        <div 
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: 0,
            height: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            zIndex: 5,
          }}
        />

        {/* Header */}
        <div className="flex-shrink-0 mb-3 relative z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-wide flex items-center gap-2">
                <span className="text-2xl">🍩</span>
                What is $DONUT
              </h1>
              <p className="text-[10px] text-gray-500">Store-of-value token on Base</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden page-scroll relative z-10"
          style={{ 
            WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, 
            maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` 
          }}
        >
          <div className="space-y-3 pb-8">
            {/* Overview */}
            <div className="rounded-xl p-4 border border-amber-500/50 bg-amber-500/10">
              <p className="text-sm text-gray-300 mb-3">
                $DONUT is a store-of-value token on Base, mined through a continuous Dutch auction instead of proof-of-work or staking.
              </p>
              <p className="text-sm text-gray-300">
                Auction revenue increases $DONUT's liquidity and scarcity.
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-amber-300">4/sec</div>
                <div className="text-[10px] text-gray-500">Start Rate</div>
              </div>
              <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-amber-300">30 days</div>
                <div className="text-[10px] text-gray-500">Halving</div>
              </div>
              <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-amber-300">0.01/s</div>
                <div className="text-[10px] text-gray-500">Tail Rate</div>
              </div>
            </div>

            {/* Revenue Split */}
            <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                DONUT Revenue Split
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">Previous Glazer</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">80%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">Treasury (LP buybacks)</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">15%</span>
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
              icon={<Pickaxe className="w-4 h-4 text-amber-400" />}
              title="How DONUT Mining Works"
            >
              <p>Only one active miner at a time, called the <span className="text-white font-semibold">King Glazer</span>.</p>
              <p className="mt-2">The right to mine is bought through a continuous Dutch auction:</p>
              <div className="pl-2 border-l border-amber-500/30 ml-1 space-y-1 mt-2">
                <p>• Price doubles after each purchase</p>
                <p>• Then decays to 0 over one hour</p>
                <p>• Anyone can purchase control at current price</p>
              </div>
            </Section>

            {/* Proof of Just-In-Time Stake */}
            <Section
              icon={<Flame className="w-4 h-4 text-amber-400" />}
              title="Proof of Just-In-Time Stake"
            >
              <p>ETH is "staked" only while controlling emissions.</p>
              <p>Profit if the next purchase pays more, lose if it pays less.</p>
              <p>Earn <span className="text-amber-400 font-semibold">$DONUT</span> the entire time you hold control.</p>
            </Section>

            {/* Treasury */}
            <Section
              icon={<Building className="w-4 h-4 text-amber-400" />}
              title="Treasury"
            >
              <p>Treasury ETH is used to buy and burn DONUT-WETH LP in the Blazery.</p>
              <p className="mt-2">Once sufficient liquidity is established, governance can decide to buy/burn DONUT directly or reinvest.</p>
            </Section>

            {/* Builder Codes */}
            <Section
              icon={<Code className="w-4 h-4 text-amber-400" />}
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
      <NavBar />
    </main>
  );
}