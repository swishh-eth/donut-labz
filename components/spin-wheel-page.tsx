"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther, formatUnits, parseUnits } from "viem";
import { Loader2, Sparkles, ArrowLeft, Coins, Trophy, HelpCircle, X } from "lucide-react";

const SPIN_WHEEL_ADDRESS = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C" as `0x${string}`;
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as `0x${string}`;
const SPIN_AUCTION_ADDRESS = "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4" as `0x${string}`;

const DONUT_ADDRESS_LOWER = DONUT_ADDRESS.toLowerCase();
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D".toLowerCase();

const AUCTION_MIN_PRICE = 10;
const AUCTION_DECAY_PERIOD = 60 * 60;

const SPIN_WHEEL_ABI = [
  {
    inputs: [{ name: "_commitHash", type: "bytes32" }],
    name: "commit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_secret", type: "bytes32" }],
    name: "reveal",
    outputs: [{ name: "segment", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "canReveal",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getCommitment",
    outputs: [
      { name: "commitHash", type: "bytes32" },
      { name: "commitBlock", type: "uint256" },
      { name: "revealed", type: "bool" },
      { name: "canRevealNow", type: "bool" },
      { name: "blocksUntilExpiry", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPoolBalances",
    outputs: [
      { name: "ethBalance", type: "uint256" },
      { name: "tokens", type: "address[]" },
      { name: "balances", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBoostInfo",
    outputs: [
      { name: "active", type: "bool" },
      { name: "multiplier", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "timeRemaining", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const SPIN_AUCTION_ABI = [
  {
    inputs: [],
    name: "getAuctionState",
    outputs: [
      { name: "currentPrice", type: "uint256" },
      { name: "_peakPrice", type: "uint256" },
      { name: "_lastPurchaseTime", type: "uint256" },
      { name: "timeUntilMinPrice", type: "uint256" },
      { name: "_minPrice", type: "uint256" },
      { name: "_decayPeriod", type: "uint256" },
      { name: "_priceMultiplier", type: "uint256" },
      { name: "_buyingEnabled", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "maxPrice", type: "uint256" }],
    name: "buySpinWithMaxPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SEGMENTS = [
  { label: "💀", color: "#18181b", glowColor: "#3f3f46", chance: 50, prize: 0 },
  { label: "0.1%", color: "#166534", glowColor: "#22c55e", chance: 25, prize: 0.1 },
  { label: "0.5%", color: "#0e7490", glowColor: "#06b6d4", chance: 15, prize: 0.5 },
  { label: "1%", color: "#6d28d9", glowColor: "#a855f7", chance: 8, prize: 1 },
  { label: "5%", color: "#b45309", glowColor: "#f59e0b", chance: 2, prize: 5 },
];

const SEGMENT_ANGLES = [36, 108, 180, 252, 324];
const SPIN_SPEED = 8;

// Secret management
const saveSecret = (address: string, secret: string) => {
  localStorage.setItem(`spin-secret-${address}`, secret);
};

const getSecret = (address: string): `0x${string}` | null => {
  const secret = localStorage.getItem(`spin-secret-${address}`);
  return secret as `0x${string}` | null;
};

const clearSecret = (address: string) => {
  localStorage.removeItem(`spin-secret-${address}`);
};

interface SpinWheelPageProps {
  availableSpins: number;
  onSpinComplete?: () => void;
}

export default function SpinWheelPage({ availableSpins, onSpinComplete }: SpinWheelPageProps) {
  const router = useRouter();
  const { address } = useAccount();
  const [stage, setStage] = useState<"idle" | "committing" | "waiting" | "revealing" | "spinning" | "result">("idle");
  const [secret, setSecret] = useState<`0x${string}` | null>(null);
  const [rotation, setRotation] = useState(0);
  const [resultSegment, setResultSegment] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [donutPrice, setDonutPrice] = useState<number>(0);
  const [sprinklesPrice, setSprinklesPrice] = useState<number>(0);
  const [hasRecordedSpin, setHasRecordedSpin] = useState(false);
  const [localSpins, setLocalSpins] = useState(availableSpins);
  const [floatOffset, setFloatOffset] = useState(0);
  const [continuousRotation, setContinuousRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [auctionPrice, setAuctionPrice] = useState(AUCTION_MIN_PRICE);
  const [approvalAmount, setApprovalAmount] = useState<string>("");
  const [isBuying, setIsBuying] = useState(false);
  const [hasProcessedBuy, setHasProcessedBuy] = useState(false);
  const [hasCheckedPending, setHasCheckedPending] = useState(false);
  const [showUsdPrize, setShowUsdPrize] = useState(true);
  const [pulseScale, setPulseScale] = useState(1);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  const animationRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const hasStartedRef = useRef(false);

  // Sync local spins with prop
  useEffect(() => {
    setLocalSpins(availableSpins);
  }, [availableSpins]);

  // Floating animation
  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame++;
      setFloatOffset(Math.sin(frame * 0.05) * 3);
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  // Pulse animation for button and title
  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame++;
      // Gentle pulse between 0.97 and 1.03
      const scale = 1 + Math.sin(frame * 0.03) * 0.03;
      setPulseScale(scale);
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  // Fetch prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch ETH price
        const ethRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        const ethData = await ethRes.json();
        setEthPrice(ethData.ethereum?.usd || 0);
        
        // Fetch DONUT price from DEXScreener
        const donutRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DONUT_ADDRESS}`);
        const donutData = await donutRes.json();
        if (donutData.pairs && donutData.pairs.length > 0) {
          setDonutPrice(parseFloat(donutData.pairs[0].priceUsd || "0"));
        }
        
        // Fetch SPRINKLES price from DEXScreener
        const sprinklesRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SPRINKLES_ADDRESS}`);
        const sprinklesData = await sprinklesRes.json();
        if (sprinklesData.pairs && sprinklesData.pairs.length > 0) {
          setSprinklesPrice(parseFloat(sprinklesData.pairs[0].priceUsd || "0"));
        }
      } catch (e) {
        console.error("Failed to fetch prices:", e);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // Check for existing secret on mount
  useEffect(() => {
    if (address) {
      const existingSecret = getSecret(address);
      if (existingSecret) {
        setSecret(existingSecret);
      }
    }
  }, [address]);

  // Auction state
  const { data: auctionState, refetch: refetchAuction } = useReadContract({
    address: SPIN_AUCTION_ADDRESS,
    abi: SPIN_AUCTION_ABI,
    functionName: "getAuctionState",
    chainId: base.id,
    query: { refetchInterval: 5000 },
  });

  // Pool balances
  const { data: poolBalances, refetch: refetchPool } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getPoolBalances",
    chainId: base.id,
    query: { refetchInterval: 10000 },
  });

  // Boost info
  const { data: boostInfo } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getBoostInfo",
    chainId: base.id,
    query: { refetchInterval: 10000 },
  });

  // User DONUT balance
  const { data: userDonutBalanceRaw } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // User DONUT allowance for auction
  const { data: userAllowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SPIN_AUCTION_ADDRESS] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Commitment status
  const { data: commitmentData, refetch: refetchCommitment } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getCommitment",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  const userDonutBalance = userDonutBalanceRaw ? Number(formatUnits(userDonutBalanceRaw, 18)) : 0;
  const userAllowance = userAllowanceRaw ? Number(formatUnits(userAllowanceRaw, 18)) : 0;
  const auctionPriceWei = auctionState ? auctionState[0] : 0n;
  const auctionBuyingEnabled = auctionState ? auctionState[7] : false;
  const needsApproval = userAllowance < auctionPrice;

  const isBoostActive = boostInfo ? boostInfo[0] : false;
  const boostMultiplier = boostInfo ? Number(boostInfo[1]) : 1;

  const hasPendingCommit = commitmentData ? (commitmentData[0] !== "0x0000000000000000000000000000000000000000000000000000000000000000" && !commitmentData[2]) : false;
  const canRevealPending = commitmentData ? commitmentData[3] : false;

  useEffect(() => {
    if (auctionState) {
      const priceWei = auctionState[0];
      setAuctionPrice(Number(formatUnits(priceWei, 18)));
    }
  }, [auctionState]);

  // Write contracts
  const { writeContract: writeCommit, data: commitHash, isPending: isCommitting, reset: resetCommit } = useWriteContract();
  const { writeContract: writeReveal, data: revealHash, isPending: isRevealing, reset: resetReveal } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving, reset: resetApprove } = useWriteContract();
  const { writeContract: writeBuy, data: buyHash, isPending: isBuyingOnChain, reset: resetBuy } = useWriteContract();

  const { data: commitReceipt, isLoading: isCommitConfirming } = useWaitForTransactionReceipt({ hash: commitHash, chainId: base.id });
  const { data: revealReceipt, isLoading: isRevealConfirming } = useWaitForTransactionReceipt({ hash: revealHash, chainId: base.id });
  const { data: approveReceipt, isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash, chainId: base.id });
  const { data: buyReceipt, isLoading: isBuyConfirming } = useWaitForTransactionReceipt({ hash: buyHash, chainId: base.id });

  // Handle spin
  const handleSpin = useCallback(async () => {
    if (!address || localSpins <= 0 || hasStartedRef.current) return;
    hasStartedRef.current = true;
    setError(null);
    setStage("committing");

    const newSecret = keccak256(encodePacked(["address", "uint256"], [address, BigInt(Date.now())]));
    const commitHashValue = keccak256(encodePacked(["address", "bytes32"], [address, newSecret]));

    setSecret(newSecret);
    saveSecret(address, newSecret);

    try {
      writeCommit({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "commit",
        args: [commitHashValue],
        chainId: base.id,
      });
    } catch (err: any) {
      setError(err.message || "Failed to commit");
      setStage("idle");
      hasStartedRef.current = false;
    }
  }, [address, localSpins, writeCommit]);

  // Handle reveal
  const handleReveal = useCallback(async () => {
    if (!address || !secret) return;

    try {
      writeReveal({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "reveal",
        args: [secret],
        chainId: base.id,
      });
    } catch (err: any) {
      setError(err.message || "Failed to reveal");
      setStage("idle");
    }
  }, [address, secret, writeReveal]);

  // Handle approval
  const handleApprove = useCallback(async () => {
    if (!address || !approvalAmount) return;
    
    try {
      const amount = parseUnits(approvalAmount, 18);
      writeApprove({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SPIN_AUCTION_ADDRESS, amount],
        chainId: base.id,
      });
    } catch (err: any) {
      setError(err.message || "Failed to approve");
    }
  }, [address, approvalAmount, writeApprove]);

  // Handle buy spin
  const handleBuySpin = useCallback(async () => {
    if (!address || isBuying) return;
    setIsBuying(true);
    setError(null);

    try {
      const maxPrice = parseUnits((auctionPrice * 1.05).toFixed(18), 18);
      writeBuy({
        address: SPIN_AUCTION_ADDRESS,
        abi: SPIN_AUCTION_ABI,
        functionName: "buySpinWithMaxPrice",
        args: [maxPrice],
        chainId: base.id,
      });
    } catch (err: any) {
      setError(err.message || "Failed to buy spin");
      setIsBuying(false);
    }
  }, [address, auctionPrice, isBuying, writeBuy]);

  // Commit confirmation
  useEffect(() => {
    if (commitReceipt?.status === "success" && stage === "committing") {
      setStage("waiting");
      const checkReveal = setInterval(() => {
        refetchCommitment();
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(checkReveal);
        if (canRevealPending && secret) {
          setStage("revealing");
          handleReveal();
        }
      }, 5000);

      return () => {
        clearInterval(checkReveal);
        clearTimeout(timeout);
      };
    } else if (commitReceipt?.status === "reverted") {
      setError("Commit transaction failed");
      setStage("idle");
      hasStartedRef.current = false;
    }
  }, [commitReceipt, stage, canRevealPending, secret, handleReveal, refetchCommitment]);

  // Auto-reveal when ready
  useEffect(() => {
    if (stage === "waiting" && canRevealPending && secret && !isRevealing && !revealHash) {
      setStage("revealing");
      handleReveal();
    }
  }, [stage, canRevealPending, secret, isRevealing, revealHash, handleReveal]);

  // Approval confirmation
  useEffect(() => {
    if (approveReceipt?.status === "success") {
      refetchAllowance();
      resetApprove();
      setApprovalAmount("");
    }
  }, [approveReceipt, refetchAllowance, resetApprove]);

  // Buy confirmation
  useEffect(() => {
    if (buyReceipt?.status === "success" && !hasProcessedBuy) {
      setHasProcessedBuy(true);
      
      fetch("/api/spin-auction/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: buyReceipt.transactionHash, address }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setLocalSpins(prev => prev + 1);
            onSpinComplete?.();
          }
        })
        .catch(console.error)
        .finally(() => {
          setIsBuying(false);
          resetBuy();
          refetchAuction();
          setTimeout(() => setHasProcessedBuy(false), 1000);
        });
    } else if (buyReceipt?.status === "reverted") {
      setError("Buy transaction failed");
      setIsBuying(false);
      resetBuy();
    }
  }, [buyReceipt, address, hasProcessedBuy, onSpinComplete, refetchAuction, resetBuy]);

  // Continuous rotation animation
  useEffect(() => {
    if (stage === "idle" && !hasPendingCommit) {
      setIsAnimating(true);
      let lastTime = performance.now();

      const animate = (currentTime: number) => {
        const delta = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        setContinuousRotation(prev => (prev + delta * 15) % 360);
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setIsAnimating(false);
      };
    }
  }, [stage, hasPendingCommit]);

  // Reveal confirmation and animation
  useEffect(() => {
    if (revealReceipt?.status === "success" && stage === "revealing" && !isProcessingRef.current) {
      isProcessingRef.current = true;

      const logs = revealReceipt.logs;
      let segment = 0;

      for (const log of logs) {
        if (log.address.toLowerCase() === SPIN_WHEEL_ADDRESS.toLowerCase() && log.topics[0]) {
          try {
            const data = log.data;
            if (data && data.length >= 66) {
              segment = parseInt(data.slice(2, 66), 16);
              break;
            }
          } catch {}
        }
      }

      const baseRotation = continuousRotation % 360;
      const targetAngle = SEGMENT_ANGLES[segment];
      const spins = 5;
      const finalRotation = baseRotation + (spins * 360) + (360 - targetAngle) + 90;

      setRotation(finalRotation);
      setStage("spinning");

      setTimeout(() => {
        setResultSegment(segment);
        setStage("result");

        if (!hasRecordedSpin && address) {
          setHasRecordedSpin(true);
          fetch("/api/spins/use", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, revealTxHash: revealReceipt.transactionHash, segment, prizes: {} }),
          })
            .then(res => res.json())
            .then(() => onSpinComplete?.())
            .catch(err => console.error("Spin use error:", err));
        }
      }, 4200);
    } else if (revealReceipt?.status === "reverted") {
      setError("Reveal transaction failed");
      setStage("idle");
    }
  }, [revealReceipt, address, onSpinComplete, hasRecordedSpin, stage, continuousRotation]);

  // Navigate back
  const handleBack = () => {
    router.back();
  };

  // Calculate pool values
  let ethBalance = 0n;
  let donutBalance = 0n;
  let sprinklesBalance = 0n;

  if (poolBalances) {
    ethBalance = poolBalances[0];
    const tokens = poolBalances[1];
    const balances = poolBalances[2];
    for (let i = 0; i < tokens.length; i++) {
      const tokenAddr = tokens[i].toLowerCase();
      if (tokenAddr === DONUT_ADDRESS_LOWER) donutBalance = balances[i];
      else if (tokenAddr === SPRINKLES_ADDRESS) sprinklesBalance = balances[i];
    }
  }

  const ethValue = Number(formatEther(ethBalance));
  const donutValue = Number(formatUnits(donutBalance, 18));
  const sprinklesValue = Number(formatUnits(sprinklesBalance, 18));
  const totalUsdValue = (ethValue * ethPrice) + (donutValue * donutPrice) + (sprinklesValue * sprinklesPrice);

  // Calculate prize breakdown for each segment
  const prizeBreakdown = SEGMENTS.map(seg => ({
    label: seg.label,
    prize: seg.prize,
    eth: (ethValue * seg.prize / 100),
    donut: (donutValue * seg.prize / 100),
    sprinkles: (sprinklesValue * seg.prize / 100),
  }));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header - No border */}
      <div className="flex items-center justify-between p-4">
        <button onClick={handleBack} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 
          className="text-3xl font-bold tracking-wide text-white"
          style={{ 
            fontFamily: 'cursive',
            textShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.4)',
          }}
        >
          Glaze Wheel
        </h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 overflow-auto pb-safe">
        {/* Boost Banner */}
        {isBoostActive && (
          <div className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/50">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-bold text-sm">{boostMultiplier}x BOOST ACTIVE!</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
          </div>
        )}

        {/* Two Column Stats */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* Prize Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] text-gray-400 uppercase">Win Prizes</span>
            </div>
            <div className="space-y-1.5">
              {prizeBreakdown.filter(p => p.prize > 0).map((p, i) => (
                <div key={i} className="flex items-center text-[10px]">
                  <span className="text-gray-400 w-8">{p.label}</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-green-400 w-12 text-right">Ξ{p.eth.toFixed(3)}</span>
                    <span className="text-amber-400 w-8 text-right">🍩{Math.floor(p.donut)}</span>
                    <span className="text-white w-10 text-right flex items-center justify-end gap-0.5">
                      <Sparkles className="w-2.5 h-2.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                      {p.sprinkles >= 1000 ? `${(p.sprinkles/1000).toFixed(0)}k` : Math.floor(p.sprinkles)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prize Pool Toggle */}
          <button
            onClick={() => setShowUsdPrize(!showUsdPrize)}
            className={`border rounded-xl p-2 flex flex-col items-center justify-center text-center transition-all ${
              showUsdPrize 
                ? "bg-amber-500/10 border-amber-500/50" 
                : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <Coins className={`w-3 h-3 ${showUsdPrize ? "text-amber-400" : "text-white"}`} />
              <span className="text-[9px] text-gray-400 uppercase">Prize Pool</span>
            </div>
            {showUsdPrize ? (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-amber-400">${Math.floor(totalUsdValue).toLocaleString()}</span>
                <span className="text-[8px] text-gray-500">tap to see tokens</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold text-green-400">Ξ{ethValue.toFixed(3)}</span>
                <span className="text-xs font-bold text-amber-400">🍩{Math.floor(donutValue).toLocaleString()}</span>
                <span className="text-xs font-bold text-white flex items-center gap-0.5 drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">
                  <Sparkles className="w-3 h-3" />
                  {sprinklesValue >= 1000 ? `${(sprinklesValue/1000).toFixed(0)}k` : Math.floor(sprinklesValue)}
                </span>
                <span className="text-[8px] text-gray-500">tap for USD</span>
              </div>
            )}
          </button>
        </div>

        {/* How to get free spins button */}
        <button
          onClick={() => setShowHelpDialog(true)}
          className="w-full mb-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
        >
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-gray-400">How to get free spins</span>
        </button>

        {/* Help Dialog */}
        {showHelpDialog && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setShowHelpDialog(false)}
            />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <h2 
                  className="text-xl font-bold text-white mb-4 text-center"
                  style={{ 
                    fontFamily: 'cursive',
                    textShadow: '0 0 8px rgba(255,255,255,0.6), 0 0 16px rgba(255,255,255,0.4)',
                  }}
                >
                  Glaze Wheel
                </h2>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                      1
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">Earn Free Spins</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Mine <Sparkles className="w-3 h-3 inline drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />SPRINKLES to earn 1 free spin per mine. The more you mine, the more spins you get!
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                      2
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">Buy Spins</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Buy spins instantly with 🍩DONUT. Price uses a Dutch auction - doubles after each purchase, then decays back to 10 🍩DONUT over time.
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                      3
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">Win Prizes</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Spin the wheel to win a percentage of the prize pool. Win up to 5% of all ETH, 🍩DONUT, and <Sparkles className="w-3 h-3 inline drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />SPRINKLES in the pool!
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                      4
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm">How Pool is Funded</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        The prize pool grows from spin purchases, protocol fees, and community contributions. The bigger the pool, the bigger the prizes!
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="mt-5 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition-colors"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wheel */}
        <div className={`relative w-56 h-56 mx-auto mb-3 ${isBoostActive ? "drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]" : ""}`}>
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-amber-500 drop-shadow-lg" />
          </div>

          {/* Wheel SVG */}
          <div
            className="w-full h-full transition-transform"
            style={{
              transform: `rotate(${stage === "spinning" ? rotation : (isAnimating ? continuousRotation : rotation)}deg)`,
              transitionDuration: stage === "spinning" ? "4s" : "0s",
              transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
            }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <circle cx="100" cy="100" r="98" fill="#27272a" stroke="#3f3f46" strokeWidth="2" />
              {SEGMENTS.map((seg, i) => {
                const startAngle = i * 72 - 90;
                const endAngle = startAngle + 72;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                const outerR = 95;
                const innerR = 38;
                const labelR = 68;
                const labelAngle = startAngle + 36;
                const labelRad = (labelAngle * Math.PI) / 180;

                const ox1 = 100 + outerR * Math.cos(startRad);
                const oy1 = 100 + outerR * Math.sin(startRad);
                const ox2 = 100 + outerR * Math.cos(endRad);
                const oy2 = 100 + outerR * Math.sin(endRad);
                const ix1 = 100 + innerR * Math.cos(startRad);
                const iy1 = 100 + innerR * Math.sin(startRad);
                const ix2 = 100 + innerR * Math.cos(endRad);
                const iy2 = 100 + innerR * Math.sin(endRad);
                const labelX = 100 + labelR * Math.cos(labelRad);
                const labelY = 100 + labelR * Math.sin(labelRad);

                const segmentColor = i % 2 === 0 ? "#ffffff" : "#e4e4e7";

                return (
                  <g key={i}>
                    <path
                      d={`M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 0 0 ${ix1} ${iy1} Z`}
                      fill={segmentColor}
                      stroke="#a1a1aa"
                      strokeWidth="1"
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      fill={seg.glowColor}
                      fontSize={seg.prize === 0 ? "18" : "13"}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${labelAngle + 90}, ${labelX}, ${labelY})`}
                      style={{ filter: `drop-shadow(0 0 6px ${seg.glowColor}) drop-shadow(0 0 10px ${seg.glowColor})` }}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="35" fill="#18181b" />
              <circle cx="100" cy="100" r="33" fill="none" stroke="#3f3f46" strokeWidth="2" />
            </svg>

            {/* Center donut */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                transform: `rotate(${-(stage === "spinning" ? rotation : (isAnimating ? continuousRotation : rotation))}deg)`,
                transitionDuration: stage === "spinning" ? "4s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              <span className="text-3xl" style={{ transform: `translateY(${floatOffset}px)`, transition: "transform 0.1s ease-out" }}>
                🍩
              </span>
            </div>
          </div>
        </div>

        {/* Status / Actions */}
        <div className="text-center flex flex-col">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2 mb-2">
              <div className="text-red-400 text-xs font-medium mb-0.5">Transaction Issue</div>
              <div className="text-red-300 text-[10px]">{error}</div>
            </div>
          )}

          {stage === "idle" && hasPendingCommit && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 mb-2">
              <div className="text-amber-400 text-sm font-medium mb-1">🎰 Spin Ready!</div>
              <div className="text-gray-300 text-xs mb-2">You have a pending spin waiting to be revealed.</div>
              {canRevealPending && secret ? (
                <button
                  onClick={() => {
                    hasStartedRef.current = true;
                    setStage("revealing");
                    handleReveal();
                  }}
                  className="w-full py-2 rounded-xl font-bold text-sm bg-green-500 text-white hover:bg-green-400 transition-all"
                >
                  REVEAL MY SPIN!
                </button>
              ) : (
                <div className="text-amber-300 text-[10px]">⏳ Waiting for blockchain confirmation...</div>
              )}
            </div>
          )}

          {stage === "idle" && !hasPendingCommit && (
            <>
              <div className="text-xs text-gray-400 mb-2">
                You have <span className="text-amber-400 font-bold">{localSpins}</span> spin{localSpins !== 1 ? "s" : ""}
              </div>
              <button
                onClick={handleSpin}
                disabled={localSpins <= 0 || hasStartedRef.current}
                className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
                  localSpins > 0 ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]" : "bg-zinc-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {localSpins > 0 ? "SPIN!" : "No Spins Available"}
              </button>

              {/* Buy Spin Section */}
              <div className="mt-3 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500">Buy a spin instantly</span>
                  <span className="text-xs text-amber-400 font-mono">🍩{Math.floor(auctionPrice)}</span>
                </div>
                
                {!auctionBuyingEnabled ? (
                  <div className="w-full py-3 rounded-xl text-base font-bold bg-zinc-800 text-gray-500 text-center">
                    Buying Temporarily Disabled
                  </div>
                ) : needsApproval ? (
                  /* Show only approval UI when approval needed */
                  <div className="space-y-2">
                    <input
                      type="number"
                      value={approvalAmount}
                      onChange={(e) => setApprovalAmount(e.target.value)}
                      placeholder="DONUT amount to approve"
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-amber-500 focus:outline-none placeholder-gray-500"
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      onClick={handleApprove}
                      disabled={isApproving || isApproveConfirming || !approvalAmount}
                      className="w-full py-3 rounded-xl font-bold text-base bg-amber-500 text-black hover:bg-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApproving || isApproveConfirming ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Approving...
                        </span>
                      ) : (
                        <>Set Approval</>
                      )}
                    </button>
                  </div>
                ) : (
                  /* Show buy button only when approval is set */
                  <button
                    onClick={handleBuySpin}
                    disabled={isBuying || isBuyingOnChain || isBuyConfirming || userDonutBalance < auctionPrice}
                    className="w-full py-3 rounded-xl font-bold text-base bg-amber-500 text-black hover:bg-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBuyingOnChain || isBuyConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Buying...
                      </span>
                    ) : userDonutBalance < auctionPrice ? (
                      <>Insufficient DONUT</>
                    ) : (
                      <>Buy Spin • 🍩{Math.floor(auctionPrice)}</>
                    )}
                  </button>
                )}
                <div className="text-[9px] text-gray-600 mt-1.5 flex justify-between">
                  <span>Doubles on buy, decays to 10</span>
                  <span>Bal: 🍩{Math.floor(userDonutBalance).toLocaleString()}</span>
                </div>
              </div>
            </>
          )}

          {stage === "committing" && (
            <div className="flex items-center justify-center gap-2 text-amber-400 py-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Committing...</span>
            </div>
          )}

          {stage === "waiting" && (
            <div className="flex flex-col items-center justify-center gap-1 text-amber-400 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Confirming...</span>
              </div>
              <span className="text-[10px] text-gray-500">Few seconds</span>
            </div>
          )}

          {stage === "revealing" && (
            <div className="flex items-center justify-center gap-2 text-amber-400 py-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Revealing...</span>
            </div>
          )}

          {stage === "spinning" && (
            <div className="text-amber-400 py-3 text-sm">Spinning...</div>
          )}

          {stage === "result" && resultSegment !== null && (
            <div className="py-3">
              {SEGMENTS[resultSegment].prize === 0 ? (
                <div className="text-2xl mb-2">💀</div>
              ) : (
                <>
                  <div className="text-green-400 text-lg font-bold mb-1">
                    🎉 {SEGMENTS[resultSegment].label} of Pool!
                  </div>
                  <div className="text-gray-400 text-xs">Prizes sent to your wallet</div>
                </>
              )}
              <button
                onClick={() => {
                  setStage("idle");
                  setResultSegment(null);
                  setRotation(0);
                  setContinuousRotation(0);
                  setHasRecordedSpin(false);
                  isProcessingRef.current = false;
                  hasStartedRef.current = false;
                  if (address) clearSecret(address);
                  resetCommit();
                  resetReveal();
                }}
                className="mt-3 px-5 py-2 rounded-xl bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition-all"
              >
                {localSpins > 0 ? "Spin Again" : "Done"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}