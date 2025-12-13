"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked, toHex, decodeAbiParameters } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Dices, TrendingUp, TrendingDown, Trophy, History, HelpCircle, X, Loader2, ExternalLink, CheckCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { DONUT_DICE_ADDRESS, DONUT_DICE_ABI, DONUT_TOKEN_ADDRESS, SPRINKLES_TOKEN_ADDRESS, SUPPORTED_TOKENS, ERC20_ABI } from "@/lib/contracts/donut-dice";

type BetStatus = "None" | "Committed" | "Revealed" | "Expired";

type OnchainBet = {
  player: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  target: number;
  isOver: boolean;
  commitHash: `0x${string}`;
  commitBlock: bigint;
  status: number;
  result: number;
  won: boolean;
  payout: bigint;
  revealedSecret: `0x${string}`;
};

type PendingBet = {
  secret: `0x${string}`;
  commitHash: `0x${string}`;
  betId: bigint | null;
  target: number;
  isOver: boolean;
  amount: string;
  token: `0x${string}`;
};

const STATUS_MAP: Record<number, BetStatus> = {
  0: "None",
  1: "Committed",
  2: "Revealed",
  3: "Expired"
};

// Generate a random bytes32 secret
const generateSecret = (): `0x${string}` => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `0x${Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
};

// Hash the secret
const hashSecret = (secret: `0x${string}`): `0x${string}` => {
  return keccak256(encodePacked(['bytes32'], [secret]));
};

// Approvals Modal Component
function ApprovalsModal({ onClose, refetchAllowance }: { onClose: () => void; refetchAllowance: () => void }) {
  const { address } = useAccount();
  const [donutApprovalAmount, setDonutApprovalAmount] = useState<string>("100");
  const [sprinklesApprovalAmount, setSprinklesApprovalAmount] = useState<string>("100");
  
  // Read DONUT allowance
  const { data: donutAllowance, refetch: refetchDonut } = useReadContract({
    address: DONUT_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  // Read SPRINKLES allowance
  const { data: sprinklesAllowance, refetch: refetchSprinkles } = useReadContract({
    address: SPRINKLES_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DONUT_DICE_ADDRESS] : undefined,
  });

  const { writeContract, isPending } = useWriteContract();

  const handleRevoke = (tokenAddress: `0x${string}`) => {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DONUT_DICE_ADDRESS, BigInt(0)]
    }, {
      onSuccess: () => {
        refetchDonut();
        refetchSprinkles();
        refetchAllowance();
      }
    });
  };

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
        refetchSprinkles();
        refetchAllowance();
      }
    });
  };

  const donutApproved = donutAllowance && donutAllowance > BigInt(0);
  const sprinklesApproved = sprinklesAllowance && sprinklesAllowance > BigInt(0);

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
          <p className="text-[10px] text-gray-500 mb-3">Manage which tokens the Dice contract can spend.</p>
          
          <div className="space-y-3">
            {/* DONUT */}
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
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  donutApproved ? "bg-green-500" : "bg-red-500"
                )} />
              </div>
              
              {/* Approval Amount Input */}
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={donutApprovalAmount}
                    onChange={(e) => setDonutApprovalAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
                    style={{ fontSize: '14px' }}
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

            {/* SPRINKLES */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 opacity-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <div>
                    <div className="text-sm font-bold text-white">SPRINKLES</div>
                    <div className="text-[10px] text-gray-500">
                      {sprinklesApproved 
                        ? `Approved: ${parseFloat(formatUnits(sprinklesAllowance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : "Not approved"
                      }
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-gray-500">SOON</span>
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    sprinklesApproved ? "bg-green-500" : "bg-gray-500"
                  )} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={true}
                  className="flex-1 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-gray-500 text-xs font-bold cursor-not-allowed"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-[9px] text-gray-500 text-center">
              Set a custom approval amount or revoke to prevent spending.
            </p>
          </div>
          
          <button onClick={onClose} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
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
  const [selectedToken, setSelectedToken] = useState<"DONUT" | "SPRINKLES">("DONUT");
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showVerify, setShowVerify] = useState<OnchainBet | null>(null);
  const [pendingBet, setPendingBet] = useState<PendingBet | null>(null);
  const [betStep, setBetStep] = useState<"idle" | "approving" | "committing" | "waiting" | "revealing" | "complete">("idle");
  const [lastResult, setLastResult] = useState<{ result: number; won: boolean; payout: bigint } | null>(null);
  const [streak, setStreak] = useState(0);

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

  // Refetch balance when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchBalance();
        refetchAllowance();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchBalance, refetchAllowance]);

  // Read contract balance for selected token (max payout available)
  const { data: contractBalance } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DONUT_DICE_ABI,
    functionName: "getBalance",
    args: [currentTokenAddress],
  });

  // Read player's recent bets
  const { data: recentBets, refetch: refetchBets } = useReadContract({
    address: DONUT_DICE_ADDRESS,
    abi: DONUT_DICE_ABI,
    functionName: "getPlayerRecentBets",
    args: address ? [address, BigInt(20)] : undefined,
  });

  // Contract writes
  const { data: approveHash, writeContract: writeApprove, isPending: isApprovePending, reset: resetApprove } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { data: commitHash, writeContract: writeCommit, isPending: isCommitPending, reset: resetCommit } = useWriteContract();
  const { isLoading: isCommitConfirming, isSuccess: isCommitSuccess } = useWaitForTransactionReceipt({ hash: commitHash });

  const { data: revealHash, writeContract: writeReveal, isPending: isRevealPending, reset: resetReveal } = useWriteContract();
  const { isLoading: isRevealConfirming, isSuccess: isRevealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });

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

  // Handle approve success
  useEffect(() => {
    if (isApproveSuccess && betStep === "approving") {
      refetchAllowance();
      setBetStep("committing");
      // Now commit the bet
      if (pendingBet) {
        writeCommit({
          address: DONUT_DICE_ADDRESS,
          abi: DONUT_DICE_ABI,
          functionName: "commitBet",
          args: [
            pendingBet.token,
            parseUnits(pendingBet.amount, 18),
            pendingBet.target,
            pendingBet.isOver,
            pendingBet.commitHash
          ]
        });
      }
    }
  }, [isApproveSuccess, betStep, pendingBet, writeCommit, refetchAllowance]);

  // Handle commit success - wait for block then reveal
  useEffect(() => {
    if (isCommitSuccess && betStep === "committing" && pendingBet && commitHash) {
      setBetStep("waiting");
      
      // Get the betId from the transaction receipt
      const getBetIdAndReveal = async () => {
        try {
          const receipt = await publicClient?.getTransactionReceipt({ hash: commitHash });
          
          // Parse BetCommitted event to get betId
          const betCommittedLog = receipt?.logs.find(log => {
            try {
              return log.address.toLowerCase() === DONUT_DICE_ADDRESS.toLowerCase();
            } catch {
              return false;
            }
          });
          
          if (betCommittedLog) {
            // betId is the first indexed topic (after event signature)
            const betId = BigInt(betCommittedLog.topics[1] || "0");
            setPendingBet(prev => prev ? { ...prev, betId } : null);
            
            // Wait for 1 block (~2s on Base, but wait 4s to be safe)
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            setBetStep("revealing");
            
            // Reveal the bet
            writeReveal({
              address: DONUT_DICE_ADDRESS,
              abi: DONUT_DICE_ABI,
              functionName: "revealBet",
              args: [betId, pendingBet.secret]
            });
          }
        } catch (e) {
          console.error("Failed to get betId:", e);
          setBetStep("idle");
        }
      };
      
      getBetIdAndReveal();
    }
  }, [isCommitSuccess, betStep, pendingBet, commitHash, publicClient, writeReveal]);

  // Handle reveal success
  useEffect(() => {
    if (isRevealSuccess && betStep === "revealing" && revealHash) {
      setBetStep("complete");
      
      // Get result from event or contract
      const getResult = async () => {
        try {
          const receipt = await publicClient?.getTransactionReceipt({ hash: revealHash });
          
          console.log("Receipt logs:", receipt?.logs);
          
          // Find BetRevealed event - it should have 2 indexed topics (event sig + betId + player)
          const betRevealedLog = receipt?.logs.find(log => {
            return log.address.toLowerCase() === DONUT_DICE_ADDRESS.toLowerCase() && 
                   log.topics.length === 3; // BetRevealed has 2 indexed params
          });
          
          console.log("Found log:", betRevealedLog);
          
          let result = 0;
          let won = false;
          let payout = BigInt(0);
          
          if (betRevealedLog && betRevealedLog.data) {
            try {
              // Use viem to properly decode the event data
              const decoded = decodeAbiParameters(
                [
                  { name: 'secret', type: 'bytes32' },
                  { name: 'blockHash', type: 'bytes32' },
                  { name: 'result', type: 'uint8' },
                  { name: 'won', type: 'bool' },
                  { name: 'payout', type: 'uint256' }
                ],
                betRevealedLog.data as `0x${string}`
              );
              
              result = Number(decoded[2]);
              won = decoded[3] as boolean;
              payout = decoded[4] as bigint;
              
              console.log("Decoded from event:", { result, won, payout: payout.toString() });
            } catch (parseError) {
              console.error("Failed to parse event:", parseError);
            }
          }
          
          // If event parsing failed, get from contract
          if (result === 0) {
            console.log("Falling back to contract data...");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const { data: updatedBets } = await refetchBets();
            
            if (updatedBets && (updatedBets as OnchainBet[]).length > 0) {
              const latestBet = (updatedBets as OnchainBet[])[0];
              console.log("Latest bet from contract:", latestBet);
              
              if (latestBet.result > 0) {
                result = Number(latestBet.result);
                won = latestBet.won;
                payout = latestBet.payout;
                console.log("Got from contract:", { result, won, payout: payout.toString() });
              }
            }
          }
          
          // Set the result
          if (result > 0) {
            setLastResult({ result, won, payout });
            
            if (won) {
              setStreak(prev => prev + 1);
              try { await sdk.haptics.impactOccurred("medium"); } catch {}
            } else {
              setStreak(0);
              try { await sdk.haptics.impactOccurred("heavy"); } catch {}
            }
          } else {
            console.error("Could not get result from event or contract");
            setLastResult({ result: 0, won: false, payout: BigInt(0) });
          }
          
          refetchBets();
          refetchBalance();
          
          // Reset after showing result
          setTimeout(() => {
            setBetStep("idle");
            setPendingBet(null);
            resetApprove();
            resetCommit();
            resetReveal();
          }, 3000);
          
        } catch (e) {
          console.error("Failed to get result:", e);
        }
      };
      
      getResult();
    }
  }, [isRevealSuccess, betStep, revealHash, publicClient, refetchBets, refetchBalance, resetApprove, resetCommit, resetReveal]);

  const handleRoll = async () => {
    if (!isConnected || !address) return;
    if (!currentToken.enabled) return;
    
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0) return;
    
    const amountWei = parseUnits(betAmount, 18);
    if (tokenBalance && amountWei > tokenBalance) return;

    // Generate secret and hash
    const secret = generateSecret();
    const commitHash = hashSecret(secret);
    
    setPendingBet({
      secret,
      commitHash,
      betId: null,
      target,
      isOver: prediction === "over",
      amount: betAmount,
      token: currentTokenAddress,
    });
    setLastResult(null);

    // Check if we need approval - only if allowance is less than bet amount
    const needsApproval = !allowance || allowance < amountWei;
    
    if (needsApproval) {
      setBetStep("approving");
      // Approve just slightly more than 1 DONUT (1.05) for the bet
      writeApprove({
        address: currentTokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [DONUT_DICE_ADDRESS, parseUnits("1.05", 18)]
      });
    } else {
      setBetStep("committing");
      writeCommit({
        address: DONUT_DICE_ADDRESS,
        abi: DONUT_DICE_ABI,
        functionName: "commitBet",
        args: [currentTokenAddress, amountWei, target, prediction === "over", commitHash]
      });
    }
  };

  const isProcessing = betStep !== "idle" && betStep !== "complete";
  const balance = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  const quickBets = [0.25, 0.5, 0.75, 1];
  const MAX_BET = 1;

  const getStepMessage = () => {
    switch (betStep) {
      case "approving": return "Approving DONUT...";
      case "committing": return "Placing bet...";
      case "waiting": return "Waiting for block...";
      case "revealing": return "Revealing result...";
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
        .dice-shake { animation: shake 0.1s infinite; }
        .glow-pulse { animation: glow-pulse 1s ease-in-out infinite; }
        .number-reveal { animation: number-reveal 0.3s ease-out forwards; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header Row 1 - Title and User */}
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">DICE</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
              BETA
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* XP Bar */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1 opacity-50">
              <span className="text-[8px] text-gray-500 whitespace-nowrap">Earn GLAZE soon</span>
            </div>
            {/* User PFP */}
            {context?.user?.pfpUrl ? (
              <img 
                src={context.user.pfpUrl} 
                alt="pfp" 
                className="w-7 h-7 rounded-full border border-zinc-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>
        </div>

        {/* Token Selector */}
        <div className="flex gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => setSelectedToken("DONUT")}
            disabled={isProcessing}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all",
              selectedToken === "DONUT"
                ? "bg-amber-500 text-black"
                : "bg-zinc-900 border border-zinc-800 text-gray-400"
            )}
          >
            🍩 DONUT
          </button>
          <button
            disabled={true}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-zinc-900 border border-zinc-800 text-gray-600 opacity-50 cursor-not-allowed"
          >
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

        {/* Action Buttons Row - Right aligned */}
        <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => setShowApprovals(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800"
          >
            <Shield className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800"
          >
            <History className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800"
          >
            <HelpCircle className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Dice Result - Compact */}
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

          {/* Status Message */}
          {betStep !== "idle" && (
            <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
              {betStep === "complete" && lastResult?.won && <CheckCircle className="w-3 h-3 text-green-400" />}
              {getStepMessage()}
            </div>
          )}

          {/* Target & Stats */}
          <div className="text-center mt-2">
            <div className="text-xs text-gray-400">
              Roll {prediction === "over" ? "OVER" : "UNDER"} <span className="text-white font-bold text-lg">{target}</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {winChance}% chance • Win {currentToken.emoji}{potentialWin}
            </div>
          </div>
        </div>

        {/* Controls - Compact */}
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

          {/* Over/Under Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPrediction("under")}
              disabled={isProcessing}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm transition-all",
                prediction === "under"
                  ? "bg-red-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-gray-400"
              )}
            >
              <TrendingDown className="w-4 h-4" />
              UNDER {target}
            </button>
            <button
              onClick={() => setPrediction("over")}
              disabled={isProcessing}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm transition-all",
                prediction === "over"
                  ? "bg-green-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-gray-400"
              )}
            >
              <TrendingUp className="w-4 h-4" />
              OVER {target}
            </button>
          </div>

          {/* Bet Amount */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-400">Bet (max {MAX_BET} {currentToken.symbol})</span>
              <div className="flex gap-1">
                {quickBets.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount.toString())}
                    disabled={isProcessing}
                    className="text-[9px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBetAmount(Math.max(1, parseFloat(betAmount || "0") / 2).toString())}
                disabled={isProcessing}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
              >
                ½
              </button>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                disabled={isProcessing}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-center font-bold focus:outline-none focus:border-amber-500 disabled:opacity-50"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={() => setBetAmount(Math.min(MAX_BET, balance, parseFloat(betAmount || "0") * 2).toString())}
                disabled={isProcessing}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
              >
                2×
              </button>
            </div>
          </div>

          {/* Roll Button */}
          <button
            onClick={handleRoll}
            disabled={isProcessing || !isConnected || parseFloat(betAmount || "0") <= 0 || parseFloat(betAmount || "0") > MAX_BET || parseFloat(betAmount || "0") > balance}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-lg tracking-wide transition-all",
              isProcessing
                ? "bg-zinc-500 text-zinc-300 cursor-not-allowed"
                : "bg-white hover:bg-gray-100 text-black"
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

        {/* History Modal - With Verification */}
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
                <p className="text-[10px] text-gray-500 mb-3">All bets are provably fair. Tap any bet to verify.</p>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {!recentBets || (recentBets as OnchainBet[]).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No bets yet</p>
                  ) : (
                    (recentBets as OnchainBet[]).map((bet, index) => (
                      <div 
                        key={index}
                        className={cn(
                          "p-2 rounded-lg border cursor-pointer transition-all hover:opacity-80", 
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
                          <div className="text-right">
                            <div className={cn("text-sm font-bold", bet.won ? "text-green-400" : "text-red-400")}>
                              {bet.won ? `+${parseFloat(formatUnits(bet.payout, 18)).toFixed(0)}` : `-${parseFloat(formatUnits(bet.amount, 18)).toFixed(0)}`}
                            </div>
                            <div className="text-[9px] text-gray-600">🍩 DONUT</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[9px] text-gray-500 text-center">
                    Result = keccak256(blockhash + secret + betId) % 100 + 1
                  </p>
                </div>
                <button onClick={() => setShowHistory(false)} className="mt-2 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Verification Modal */}
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
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Your Secret</div>
                    <div className="text-[10px] text-white font-mono break-all">{showVerify.revealedSecret}</div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Commit Block</div>
                    <div className="text-xs text-white">{showVerify.commitBlock.toString()}</div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Commit Hash</div>
                    <div className="text-[10px] text-white font-mono break-all">{showVerify.commitHash}</div>
                  </div>

                  <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-[10px] text-amber-400">
                      ✓ Verify: keccak256(secret) should equal commit hash
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1">
                      ✓ Result: keccak256(blockhash + secret + betId) % 100 + 1
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
                      <div className="font-semibold text-amber-400 text-xs">Bet & Roll</div>
                      <div className="text-[11px] text-gray-400">Lower win chance = higher multiplier.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">2% House Edge</div>
                      <div className="text-[11px] text-gray-400">1% → House (Grows the Pool)</div>
                      <div className="text-[11px] text-gray-400">0.5% → LP Burn Rewards</div>
                      <div className="text-[11px] text-gray-400">0.5% → Treasury</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[10px] text-gray-400 text-center">🎲 100% onchain • Provably fair • Commit-reveal</p>
                  <p className="text-[10px] text-amber-400 text-center mt-1">Beta: Max 1 DONUT per bet • Higher limits coming soon!</p>
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