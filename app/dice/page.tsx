"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Dices, TrendingUp, TrendingDown, Trophy, History, HelpCircle, X, Loader2, CheckCircle, Shield, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const DONUT_DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
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

const DICE_V5_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "target", type: "uint8" },
      { name: "isOver", type: "bool" }
    ],
    name: "placeBet",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "claimExpiredBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "getBet",
    outputs: [{
      type: "tuple",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "target", type: "uint8" },
        { name: "isOver", type: "bool" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "result", type: "uint8" },
        { name: "won", type: "bool" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }, { name: "count", type: "uint256" }],
    name: "getPlayerRecentBets",
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "player", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "target", type: "uint8" },
        { name: "isOver", type: "bool" },
        { name: "commitBlock", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "result", type: "uint8" },
        { name: "won", type: "bool" },
        { name: "payout", type: "uint256" }
      ]
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerBetIds",
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

type OnchainBet = {
  player: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  target: number;
  isOver: boolean;
  commitBlock: bigint;
  status: number;
  result: number;
  won: boolean;
  payout: bigint;
};

// Approvals Modal
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [approvalAmount, setApprovalAmount] = useState("100");
  
  const { data: allowance, refetch } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = () => {
    if (parseFloat(approvalAmount) <= 0) return;
    writeContract({
      address: DONUT_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_DICE_ADDRESS, parseUnits(approvalAmount, 18)]
    }, {
      onSuccess: () => { refetch(); refetchAllowance(); }
    });
  };

  const isApproved = allowance && allowance > BigInt(0);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Token Approvals
          </h2>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍩</span>
                <div>
                  <div className="text-sm font-bold text-white">DONUT</div>
                  <div className="text-[10px] text-gray-500">
                    {isApproved ? `Approved: ${parseFloat(formatUnits(allowance, 18)).toFixed(0)}` : "Not approved"}
                  </div>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full", isApproved ? "bg-green-500" : "bg-red-500")} />
            </div>
            
            <input
              type="number"
              value={approvalAmount}
              onChange={(e) => setApprovalAmount(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold mb-2"
            />
            
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="w-full py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold disabled:opacity-50"
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

export default function DicePage() {
  const readyRef = useRef(false);
  const publicClient = usePublicClient();
  const currentBetIdRef = useRef<string | null>(null); // Track which bet we're polling for
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Initialize audio context on first interaction
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  // Tick sound for slider
  const playTick = () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 1200 + Math.random() * 400; // Slight variation
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    } catch {}
  };

  // Rolling/anticipation sound
  const playRollingTick = () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 800 + Math.random() * 600;
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.03, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.03);
    } catch {}
  };

  // Win sound - happy ascending tones
  const playWinSound = () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6 - major chord arpeggio
      
      frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        const startTime = ctx.currentTime + i * 0.1;
        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
      });
    } catch {}
  };

  // Lose sound - descending tone
  const playLoseSound = () => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {}
  };
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState("1");
  const [target, setTarget] = useState(50);
  const [animatedTarget, setAnimatedTarget] = useState(50); // For animation during rolling
  const [prediction, setPrediction] = useState<"over" | "under">("over");
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [lastResult, setLastResult] = useState<{ result: number; won: boolean; payout: bigint } | null>(null);
  const [streak, setStreak] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "bet">("none");
  const [isMuted, setIsMuted] = useState(false);

  const { address, isConnected } = useAccount();

  // Load Farcaster context
  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as any);
      } catch {}
    };
    load();
  }, []);

  // Fetch current block
  useEffect(() => {
    const fetch = async () => {
      if (!publicClient) return;
      try {
        const block = await publicClient.getBlockNumber();
        setCurrentBlock(Number(block));
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // Calculate multiplier
  const winChance = prediction === "over" ? 100 - target : target;
  const multiplier = winChance > 0 ? (98 / winChance).toFixed(2) : "0.00";
  const potentialWin = (parseFloat(betAmount || "0") * parseFloat(multiplier)).toFixed(2);

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
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  // Read recent bets
  const { data: recentBets, refetch: refetchBets } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DICE_V5_ABI,
    functionName: "getPlayerRecentBets",
    args: address ? [address, BigInt(20)] : undefined,
  });

  const { data: playerBetIds } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DICE_V5_ABI,
    functionName: "getPlayerBetIds",
    args: address ? [address] : undefined,
  });

  // Auto-show approvals if needed
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals) {
      setTimeout(() => setShowApprovals(true), 500);
    }
  }, [isConnected, allowance, showApprovals]);

  // Initialize SDK
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  // Animate slider while rolling
  useEffect(() => {
    if (!isRolling) {
      setAnimatedTarget(target);
      return;
    }
    
    let frame: number;
    let direction = 1;
    let current = target;
    let tickCounter = 0;
    
    const animate = () => {
      // Bounce between 10 and 90
      current += direction * (Math.random() * 8 + 2);
      
      if (current >= 90) {
        current = 90;
        direction = -1;
      } else if (current <= 10) {
        current = 10;
        direction = 1;
      }
      
      setAnimatedTarget(Math.round(current));
      
      // Play tick sound every few frames
      tickCounter++;
      if (tickCounter % 4 === 0) {
        playRollingTick();
      }
      
      frame = requestAnimationFrame(animate);
    };
    
    // Start with a small delay
    const timeout = setTimeout(() => {
      frame = requestAnimationFrame(animate);
    }, 100);
    
    return () => {
      clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isRolling, target]);

  // Haptic feedback on slider change
  const handleTargetChange = (newTarget: number) => {
    if (newTarget !== target) {
      setTarget(newTarget);
      playTick();
      try {
        sdk.haptics.impactOccurred("light");
      } catch {}
    }
  };

  const { writeContract: writePlaceBet, isPending: isPlacePending } = useWriteContract();
  const { writeContract: writeClaim, isPending: isClaimPending } = useWriteContract();

  // Poll for result after bet is placed
  const pollForResult = async (betId: bigint) => {
    const betIdStr = betId.toString();
    
    // Set this as the current bet we're polling for
    currentBetIdRef.current = betIdStr;
    
    console.log("Starting poll for betId:", betIdStr);
    
    // Wait for block to advance
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      // Check if we're still polling for this bet (not a newer one)
      if (currentBetIdRef.current !== betIdStr) {
        console.log("Stopping poll for old bet:", betIdStr, "current is:", currentBetIdRef.current);
        return;
      }
      
      try {
        // Call API to trigger reveal
        const apiRes = await fetch(`/api/reveal?game=dice`);
        const apiData = await apiRes.json();
        console.log("API response:", apiData);
        
        // If API just revealed something, wait a moment for chain to update
        if (apiData?.results?.dice?.revealed?.length > 0) {
          console.log("API revealed bets, waiting 2s for chain...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Check bet status directly with fresh read
        const bet = await publicClient?.readContract({
          address: DONUT_DICE_ADDRESS,
          abi: DICE_V5_ABI,
          functionName: "getBet",
          args: [betId],
          blockTag: 'latest', // Force latest block
        }) as OnchainBet;
        
        const status = Number(bet.status);
        const result = Number(bet.result);
        const won = Boolean(bet.won);
        
        console.log("Poll attempt", attempts, "- betId:", betIdStr, "status:", status, "result:", result, "won:", won);
        
        if (status === 2) {
          // Double check we're still on this bet
          if (currentBetIdRef.current !== betIdStr) {
            console.log("Bet revealed but we moved on, ignoring");
            return;
          }
          
          console.log("🎉 Bet revealed! Updating UI...");
          
          // Force synchronous state updates
          flushSync(() => {
            setLastResult({
              result: result,
              won: won,
              payout: bet.payout
            });
            setIsRolling(false);
          });
          
          if (won) {
            console.log("Player won! Showing confetti");
            playWinSound();
            flushSync(() => {
              setStreak(prev => prev + 1);
              setShowConfetti(true);
            });
            try { sdk.haptics.impactOccurred("heavy"); } catch {}
            setTimeout(() => setShowConfetti(false), 3000);
          } else {
            console.log("Player lost");
            playLoseSound();
            flushSync(() => {
              setStreak(0);
            });
            try { sdk.haptics.impactOccurred("heavy"); } catch {}
          }
          
          refetchBets();
          refetchBalance();
          currentBetIdRef.current = null;
          
          console.log("Done updating state");
          return;
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Timeout
    console.log("Polling timed out for bet:", betIdStr);
    if (currentBetIdRef.current === betIdStr) {
      setErrorMessage("Timeout - check history");
      setIsRolling(false);
      currentBetIdRef.current = null;
    }
  };

  const handleRoll = async () => {
    if (!isConnected || !address) return;
    if (isRolling || isPlacePending) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 1) {
      setErrorMessage("Bet must be 0.1 - 1 DONUT");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }
    
    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) {
      setErrorMessage("Insufficient balance");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (!allowance || allowance < amountWei) {
      setShowApprovals(true);
      return;
    }

    // Reset state for new bet
    currentBetIdRef.current = null; // Clear any old polling
    setLastResult(null);
    setErrorMessage(null);
    setIsRolling(true);
    
    console.log("Starting new bet...");
    
    writePlaceBet({
      address: DONUT_DICE_ADDRESS,
      abi: DICE_V5_ABI,
      functionName: "placeBet",
      args: [DONUT_TOKEN_ADDRESS, amountWei, target, prediction === "over"]
    }, {
      onSuccess: async (hash) => {
        console.log("Tx submitted:", hash);
        try {
          // Wait for receipt
          const receipt = await publicClient?.waitForTransactionReceipt({ hash });
          console.log("Tx confirmed:", receipt?.transactionHash);
          
          // Get betId from event
          const log = receipt?.logs.find(l => 
            l.address.toLowerCase() === DONUT_DICE_ADDRESS.toLowerCase()
          );
          
          if (log?.topics[1]) {
            const betId = BigInt(log.topics[1]);
            console.log("BetId:", betId.toString());
            pollForResult(betId);
          } else {
            setErrorMessage("Could not get bet ID");
            setIsRolling(false);
          }
        } catch (e) {
          console.error("Error:", e);
          setErrorMessage("Transaction failed");
          setIsRolling(false);
        }
      },
      onError: (error) => {
        console.error("Write error:", error);
        const msg = error.message || "";
        if (msg.includes("rejected")) {
          setErrorMessage("Transaction cancelled");
        } else {
          setErrorMessage("Transaction failed");
        }
        setIsRolling(false);
        setTimeout(() => setErrorMessage(null), 3000);
      }
    });
  };

  const handleClaimExpired = (betId: bigint) => {
    writeClaim({
      address: DONUT_DICE_ADDRESS,
      abi: DICE_V5_ABI,
      functionName: "claimExpiredBet",
      args: [betId]
    }, {
      onSuccess: () => { refetchBets(); refetchBalance(); }
    });
  };

  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-5px) rotate(-5deg); }
          50% { transform: translateX(5px) rotate(5deg); }
          75% { transform: translateX(-5px) rotate(-5deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
          50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.6); }
        }
        @keyframes number-reveal {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-60px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .dice-shake { animation: shake 0.1s infinite; }
        .glow-pulse { animation: glow-pulse 1s ease-in-out infinite; }
        .number-reveal { animation: number-reveal 0.3s ease-out forwards; }
        .confetti { animation: confetti-fall 3s linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="confetti absolute text-2xl"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-60px',
                animationDelay: `${Math.random() * 1}s`,
              }}
            >
              🍩
            </div>
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Sugar Cubes</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 animate-pulse">LIVE</span>
          </div>
          {context?.user?.pfpUrl ? (
            <img src={context.user.pfpUrl} alt="" className="w-7 h-7 rounded-full border border-zinc-700" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
        </div>

        {/* Token selector */}
        <div className="flex gap-2 mb-2">
          <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-amber-500 text-black">
            🍩 DONUT
          </button>
          <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-zinc-900 border border-zinc-800 text-gray-600 opacity-50">
            ✨ SPRINKLES <span className="text-[8px]">SOON</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">BALANCE</div>
            <div className="text-sm font-bold">🍩{balance.toFixed(0)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">STREAK</div>
            <div className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" />{streak}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500">MULTIPLIER</div>
            <div className="text-sm font-bold text-green-400">{multiplier}x</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={cn(
              "p-2 rounded-lg border",
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

        {/* Dice result */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            className={cn(
              "relative w-24 h-24 rounded-full flex items-center justify-center transition-all",
              isRolling && "dice-shake",
              lastResult?.won === true && "bg-green-500/20 border-2 border-green-500",
              lastResult?.won === false && "bg-red-500/20 border-2 border-red-500",
              !lastResult && !isRolling && "bg-zinc-900 border-2 border-zinc-700"
            )}
          >
            {isRolling ? (
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
            ) : lastResult ? (
              <div className="number-reveal flex flex-col items-center">
                <span className={cn("text-3xl font-black", lastResult.won ? "text-green-400" : "text-red-400")}>
                  {lastResult.result}
                </span>
                <span className={cn("text-[10px] font-bold", lastResult.won ? "text-green-400" : "text-red-400")}>
                  {lastResult.won ? "WIN!" : "LOSE"}
                </span>
              </div>
            ) : (
              <Dices className="w-10 h-10 text-zinc-600" />
            )}
            {lastResult?.won && <div className="absolute inset-0 rounded-full glow-pulse pointer-events-none" />}
          </div>

          {isRolling && (
            <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for result...
            </div>
          )}

          {errorMessage && (
            <div className="mt-2 text-xs text-red-400">{errorMessage}</div>
          )}

          <div className="text-center mt-2">
            <div className="text-xs text-gray-400">
              Roll {prediction === "over" ? "OVER" : "UNDER"} <span className="text-white font-bold text-lg">{target}</span>
            </div>
            <div className="text-[10px] text-gray-500">
              {winChance}% chance • Win 🍩{potentialWin}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2 pb-1">
          {/* Target slider */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-gray-400">Target</span>
              <span className={cn(
                "text-xs font-bold transition-all",
                isRolling && "text-amber-400"
              )}>
                {isRolling ? animatedTarget : target}
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="98"
              value={isRolling ? animatedTarget : target}
              onChange={(e) => handleTargetChange(parseInt(e.target.value))}
              disabled={isRolling}
              className={cn(
                "w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50 transition-all",
                isRolling && "accent-amber-400"
              )}
            />
          </div>

          {/* Under/Over + Bet */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPrediction("under")}
                disabled={isRolling}
                className={cn(
                  "w-12 h-12 rounded-lg flex flex-col items-center justify-center",
                  prediction === "under" ? "bg-red-500 text-white" : "bg-zinc-800 border border-zinc-700 text-gray-400"
                )}
              >
                <TrendingDown className="w-4 h-4" />
                <span className="text-[8px] font-bold">UNDER</span>
              </button>

              <button
                onClick={() => setPrediction("over")}
                disabled={isRolling}
                className={cn(
                  "w-12 h-12 rounded-lg flex flex-col items-center justify-center",
                  prediction === "over" ? "bg-green-500 text-white" : "bg-zinc-800 border border-zinc-700 text-gray-400"
                )}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="text-[8px] font-bold">OVER</span>
              </button>

              <div className="flex-1">
                {expandedPanel === "bet" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex gap-1">
                        {["0.25", "0.5", "0.75", "1"].map((val) => (
                          <button
                            key={val}
                            onClick={() => setBetAmount(val)}
                            className={cn(
                              "flex-1 py-1.5 text-[10px] rounded border font-bold",
                              betAmount === val ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-800 text-gray-400 border-zinc-700"
                            )}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={betAmount}
                        onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBetAmount(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-bold"
                        disabled={isRolling}
                      />
                    </div>
                    <button onClick={() => setExpandedPanel("none")} className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center">
                      <span className="text-[8px] text-gray-500">BET</span>
                      <span className="text-sm font-bold text-amber-400">{betAmount}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedPanel("bet")}
                    className="w-full h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center gap-2"
                  >
                    <span className="text-[10px] text-gray-500">BET</span>
                    <span className="text-lg font-bold text-amber-400">{betAmount}</span>
                    <span className="text-[10px] text-gray-500">🍩</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Roll button */}
          <button
            onClick={handleRoll}
            disabled={isRolling || isPlacePending || !isConnected || parseFloat(betAmount || "0") <= 0}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-lg transition-all",
              isRolling || isPlacePending ? "bg-zinc-500 text-zinc-300" : "bg-white text-black hover:bg-gray-100"
            )}
          >
            {isRolling ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Rolling...
              </span>
            ) : isPlacePending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Confirm in wallet...
              </span>
            ) : (
              "ROLL DICE"
            )}
          </button>
        </div>

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col">
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" /> Bet History
                </h2>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {!recentBets || (recentBets as OnchainBet[]).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No bets yet</p>
                  ) : (
                    (recentBets as OnchainBet[]).map((bet, index) => {
                      const isPending = Number(bet.status) === 1;
                      const betIds = playerBetIds as bigint[] | undefined;
                      const betId = betIds ? betIds[betIds.length - 1 - index] : null;
                      
                      if (isPending) {
                        const expiryBlock = Number(bet.commitBlock) + 256;
                        const blocksRemaining = Math.max(0, expiryBlock - currentBlock);
                        const isExpired = currentBlock > 0 && blocksRemaining === 0;
                        
                        return (
                          <div key={index} className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                <span className="text-xs text-amber-400 font-bold">Pending</span>
                              </div>
                              <span className="text-sm font-bold">{parseFloat(formatUnits(bet.amount, 18)).toFixed(2)} 🍩</span>
                            </div>
                            {isExpired && betId && (
                              <button
                                onClick={() => handleClaimExpired(betId)}
                                disabled={isClaimPending}
                                className="w-full mt-2 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold"
                              >
                                {isClaimPending ? "..." : "Claim 98% Back"}
                              </button>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <div key={index} className={cn(
                          "p-2 rounded-lg border",
                          bet.won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xl font-bold", bet.won ? "text-green-400" : "text-red-400")}>
                                {bet.result}
                              </span>
                              <span className="text-xs text-gray-400">{bet.isOver ? ">" : "<"} {bet.target}</span>
                            </div>
                            <span className={cn("text-sm font-bold", bet.won ? "text-green-400" : "text-red-400")}>
                              {bet.won ? `+${parseFloat(formatUnits(bet.payout, 18)).toFixed(2)}` : `-${parseFloat(formatUnits(bet.amount, 18)).toFixed(2)}`} 🍩
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                <button onClick={() => setShowHistory(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
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
                <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Dices className="w-4 h-4" /> How to Play
                </h2>
                <div className="space-y-2 text-sm text-gray-400">
                  <p>1. Set your target number (2-98)</p>
                  <p>2. Choose OVER or UNDER</p>
                  <p>3. Set your bet amount</p>
                  <p>4. Roll and wait for result!</p>
                </div>
                <div className="mt-3 p-2 bg-zinc-900 rounded-lg text-[10px] text-gray-500">
                  <p>• 2% house edge on wins</p>
                  <p>• House reveals automatically</p>
                  <p>• 100% on-chain & provably fair</p>
                </div>
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
              </div>
            </div>
          </div>
        )}

        {showApprovals && <ApprovalsModal onClose={() => setShowApprovals(false)} refetchAllowance={refetchAllowance} />}
      </div>
      <NavBar />
    </main>
  );
}