"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { ChevronLeft, Trophy, Zap, Clock, Gift, Sparkles, DollarSign, Gamepad2, Layers, Rocket } from "lucide-react";

type PrizeInfo = {
  donutDash: number;
  flappy: number;
  stack: number;
};

export default function PrizesPage() {
  const readyRef = useRef(false);
  const [prizes, setPrizes] = useState<PrizeInfo>({ donutDash: 5, flappy: 0, stack: 0 });

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch all prize pools
  useEffect(() => {
    const fetchPrizes = async () => {
      try {
        // Donut Dash (USDC)
        const dashRes = await fetch('/api/games/donut-dash/prize-distribute');
        if (dashRes.ok) {
          const data = await dashRes.json();
          setPrizes(prev => ({ ...prev, donutDash: data.totalPrize || 5 }));
        }

        // Flappy Donut (DONUT)
        const flappyRes = await fetch('/api/games/flappy/recent');
        if (flappyRes.ok) {
          const data = await flappyRes.json();
          setPrizes(prev => ({ ...prev, flappy: parseFloat(data.prizePool) || 0 }));
        }

        // Glaze Stack (DONUT)
        const stackRes = await fetch('/api/games/stack-tower/leaderboard');
        if (stackRes.ok) {
          const data = await stackRes.json();
          setPrizes(prev => ({ ...prev, stack: parseFloat(data.prizePool) || 0 }));
        }
      } catch (e) {
        console.error("Failed to fetch prizes:", e);
      }
    };
    fetchPrizes();
  }, []);

  const totalUSDC = prizes.donutDash;
  const totalDONUT = prizes.flappy + prizes.stack;

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
        <div className="flex-1 overflow-y-auto prizes-scroll space-y-4">
          
          {/* Total Prizes Card */}
          <div className="rounded-2xl border-2 border-green-500/30 p-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(22,163,74,0.05) 100%)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-green-400" />
              <span className="font-bold text-green-400">Total Weekly Prizes</span>
            </div>
            <div className="flex items-center gap-6">
              {totalUSDC > 0 && (
                <div className="flex items-center gap-2">
                  <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-8 h-8 rounded-full" />
                  <div>
                    <div className="text-2xl font-bold">${totalUSDC}</div>
                    <div className="text-xs text-zinc-500">USDC</div>
                  </div>
                </div>
              )}
              {totalDONUT > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🍩</span>
                  <div>
                    <div className="text-2xl font-bold">{totalDONUT.toLocaleString()}</div>
                    <div className="text-xs text-zinc-500">DONUT</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Free to Play Section */}
          <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-amber-400" />
              <span className="font-bold">100% Free to Play</span>
            </div>
            <p className="text-sm text-zinc-400 mb-3">
              All Sprinkles games are completely free to play. You only pay a tiny gas fee (~$0.001 on Base) to register your game onchain.
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <DollarSign className="w-3 h-3" />
              <span>No entry fees, no hidden costs</span>
            </div>
          </div>

          {/* How It Works Section */}
          <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-5 h-5 text-pink-400" />
              <span className="font-bold">How Prizes Work</span>
            </div>
            <p className="text-sm text-zinc-400 mb-3">
              Prize pools are funded by the Sprinkles App treasury. We believe in rewarding our community for playing and engaging with our games.
            </p>
            <div className="space-y-2 text-xs text-zinc-500">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 mt-0.5 text-amber-400" />
                <span>Top 10 players each week win prizes</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 mt-0.5 text-amber-400" />
                <span>Prizes distributed automatically via smart contracts</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 mt-0.5 text-amber-400" />
                <span>Your best score of the week counts</span>
              </div>
            </div>
          </div>

          {/* Reset Schedule */}
          <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="font-bold">Weekly Reset</span>
            </div>
            <p className="text-sm text-zinc-400 mb-2">
              All leaderboards reset every week:
            </p>
            <div className="bg-black/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-white">Friday 6:00 PM EST</div>
              <div className="text-xs text-zinc-500">(11:00 PM UTC)</div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Prizes are distributed automatically after the reset. New week, new leaderboard, new chances to win!
            </p>
          </div>

          {/* Game Breakdown */}
          <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-4">
              <Gamepad2 className="w-5 h-5 text-purple-400" />
              <span className="font-bold">Prize Breakdown by Game</span>
            </div>
            
            {/* Donut Dash */}
            <div className="border-b border-zinc-800 pb-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-white" />
                  <span className="font-medium">Donut Dash</span>
                </div>
                <div className="flex items-center gap-1">
                  <img src="/coins/USDC_LOGO.png" alt="USDC" className="w-4 h-4 rounded-full" />
                  <span className="text-green-400 font-bold">${prizes.donutDash} USDC</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <div className="flex justify-between"><span>🥇 1st</span><span className="text-green-400">40%</span></div>
                <div className="flex justify-between"><span>🥈 2nd</span><span className="text-green-400">20%</span></div>
                <div className="flex justify-between"><span>🥉 3rd</span><span className="text-green-400">15%</span></div>
                <div className="flex justify-between"><span>4th</span><span className="text-green-400">8%</span></div>
                <div className="flex justify-between"><span>5th</span><span className="text-green-400">5%</span></div>
                <div className="flex justify-between"><span>6th-10th</span><span className="text-green-400">12%</span></div>
              </div>
            </div>

            {/* Flappy Donut */}
            <div className="border-b border-zinc-800 pb-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-white" />
                  <span className="font-medium">Flappy Donut</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🍩</span>
                  <span className="text-amber-400 font-bold">{prizes.flappy.toLocaleString()} DONUT</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500">Prize pool grows from entry fees. Top players split the pot weekly.</p>
            </div>

            {/* Glaze Stack */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-white" />
                  <span className="font-medium">Glaze Stack</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🍩</span>
                  <span className="text-amber-400 font-bold">{prizes.stack.toLocaleString()} DONUT</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500">Prize pool grows from entry fees. Top players split the pot weekly.</p>
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