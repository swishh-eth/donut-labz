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
      className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-3 ${isComingSoon ? 'opacity-50' : ''}`}
      style={{ backdropFilter: 'blur(8px)', minWidth: '140px' }}
    >
      {isSource && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {percentage && (
        <div className="absolute -top-2 -left-2 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
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
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(251, 191, 36, 0.4); }
          50% { box-shadow: 0 0 16px rgba(251, 191, 36, 0.8); }
        }
        .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        @keyframes flow-down {
          0% { transform: translateY(-10px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(10px); opacity: 0; }
        }
        .flow-particle {
          animation: flow-down 1.5s ease-in-out infinite;
        }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
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
          <div className="flex flex-col items-center px-4 pb-8">
            
            {/* ========== REVENUE SOURCES ========== */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Revenue Sources</div>
            
            {/* Source Nodes Row */}
            <div className="flex gap-3 mb-2">
              <FlowNode
                title="DONUT Miner"
                value="ETH"
                subtitle="Payments"
                valueColor="text-green-400"
                icon={() => <span className="text-base">🍩</span>}
                borderColor="border-amber-500/50"
                bgColor="bg-amber-500/10"
                isSource
              />
              
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
            </div>

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

            {/* Flow lines down */}
            <div className="relative h-12 w-full flex justify-center">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-amber-500/60 to-amber-500/30" />
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 flow-particle" />
            </div>

            {/* ========== PREVIOUS MINER (80%) ========== */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Miner Rewards</div>
            
            <FlowNode
              title="Previous Miner"
              value="80%"
              subtitle="Rewards active miners"
              valueColor="text-green-400"
              icon={Users}
              iconColor="text-green-400"
              borderColor="border-green-500/50"
              bgColor="bg-green-500/10"
              percentage="80%"
            />

            {/* Flow lines down */}
            <div className="relative h-12 w-full flex justify-center">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-amber-500/30 to-amber-500/20" />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 flow-particle" style={{ animationDelay: '0.5s' }} />
            </div>

            {/* ========== PROTOCOL FEES ========== */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Protocol Fees (20%)</div>

            {/* Split into two branches */}
            <div className="relative w-full flex justify-center mb-2">
              {/* Horizontal connector */}
              <div className="absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-amber-500/30" />
              {/* Vertical drops */}
              <div className="absolute top-1/2 left-1/4 w-0.5 h-8 bg-amber-500/30" />
              <div className="absolute top-1/2 right-1/4 w-0.5 h-8 bg-amber-500/30" />
            </div>

            {/* Two columns for DONUT and SPRINKLES fees */}
            <div className="flex gap-4 w-full justify-center mt-8">
              {/* DONUT Miner Fees Column */}
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-amber-400 font-bold mb-2 flex items-center gap-1">
                  <span>🍩</span> DONUT Fees
                </div>
                
                <FlowNode
                  title="Treasury"
                  value="15%"
                  subtitle="LP Buybacks"
                  valueColor="text-amber-400"
                  icon={TrendingUp}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="15%"
                />
                
                <div className="h-6 w-0.5 bg-amber-500/30" />
                
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
                
                <div className="h-6 w-0.5 bg-amber-500/30" />
                
                <FlowNode
                  title="Builder Fee"
                  value="2.5%"
                  subtitle="Provider codes"
                  valueColor="text-gray-400"
                  icon={Coins}
                  iconColor="text-gray-400"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  percentage="2.5%"
                />
              </div>

              {/* SPRINKLES Miner Fees Column */}
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-white font-bold mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> SPRINKLES Fees
                </div>
                
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
                
                <div className="h-6 w-0.5 bg-amber-500/30" />
                
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
                
                <div className="h-6 w-0.5 bg-amber-500/30" />
                
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
                
                <div className="h-6 w-0.5 bg-amber-500/30" />
                
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
              </div>
            </div>

            {/* Flow lines down to future */}
            <div className="relative h-12 w-full flex justify-center mt-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-amber-500/20 to-zinc-700/30" />
            </div>

            {/* ========== COMING SOON ========== */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Coming Soon</div>
            
            <FlowNode
              title="SPRINKLES Stakers"
              value="Revenue Share"
              subtitle="Stake for rewards"
              valueColor="text-gray-500"
              icon={Sparkles}
              iconColor="text-gray-500"
              borderColor="border-zinc-700"
              bgColor="bg-zinc-800/50"
              isComingSoon
            />

            <div className="h-8" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}