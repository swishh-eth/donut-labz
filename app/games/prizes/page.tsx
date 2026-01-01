"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { ChevronLeft, Trophy, Zap, Clock, Gift, Sparkles, DollarSign, Rocket, ArrowRight } from "lucide-react";

export default function PrizesPage() {
  const readyRef = useRef(false);
  const [donutDashPrize, setDonutDashPrize] = useState(5);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch prize pool
  useEffect(() => {
    const fetchPrizes = async () => {
      try {
        const dashRes = await fetch('/api/games/donut-dash/prize-distribute');
        if (dashRes.ok) {
          const data = await dashRes.json();
          setDonutDashPrize(data.totalPrize || 5);
        }
      } catch (e) {
        console.error("Failed to fetch prizes:", e);
      }
    };
    fetchPrizes();
  }, []);

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .prizes-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .prizes-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-4 pb-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}
      >
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
          <button 
            onClick={() => window.location.href = "/games"}
            className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors mb-3"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back to Games</span>
          </button>
          <h1 className="text-2xl font-bold tracking-wide">WEEKLY PRIZES</h1>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto prizes-scroll space-y-3">
          
          {/* Total Prizes Tile */}
          <div 
            className="relative w-full rounded-2xl border-2 border-amber-500/50 overflow-hidden"
            style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%)' }}
          >
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <Trophy className="w-28 h-28 text-amber-900/80" />
            </div>
            <div className="relative z-10 p-4 pr-20">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-base text-amber-400">Total Weekly Prize Pool</span>
                </div>
                <div className="text-[10px] text-amber-200/60 mb-2">Treasury-funded rewards</div>
                <div className="flex items-center gap-2 mb-2">
                  <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-6 h-6 rounded-full" />
                  <span className="text-2xl font-bold text-white">${donutDashPrize}</span>
                  <span className="text-sm text-amber-400/60">USDC</span>
                </div>
              </div>
            </div>
          </div>

          {/* Free to Play Tile */}
          <div 
            className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
            style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
          >
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <Zap className="w-24 h-24 text-zinc-800" />
            </div>
            <div className="relative z-10 p-4 pr-20">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-5 h-5 text-white" />
                  <span className="font-bold text-base text-white">100% Free to Play</span>
                </div>
                <div className="text-[10px] text-white/60 mb-2">No entry fees, no hidden costs</div>
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="text-white/80">Play games</span>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <span className="text-white/80">Climb leaderboard</span>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <span className="text-white/80">Win USDC</span>
                </div>
              </div>
            </div>
          </div>

          {/* How Prizes Work Tile */}
          <div 
            className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
            style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
          >
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <Gift className="w-24 h-24 text-zinc-800" />
            </div>
            <div className="relative z-10 p-4 pr-20">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-5 h-5 text-white" />
                  <span className="font-bold text-base text-white">How Prizes Work</span>
                </div>
                <div className="text-[10px] text-white/60 mb-2">Treasury-funded community rewards</div>
                <div className="space-y-1 text-[9px] text-white/80">
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                    <span>Top 10 players win prizes each week</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                    <span>Auto-distributed via smart contracts</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                    <span>Your best score of the week counts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Reset Tile */}
          <div 
            className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
            style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
          >
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <Clock className="w-24 h-24 text-zinc-800" />
            </div>
            <div className="relative z-10 p-4 pr-20">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-white" />
                  <span className="font-bold text-base text-white">Weekly Reset</span>
                </div>
                <div className="text-[10px] text-white/60 mb-2">Leaderboards reset every week</div>
                <div className="bg-black/30 rounded-lg px-3 py-2 inline-block mb-1">
                  <div className="text-sm font-bold text-white">Friday 6:00 PM EST</div>
                  <div className="text-[9px] text-white/50">(11:00 PM UTC)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Prize Distribution Tile */}
          <div 
            className="relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
            style={{ minHeight: '120px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
          >
            <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <DollarSign className="w-24 h-24 text-zinc-800" />
            </div>
            <div className="relative z-10 p-4 pr-16">
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="w-5 h-5 text-white" />
                  <span className="font-bold text-base text-white">Donut Dash Prizes</span>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-4 h-4 rounded-full" />
                  <span className="text-sm text-green-400 font-bold">${donutDashPrize} USDC</span>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[9px] text-white/70">
                  <div className="flex justify-between"><span>🥇 1st</span><span className="text-green-400">40%</span></div>
                  <div className="flex justify-between"><span>🥈 2nd</span><span className="text-green-400">20%</span></div>
                  <div className="flex justify-between"><span>🥉 3rd</span><span className="text-green-400">15%</span></div>
                  <div className="flex justify-between"><span>4th</span><span className="text-green-400">8%</span></div>
                  <div className="flex justify-between"><span>5th</span><span className="text-green-400">5%</span></div>
                  <div className="flex justify-between"><span>6-10th</span><span className="text-green-400">12%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom spacing */}
          <div className="h-4" />
        </div>
      </div>
      
      <NavBar />
    </main>
  );
}