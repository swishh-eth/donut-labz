"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, zeroAddress, type Address } from "viem";
import { ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { cn } from "@/lib/utils";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { getEthPrice } from "@/lib/utils";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type AuctionState = {
  epochId: bigint | number;
  initPrice: bigint;
  startTime: bigint | number;
  paymentToken: Address;
  price: bigint;
  paymentTokenPrice: bigint;
  wethAccumulated: bigint;
  wethBalance: bigint;
  paymentTokenBalance: bigint;
};

// Contract addresses
const DONUT_LP_TOKEN = "0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703" as Address;
const SPRINKLES_LP_TOKEN = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668" as Address;
const SPRINKLES_AUCTION = "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as Address;
const DONUT_SPLITTER = "0x99DABA873CC4c701280624603B28d3e3F286b590" as Address;
const DONUT_TOKEN = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as Address;

const DEADLINE_BUFFER_SECONDS = 5 * 60;

const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const SPRINKLES_AUCTION_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPaymentTokenAmount", type: "uint256" },
    ],
    name: "buy",
    outputs: [
      { internalType: "uint256", name: "paymentAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardAmount", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getSlot0",
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "locked", type: "uint8" },
          { internalType: "uint16", name: "epochId", type: "uint16" },
          { internalType: "uint192", name: "initPrice", type: "uint192" },
          { internalType: "uint40", name: "startTime", type: "uint40" },
        ],
        internalType: "struct SprinklesAuction.Slot0",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRewardsAvailable",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getAuctionState",
    outputs: [
      { internalType: "uint16", name: "epochId", type: "uint16" },
      { internalType: "uint192", name: "initPrice", type: "uint192" },
      { internalType: "uint40", name: "startTime", type: "uint40" },
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "uint256", name: "rewardsAvailable", type: "uint256" },
      { internalType: "uint256", name: "userLPBalance", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const SPLITTER_ABI = [
  {
    inputs: [],
    name: "split",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingDonut",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const toBigInt = (value: bigint | number) =>
  typeof value === "bigint" ? value : BigInt(value);

const formatTokenAmount = (value: bigint, maximumFractionDigits = 4) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function BurnPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0);
  
  // DONUT LP Burn state
  const [donutBurnResult, setDonutBurnResult] = useState<"success" | "failure" | null>(null);
  const [donutTxStep, setDonutTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const donutResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SPRINKLES LP Burn state
  const [sprinklesBurnResult, setSprinklesBurnResult] = useState<"success" | "failure" | null>(null);
  const [sprinklesTxStep, setSprinklesTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const sprinklesResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Split state
  const [splitResult, setSplitResult] = useState<"success" | "failure" | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  
  // Find the best connector - prefer injected (MetaMask) for desktop, farcaster for mobile
  const getConnector = useCallback(() => {
    // Look for injected wallet (MetaMask, etc) first for desktop
    const injected = connectors.find(c => c.id === 'injected' || c.name === 'MetaMask');
    if (injected) return injected;
    
    // Then try coinbase wallet
    const coinbase = connectors.find(c => c.id === 'coinbaseWalletSDK' || c.name === 'Coinbase Wallet');
    if (coinbase) return coinbase;
    
    // Fall back to first available
    return connectors[0];
  }, [connectors]);

  const primaryConnector = getConnector();

  // Auto connect
  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Farcaster context
  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as { context: Promise<MiniAppContext> | MiniAppContext }).context) as MiniAppContext;
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

  // ETH price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  // DONUT price from prices API
  useEffect(() => {
    const fetchDonutPrice = async () => {
      try {
        const res = await fetch("/api/prices");
        if (res.ok) {
          const data = await res.json();
          if (data.donutPrice) {
            setDonutUsdPrice(data.donutPrice);
          }
        }
      } catch (error) {
        console.error("Failed to fetch DONUT price:", error);
      }
    };
    fetchDonutPrice();
    const interval = setInterval(fetchDonutPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (donutResultTimeoutRef.current) clearTimeout(donutResultTimeoutRef.current);
      if (sprinklesResultTimeoutRef.current) clearTimeout(sprinklesResultTimeoutRef.current);
    };
  }, []);

  // ============== DONUT LP BURN (existing Blazery) ==============
  const { data: rawDonutAuctionState, refetch: refetchDonutAuction } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getAuction",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 3_000 },
  });

  const donutAuctionState = useMemo(() => {
    if (!rawDonutAuctionState) return undefined;
    return rawDonutAuctionState as unknown as AuctionState;
  }, [rawDonutAuctionState]);

  // ============== SPRINKLES LP BURN ==============
  const { data: sprinklesAuctionData, refetch: refetchSprinklesAuction } = useReadContract({
    address: SPRINKLES_AUCTION,
    abi: SPRINKLES_AUCTION_ABI,
    functionName: "getAuctionState",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 3_000 },
  });

  const sprinklesAuctionState = useMemo(() => {
    if (!sprinklesAuctionData) return undefined;
    const [epochId, initPrice, startTime, price, rewardsAvailable, userLPBalance] = sprinklesAuctionData;
    return { epochId, initPrice, startTime, price, rewardsAvailable, userLPBalance };
  }, [sprinklesAuctionData]);

  // ============== SPLITTER ==============
  const { data: pendingDonut, refetch: refetchPendingDonut } = useReadContract({
    address: DONUT_SPLITTER,
    abi: SPLITTER_ABI,
    functionName: "pendingDonut",
    chainId: base.id,
    query: { refetchInterval: 10_000 },
  });

  // ============== WRITE CONTRACTS ==============
  const {
    data: donutTxHash,
    writeContract: writeDonutContract,
    isPending: isDonutWriting,
    reset: resetDonutWrite,
  } = useWriteContract();

  const {
    data: sprinklesTxHash,
    writeContract: writeSprinklesContract,
    isPending: isSprinklesWriting,
    reset: resetSprinklesWrite,
  } = useWriteContract();

  const {
    data: splitTxHash,
    writeContract: writeSplitContract,
    isPending: isSplitWriting,
    reset: resetSplitWrite,
  } = useWriteContract();

  const { data: donutReceipt, isLoading: isDonutConfirming } = useWaitForTransactionReceipt({
    hash: donutTxHash,
    chainId: base.id,
  });

  const { data: sprinklesReceipt, isLoading: isSprinklesConfirming } = useWaitForTransactionReceipt({
    hash: sprinklesTxHash,
    chainId: base.id,
  });

  const { data: splitReceipt, isLoading: isSplitConfirming } = useWaitForTransactionReceipt({
    hash: splitTxHash,
    chainId: base.id,
  });

  // ============== DONUT BURN HANDLERS ==============
  const showDonutResult = useCallback((result: "success" | "failure") => {
    if (donutResultTimeoutRef.current) clearTimeout(donutResultTimeoutRef.current);
    setDonutBurnResult(result);
    donutResultTimeoutRef.current = setTimeout(() => {
      setDonutBurnResult(null);
      donutResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  const handleDonutBurn = useCallback(async () => {
    if (!donutAuctionState) return;
    setDonutBurnResult(null);
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address");

      const price = donutAuctionState.price;
      const epochId = toBigInt(donutAuctionState.epochId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

      if (donutTxStep === "idle") {
        setDonutTxStep("approving");
        await writeDonutContract({
          account: targetAddress as Address,
          address: DONUT_LP_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACT_ADDRESSES.multicall as Address, price],
          chainId: base.id,
        });
        return;
      }

      if (donutTxStep === "buying") {
        await writeDonutContract({
          account: targetAddress as Address,
          address: CONTRACT_ADDRESSES.multicall as Address,
          abi: MULTICALL_ABI,
          functionName: "buy",
          args: [epochId, deadline, price],
          chainId: base.id,
        });
      }
    } catch (error) {
      console.error("DONUT burn failed:", error);
      showDonutResult("failure");
      setDonutTxStep("idle");
      resetDonutWrite();
    }
  }, [address, connectAsync, donutAuctionState, primaryConnector, donutTxStep, writeDonutContract, showDonutResult, resetDonutWrite]);

  useEffect(() => {
    if (!donutReceipt) return;
    if (donutReceipt.status === "reverted") {
      showDonutResult("failure");
      setDonutTxStep("idle");
      refetchDonutAuction();
      setTimeout(() => resetDonutWrite(), 500);
      return;
    }
    if (donutTxStep === "approving") {
      resetDonutWrite();
      setDonutTxStep("buying");
      return;
    }
    if (donutTxStep === "buying") {
      showDonutResult("success");
      setDonutTxStep("idle");
      refetchDonutAuction();
      setTimeout(() => resetDonutWrite(), 500);
    }
  }, [donutReceipt, refetchDonutAuction, resetDonutWrite, showDonutResult, donutTxStep]);

  useEffect(() => {
    if (donutTxStep === "buying" && !isDonutWriting && !isDonutConfirming && !donutTxHash) {
      handleDonutBurn();
    }
  }, [donutTxStep, isDonutWriting, isDonutConfirming, donutTxHash, handleDonutBurn]);

  // ============== SPRINKLES BURN HANDLERS ==============
  const showSprinklesResult = useCallback((result: "success" | "failure") => {
    if (sprinklesResultTimeoutRef.current) clearTimeout(sprinklesResultTimeoutRef.current);
    setSprinklesBurnResult(result);
    sprinklesResultTimeoutRef.current = setTimeout(() => {
      setSprinklesBurnResult(null);
      sprinklesResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  const handleSprinklesBurn = useCallback(async () => {
    if (!sprinklesAuctionState) return;
    setSprinklesBurnResult(null);
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address");

      const price = sprinklesAuctionState.price;
      const epochId = BigInt(sprinklesAuctionState.epochId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

      if (sprinklesTxStep === "idle") {
        setSprinklesTxStep("approving");
        await writeSprinklesContract({
          account: targetAddress as Address,
          address: SPRINKLES_LP_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SPRINKLES_AUCTION, price],
          chainId: base.id,
        });
        return;
      }

      if (sprinklesTxStep === "buying") {
        await writeSprinklesContract({
          account: targetAddress as Address,
          address: SPRINKLES_AUCTION,
          abi: SPRINKLES_AUCTION_ABI,
          functionName: "buy",
          args: [epochId, deadline, price],
          chainId: base.id,
        });
      }
    } catch (error) {
      console.error("SPRINKLES burn failed:", error);
      showSprinklesResult("failure");
      setSprinklesTxStep("idle");
      resetSprinklesWrite();
    }
  }, [address, connectAsync, sprinklesAuctionState, primaryConnector, sprinklesTxStep, writeSprinklesContract, showSprinklesResult, resetSprinklesWrite]);

  useEffect(() => {
    if (!sprinklesReceipt) return;
    if (sprinklesReceipt.status === "reverted") {
      showSprinklesResult("failure");
      setSprinklesTxStep("idle");
      refetchSprinklesAuction();
      setTimeout(() => resetSprinklesWrite(), 500);
      return;
    }
    if (sprinklesTxStep === "approving") {
      resetSprinklesWrite();
      setSprinklesTxStep("buying");
      return;
    }
    if (sprinklesTxStep === "buying") {
      showSprinklesResult("success");
      setSprinklesTxStep("idle");
      refetchSprinklesAuction();
      refetchPendingDonut();
      setTimeout(() => resetSprinklesWrite(), 500);
    }
  }, [sprinklesReceipt, refetchSprinklesAuction, refetchPendingDonut, resetSprinklesWrite, showSprinklesResult, sprinklesTxStep]);

  useEffect(() => {
    if (sprinklesTxStep === "buying" && !isSprinklesWriting && !isSprinklesConfirming && !sprinklesTxHash) {
      handleSprinklesBurn();
    }
  }, [sprinklesTxStep, isSprinklesWriting, isSprinklesConfirming, sprinklesTxHash, handleSprinklesBurn]);

  // ============== SPLIT HANDLER ==============
  const handleSplit = useCallback(async () => {
    if (!pendingDonut || pendingDonut === 0n) return;
    setIsSplitting(true);
    setSplitResult(null);
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      await writeSplitContract({
        account: targetAddress as Address,
        address: DONUT_SPLITTER,
        abi: SPLITTER_ABI,
        functionName: "split",
        chainId: base.id,
      });
    } catch (error) {
      console.error("Split failed:", error);
      setSplitResult("failure");
      setIsSplitting(false);
      resetSplitWrite();
    }
  }, [address, connectAsync, pendingDonut, primaryConnector, writeSplitContract, resetSplitWrite]);

  useEffect(() => {
    if (!splitReceipt) return;
    if (splitReceipt.status === "reverted") {
      setSplitResult("failure");
    } else {
      setSplitResult("success");
      refetchPendingDonut();
      refetchSprinklesAuction();
    }
    setIsSplitting(false);
    setTimeout(() => {
      resetSplitWrite();
      setSplitResult(null);
    }, 3000);
  }, [splitReceipt, refetchPendingDonut, refetchSprinklesAuction, resetSplitWrite]);

  // ============== DISPLAY VALUES ==============
  const donutPriceDisplay = donutAuctionState ? formatTokenAmount(donutAuctionState.price, 5) : "—";
  const donutClaimableDisplay = donutAuctionState ? formatTokenAmount(donutAuctionState.wethAccumulated, 8) : "—";

  const sprinklesPriceDisplay = sprinklesAuctionState ? formatTokenAmount(sprinklesAuctionState.price, 5) : "—";
  const sprinklesRewardsDisplay = sprinklesAuctionState ? formatTokenAmount(sprinklesAuctionState.rewardsAvailable, 2) : "—";
  const sprinklesUserLPDisplay = sprinklesAuctionState ? formatTokenAmount(sprinklesAuctionState.userLPBalance, 4) : "0";

  const pendingDonutDisplay = pendingDonut ? formatTokenAmount(pendingDonut, 2) : "0";

  const donutButtonLabel = useMemo(() => {
    if (!donutAuctionState) return "Loading…";
    if (donutBurnResult === "success") return "SUCCESS";
    if (donutBurnResult === "failure") return "FAILED";
    if (isDonutWriting || isDonutConfirming) {
      if (donutTxStep === "approving") return "APPROVING…";
      if (donutTxStep === "buying") return "BURNING…";
      return "PROCESSING…";
    }
    return "BURN";
  }, [donutBurnResult, isDonutConfirming, isDonutWriting, donutAuctionState, donutTxStep]);

  const sprinklesButtonLabel = useMemo(() => {
    if (!sprinklesAuctionState) return "Loading…";
    if (sprinklesBurnResult === "success") return "SUCCESS";
    if (sprinklesBurnResult === "failure") return "FAILED";
    if (isSprinklesWriting || isSprinklesConfirming) {
      if (sprinklesTxStep === "approving") return "APPROVING…";
      if (sprinklesTxStep === "buying") return "BURNING…";
      return "PROCESSING…";
    }
    return "BURN";
  }, [sprinklesBurnResult, isSprinklesConfirming, isSprinklesWriting, sprinklesAuctionState, sprinklesTxStep]);

  const splitButtonLabel = useMemo(() => {
    if (splitResult === "success") return "SPLIT!";
    if (splitResult === "failure") return "FAILED";
    if (isSplitting || isSplitWriting || isSplitConfirming) return "SPLITTING…";
    return "SPLIT";
  }, [splitResult, isSplitting, isSplitWriting, isSplitConfirming]);

  const hasInsufficientDonutLP = donutAuctionState && donutAuctionState.paymentTokenBalance < donutAuctionState.price;
  const hasInsufficientSprinklesLP = sprinklesAuctionState && sprinklesAuctionState.userLPBalance < sprinklesAuctionState.price;
  const hasNoSprinklesRewards = sprinklesAuctionState && sprinklesAuctionState.rewardsAvailable === 0n;
  const sprinklesPriceIsZero = sprinklesAuctionState && sprinklesAuctionState.price === 0n;
  const donutPriceIsZero = donutAuctionState && donutAuctionState.price === 0n;

  const isDonutBurnDisabled = !donutAuctionState || isDonutWriting || isDonutConfirming || donutBurnResult !== null || hasInsufficientDonutLP || donutPriceIsZero;
  const isSprinklesBurnDisabled = !sprinklesAuctionState || isSprinklesWriting || isSprinklesConfirming || sprinklesBurnResult !== null || hasInsufficientSprinklesLP || hasNoSprinklesRewards || sprinklesPriceIsZero;
  const isSplitDisabled = !pendingDonut || pendingDonut === 0n || isSplitting || isSplitWriting || isSplitConfirming || splitResult !== null;

  const donutProfitLoss = useMemo(() => {
    if (!donutAuctionState) return null;
    const lpValueInEth = Number(formatEther(donutAuctionState.price)) * Number(formatEther(donutAuctionState.paymentTokenPrice));
    const lpValueInUsd = lpValueInEth * ethUsdPrice;
    const wethReceivedInEth = Number(formatEther(donutAuctionState.wethAccumulated));
    const wethValueInUsd = wethReceivedInEth * ethUsdPrice;
    const profitLoss = wethValueInUsd - lpValueInUsd;
    return { profitLoss, isProfitable: profitLoss > 0, lpValueInUsd, wethValueInUsd };
  }, [donutAuctionState, ethUsdPrice]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username ? `@${context.user.username}` : context?.user?.fid ? `fid ${context.user.fid}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  // Manual connect for desktop users
  const handleConnect = useCallback(async () => {
    console.log("Connect clicked!");
    console.log("Primary connector:", primaryConnector);
    console.log("All connectors:", connectors);
    
    if (!primaryConnector) {
      alert("No wallet connector available. Do you have MetaMask or Rabby installed?");
      return;
    }
    try {
      console.log("Connecting with:", primaryConnector.name, primaryConnector.id);
      const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
      console.log("Connect result:", result);
    } catch (error) {
      console.error("Failed to connect:", error);
      alert("Failed to connect: " + (error as Error).message);
    }
  }, [connectAsync, primaryConnector, connectors]);

  // Debug: log available connectors
  useEffect(() => {
    console.log("Available connectors:", connectors.map(c => ({ id: c.id, name: c.name })));
  }, [connectors]);

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/")}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-2xl font-bold tracking-wide">BURN</h1>
            </div>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                </div>
              </div>
            )}
            {!isConnected && !context?.user && (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect"}
              </button>
            )}
            {isConnected && address && !context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-mono text-white">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </div>
            )}
          </div>

          {/* Pending DONUT Splitter Section */}
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-3 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🍩</span>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Pending Split</div>
                  <div className="text-sm font-bold text-white">{pendingDonutDisplay} DONUT</div>
                </div>
              </div>
              <button
                onClick={handleSplit}
                disabled={isSplitDisabled}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  splitResult === "success"
                    ? "bg-green-500 text-white"
                    : splitResult === "failure"
                      ? "bg-red-500 text-white"
                      : isSplitDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                )}
              >
                <RefreshCw className={cn("w-3 h-3", (isSplitting || isSplitWriting || isSplitConfirming) && "animate-spin")} />
                {splitButtonLabel}
              </button>
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5">
              Splits 50% to leaderboard, 50% to SPRINKLES burn pool
            </p>
          </div>

          {/* Two Section Layout */}
          <div className="flex-1 flex flex-col gap-3">
            {/* SPRINKLES LP Burn Section */}
            <div className="flex-1 rounded-xl border border-amber-500/30 bg-zinc-900 p-3 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-amber-400">SPRINKLES LP Burn</h2>
              </div>

              {/* Pay / Get Cards */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-lg border border-amber-500/50 bg-black p-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">PAY</div>
                  <div className="text-base font-semibold text-amber-400">{sprinklesPriceDisplay} LP</div>
                  <div className="text-[9px] text-gray-400">
                    ${sprinklesAuctionState && donutUsdPrice > 0
                      ? (Number(formatEther(sprinklesAuctionState.price)) * donutUsdPrice * 2).toFixed(2)
                      : "0.00"}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-black p-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">GET</div>
                  <div className="text-base font-semibold text-white">🍩 {sprinklesRewardsDisplay}</div>
                  <div className="text-[9px] text-gray-400">
                    ${sprinklesAuctionState && donutUsdPrice > 0
                      ? (Number(formatEther(sprinklesAuctionState.rewardsAvailable)) * donutUsdPrice).toFixed(2)
                      : "0.00"}
                  </div>
                </div>
              </div>

              {/* Price Zero Warning */}
              {sprinklesPriceIsZero && (
                <div className="text-center text-[9px] text-gray-400 mb-2">
                  Epoch ended - waiting for next auction
                </div>
              )}

              {/* Burn Button */}
              <button
                onClick={handleSprinklesBurn}
                disabled={isSprinklesBurnDisabled}
                className={cn(
                  "w-full rounded-xl py-2.5 text-sm font-bold transition-all duration-300",
                  sprinklesBurnResult === "success"
                    ? "bg-green-500 text-white"
                    : sprinklesBurnResult === "failure"
                      ? "bg-red-500 text-white"
                      : isSprinklesBurnDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                )}
              >
                {sprinklesButtonLabel}
              </button>

              {/* LP Balance & Get LP Link */}
              <div className="flex items-center justify-between mt-1.5 px-1">
                <div className="text-[10px] text-gray-400">
                  Balance: <span className="text-white font-semibold">{sprinklesUserLPDisplay}</span> LP
                </div>
                <a
                  href="https://aerodrome.finance/deposit?token0=0xa890060BE1788a676dBC3894160f5dc5DeD2C98D&token1=0xAE4a37d554C6D6F3E398546d8566B25052e0169C&type=-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                >
                  Get LP →
                </a>
              </div>
            </div>

            {/* DONUT LP Burn Section */}
            <div className="flex-1 rounded-xl border border-amber-500/30 bg-zinc-900 p-3 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🍩</span>
                <h2 className="text-base font-bold text-amber-400">DONUT LP Burn</h2>
              </div>

              {/* Pay / Get Cards */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-lg border border-amber-500/50 bg-black p-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">PAY</div>
                  <div className="text-base font-semibold text-amber-400">{donutPriceDisplay} LP</div>
                  <div className="text-[9px] text-gray-400">
                    ${donutAuctionState
                      ? (Number(formatEther(donutAuctionState.price)) * Number(formatEther(donutAuctionState.paymentTokenPrice)) * ethUsdPrice).toFixed(2)
                      : "0.00"}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-black p-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">GET</div>
                  <div className="text-base font-semibold text-white">Ξ{donutClaimableDisplay}</div>
                  <div className="text-[9px] text-gray-400">
                    ${donutAuctionState ? (Number(formatEther(donutAuctionState.wethAccumulated)) * ethUsdPrice).toFixed(2) : "0.00"}
                  </div>
                </div>
              </div>

              {/* Profit/Loss Indicator */}
              {donutProfitLoss && (
                <div className={cn(
                  "text-center text-[9px] font-semibold px-2 py-1 rounded mb-2",
                  donutProfitLoss.isProfitable ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                )}>
                  {donutProfitLoss.isProfitable ? "💰 " : "⚠️ "}
                  {donutProfitLoss.isProfitable ? "+" : ""}${donutProfitLoss.profitLoss.toFixed(2)}
                </div>
              )}

              {/* Burn Button */}
              <button
                onClick={handleDonutBurn}
                disabled={isDonutBurnDisabled}
                className={cn(
                  "w-full rounded-xl py-2.5 text-sm font-bold transition-all duration-300",
                  donutBurnResult === "success"
                    ? "bg-green-500 text-white"
                    : donutBurnResult === "failure"
                      ? "bg-red-500 text-white"
                      : isDonutBurnDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                )}
              >
                {donutButtonLabel}
              </button>

              {/* LP Balance & Get LP Link */}
              <div className="flex items-center justify-between mt-1.5 px-1">
                <div className="text-[10px] text-gray-400">
                  Balance: <span className="text-white font-semibold">{address && donutAuctionState?.paymentTokenBalance ? formatTokenAmount(donutAuctionState.paymentTokenBalance, 4) : "0"}</span> LP
                </div>
                <a
                  href="https://app.uniswap.org/explore/pools/base/0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                >
                  Get LP →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}