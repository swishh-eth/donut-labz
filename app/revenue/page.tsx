"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, Sparkles, Dices, TrendingUp, Coins, Lock, Trophy } from "lucide-react";
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
}: { 
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  icon: React.ElementType;
  iconColor?: string;
  borderColor?: string;
  bgColor?: string;
  isComingSoon?: boolean;
  isSource?: boolean;
}) {
  return (
    <div 
      className={`flow-node relative rounded-xl border-2 ${borderColor} ${bgColor} p-3 min-w-[140px] max-w-[160px] ${isComingSoon ? 'opacity-50' : ''}`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {isSource && (
        <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-green-500 animate-pulse" />
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const animationRef = useRef<number | null>(null);

  // Node positions (will be calculated based on layout)
  const [nodePositions, setNodePositions] = useState<{[key: string]: {x: number, y: number, width: number, height: number}}>({});

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

  // Calculate node positions after render
  useEffect(() => {
    const calculatePositions = () => {
      const positions: {[key: string]: {x: number, y: number, width: number, height: number}} = {};
      const nodeIds = ['source', 'splitter', 'lp', 'leaderboard', 'stakers', 'donut-miner', 'sprinkles-miner', 'games'];
      
      nodeIds.forEach(id => {
        const el = document.getElementById(`node-${id}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const container = scrollContainerRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            positions[id] = {
              x: rect.left - containerRect.left + container.scrollLeft,
              y: rect.top - containerRect.top + container.scrollTop,
              width: rect.width,
              height: rect.height
            };
          }
        }
      });
      
      setNodePositions(positions);
    };

    // Calculate after a short delay to ensure DOM is ready
    const timer = setTimeout(calculatePositions, 100);
    
    // Recalculate on scroll
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', calculatePositions);
    }
    
    return () => {
      clearTimeout(timer);
      if (container) {
        container.removeEventListener('scroll', calculatePositions);
      }
    };
  }, []);

  // Animate pulses on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = scrollContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pulse particles
    interface Pulse {
      progress: number;
      speed: number;
      path: string;
    }

    const pulses: Pulse[] = [];
    const paths = ['source-splitter', 'splitter-lp', 'splitter-leaderboard', 'splitter-stakers'];
    
    // Add initial pulses
    paths.forEach((path, i) => {
      pulses.push({ progress: 0, speed: 0.003 + Math.random() * 0.002, path });
      pulses.push({ progress: 0.5, speed: 0.003 + Math.random() * 0.002, path });
    });

    const getPathPoints = (pathId: string): {start: {x: number, y: number}, end: {x: number, y: number}} | null => {
      const [fromId, toId] = pathId.split('-');
      const from = nodePositions[fromId];
      const to = nodePositions[toId];
      
      if (!from || !to) return null;
      
      return {
        start: { x: from.x + from.width, y: from.y + from.height / 2 },
        end: { x: to.x, y: to.y + to.height / 2 }
      };
    };

    const animate = () => {
      // Resize canvas to match container
      canvas.width = container.scrollWidth;
      canvas.height = container.scrollHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines
      const connections = [
        { from: 'source', to: 'splitter', color: 'rgba(251, 191, 36, 0.3)' },
        { from: 'splitter', to: 'lp', color: 'rgba(34, 197, 94, 0.3)' },
        { from: 'splitter', to: 'leaderboard', color: 'rgba(251, 191, 36, 0.3)' },
        { from: 'splitter', to: 'stakers', color: 'rgba(156, 163, 175, 0.2)' },
      ];

      connections.forEach(conn => {
        const from = nodePositions[conn.from];
        const to = nodePositions[conn.to];
        if (!from || !to) return;

        const startX = from.x + from.width;
        const startY = from.y + from.height / 2;
        const endX = to.x;
        const endY = to.y + to.height / 2;
        const midX = (startX + endX) / 2;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
        ctx.strokeStyle = conn.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Animate pulses
      pulses.forEach(pulse => {
        const points = getPathPoints(pulse.path);
        if (!points) return;

        // Skip stakers path (coming soon)
        if (pulse.path === 'splitter-stakers') return;

        const { start, end } = points;
        const midX = (start.x + end.x) / 2;
        
        // Calculate position along bezier curve
        const t = pulse.progress;
        const x = Math.pow(1-t, 3) * start.x + 
                  3 * Math.pow(1-t, 2) * t * midX + 
                  3 * (1-t) * Math.pow(t, 2) * midX + 
                  Math.pow(t, 3) * end.x;
        const y = Math.pow(1-t, 3) * start.y + 
                  3 * Math.pow(1-t, 2) * t * start.y + 
                  3 * (1-t) * Math.pow(t, 2) * end.y + 
                  Math.pow(t, 3) * end.y;

        // Draw pulse
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 8);
        gradient.addColorStop(0, 'rgba(251, 191, 36, 1)');
        gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.5)');
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
        
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Inner bright dot
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        // Update progress
        pulse.progress += pulse.speed;
        if (pulse.progress > 1) {
          pulse.progress = 0;
          pulse.speed = 0.003 + Math.random() * 0.002;
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodePositions]);

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
              <p className="text-[10px] text-gray-500">Scroll to explore where revenue goes →</p>
            </div>
          </div>
        </div>

        {/* Scrollable Flow Container */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto flow-scroll relative"
        >
          <canvas 
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-10"
          />
          
          <div className="relative min-w-[800px] min-h-[500px] p-4">
            {/* Revenue Sources Column */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-3">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center">Sources</div>
              
              <div id="node-donut-miner">
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
              </div>
              
              <div id="node-sprinkles-miner">
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
              
              <div id="node-games">
                <FlowNode
                  title="Games (2% Fee)"
                  value="DONUT"
                  subtitle="House Edge"
                  valueColor="text-amber-400"
                  icon={Dices}
                  iconColor="text-white"
                  borderColor="border-zinc-600"
                  bgColor="bg-zinc-800/50"
                  isSource
                />
              </div>
            </div>

            {/* Aggregator Node */}
            <div id="node-source" className="absolute left-[200px] top-1/2 -translate-y-1/2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center">Aggregated</div>
              <FlowNode
                title="Total Revenue"
                value="All Sources"
                valueColor="text-amber-400"
                icon={Coins}
                iconColor="text-amber-400"
                borderColor="border-amber-500"
                bgColor="bg-amber-500/20"
              />
            </div>

            {/* Splitter Node */}
            <div id="node-splitter" className="absolute left-[380px] top-1/2 -translate-y-1/2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center">Splitter</div>
              <div className="rounded-xl border-2 border-amber-500 bg-amber-500/20 p-3 min-w-[120px] pulse-glow">
                <div className="text-[8px] text-gray-400 uppercase tracking-wider mb-1">DONUT Splitter</div>
                <div className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                  <span>50/50</span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">Split Contract</div>
              </div>
            </div>

            {/* Distribution Column */}
            <div className="absolute left-[560px] top-1/2 -translate-y-1/2 flex flex-col gap-4">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2 text-center">Distribution</div>
              
              <div id="node-lp">
                <FlowNode
                  title="Liquidity Pool"
                  value="50%"
                  subtitle="SPRINKLES/DONUT LP"
                  valueColor="text-green-400"
                  icon={TrendingUp}
                  iconColor="text-green-400"
                  borderColor="border-green-500/50"
                  bgColor="bg-green-500/10"
                />
              </div>
              
              <div id="node-leaderboard">
                <FlowNode
                  title="Leaderboard"
                  value="50%"
                  subtitle="Weekly Prizes"
                  valueColor="text-amber-400"
                  icon={Trophy}
                  iconColor="text-amber-400"
                  borderColor="border-amber-500/50"
                  bgColor="bg-amber-500/10"
                />
              </div>
              
              <div id="node-stakers">
                <FlowNode
                  title="SPRINKLES Stakers"
                  value="Coming Soon"
                  subtitle="Revenue Share"
                  valueColor="text-gray-500"
                  icon={Sparkles}
                  iconColor="text-gray-500"
                  borderColor="border-zinc-700"
                  bgColor="bg-zinc-800/50"
                  isComingSoon
                />
              </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[9px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>Live Revenue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-amber-500/50" style={{ borderStyle: 'dashed' }} />
                <span>Flow Path</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Revenue Pulse</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}