"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { formatEther } from "viem";
import { Pickaxe, Flame, Beaker, Trophy, Dices, MessageCircle, Timer, TrendingUp, Users, Coins, Building } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";

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

// Sprinkles coin image component
const SprinklesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/sprinkles_logo.png" alt="SPRINKLES" className="w-full h-full object-cover" />
  </span>
);

// Matrix-style single digit component
function MatrixDigit({ char, delay = 0, isReady }: { char: string; delay?: number; isReady: boolean }) {
  const [displayChar, setDisplayChar] = useState(char === '.' || char === ',' || char === ' ' ? char : '0');
  const [isAnimating, setIsAnimating] = useState(false);
  const hasAnimatedRef = useRef(false);
  
  useEffect(() => {
    // Don't animate punctuation or spaces
    if (char === '.' || char === ',' || char === ' ') {
      setDisplayChar(char);
      setIsAnimating(false);
      return;
    }
    
    // If already animated, just show the char (live updates)
    if (hasAnimatedRef.current) {
      setDisplayChar(char);
      setIsAnimating(false);
      return;
    }
    
    // Wait for ready signal
    if (!isReady) return;
    
    hasAnimatedRef.current = true;
    setIsAnimating(true);
    
    // Random digits cycling effect
    let cycleCount = 0;
    const maxCycles = 8 + Math.floor(delay / 30);
    
    const cycleInterval = setInterval(() => {
      if (cycleCount < maxCycles) {
        setDisplayChar(Math.floor(Math.random() * 10).toString());
        cycleCount++;
      } else {
        setDisplayChar(char);
        setIsAnimating(false);
        clearInterval(cycleInterval);
      }
    }, 50);
    
    return () => {
      clearInterval(cycleInterval);
      setIsAnimating(false);
    };
  }, [char, delay, isReady]);
  
  return (
    <span className={`transition-colors duration-100 ${isAnimating ? 'text-green-400/70' : ''}`}>
      {displayChar}
    </span>
  );
}

// Matrix-style value animation for numbers
function MatrixValue({ 
  value, 
  isReady,
  className = ""
}: { 
  value: string; 
  isReady: boolean;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  const initializedRef = useRef(false);
  
  // Trigger animation once when ready and value exists
  useEffect(() => {
    if (!initializedRef.current && isReady && value && value !== "0") {
      initializedRef.current = true;
      setKey(1);
    }
  }, [isReady, value]);
  
  // If not ready or no value, show placeholder
  if (!value || !initializedRef.current) {
    return <span className={`tabular-nums ${className}`}>—</span>;
  }
  
  const chars = value.split('');
  
  return (
    <span key={key} className={`tabular-nums ${className}`}>
      {chars.map((char, index) => (
        <MatrixDigit 
          key={`${key}-${index}`} 
          char={char} 
          delay={index * 30} 
          isReady={isReady}
        />
      ))}
    </span>
  );
}

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
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [burnedBalance, setBurnedBalance] = useState<string>("0");
  const [burnedBalanceRaw, setBurnedBalanceRaw] = useState<bigint>(BigInt(0));
  const [totalEmitted, setTotalEmitted] = useState<string>("0");
  const [totalEmittedRaw, setTotalEmittedRaw] = useState<bigint>(BigInt(0));
  const [donutBurnedInLP, setDonutBurnedInLP] = useState<string>("0");
  const [gDonutStaked, setGDonutStaked] = useState<string>("0");
  const [treasurySprinkles, setTreasurySprinkles] = useState<string>("0");
  const [dataReady, setDataReady] = useState(false);

  // Treasury address
  const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
  // gDONUT token address (LSG staked DONUT)
  const GDONUT_ADDRESS = "0xC78B6e362cB0f48b59E573dfe7C99d92153a16d3";
  // SPRINKLES token address
  const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";

  // Fetch burned balances and total supply
  useEffect(() => {
    const fetchBurnedBalance = async () => {
      try {
        // Fetch SPRINKLES burned (dead address)
        const deadResponse = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
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
        const lpPoolResponse = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
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
        
        setBurnedBalanceRaw(totalBurned);
        const formatted = Math.floor(Number(formatEther(totalBurned))).toLocaleString();
        setBurnedBalance(formatted);
      } catch (error) {
        console.error('Failed to fetch burned balance:', error);
      }
    };

    const fetchTotalSupply = async () => {
      try {
        // Fetch totalSupply from SPRINKLES contract (0x18160ddd is totalSupply selector)
        const response = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D',
                data: '0x18160ddd'
              },
              'latest'
            ]
          })
        });
        const data = await response.json();
        if (data.result) {
          const totalSupplyBigInt = BigInt(data.result);
          setTotalEmittedRaw(totalSupplyBigInt);
          const formatted = Math.floor(Number(formatEther(totalSupplyBigInt))).toLocaleString();
          setTotalEmitted(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch total supply:', error);
      }
    };

    const fetchDonutBurnedInLP = async () => {
      try {
        const response = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: '0xAE4a37d554C6D6F3E398546d8566B25052e0169C',
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
    fetchTotalSupply();
    fetchDonutBurnedInLP();
    
    // Fetch gDONUT staked by treasury
    const fetchGDonutStaked = async () => {
      try {
        const response = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: GDONUT_ADDRESS,
                data: `0x70a08231000000000000000000000000${TREASURY_ADDRESS.slice(2).toLowerCase()}`
              },
              'latest'
            ]
          })
        });
        const data = await response.json();
        if (data.result) {
          const balanceBigInt = BigInt(data.result);
          const formatted = Math.floor(Number(formatEther(balanceBigInt))).toLocaleString();
          setGDonutStaked(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch gDONUT staked:', error);
      }
    };

    // Fetch SPRINKLES held by treasury
    const fetchTreasurySprinkles = async () => {
      try {
        const response = await fetch('https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: SPRINKLES_ADDRESS,
                data: `0x70a08231000000000000000000000000${TREASURY_ADDRESS.slice(2).toLowerCase()}`
              },
              'latest'
            ]
          })
        });
        const data = await response.json();
        if (data.result) {
          const balanceBigInt = BigInt(data.result);
          const formatted = Math.floor(Number(formatEther(balanceBigInt))).toLocaleString();
          setTreasurySprinkles(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch treasury SPRINKLES:', error);
      }
    };

    fetchGDonutStaked();
    fetchTreasurySprinkles();
    
    // Set dataReady after initial fetch
    setTimeout(() => setDataReady(true), 500);
    
    const interval = setInterval(() => {
      fetchBurnedBalance();
      fetchTotalSupply();
      fetchDonutBurnedInLP();
      fetchGDonutStaked();
      fetchTreasurySprinkles();
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

  // Calculate "With Burned Tokens" = 210M max supply - burned
  const MAX_SUPPLY = BigInt(210_000_000) * BigInt(10 ** 18);
  const withBurnedTokens = burnedBalanceRaw > 0n
    ? Math.floor(Number(formatEther(MAX_SUPPLY - burnedBalanceRaw))).toLocaleString()
    : "210,000,000";

  // Calculate circulating supply (total emitted - burned)
  const circulatingSupply = totalEmittedRaw > 0n && burnedBalanceRaw >= 0n
    ? Math.floor(Number(formatEther(totalEmittedRaw - burnedBalanceRaw))).toLocaleString()
    : "0";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .page-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .page-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex-shrink-0">
            <Header title="SPRINKLES" user={context?.user} />
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden page-scroll"
            style={{ 
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`, 
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` 
            }}
          >
            <div className="space-y-3 pb-8">
              {/* Overview Card */}
              <div className="rounded-xl p-4 border border-zinc-700 bg-zinc-900">
                <div className="flex items-start gap-3 mb-3">
                  <SprinklesCoin className="w-16 h-16 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white">$SPRINKLES</h2>
                    <p className="text-xs text-green-400 font-medium">Play to Earn on Base</p>
                  </div>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">
                  Play games. Mine tokens. Chat onchain. Stack SPRINKLES — powered by $DONUT.
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Max Supply</span>
                    <span className="text-sm font-bold text-white">
                      <MatrixValue value="210,000,000" isReady={dataReady} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">With Burned Tokens</span>
                    <span className="text-sm font-bold text-white">
                      <MatrixValue value={withBurnedTokens} isReady={dataReady} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Circulating</span>
                    <span className="text-sm font-bold text-green-400">
                      <MatrixValue value={circulatingSupply} isReady={dataReady} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Initial LP</span>
                    <span className="text-xs text-gray-500">10M Pre-minted & Burned</span>
                  </div>
                </div>
              </div>

              {/* Stats Grid - Burn & Treasury */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Flame className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] text-gray-400">SPRINKLES Burned</span>
                  </div>
                  <span className="text-lg font-bold text-green-400">
                    <MatrixValue value={burnedBalance} isReady={dataReady} />
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5">Togglable Burn Switch</p>
                </div>
                <div className="p-3 bg-pink-500/10 border border-pink-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Flame className="w-3 h-3 text-pink-400" />
                    <span className="text-[10px] text-gray-400">DONUT Burned</span>
                  </div>
                  <span className="text-lg font-bold text-pink-400">
                    <MatrixValue value={donutBurnedInLP} isReady={dataReady} />
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5">LP Fee's In Dead Address</p>
                </div>
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Coins className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] text-gray-400">Treasury SPRINKLES</span>
                  </div>
                  <span className="text-lg font-bold text-green-400">
                    <MatrixValue value={treasurySprinkles} isReady={dataReady} />
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5">Buybacks w/ LSG Revenue</p>
                </div>
                <div className="p-3 bg-pink-500/10 border border-pink-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Building className="w-3 h-3 text-pink-400" />
                    <span className="text-[10px] text-gray-400">gDONUT Staked</span>
                  </div>
                  <span className="text-lg font-bold text-pink-400">
                    <MatrixValue value={gDonutStaked} isReady={dataReady} />
                  </span>
                  <p className="text-[9px] text-gray-500 mt-0.5">Miner 15% Revenue Fee</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-green-400">40/sec</div>
                  <div className="text-[10px] text-gray-500">Start Rate</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-green-400">30 days</div>
                  <div className="text-[10px] text-gray-500">Halving</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-green-400">0.1/s</div>
                  <div className="text-[10px] text-gray-500">Tail Rate</div>
                </div>
              </div>

              {/* Revenue Split */}
              <div className="rounded-xl p-4 bg-zinc-900 border border-zinc-800">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  SPRINKLES Revenue Split
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-300">Previous Miner</span>
                    </div>
                    <span className="text-sm font-bold text-green-400">80%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-300">Sprinkles Treasury (LSG)</span>
                    </div>
                    <span className="text-sm font-bold text-green-400">15%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 opacity-50">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">↑</span>
                        <Flame className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-[10px] text-gray-500 italic">Buy & Burn - Togglable By Holders</span>
                    </div>
                    <span className="text-sm font-bold text-gray-500">5%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-300">LP Burn Rewards</span>
                    </div>
                    <span className="text-sm font-bold text-green-400">4%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-300">Leaderboard Rewards</span>
                    </div>
                    <span className="text-sm font-bold text-green-400">1%</span>
                  </div>
                </div>
              </div>

              {/* How Mining Works */}
              <Section
                icon={<Pickaxe className="w-4 h-4 text-green-400" />}
                title="How SPRINKLES Mining Works"
              >
                <p>Same auction mechanics as DONUT, but you pay <span className="text-pink-400 font-semibold">$DONUT</span> instead of ETH.</p>
                <p className="mt-2">The right to mine is bought through a continuous Dutch auction:</p>
                <div className="pl-2 border-l border-green-500/30 ml-1 space-y-1 mt-2">
                  <p>• Price doubles after each purchase</p>
                  <p>• Then decays to 1 DONUT over one hour</p>
                  <p>• Anyone can purchase control at current price</p>
                </div>
              </Section>

              {/* Proof of Just-In-Time Stake */}
              <Section
                icon={<Flame className="w-4 h-4 text-green-400" />}
                title="Proof of Just-In-Time Stake"
              >
                <p>DONUT is "staked" only while controlling emissions.</p>
                <p>Profit if the next purchase pays more, lose if it pays less.</p>
                <p>Earn <span className="text-green-400 font-semibold">$SPRINKLES</span> the entire time you hold control.</p>
              </Section>

              {/* What is The Sprinkles App? */}
              <Section
                icon={<Beaker className="w-4 h-4 text-green-400" />}
                title="What is The Sprinkles App?"
              >
                <p>A Play to Earn app on Base powered by $DONUT.</p>
                <p className="mt-2">Play arcade games, mine tokens, and chat to earn DONUT, SPRINKLES, and USDC rewards every week!</p>
                <p className="text-green-400 font-medium mt-2">Your onchain donut shop on Base.</p>
              </Section>

              {/* Treasury */}
              <Section
                icon={<Building className="w-4 h-4 text-green-400" />}
                title="Sprinkles Treasury"
              >
                <p>The Sprinkles Treasury stakes its DONUT holdings into the <span className="text-pink-400 font-semibold">Donut DAO's Liquid Staked Governance (LSG)</span>.</p>
                <p className="mt-2">This generates yield in two ways:</p>
                <div className="pl-2 border-l border-green-500/30 ml-1 space-y-1 mt-2">
                  <p>• <span className="text-green-400 font-semibold">USDC</span> — Used to fund game reward pools</p>
                  <p>• <span className="text-pink-400 font-semibold">DONUT</span> — Used to bolster SPRINKLES liquidity</p>
                </div>
                <p className="mt-2 text-gray-500 text-[10px]">LSG allows the treasury to earn yield while maintaining governance rights over the staked DONUT.</p>
              </Section>

              {/* Leaderboard */}
              <Section
                icon={<Trophy className="w-4 h-4 text-green-400" />}
                title="Leaderboard"
              >
                <p>Compete weekly on the Sprinkles leaderboard for a share of the prize pool!</p>
                <p className="mt-2">Earn points by mining:</p>
                <div className="pl-2 border-l border-green-500/30 ml-1 space-y-1 mt-1">
                  <p>• <span className="text-pink-400 font-semibold">Mine DONUT</span> = 3 points per mine</p>
                  <p>• <span className="text-green-400 font-semibold">Mine SPRINKLES</span> = 1 point per mine</p>
                </div>
                <p className="mt-3">Top 10 miners split the weekly prize pool:</p>
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-2 mt-2">
                  <div className="grid grid-cols-5 gap-1 text-center mb-1">
                    <div>
                      <div className="text-sm font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">1st</div>
                      <div className="font-bold text-[10px] text-green-400">40%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.6)]">2nd</div>
                      <div className="font-bold text-[10px] text-green-400">20%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.4)]">3rd</div>
                      <div className="font-bold text-[10px] text-green-400">15%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-400">4th</div>
                      <div className="font-bold text-[10px] text-gray-400">8%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-400">5th</div>
                      <div className="font-bold text-[10px] text-gray-400">5%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    <div>
                      <div className="text-sm font-bold text-gray-500">6th</div>
                      <div className="text-gray-500 font-bold text-[10px]">4%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-500">7th</div>
                      <div className="text-gray-500 font-bold text-[10px]">3%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-500">8th</div>
                      <div className="text-gray-500 font-bold text-[10px]">2%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-500">9th</div>
                      <div className="text-gray-500 font-bold text-[10px]">2%</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-500">10th</div>
                      <div className="text-gray-500 font-bold text-[10px]">1%</div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-gray-500 text-[10px]">Leaderboard resets every Friday at 6PM EST. Prizes include USDC, DONUT, and SPRINKLES!</p>
              </Section>

              {/* Games */}
              <Section
                icon={<Dices className="w-4 h-4 text-green-400" />}
                title="Games"
              >
                <p>The Sprinkles App features arcade games where you can win prizes each week!</p>
                <p className="mt-2">Games come in two types:</p>
                <div className="pl-2 border-l border-green-500/30 ml-1 space-y-1 mt-2">
                  <p>• <span className="text-green-400 font-semibold">Free to Play</span> — Compete for weekly USDC prizes</p>
                  <p>• <span className="text-pink-400 font-semibold">Paid Game</span> — Pay DONUT to compete for DONUT prizes</p>
                </div>
                <p className="mt-3 text-white font-semibold text-[11px]">Current Games:</p>
                <div className="pl-2 border-l border-green-500/30 ml-1 space-y-1 mt-1">
                  <p>• <span className="text-white">Flappy Donut</span> — Tap to fly, dodge rolling pins <span className="text-pink-400 text-[9px]">(Paid Game)</span></p>
                  <p>• <span className="text-white">Glaze Stack</span> — Stack boxes, don't let them fall <span className="text-green-400 text-[9px]">(Free)</span></p>
                  <p>• <span className="text-white">Donut Dash</span> — Jetpack through obstacles <span className="text-green-400 text-[9px]">(Free)</span></p>
                </div>
                <p className="mt-2 text-gray-500 text-[10px]">Weekly prize pools reset every Friday at 6PM EST.</p>
              </Section>

              {/* Chat to Earn */}
              <Section
                icon={<MessageCircle className="w-4 h-4 text-green-400" />}
                title="Chat to Earn"
              >
                <p>Send onchain messages in the Chat tab to earn sprinkles points!</p>
                <p className="mt-2">Requirements: Hold at least <span className="text-green-400 font-semibold">100,000 SPRINKLES</span> to earn points.</p>
                <div className="mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Timer className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] text-white font-semibold">Halving Schedule</span>
                  </div>
                  <p className="text-[10px] text-gray-400">Multiplier halves every 30 days: 2x → 1x → 0.5x → 0.25x → 0</p>
                  <p className="text-[10px] text-gray-500 mt-1">Chat rewards are limited — earn while you can!</p>
                </div>
              </Section>

              <div className="h-4" />
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}