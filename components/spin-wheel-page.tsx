"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useRouter } from "next/navigation";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther, formatUnits, parseUnits } from "viem";
import { Loader2, Sparkles, ArrowLeft, Coins, Trophy, HelpCircle, X } from "lucide-react";

type HexString = `0x${string}`;

const SPIN_WHEEL_ADDRESS: HexString = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C";
const DONUT_ADDRESS: HexString = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C";
const SPIN_AUCTION_ADDRESS: HexString = "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4";

const DONUT_ADDRESS_LOWER = DONUT_ADDRESS.toLowerCase();
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D".toLowerCase();

// DEXScreener pair addresses for accurate pricing
const SPRINKLES_DONUT_PAIR = "0x47e8b03017d8b8d058ba5926838ca4dd4531e668";
const DONUT_WETH_PAIR = "0xb7484cdc25c2a11572632e76e6160b05f9e3b3f0";

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

const SEGMENT_TARGET_ROTATION = [324, 252, 180, 108, 36];
const SPIN_SPEED = 8;

const saveSecret = (address: string, secret: string) => {
  localStorage.setItem(`spin-secret-${address}`, secret);
};

const getSecret = (address: string): HexString | null => {
  const secret = localStorage.getItem(`spin-secret-${address}`);
  return secret as HexString | null;
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
  const [secret, setSecret] = useState<HexString | null>(null);
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
  const hasTriggeredRevealRef = useRef(false);

  useEffect(() => {
    setLocalSpins(availableSpins);
  }, [availableSpins]);

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

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame++;
      const scale = 1 + Math.sin(frame * 0.03) * 0.03;
      setPulseScale(scale);
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  // Fetch prices from specific DEXScreener pairs
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch ETH price
        const ethRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        const ethData = await ethRes.json();
        setEthPrice(ethData.ethereum?.usd || 0);
        
        // Fetch DONUT price from specific DONUT/WETH pair
        const donutRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${DONUT_WETH_PAIR}`);
        const donutData = await donutRes.json();
        console.log("DONUT pair response:", donutData);
        // Handle both response structures: { pair: {...} } or { pairs: [...] }
        const donutPair = donutData.pair || donutData.pairs?.[0];
        if (donutPair) {
          console.log("DONUT price USD:", donutPair.priceUsd);
          setDonutPrice(parseFloat(donutPair.priceUsd || "0"));
        }
        
        // Fetch SPRINKLES price from specific SPRINKLES/DONUT pair
        const sprinklesRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${SPRINKLES_DONUT_PAIR}`);
        const sprinklesData = await sprinklesRes.json();
        console.log("SPRINKLES pair response:", sprinklesData);
        // Handle both response structures: { pair: {...} } or { pairs: [...] }
        const sprinklesPair = sprinklesData.pair || sprinklesData.pairs?.[0];
        if (sprinklesPair) {
          console.log("SPRINKLES price USD:", sprinklesPair.priceUsd);
          setSprinklesPrice(parseFloat(sprinklesPair.priceUsd || "0"));
        }
      } catch (e) {
        console.error("Failed to fetch prices:", e);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (address) {
      const existingSecret = getSecret(address);
      if (existingSecret) {
        setSecret(existingSecret);
      }
    }
  }, [address]);

  const { data: auctionState, refetch: refetchAuction } = useReadContract({
    address: SPIN_AUCTION_ADDRESS,
    abi: SPIN_AUCTION_ABI,
    functionName: "getAuctionState",
    chainId: base.id,
    query: { refetchInterval: 5000 },
  });

  const { data: poolBalances, refetch: refetchPool } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getPoolBalances",
    chainId: base.id,
    query: { refetchInterval: 10000 },
  });

  const { data: boostInfo } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getBoostInfo",
    chainId: base.id,
    query: { refetchInterval: 10000 },
  });

  const { data: userDonutBalanceRaw } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  const { data: userAllowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SPIN_AUCTION_ADDRESS] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

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

  const hasPendingCommit = commitmentData 
    ? (commitmentData[0] !== "0x0000000000000000000000000000000000000000000000000000000000000000" 
       && !commitmentData[2] 
       && Number(commitmentData[4]) > 0)
    : false;
  const canRevealPending = commitmentData ? commitmentData[3] : false;
  const blocksUntilExpiry = commitmentData ? Number(commitmentData[4]) : 0;
  
  const storedCommitHash = commitmentData ? commitmentData[0] : "0x0000000000000000000000000000000000000000000000000000000000000000";
  const isCommitmentCleared = storedCommitHash === "0x0000000000000000000000000000000000000000000000000000000000000000";
  
  const storedSecret = address ? getSecret(address) : null;
  const hasValidSecret = !!storedSecret;
  const isCorruptedSpin = hasPendingCommit && !hasValidSecret;
  
  const [showSpinIssuePopup, setShowSpinIssuePopup] = useState(false);
  const [hasShownIssuePopup, setHasShownIssuePopup] = useState(false);
  
  useEffect(() => {
    if (isCorruptedSpin && canRevealPending && !hasShownIssuePopup) {
      setShowSpinIssuePopup(true);
      setHasShownIssuePopup(true);
    }
  }, [isCorruptedSpin, canRevealPending, hasShownIssuePopup]);
  
  useEffect(() => {
    console.log("Spin wheel state:", {
      address,
      isConnected: !!address,
      commitmentData: commitmentData || "undefined",
      hasPendingCommit,
      isCorruptedSpin,
      hasValidSecret,
      storedSecret: storedSecret ? "exists" : "null",
      stage,
    });
  }, [address, commitmentData, hasPendingCommit, isCorruptedSpin, hasValidSecret, storedSecret, stage]);
  
  useEffect(() => {
    if (commitmentData) {
      console.log("Commitment data:", {
        storedCommitHash: commitmentData[0],
        commitBlock: Number(commitmentData[1]),
        revealed: commitmentData[2],
        canRevealNow: commitmentData[3],
        blocksUntilExpiry: Number(commitmentData[4]),
        hasPendingCommit,
        isCommitmentCleared,
        isCorruptedSpin,
        hasValidSecret,
      });
    }
  }, [commitmentData, hasPendingCommit, isCommitmentCleared, isCorruptedSpin, hasValidSecret]);

  useEffect(() => {
    if (auctionState) {
      const priceWei = auctionState[0];
      setAuctionPrice(Number(formatUnits(priceWei, 18)));
    }
  }, [auctionState]);

  const { writeContract: writeCommit, data: commitHash, isPending: isCommitting, reset: resetCommit } = useWriteContract();
  const { writeContract: writeReveal, data: revealHash, isPending: isRevealing, reset: resetReveal } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving, reset: resetApprove } = useWriteContract();
  const { writeContract: writeBuy, data: buyHash, isPending: isBuyingOnChain, reset: resetBuy } = useWriteContract();

  const { data: commitReceipt, isLoading: isCommitConfirming } = useWaitForTransactionReceipt({ hash: commitHash, chainId: base.id });
  const { data: revealReceipt, isLoading: isRevealConfirming } = useWaitForTransactionReceipt({ hash: revealHash, chainId: base.id });
  const { data: approveReceipt, isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash, chainId: base.id });
  const { data: buyReceipt, isLoading: isBuyConfirming } = useWaitForTransactionReceipt({ hash: buyHash, chainId: base.id });

  const handleSpin = useCallback(async () => {
    if (!address || localSpins <= 0) return;
    if (hasStartedRef.current) {
      console.log("Spin already started, ignoring");
      return;
    }
    if (stage !== "idle") {
      console.log("Not in idle stage, ignoring spin request");
      return;
    }
    if (isCommitting || commitHash) {
      console.log("Already committing, ignoring");
      return;
    }
    
    hasStartedRef.current = true;
    hasTriggeredRevealRef.current = false;
    setError(null);
    setStage("committing");

    const newSecret = keccak256(encodePacked(["address", "uint256"], [address, BigInt(Date.now())]));
    const commitHashValue = keccak256(encodePacked(["bytes32", "address"], [newSecret, address]));

    console.log("Generated secret:", newSecret);
    console.log("Commit hash (secret + address):", commitHashValue);

    saveSecret(address, newSecret);
    setSecret(newSecret);

    try {
      writeCommit({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "commit",
        args: [commitHashValue],
        chainId: base.id,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to commit";
      setError(errorMessage);
      setStage("idle");
      hasStartedRef.current = false;
      clearSecret(address);
    }
  }, [address, localSpins, stage, isCommitting, commitHash, writeCommit]);

  const handleReveal = useCallback(async () => {
    if (!address) return;
    
    const storedSecretLocal = getSecret(address);
    console.log("Revealing with stored secret:", storedSecretLocal);
    console.log("Current state secret:", secret);
    
    const secretToUse = storedSecretLocal || secret;
    
    if (!secretToUse) {
      setError("No secret found. Please try spinning again.");
      setStage("idle");
      hasStartedRef.current = false;
      return;
    }

    try {
      writeReveal({
        address: SPIN_WHEEL_ADDRESS,
        abi: SPIN_WHEEL_ABI,
        functionName: "reveal",
        args: [secretToUse],
        chainId: base.id,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reveal";
      setError(errorMessage);
      setStage("idle");
    }
  }, [address, secret, writeReveal]);

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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to approve";
      setError(errorMessage);
    }
  }, [address, approvalAmount, writeApprove]);

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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to buy spin";
      setError(errorMessage);
      setIsBuying(false);
    }
  }, [address, auctionPrice, isBuying, writeBuy]);

  useEffect(() => {
    if (commitReceipt?.status === "success" && stage === "committing") {
      console.log("Commit confirmed, waiting for reveal eligibility...");
      setStage("waiting");
      hasTriggeredRevealRef.current = false;
      
      const checkReveal = setInterval(async () => {
        console.log("Checking if can reveal...");
        await refetchCommitment();
      }, 2000);

      const timeout = setTimeout(() => {
        clearInterval(checkReveal);
        console.log("Timeout reached, checking final state");
      }, 30000);

      return () => {
        clearInterval(checkReveal);
        clearTimeout(timeout);
      };
    } else if (commitReceipt?.status === "reverted") {
      setError("Commit transaction failed");
      setStage("idle");
      hasStartedRef.current = false;
      hasTriggeredRevealRef.current = false;
      if (address) clearSecret(address);
    }
  }, [commitReceipt, stage, address, refetchCommitment]);

  useEffect(() => {
    if (
      stage === "waiting" && 
      canRevealPending && 
      !isRevealing && 
      !revealHash && 
      !hasTriggeredRevealRef.current
    ) {
      console.log("Can reveal now! Triggering reveal...");
      hasTriggeredRevealRef.current = true;
      
      const timer = setTimeout(() => {
        setStage("revealing");
        handleReveal();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [stage, canRevealPending, isRevealing, revealHash, handleReveal]);

  useEffect(() => {
    if (approveReceipt?.status === "success") {
      refetchAllowance();
      resetApprove();
      setApprovalAmount("");
    }
  }, [approveReceipt, refetchAllowance, resetApprove]);

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

  const speedRef = useRef(15);
  const targetSpeedRef = useRef(15);
  
  useEffect(() => {
    switch (stage) {
      case "committing":
        targetSpeedRef.current = 120;
        break;
      case "waiting":
        targetSpeedRef.current = 200;
        break;
      case "revealing":
        targetSpeedRef.current = 250;
        break;
      case "spinning":
      case "result":
        targetSpeedRef.current = 0;
        break;
      default:
        targetSpeedRef.current = 15;
    }
  }, [stage]);

  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      
      const diff = targetSpeedRef.current - speedRef.current;
      speedRef.current += diff * 0.02;
      
      if (stage !== "spinning" && stage !== "result") {
        setContinuousRotation(prev => prev + delta * speedRef.current);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [stage]);

  const pendingResultRef = useRef<number | null>(null);
  
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

      pendingResultRef.current = segment;
      
      const currentRotation = continuousRotation % 360;
      const targetAngle = SEGMENT_TARGET_ROTATION[segment];
      const spins = 5;
      
      let additionalRotation = targetAngle - currentRotation;
      if (additionalRotation < 0) {
        additionalRotation += 360;
      }
      
      const finalRotation = continuousRotation + (spins * 360) + additionalRotation;
      
      console.log("Spin result (hidden until animation completes):", { 
        segment, 
        segmentLabel: SEGMENTS[segment].label, 
        currentRotation,
        targetAngle, 
        additionalRotation,
        finalRotation 
      });

      setRotation(finalRotation);
      setStage("spinning");

      setTimeout(() => {
        setResultSegment(pendingResultRef.current);
        setStage("result");

        if (!hasRecordedSpin && address && pendingResultRef.current !== null) {
          setHasRecordedSpin(true);
          fetch("/api/spins/use", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, revealTxHash: revealReceipt.transactionHash, segment: pendingResultRef.current, prizes: {} }),
          })
            .then(res => res.json())
            .then(() => onSpinComplete?.())
            .catch(err => console.error("Spin use error:", err));
        }
      }, 4500);
    } else if (revealReceipt?.status === "reverted") {
      setError("Reveal transaction failed");
      setStage("idle");
    }
  }, [revealReceipt, address, onSpinComplete, hasRecordedSpin, stage, continuousRotation]);

  const handleBack = () => {
    router.back();
  };

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

  const prizeBreakdown = SEGMENTS.map(seg => ({
    label: seg.label,
    prize: seg.prize,
    eth: (ethValue * seg.prize / 100),
    donut: (donutValue * seg.prize / 100),
    sprinkles: (sprinklesValue * seg.prize / 100),
  }));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-4">
        <button onClick={handleBack} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 
          className="text-4xl font-bold tracking-wide text-white animate-pulse"
          style={{ 
            fontFamily: 'cursive',
            textShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.4)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          Glaze Wheel
        </h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col p-4 overflow-auto pb-safe">
        {isBoostActive && (
          <div className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/50">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-bold text-sm">{boostMultiplier}x BOOST ACTIVE!</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
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

        <button
          onClick={() => setShowHelpDialog(true)}
          className="w-full mb-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
        >
          <HelpCircle className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-gray-400">How to get free spins</span>
        </button>

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

        <div className={`relative w-56 h-56 mx-auto mb-3 ${isBoostActive ? "drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]" : ""}`}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-amber-500 drop-shadow-lg" />
          </div>

          <div
            className="w-full h-full"
            style={{
              transform: `rotate(${stage === "spinning" || stage === "result" ? rotation : continuousRotation}deg)`,
              transition: stage === "spinning" ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
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

            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                transform: `rotate(${-(stage === "spinning" || stage === "result" ? rotation : continuousRotation)}deg)`,
                transition: stage === "spinning" ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
              }}
            >
              <span className="text-3xl" style={{ transform: `translateY(${floatOffset}px)`, transition: "transform 0.1s ease-out" }}>
                🍩
              </span>
            </div>
          </div>
        </div>

        <div className="text-center flex flex-col">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2 mb-2">
              <div className="text-red-400 text-xs font-medium mb-0.5">Transaction Issue</div>
              <div className="text-red-300 text-[10px]">{error}</div>
            </div>
          )}

          {stage === "idle" && hasPendingCommit && (
            <div className="mb-2">
              {isCorruptedSpin ? (
                <>
                  <button
                    onClick={() => setShowSpinIssuePopup(true)}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    <span className="text-sm text-gray-300">Your previous spin encountered an issue</span>
                  </button>
                  <div className="text-center mt-2">
                    <span className="text-amber-400 text-sm font-mono">
                      {blocksUntilExpiry > 0 
                        ? `~${Math.ceil(blocksUntilExpiry * 2 / 60)} min until reset` 
                        : "Commitment expired - trying new spin..."}
                    </span>
                    {blocksUntilExpiry > 0 && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        {blocksUntilExpiry} blocks remaining
                      </div>
                    )}
                    {blocksUntilExpiry === 0 && (
                      <button
                        onClick={() => {
                          if (address) {
                            clearSecret(address);
                            setSecret(null);
                            setError(null);
                            hasStartedRef.current = false;
                            setHasShownIssuePopup(false);
                            setTimeout(() => {
                              refetchCommitment();
                            }, 500);
                          }
                        }}
                        className="mt-2 text-green-400 text-sm font-bold hover:text-green-300 transition-colors"
                      >
                        ✓ Try spinning again
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2">
                  <div className="text-amber-400 text-sm font-medium mb-1">🎰 Spin Ready!</div>
                  <div className="text-gray-300 text-xs mb-2">You have a pending spin waiting to be revealed.</div>
                  {canRevealPending ? (
                    <button
                      onClick={() => {
                        if (!storedSecret) {
                          setShowSpinIssuePopup(true);
                          return;
                        }
                        hasStartedRef.current = true;
                        setSecret(storedSecret);
                        setStage("revealing");
                        handleReveal();
                      }}
                      className="w-full py-2 rounded-xl font-bold text-sm bg-green-500 text-white hover:bg-green-400 transition-all"
                    >
                      REVEAL MY SPIN!
                    </button>
                  ) : (
                    <div className="text-amber-300 text-[10px]">⏳ Waiting for blockchain confirmation... (need 1 more block)</div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {showSpinIssuePopup && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={() => setShowSpinIssuePopup(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
                  <button
                    onClick={() => setShowSpinIssuePopup(false)}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    Why did my spin fail?
                  </h2>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        1
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">How the wheel works</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          The Glaze Wheel uses a commit-reveal system for provably fair randomness. When you spin, a secret key is generated and stored locally on your device.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        2
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">What happened</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Your secret key was lost - this can happen if the app refreshed, you switched devices, or cleared your browser data during the spin process.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        3
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Why you need to wait</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          The blockchain has a pending commitment that needs to expire (~256 blocks). This prevents manipulation and keeps the wheel fair for everyone.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400">
                        ✓
                      </div>
                      <div>
                        <div className="font-semibold text-green-400 text-sm">Your spin is safe!</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Spins are only deducted after a successful reveal. Once the timeout expires, you can spin again with your full balance.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <a
                      href={`https://basescan.org/address/${SPIN_WHEEL_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-amber-400 transition-colors flex items-center justify-center gap-1"
                    >
                      View wheel contract on Basescan →
                    </a>
                  </div>

                  <button
                    onClick={() => setShowSpinIssuePopup(false)}
                    className="mt-4 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
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
                className={`w-full py-3 rounded-xl font-bold text-base transition-all border ${
                  localSpins > 0 
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20 active:scale-[0.98]" 
                    : "bg-zinc-800 border-zinc-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {localSpins > 0 ? "SPIN!" : "No Spins Available"}
              </button>

              <div className="mt-2">
                {!auctionBuyingEnabled ? (
                  <div className="w-full py-3 rounded-xl text-base font-bold bg-zinc-800 border border-zinc-700 text-gray-500 text-center">
                    Buying Temporarily Disabled
                  </div>
                ) : needsApproval ? (
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
                      className="w-full py-3 rounded-xl font-bold text-base bg-amber-500/10 border border-amber-500/50 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <button
                    onClick={handleBuySpin}
                    disabled={isBuying || isBuyingOnChain || isBuyConfirming || userDonutBalance < auctionPrice}
                    className="w-full py-3 rounded-xl font-bold text-base bg-amber-500/10 border border-amber-500/50 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex flex-col items-center justify-center gap-1 py-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-bold">Starting spin...</span>
              </div>
              <span className="text-[10px] text-gray-500">Confirm in wallet</span>
            </div>
          )}

          {stage === "waiting" && (
            <div className="flex flex-col items-center justify-center gap-1 py-3">
              <span className="text-amber-400 text-lg font-bold animate-pulse">🎰 Spinning... 🎰</span>
              <span className="text-[10px] text-gray-500">Generating random result</span>
            </div>
          )}

          {stage === "revealing" && (
            <div className="flex flex-col items-center justify-center gap-1 py-3">
              <span className="text-amber-400 text-lg font-bold animate-pulse">🎰 Spinning... 🎰</span>
              <span className="text-[10px] text-gray-500">Confirm to lock in result</span>
            </div>
          )}

          {stage === "spinning" && (
            <div className="flex flex-col items-center justify-center gap-1 py-3">
              <span className="text-amber-400 text-lg font-bold animate-pulse">🎰 Good luck! 🎰</span>
            </div>
          )}

          {stage === "result" && resultSegment !== null && (
            <>
              <div className="text-center mb-3">
                {SEGMENTS[resultSegment].prize === 0 ? (
                  <>
                    <div className="text-3xl mb-1">💀</div>
                    <div className="text-gray-400 text-sm">Better luck next time!</div>
                  </>
                ) : (
                  <>
                    <div className="text-green-400 text-xl font-bold mb-1">
                      🎉 {SEGMENTS[resultSegment].label} of Pool!
                    </div>
                    <div className="text-gray-400 text-xs">Prizes sent to your wallet</div>
                  </>
                )}
              </div>
              
              <button
                onClick={() => {
                  setStage("idle");
                  setResultSegment(null);
                  setRotation(0);
                  setContinuousRotation(0);
                  setHasRecordedSpin(false);
                  isProcessingRef.current = false;
                  hasStartedRef.current = false;
                  hasTriggeredRevealRef.current = false;
                  if (address) clearSecret(address);
                  resetCommit();
                  resetReveal();
                }}
                className="w-full py-3 rounded-xl font-bold text-base bg-amber-500/10 border border-amber-500/50 text-amber-400 hover:bg-amber-500/20 transition-all"
              >
                {localSpins > 0 ? "Spin Again" : "Done"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}