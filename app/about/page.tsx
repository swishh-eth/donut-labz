"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { ArrowRight, Link2 } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  client?: {
    added?: boolean;
    notificationDetails?: {
      url: string;
      token: string;
    };
  };
};

// SPRINKLES token address on Base
const SPRINKLES_TOKEN = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D";
const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const GDONUT_TOKEN = "0xC78B6e362cB0f48b59E573dfe7C99d92153a16d3"; // Liquid Staked Governance DONUT
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const FEE_SPLITTER_ADDRESS = "0x710e042d4F13f5c649dBb1774A3695BFcAC253ce"; // Effectively burned - locked in fee splitter

// Base RPC endpoints with fallbacks
const BASE_RPCS = [
  "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g",
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
];

// ERC20 balanceOf ABI fragment
const BALANCE_OF_ABI = "0x70a08231";

// Fetch token balance from an address
async function fetchTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
  const paddedAddress = walletAddress.slice(2).padStart(64, '0');
  const data = BALANCE_OF_ABI + paddedAddress;
  
  for (const rpc of BASE_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: tokenAddress, data }, 'latest']
        })
      });
      
      const result = await response.json();
      if (result.result) {
        return BigInt(result.result);
      }
    } catch (e) {
      console.warn(`RPC ${rpc} failed:`, e);
      continue;
    }
  }
  
  return 0n;
}

// Fetch burned SPRINKLES balance (dead address + fee splitter)
async function fetchBurnedSprinklesBalance(): Promise<bigint> {
  const [deadBalance, feeBalance] = await Promise.all([
    fetchTokenBalance(SPRINKLES_TOKEN, DEAD_ADDRESS),
    fetchTokenBalance(SPRINKLES_TOKEN, FEE_SPLITTER_ADDRESS),
  ]);
  return deadBalance + feeBalance;
}

// Fetch burned DONUT balance (fee splitter only - DONUT accumulates there)
async function fetchBurnedDonutBalance(): Promise<bigint> {
  return fetchTokenBalance(DONUT_TOKEN, FEE_SPLITTER_ADDRESS);
}

// Fetch gDONUT staked by treasury
async function fetchGDonutStaked(): Promise<bigint> {
  return fetchTokenBalance(GDONUT_TOKEN, TREASURY_ADDRESS);
}

// Format large numbers with commas
function formatBurnedAmount(amount: bigint): string {
  // SPRINKLES has 18 decimals
  const value = Number(amount) / 1e18;
  return Math.floor(value).toLocaleString('en-US');
}

// Matrix-style number digit component
function MatrixDigit({ digit, delay = 0 }: { digit: string; delay?: number }) {
  const [displayDigit, setDisplayDigit] = useState(() => 
    digit === ',' ? ',' : String(Math.floor(Math.random() * 10))
  );
  const [isAnimating, setIsAnimating] = useState(digit !== ',');
  
  useEffect(() => {
    if (digit === ',') {
      setDisplayDigit(',');
      setIsAnimating(false);
      return;
    }
    
    // Start with random digit, cycle a few times based on delay, then land
    let cycleCount = 0;
    const maxCycles = 6 + Math.floor(delay / 40);
    
    const cycleInterval = setInterval(() => {
      if (cycleCount < maxCycles) {
        setDisplayDigit(String(Math.floor(Math.random() * 10)));
        cycleCount++;
      } else {
        setDisplayDigit(digit);
        setIsAnimating(false);
        clearInterval(cycleInterval);
      }
    }, 50);
    
    return () => clearInterval(cycleInterval);
  }, [digit, delay]);
  
  return (
    <span 
      className={`inline-block transition-all duration-100 ${isAnimating ? 'text-green-400/70' : ''}`}
      style={{ 
        minWidth: digit === ',' ? '0.3em' : '0.6em',
        textAlign: 'center'
      }}
    >
      {displayDigit}
    </span>
  );
}

// Matrix-style single digit component for staking values
function MatrixStakingDigit({ char, delay = 0 }: { char: string; delay?: number }) {
  const isPunctuation = char === '.' || char === ',' || char === '$' || char === '%' || char === '/' || char === '(' || char === ')' || char === ' ' || char === '-';
  const [displayChar, setDisplayChar] = useState(() => 
    isPunctuation ? char : String(Math.floor(Math.random() * 10))
  );
  const [isAnimating, setIsAnimating] = useState(!isPunctuation);
  
  useEffect(() => {
    if (isPunctuation) {
      setDisplayChar(char);
      setIsAnimating(false);
      return;
    }
    
    // Start with random digit, cycle a few times based on delay, then land
    let cycleCount = 0;
    const maxCycles = 6 + Math.floor(delay / 30);
    
    const cycleInterval = setInterval(() => {
      if (cycleCount < maxCycles) {
        setDisplayChar(String(Math.floor(Math.random() * 10)));
        cycleCount++;
      } else {
        setDisplayChar(char);
        setIsAnimating(false);
        clearInterval(cycleInterval);
      }
    }, 50);
    
    return () => clearInterval(cycleInterval);
  }, [char, delay, isPunctuation]);
  
  return (
    <span className={`transition-colors duration-100 ${isAnimating ? 'text-green-400/70' : ''}`}>
      {displayChar}
    </span>
  );
}

// Matrix-style value animation for staking section
function MatrixStakingValue({ 
  value, 
  isReady,
  className = ""
}: { 
  value: string; 
  isReady: boolean;
  className?: string;
}) {
  // Don't render anything until data is ready
  if (!isReady) {
    return null;
  }
  
  const chars = value.split('');
  
  return (
    <span className={`tabular-nums ${className} animate-fadeIn`}>
      {chars.map((char, index) => (
        <MatrixStakingDigit 
          key={index} 
          char={char} 
          delay={index * 25} 
        />
      ))}
    </span>
  );
}

// Matrix-style number display
function MatrixNumber({ 
  value, 
  isLoading,
  className = "text-white"
}: { 
  value: number; 
  isLoading: boolean;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  const prevValueRef = useRef(0);
  
  // Only re-trigger animation when value changes significantly (more than 1%)
  useEffect(() => {
    if (!isLoading && value > 0) {
      const diff = Math.abs(value - prevValueRef.current);
      const threshold = prevValueRef.current * 0.01; // 1% change threshold
      
      if (prevValueRef.current === 0 || diff > threshold) {
        setKey(prev => prev + 1);
        prevValueRef.current = value;
      }
    }
  }, [value, isLoading]);
  
  // Hide completely while loading
  if (isLoading || value === 0) {
    return null;
  }
  
  const formattedValue = value.toLocaleString('en-US');
  const digits = formattedValue.split('');
  
  return (
    <span key={key} className={`tabular-nums ${className} animate-fadeIn`}>
      {digits.map((digit, index) => (
        <MatrixDigit key={`${key}-${index}`} digit={digit} delay={index * 30} />
      ))}
    </span>
  );
}

// Falling Sprinkles and Donuts Animation Component
function FallingCoins() {
  // Use seeded random for consistent but random-looking positions
  const getRandomDelay = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 6; // 0-6 seconds random delay
  };
  
  const coins = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    left: `${5 + (i * 6) % 90}%`,
    delay: `${getRandomDelay(i + 1)}s`,
    duration: `${4 + (i % 4)}s`,
    size: 12 + (i % 3) * 4,
    isDonut: i % 3 === 0, // Every 3rd coin is a donut
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute animate-fall"
          style={{
            left: c.left,
            top: '-60px',
            animationDelay: c.delay,
            animationDuration: c.duration,
          }}
        >
          <span 
            className="rounded-full overflow-hidden inline-flex items-center justify-center ring-1 ring-zinc-500/50"
            style={{ width: c.size, height: c.size }}
          >
            {c.isDonut ? (
              <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover opacity-40" />
            ) : (
              <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover opacity-40" />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// Falling Donuts Only Animation Component (for pink themed tiles)
function FallingDonuts() {
  const getRandomDelay = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 6;
  };
  
  const coins = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${5 + (i * 8) % 90}%`,
    delay: `${getRandomDelay(i + 1)}s`,
    duration: `${4 + (i % 4)}s`,
    size: 12 + (i % 3) * 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c) => (
        <div
          key={c.id}
          className="absolute animate-fall"
          style={{
            left: c.left,
            top: '-60px',
            animationDelay: c.delay,
            animationDuration: c.duration,
          }}
        >
          <span 
            className="rounded-full overflow-hidden inline-flex items-center justify-center ring-1 ring-pink-500/30"
            style={{ width: c.size, height: c.size }}
          >
            <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover opacity-40" />
          </span>
        </div>
      ))}
    </div>
  );
}

// Burn Counter Tile Component
function BurnCounterTile({ 
  sprinklesBurned, 
  donutBurned, 
  isLoading 
}: { 
  sprinklesBurned: bigint; 
  donutBurned: bigint;
  isLoading: boolean;
}) {
  const [displaySprinkles, setDisplaySprinkles] = useState(0);
  const [displayDonut, setDisplayDonut] = useState(0);
  
  useEffect(() => {
    if (isLoading || sprinklesBurned === 0n) return;
    const realAmount = Number(sprinklesBurned) / 1e18;
    setDisplaySprinkles(Math.floor(realAmount));
  }, [sprinklesBurned, isLoading]);

  useEffect(() => {
    if (isLoading || donutBurned === 0n) return;
    const realAmount = Number(donutBurned) / 1e18;
    setDisplayDonut(Math.floor(realAmount));
  }, [donutBurned, isLoading]);

  return (
    <div
      className="burn-counter-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
      style={{ height: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <FallingCoins />
      
      <div className="relative z-10 p-4 h-full flex flex-col justify-center">
        <div className="flex items-start gap-4">
          <div className="text-left flex-1">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="font-bold text-[10px] text-white whitespace-nowrap">SPRINKLES BURNED</span>
            </div>
            <div className="font-mono text-lg font-bold">
              <MatrixNumber value={displaySprinkles} isLoading={isLoading} className="text-white" />
            </div>
          </div>
          
          <div className="text-left flex-1">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="font-bold text-[10px] text-pink-400 whitespace-nowrap">DONUT BURNED</span>
            </div>
            <div className="font-mono text-lg font-bold">
              <MatrixNumber value={displayDonut} isLoading={isLoading} className="text-pink-400" />
            </div>
          </div>
        </div>
        
        <div className="text-[9px] text-white/40 mt-1">
          Permanently removed from circulation
        </div>
      </div>
    </div>
  );
}

// Treasury gDONUT Staked Tile Component (Combined with Staking Revenue)
function GDonutStakedTile({ 
  gDonutStaked, 
  isLoading,
  stakingData,
  isStakingLoading,
}: { 
  gDonutStaked: bigint; 
  isLoading: boolean;
  stakingData: {
    treasurySharePercent: number;
    treasuryStakedUsd: number;
    totalStaked: number;
    totalStakedUsd: number;
    donutPriceUsd: number;
    weeklyRevenueUsd: number;
    totalWeeklyRevenueUsd: number;
    apr: number;
    donutApr?: number;
    usdcApr?: number;
    donutWeeklyUsd?: number;
    usdcWeeklyUsd?: number;
  } | null;
  isStakingLoading: boolean;
}) {
  const [displayAmount, setDisplayAmount] = useState(0);
  const [dataReady, setDataReady] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  
  useEffect(() => {
    if (isLoading || gDonutStaked === 0n) return;
    const realAmount = Number(gDonutStaked) / 1e18;
    setDisplayAmount(Math.floor(realAmount));
  }, [gDonutStaked, isLoading]);

  // Set data ready when staking data loads
  useEffect(() => {
    if (!isStakingLoading && stakingData && !dataReady) {
      const timeout = setTimeout(() => setDataReady(true), 100);
      return () => clearTimeout(timeout);
    }
  }, [isStakingLoading, stakingData, dataReady]);

  const formatUsd = (num: number) => {
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}k`;
    }
    if (num < 0.01) return '<$0.01';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatUsdFull = (num: number) => {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate combined weekly USD from both sources
  const totalWeeklyUsd = stakingData 
    ? (stakingData.donutWeeklyUsd || 0) + (stakingData.usdcWeeklyUsd || 0)
    : 0;
  
  // Daily values (weekly / 7)
  const totalDailyUsd = totalWeeklyUsd / 7;
  const donutDailyUsd = (stakingData?.donutWeeklyUsd || 0) / 7;
  const usdcDailyUsd = (stakingData?.usdcWeeklyUsd || 0) / 7;
  const donutDailyAmount = stakingData?.donutWeeklyUsd && stakingData?.donutPriceUsd > 0
    ? Math.floor((stakingData.donutWeeklyUsd / 7) / stakingData.donutPriceUsd)
    : 0;

  // Pre-calculate formatted values for matrix animation
  const donutAprStr = stakingData?.donutApr?.toFixed(1) || '0';
  const usdcAprStr = stakingData?.usdcApr?.toFixed(1) || '0';
  
  // Weekly values
  const donutWeeklyDonutAmount = stakingData?.donutWeeklyUsd && stakingData?.donutPriceUsd > 0
    ? Math.floor(stakingData.donutWeeklyUsd / stakingData.donutPriceUsd).toLocaleString()
    : '0';
  const donutWeeklyUsdStr = stakingData?.donutWeeklyUsd ? formatUsd(stakingData.donutWeeklyUsd) : '$0';
  const usdcWeeklyUsdStr = stakingData?.usdcWeeklyUsd ? formatUsd(stakingData.usdcWeeklyUsd) : '$0';
  const totalWeeklyStr = formatUsdFull(totalWeeklyUsd);
  
  // Daily values
  const donutDailyDonutAmount = donutDailyAmount.toLocaleString();
  const donutDailyUsdStr = formatUsd(donutDailyUsd);
  const usdcDailyUsdStr = formatUsd(usdcDailyUsd);
  const totalDailyStr = formatUsdFull(totalDailyUsd);
  
  const stakedValueStr = stakingData ? formatUsdFull(stakingData.treasuryStakedUsd) : '$0.00';

  // Use daily or weekly based on toggle
  const displayDonutAmount = showDaily ? donutDailyDonutAmount : donutWeeklyDonutAmount;
  const displayDonutUsd = showDaily ? donutDailyUsdStr : donutWeeklyUsdStr;
  const displayUsdcUsd = showDaily ? usdcDailyUsdStr : usdcWeeklyUsdStr;
  const displayTotalUsd = showDaily ? totalDailyStr : totalWeeklyStr;
  const periodLabel = showDaily ? 'Daily' : 'Weekly';

  return (
    <div
      className="gdonut-staked-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
      onClick={() => setShowDaily(!showDaily)}
    >
      <div className="relative z-10 p-4 h-full flex flex-col justify-center">
        {/* Top Section - gDONUT Staked */}
        <div className="text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-xs text-pink-400">SPRINKLES TREASURY gDONUT</span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-mono text-2xl font-bold">
              <MatrixNumber value={displayAmount} isLoading={isLoading} className="text-pink-400" />
            </div>
            {dataReady && (
              <span className="text-sm text-white/50 font-mono animate-fadeIn">
                <MatrixStakingValue value={stakedValueStr} isReady={dataReady} />
              </span>
            )}
          </div>
          <div className="text-[9px] text-white/40 mt-0.5">
            Miner 15% revenue fee • Liquid Staked Governance
          </div>
        </div>
        
        <div className="border-t border-white/10 my-2" />
        
        <div className="text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-xs text-pink-400">STAKING REVENUE</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition-colors ${showDaily ? 'bg-pink-500/30 text-pink-300' : 'bg-white/10 text-white/50'}`}>
              {showDaily ? 'DAILY' : 'WEEKLY'}
            </span>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img src="/coins/donut_logo.png" alt="" className="w-3.5 h-3.5 rounded-full" />
                <span className="text-[10px] text-white/50">DONUT EARNINGS (50%):</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-pink-400">
                  <MatrixStakingValue value={`${donutAprStr}%`} isReady={dataReady} />
                </span>
                {dataReady && stakingData?.donutWeeklyUsd !== undefined && stakingData.donutWeeklyUsd > 0 && stakingData.donutPriceUsd > 0 && (
                  <span className="text-[9px] text-white/40 font-mono">
                    ({displayDonutAmount} / {displayDonutUsd})
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img src="/coins/USDC_LOGO.png" alt="" className="w-3.5 h-3.5 rounded-full" />
                <span className="text-[10px] text-white/50">USDC EARNINGS (50%):</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-pink-400">
                  <MatrixStakingValue value={`${usdcAprStr}%`} isReady={dataReady} />
                </span>
                {dataReady && stakingData?.usdcWeeklyUsd !== undefined && stakingData.usdcWeeklyUsd > 0 && (
                  <span className="text-[9px] text-white/40 font-mono">
                    ({displayUsdcUsd})
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-[10px] text-white/50">{periodLabel} Revenue Total:</span>
              <span className="font-mono text-xs font-bold text-pink-400">
                {dataReady ? displayTotalUsd : <MatrixStakingValue value={displayTotalUsd} isReady={dataReady} />}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Matrix digit for halving countdown
function HalvingMatrixDigit({ char, delay = 0 }: { char: string; delay?: number }) {
  const [displayChar, setDisplayChar] = useState(() => String(Math.floor(Math.random() * 10)));
  const [isAnimating, setIsAnimating] = useState(true);
  const hasLandedRef = useRef(false);
  
  useEffect(() => {
    // If already landed, just update for live countdown changes
    if (hasLandedRef.current) {
      setDisplayChar(char);
      return;
    }
    
    // Start with random digit, cycle a few times based on delay, then land
    let cycleCount = 0;
    const maxCycles = 6 + Math.floor(delay / 30);
    
    const cycleInterval = setInterval(() => {
      if (cycleCount < maxCycles) {
        setDisplayChar(String(Math.floor(Math.random() * 10)));
        cycleCount++;
      } else {
        setDisplayChar(char);
        setIsAnimating(false);
        hasLandedRef.current = true;
        clearInterval(cycleInterval);
      }
    }, 50);
    
    return () => clearInterval(cycleInterval);
  }, [char, delay]);
  
  return (
    <span className={`transition-colors duration-100 ${isAnimating ? 'text-green-400/70' : ''}`}>
      {displayChar}
    </span>
  );
}

// Halving Countdown Tile Component
function HalvingCountdownTile() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const HALVING_DATE = new Date('2026-02-06T14:05:00Z').getTime();
  
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const diff = HALVING_DATE - now;
      
      if (diff <= 0) {
        setIsComplete(true);
        setIsReady(true);
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft({ days, hours, minutes, seconds });
    };
    
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, []);

  // Trigger ready after initial calculation
  useEffect(() => {
    if (!isReady && (timeLeft.days > 0 || timeLeft.hours > 0 || timeLeft.minutes > 0 || timeLeft.seconds > 0)) {
      const timeout = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timeout);
    }
  }, [timeLeft, isReady]);

  // Format values for display
  const daysStr = String(timeLeft.days);
  const hoursStr = String(timeLeft.hours).padStart(2, '0');
  const minutesStr = String(timeLeft.minutes).padStart(2, '0');
  const secondsStr = String(timeLeft.seconds).padStart(2, '0');

  return (
    <div
      className="halving-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden"
      style={{ height: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-3 pr-20 h-full flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-xs text-white">Sprinkles Halving Countdown</span>
        </div>
        
        {isComplete ? (
          <div className="font-mono text-lg font-bold text-white">
            Halving Complete!
          </div>
        ) : !isReady ? (
          // Hidden until ready - placeholder to maintain height
          <div className="h-[28px]" />
        ) : (
          <div className="flex items-center gap-1.5 animate-fadeIn">
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white tabular-nums">
                {daysStr.split('').map((char, i) => (
                  <HalvingMatrixDigit key={`days-${i}`} char={char} delay={i * 30} />
                ))}
              </div>
              <div className="text-[7px] text-white/60">DAYS</div>
            </div>
            <span className="text-white/30 text-sm font-bold">:</span>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white tabular-nums">
                {hoursStr.split('').map((char, i) => (
                  <HalvingMatrixDigit key={`hours-${i}`} char={char} delay={(daysStr.length + i) * 30} />
                ))}
              </div>
              <div className="text-[7px] text-white/60">HRS</div>
            </div>
            <span className="text-white/30 text-sm font-bold">:</span>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white tabular-nums">
                {minutesStr.split('').map((char, i) => (
                  <HalvingMatrixDigit key={`mins-${i}`} char={char} delay={(daysStr.length + 2 + i) * 30} />
                ))}
              </div>
              <div className="text-[7px] text-white/60">MIN</div>
            </div>
            <span className="text-white/30 text-sm font-bold">:</span>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white tabular-nums">
                {secondsStr.split('').map((char, i) => (
                  <HalvingMatrixDigit key={`secs-${i}`} char={char} delay={(daysStr.length + 4 + i) * 30} />
                ))}
              </div>
              <div className="text-[7px] text-white/60">SEC</div>
            </div>
          </div>
        )}
        
        <div className="text-[8px] text-white/40 mt-0.5">
          Mining rewards halve • Feb 6th 9:05 AM EST
        </div>
      </div>
    </div>
  );
}

// Donut Info Tile Component
function DonutInfoTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="donut-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-pink-400">What is $DONUT</span>
          </div>
          <div className="text-[10px] text-pink-400/60 mb-2">Store-of-value token on Base</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-pink-400">Dutch Auction</span>
            <ArrowRight className="w-3 h-3 text-pink-500/50" />
            <span className="text-pink-400">Mine DONUT</span>
            <ArrowRight className="w-3 h-3 text-pink-500/50" />
            <span className="text-pink-400">LP Growth</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Sprinkles Info Tile Component
function SprinklesInfoTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sprinkles-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">What is $SPRINKLES</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Play to Earn on Base</div>
          
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-white/80">Games</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Mining</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Rewards</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Links & Contracts Tile Component
function LinksContractsTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="links-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Link2 className="w-24 h-24 text-zinc-800" />
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">Links & Contracts</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">Smart contracts & useful links</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-white/80">Contracts</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Socials</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Resources</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Donut Dashboard Tile Component
function DonutDashboardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="donut-dashboard-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-white/40"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50">
          <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-white">Donut Dashboard</span>
          </div>
          <div className="text-[10px] text-white/60 mb-2">View Dune analytics & on-chain data</div>
          
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-white/80">TVL</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Volume</span>
            <ArrowRight className="w-3 h-3 text-white/30" />
            <span className="text-white/80">Holders</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Sprinkles Dashboard Tile Component
function SprinklesDashboardTile({ showComingSoon, onClick }: { showComingSoon: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sprinkles-dashboard-tile relative w-full rounded-2xl border-2 border-white/20 overflow-hidden transition-all duration-300 active:scale-[0.98] opacity-60"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)' }}
    >
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <span className="w-24 h-24 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 opacity-30">
          <img src="/coins/sprinkles_logo.png" alt="" className="w-full h-full object-cover" />
        </span>
      </div>
      
      <div className="relative z-10 p-4 pr-16">
        <div className="text-left relative">
          <div className={`absolute inset-0 flex items-center transition-opacity duration-300 ${showComingSoon ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <span className="font-bold text-base text-gray-400">COMING SOON</span>
          </div>
          
          <div className={`transition-opacity duration-300 ${showComingSoon ? "opacity-0" : "opacity-100"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-base text-gray-500">Sprinkles Dashboard</span>
            </div>
            <div className="text-[10px] text-gray-600 mb-2">View Dune analytics & on-chain data</div>
            
            <div className="flex items-center gap-3 text-[9px]">
              <span className="text-gray-600">TVL</span>
              <ArrowRight className="w-3 h-3 text-gray-700" />
              <span className="text-gray-600">Volume</span>
              <ArrowRight className="w-3 h-3 text-gray-700" />
              <span className="text-gray-600">Holders</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function AboutPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [sprinklesBurned, setSprinklesBurned] = useState<bigint>(0n);
  const [donutBurned, setDonutBurned] = useState<bigint>(0n);
  const [gDonutStaked, setGDonutStaked] = useState<bigint>(0n);
  const [isBurnLoading, setIsBurnLoading] = useState(true);
  const [isGDonutLoading, setIsGDonutLoading] = useState(true);
  
  // Staking earnings state
  const [stakingData, setStakingData] = useState<{
    treasurySharePercent: number;
    treasuryStakedUsd: number;
    totalStaked: number;
    totalStakedUsd: number;
    donutPriceUsd: number;
    weeklyRevenueUsd: number;
    totalWeeklyRevenueUsd: number;
    apr: number;
    donutApr?: number;
    usdcApr?: number;
    donutWeeklyUsd?: number;
    usdcWeeklyUsd?: number;
  } | null>(null);
  const [isStakingLoading, setIsStakingLoading] = useState(true);
  
  // App & notification state
  const [isAppAdded, setIsAppAdded] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isAddingApp, setIsAddingApp] = useState(false);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

  // Fetch burned amounts (once on mount)
  useEffect(() => {
    const fetchBurned = async () => {
      setIsBurnLoading(true);
      try {
        const [sprinkles, donut] = await Promise.all([
          fetchBurnedSprinklesBalance(),
          fetchBurnedDonutBalance(),
        ]);
        setSprinklesBurned(sprinkles);
        setDonutBurned(donut);
      } catch (e) {
        console.error("Failed to fetch burned amounts:", e);
      }
      setIsBurnLoading(false);
    };
    
    fetchBurned();
  }, []);

  // Fetch gDONUT staked (once on mount)
  useEffect(() => {
    const fetchGDonut = async () => {
      setIsGDonutLoading(true);
      try {
        const staked = await fetchGDonutStaked();
        setGDonutStaked(staked);
      } catch (e) {
        console.error("Failed to fetch gDONUT staked:", e);
      }
      setIsGDonutLoading(false);
    };
    
    fetchGDonut();
  }, []);

  // Fetch staking earnings data (once on mount)
  useEffect(() => {
    const fetchStakingData = async () => {
      setIsStakingLoading(true);
      try {
        const res = await fetch("/api/gdonut-staking");
        if (res.ok) {
          const data = await res.json();
          setStakingData({
            treasurySharePercent: data.treasurySharePercent || 0,
            treasuryStakedUsd: data.treasuryStakedUsd || 0,
            totalStaked: data.totalStaked || 0,
            totalStakedUsd: data.totalStakedUsd || 0,
            donutPriceUsd: data.donutPriceUsd || 0,
            weeklyRevenueUsd: data.weeklyRevenueUsd || 0,
            totalWeeklyRevenueUsd: data.totalWeeklyRevenueUsd || 0,
            apr: data.apr || 0,
            donutApr: data.donutApr,
            usdcApr: data.usdcApr,
            donutWeeklyUsd: data.donutWeeklyUsd,
            usdcWeeklyUsd: data.usdcWeeklyUsd,
          });
        }
      } catch (e) {
        console.error("Failed to fetch staking data:", e);
      }
      setIsStakingLoading(false);
    };
    
    fetchStakingData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
          // Check if app is added and notifications are enabled
          if (ctx?.client?.added) {
            setIsAppAdded(true);
          }
          if (ctx?.client?.notificationDetails) {
            setNotificationsEnabled(true);
          }
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
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
    if (!hasAnimatedIn) {
      const timeout = setTimeout(() => {
        setHasAnimatedIn(true);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [hasAnimatedIn]);

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

  // Refresh state from context
  const refreshStateFromContext = async () => {
    try {
      const ctx = await sdk.context as MiniAppContext;
      console.log("[RefreshContext]", ctx?.client);
      if (ctx?.client?.added) {
        setIsAppAdded(true);
      }
      if (ctx?.client?.notificationDetails) {
        setNotificationsEnabled(true);
      }
      return ctx;
    } catch (e) {
      console.error("[RefreshContext] Error:", e);
      return null;
    }
  };

  // Handle add app
  const handleAddApp = async () => {
    if (isAddingApp || isAppAdded) return;
    setIsAddingApp(true);
    
    try {
      // Check if already added first
      const ctx = await refreshStateFromContext();
      if (ctx?.client?.added) {
        setIsAddingApp(false);
        return;
      }
      
      // Try to add
      await sdk.actions.addMiniApp();
    } catch (e) {
      console.log("[AddApp] Action error (expected if already added):", e);
    }
    
    // Always check context after action to get true state
    await refreshStateFromContext();
    setIsAddingApp(false);
  };

  // Handle enable notifications
  const handleEnableNotifications = async () => {
    if (isEnablingNotifications || notificationsEnabled) return;
    setIsEnablingNotifications(true);
    
    try {
      // Try to add/enable - this bundles notifications with adding
      const result = await sdk.actions.addMiniApp();
      console.log("[About EnableNotifications] addMiniApp result:", JSON.stringify(result));
      
      // Check the result directly
      const resultAny = result as any;
      if (resultAny?.notificationDetails) {
        console.log("[About EnableNotifications] Got notificationDetails from result");
        setNotificationsEnabled(true);
        setIsAppAdded(true);
        setIsEnablingNotifications(false);
        return;
      }
      
      if (resultAny?.added) {
        setIsAppAdded(true);
      }
    } catch (e) {
      console.log("[About EnableNotifications] Action error:", e);
    }
    
    // Small delay to let SDK context update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check context after action
    await refreshStateFromContext();
    console.log("[About EnableNotifications] State after refresh - notifications:", notificationsEnabled);
    
    setIsEnablingNotifications(false);
  };

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .about-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .about-scroll::-webkit-scrollbar {
          display: none;
        }
        @keyframes tilePopIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-tilePopIn {
          animation: tilePopIn 0.3s ease-out forwards;
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        @keyframes fadeScaleIn {
          0% { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          5% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(180px) rotate(180deg); opacity: 0; }
        }
        .animate-fall {
          animation: fall linear infinite;
        }
        @keyframes spinCoin1 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spinCoin2 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes spinCoin3 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header */}
          <div className="flex-shrink-0">
            <Header title="INFO" user={context?.user} />

            {/* Top Stats Tiles */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/fOIgVq2bFKru/glazecorp" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/fOIgVq2bFKru/glazecorp", "_blank");
                  }
                }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex items-center justify-center text-center h-[80px] relative overflow-hidden hover:bg-zinc-800 transition-colors active:scale-[0.98]"
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-14 h-14 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 animate-[fadeScaleIn_0.4s_ease-out_0.1s_forwards] opacity-0">
                    <img src="/coins/donut_logo.png" alt="" className="w-full h-full object-cover animate-[spinCoin1_8s_linear_1s_infinite]" />
                  </span>
                </div>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20 pointer-events-none" />
                <div className="relative z-10">
                  <span className="text-xs text-white font-bold whitespace-nowrap drop-shadow-lg">Stake Donut</span>
                </div>
              </button>

              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts", "_blank");
                  }
                }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex items-center justify-center text-center h-[80px] relative overflow-hidden hover:bg-zinc-800 transition-colors active:scale-[0.98]"
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-14 h-14 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 animate-[fadeScaleIn_0.4s_ease-out_0.2s_forwards] opacity-0">
                    <img src="/coins/peeples_logo.png" alt="" className="w-full h-full object-cover animate-[spinCoin2_6s_linear_1.2s_infinite]" />
                  </span>
                </div>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20 pointer-events-none" />
                <div className="relative z-10">
                  <span className="text-xs text-white font-bold whitespace-nowrap drop-shadow-lg">Pool To Mine</span>
                </div>
              </button>

              <button
                onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://farcaster.xyz/miniapps/yetHcJ1rdN-n/franchiser" });
                  } catch (e) {
                    window.open("https://farcaster.xyz/miniapps/yetHcJ1rdN-n/franchiser", "_blank");
                  }
                }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex items-center justify-center text-center h-[80px] relative overflow-hidden hover:bg-zinc-800 transition-colors active:scale-[0.98]"
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-14 h-14 rounded-full overflow-hidden inline-flex items-center justify-center ring-2 ring-zinc-600/50 animate-[fadeScaleIn_0.4s_ease-out_0.3s_forwards] opacity-0">
                    <img src="/coins/franchiser_logo.png" alt="" className="w-full h-full object-cover animate-[spinCoin3_7s_linear_1.4s_infinite]" />
                  </span>
                </div>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20 pointer-events-none" />
                <div className="relative z-10">
                  <span className="text-xs text-white font-bold whitespace-nowrap drop-shadow-lg">Eco Tokens</span>
                </div>
              </button>
            </div>

            {/* Split Buttons - Add App & Notifications */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={handleAddApp}
                disabled={isAddingApp || isAppAdded}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center h-full">
                  {isAddingApp ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold text-white">
                      {isAppAdded ? 'APP ADDED' : 'ADD SPRINKLES'}
                    </span>
                  )}
                </div>
              </button>

              <button
                onClick={handleEnableNotifications}
                disabled={isEnablingNotifications || notificationsEnabled}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center h-full">
                  {isEnablingNotifications ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold text-white">
                      {notificationsEnabled ? 'NOTIFICATIONS ON' : 'NOTIFICATIONS OFF'}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden about-scroll"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            <div className="space-y-3 pb-4">
              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '0ms', animationFillMode: 'forwards' } : {}}>
                <BurnCounterTile sprinklesBurned={sprinklesBurned} donutBurned={donutBurned} isLoading={isBurnLoading} />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '50ms', animationFillMode: 'forwards' } : {}}>
                <GDonutStakedTile 
                  gDonutStaked={gDonutStaked} 
                  isLoading={isGDonutLoading} 
                  stakingData={stakingData}
                  isStakingLoading={isStakingLoading}
                />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '100ms', animationFillMode: 'forwards' } : {}}>
                <HalvingCountdownTile />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '150ms', animationFillMode: 'forwards' } : {}}>
                <DonutInfoTile onClick={() => window.location.href = "/about/donut"} />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '200ms', animationFillMode: 'forwards' } : {}}>
                <SprinklesInfoTile onClick={() => window.location.href = "/about/sprinkles"} />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '250ms', animationFillMode: 'forwards' } : {}}>
                <LinksContractsTile onClick={() => window.location.href = "/about/links-contracts"} />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '300ms', animationFillMode: 'forwards' } : {}}>
                <DonutDashboardTile onClick={async () => {
                  try {
                    await sdk.actions.openUrl({ url: "https://dune.com/xyk/donut-company" });
                  } catch {
                    window.open("https://dune.com/xyk/donut-company", "_blank");
                  }
                }} />
              </div>

              <div className={!hasAnimatedIn ? 'animate-tilePopIn' : ''} style={!hasAnimatedIn ? { opacity: 0, animationDelay: '350ms', animationFillMode: 'forwards' } : {}}>
                <SprinklesDashboardTile 
                  showComingSoon={showComingSoon}
                  onClick={() => {
                    if (!showComingSoon) {
                      setShowComingSoon(true);
                      setTimeout(() => setShowComingSoon(false), 3000);
                    }
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}