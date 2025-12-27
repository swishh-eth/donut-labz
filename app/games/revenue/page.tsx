"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Sparkles, Dices, TrendingUp, Coins, Lock, Trophy, Flame, Users } from "lucide-react";
import { NavBar } from "@/components/nav-bar";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

// Flow node component
function FlowNode({ 
  title, 
  subtitle, 
  value,
  valueColor = "text-white",
  icon: Icon,
  iconColor = "text-white",
  borderColor = "border-zinc-700",
  bgColor = "bg-zinc-900",
  isComingSoon = false,
  isSource = false,
  percentage,
}: { 
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  icon: React.ElementType | (() => React.ReactElement);
  iconColor?: string;
  borderColor?: string;
  bgColor?: string;
  isComingSoon?: boolean;
  isSource?: boolean;
  percentage?: string;
}) {
  return (
    <div 
      className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-2.5 ${isComingSoon ? 'opacity-50' : ''} z-10`}
    >
      {isSource && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {percentage && (
        <div className={`absolute -top-2 -left-2 ${isComingSoon ? 'bg-zinc-600 text-gray-300' : 'bg-amber-500 text-black'} text-[8px] font-bold px-1.5 py-0.5 rounded-full z-20`}>
          {percentage}
        </div>
      )}
      <div className="text-[7px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center gap-1">
        {title}
        {isComingSoon && <Lock className="w-2 h-2" />}
      </div>
      <div className={`text-xs font-bold ${valueColor} flex items-center gap-1`}>
        <Icon className={`w-3 h-3 ${iconColor}`} />
        {value || subtitle}
      </div>
      {value && subtitle && (
        <div className="text-[8px] text-gray-500 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

export default function RevenueFlowPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);

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

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        .flow-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .flow-scroll::-webkit-scrollbar { display: none; }
        
        @keyframes dot-flow {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: calc(100% - 6px); opacity: 0; }
        }
        
        .vline {
          width: 2px;
          background: rgba(251, 191, 36, 0.5);
          position: relative;
          margin: -1px 0;
        }
        
        .vline::after {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 6px;
          height: 6px;
          background: #fbbf24;
          border-radius: 50%;
          box-shadow: 0 0 6px #fbbf24;
          animation: dot-flow 2s ease-in-out infinite;
        }
        
        .vline-grey {
          background: rgba(113, 113, 122, 0.6);
        }
        
        .vline-grey::after {
          background: #71717a;
          box-shadow: 0 0 4px #71717a;
        }
        
        .hline {
          height: 2px;
          background: rgba(251, 191, 36, 0.5);
        }
        
        .hline-grey {
          background: rgba(113, 113, 122, 0.6);
        }
        
        .delay-1::after { animation-delay: 0.3s; }
        .delay-2::after { animation-delay: 0.6s; }
        .delay-3::after { animation-delay: 0.9s; }
        .delay-4::after { animation-delay: 1.2s; }
        .delay-5::after { animation-delay: 1.5s; }
        .delay-6::after { animation-delay: 1.8s; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 mb-3">
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
                Revenue Flow
              </h1>
              <p className="text-[10px] text-gray-500">Scroll to explore where revenue goes ↓</p>
            </div>
          </div>
        </div>

        {/* Scrollable Flow Container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flow-scroll">
          <div className="pb-8 px-1">
            
            {/* ========== MINER REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center">Miner Revenue</div>
            
            {/* Two miners side by side */}
            <div className="flex justify-center gap-4">
              
              {/* ===== LEFT COLUMN: DONUT Miner (ETH) ===== */}
              <div className="flex flex-col items-center" style={{ width: '140px' }}>
                <FlowNode
                  title="DONUT Miner"
                  value="ETH"
                  subtitle="Payments"
                  valueColor="text-green-400"
                  icon={() => <span className="text-sm">🍩</span>}
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  isSource
                />
                <div className="vline delay-1" style={{ height: '24px' }} />
                <FlowNode
                  title="Previous Miner"
                  value="80%"
                  subtitle="ETH rewards"
                  valueColor="text-green-400"
                  icon={Users}
                  iconColor="text-green-400"
                  borderColor="border-green-500/50"
                  bgColor="bg-green-500/10"
                  percentage="80%"
                />
                <div className="vline delay-2" style={{ height: '24px' }} />
                <div className="text-[8px] text-green-400 font-bold py-1 z-10 bg-black">Ξ ETH FEES (5%)</div>
                <div className="vline delay-2" style={{ height: '16px' }} />
                <FlowNode
                  title="Leaderboard"
                  value="2.5%"
                  subtitle="Weekly Prizes"
                  valueColor="text-amber-400"
                  icon={Trophy}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="2.5%"
                />
                <div className="vline delay-3" style={{ height: '24px' }} />
                <FlowNode
                  title="Sprinkles App"
                  value="2.5%"
                  subtitle="Provider Fee"
                  valueColor="text-gray-400"
                  icon={Coins}
                  iconColor="text-gray-400"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  percentage="2.5%"
                />
                <div className="vline vline-grey delay-4" style={{ height: '60px' }} />
              </div>

              {/* ===== RIGHT COLUMN: SPRINKLES Miner (DONUT) ===== */}
              <div className="flex flex-col items-center" style={{ width: '140px' }}>
                <FlowNode
                  title="SPRINKLES Miner"
                  value="DONUT"
                  subtitle="Payments"
                  valueColor="text-amber-400"
                  icon={Sparkles}
                  iconColor="text-white"
                  borderColor="border-white/30"
                  bgColor="bg-white/5"
                  isSource
                />
                <div className="vline delay-1" style={{ height: '24px' }} />
                <FlowNode
                  title="Previous Miner"
                  value="80%"
                  subtitle="DONUT rewards"
                  valueColor="text-amber-400"
                  icon={Users}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="80%"
                />
                <div className="vline delay-2" style={{ height: '24px' }} />
                <div className="text-[8px] text-amber-400 font-bold py-1 z-10 bg-black">🍩 DONUT FEES (20%)</div>
                <div className="vline delay-2" style={{ height: '16px' }} />
                <FlowNode
                  title="Buy & Burn"
                  value="10%"
                  subtitle="SPRINKLES burned"
                  valueColor="text-red-400"
                  icon={Flame}
                  iconColor="text-red-400"
                  borderColor="border-red-500/50"
                  bgColor="bg-red-500/10"
                  percentage="10%"
                />
                <div className="vline delay-3" style={{ height: '24px' }} />
                <FlowNode
                  title="LP Burn Pool"
                  value="2.5%"
                  subtitle="Burn rewards"
                  valueColor="text-green-400"
                  icon={TrendingUp}
                  iconColor="text-green-400"
                  borderColor="border-green-500/50"
                  bgColor="bg-green-500/10"
                  percentage="2.5%"
                />
                <div className="vline delay-4" style={{ height: '24px' }} />
                <FlowNode
                  title="Leaderboard"
                  value="2.5%"
                  subtitle="Weekly Prizes"
                  valueColor="text-amber-400"
                  icon={Trophy}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="2.5%"
                />
                <div className="vline delay-5" style={{ height: '24px' }} />
                <FlowNode
                  title="Sprinkles App"
                  value="5%"
                  subtitle="Provider Fee"
                  valueColor="text-gray-400"
                  icon={Coins}
                  iconColor="text-gray-400"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  percentage="5%"
                />
                <div className="vline vline-grey delay-6" style={{ height: '24px' }} />
              </div>
            </div>

            {/* Horizontal connector to Stakers */}
            <div className="flex justify-center items-start" style={{ marginTop: '-1px' }}>
              <div className="hline hline-grey" style={{ width: '70px' }} />
              <div className="vline vline-grey" style={{ height: '20px', margin: 0 }} />
              <div className="hline hline-grey" style={{ width: '70px' }} />
            </div>

            {/* ========== STAKERS (Coming Soon) ========== */}
            <div className="flex justify-center" style={{ marginTop: '-1px' }}>
              <FlowNode
                title="SPRINKLES Stakers"
                value="Revenue Share"
                subtitle="From provider fees"
                valueColor="text-gray-500"
                icon={Sparkles}
                iconColor="text-gray-500"
                borderColor="border-zinc-700"
                bgColor="bg-zinc-800/50"
                isComingSoon
              />
            </div>

            {/* ========== GAMES REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center mt-8">Games Revenue</div>
            
            <div className="flex flex-col items-center">
              <FlowNode
                title="Games"
                value="DONUT"
                subtitle="2% House Edge"
                valueColor="text-amber-400"
                icon={Dices}
                iconColor="text-white"
                borderColor="border-zinc-600"
                bgColor="bg-zinc-800/50"
                isSource
              />
              <div className="vline delay-1" style={{ height: '20px' }} />
            </div>
            
            {/* Three-way split with connected lines */}
            <div className="flex justify-center items-start">
              <div className="flex flex-col items-center" style={{ width: '100px' }}>
                <div className="flex items-start">
                  <div className="hline" style={{ width: '50px', marginTop: '0px' }} />
                </div>
                <div className="vline delay-2" style={{ height: '16px' }} />
                <FlowNode
                  title="Prize Pool"
                  value="1%"
                  subtitle="Game prizes"
                  valueColor="text-amber-400"
                  icon={Trophy}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="1%"
                />
              </div>
              
              <div className="flex flex-col items-center" style={{ width: '100px' }}>
                <div className="vline delay-2" style={{ height: '16px' }} />
                <FlowNode
                  title="Sprinkles App"
                  value="0.5%"
                  subtitle="Provider"
                  valueColor="text-gray-400"
                  icon={Coins}
                  iconColor="text-gray-400"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  percentage="0.5%"
                />
                <div className="vline vline-grey delay-3" style={{ height: '20px' }} />
                <div className="text-[8px] text-gray-500 flex items-center gap-1 z-10">
                  <Lock className="w-2 h-2" /> Stakers
                </div>
              </div>
              
              <div className="flex flex-col items-center" style={{ width: '100px' }}>
                <div className="flex items-start">
                  <div className="hline" style={{ width: '50px', marginTop: '0px' }} />
                </div>
                <div className="vline delay-3" style={{ height: '16px' }} />
                <FlowNode
                  title="LP Burn"
                  value="0.5%"
                  subtitle="Rewards"
                  valueColor="text-green-400"
                  icon={Flame}
                  iconColor="text-green-400"
                  borderColor="border-green-500/50"
                  bgColor="bg-green-500/10"
                  percentage="0.5%"
                />
              </div>
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}