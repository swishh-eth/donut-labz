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

// Standard flow node
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
  width = 130,
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
  width?: number;
}) {
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

export default function RevenueFlowPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [donuts, setDonuts] = useState<Array<{ id: number; delay: number; duration: number; left: number }>>([]);
  const donutIdCounter = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });

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

  // Handle scroll fade effect
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

  // Column width for miners
  const COL_W = 130;
  const GAP = 16;

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
        
        @keyframes burn-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(255, 255, 255, 0.3); }
          50% { box-shadow: 0 0 16px rgba(255, 255, 255, 0.6); }
        }
        
        .burn-glow > div {
          animation: burn-glow 2s ease-in-out infinite;
        }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Falling donuts background - behind everything */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          {donuts.map((donut) => (
            <FallingDonut key={donut.id} {...donut} />
          ))}
        </div>

        {/* Top fade overlay for header area */}
        <div 
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: 0,
            height: "calc(env(safe-area-inset-top, 0px) + 70px)",
            background: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            zIndex: 5,
          }}
        />
        
        {/* Bottom fade overlay for nav area */}
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
                Revenue Flow
              </h1>
              <p className="text-[10px] text-gray-500">Scroll to explore where revenue goes ↓</p>
            </div>
          </div>
        </div>

        {/* Scrollable Flow Container */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden flow-scroll relative z-10"
          style={{ 
            WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, 
            maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` 
          }}
        >
          <div className="pb-8">
            
            {/* ========== MINER REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-3 text-center">Miner Revenue</div>
            
            {/* Two miners side by side */}
            <div className="flex justify-center" style={{ gap: GAP }}>
              
              {/* ===== LEFT COLUMN: DONUT Miner (ETH) ===== */}
              <div className="flex flex-col items-center" style={{ width: COL_W }}>
                <FlowNode
                  title="DONUT Miner"
                  value="ETH"
                  subtitle="Payments"
                  valueColor="text-amber-400"
                  icon={() => <span className="text-xs">🍩</span>}
                  borderColor="border-white/30"
                  bgColor="bg-white/5"
                  isSource
                  width={COL_W}
                />
                <VLine h={16} delay={0} />
                <FlowNode
                  title="Previous Miner"
                  value="80%"
                  subtitle="ETH rewards"
                  valueColor="text-amber-400"
                  icon={Users}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="80%"
                  width={COL_W}
                />
                <VLine h={16} delay={1} />
                <div className="text-[8px] text-amber-400 font-bold py-1 bg-black px-2">Ξ ETH FEES (20%)</div>
                <VLine h={8} delay={2} />
                <FlowNode
                  title="Donut LSG"
                  value="15%"
                  subtitle="Buybacks & Growth"
                  valueColor="text-amber-400"
                  icon={TrendingUp}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="15%"
                  width={COL_W}
                />
                <VLine h={16} delay={3} />
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
                  width={COL_W}
                />
                <VLine h={16} delay={4} />
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
                  width={COL_W}
                />
                <VLine h={190} grey delay={5} />
              </div>

              {/* ===== RIGHT COLUMN: SPRINKLES Miner (DONUT) ===== */}
              <div className="flex flex-col items-center" style={{ width: COL_W }}>
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
                  width={COL_W}
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
                  width={COL_W}
                />
                <VLine h={16} delay={2} />
                <div className="text-[8px] text-amber-400 font-bold py-1 bg-black px-2">🍩 DONUT FEES (20%)</div>
                <VLine h={8} delay={3} />
                <div className="burn-glow">
                  <FlowNode
                    title="Buy & Burn"
                    value="10%"
                    subtitle="SPRINKLES burned"
                    valueColor="text-white"
                    icon={Flame}
                    iconColor="text-white"
                    borderColor="border-white/30"
                    bgColor="bg-zinc-800/50"
                    percentage="10%"
                    width={COL_W}
                  />
                </div>
                <VLine h={16} delay={4} />
                <FlowNode
                  title="LP Burn Pool"
                  value="2.5%"
                  subtitle="Burn rewards"
                  valueColor="text-amber-400"
                  icon={TrendingUp}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="2.5%"
                  width={COL_W}
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
                  width={COL_W}
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
                  width={COL_W}
                />
                <VLine h={24} grey delay={7} />
              </div>
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
                width={COL_W * 2 + GAP}
              />
            </div>

            {/* ========== GAMES REVENUE ========== */}
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-8 mb-3 text-center">Games Revenue</div>
            
            <div className="flex flex-col items-center">
              <FlowNode
                title="On Player Loss"
                value="DONUT"
                subtitle="House edge distributed"
                valueColor="text-amber-400"
                icon={Dices}
                iconColor="text-white"
                borderColor="border-zinc-600"
                bgColor="bg-zinc-800/50"
                isSource
                width={COL_W * 2 + GAP}
              />
            </div>
            
            {/* Three columns with direct vertical drops from Games tile */}
            <div className="flex justify-center" style={{ gap: 4 }}>
              {/* Left - Prize Pool */}
              <div className="flex flex-col items-center" style={{ width: 90 }}>
                <VLine h={16} delay={1} />
                <FlowNode
                  title="Prize Pool"
                  value="50%"
                  subtitle="Next winner"
                  valueColor="text-amber-400"
                  icon={Trophy}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                  percentage="50%"
                  width={90}
                />
              </div>
              
              {/* Center - Sprinkles App */}
              <div className="flex flex-col items-center" style={{ width: 90 }}>
                <VLine h={16} delay={2} />
                <FlowNode
                  title="Sprinkles App"
                  value="25%"
                  subtitle="Provider"
                  valueColor="text-gray-400"
                  icon={Coins}
                  iconColor="text-gray-400"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  percentage="25%"
                  width={90}
                />
                <VLine h={16} grey delay={3} />
              </div>
              
              {/* Right - LP Burn */}
              <div className="flex flex-col items-center" style={{ width: 90 }}>
                <VLine h={16} delay={3} />
                <FlowNode
                  title="LP Burn"
                  value="25%"
                  subtitle="Rewards"
                  valueColor="text-green-400"
                  icon={Flame}
                  iconColor="text-green-400"
                  borderColor="border-green-500/50"
                  bgColor="bg-green-500/10"
                  percentage="25%"
                  width={90}
                />
              </div>
            </div>
            
            {/* Stakers node for games - wide to catch the line */}
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
                width={COL_W * 2 + GAP}
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