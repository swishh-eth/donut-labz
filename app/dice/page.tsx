"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, decodeAbiParameters } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Dices, TrendingUp, TrendingDown, Trophy, History, HelpCircle, X, Loader2, CheckCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// Contract addresses
const DONUT_DICE_ADDRESS = "0xD6f1Eb5858efF6A94B853251BE2C27c4038BB7CE" as const;
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const SPRINKLES_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const SUPPORTED_TOKENS = {
  DONUT: {
    address: DONUT_TOKEN_ADDRESS,
    symbol: "DONUT",
    emoji: "🍩",
    enabled: true,
  },
  SPRINKLES: {
    address: SPRINKLES_TOKEN_ADDRESS,
    symbol: "SPRINKLES", 
    emoji: "✨",
    enabled: false,
  },
} as const;

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

// New V5 ABI - simplified, no commit hash
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
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerBetIds",
    outputs: [{ type: "uint256[]" }],
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
    inputs: [{ name: "token", type: "address" }],
    name: "getBalance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "betId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "target", type: "uint8" },
      { indexed: false, name: "isOver", type: "bool" },
      { indexed: false, name: "commitBlock", type: "uint256" }
    ],
    name: "BetPlaced",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "betId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "blockHash", type: "bytes32" },
      { indexed: false, name: "result", type: "uint8" },
      { indexed: false, name: "won", type: "bool" },
      { indexed: false, name: "payout", type: "uint256" }
    ],
    name: "BetRevealed",
    type: "event"
  }
] as const;

type OnchainBet = {
  player: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  target: number;
  isOver: boolean;
  commitBlock: bigint;
  status: number; // 0=None, 1=Pending, 2=Revealed, 3=Expired
  result: number;
  won: boolean;
  payout: bigint;
};

// Approvals Modal Component
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [donutApprovalAmount, setDonutApprovalAmount] = useState<string>("100");
  
  const { data: donutAllowance, refetch: refetchDonut } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleApprove = (tokenAddress: `0x${string}`, amount: string) => {
    const parsedAmount = parseFloat(amount || "0");
    if (parsedAmount <= 0) return;
    
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_DICE_ADDRESS, parseUnits(amount, 18)]
    }, {
      onSuccess: () => {
        refetchDonut();
        refetchAllowance();
      }
    });
  };

  const handleRevoke = (tokenAddress: `0x${string}`) => {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_DICE_ADDRESS, BigInt(0)]
    }, {
      onSuccess: () => {
        refetchDonut();
        refetchAllowance();
      }
    });
  };

  const donutApproved = donutAllowance && donutAllowance > BigInt(0);

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
          <p className="text-[10px] text-gray-500 mb-3">Approve tokens for the Dice contract.</p>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍩</span>
                <div>
                  <div className="text-sm font-bold text-white">DONUT</div>
                  <div className="text-[10px] text-gray-500">
                    {donutApproved 
                      ? `Approved: ${parseFloat(formatUnits(donutAllowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "Not approved"
                    }
                  </div>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full", donutApproved ? "bg-green-500" : "bg-red-500")} />
            </div>
            
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={donutApprovalAmount}
                  onChange={(e) => setDonutApprovalAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-gray-500">DONUT</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(DONUT_TOKEN_ADDRESS, donutApprovalAmount)}
                disabled={isPending || parseFloat(donutApprovalAmount || "0") <= 0}
                className="flex-1 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                {isPending ? "..." : "Approve"}
              </button>
              {donutApproved && (
                <button
                  onClick={() => handleRevoke(DONUT_TOKEN_ADDRESS)}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {isPending ? "..." : "Revoke"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex gap-2">
              <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-400">
                When you run out of approval, tap the <span className="font-bold">shield icon</span> to add more.
              </p>
            </div>
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
  
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("1");
  const [target, setTarget] = useState<number>(50);
  const [prediction, setPrediction] = useState<"over" | "under">("over");
  const [selectedToken] = useState<"DONUT" | "SPRINKLES">("DONUT");
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showVerify, setShowVerify] = useState<OnchainBet | null>(null);
  const [pendingBetId, setPendingBetId] = useState<bigint | null>(null);
  const [betStep, setBetStep] = useState<"idle" | "placing" | "waiting" | "complete">("idle");
  const [lastResult, setLastResult] = useState<{ result: number; won: boolean; payout: bigint } | null>(null);
  const [streak, setStreak] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"none" | "bet">("none");

  const { address, isConnected } = useAccount();

  // Load Farcaster context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // Fetch current block number
  useEffect(() => {
    const fetchBlock = async () => {
      if (!publicClient) return;
      try {
        const block = await publicClient.getBlockNumber();
        setCurrentBlock(Number(block));
      } catch {}
    };
    
    fetchBlock();
    const interval = setInterval(fetchBlock, 5000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // Calculate multiplier based on win chance
  const winChance = prediction === "over" ? 100 - target : target;
  const multiplier = winChance > 0 ? (98 / winChance).toFixed(2) : "0.00";
  const potentialWin = (parseFloat(betAmount || "0") * parseFloat(multiplier)).toFixed(2);

  const currentToken = SUPPORTED_TOKENS[selectedToken];
  const currentTokenAddress = currentToken.address;

  // Read token balance
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: currentTokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: currentTokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  // Auto-show approvals modal if no allowance
  useEffect(() => {
    if (isConnected && allowance !== undefined && allowance === BigInt(0) && !showApprovals) {
      const timer = setTimeout(() => setShowApprovals(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, allowance, showApprovals]);

  // Refetch on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchBalance();
        refetchAllowance();
        refetchBets();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchBalance, refetchAllowance]);

  // Read player's recent bets
  const { data: recentBets, refetch: refetchBets } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DICE_V5_ABI,
    functionName: "getPlayerRecentBets",
    args: address ? [address, BigInt(20)] : undefined,
  });

  // Read player's bet IDs
  const { data: playerBetIds } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DICE_V5_ABI,
    functionName: "getPlayerBetIds",
    args: address ? [address] : undefined,
  });

  // Contract writes
  const { data: placeBetHash, writeContract: writePlaceBet, isPending: isPlacePending, reset: resetPlaceBet, error: placeError } = useWriteContract();
  const { isSuccess: isPlaceSuccess } = useWaitForTransactionReceipt({ hash: placeBetHash });

  const { writeContract: writeClaim, isPending: isClaimPending } = useWriteContract();

  // Handle place bet error
  useEffect(() => {
    if (placeError && betStep === "placing") {
      const msg = placeError.message || "Bet failed";
      if (msg.includes("User rejected") || msg.includes("rejected")) {
        setErrorMessage("Transaction cancelled");
      } else if (msg.includes("Insufficient contract balance")) {
        setErrorMessage("Pool is empty - try a smaller bet");
      } else {
        setErrorMessage("Bet failed - try again");
      }
      setBetStep("idle");
      setPendingBetId(null);
      resetPlaceBet();
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [placeError, betStep, resetPlaceBet]);

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

  // Handle place bet success - start polling for result
  useEffect(() => {
    if (isPlaceSuccess && betStep === "placing" && placeBetHash) {
      setBetStep("waiting");
      
      const getBetIdAndPoll = async () => {
        try {
          const receipt = await publicClient?.getTransactionReceipt({ hash: placeBetHash });
          
          // Parse BetPlaced event to get betId
          const betPlacedLog = receipt?.logs.find(log => 
            log.address.toLowerCase() === DONUT_DICE_ADDRESS.toLowerCase()
          );
          
          if (betPlacedLog && betPlacedLog.topics[1]) {
            const betId = BigInt(betPlacedLog.topics[1]);
            setPendingBetId(betId);
            
            // Poll for result - call API to trigger reveal
            const pollForResult = async () => {
              // Wait 3 seconds for next block before first poll
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              const maxAttempts = 60; // ~60 seconds
              let attempts = 0;
              
              while (attempts < maxAttempts) {
                try {
                  // Call the reveal API to trigger house reveal
                  const response = await fetch(`/api/reveal?game=dice`);
                  const data = await response.json();
                  console.log("Reveal API response:", data);
                  
                  // Then check if bet was revealed
                  const bet = await publicClient?.readContract({
                    address: DONUT_DICE_ADDRESS,
                    abi: DICE_V5_ABI,
                    functionName: "getBet",
                    args: [betId],
                  }) as OnchainBet;
                  
                  console.log("Bet status check:", {
                    betId: betId.toString(),
                    status: bet.status,
                    result: bet.result,
                    won: bet.won,
                    payout: bet.payout?.toString()
                  });
                  
                  if (bet.status === 2) { // Revealed
                    setLastResult({
                      result: bet.result,
                      won: bet.won,
                      payout: bet.payout
                    });
                    
                    if (bet.won) {
                      setStreak(prev => prev + 1);
                      setShowConfetti(true);
                      try { 
                        await sdk.haptics.impactOccurred("heavy");
                        setTimeout(() => sdk.haptics.impactOccurred("medium"), 100);
                      } catch {}
                      setTimeout(() => setShowConfetti(false), 3000);
                    } else {
                      setStreak(0);
                      try { await sdk.haptics.impactOccurred("heavy"); } catch {}
                    }
                    
                    setBetStep("complete");
                    refetchBets();
                    refetchBalance();
                    
                    setTimeout(() => {
                      setBetStep("idle");
                      setPendingBetId(null);
                      resetPlaceBet();
                    }, 3000);
                    
                    return;
                  }
                } catch (e) {
                  console.error("Poll error:", e);
                }
                
                attempts++;
                // Wait 1 second before next attempt
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              // Timeout - bet is still pending
              setErrorMessage("Waiting for reveal... check history");
              setBetStep("idle");
              setPendingBetId(null);
            };
            
            pollForResult();
          }
        } catch (e) {
          console.error("Failed to get betId:", e);
          setBetStep("idle");
        }
      };
      
      getBetIdAndPoll();
    }
  }, [isPlaceSuccess, betStep, placeBetHash, publicClient, refetchBets, refetchBalance, resetPlaceBet]);

  const handleRoll = async () => {
    if (!isConnected || !address) return;
    if (!currentToken.enabled) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > 1) {
      setErrorMessage("Bet must be between 0.1 and 1");
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
      setErrorMessage("Need approval - tap shield icon");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setLastResult(null);
    setErrorMessage(null);
    setBetStep("placing");
    
    // Simple single transaction - no secret needed!
    writePlaceBet({
      address: DONUT_DICE_ADDRESS,
      abi: DICE_V5_ABI,
      functionName: "placeBet",
      args: [currentTokenAddress, amountWei, target, prediction === "over"]
    });
  };

  const handleClaimExpired = (betId: bigint) => {
    writeClaim({
      address: DONUT_DICE_ADDRESS,
      abi: DICE_V5_ABI,
      functionName: "claimExpiredBet",
      args: [betId]
    }, {
      onSuccess: () => {
        refetchBets();
        refetchBalance();
      }
    });
  };

  const isProcessing = betStep !== "idle" && betStep !== "complete";
  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;

  const getStepMessage = () => {
    switch (betStep) {
      case "placing": return "Placing bet...";
      case "waiting": return "Waiting for result...";
      case "complete": return lastResult?.won ? "YOU WIN! 🎉" : "Better luck next time";
      default: return "";
    }
  };

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
          75% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .dice-shake { animation: shake 0.1s infinite; }
        .glow-pulse { animation: glow-pulse 1s ease-in-out infinite; }
        .number-reveal { animation: number-reveal 0.3s ease-out forwards; }
        .confetti { animation: confetti-fall linear forwards; }
      `}</style>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                position: 'absolute',
                left: `${Math.random() * 100}%`,
                top: '-60px',
                fontSize: `${18 + Math.random() * 24}px`,
                animationDelay: `${Math.random() * 1.5}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            >
              {currentToken.emoji}
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
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">DICE</h1>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/30">
              V5
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1 opacity-50">
              <span className="text-[8px] text-gray-500 whitespace-nowrap">Earn GLAZE soon</span>
            </div>
            {context?.user?.pfpUrl ? (
              <img src={context.user.pfpUrl} alt="pfp" className="w-7 h-7 rounded-full border border-zinc-700" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>
        </div>

        {/* Token Selector */}
        <div className="flex gap-2 mb-2 flex-shrink-0">
          <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-amber-500 text-black">
            🍩 DONUT
          </button>
          <button disabled className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-zinc-900 border border-zinc-800 text-gray-600 opacity-50 cursor-not-allowed">
            ✨ SPRINKLES
            <span className="text-[8px] text-gray-500">SOON</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-2 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Balance</div>
            <div className="text-sm font-bold text-white">{currentToken.emoji}{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Streak</div>
            <div className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" />{streak}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Multiplier</div>
            <div className="text-sm font-bold text-green-400">{multiplier}x</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
          <button onClick={() => setShowApprovals(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <Shield className="w-4 h-4 text-white" />
          </button>
          <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <History className="w-4 h-4 text-white" />
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <HelpCircle className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Dice Result */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <div
            className={cn(
              "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
              isProcessing && "dice-shake",
              lastResult?.won === true && "bg-green-500/20 border-2 border-green-500",
              lastResult?.won === false && "bg-red-500/20 border-2 border-red-500",
              !lastResult && !isProcessing && "bg-zinc-900 border-2 border-zinc-700"
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
            ) : lastResult ? (
              <div className="number-reveal flex flex-col items-center">
                <span className={cn("text-3xl font-black", lastResult.won ? "text-green-400" : "text-red-400")}>
                  {lastResult.result > 0 ? lastResult.result : "?"}
                </span>
                <span className={cn("text-[10px] font-bold", lastResult.won ? "text-green-400" : "text-red-400")}>
                  {lastResult.won ? "WIN!" : "LOSE"}
                </span>
              </div>
            ) : (
              <Dices className="w-10 h-10 text-zinc-600" />
            )}
            {lastResult?.won && (
              <div className="absolute inset-0 rounded-full glow-pulse pointer-events-none" />
            )}
          </div>

          {/* Status */}
          {betStep !== "idle" && (
            <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
              {betStep === "complete" && lastResult?.won && <CheckCircle className="w-3 h-3 text-green-400" />}
              {getStepMessage()}
            </div>
          )}

          {errorMessage && (
            <div className="mt-2 text-xs text-red-400">{errorMessage}</div>
          )}

          {/* Target Display */}
          <div className="text-center mt-2">
            <div className="text-xs text-gray-400">
              Roll {prediction === "over" ? "OVER" : "UNDER"} <span className="text-white font-bold text-lg">{target}</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {winChance}% chance • Win {currentToken.emoji}{potentialWin}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 space-y-2 pb-1">
          {/* Target Slider */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">Target</span>
              <span className="text-xs font-bold text-white">{target}</span>
            </div>
            <input
              type="range"
              min="2"
              max="98"
              value={target}
              onChange={(e) => setTarget(parseInt(e.target.value))}
              disabled={isProcessing}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Under/Over + Bet */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPrediction("under")}
                disabled={isProcessing}
                className={cn(
                  "w-12 h-12 rounded-lg flex flex-col items-center justify-center transition-all",
                  prediction === "under" ? "bg-red-500 text-white" : "bg-zinc-800 border border-zinc-700 text-gray-400"
                )}
              >
                <TrendingDown className="w-4 h-4" />
                <span className="text-[8px] font-bold">UNDER</span>
              </button>

              <button
                onClick={() => setPrediction("over")}
                disabled={isProcessing}
                className={cn(
                  "w-12 h-12 rounded-lg flex flex-col items-center justify-center transition-all",
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
                              "flex-1 py-1.5 text-[10px] rounded border transition-colors font-bold",
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
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) setBetAmount(val);
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-sm font-bold"
                        disabled={isProcessing}
                      />
                    </div>
                    <button
                      onClick={() => setExpandedPanel("none")}
                      className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center flex-shrink-0"
                    >
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

          {/* Roll Button */}
          <button
            onClick={handleRoll}
            disabled={isProcessing || !isConnected || parseFloat(betAmount || "0") <= 0 || parseFloat(betAmount || "0") > 1 || parseFloat(betAmount || "0") > balance}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-lg tracking-wide transition-all",
              isProcessing ? "bg-zinc-500 text-zinc-300 cursor-not-allowed" : "bg-white hover:bg-gray-100 text-black"
            )}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {getStepMessage()}
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
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                  <History className="w-4 h-4" /> Bet History
                </h2>
                <p className="text-[10px] text-gray-500 mb-3">All bets are provably fair. House reveals automatically.</p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {!recentBets || (recentBets as OnchainBet[]).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No bets yet</p>
                  ) : (
                    (recentBets as OnchainBet[]).map((bet, index) => {
                      const isPending = bet.status === 1;
                      const betIds = playerBetIds as bigint[] | undefined;
                      const betId = betIds ? betIds[betIds.length - 1 - index] : null;
                      
                      if (isPending) {
                        const expiryBlock = Number(bet.commitBlock) + 256;
                        const blocksRemaining = Math.max(0, expiryBlock - currentBlock);
                        const isExpiredNow = currentBlock > 0 && blocksRemaining === 0;
                        const minutesRemaining = Math.ceil(blocksRemaining * 2 / 60);
                        
                        return (
                          <div key={index} className="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                                <div>
                                  <span className="text-xs text-amber-400 font-bold">Waiting for reveal...</span>
                                  <div className="text-[9px] text-gray-500">{bet.isOver ? ">" : "<"} {bet.target}</div>
                                </div>
                              </div>
                              <div className="text-sm font-bold text-amber-400">
                                {parseFloat(formatUnits(bet.amount, 18)).toFixed(2)} 🍩
                              </div>
                            </div>
                            
                            {isExpiredNow && betId && (
                              <button
                                onClick={() => handleClaimExpired(betId)}
                                disabled={isClaimPending}
                                className="w-full py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold mt-2 disabled:opacity-50"
                              >
                                {isClaimPending ? "Claiming..." : "Claim 98% Back"}
                              </button>
                            )}
                            
                            {!isExpiredNow && (
                              <div className="mt-2 text-[9px] text-gray-500">
                                House should reveal soon. If not, claim back in ~{minutesRemaining} min.
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <div 
                          key={index}
                          className={cn(
                            "p-2 rounded-lg border cursor-pointer hover:opacity-80", 
                            bet.won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                          )}
                          onClick={() => setShowVerify(bet)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xl font-bold", bet.won ? "text-green-400" : "text-red-400")}>{bet.result}</span>
                              <div>
                                <span className="text-xs text-gray-400">{bet.isOver ? ">" : "<"} {bet.target}</span>
                                <div className="text-[9px] text-gray-600">Tap to verify</div>
                              </div>
                            </div>
                            <div className={cn("text-sm font-bold", bet.won ? "text-green-400" : "text-red-400")}>
                              {bet.won ? `+${parseFloat(formatUnits(bet.payout, 18)).toFixed(2)}` : `-${parseFloat(formatUnits(bet.amount, 18)).toFixed(2)}`} 🍩
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[9px] text-gray-500 text-center">
                    Result = keccak256(blockhash + betId) % 100 + 1
                  </p>
                </div>
                <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Verify Modal */}
        {showVerify && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowVerify(null)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowVerify(null)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" /> Verify Bet
                </h2>
                
                <div className="space-y-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Result</div>
                    <div className={cn("text-2xl font-bold", showVerify.won ? "text-green-400" : "text-red-400")}>
                      {showVerify.result} — {showVerify.won ? "WIN" : "LOSE"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {showVerify.isOver ? "Over" : "Under"} {showVerify.target} • {parseFloat(formatUnits(showVerify.amount, 18)).toFixed(0)} DONUT
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Commit Block</div>
                    <div className="text-xs text-white">{showVerify.commitBlock.toString()}</div>
                  </div>

                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-[10px] text-amber-400">
                      ✓ Result: keccak256(blockhash(commitBlock) + betId) % 100 + 1
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1">
                      ✓ No user secret needed - house reveals automatically
                    </p>
                  </div>
                </div>

                <button onClick={() => setShowVerify(null)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
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
                  <Dices className="w-4 h-4" /> How to Play
                </h2>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Set Target (2-98)</div>
                      <div className="text-[11px] text-gray-400">Use the slider to pick your number.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Pick Over or Under</div>
                      <div className="text-[11px] text-gray-400">Guess if the roll will be higher or lower.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Roll & Wait</div>
                      <div className="text-[11px] text-gray-400">One transaction - house reveals automatically!</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">Fee Structure:</div>
                  <div className="text-[10px] text-gray-400">On Win: 2% edge (1% pool, 0.5% LP, 0.5% treasury)</div>
                  <div className="text-[10px] text-gray-400">On Loss: 50% pool, 25% LP burn, 25% treasury</div>
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