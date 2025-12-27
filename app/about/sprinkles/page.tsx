"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { formatEther } from "viem";
import { ArrowLeft, Pickaxe, Flame, Beaker, Trophy, Dices, MessageCircle, Timer, TrendingUp, Users, Coins, Sparkles } from "lucide-react";
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

export default function AboutSprinklesPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [burnedBalance, setBurnedBalance] = useState<string>("0");
  const [donutBurnedInLP, setDonutBurnedInLP] = useState<string>("0");

  // Fetch burned balances
  useEffect(() => {
    const fetchBurnedBalance = async () => {
      try {
        // Fetch SPRINKLES burned (dead address)
        const deadResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D',
                data: '0x70a08231000000000000000000000000000000000000000000000000000000000000dEaD'
              },
              'latest'
            ]
          })
        });
        
        // Fetch SPRINKLES in LP burn pool (0x710e042d4F13f5c649dBb1774A3695BFcAC253ce)
        const lpPoolResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_call',
            params: [
              {
                to: '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D',
                data: '0x70a08231000000000000000000000000710e042d4f13f5c649dbb1774a3695bfcac253ce'
              },
              'latest'
            ]
          })
        });

        const deadData = await deadResponse.json();
        const lpPoolData = await lpPoolResponse.json();
        
        let totalBurned = BigInt(0);
        
        if (deadData.result) {
          totalBurned += BigInt(deadData.result);
        }
        if (lpPoolData.result) {
          totalBurned += BigInt(lpPoolData.result);
        }
        
        const formatted = Math.floor(Number(formatEther(totalBurned))).toLocaleString();
        setBurnedBalance(formatted);
      } catch (error) {
        console.error('Failed to fetch burned balance:', error);
      }
    };

    const fetchDonutBurnedInLP = async () => {
      try {
        // Fetch DONUT balance in the LP burn pool (0x710e042d4F13f5c649dBb1774A3695BFcAC253ce)
        // DONUT token: 0x8cb68b0bc8a8f50a4f0b2BfC3e36e20c53450b1D
        const response = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: '0x8cb68b0bc8a8f50a4f0b2BfC3e36e20c53450b1D',
                data: '0x70a08231000000000000000000000000710e042d4f13f5c649dbb1774a3695bfcac253ce'
              },
              'latest'
            ]
          })
        });
        const data = await response.json();
        if (data.result) {
          const balanceBigInt = BigInt(data.result);
          const formatted = Math.floor(Number(formatEther(balanceBigInt))).toLocaleString();
          setDonutBurnedInLP(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch DONUT burned in LP:', error);
      }
    };

    fetchBurnedBalance();
    fetchDonutBurnedInLP();
    const interval = setInterval(() => {
      fetchBurnedBalance();
      fetchDonutBurnedInLP();
    }, 30000);
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
                <Sparkles className="w-5 h-5 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                What is $SPRINKLES
              </h1>
              <p className="text-[10px] text-gray-500">Companion token to $DONUT</p>
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
            <div className="rounded-xl p-4 border border-white/20 bg-white/5">
              <p className="text-sm text-gray-300 mb-3">
                $SPRINKLES is a companion token to $DONUT making $DONUT liquidity even stickier. Sprinkles must be mined by paying $DONUT in a separate dutch auction on the Sprinkles App.
              </p>
              <p className="text-white font-semibold text-sm">Max Supply: 210,000,000 SPRINKLES (10x DONUT)</p>
              <p className="text-gray-500 text-[10px] mt-1">10M preminted & seeded with 1,000 DONUT for permanent LP</p>
              <p className="text-gray-500 text-[10px]">500k preminted for Sprinkles Treasury</p>
            </div>

            {/* Burn Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-white/5 border border-white/20 rounded-xl">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="w-3 h-3 text-white" />
                  <span className="text-[10px] text-gray-400">SPRINKLES Burned</span>
                </div>
                <span className="text-lg font-bold text-white">{burnedBalance}</span>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] text-gray-400">DONUT Burned (LP)</span>
                </div>
                <span className="text-lg font-bold text-amber-400">🍩{donutBurnedInLP}</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 border border-white/20 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white">40/sec</div>
                <div className="text-[10px] text-gray-500">Start Rate</div>
              </div>
              <div className="bg-white/5 border border-white/20 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white">30 days</div>
                <div className="text-[10px] text-gray-500">Halving</div>
              </div>
              <div className="bg-white/5 border border-white/20 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-white">0.1/s</div>
                <div className="text-[10px] text-gray-500">Tail Rate</div>
              </div>
            </div>

            {/* Revenue Split */}
            <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-white" />
                SPRINKLES Revenue Split
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">Previous Miner</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">80%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/20">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-white" />
                    <span className="text-xs text-gray-300">Buy & Burn SPRINKLES</span>
                  </div>
                  <span className="text-sm font-bold text-white">10%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">Leaderboard Prizes</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">2.5%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-gray-300">LP Burn Reward Pool</span>
                  </div>
                  <span className="text-sm font-bold text-amber-400">2.5%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-300">Sprinkles App (Provider)</span>
                  </div>
                  <span className="text-sm font-bold text-gray-400">5%</span>
                </div>
              </div>
            </div>

            {/* How Mining Works */}
            <Section
              icon={<Pickaxe className="w-4 h-4 text-white" />}
              title="How SPRINKLES Mining Works"
            >
              <p>Same auction mechanics as DONUT, but you pay <span className="text-white font-semibold">$DONUT</span> instead of ETH.</p>
              <p className="mt-2">The right to mine is bought through a continuous Dutch auction:</p>
              <div className="pl-2 border-l border-white/20 ml-1 space-y-1 mt-2">
                <p>• Price doubles after each purchase</p>
                <p>• Then decays to 1 DONUT over one hour</p>
                <p>• Anyone can purchase control at current price</p>
              </div>
            </Section>

            {/* Proof of Just-In-Time Stake */}
            <Section
              icon={<Flame className="w-4 h-4 text-white" />}
              title="Proof of Just-In-Time Stake"
            >
              <p>DONUT is "staked" only while controlling emissions.</p>
              <p>Profit if the next purchase pays more, lose if it pays less.</p>
              <p>Earn <span className="text-white font-semibold">$SPRINKLES</span> the entire time you hold control.</p>
            </Section>

            {/* What is The Sprinkles App? */}
            <Section
              icon={<Beaker className="w-4 h-4 text-white" />}
              title="What is The Sprinkles App?"
            >
              <p>The Sprinkles App is an independent donut shop operating inside the $DONUT ecosystem.</p>
              <p>We build fun ways to interact with $DONUT and $SPRINKLES, including mining interfaces, games, and social features.</p>
              <p className="text-gray-500 italic mt-2">An onchain donut shop on Base.</p>
            </Section>

            {/* Leaderboard */}
            <Section
              icon={<Trophy className="w-4 h-4 text-amber-400" />}
              title="Leaderboard"
            >
              <p>Compete weekly on the Sprinkles weekly leaderboard for a share of the prize pool!</p>
              <p className="mt-2">Earn points by mining:</p>
              <div className="pl-2 border-l border-white/20 ml-1 space-y-1 mt-1">
                <p>• <span className="text-white font-semibold">Mine DONUT</span> = 2 points per mine</p>
                <p>• <span className="text-white font-semibold">Mine SPRINKLES</span> = 1 point per mine</p>
              </div>
              <p className="mt-3">Top 3 glazers split the weekly prize pool:</p>
              <div className="grid grid-cols-3 gap-2 text-center mt-2">
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">🥇 1st</div>
                  <div className="text-[10px] text-gray-400">50%</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">🥈 2nd</div>
                  <div className="text-[10px] text-gray-400">30%</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">🥉 3rd</div>
                  <div className="text-[10px] text-gray-400">20%</div>
                </div>
              </div>
              <p className="mt-2 text-gray-500 text-[10px]">Leaderboard resets every Friday at 12pm UTC. Prizes include ETH, DONUT, and SPRINKLES!</p>
            </Section>

            {/* Games */}
            <Section
              icon={<Dices className="w-4 h-4 text-white" />}
              title="Games"
            >
              <p>The Sprinkles App features onchain games where you can win ETH, DONUT, and SPRINKLES.</p>
              <p>All games are <span className="text-white font-semibold">100% onchain</span> and <span className="text-white font-semibold">provably fair</span> — every bet, spin, and outcome is recorded on Base and verifiable.</p>
              <div className="pl-2 border-l border-white/20 ml-1 space-y-1 mt-2">
                <p>• <span className="text-white">Donut Tower</span> — Climb levels to win big</p>
                <p>• <span className="text-white">Glaze Wheel</span> — Spin to win multipliers</p>
                <p>• <span className="text-white">Sugar Cubes</span> — Roll over/under dice</p>
                <p>• <span className="text-white">Bakery Mines</span> — Avoid bombs, cash out anytime</p>
                <p>• <span className="text-gray-500">Donut Slots</span> — Coming soon</p>
                <p>• <span className="text-gray-500">Keno</span> — Coming soon</p>
              </div>
            </Section>

            {/* Chat to Earn */}
            <Section
              icon={<MessageCircle className="w-4 h-4 text-white" />}
              title="Chat to Earn Sprinkles"
            >
              <p>Send onchain messages in the Chat tab to earn sprinkles points!</p>
              <p>Your earnings per message = <span className="text-white font-semibold">Multiplier × Neynar Score</span></p>
              <div className="mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <Timer className="w-3 h-3 text-white" />
                  <span className="text-[10px] text-white font-semibold">Halving Schedule</span>
                </div>
                <p className="text-[10px] text-gray-400">Multiplier halves every 30 days: 2x → 1x → 0.5x → 0.25x → 0 (ends)</p>
                <p className="text-[10px] text-gray-500 mt-1">Chat rewards are limited — earn while you can!</p>
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