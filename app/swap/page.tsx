"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useConnect,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, parseUnits, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getEthPrice } from "@/lib/utils";
import { NavBar } from "@/components/nav-bar";
import { ArrowDown, Settings, ChevronDown, Loader2, RefreshCw, X } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as Address;
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as Address;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as Address;

// Aerodrome Router
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;

// Supported tokens for swapping (tokens that have LP with DONUT)
const SUPPORTED_TOKENS = [
  {
    address: WETH_ADDRESS,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    icon: "Ξ",
    poolAddress: "0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703" as Address, // DONUT-WETH pool
    stable: false,
  },
  {
    address: SPRINKLES_ADDRESS,
    symbol: "SPRINKLES",
    name: "Sprinkles",
    decimals: 18,
    icon: "✨",
    poolAddress: "0x47e8b03017d8b8d058ba5926838ca4dd4531e668" as Address, // SPRINKLES-DONUT pool
    stable: false,
  },
];

const DONUT_TOKEN = {
  address: DONUT_ADDRESS,
  symbol: "DONUT",
  name: "Donut",
  decimals: 18,
  icon: "🍩",
};

// Fee configuration
const SWAP_FEE_BPS = 30; // 0.3% = 30 basis points
const FEE_DENOMINATOR = 10000;

// ABIs
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
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
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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
] as const;

const AERODROME_ROUTER_ABI = [
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
        name: "routes",
        type: "tuple[]",
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
        name: "routes",
        type: "tuple[]",
      },
    ],
    name: "getAmountsOut",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aerodrome factory address
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address;

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function SwapPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutPrice, setDonutPrice] = useState<number>(0);
  
  // Swap state
  const [inputAmount, setInputAmount] = useState("");
  const [selectedOutputToken, setSelectedOutputToken] = useState(SUPPORTED_TOKENS[0]);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [slippage, setSlippage] = useState(0.5); // 0.5% default slippage
  const [showSettings, setShowSettings] = useState(false);
  
  // Transaction state
  const [txStep, setTxStep] = useState<"idle" | "approving" | "transferring_fee" | "swapping">("idle");
  const [swapResult, setSwapResult] = useState<"success" | "failure" | null>(null);
  const swapResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSwapResult = useCallback(() => {
    if (swapResultTimeoutRef.current) {
      clearTimeout(swapResultTimeoutRef.current);
      swapResultTimeoutRef.current = null;
    }
    setSwapResult(null);
  }, []);

  const showSwapResultFn = useCallback((result: "success" | "failure") => {
    if (swapResultTimeoutRef.current) {
      clearTimeout(swapResultTimeoutRef.current);
    }
    setSwapResult(result);
    swapResultTimeoutRef.current = setTimeout(() => {
      setSwapResult(null);
      swapResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Initialize context
  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
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

  // Fetch prices
  useEffect(() => {
    const fetchPrices = async () => {
      const ethPrice = await getEthPrice();
      setEthUsdPrice(ethPrice);
      
      // Fetch DONUT price from DexScreener
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DONUT_ADDRESS}`);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setDonutPrice(parseFloat(data.pairs[0].priceUsd || "0"));
        }
      } catch (e) {
        console.error("Failed to fetch DONUT price:", e);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Ready signal
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
    return () => {
      if (swapResultTimeoutRef.current) {
        clearTimeout(swapResultTimeoutRef.current);
      }
    };
  }, []);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  // Auto-connect
  useEffect(() => {
    if (
      autoConnectAttempted.current ||
      isConnected ||
      !primaryConnector ||
      isConnecting
    ) {
      return;
    }
    autoConnectAttempted.current = true;
    connectAsync({
      connector: primaryConnector,
      chainId: base.id,
    }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Read DONUT balance
  const { data: donutBalance, refetch: refetchDonutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Read DONUT allowance for router
  const { data: donutAllowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, AERODROME_ROUTER],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Calculate input amount in wei
  const inputAmountWei = useMemo(() => {
    if (!inputAmount || inputAmount === "" || isNaN(parseFloat(inputAmount))) return 0n;
    try {
      return parseUnits(inputAmount, 18);
    } catch {
      return 0n;
    }
  }, [inputAmount]);

  // Calculate fee amount (0.3%)
  const feeAmount = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return (inputAmountWei * BigInt(SWAP_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
  }, [inputAmountWei]);

  // Amount after fee (what gets swapped)
  const amountAfterFee = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return inputAmountWei - feeAmount;
  }, [inputAmountWei, feeAmount]);

  // Get quote from Aerodrome
  const { data: quoteData, refetch: refetchQuote } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [
      amountAfterFee,
      [
        {
          from: DONUT_ADDRESS,
          to: selectedOutputToken.address,
          stable: selectedOutputToken.stable,
          factory: AERODROME_FACTORY,
        },
      ],
    ],
    chainId: base.id,
    query: {
      enabled: amountAfterFee > 0n,
      refetchInterval: 10_000,
    },
  });

  const outputAmount = useMemo(() => {
    if (!quoteData || !Array.isArray(quoteData) || quoteData.length < 2) return 0n;
    return quoteData[1] as bigint;
  }, [quoteData]);

  const outputAmountDisplay = useMemo(() => {
    if (outputAmount === 0n) return "0";
    const formatted = Number(formatUnits(outputAmount, selectedOutputToken.decimals));
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [outputAmount, selectedOutputToken.decimals]);

  // Minimum output with slippage
  const minOutputAmount = useMemo(() => {
    if (outputAmount === 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return outputAmount - (outputAmount * slippageBps) / 10000n;
  }, [outputAmount, slippage]);

  // Check if needs approval
  const needsApproval = useMemo(() => {
    if (!donutAllowance || inputAmountWei === 0n) return true;
    return (donutAllowance as bigint) < inputAmountWei;
  }, [donutAllowance, inputAmountWei]);

  // Check if has sufficient balance
  const hasSufficientBalance = useMemo(() => {
    if (!donutBalance || inputAmountWei === 0n) return false;
    return (donutBalance as bigint) >= inputAmountWei;
  }, [donutBalance, inputAmountWei]);

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  // Handle swap process
  const handleSwap = useCallback(async () => {
    if (!address || inputAmountWei === 0n) return;
    resetSwapResult();

    try {
      if (needsApproval && txStep === "idle") {
        // Step 1: Approve
        setTxStep("approving");
        await writeContract({
          address: DONUT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [AERODROME_ROUTER, inputAmountWei],
          chainId: base.id,
        });
        return;
      }

      if (txStep === "idle" || txStep === "transferring_fee") {
        // Step 2: Transfer fee to treasury
        if (txStep === "idle") {
          setTxStep("transferring_fee");
          await writeContract({
            address: DONUT_ADDRESS,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [TREASURY_ADDRESS, feeAmount],
            chainId: base.id,
          });
          return;
        }
      }

      if (txStep === "swapping") {
        // Step 3: Execute swap
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60); // 20 minutes
        
        await writeContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [
            amountAfterFee,
            minOutputAmount,
            [
              {
                from: DONUT_ADDRESS,
                to: selectedOutputToken.address,
                stable: selectedOutputToken.stable,
                factory: AERODROME_FACTORY,
              },
            ],
            address,
            deadline,
          ],
          chainId: base.id,
        });
      }
    } catch (error) {
      console.error("Swap failed:", error);
      showSwapResultFn("failure");
      setTxStep("idle");
      resetWrite();
    }
  }, [
    address,
    inputAmountWei,
    needsApproval,
    txStep,
    feeAmount,
    amountAfterFee,
    minOutputAmount,
    selectedOutputToken,
    writeContract,
    resetSwapResult,
    showSwapResultFn,
    resetWrite,
  ]);

  // Handle transaction receipts
  useEffect(() => {
    if (!receipt) return;

    if (receipt.status === "reverted") {
      showSwapResultFn("failure");
      setTxStep("idle");
      resetWrite();
      return;
    }

    if (receipt.status === "success") {
      if (txStep === "approving") {
        resetWrite();
        setTxStep("transferring_fee");
        return;
      }

      if (txStep === "transferring_fee") {
        resetWrite();
        setTxStep("swapping");
        return;
      }

      if (txStep === "swapping") {
        showSwapResultFn("success");
        setTxStep("idle");
        setInputAmount("");
        refetchDonutBalance();
        refetchAllowance();
        resetWrite();
        return;
      }
    }
  }, [receipt, txStep, resetWrite, showSwapResultFn, refetchDonutBalance, refetchAllowance]);

  // Auto-continue swap after approval/fee transfer
  useEffect(() => {
    if ((txStep === "transferring_fee" || txStep === "swapping") && !isWriting && !isConfirming && !txHash) {
      handleSwap();
    }
  }, [txStep, isWriting, isConfirming, txHash, handleSwap]);

  const buttonLabel = useMemo(() => {
    if (swapResult === "success") return "Success!";
    if (swapResult === "failure") return "Failed";
    if (isWriting || isConfirming) {
      if (txStep === "approving") return "Approving...";
      if (txStep === "transferring_fee") return "Processing Fee...";
      if (txStep === "swapping") return "Swapping...";
      return "Processing...";
    }
    if (!inputAmount || inputAmount === "0") return "Enter Amount";
    if (!hasSufficientBalance) return "Insufficient Balance";
    if (needsApproval) return "Approve & Swap";
    return "Swap";
  }, [swapResult, isWriting, isConfirming, txStep, inputAmount, hasSufficientBalance, needsApproval]);

  const isSwapDisabled =
    !inputAmount ||
    inputAmount === "0" ||
    inputAmountWei === 0n ||
    !hasSufficientBalance ||
    isWriting ||
    isConfirming ||
    swapResult !== null;

  const donutBalanceDisplay = donutBalance
    ? Math.floor(Number(formatUnits(donutBalance as bigint, 18))).toLocaleString()
    : "0";

  const inputUsdValue = useMemo(() => {
    if (!inputAmount || donutPrice === 0) return "0.00";
    return (parseFloat(inputAmount) * donutPrice).toFixed(2);
  }, [inputAmount, donutPrice]);

  const outputUsdValue = useMemo(() => {
    if (outputAmount === 0n) return "0.00";
    const outputNum = Number(formatUnits(outputAmount, selectedOutputToken.decimals));
    if (selectedOutputToken.symbol === "WETH") {
      return (outputNum * ethUsdPrice).toFixed(2);
    }
    // For other tokens, estimate from DONUT value
    return (parseFloat(inputAmount || "0") * donutPrice * 0.997).toFixed(2); // ~0.3% less due to fee
  }, [outputAmount, selectedOutputToken, ethUsdPrice, inputAmount, donutPrice]);

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const handleMaxClick = () => {
    if (donutBalance) {
      const maxAmount = formatUnits(donutBalance as bigint, 18);
      setInputAmount(maxAmount);
    }
  };

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">SWAP</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
              >
                <Settings className="w-4 h-4 text-gray-400" />
              </button>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage
                      src={userAvatarUrl || undefined}
                      alt={userDisplayName}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-zinc-800 text-white">
                      {initialsFrom(userDisplayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && (
                      <div className="text-xs text-gray-400">{userHandle}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Slippage Tolerance</span>
                <button onClick={() => setShowSettings(false)}>
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex gap-2">
                {[0.1, 0.5, 1.0].map((val) => (
                  <button
                    key={val}
                    onClick={() => setSlippage(val)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold transition-colors",
                      slippage === val
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                    )}
                  >
                    {val}%
                  </button>
                ))}
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(parseFloat(e.target.value) || 0.5)}
                    className="w-full py-2 px-2 rounded-lg bg-zinc-800 text-white text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
              </div>
            </div>
          )}

          {/* Swap Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-2">
            {/* From Section */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">From</span>
                <span className="text-xs text-gray-400">
                  Balance: {donutBalanceDisplay}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2">
                  <span className="text-xl">🍩</span>
                  <span className="font-bold">DONUT</span>
                </div>
                <div className="flex-1 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={inputAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = value.split('.');
                      if (parts.length > 2) return;
                      setInputAmount(value);
                    }}
                    placeholder="0"
                    className="w-full bg-transparent text-2xl font-bold text-right focus:outline-none placeholder-gray-600"
                    style={{ fontSize: '24px' }}
                  />
                  <div className="text-xs text-gray-500">${inputUsdValue}</div>
                </div>
                <button
                  onClick={handleMaxClick}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Arrow Divider */}
            <div className="flex justify-center my-2">
              <div className="bg-zinc-800 rounded-full p-2">
                <ArrowDown className="w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* To Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">To (estimated)</span>
                <button
                  onClick={() => refetchQuote()}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTokenSelect(true)}
                  className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-xl">{selectedOutputToken.icon}</span>
                  <span className="font-bold">{selectedOutputToken.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                <div className="flex-1 text-right">
                  <div className="text-2xl font-bold">
                    {outputAmountDisplay}
                  </div>
                  <div className="text-xs text-gray-500">${outputUsdValue}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Fee Info */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Swap Fee (0.3%)</span>
              <span className="text-amber-400">
                🍩 {feeAmount > 0n ? Number(formatUnits(feeAmount, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-400">Min. Received</span>
              <span className="text-white">
                {selectedOutputToken.icon} {minOutputAmount > 0n ? Number(formatUnits(minOutputAmount, selectedOutputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-400">Slippage</span>
              <span className="text-white">{slippage}%</span>
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={isSwapDisabled}
            className={cn(
              "w-full rounded-xl py-4 text-lg font-bold transition-all",
              swapResult === "success"
                ? "bg-green-500 text-white"
                : swapResult === "failure"
                  ? "bg-red-500 text-white"
                  : isSwapDisabled
                    ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                    : "bg-amber-500 text-black hover:bg-amber-400"
            )}
          >
            {isWriting || isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {buttonLabel}
              </span>
            ) : (
              buttonLabel
            )}
          </button>

          {/* Powered by notice */}
          <div className="text-center mt-3">
            <span className="text-[10px] text-gray-600">
              Powered by Aerodrome • 0.3% fee supports Donut Labs
            </span>
          </div>
        </div>
      </div>

      {/* Token Select Modal */}
      {showTokenSelect && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setShowTokenSelect(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button
                onClick={() => setShowTokenSelect(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-lg font-bold text-white mb-4">Select Token</h2>

              <div className="space-y-2">
                {SUPPORTED_TOKENS.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => {
                      setSelectedOutputToken(token);
                      setShowTokenSelect(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                      selectedOutputToken.address === token.address
                        ? "bg-amber-500/20 border border-amber-500/50"
                        : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    <span className="text-2xl">{token.icon}</span>
                    <div className="text-left">
                      <div className="font-bold text-white">{token.symbol}</div>
                      <div className="text-xs text-gray-400">{token.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <NavBar />
    </main>
  );
}