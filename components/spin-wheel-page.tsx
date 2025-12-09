"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther, formatUnits } from "viem";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";

const SPIN_WHEEL_ADDRESS = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C" as `0x${string}`;
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as `0x${string}`;
const SPIN_AUCTION_ADDRESS = "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4" as `0x${string}`;
const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586" as `0x${string}`;

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

  // Fetch prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,donut&vs_currencies=usd");
        const data = await res.json();
        setEthPrice(data.ethereum?.usd || 0);
        setDonutPrice(data.donut?.usd || 0);
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

  const auctionBuyingEnabled = auctionState?.[7] ?? true;

  useEffect(() => {
    if (auctionState) {
      const priceInDonut = Number(auctionState[0]) / 1e18;
      setAuctionPrice(priceInDonut);
      if (!approvalAmount || parseFloat(approvalAmount) < priceInDonut) {
        setApprovalAmount(Math.ceil(priceInDonut * 1.5).toString());
      }
    }
  }, [auctionState]);

  // Pool balances
  const { data: poolBalances } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getPoolBalances",
    chainId: base.id,
  });

  // Boost info
  const { data: boostInfo } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getBoostInfo",
    chainId: base.id,
  });

  const isBoostActive = boostInfo?.[0] ?? false;
  const boostMultiplier = boostInfo?.[1] ? Number(boostInfo[1]) / 100 : 1;

  // User's DONUT balance and allowance
  const { data: donutBalanceData } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const { data: donutAllowanceData, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SPIN_AUCTION_ADDRESS] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const userDonutBalance = donutBalanceData ? Number(donutBalanceData) / 1e18 : 0;
  const currentAllowance = donutAllowanceData ? Number(donutAllowanceData) / 1e18 : 0;
  const needsApproval = currentAllowance < auctionPrice;

  // Commitment data
  const { data: commitmentData, refetch: refetchCommitment } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getCommitment",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  const hasPendingCommit = commitmentData && commitmentData[0] !== "0x0000000000000000000000000000000000000000000000000000000000000000" && !commitmentData[2];
  const canRevealPending = commitmentData?.[3];

  // Can reveal
  const { data: canRevealData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "canReveal",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address && stage === "waiting", refetchInterval: 1000 },
  });

  // Contract writes
  const { writeContract: writeCommit, data: commitHash, reset: resetCommit, isPending: isCommitPending } = useWriteContract();
  const { writeContract: writeReveal, data: revealHash, reset: resetReveal, isPending: isRevealPending } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeBuySpin, data: buySpinHash, isPending: isBuyingOnChain } = useWriteContract();

  const { data: commitReceipt } = useWaitForTransactionReceipt({ hash: commitHash, chainId: base.id });
  const { data: revealReceipt } = useWaitForTransactionReceipt({ hash: revealHash, chainId: base.id });
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash, chainId: base.id });
  const { isLoading: isBuyConfirming, isSuccess: isBuyConfirmed } = useWaitForTransactionReceipt({ hash: buySpinHash, chainId: base.id });

  // Generate secret
  const generateSecret = useCallback(() => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return ("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  }, []);

  // Start continuous spin animation
  useEffect(() => {
    if ((stage === "committing" || stage === "waiting" || stage === "revealing") && !isAnimating) {
      setIsAnimating(true);
      const animate = () => {
        setContinuousRotation(prev => prev + SPIN_SPEED);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationRef.current && stage === "idle") {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stage, isAnimating]);

  // Handle spin
  const handleSpin = useCallback(async () => {
    if (!address || localSpins <= 0 || isProcessingRef.current || stage !== "idle") return;

    hasStartedRef.current = true;
    isProcessingRef.current = true;
    setError(null);
    const newSecret = generateSecret();
    setSecret(newSecret);
    saveSecret(address, newSecret);

    const commitHashValue = keccak256(encodePacked(["bytes32", "address"], [newSecret, address]));
    setStage("committing");

    try {
      writeCommit({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "commit",
        args: [commitHashValue],
        chainId: base.id,
      });
    } catch (err) {
      console.error("Commit error:", err);
      setError("Failed to commit. Please try again.");
      setStage("idle");
      setIsAnimating(false);
      isProcessingRef.current = false;
      hasStartedRef.current = false;
      clearSecret(address);
    }
  }, [address, localSpins, generateSecret, writeCommit, stage]);

  // Handle reveal
  const handleReveal = useCallback(async () => {
    if (!secret) return;
    setStage("revealing");
    try {
      await writeReveal({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "reveal",
        args: [secret],
        chainId: base.id,
      });
    } catch (err) {
      console.error("Reveal error:", err);
      setError("Failed to reveal. Please try again.");
      setStage("waiting");
    }
  }, [secret, writeReveal]);

  // Buy spin handlers
  useEffect(() => {
    if (isApproveConfirmed && isBuying) {
      console.log("Approval confirmed, now buying spin...");
      const priceInWei = BigInt(Math.ceil(auctionPrice * 1.1 * 1e18));
      writeBuySpin({
        address: SPIN_AUCTION_ADDRESS,
        abi: SPIN_AUCTION_ABI,
        functionName: "buySpinWithMaxPrice",
        args: [priceInWei],
        chainId: base.id,
      });
    }
  }, [isApproveConfirmed, isBuying, auctionPrice, writeBuySpin]);

  useEffect(() => {
    if (buySpinHash && address) {
      console.log("Storing pending buy txHash:", buySpinHash);
      localStorage.setItem(`pending-buy-${address}`, buySpinHash);
    }
  }, [buySpinHash, address]);

  useEffect(() => {
    if (isBuyConfirmed && buySpinHash && address && !hasProcessedBuy) {
      setHasProcessedBuy(true);
      console.log("Buy confirmed! Processing on backend...", { buySpinHash, address });
      
      fetch("/api/spin-auction/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: buySpinHash, address }),
      })
        .then(res => res.json())
        .then(data => {
          console.log("API response data:", data);
          if (data.success) {
            localStorage.removeItem(`pending-buy-${address}`);
            setLocalSpins(prev => prev + 1);
            onSpinComplete?.();
          } else {
            setError(data.error || "Failed to credit spin");
          }
        })
        .catch(err => {
          console.error("Process error:", err);
          setError("Failed to credit spin - contact support");
        })
        .finally(() => {
          setIsBuying(false);
          refetchAuction();
          refetchAllowance();
        });
    }
  }, [isBuyConfirmed, buySpinHash, address, hasProcessedBuy, onSpinComplete, refetchAuction, refetchAllowance]);

  // Check for pending buys on mount
  useEffect(() => {
    if (address && !hasCheckedPending) {
      setHasCheckedPending(true);
      const pendingTxHash = localStorage.getItem(`pending-buy-${address}`);
      if (pendingTxHash) {
        console.log("Found pending buy txHash, processing:", pendingTxHash);
        fetch("/api/spin-auction/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: pendingTxHash, address }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              localStorage.removeItem(`pending-buy-${address}`);
              setLocalSpins(prev => prev + 1);
              onSpinComplete?.();
            } else {
              localStorage.removeItem(`pending-buy-${address}`);
            }
          })
          .catch(() => localStorage.removeItem(`pending-buy-${address}`));
      }
    }
  }, [address, hasCheckedPending, onSpinComplete]);

  const handleBuySpin = useCallback(async () => {
    if (!address || isBuying || isApproving || isBuyingOnChain) return;

    if (userDonutBalance < auctionPrice) {
      setError(`Insufficient DONUT. Need ${auctionPrice.toFixed(0)}, have ${userDonutBalance.toFixed(2)}`);
      return;
    }

    setIsBuying(true);
    setError(null);

    try {
      if (needsApproval) {
        const approveValue = parseFloat(approvalAmount) || (auctionPrice * 1.5);
        const approveAmountWei = BigInt(Math.ceil(approveValue * 1e18));
        writeApprove({
          address: DONUT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SPIN_AUCTION_ADDRESS, approveAmountWei],
          chainId: base.id,
        });
      } else {
        const priceInWei = BigInt(Math.ceil(auctionPrice * 1.1 * 1e18));
        writeBuySpin({
          address: SPIN_AUCTION_ADDRESS,
          abi: SPIN_AUCTION_ABI,
          functionName: "buySpinWithMaxPrice",
          args: [priceInWei],
          chainId: base.id,
        });
      }
    } catch (err: any) {
      console.error("Buy spin error:", err);
      setError(err.message || "Failed to buy spin");
      setIsBuying(false);
    }
  }, [address, auctionPrice, approvalAmount, isBuying, isApproving, isBuyingOnChain, needsApproval, userDonutBalance, writeApprove, writeBuySpin]);

  // Watch commit confirmation
  useEffect(() => {
    if (commitReceipt?.status === "success") {
      setStage("waiting");
    } else if (commitReceipt?.status === "reverted") {
      setError("Commit transaction failed");
      setStage("idle");
    }
  }, [commitReceipt]);

  // Auto-reveal with delay
  useEffect(() => {
    if (stage === "waiting" && canRevealData === true && secret) {
      const timer = setTimeout(() => handleReveal(), 3000);
      return () => clearTimeout(timer);
    }
  }, [stage, canRevealData, secret, handleReveal]);

  // Watch reveal and animate
  useEffect(() => {
    if (revealReceipt?.status === "success" && stage === "revealing") {
      const logs = revealReceipt.logs;
      let segment = 0;

      for (const log of logs) {
        if (log.address.toLowerCase() === SPIN_WHEEL_ADDRESS.toLowerCase()) {
          try {
            const data = log.data;
            if (data && data.length >= 66) {
              const segmentHex = data.slice(2, 66);
              segment = parseInt(segmentHex, 16);
              break;
            }
          } catch (e) {
            console.error("Failed to parse segment:", e);
          }
        }
      }

      setResultSegment(segment);
      setStage("spinning");

      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setIsAnimating(false);

      const targetAngle = SEGMENT_ANGLES[segment];
      const fullSpins = 3 * 360;
      const finalRotation = continuousRotation + fullSpins + (360 - targetAngle) - (continuousRotation % 360);
      setRotation(finalRotation);

      setTimeout(() => {
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
  const totalUsdValue = (ethValue * ethPrice) + (donutValue * donutPrice);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <button onClick={handleBack} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold tracking-wide">Glaze Wheel</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 overflow-auto">
        {/* Boost Banner */}
        {isBoostActive && (
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/50">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 font-bold">{boostMultiplier}x BOOST ACTIVE!</span>
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
          </div>
        )}

        {/* Prize Pool */}
        <div className="mb-4 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 text-center">Prize Pool</div>
          <div className="flex items-center justify-center gap-3 text-lg font-bold">
            <span className="text-green-400">Ξ{ethValue.toFixed(3)}</span>
            <span className="text-amber-400">🍩{donutValue.toFixed(0)}</span>
            <span className="text-white">✨{sprinklesValue >= 1000 ? `${(sprinklesValue/1000).toFixed(0)}k` : sprinklesValue.toFixed(0)}</span>
          </div>
          <div className="text-center text-gray-500 text-sm mt-1">≈ ${totalUsdValue.toFixed(2)} USD</div>
        </div>

        {/* Wheel */}
        <div className={`relative w-64 h-64 mx-auto mb-4 ${isBoostActive ? "drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]" : ""}`}>
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
            <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-amber-500 drop-shadow-lg" />
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
        <div className="text-center flex-1 flex flex-col">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
              <div className="text-red-400 text-sm font-medium mb-1">Transaction Issue</div>
              <div className="text-red-300 text-xs">{error}</div>
              <div className="text-gray-400 text-[10px] mt-2">
                Don't worry! Come back in a moment and your spin will be ready to complete.
              </div>
            </div>
          )}

          {stage === "idle" && hasPendingCommit && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3">
              <div className="text-amber-400 text-sm font-medium mb-1">🎰 Spin Ready!</div>
              <div className="text-gray-300 text-xs mb-2">You have a pending spin waiting to be revealed.</div>
              {canRevealPending && secret ? (
                <button
                  onClick={() => {
                    hasStartedRef.current = true;
                    setStage("revealing");
                    handleReveal();
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-base bg-green-500 text-white hover:bg-green-400 transition-all"
                >
                  REVEAL MY SPIN!
                </button>
              ) : (
                <div className="text-amber-300 text-[11px]">⏳ Waiting for blockchain confirmation... (few seconds)</div>
              )}
            </div>
          )}

          {stage === "idle" && !hasPendingCommit && (
            <>
              <div className="text-sm text-gray-400 mb-2">
                You have <span className="text-amber-400 font-bold">{localSpins}</span> spin{localSpins !== 1 ? "s" : ""}
              </div>
              <button
                onClick={handleSpin}
                disabled={localSpins <= 0 || hasStartedRef.current}
                className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                  localSpins > 0 ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]" : "bg-zinc-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {localSpins > 0 ? "SPIN!" : "No Spins Available"}
              </button>

              {/* Buy Spin Section */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Or buy a spin instantly</span>
                  <span className="text-sm text-amber-400 font-mono">🍩{auctionPrice.toFixed(2)}</span>
                </div>
                {!auctionBuyingEnabled ? (
                  <div className="w-full py-3 rounded-xl text-sm bg-zinc-800 text-gray-500 text-center">
                    Buying Temporarily Disabled
                  </div>
                ) : needsApproval ? (
                  <>
                    <input
                      type="number"
                      value={approvalAmount}
                      onChange={(e) => setApprovalAmount(e.target.value)}
                      placeholder="Set approval amount"
                      className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-amber-500 focus:outline-none placeholder-gray-500 mb-2"
                    />
                    <button
                      onClick={handleBuySpin}
                      disabled={isBuying || isApproving || isApproveConfirming || userDonutBalance < auctionPrice || !approvalAmount}
                      className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApproving || isApproveConfirming ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Approving...
                        </span>
                      ) : userDonutBalance < auctionPrice ? (
                        <>Insufficient DONUT</>
                      ) : (
                        <>Approve & Buy</>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleBuySpin}
                    disabled={isBuying || isBuyingOnChain || isBuyConfirming || userDonutBalance < auctionPrice}
                    className="w-full py-3 rounded-xl font-bold text-base bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBuyingOnChain || isBuyConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Buying...
                      </span>
                    ) : userDonutBalance < auctionPrice ? (
                      <>Insufficient DONUT</>
                    ) : (
                      <>Buy Spin</>
                    )}
                  </button>
                )}
                <div className="text-[10px] text-gray-600 mt-2 flex justify-between">
                  <span>Doubles on buy, decays to 10</span>
                  <span>Bal: 🍩{userDonutBalance.toFixed(0)}</span>
                </div>
              </div>
            </>
          )}

          {stage === "committing" && (
            <div className="flex items-center justify-center gap-2 text-amber-400 py-4">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-base">Committing...</span>
            </div>
          )}

          {stage === "waiting" && (
            <div className="flex flex-col items-center justify-center gap-1 text-amber-400 py-4">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-base">Confirming on blockchain...</span>
              </div>
              <span className="text-xs text-gray-500">This takes a few seconds</span>
            </div>
          )}

          {stage === "revealing" && (
            <div className="flex items-center justify-center gap-2 text-amber-400 py-4">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-base">Revealing...</span>
            </div>
          )}

          {stage === "spinning" && (
            <div className="text-amber-400 py-4 text-base">Spinning...</div>
          )}

          {stage === "result" && resultSegment !== null && (
            <div className="py-4">
              {SEGMENTS[resultSegment].prize === 0 ? (
                <div className="text-2xl mb-2">💀</div>
              ) : (
                <>
                  <div className="text-green-400 text-xl font-bold mb-1">
                    🎉 {SEGMENTS[resultSegment].label} of Pool!
                  </div>
                  <div className="text-gray-400 text-sm">Prizes sent to your wallet</div>
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
                className="mt-4 px-6 py-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
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