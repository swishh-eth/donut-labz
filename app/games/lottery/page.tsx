"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Ticket, Clock, Trophy, HelpCircle, X, Loader2, Shield, Volume2, VolumeX, ChevronDown, Users, History, Sparkles, Gift, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses - UPDATE THESE WITH YOUR ACTUAL ADDRESSES
const DONUT_LOTTERY_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // TODO: Deploy and update
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;

const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Lottery ABI - simplified for the 1 DONUT = 1 ticket model
const LOTTERY_ABI = [
  {
    inputs: [{ name: "ticketCount", type: "uint256" }],
    name: "buyTickets",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentRound",
    outputs: [{
      type: "tuple",
      components: [
        { name: "roundId", type: "uint256" },
        { name: "totalTickets", type: "uint256" },
        { name: "prizePool", type: "uint256" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "winner", type: "address" },
        { name: "claimed", type: "bool" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerTickets",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "getRound",
    outputs: [{
      type: "tuple",
      components: [
        { name: "roundId", type: "uint256" },
        { name: "totalTickets", type: "uint256" },
        { name: "prizePool", type: "uint256" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "winner", type: "address" },
        { name: "claimed", type: "bool" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "claimPrize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

// Ticket preset amounts
const TICKET_PRESETS = [1, 5, 10, 25, 50, 100];

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState<string>("1000");
  
  const { data: allowance, refetch: refetchLocal } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_LOTTERY_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (amount: string) => {
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_LOTTERY_ADDRESS, parseUnits(amount, 18)]
    }, {
      onSuccess: () => {
        refetchLocal();
        refetchAllowance();
      }
    });
  };

  const isApproved = allowance && allowance > BigInt(0);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Token Approvals
          </h2>
          <p className="text-[10px] text-gray-500 mb-3">Approve DONUT for lottery tickets.</p>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍩</span>
                <div>
                  <div className="text-sm font-bold text-white">DONUT</div>
                  <div className="text-[10px] text-gray-500">
                    {isApproved 
                      ? `Approved: ${parseFloat(formatUnits(allowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : "Not approved"
                    }
                  </div>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full", isApproved ? "bg-green-500" : "bg-red-500")} />
            </div>
            
            <div className="mb-2">
              <input
                type="number"
                value={approvalAmount}
                onChange={(e) => setApprovalAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
            
            <button
              onClick={() => handleApprove(approvalAmount)}
              disabled={isPending}
              className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold"
            >
              {isPending ? "..." : "Approve"}
            </button>
          </div>
          
          <button onClick={onClose} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Done</button>
        </div>
      </div>
    </div>
  );
}

// Falling donut for confetti
function FallingDonut({ delay, left }: { delay: number; left: number }) {
  return (
    <div
      className="confetti-donut absolute text-2xl pointer-events-none"
      style={{
        left: `${left}%`,
        animationDelay: `${delay}s`,
      }}
    >
      🍩
    </div>
  );
}

export default function LotteryPage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [ticketAmount, setTicketAmount] = useState<string>("10");
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasShownApproval, setHasShownApproval] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState("--:--:--");
  
  // Purchase state
  const [isBuying, setIsBuying] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  
  // Mock data for demo - replace with actual contract reads
  const [currentRound, setCurrentRound] = useState({
    roundId: BigInt(1),
    totalTickets: BigInt(12450),
    prizePool: parseUnits("12450", 18),
    startTime: BigInt(Math.floor(Date.now() / 1000) - 3600 * 20),
    endTime: BigInt(Math.floor(Date.now() / 1000) + 3600 * 4),
    winner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    claimed: false,
  });
  const [userTickets, setUserTickets] = useState(0);
  const [pastWinners, setPastWinners] = useState([
    { roundId: 0, winner: "donutlover.eth", amount: "8,234", pfpUrl: "" },
    { roundId: 0, winner: "baker.fc", amount: "15,672", pfpUrl: "" },
    { roundId: 0, winner: "crypto_chef", amount: "5,891", pfpUrl: "" },
  ]);
  
  const { address, isConnected } = useAccount();

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playTicketSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }, [isMuted]);

  const playWinSound = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {}
  }, [isMuted]);

  // Load context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // SDK ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const end = Number(currentRound.endTime);
      const diff = Math.max(0, end - now);
      
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      
      setTimeRemaining(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentRound.endTime]);

  // Read token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_LOTTERY_ADDRESS] : undefined,
  });

  // Auto-show approvals
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals && !hasShownApproval) {
      const timer = setTimeout(() => {
        setShowApprovals(true);
        setHasShownApproval(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals, hasShownApproval]);

  // Contract writes
  const { writeContract: writeBuyTickets, isPending: isBuyPending, error: buyError, reset: resetBuy } = useWriteContract();

  // Handle buy tickets
  const handleBuyTickets = () => {
    if (!isConnected || !address) return;
    if (isBuying || isBuyPending) return;
    
    const amount = parseInt(ticketAmount || "0");
    if (amount <= 0) {
      setErrorMessage("Enter ticket amount");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }
    
    const amountWei = parseUnits(ticketAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Insufficient DONUT balance");
      setTimeout(() => setErrorMessage(null), 2000);
      return;
    }

    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      return;
    }

    setIsBuying(true);
    
    // For demo, simulate purchase
    setTimeout(() => {
      playTicketSound();
      setUserTickets(prev => prev + amount);
      setCurrentRound(prev => ({
        ...prev,
        totalTickets: prev.totalTickets + BigInt(amount),
        prizePool: prev.prizePool + amountWei,
      }));
      setIsBuying(false);
      setPurchaseSuccess(true);
      setShowConfetti(true);
      try { sdk.haptics.impactOccurred("medium"); } catch {}
      
      setTimeout(() => {
        setPurchaseSuccess(false);
        setShowConfetti(false);
      }, 3000);
    }, 1500);
    
    // Actual contract call (uncomment when contract is deployed):
    // writeBuyTickets({
    //   address: DONUT_LOTTERY_ADDRESS,
    //   abi: LOTTERY_ABI,
    //   functionName: "buyTickets",
    //   args: [BigInt(amount)]
    // });
  };

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const totalTickets = Number(currentRound.totalTickets);
  const prizePool = parseFloat(formatUnits(currentRound.prizePool, 18));
  const winChance = totalTickets > 0 ? ((userTickets / totalTickets) * 100) : 0;

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti-donut { animation: confetti-fall 3s linear forwards; }
        
        @keyframes pot-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .pot-pulse { animation: pot-pulse 2s ease-in-out infinite; }
        
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
          50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.6); }
        }
        .glow-box { animation: glow 2s ease-in-out infinite; }
        
        @keyframes ticket-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .ticket-float { animation: ticket-float 3s ease-in-out infinite; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <FallingDonut key={i} delay={Math.random() * 0.5} left={Math.random() * 100} />
          ))}
        </div>
      )}

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">DAILY LOTTERY</h1>
            <span className="text-[9px] bg-green-500 text-black px-1.5 py-0.5 rounded-full font-bold animate-pulse">LIVE</span>
          </div>
          {context?.user?.pfpUrl ? (
            <img src={context.user.pfpUrl} alt="" className="h-7 w-7 rounded-full border border-zinc-700 object-cover" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
        </div>

        {/* Prize Pool Display */}
        <div className="glow-box bg-gradient-to-br from-amber-950/50 via-zinc-900 to-orange-950/50 border-2 border-amber-500/40 rounded-2xl p-4 mb-3">
          <div className="text-center">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Prize Pool</div>
            <div className="pot-pulse flex items-center justify-center gap-3 mb-2">
              <span className="text-4xl">🍩</span>
              <span className="text-5xl font-black text-amber-400" style={{ textShadow: '0 0 20px rgba(251, 191, 36, 0.5)' }}>
                {prizePool.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-center gap-4 text-[11px]">
              <div className="flex items-center gap-1 text-gray-400">
                <Ticket className="w-3 h-3" />
                <span>{totalTickets.toLocaleString()} tickets</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <Users className="w-3 h-3" />
                <span>{Math.floor(totalTickets / 8)}+ players</span>
              </div>
            </div>
          </div>
          
          {/* Countdown */}
          <div className="mt-3 pt-3 border-t border-amber-500/20">
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-gray-400">Drawing in</span>
              <span className="text-xl font-bold font-mono text-white">{timeRemaining}</span>
            </div>
          </div>
        </div>

        {/* User Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Balance</div>
            <div className="text-sm font-bold text-amber-400">🍩{balance.toFixed(0)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Your Tickets</div>
            <div className="text-sm font-bold text-white ticket-float">{userTickets}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Win Chance</div>
            <div className="text-sm font-bold text-green-400">{winChance.toFixed(2)}%</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-3">
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={cn(
              "p-2 rounded-lg border transition-colors",
              isMuted ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-zinc-900 border-zinc-800"
            )}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowApprovals(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <Shield className="w-4 h-4" />
          </button>
          <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <History className="w-4 h-4" />
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Ticket Selection */}
        <div className="flex-1 flex flex-col">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-3">
            <div className="text-[10px] text-gray-400 mb-2 text-center">1 DONUT = 1 Ticket</div>
            
            {/* Quick select buttons */}
            <div className="grid grid-cols-6 gap-1.5 mb-3">
              {TICKET_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setTicketAmount(preset.toString());
                    playTicketSound();
                    try { sdk.haptics.impactOccurred("light"); } catch {}
                  }}
                  className={cn(
                    "py-2 rounded-lg font-bold text-sm transition-all",
                    ticketAmount === preset.toString()
                      ? "bg-amber-500 text-black"
                      : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            
            {/* Custom amount input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={ticketAmount}
                  onChange={(e) => setTicketAmount(e.target.value)}
                  placeholder="Custom amount"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-center text-lg font-bold focus:outline-none focus:border-amber-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🍩</span>
              </div>
              <button
                onClick={() => {
                  const max = Math.floor(balance);
                  setTicketAmount(max.toString());
                }}
                className="px-3 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-amber-400 text-xs font-bold hover:bg-zinc-700"
              >
                MAX
              </button>
            </div>
            
            {/* Cost preview */}
            <div className="mt-2 text-center text-[11px] text-gray-500">
              Cost: <span className="text-amber-400 font-bold">{parseInt(ticketAmount || "0").toLocaleString()} DONUT</span>
              {parseInt(ticketAmount || "0") > 0 && totalTickets > 0 && (
                <span className="ml-2">
                  → <span className="text-green-400">{((parseInt(ticketAmount || "0") / (totalTickets + parseInt(ticketAmount || "0"))) * 100).toFixed(2)}%</span> win chance
                </span>
              )}
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-2 text-center text-red-400 text-sm mb-3">
              {errorMessage}
            </div>
          )}

          {/* How it works summary */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">How It Works</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-400">
              <div className="text-center">
                <div className="text-amber-400 font-bold mb-0.5">1</div>
                Buy tickets with DONUT
              </div>
              <div className="text-center">
                <div className="text-amber-400 font-bold mb-0.5">2</div>
                Wait for daily draw
              </div>
              <div className="text-center">
                <div className="text-amber-400 font-bold mb-0.5">3</div>
                1 winner takes ALL
              </div>
            </div>
          </div>
        </div>

        {/* Buy Button */}
        <div className="pb-1">
          <button
            onClick={handleBuyTickets}
            disabled={isBuying || isBuyPending || !isConnected || parseInt(ticketAmount || "0") <= 0}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-lg transition-all",
              purchaseSuccess
                ? "bg-green-500 text-white"
                : isBuying || isBuyPending
                  ? "bg-zinc-600 text-zinc-300"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400"
            )}
          >
            {purchaseSuccess ? (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" /> Tickets Purchased!
              </span>
            ) : isBuying || isBuyPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Buying tickets...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Ticket className="w-5 h-5" /> Buy {parseInt(ticketAmount || "0").toLocaleString()} Tickets
              </span>
            )}
          </button>
        </div>

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col">
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" /> Past Winners
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">Recent lottery winners</p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {pastWinners.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No winners yet</p>
                  ) : (
                    pastWinners.map((winner, index) => (
                      <div 
                        key={index}
                        className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-400" />
                            <div>
                              <span className="text-sm font-bold text-white">@{winner.winner}</span>
                              <div className="text-[10px] text-gray-500">Round #{index + 1}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-amber-400">🍩{winner.amount}</div>
                            <div className="text-[10px] text-gray-500">Prize</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" /> Daily Lottery
                </h2>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Buy Tickets</div>
                      <div className="text-[11px] text-gray-400">1 DONUT = 1 lottery ticket. Buy as many as you want!</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Daily Draw</div>
                      <div className="text-[11px] text-gray-400">Every 24 hours, one winner is randomly selected on-chain.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-green-400 text-xs">Winner Takes All!</div>
                      <div className="text-[11px] text-gray-400">The entire prize pool goes to ONE lucky winner.</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Provably Fair:</div>
                  <div className="text-[10px] text-gray-400">Winner is selected using on-chain randomness from block hash + VRF, making it impossible to manipulate.</div>
                </div>
                
                <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">No House Edge:</div>
                  <div className="text-[10px] text-gray-400">100% of tickets go to the prize pool. The entire pot goes to the winner!</div>
                </div>
                
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
              </div>
            </div>
          </div>
        )}

        {/* Approvals Modal */}
        {showApprovals && (
          <ApprovalsModal 
            onClose={() => setShowApprovals(false)} 
            refetchAllowance={refetchAllowance}
          />
        )}
      </div>
      <NavBar />
    </main>
  );
}