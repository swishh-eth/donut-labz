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

// Standard flow node with fixed width
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
  wide = false,
  small = false,
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
  wide?: boolean;
  small?: boolean;
}) {
  const width = small ? 95 : wide ? 160 : 130;
  return (
    <div 
      className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-2 ${isComingSoon ? 'opacity-50' : ''} flex flex-col items-center text-center`}
      style={{ width }}
    >
      {isSource && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {percentage && (
        <div className={`absolute -top-2 -left-2 ${isComingSoon ? 'bg-zinc-600 text-gray-300' : 'bg-amber-500 text-black'} text-[8px] font-bold px-1.5 py-0.5 rounded-full z-20`}>
          {percentage}
        </div>
      )}
      <div className="text-[7px] text-gray-500 uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1">
        {title}
        {isComingSoon && <Lock className="w-2 h-2" />}
      </div>
      <div className={`text-xs font-bold ${valueColor} flex items-center justify-center gap-1`}>
        <Icon className={`w-3 h-3 ${iconColor}`} />
        {value || subtitle}
      </div>
      {value && subtitle && (
        <div className="text-[8px] text-gray-500 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// Vertical line with animated dot
function VLine({ h, grey = false, delay = 0 }: { h: number; grey?: boolean; delay?: number }) {
  return (
    <div 
      className={`relative shrink-0 ${grey ? 'bg-zinc-600' : 'bg-amber-500/60'}`}
      style={{ width: 2, height: h }}
    >
      <div 
        className={`absolute w-1.5 h-1.5 rounded-full left-1/2 -translate-x-1/2 animate-flow-dot ${grey ? 'bg-zinc-500 shadow-[0_0_4px_#71717a]' : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'}`}
        style={{ animationDelay: `${delay * 0.3}s` }}
      />
    </div>
  );
}

// Horizontal line
function HLine({ w, grey = false }: { w: number; grey?: boolean }) {
  return (
    <div 
      className={`shrink-0 ${grey ? 'bg-zinc-600' : 'bg-amber-500/60'}`}
      style={{ height: 2, width: w }}
    />
  );
}

export default function RevenueFlowPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [donuts, setDonuts] = useState<Array<{ id: number; delay: number; duration: number; left: number }>>([]);
  const donutIdCounter = useRef(0);

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
          <div className="pb-8">
            
            {/* ========== MINER REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-3 text-center">Miner Revenue</div>
            
            {/* Two miners side by side - fixed width container */}
            <div className="flex justify-center gap-4">
              
              {/* ===== LEFT COLUMN: DONUT Miner (ETH) ===== */}
              <div className="flex flex-col items-center">
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
                <VLine h={16} delay={0} />
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
                <VLine h={16} delay={1} />
                <div className="text-[8px] text-green-400 font-bold py-1 bg-black px-2">Ξ ETH FEES (5%)</div>
                <VLine h={8} delay={2} />
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
                <VLine h={16} delay={3} />
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
                {/* Long grey line to reach stakers level */}
                <VLine h={200} grey delay={4} />
              </div>

              {/* ===== RIGHT COLUMN: SPRINKLES Miner (DONUT) ===== */}
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
                />
                <VLine h={16} delay={1} />
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
                <VLine h={16} delay={2} />
                <div className="text-[8px] text-amber-400 font-bold py-1 bg-black px-2">🍩 DONUT FEES (20%)</div>
                <VLine h={8} delay={3} />
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
                <VLine h={16} delay={4} />
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
                <VLine h={16} delay={5} />
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
                <VLine h={16} delay={6} />
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
                <VLine h={16} grey delay={7} />
              </div>
            </div>

            {/* T-connector to Stakers */}
            <div className="flex justify-center items-start">
              <HLine w={67} grey />
              <VLine h={16} grey delay={8} />
              <HLine w={67} grey />
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
                wide
              />
            </div>

            {/* ========== GAMES REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-8 mb-3 text-center">Games Revenue</div>
            
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
                wide
              />
              <VLine h={16} delay={0} />
            </div>
            
            {/* Horizontal bar for 3-way split */}
            <div className="flex justify-center">
              <HLine w={220} />
            </div>
            
            {/* Three columns */}
            <div className="flex justify-center gap-1">
              {/* Left - Prize Pool */}
              <div className="flex flex-col items-center">
                <VLine h={16} delay={1} />
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
                  small
                />
              </div>
              
              {/* Center - Sprinkles App */}
              <div className="flex flex-col items-center">
                <VLine h={16} delay={2} />
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
                  small
                />
                <VLine h={16} grey delay={3} />
              </div>
              
              {/* Right - LP Burn */}
              <div className="flex flex-col items-center">
                <VLine h={16} delay={3} />
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
                  small
                />
              </div>
            </div>
            
            {/* Stakers node for games */}
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
                wide
              />
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}