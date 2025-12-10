"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useBalance,
  useConnect,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, parseUnits, type Address, maxUint256 } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getEthPrice } from "@/lib/utils";
import { NavBar } from "@/components/nav-bar";
import { ArrowDown, ArrowUpDown, ChevronDown, Loader2, RefreshCw, X, Settings, Zap } from "lucide-react";

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
const PEEPLES_ADDRESS = "0x0eb9d965DBEfbfB131216A4250A29C9b0693Cb07" as Address;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address; // 0x native ETH placeholder

// Token definitions
interface Token {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  isNative?: boolean;
}

const getDexScreenerIcon = (address: string) => 
  `https://dd.dexscreener.com/ds-data/tokens/base/${address.toLowerCase()}.png`;

const TOKENS: Token[] = [
  {
    address: DONUT_ADDRESS,
    symbol: "DONUT",
    name: "Donut",
    decimals: 18,
    icon: getDexScreenerIcon(DONUT_ADDRESS),
  },
  {
    address: ETH_ADDRESS,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    icon: "https://dd.dexscreener.com/ds-data/tokens/base/0x4200000000000000000000000000000000000006.png",
    isNative: true,
  },
  {
    address: SPRINKLES_ADDRESS,
    symbol: "SPRINKLES",
    name: "Sprinkles",
    decimals: 18,
    icon: getDexScreenerIcon(SPRINKLES_ADDRESS),
  },
  {
    address: PEEPLES_ADDRESS,
    symbol: "PEEPLES",
    name: "Peeples",
    decimals: 18,
    icon: getDexScreenerIcon(PEEPLES_ADDRESS),
  },
];

// Featured tokens for carousel
const FEATURED_TOKENS = [
  {
    symbol: "DONUT",
    name: "Donut Labs",
    banner: "https://pbs.twimg.com/profile_banners/1886883597655863296/1738616037/1500x500",
    link: "https://warpcast.com/miniapps/BG5lMEHfNOjg/donut",
  },
  {
    symbol: "PEEPLES",
    name: "Peeples",
    banner: "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/4f1e1d73-fba6-4e84-6238-ab40fc6e3b00/original",
    link: "https://warpcast.com/peeples",
  },
];

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// 0x Quote response type
interface ZeroXQuote {
  blockNumber: string;
  buyAmount: string;
  buyToken: string;
  sellAmount: string;
  sellToken: string;
  allowanceTarget: string;
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  fees?: {
    integratorFee?: {
      amount: string;
      token: string;
    };
  };
  issues?: {
    allowance?: {
      actual: string;
      spender: string;
    };
  };
}

export default function SwapPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  
  // Featured tokens carousel state
  const [featuredIndex, setFeaturedIndex] = useState(0);
  
  // Swap state
  const [inputAmount, setInputAmount] = useState("");
  const [inputToken, setInputToken] = useState<Token>(TOKENS[0]); // DONUT default
  const [outputToken, setOutputToken] = useState<Token>(TOKENS[1]); // ETH default
  const [showInputTokenSelect, setShowInputTokenSelect] = useState(false);
  const [showOutputTokenSelect, setShowOutputTokenSelect] = useState(false);
  const [slippage, setSlippage] = useState(1.0); // Default 1%
  const [showSettings, setShowSettings] = useState(false);
  
  // 0x Quote state
  const [quote, setQuote] = useState<ZeroXQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  
  // Transaction state
  const [txStep, setTxStep] = useState<"idle" | "approving" | "swapping">("idle");
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
    setSwapResult(result);
    swapResultTimeoutRef.current = setTimeout(() => {
      setSwapResult(null);
    }, 3000);
  }, []);

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const primaryConnector = connectors[0];

  // Get input token balance
  const { data: inputBalance, refetch: refetchInputBalance } = useBalance({
    address,
    token: inputToken.isNative ? undefined : inputToken.address,
    chainId: base.id,
    query: { enabled: !!address },
  });

  // Get allowance for 0x AllowanceHolder
  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? "0x0", quote?.allowanceTarget as Address ?? "0x0"],
    chainId: base.id,
    query: {
      enabled: !!address && !inputToken.isNative && !!quote?.allowanceTarget,
    },
  });

  // Write contract for approvals
  const {
    data: writeTxHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  // Send transaction for swaps (0x returns raw tx data)
  const {
    data: sendTxHash,
    sendTransaction,
    isPending: isSending,
    reset: resetSend,
  } = useSendTransaction();

  const txHash = writeTxHash || sendTxHash;

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  const resetTx = useCallback(() => {
    resetWrite();
    resetSend();
  }, [resetWrite, resetSend]);

  // Initialize SDK
  useEffect(() => {
    const init = async () => {
      if (readyRef.current) return;
      readyRef.current = true;

      try {
        const ctx = await sdk.context;
        setContext(ctx as unknown as MiniAppContext);
        sdk.actions.ready();
      } catch (error) {
        console.error("Failed to initialize SDK:", error);
      }
    };
    init();
  }, []);

  // Fetch ETH price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const price = await getEthPrice();
        setEthUsdPrice(price);
      } catch (e) {
        console.error("Failed to fetch ETH price:", e);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-connect wallet
  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(console.error);
  }, [isConnected, primaryConnector, connectAsync]);

  // Featured carousel auto-rotate
  useEffect(() => {
    const interval = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % FEATURED_TOKENS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Parse input amount - handle leading decimal like ".001"
  const inputAmountWei = useMemo(() => {
    if (!inputAmount || inputAmount === "0" || inputAmount === ".") return 0n;
    try {
      // Prepend 0 if starts with decimal
      const normalizedAmount = inputAmount.startsWith(".") ? `0${inputAmount}` : inputAmount;
      return parseUnits(normalizedAmount, inputToken.decimals);
    } catch {
      return 0n;
    }
  }, [inputAmount, inputToken.decimals]);

  // Fetch 0x quote when input changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (inputAmountWei === 0n || !address) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      setQuoteError(null);

      try {
        const params = new URLSearchParams({
          chainId: "8453", // Base
          sellToken: inputToken.isNative ? ETH_ADDRESS : inputToken.address,
          buyToken: outputToken.isNative ? ETH_ADDRESS : outputToken.address,
          sellAmount: inputAmountWei.toString(),
          taker: address,
          slippageBps: Math.round(slippage * 100).toString(), // 1% = 100 bps
          endpoint: "quote",
        });

        const response = await fetch(`/api/swap/quote?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get quote");
        }

        setQuote(data);
      } catch (error: any) {
        console.error("Quote error:", error);
        setQuoteError(error.message || "Failed to get quote");
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    };

    // Debounce quote fetching
    const timeout = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeout);
  }, [inputAmountWei, inputToken, outputToken, address, slippage]);

  // Check if needs approval
  const needsApproval = useMemo(() => {
    if (inputToken.isNative) return false;
    if (!quote?.allowanceTarget) return false;
    if (!tokenAllowance) return true;
    return (tokenAllowance as bigint) < inputAmountWei;
  }, [inputToken.isNative, quote?.allowanceTarget, tokenAllowance, inputAmountWei]);

  // Check if has sufficient balance
  const hasSufficientBalance = useMemo(() => {
    if (!inputBalance || inputAmountWei === 0n) return false;
    return inputBalance.value >= inputAmountWei;
  }, [inputBalance, inputAmountWei]);

  // Handle swap
  const handleSwap = useCallback(async () => {
    if (!address || !quote) return;

    resetSwapResult();

    try {
      // Step 1: Approve if needed
      if (needsApproval && txStep === "idle") {
        setTxStep("approving");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [quote.allowanceTarget as Address, maxUint256],
          chainId: base.id,
        });
        return;
      }

      // Step 2: Execute swap
      if (txStep === "idle" || txStep === "swapping") {
        setTxStep("swapping");
        
        // 0x returns the full transaction - just send it!
        sendTransaction({
          to: quote.transaction.to as Address,
          data: quote.transaction.data as `0x${string}`,
          value: BigInt(quote.transaction.value || "0"),
          gas: BigInt(quote.transaction.gas),
        });
      }
    } catch (error: any) {
      console.error("Swap failed:", error);
      if (!error?.message?.includes("User rejected")) {
        showSwapResultFn("failure");
      }
      setTxStep("idle");
      resetTx();
    }
  }, [
    address,
    quote,
    needsApproval,
    txStep,
    inputToken,
    writeContract,
    sendTransaction,
    resetSwapResult,
    showSwapResultFn,
    resetTx,
  ]);

  // Handle transaction receipts
  useEffect(() => {
    if (!receipt) return;

    if (receipt.status === "reverted") {
      showSwapResultFn("failure");
      setTxStep("idle");
      resetTx();
      return;
    }

    if (receipt.status === "success") {
      if (txStep === "approving") {
        // Approval done, now swap
        resetTx();
        refetchAllowance();
        setTxStep("swapping");
        return;
      }

      if (txStep === "swapping") {
        // Swap complete!
        showSwapResultFn("success");
        setTxStep("idle");
        setInputAmount("");
        setQuote(null);
        refetchInputBalance();
        refetchAllowance();
        resetTx();
      }
    }
  }, [receipt, txStep, resetTx, refetchAllowance, refetchInputBalance, showSwapResultFn]);

  // Auto-continue after approval
  useEffect(() => {
    if (txStep === "swapping" && !isWriting && !isSending && !isConfirming && !txHash && quote) {
      handleSwap();
    }
  }, [txStep, isWriting, isSending, isConfirming, txHash, quote, handleSwap]);

  // Flip tokens
  const handleFlipTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount("");
    setQuote(null);
  };

  // Button label
  const buttonLabel = useMemo(() => {
    if (swapResult === "success") return "Success!";
    if (swapResult === "failure") return "Failed";
    if (isWriting || isSending || isConfirming) {
      if (txStep === "approving") return "Approving...";
      if (txStep === "swapping") return "Swapping...";
      return "Processing...";
    }
    if (!inputAmount || inputAmount === "0") return "Enter Amount";
    if (quoteLoading) return "Getting Quote...";
    if (quoteError) return "Quote Error";
    if (!quote) return "Enter Amount";
    if (!hasSufficientBalance) return "Insufficient Balance";
    if (needsApproval) return "Approve & Swap";
    return "Swap";
  }, [swapResult, isWriting, isSending, isConfirming, txStep, inputAmount, quoteLoading, quoteError, quote, hasSufficientBalance, needsApproval]);

  const isSwapDisabled =
    !inputAmount ||
    inputAmount === "0" ||
    inputAmountWei === 0n ||
    !hasSufficientBalance ||
    !quote ||
    quoteLoading ||
    isWriting ||
    isSending ||
    isConfirming ||
    swapResult !== null;

  const inputBalanceDisplay = inputBalance
    ? Number(formatUnits(inputBalance.value, inputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "0";

  const outputAmount = quote?.buyAmount
    ? Number(formatUnits(BigInt(quote.buyAmount), outputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "0";

  const feeAmount = quote?.fees?.integratorFee?.amount
    ? Number(formatUnits(BigInt(quote.fees.integratorFee.amount), outputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "0";

  const handleMaxClick = () => {
    if (inputBalance) {
      const maxAmount = inputToken.isNative
        ? inputBalance.value > parseUnits("0.001", 18) 
          ? inputBalance.value - parseUnits("0.001", 18) // Leave gas for ETH
          : 0n
        : inputBalance.value;
      setInputAmount(formatUnits(maxAmount, inputToken.decimals));
    }
  };

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white">
      <NavBar />
      
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-4 pb-24 overflow-y-auto">
        {/* User Header */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-10 h-10 border-2 border-amber-500/50">
            <AvatarImage src={userAvatarUrl ?? undefined} alt={userDisplayName} />
            <AvatarFallback className="bg-amber-500/20 text-amber-400">
              {userDisplayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-gray-200">{userDisplayName}</p>
            <p className="text-xs text-gray-500">Swap tokens on Base</p>
          </div>
        </div>

        {/* Featured Token Carousel */}
        <div className="w-full max-w-sm mb-4">
          <div className="relative overflow-hidden rounded-2xl h-24">
            {FEATURED_TOKENS.map((token, index) => (
              <button
                key={token.symbol}
                onClick={() => {
                  sdk.actions.openUrl(token.link);
                }}
                className={cn(
                  "absolute inset-0 w-full h-full transition-all duration-500 ease-in-out overflow-hidden rounded-2xl",
                  index === featuredIndex ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full pointer-events-none"
                )}
              >
                <img
                  src={token.banner}
                  alt={token.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <span className="text-white font-bold text-sm">{token.name}</span>
                  <span className="text-xs text-amber-400 bg-amber-400/20 px-2 py-0.5 rounded-full">Featured</span>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-1.5 mt-2">
            {FEATURED_TOKENS.map((_, index) => (
              <button
                key={index}
                onClick={() => setFeaturedIndex(index)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  index === featuredIndex ? "bg-amber-500 w-3" : "bg-zinc-600"
                )}
              />
            ))}
          </div>
        </div>

        {/* Swap Card */}
        <div className="w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 backdrop-blur-sm">
          {/* 0x Powered Badge */}
          <div className="flex items-center justify-center gap-1.5 mb-3 text-xs text-gray-400">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Powered by 0x • Single Signature</span>
          </div>

          {/* Input Token */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">You Pay</span>
              <button
                onClick={handleMaxClick}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Max: {inputBalanceDisplay}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={inputAmount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, "");
                  if (value.split(".").length <= 2) setInputAmount(value);
                }}
                className="flex-1 bg-transparent text-2xl font-medium outline-none placeholder-gray-600"
              />
              <button
                onClick={() => setShowInputTokenSelect(true)}
                className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 rounded-xl px-3 py-2 transition-colors"
              >
                <img src={inputToken.icon} alt={inputToken.symbol} className="w-6 h-6 rounded-full" />
                <span className="font-medium">{inputToken.symbol}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-1 relative z-10">
            <button
              onClick={handleFlipTokens}
              className="bg-zinc-800 border border-zinc-700 rounded-xl p-2 hover:bg-zinc-700 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4 text-amber-400" />
            </button>
          </div>

          {/* Output Token */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mt-2 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">You Receive</span>
              {quoteLoading && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-medium text-gray-300">
                {outputAmount}
              </div>
              <button
                onClick={() => setShowOutputTokenSelect(true)}
                className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 rounded-xl px-3 py-2 transition-colors"
              >
                <img src={outputToken.icon} alt={outputToken.symbol} className="w-6 h-6 rounded-full" />
                <span className="font-medium">{outputToken.symbol}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Swap Info */}
          {quote && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Fee (0.05%)</span>
                <span className="text-amber-400 flex items-center gap-1">
                  <img src={outputToken.icon} alt="" className="w-3.5 h-3.5 rounded-full" />
                  {feeAmount}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-gray-400">Slippage</span>
                <span className="text-white">{slippage}%</span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {quoteError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-400">{quoteError}</p>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={isSwapDisabled}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-lg transition-all",
              swapResult === "success"
                ? "bg-green-500 text-white"
                : swapResult === "failure"
                  ? "bg-red-500 text-white"
                  : isSwapDisabled
                    ? "bg-zinc-700 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black"
            )}
          >
            {isWriting || isSending || isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {buttonLabel}
              </span>
            ) : (
              buttonLabel
            )}
          </button>

          {/* Settings Toggle */}
          <div className="flex items-center justify-center mt-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
            >
              <Settings className="w-3 h-3" />
              <span>Slippage: {slippage}%</span>
            </button>
          </div>

          {showSettings && (
            <div className="mt-2 bg-zinc-800 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-2">Slippage Tolerance</p>
              <div className="flex gap-2">
                {[0.5, 1, 2, 5].map((val) => (
                  <button
                    key={val}
                    onClick={() => setSlippage(val)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      slippage === val
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-700 text-gray-300 hover:bg-zinc-600"
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

      {/* Token Select Modal - Input */}
      {showInputTokenSelect && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl w-full max-w-sm p-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Token</h3>
              <button onClick={() => setShowInputTokenSelect(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {TOKENS.filter(t => t.address !== outputToken.address).map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    setInputToken(token);
                    setShowInputTokenSelect(false);
                    setInputAmount("");
                    setQuote(null);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                    token.address === inputToken.address
                      ? "bg-amber-500/20 border border-amber-500/50"
                      : "bg-zinc-800 hover:bg-zinc-700"
                  )}
                >
                  <img src={token.icon} alt={token.symbol} className="w-10 h-10 rounded-full" />
                  <div className="text-left">
                    <p className="font-medium">{token.symbol}</p>
                    <p className="text-xs text-gray-400">{token.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Token Select Modal - Output */}
      {showOutputTokenSelect && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl w-full max-w-sm p-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Token</h3>
              <button onClick={() => setShowOutputTokenSelect(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {TOKENS.filter(t => t.address !== inputToken.address).map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    setOutputToken(token);
                    setShowOutputTokenSelect(false);
                    setQuote(null);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                    token.address === outputToken.address
                      ? "bg-amber-500/20 border border-amber-500/50"
                      : "bg-zinc-800 hover:bg-zinc-700"
                  )}
                >
                  <img src={token.icon} alt={token.symbol} className="w-10 h-10 rounded-full" />
                  <div className="text-left">
                    <p className="font-medium">{token.symbol}</p>
                    <p className="text-xs text-gray-400">{token.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}