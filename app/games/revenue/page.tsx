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

// Falling donut component
function FallingDonut({ delay, duration, left }: { delay: number; duration: number; left: number }) {
  return (
    <div
      className="falling-donut absolute text-lg pointer-events-none select-none"
      style={{
        left: `${left}%`,
        top: '-30px',
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      🍩
    </div>
  );
}

// Flow node with optional lines coming out
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
  lineAbove = false,
  lineBelow = false,
  lineAboveHeight = 20,
  lineBelowHeight = 20,
  greyLine = false,
  animDelay = 0,
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
  lineAbove?: boolean;
  lineBelow?: boolean;
  lineAboveHeight?: number;
  lineBelowHeight?: number;
  greyLine?: boolean;
  animDelay?: number;
}) {
  const lineColor = greyLine ? 'bg-zinc-600' : 'bg-amber-500/60';
  const dotColor = greyLine ? 'bg-zinc-500' : 'bg-amber-400';
  const glowColor = greyLine ? 'shadow-[0_0_4px_#71717a]' : 'shadow-[0_0_6px_#fbbf24]';
  
  return (
    <div className="flex flex-col items-center">
      {/* Line above */}
      {lineAbove && (
        <div className={`w-0.5 ${lineColor} relative`} style={{ height: lineAboveHeight }}>
          <div 
            className={`absolute w-1.5 h-1.5 rounded-full ${dotColor} ${glowColor} left-1/2 -translate-x-1/2 animate-flow-dot`}
            style={{ animationDelay: `${animDelay * 0.25}s` }}
          />
        </div>
      )}
      
      {/* Node */}
      <div 
        className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-2.5 ${isComingSoon ? 'opacity-50' : ''}`}
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
      
      {/* Line below */}
      {lineBelow && (
        <div className={`w-0.5 ${lineColor} relative`} style={{ height: lineBelowHeight }}>
          <div 
            className={`absolute w-1.5 h-1.5 rounded-full ${dotColor} ${glowColor} left-1/2 -translate-x-1/2 animate-flow-dot`}
            style={{ animationDelay: `${(animDelay + 1) * 0.25}s` }}
          />
        </div>
      )}
    </div>
  );
}

// Section label with lines
function SectionLabel({ text, color = "text-gray-500", lineAbove = false, lineBelow = false }: { text: string; color?: string; lineAbove?: boolean; lineBelow?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      {lineAbove && <div className="w-0.5 h-4 bg-amber-500/60" />}
      <div className={`text-[8px] ${color} font-bold py-1 bg-black px-2 z-10`}>{text}</div>
      {lineBelow && <div className="w-0.5 h-4 bg-amber-500/60" />}
    </div>
  );
}

export default function RevenueFlowPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [donuts, setDonuts] = useState<Array<{ id: number; delay: number; duration: number; left: number }>>([]);
  const donutIdCounter = useRef(0);

  // Initialize falling donuts
  useEffect(() => {
    const initialDonuts = Array.from({ length: 12 }, () => ({
      id: donutIdCounter.current++,
      delay: Math.random() * 5,
      duration: 4 + Math.random() * 3,
      left: Math.random() * 90 + 5,
    }));
    setDonuts(initialDonuts);

    const interval = setInterval(() => {
      setDonuts(prev => {
        const newDonut = {
          id: donutIdCounter.current++,
          delay: 0,
          duration: 4 + Math.random() * 3,
          left: Math.random() * 90 + 5,
        };
        return [...prev.slice(-15), newDonut];
      });
    }, 800);

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

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        .flow-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .flow-scroll::-webkit-scrollbar { display: none; }
        
        @keyframes flow-dot {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: calc(100% - 6px); opacity: 0; }
        }
        
        .animate-flow-dot {
          animation: flow-dot 1.5s ease-in-out infinite;
        }
        
        @keyframes donut-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 0.25; }
          95% { opacity: 0.25; }
          100% { transform: translateY(calc(100vh + 50px)) rotate(360deg); opacity: 0; }
        }
        
        .falling-donut {
          animation: donut-fall linear infinite;
        }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Falling donuts background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {donuts.map((donut) => (
            <FallingDonut key={donut.id} {...donut} />
          ))}
        </div>

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
                Revenue Flow
              </h1>
              <p className="text-[10px] text-gray-500">Scroll to explore where revenue goes ↓</p>
            </div>
          </div>
        </div>

        {/* Scrollable Flow Container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flow-scroll relative z-10">
          <div className="pb-8 px-1">
            
            {/* ========== MINER REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-3 text-center">Miner Revenue</div>
            
            {/* Two miners side by side */}
            <div className="flex justify-center gap-4">
              
              {/* ===== LEFT COLUMN: DONUT Miner (ETH) ===== */}
              <div className="flex flex-col items-center" style={{ width: '145px' }}>
                <FlowNode
                  title="DONUT Miner"
                  value="ETH"
                  subtitle="Payments"
                  valueColor="text-green-400"
                  icon={() => <span className="text-sm">🍩</span>}
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  isSource
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={0}
                />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={1}
                />
                <SectionLabel text="Ξ ETH FEES (5%)" color="text-green-400" lineBelow />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={2}
                />
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
                  lineBelow
                  lineBelowHeight={50}
                  greyLine
                  animDelay={3}
                />
              </div>

              {/* ===== RIGHT COLUMN: SPRINKLES Miner (DONUT) ===== */}
              <div className="flex flex-col items-center" style={{ width: '145px' }}>
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={1}
                />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={2}
                />
                <SectionLabel text="🍩 DONUT FEES (20%)" color="text-amber-400" lineBelow />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={3}
                />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={4}
                />
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
                  lineBelow
                  lineBelowHeight={20}
                  animDelay={5}
                />
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
                  lineBelow
                  lineBelowHeight={20}
                  greyLine
                  animDelay={6}
                />
              </div>
            </div>

            {/* Horizontal connector bar */}
            <div className="flex justify-center items-start -mt-0.5">
              <div className="h-0.5 bg-zinc-600" style={{ width: '145px' }} />
              <div className="w-0.5 h-5 bg-zinc-600" />
              <div className="h-0.5 bg-zinc-600" style={{ width: '145px' }} />
            </div>

            {/* ========== STAKERS (Coming Soon) ========== */}
            <div className="flex justify-center">
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
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-3 text-center mt-8">Games Revenue</div>
            
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
                lineBelow
                lineBelowHeight={20}
                animDelay={0}
              />
            </div>
            
            {/* Horizontal split bar */}
            <div className="flex justify-center -mt-0.5">
              <div className="h-0.5 bg-amber-500/60" style={{ width: '200px' }} />
            </div>
            
            {/* Three columns */}
            <div className="flex justify-center gap-2 -mt-0.5">
              <div className="flex flex-col items-center" style={{ width: '100px' }}>
                <div className="w-0.5 h-4 bg-amber-500/60 relative">
                  <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24] left-1/2 -translate-x-1/2 animate-flow-dot" style={{ animationDelay: '0.5s' }} />
                </div>
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
                <div className="w-0.5 h-4 bg-amber-500/60 relative">
                  <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24] left-1/2 -translate-x-1/2 animate-flow-dot" style={{ animationDelay: '0.75s' }} />
                </div>
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
                  lineBelow
                  lineBelowHeight={20}
                  greyLine
                  animDelay={2}
                />
                <div className="text-[8px] text-gray-500 flex items-center gap-1">
                  <Lock className="w-2 h-2" /> Stakers
                </div>
              </div>
              
              <div className="flex flex-col items-center" style={{ width: '100px' }}>
                <div className="w-0.5 h-4 bg-amber-500/60 relative">
                  <div className="absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24] left-1/2 -translate-x-1/2 animate-flow-dot" style={{ animationDelay: '1s' }} />
                </div>
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