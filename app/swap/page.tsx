"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, parseUnits, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getEthPrice } from "@/lib/utils";
import { NavBar } from "@/components/nav-bar";
import { ArrowDown, ArrowUpDown, ChevronDown, Loader2, RefreshCw, X, Settings } from "lucide-react";

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
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as Address;

// Aerodrome Router
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address;

// Token definitions
interface Token {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

const TOKENS: Token[] = [
  {
    address: DONUT_ADDRESS,
    symbol: "DONUT",
    name: "Donut",
    decimals: 18,
    icon: "🍩",
  },
  {
    address: WETH_ADDRESS,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    icon: "Ξ",
  },
  {
    address: SPRINKLES_ADDRESS,
    symbol: "SPRINKLES",
    name: "Sprinkles",
    decimals: 18,
    icon: "✨",
  },
  {
    address: USDC_ADDRESS,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: "$",
  },
];

// Fee configuration
const SWAP_FEE_BPS = 15; // 0.15% = 15 basis points
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

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Helper to determine route between two tokens
function getRoute(fromToken: Address, toToken: Address): { from: Address; to: Address; stable: boolean; factory: Address }[] {
  // Direct pairs
  const directPairs: Record<string, boolean> = {
    [`${DONUT_ADDRESS.toLowerCase()}-${WETH_ADDRESS.toLowerCase()}`]: false, // DONUT-WETH volatile
    [`${WETH_ADDRESS.toLowerCase()}-${DONUT_ADDRESS.toLowerCase()}`]: false,
    [`${DONUT_ADDRESS.toLowerCase()}-${SPRINKLES_ADDRESS.toLowerCase()}`]: false, // DONUT-SPRINKLES volatile
    [`${SPRINKLES_ADDRESS.toLowerCase()}-${DONUT_ADDRESS.toLowerCase()}`]: false,
    [`${WETH_ADDRESS.toLowerCase()}-${USDC_ADDRESS.toLowerCase()}`]: false, // WETH-USDC volatile
    [`${USDC_ADDRESS.toLowerCase()}-${WETH_ADDRESS.toLowerCase()}`]: false,
  };

  const pairKey = `${fromToken.toLowerCase()}-${toToken.toLowerCase()}`;
  
  // Check if direct pair exists
  if (pairKey in directPairs) {
    return [{
      from: fromToken,
      to: toToken,
      stable: directPairs[pairKey],
      factory: AERODROME_FACTORY,
    }];
  }

  // Multi-hop through WETH or DONUT
  // USDC -> DONUT: USDC -> WETH -> DONUT
  if (fromToken.toLowerCase() === USDC_ADDRESS.toLowerCase() && toToken.toLowerCase() === DONUT_ADDRESS.toLowerCase()) {
    return [
      { from: USDC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: WETH_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }
  
  // DONUT -> USDC: DONUT -> WETH -> USDC
  if (fromToken.toLowerCase() === DONUT_ADDRESS.toLowerCase() && toToken.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    return [
      { from: DONUT_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: WETH_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }

  // SPRINKLES -> WETH: SPRINKLES -> DONUT -> WETH
  if (fromToken.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase() && toToken.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
    return [
      { from: SPRINKLES_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: DONUT_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }

  // WETH -> SPRINKLES: WETH -> DONUT -> SPRINKLES
  if (fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase() && toToken.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase()) {
    return [
      { from: WETH_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: DONUT_ADDRESS, to: SPRINKLES_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }

  // USDC -> SPRINKLES: USDC -> WETH -> DONUT -> SPRINKLES
  if (fromToken.toLowerCase() === USDC_ADDRESS.toLowerCase() && toToken.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase()) {
    return [
      { from: USDC_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: WETH_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: DONUT_ADDRESS, to: SPRINKLES_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }

  // SPRINKLES -> USDC: SPRINKLES -> DONUT -> WETH -> USDC
  if (fromToken.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase() && toToken.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    return [
      { from: SPRINKLES_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: DONUT_ADDRESS, to: WETH_ADDRESS, stable: false, factory: AERODROME_FACTORY },
      { from: WETH_ADDRESS, to: USDC_ADDRESS, stable: false, factory: AERODROME_FACTORY },
    ];
  }

  // Default: try direct (may fail)
  return [{
    from: fromToken,
    to: toToken,
    stable: false,
    factory: AERODROME_FACTORY,
  }];
}

export default function SwapPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  
  // Swap state
  const [inputAmount, setInputAmount] = useState("");
  const [inputToken, setInputToken] = useState<Token>(TOKENS[0]); // DONUT default
  const [outputToken, setOutputToken] = useState<Token>(TOKENS[2]); // SPRINKLES default
  const [showInputTokenSelect, setShowInputTokenSelect] = useState(false);
  const [showOutputTokenSelect, setShowOutputTokenSelect] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
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

  // Fetch ETH price
  useEffect(() => {
    const fetchPrices = async () => {
      const ethPrice = await getEthPrice();
      setEthUsdPrice(ethPrice);
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

  // Read input token balance
  const { data: inputBalance, refetch: refetchInputBalance } = useReadContract({
    address: inputToken.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Read input token allowance for router
  const { data: inputAllowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken.address,
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
      return parseUnits(inputAmount, inputToken.decimals);
    } catch {
      return 0n;
    }
  }, [inputAmount, inputToken.decimals]);

  // Calculate fee amount (0.3%) - only on input token
  const feeAmount = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return (inputAmountWei * BigInt(SWAP_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
  }, [inputAmountWei]);

  // Amount after fee (what gets swapped)
  const amountAfterFee = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return inputAmountWei - feeAmount;
  }, [inputAmountWei, feeAmount]);

  // Get route for swap
  const route = useMemo(() => {
    return getRoute(inputToken.address, outputToken.address);
  }, [inputToken.address, outputToken.address]);

  // Get quote from Aerodrome
  const { data: quoteData, refetch: refetchQuote } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountAfterFee, route],
    chainId: base.id,
    query: {
      enabled: amountAfterFee > 0n && route.length > 0,
      refetchInterval: 10_000,
    },
  });

  const outputAmount = useMemo(() => {
    if (!quoteData || !Array.isArray(quoteData) || quoteData.length < 2) return 0n;
    // Last element is the final output amount
    return quoteData[quoteData.length - 1] as bigint;
  }, [quoteData]);

  const outputAmountDisplay = useMemo(() => {
    if (outputAmount === 0n) return "0";
    const formatted = Number(formatUnits(outputAmount, outputToken.decimals));
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [outputAmount, outputToken.decimals]);

  // Minimum output with slippage
  const minOutputAmount = useMemo(() => {
    if (outputAmount === 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return outputAmount - (outputAmount * slippageBps) / 10000n;
  }, [outputAmount, slippage]);

  // Check if needs approval
  const needsApproval = useMemo(() => {
    if (!inputAllowance || inputAmountWei === 0n) return true;
    return (inputAllowance as bigint) < inputAmountWei;
  }, [inputAllowance, inputAmountWei]);

  // Check if has sufficient balance
  const hasSufficientBalance = useMemo(() => {
    if (!inputBalance || inputAmountWei === 0n) return false;
    return (inputBalance as bigint) >= inputAmountWei;
  }, [inputBalance, inputAmountWei]);

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
    console.log("handleSwap called", { address, inputAmountWei: inputAmountWei.toString(), txStep, needsApproval });
    
    if (!address) {
      console.log("No address, attempting to connect");
      try {
        if (!primaryConnector) {
          console.error("No connector available");
          return;
        }
        await connectAsync({
          connector: primaryConnector,
          chainId: base.id,
        });
      } catch (e) {
        console.error("Connect failed:", e);
      }
      return;
    }
    
    if (inputAmountWei === 0n) {
      console.log("Input amount is 0");
      return;
    }
    
    resetSwapResult();

    try {
      // Step 1: Approve if needed
      if (needsApproval && txStep === "idle") {
        console.log("Starting approval");
        setTxStep("approving");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [AERODROME_ROUTER, inputAmountWei],
          chainId: base.id,
        });
        return;
      }

      // Step 2: Transfer fee to treasury
      if (txStep === "idle") {
        console.log("Starting fee transfer");
        setTxStep("transferring_fee");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [TREASURY_ADDRESS, feeAmount],
          chainId: base.id,
        });
        return;
      }

      if (txStep === "transferring_fee") {
        console.log("Continuing fee transfer");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [TREASURY_ADDRESS, feeAmount],
          chainId: base.id,
        });
        return;
      }

      // Step 3: Execute swap
      if (txStep === "swapping") {
        console.log("Executing swap");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
        
        await writeContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [
            amountAfterFee,
            minOutputAmount,
            route,
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
    route,
    inputToken.address,
    writeContract,
    resetSwapResult,
    showSwapResultFn,
    resetWrite,
    primaryConnector,
    connectAsync,
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
        refetchInputBalance();
        refetchAllowance();
        resetWrite();
        return;
      }
    }
  }, [receipt, txStep, resetWrite, showSwapResultFn, refetchInputBalance, refetchAllowance]);

  // Auto-continue swap after approval/fee transfer
  useEffect(() => {
    if ((txStep === "transferring_fee" || txStep === "swapping") && !isWriting && !isConfirming && !txHash) {
      handleSwap();
    }
  }, [txStep, isWriting, isConfirming, txHash, handleSwap]);

  // Flip tokens
  const handleFlipTokens = () => {
    const tempInput = inputToken;
    const tempOutput = outputToken;
    setInputToken(tempOutput);
    setOutputToken(tempInput);
    setInputAmount("");
  };

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

  const inputBalanceDisplay = inputBalance
    ? Number(formatUnits(inputBalance as bigint, inputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: inputToken.decimals === 6 ? 2 : 0 })
    : "0";

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const handleMaxClick = () => {
    if (inputBalance) {
      const maxAmount = formatUnits(inputBalance as bigint, inputToken.decimals);
      // Leave a tiny bit for gas if it's ETH/WETH
      if (inputToken.symbol === "WETH") {
        const reduced = Math.max(0, parseFloat(maxAmount) - 0.001);
        setInputAmount(reduced.toString());
      } else {
        setInputAmount(maxAmount);
      }
    }
  };

  // Filter tokens for selection (exclude currently selected)
  const availableInputTokens = TOKENS.filter(t => t.address !== outputToken.address);
  const availableOutputTokens = TOKENS.filter(t => t.address !== inputToken.address);

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

          {/* Swap Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-2">
            {/* From Section */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">From</span>
                <span className="text-xs text-gray-400">
                  Balance: {inputBalanceDisplay}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowInputTokenSelect(true)}
                  className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-xl">{inputToken.icon}</span>
                  <span className="font-bold">{inputToken.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
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
                </div>
                <button
                  onClick={handleMaxClick}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Flip Button */}
            <div className="flex justify-center my-2">
              <button
                onClick={handleFlipTokens}
                className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition-colors"
              >
                <ArrowUpDown className="w-4 h-4 text-gray-400" />
              </button>
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
                  onClick={() => setShowOutputTokenSelect(true)}
                  className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-xl">{outputToken.icon}</span>
                  <span className="font-bold">{outputToken.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                <div className="flex-1 text-right">
                  <div className="text-2xl font-bold">
                    {outputAmountDisplay}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fee Info */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Swap Fee (0.3%)</span>
              <span className="text-amber-400">
                {inputToken.icon} {feeAmount > 0n ? Number(formatUnits(feeAmount, inputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: inputToken.decimals === 6 ? 4 : 2 }) : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-400">Min. Received</span>
              <span className="text-white">
                {outputToken.icon} {minOutputAmount > 0n ? Number(formatUnits(minOutputAmount, outputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-400">Route</span>
              <span className="text-white text-[10px]">
                {route.map((r, i) => {
                  const fromToken = TOKENS.find(t => t.address.toLowerCase() === r.from.toLowerCase());
                  const toToken = TOKENS.find(t => t.address.toLowerCase() === r.to.toLowerCase());
                  return (
                    <span key={i}>
                      {i === 0 ? fromToken?.symbol : ""}{i === 0 ? " → " : ""}{toToken?.symbol}{i < route.length - 1 ? " → " : ""}
                    </span>
                  );
                })}
              </span>
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

          {/* Slippage Settings - Below powered by */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Settings className="w-3 h-3" />
            <span>Slippage: {slippage}%</span>
          </button>

          {showSettings && (
            <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Slippage Tolerance</span>
                <button onClick={() => setShowSettings(false)}>
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex gap-2">
                {[0.1, 0.5, 1.0, 2.0].map((val) => (
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Token Select Modal */}
      {showInputTokenSelect && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setShowInputTokenSelect(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button
                onClick={() => setShowInputTokenSelect(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-lg font-bold text-white mb-4">Select Input Token</h2>

              <div className="space-y-2">
                {availableInputTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => {
                      setInputToken(token);
                      setShowInputTokenSelect(false);
                      setInputAmount("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                      inputToken.address === token.address
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

      {/* Output Token Select Modal */}
      {showOutputTokenSelect && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setShowOutputTokenSelect(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button
                onClick={() => setShowOutputTokenSelect(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-lg font-bold text-white mb-4">Select Output Token</h2>

              <div className="space-y-2">
                {availableOutputTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => {
                      setOutputToken(token);
                      setShowOutputTokenSelect(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                      outputToken.address === token.address
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