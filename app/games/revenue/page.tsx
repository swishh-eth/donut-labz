"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Sparkles, Dices, TrendingUp, Coins, Lock, Trophy, Flame, Users, Droplets } from "lucide-react";
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
  width = "150px",
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
  width?: string;
}) {
  return (
    <div 
      className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-3 ${isComingSoon ? 'opacity-50' : ''}`}
      style={{ backdropFilter: 'blur(8px)', width }}
    >
      {isSource && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {percentage && (
        <div className={`absolute -top-2 -left-2 ${isComingSoon ? 'bg-zinc-600 text-gray-300' : 'bg-amber-500 text-black'} text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>
          {percentage}
        </div>
      )}
      <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        {title}
        {isComingSoon && <Lock className="w-2 h-2" />}
      </div>
      <div className={`text-sm font-bold ${valueColor} flex items-center gap-1.5`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {value || subtitle}
      </div>
      {value && subtitle && (
        <div className="text-[9px] text-gray-500 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// Vertical line with animated dot
function FlowLine({ height = 32, color = "amber", delay = 0, grey = false }: { height?: number; color?: string; delay?: number; grey?: boolean }) {
  const bgColor = grey ? "bg-zinc-700/40" : `bg-${color}-500/30`;
  return (
    <div 
      className={`flow-line ${grey ? 'flow-line-grey' : ''} ${delay > 0 ? `flow-line-delay-${delay}` : ''} w-0.5 ${bgColor}`}
      style={{ height }}
    />
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
        
        @keyframes flow-down {
          0% { top: -6px; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: calc(100% - 6px); opacity: 0; }
        }
        
        .flow-line {
          position: relative;
          overflow: visible;
        }
        
        .flow-line::after {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 6px;
          height: 6px;
          background: #fbbf24;
          border-radius: 50%;
          box-shadow: 0 0 8px #fbbf24;
          animation: flow-down 1.8s ease-in-out infinite;
        }
        
        .flow-line-grey::after {
          background: #6b7280;
          box-shadow: 0 0 4px #6b7280;
        }
        
        .flow-line-delay-1::after { animation-delay: 0.3s; }
        .flow-line-delay-2::after { animation-delay: 0.6s; }
        .flow-line-delay-3::after { animation-delay: 0.9s; }
        .flow-line-delay-4::after { animation-delay: 1.2s; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
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
          <div className="flex flex-col items-center pb-8 min-w-[340px]">
            
            {/* ========== MINER REVENUE SOURCES ========== */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Miner Revenue</div>
            
            {/* Two miners side by side */}
            <div className="flex gap-4 justify-center w-full">
              {/* DONUT Miner Column */}
              <div className="flex flex-col items-center">
                <FlowNode
                  title="DONUT Miner"
                  value="ETH"
                  subtitle="Payments"
                  valueColor="text-green-400"
                  icon={() => <span className="text-base">🍩</span>}
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  isSource
                  width="140px"
                />
                <FlowLine height={24} delay={0} />
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
                  width="140px"
                />
                <FlowLine height={24} delay={1} />
                
                {/* ETH Fees Section */}
                <div className="text-[8px] text-green-400 font-bold mb-2">Ξ ETH FEES (5%)</div>
                
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
                  width="140px"
                />
                <FlowLine height={20} delay={2} />
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
                  width="140px"
                />
                <FlowLine height={40} grey delay={3} />
              </div>

              {/* SPRINKLES Miner Column */}
              <div className="flex flex-col items-center">
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
                  width="140px"
                />
                <FlowLine height={24} delay={1} />
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
                  width="140px"
                />
                <FlowLine height={24} delay={2} />
                
                {/* DONUT Fees Section */}
                <div className="text-[8px] text-amber-400 font-bold mb-2">🍩 DONUT FEES (20%)</div>
                
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
                  width="140px"
                />
                <FlowLine height={20} delay={3} />
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
                  width="140px"
                />
                <FlowLine height={20} delay={4} />
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
                  width="140px"
                />
                <FlowLine height={20} delay={1} />
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
                  width="140px"
                />
                <FlowLine height={20} grey delay={2} />
              </div>
            </div>

            {/* ========== STAKERS (Coming Soon) ========== */}
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
              width="160px"
            />

            {/* ========== GAMES REVENUE (Separate Section) ========== */}
            <div className="mt-8 flex flex-col items-center w-full">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Games Revenue</div>
              
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
                width="160px"
              />
              <FlowLine height={24} delay={0} />
              
              {/* Games fee split - 3 columns */}
              <div className="flex gap-3 justify-center">
                <div className="flex flex-col items-center">
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
                    width="100px"
                  />
                </div>
                <div className="flex flex-col items-center">
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
                    width="100px"
                  />
                  <FlowLine height={20} grey delay={1} />
                  <div className="text-[8px] text-gray-500 flex items-center gap-1">
                    <Lock className="w-2 h-2" /> Stakers
                  </div>
                </div>
                <div className="flex flex-col items-center">
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
                    width="100px"
                  />
                </div>
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