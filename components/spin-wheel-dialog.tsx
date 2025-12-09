"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { keccak256, encodePacked, formatEther, formatUnits } from "viem";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";

const SPIN_WHEEL_ADDRESS = "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C" as `0x${string}`;
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as `0x${string}`;
const SPIN_AUCTION_ADDRESS = "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4" as `0x${string}`; // SpinAuction contract
const LEADERBOARD_CONTRACT = "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586" as `0x${string}`;

// Token addresses on Base (lowercase for comparison)
const DONUT_ADDRESS_LOWER = DONUT_ADDRESS.toLowerCase();
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D".toLowerCase();

// Auction constants (must match contract)
const AUCTION_MIN_PRICE = 10; // 10 DONUT minimum
const AUCTION_DECAY_PERIOD = 60 * 60; // 1 hour in seconds

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
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
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
    name: "getCurrentPrice",
    outputs: [{ name: "currentPrice", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
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
    inputs: [],
    name: "buySpin",
    outputs: [],
    stateMutability: "nonpayable",
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

// Wheel segments - dark theme colors
const SEGMENTS = [
  { label: "💀", color: "#18181b", glowColor: "#3f3f46", chance: 50, prize: 0 },
  { label: "0.1%", color: "#166534", glowColor: "#22c55e", chance: 25, prize: 0.1 },
  { label: "0.5%", color: "#0e7490", glowColor: "#06b6d4", chance: 15, prize: 0.5 },
  { label: "1%", color: "#6d28d9", glowColor: "#a855f7", chance: 8, prize: 1 },
  { label: "5%", color: "#b45309", glowColor: "#f59e0b", chance: 2, prize: 5 },
];

// Segment angles for wheel (each segment's center position in degrees)
const SEGMENT_ANGLES = [
  36,   // Nothing (0) - center at 36°
  108,  // 0.1% (1) - center at 108°
  180,  // 0.5% (2) - center at 180°
  252,  // 1% (3) - center at 252°
  324,  // 5% (4) - center at 324°
];

// Custom Roulette Wheel Icon - matches the gift icon style
const RouletteIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="9" />
    <line x1="12" y1="15" x2="12" y2="22" />
    <line x1="2" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
  </svg>
);

// Continuous spin animation state
const SPIN_SPEED = 8; // degrees per frame for continuous spin

interface SpinWheelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableSpins: number;
  onSpinComplete?: () => void;
}

export function SpinWheelDialog({ isOpen, onClose, availableSpins, onSpinComplete }: SpinWheelDialogProps) {
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
  const [lastPurchaseTime, setLastPurchaseTime] = useState<number | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const clickSoundRef = useRef<HTMLAudioElement | null>(null);
  const clickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const hasStartedRef = useRef(false);

  // Storage key for secret backup
  const getSecretKey = (addr: string) => `spin-secret-${addr.toLowerCase()}`;

  // Save secret to localStorage
  const saveSecret = useCallback((addr: string, sec: `0x${string}`) => {
    try {
      localStorage.setItem(getSecretKey(addr), sec);
    } catch (e) {
      console.error("Failed to save secret:", e);
    }
  }, []);

  // Load secret from localStorage
  const loadSecret = useCallback((addr: string): `0x${string}` | null => {
    try {
      const saved = localStorage.getItem(getSecretKey(addr));
      return saved as `0x${string}` | null;
    } catch (e) {
      console.error("Failed to load secret:", e);
      return null;
    }
  }, []);

  // Clear secret from localStorage
  const clearSecret = useCallback((addr: string) => {
    try {
      localStorage.removeItem(getSecretKey(addr));
    } catch (e) {
      console.error("Failed to clear secret:", e);
    }
  }, []);

  // Update local spins only when dialog opens or when idle
  useEffect(() => {
    if (isOpen && stage === "idle" && !hasStartedRef.current) {
      setLocalSpins(availableSpins);
    }
  }, [isOpen, availableSpins, stage]);

  // Floating animation for center icons
  useEffect(() => {
    if (!isOpen) return;
    
    let frame: number;
    const animate = () => {
      setFloatOffset(Math.sin(Date.now() / 800) * 3);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Continuous spin animation
  useEffect(() => {
    if (isAnimating && stage !== "spinning" && stage !== "result") {
      const animate = () => {
        setContinuousRotation(prev => prev + SPIN_SPEED);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isAnimating, stage]);

  // Fetch ETH and DONUT prices
  useEffect(() => {
    if (!isOpen) return;
    
    // Fetch ETH price
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then(res => res.json())
      .then(data => setEthPrice(data.ethereum?.usd || 0))
      .catch(() => setEthPrice(0));
    
    // Fetch DONUT price from DexScreener
    fetch("https://api.dexscreener.com/latest/dex/tokens/0xAE4a37d554C6D6F3E398546d8566B25052e0169C")
      .then(res => res.json())
      .then(data => {
        if (data.pairs && data.pairs.length > 0) {
          setDonutPrice(parseFloat(data.pairs[0].priceUsd || 0));
        }
      })
      .catch(() => setDonutPrice(0));
  }, [isOpen]);

  // Initialize click sound
  useEffect(() => {
    clickSoundRef.current = new Audio("/sounds/wheel-click.mp3");
    clickSoundRef.current.volume = 0.3;
    return () => {
      if (clickIntervalRef.current) {
        clearInterval(clickIntervalRef.current);
      }
    };
  }, []);

  // Fetch and calculate auction price from contract
  const { data: auctionState, refetch: refetchAuction } = useReadContract({
    address: SPIN_AUCTION_ADDRESS,
    abi: SPIN_AUCTION_ABI,
    functionName: "getAuctionState",
    chainId: base.id,
    query: {
      refetchInterval: 5000, // Update every 5 seconds
      enabled: isOpen,
    },
  });

  // Update auction price from contract data
  const auctionBuyingEnabled = auctionState?.[7] ?? true;
  
  useEffect(() => {
    if (auctionState) {
      const priceInDonut = Number(auctionState[0]) / 1e18;
      setAuctionPrice(priceInDonut);
      // Set default approval to price + 50% buffer (for multiple buys or price increases)
      if (!approvalAmount || parseFloat(approvalAmount) < priceInDonut) {
        setApprovalAmount(Math.ceil(priceInDonut * 1.5).toString());
      }
    }
  }, [auctionState]);

  // Check DONUT allowance for auction contract
  const { data: donutAllowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SPIN_AUCTION_ADDRESS] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && isOpen,
    },
  });

  // Check DONUT balance
  const { data: donutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && isOpen,
    },
  });

  const userDonutBalance = donutBalance ? Number(donutBalance) / 1e18 : 0;
  const currentAllowance = donutAllowance ? Number(donutAllowance) / 1e18 : 0;
  const needsApproval = currentAllowance < auctionPrice;

  // Contract writes
  const { data: commitHash, writeContract: writeCommit, isPending: isCommitting, reset: resetCommit } = useWriteContract();
  const { data: revealHash, writeContract: writeReveal, isPending: isRevealing, reset: resetReveal } = useWriteContract();

  // Transaction receipts
  const { data: commitReceipt, isLoading: isCommitConfirming } = useWaitForTransactionReceipt({
    hash: commitHash,
    chainId: base.id,
  });

  const { data: revealReceipt, isLoading: isRevealConfirming } = useWaitForTransactionReceipt({
    hash: revealHash,
    chainId: base.id,
  });

  // Check if user can reveal
  const { data: canRevealData, refetch: refetchCanReveal } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "canReveal",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && stage === "waiting",
      refetchInterval: 2000,
    },
  });

  // Check for existing commitment when dialog opens
  const { data: commitmentData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getCommitment",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && isOpen,
    },
  });

  // Check if there's a pending (unrevealed, unexpired) commitment
  const hasPendingCommit = commitmentData && 
    commitmentData[1] > 0n && // commitBlock > 0
    !commitmentData[2] && // not revealed
    commitmentData[4] > 0n; // blocksUntilExpiry > 0 (not expired)
  
  const canRevealPending = commitmentData?.[3] ?? false; // canRevealNow

  // Check for saved secret when dialog opens with pending commit
  useEffect(() => {
    if (isOpen && address && hasPendingCommit && canRevealPending && stage === "idle" && !secret) {
      const savedSecret = loadSecret(address);
      if (savedSecret) {
        console.log("Found saved secret for pending commit");
        setSecret(savedSecret);
      }
    }
  }, [isOpen, address, hasPendingCommit, canRevealPending, stage, loadSecret, secret]);

  // Get pool balances
  const { data: poolData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getPoolBalances",
    chainId: base.id,
  });

  // Get boost info
  const { data: boostData } = useReadContract({
    address: SPIN_WHEEL_ADDRESS,
    abi: SPIN_WHEEL_ABI,
    functionName: "getBoostInfo",
    chainId: base.id,
    query: {
      refetchInterval: 10000,
    },
  });

  // Parse pool data
  const ethPool = poolData?.[0] ? Number(formatEther(poolData[0])) : 0;
  const tokenAddresses = poolData?.[1] || [];
  const tokenBalances = poolData?.[2] || [];
  
  // Find DONUT and SPRINKLES balances
  let donutPool = 0;
  let sprinklesPool = 0;
  
  for (let i = 0; i < tokenAddresses.length; i++) {
    const addr = (tokenAddresses[i] as string).toLowerCase();
    const balance = tokenBalances[i] as bigint;
    if (addr === DONUT_ADDRESS_LOWER) {
      donutPool = Number(formatUnits(balance, 18));
    } else if (addr === SPRINKLES_ADDRESS) {
      sprinklesPool = Number(formatUnits(balance, 18));
    }
  }

  const isBoostActive = boostData?.[0] ?? false;
  const boostMultiplier = boostData?.[1] ? Number(boostData[1]) / 100 : 1;
  const boostTimeRemaining = boostData?.[3] ? Number(boostData[3]) : 0;

  // Format boost time remaining
  const formatBoostTime = (seconds: number) => {
    if (seconds <= 0) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Generate random secret
  const generateSecret = useCallback(() => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return ("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  }, []);

  // Handle commit
  const handleSpin = useCallback(async () => {
    if (!address || localSpins <= 0 || stage !== "idle" || isProcessingRef.current || hasStartedRef.current) return;
    
    // Start spinning animation immediately on click
    setIsAnimating(true);
    setContinuousRotation(0);
    
    // Start click sound interval
    if (clickSoundRef.current) {
      clickIntervalRef.current = setInterval(() => {
        if (clickSoundRef.current) {
          clickSoundRef.current.currentTime = 0;
          clickSoundRef.current.play().catch(() => {});
        }
      }, 150);
    }
    
    hasStartedRef.current = true;
    isProcessingRef.current = true;
    setError(null);
    const newSecret = generateSecret();
    setSecret(newSecret);
    
    // Save secret to localStorage for recovery
    saveSecret(address, newSecret);
    
    // Create commit hash: keccak256(secret, address)
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
      if (clickIntervalRef.current) clearInterval(clickIntervalRef.current);
      isProcessingRef.current = false;
      hasStartedRef.current = false;
      clearSecret(address);
    }
  }, [address, localSpins, generateSecret, writeCommit, stage, saveSecret, clearSecret]);

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

  // Handle buy spin - on-chain transaction
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: writeBuySpin, data: buySpinHash, isPending: isBuyingOnChain } = useWriteContract();
  
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: base.id,
  });
  
  const { isLoading: isBuyConfirming, isSuccess: isBuyConfirmed } = useWaitForTransactionReceipt({
    hash: buySpinHash,
    chainId: base.id,
  });

  // After approval confirmed, trigger buy
  useEffect(() => {
    if (isApproveConfirmed && isBuying) {
      // Now buy the spin
      const priceInWei = BigInt(Math.ceil(auctionPrice * 1.1 * 1e18)); // 10% slippage buffer
      writeBuySpin({
        address: SPIN_AUCTION_ADDRESS,
        abi: SPIN_AUCTION_ABI,
        functionName: "buySpinWithMaxPrice",
        args: [priceInWei],
        chainId: base.id,
      });
    }
  }, [isApproveConfirmed, isBuying, auctionPrice, writeBuySpin]);

  // After buy confirmed, process on backend and update state
  useEffect(() => {
    if (isBuyConfirmed && isBuying && buySpinHash) {
      // Call backend to verify and credit spin
      fetch("/api/spin-auction/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: buySpinHash,
          address,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
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
  }, [isBuyConfirmed, isBuying, buySpinHash, address, onSpinComplete, refetchAuction, refetchAllowance]);

  const handleBuySpin = useCallback(async () => {
    if (!address || isBuying || isApproving || isBuyingOnChain) return;
    
    // Check balance
    if (userDonutBalance < auctionPrice) {
      setError(`Insufficient DONUT. Need ${auctionPrice.toFixed(0)}, have ${userDonutBalance.toFixed(2)}`);
      return;
    }
    
    setIsBuying(true);
    setError(null);
    
    try {
      if (needsApproval) {
        // Use custom approval amount from input
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
        // Already approved, just buy
        const priceInWei = BigInt(Math.ceil(auctionPrice * 1.1 * 1e18)); // 10% slippage buffer
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

  // Auto-reveal when ready
  useEffect(() => {
    if (stage === "waiting" && canRevealData === true && secret) {
      handleReveal();
    }
  }, [stage, canRevealData, secret, handleReveal]);

  // Watch reveal confirmation and animate wheel
  useEffect(() => {
    // Guard against multiple fires
    if (revealReceipt?.status === "success" && stage === "revealing") {
      // Parse the SpinRevealed event from logs
      const logs = revealReceipt.logs;
      let segment = 0;
      
      // Event: SpinRevealed(address indexed user, uint256 segment, uint256 randomNumber, uint256 boostMultiplier)
      // Only 'user' is indexed (topics[1]), segment/randomNumber/boostMultiplier are in data
      for (const log of logs) {
        if (log.address.toLowerCase() === SPIN_WHEEL_ADDRESS.toLowerCase()) {
          try {
            // data contains: segment (32 bytes) + randomNumber (32 bytes) + boostMultiplier (32 bytes)
            // Each uint256 is 32 bytes (64 hex chars)
            const data = log.data;
            if (data && data.length >= 66) { // 0x + 64 chars minimum
              // First 32 bytes (chars 2-66) is the segment
              const segmentHex = data.slice(2, 66);
              segment = parseInt(segmentHex, 16);
              console.log("Parsed segment from log:", segment, "raw hex:", segmentHex);
            }
          } catch (e) {
            console.error("Failed to parse segment:", e);
          }
          break;
        }
      }
      
      // Validate segment is in valid range
      if (segment < 0 || segment > 4) {
        console.warn("Invalid segment:", segment, "defaulting to 0");
        segment = 0;
      }
      
      setResultSegment(segment);
      setStage("spinning");
      
      // Stop continuous animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setIsAnimating(false);
      
      // Slow down and stop click sound
      if (clickIntervalRef.current) {
        clearInterval(clickIntervalRef.current);
        // Play a few slower clicks as it slows down
        let clickDelay = 200;
        const slowClicks = () => {
          if (clickDelay < 600 && clickSoundRef.current) {
            clickSoundRef.current.currentTime = 0;
            clickSoundRef.current.play().catch(() => {});
            clickDelay += 100;
            setTimeout(slowClicks, clickDelay);
          }
        };
        slowClicks();
      }
      
      // Calculate rotation to land on correct segment
      // Start from current continuous rotation, add spins, land on segment
      const targetAngle = SEGMENT_ANGLES[segment];
      const fullSpins = 3 * 360;
      const finalRotation = continuousRotation + fullSpins + (360 - targetAngle) - (continuousRotation % 360);
      
      setRotation(finalRotation);
      
      // After animation, show result
      setTimeout(() => {
        setStage("result");
        
        // Record spin usage - only once per spin
        if (!hasRecordedSpin) {
          setHasRecordedSpin(true);
          console.log("Recording spin usage:", { address, revealTxHash: revealReceipt.transactionHash, segment });
          
          fetch("/api/spins/use", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              revealTxHash: revealReceipt.transactionHash,
              segment,
              prizes: {},
            }),
          })
          .then(res => res.json())
          .then(data => {
            console.log("Spin use response:", data);
            onSpinComplete?.();
          })
          .catch(err => console.error("Spin use error:", err));
        }
        
      }, 4200);
      
    } else if (revealReceipt?.status === "reverted") {
      setError("Reveal transaction failed");
      setStage("idle");
    }
  }, [revealReceipt, address, onSpinComplete, hasRecordedSpin, stage, continuousRotation]);

  // Reset on close
  const handleClose = useCallback(() => {
    // Stop any animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Stop click sound
    if (clickIntervalRef.current) {
      clearInterval(clickIntervalRef.current);
    }
    
    // Only clear secret if spin is complete (result shown)
    if (stage === "result" && address) {
      clearSecret(address);
    }
    setStage("idle");
    setSecret(null);
    setRotation(0);
    setContinuousRotation(0);
    setIsAnimating(false);
    setResultSegment(null);
    setError(null);
    setHasRecordedSpin(false);
    isProcessingRef.current = false;
    hasStartedRef.current = false;
    resetCommit();
    resetReveal();
    onClose();
  }, [onClose, resetCommit, resetReveal, stage, address, clearSecret]);

  if (!isOpen) return null;

  const isProcessing = stage !== "idle" && stage !== "result";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={!isProcessing ? handleClose : undefined} />
      
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl max-h-[85vh] overflow-hidden">
          {/* Header with back button only */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            
            <h2 className="text-lg font-bold text-white tracking-wide">
              Glaze Wheel
            </h2>
            
            <div className="w-8" /> {/* Spacer for centering */}
          </div>
          
          {/* Boost Banner */}
          {isBoostActive && (
            <div className="mb-3 p-2 rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/50">
              <div className="flex items-center justify-center gap-2">
                <span className="text-base">🔥</span>
                <div className="text-center">
                  <div className="text-amber-400 font-bold text-xs">
                    {boostMultiplier}x BOOST ACTIVE!
                  </div>
                  <div className="text-amber-400/70 text-[9px]">
                    {formatBoostTime(boostTimeRemaining)} remaining
                  </div>
                </div>
                <span className="text-base">🔥</span>
              </div>
            </div>
          )}
          
          {/* Pool info - styled like leaderboard with USD */}
          <div className="mb-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 text-center">Prize Pool</div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm font-bold text-green-400">Ξ{ethPool.toFixed(2)}</span>
              <span className="text-sm font-bold text-amber-400">🍩{donutPool.toFixed(2)}</span>
              <span className="text-sm font-bold text-white flex items-center gap-0.5 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]">
                <Sparkles className="w-3.5 h-3.5" />
                {Math.floor(sprinklesPool).toLocaleString()}
              </span>
            </div>
            <div className="text-center mt-1.5 text-xs text-gray-400">
              ≈ ${((ethPool * ethPrice) + (donutPool * donutPrice)).toFixed(2)} USD
            </div>
          </div>

          {/* Donut Wheel - Larger with white glow */}
          <div className={`relative w-56 h-56 mx-auto mb-2 ${isBoostActive ? "drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]" : "drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"}`}>
            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
              <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>
            
            {/* Wheel SVG - White with colored glowing text */}
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full"
              style={{
                transform: `rotate(${stage === "spinning" ? rotation : (isAnimating ? continuousRotation : rotation)}deg)`,
                transitionDuration: stage === "spinning" ? "4s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              {/* Outer ring */}
              <circle cx="100" cy="100" r="98" fill="none" stroke="#3f3f46" strokeWidth="2" />
              
              {/* Segments - White/Light gray alternating */}
              {SEGMENTS.map((seg, i) => {
                const startAngle = i * 72 - 90;
                const endAngle = startAngle + 72;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                
                const outerR = 95;
                const innerR = 35;
                
                const ox1 = 100 + outerR * Math.cos(startRad);
                const oy1 = 100 + outerR * Math.sin(startRad);
                const ox2 = 100 + outerR * Math.cos(endRad);
                const oy2 = 100 + outerR * Math.sin(endRad);
                
                const ix1 = 100 + innerR * Math.cos(startRad);
                const iy1 = 100 + innerR * Math.sin(startRad);
                const ix2 = 100 + innerR * Math.cos(endRad);
                const iy2 = 100 + innerR * Math.sin(endRad);
                
                const labelAngle = startAngle + 36;
                const labelRad = (labelAngle * Math.PI) / 180;
                const labelR = (outerR + innerR) / 2;
                const labelX = 100 + labelR * Math.cos(labelRad);
                const labelY = 100 + labelR * Math.sin(labelRad);
                
                // Alternating white/light gray
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
                      style={{ 
                        filter: `drop-shadow(0 0 6px ${seg.glowColor}) drop-shadow(0 0 10px ${seg.glowColor})`,
                      }}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              
              {/* Inner donut hole - dark */}
              <circle cx="100" cy="100" r="35" fill="#18181b" />
              <circle cx="100" cy="100" r="33" fill="none" stroke="#3f3f46" strokeWidth="2" />
            </svg>

            {/* Floating Center Donut - counter-rotate to stay upright */}
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ 
                transform: `rotate(${-(stage === "spinning" ? rotation : (isAnimating ? continuousRotation : rotation))}deg)`,
                transitionDuration: stage === "spinning" ? "4s" : "0s",
                transitionTimingFunction: "cubic-bezier(0.17, 0.67, 0.12, 0.99)",
              }}
            >
              <span 
                className="text-3xl"
                style={{ 
                  transform: `translateY(${floatOffset}px)`,
                  transition: 'transform 0.1s ease-out',
                }}
              >
                🍩
              </span>
            </div>
          </div>

          {/* Status / Actions */}
          <div className="text-center">
            {error && (
              <div className="text-red-400 text-sm mb-3">{error}</div>
            )}
            
            {stage === "idle" && hasPendingCommit && (
              <>
                <div className="text-xs text-amber-400 mb-2">
                  ⚠️ Previous spin pending
                </div>
                {canRevealPending && secret ? (
                  <>
                    <button
                      onClick={() => {
                        hasStartedRef.current = true;
                        setStage("revealing");
                        handleReveal();
                      }}
                      className="w-full py-2.5 rounded-xl font-bold text-base bg-green-500 text-white hover:bg-green-400 transition-all"
                    >
                      RESUME SPIN!
                    </button>
                    <div className="text-[9px] text-gray-500 mt-1.5">
                      Tap to finish your spin
                    </div>
                  </>
                ) : canRevealPending ? (
                  <div className="text-[10px] text-gray-400">
                    Secret not found - waiting for expiry (~{commitmentData?.[4] ? Math.ceil(Number(commitmentData[4]) * 2 / 60) : "?"} min)
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400">
                    Waiting for next block...
                  </div>
                )}
              </>
            )}
            
            {stage === "idle" && !hasPendingCommit && (
              <>
                <div className="text-sm text-gray-400 mb-1.5">
                  You have <span className="text-amber-400 font-bold">{localSpins}</span> spin{localSpins !== 1 ? "s" : ""}
                </div>
                <button
                  onClick={handleSpin}
                  disabled={localSpins <= 0 || hasStartedRef.current}
                  className={`w-full py-2 rounded-xl font-bold text-base transition-all ${
                    localSpins > 0
                      ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]"
                      : "bg-zinc-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {localSpins > 0 ? "SPIN!" : "No Spins Available"}
                </button>
                
                {/* Buy Spin Section */}
                <div className="mt-2">
                  <div className="text-[10px] text-gray-500 mb-2">Or buy a spin instantly</div>
                  {!auctionBuyingEnabled ? (
                    <div className="w-full py-2 rounded-xl text-sm bg-zinc-800 text-gray-500 text-center">
                      Buying Temporarily Disabled
                    </div>
                  ) : (
                    <>
                      {/* Approval Amount Input - only show if needs approval */}
                      {needsApproval && (
                        <div className="mb-2">
                          <div className="text-[9px] text-gray-500 mb-1">Approval Amount (DONUT)</div>
                          <input
                            type="number"
                            value={approvalAmount}
                            onChange={(e) => setApprovalAmount(e.target.value)}
                            placeholder={Math.ceil(auctionPrice * 1.5).toString()}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-amber-500 focus:outline-none"
                          />
                          <div className="text-[8px] text-gray-600 mt-0.5">
                            Set higher for multiple purchases without re-approving
                          </div>
                        </div>
                      )}
                      <button
                        onClick={handleBuySpin}
                        disabled={isBuying || isApproving || isBuyingOnChain || isApproveConfirming || isBuyConfirming || userDonutBalance < auctionPrice}
                        className="w-full py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isApproving || isApproveConfirming ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Approving DONUT...
                          </span>
                        ) : isBuyingOnChain || isBuyConfirming ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Buying Spin...
                          </span>
                        ) : userDonutBalance < auctionPrice ? (
                          <>Insufficient DONUT</>
                        ) : needsApproval ? (
                          <>Approve & Buy - 🍩{auctionPrice.toFixed(0)}</>
                        ) : (
                          <>Buy Spin - 🍩{auctionPrice.toFixed(0)}</>
                        )}
                      </button>
                    </>
                  )}
                  <div className="text-[8px] text-gray-600 mt-1 flex justify-between">
                    <span>Price doubles, decays to 10 over 1hr</span>
                    <span>Balance: 🍩{userDonutBalance.toFixed(1)}</span>
                  </div>
                </div>
              </>
            )}
            
            {stage === "committing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Committing...</span>
              </div>
            )}
            
            {stage === "waiting" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Waiting for block...</span>
              </div>
            )}
            
            {stage === "revealing" && (
              <div className="flex items-center justify-center gap-2 text-amber-400 py-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Revealing...</span>
              </div>
            )}
            
            {stage === "spinning" && (
              <div className="text-amber-400 font-bold py-2 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Spinning...</span>
              </div>
            )}
            
            {stage === "result" && resultSegment !== null && (
              <>
                <div className={`text-xl font-bold mb-1.5 ${resultSegment === 0 ? "text-gray-400" : "text-green-400"}`}>
                  {resultSegment === 0 ? "💀 Nothing" : `🎉 Won ${(SEGMENTS[resultSegment].prize * boostMultiplier).toFixed(1)}%!`}
                </div>
                {resultSegment > 0 && (
                  <div className="text-xs text-gray-400 mb-2">
                    {isBoostActive && <span className="text-amber-400">🔥 {boostMultiplier}x Boosted! </span>}
                    Prizes sent to your wallet!
                  </div>
                )}
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 rounded-xl font-bold text-base bg-white text-black hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}