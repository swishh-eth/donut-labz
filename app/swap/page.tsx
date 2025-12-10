"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useBalance,
  useConnect,
  useReadContract,
  useSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, parseUnits, zeroAddress, type Address } from "viem";

import { cn, getEthPrice } from "@/lib/utils";
import { NavBar } from "@/components/nav-bar";
import { ArrowLeft, ArrowDown, Loader2, ChevronDown, Plus } from "lucide-react";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as Address;
const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as Address;
const PEEPLES_ADDRESS = "0x0eb9d965DBEfbfB131216A4250A29C9b0693Cb07" as Address;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as Address;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as Address;

// DEX Routers
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as Address;
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address;

// Fee configuration (0.05% = 5 basis points)
const SWAP_FEE_BPS = 5;
const FEE_DENOMINATOR = 10000;

// DexScreener image helpers
const getDexScreenerIcon = (address: string) =>
  `https://dd.dexscreener.com/ds-data/tokens/base/${address.toLowerCase()}.png`;

const getDexScreenerHeader = (address: string) =>
  `https://dd.dexscreener.com/ds-data/tokens/base/${address.toLowerCase()}/header.png`;

// Token tile definition
interface TokenTile {
  id: string;
  address?: Address;
  symbol: string;
  name: string;
  decimals?: number;
  icon?: string;
  banner?: string;
  description: string;
  isDonutEcosystem: boolean;
  isPlaceholder?: boolean;
  allowedInputs?: ("ETH" | "DONUT")[];
  externalUrl?: string;
}

const TOKEN_TILES: TokenTile[] = [
  {
    id: "donut",
    address: DONUT_ADDRESS,
    symbol: "DONUT",
    name: "Donut",
    decimals: 18,
    icon: getDexScreenerIcon(DONUT_ADDRESS),
    banner: getDexScreenerHeader(DONUT_ADDRESS),
    description: "The backbone of the ecosystem",
    isDonutEcosystem: true,
    allowedInputs: ["ETH"],
  },
  {
    id: "sprinkles",
    address: SPRINKLES_ADDRESS,
    symbol: "SPRINKLES",
    name: "Sprinkles",
    decimals: 18,
    icon: getDexScreenerIcon(SPRINKLES_ADDRESS),
    banner: getDexScreenerHeader(SPRINKLES_ADDRESS),
    description: "The sweetest token on Base",
    isDonutEcosystem: true,
    allowedInputs: ["ETH", "DONUT"],
  },
  {
    id: "peeples",
    address: PEEPLES_ADDRESS,
    symbol: "PEEPLES",
    name: "Peeples",
    decimals: 18,
    icon: getDexScreenerIcon(PEEPLES_ADDRESS),
    banner: getDexScreenerHeader(PEEPLES_ADDRESS),
    description: "Pool ETH and mine DONUTS",
    isDonutEcosystem: false,
    externalUrl: "https://warpcast.com/~/token-page/base/0x0eb9d965DBEfbfB131216A4250A29C9b0693Cb07",
  },
  {
    id: "placeholder-1",
    symbol: "???",
    name: "Your Token",
    description: "Build on Donut to get listed",
    isDonutEcosystem: false,
    isPlaceholder: true,
  },
  {
    id: "placeholder-2",
    symbol: "???",
    name: "Your Token",
    description: "Build on Donut to get listed",
    isDonutEcosystem: false,
    isPlaceholder: true,
  },
];

// Input token options
interface InputToken {
  symbol: "ETH" | "DONUT";
  address: Address;
  decimals: number;
  icon: string;
  isNative: boolean;
}

const INPUT_TOKENS: Record<"ETH" | "DONUT", InputToken> = {
  ETH: {
    symbol: "ETH",
    address: WETH_ADDRESS,
    decimals: 18,
    icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    isNative: true,
  },
  DONUT: {
    symbol: "DONUT",
    address: DONUT_ADDRESS,
    decimals: 18,
    icon: getDexScreenerIcon(DONUT_ADDRESS),
    isNative: false,
  },
};

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

const UNISWAP_V2_ROUTER_ABI = [
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
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
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "swapExactETHForTokens",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
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

// Get swap route info
function getSwapRoute(inputSymbol: "ETH" | "DONUT", outputAddress: Address) {
  const output = outputAddress.toLowerCase();
  
  // ETH -> DONUT: Uniswap V2
  if (inputSymbol === "ETH" && output === DONUT_ADDRESS.toLowerCase()) {
    return {
      dex: "uniswapV2" as const,
      router: UNISWAP_V2_ROUTER,
      path: [WETH_ADDRESS, DONUT_ADDRESS],
      isMultiHop: false,
    };
  }
  
  // DONUT -> SPRINKLES: Aerodrome
  if (inputSymbol === "DONUT" && output === SPRINKLES_ADDRESS.toLowerCase()) {
    return {
      dex: "aerodrome" as const,
      router: AERODROME_ROUTER,
      routes: [{ from: DONUT_ADDRESS, to: SPRINKLES_ADDRESS, stable: false, factory: AERODROME_FACTORY }],
      isMultiHop: false,
    };
  }
  
  // ETH -> SPRINKLES: Multi-hop ETH -> DONUT -> SPRINKLES
  if (inputSymbol === "ETH" && output === SPRINKLES_ADDRESS.toLowerCase()) {
    return {
      dex: "multiHop" as const,
      leg1: { dex: "uniswapV2", router: UNISWAP_V2_ROUTER, path: [WETH_ADDRESS, DONUT_ADDRESS] },
      leg2: { dex: "aerodrome", router: AERODROME_ROUTER, routes: [{ from: DONUT_ADDRESS, to: SPRINKLES_ADDRESS, stable: false, factory: AERODROME_FACTORY }] },
      isMultiHop: true,
    };
  }
  
  return null;
}

// Placeholder Tile Component
function PlaceholderTile() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-dashed border-zinc-700">
      <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
        <Plus className="w-6 h-6 text-zinc-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-zinc-500">Your Token Here</div>
        <div className="text-sm text-zinc-600">Build on Donut to get listed</div>
      </div>
    </div>
  );
}

// Token Tile Component
function TokenTileCard({ tile, onClick }: { tile: TokenTile; onClick: () => void }) {
  if (tile.isPlaceholder) {
    return <PlaceholderTile />;
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 transition-all group text-left"
    >
      {/* Token Icon */}
      <div className="relative flex-shrink-0">
        <img
          src={tile.icon}
          alt={tile.symbol}
          className="w-14 h-14 rounded-full border-2 border-zinc-800 group-hover:border-amber-500/50 transition-colors"
        />
        {!tile.isDonutEcosystem && (
          <div className="absolute -top-1 -right-1 bg-zinc-700 rounded-full px-1.5 py-0.5 text-[10px] text-zinc-300">
            ↗
          </div>
        )}
      </div>
      
      {/* Token Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-lg">{tile.symbol}</span>
          <span className="text-sm text-zinc-500">{tile.name}</span>
        </div>
        <p className="text-sm text-zinc-400 truncate">{tile.description}</p>
      </div>

      {/* Banner thumbnail */}
      {tile.banner && (
        <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={tile.banner}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
    </button>
  );
}

export default function SwapPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Main state
  const [selectedToken, setSelectedToken] = useState<TokenTile | null>(null);
  const [inputSymbol, setInputSymbol] = useState<"ETH" | "DONUT">("ETH");
  const [inputAmount, setInputAmount] = useState("");
  const [slippage] = useState(1.0);
  const [showInputDropdown, setShowInputDropdown] = useState(false);
  
  // Transaction state
  const [txStep, setTxStep] = useState<"idle" | "approving" | "transferring_fee" | "swapping">("idle");
  const [swapResult, setSwapResult] = useState<"success" | "failure" | null>(null);
  const swapResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create infinite scroll items (3x the tiles for seamless looping)
  const infiniteItems = useMemo(() => {
    return [...TOKEN_TILES, ...TOKEN_TILES, ...TOKEN_TILES];
  }, []);

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];
  
  const {
    writeContract,
    data: writeHash,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const {
    sendTransaction,
    data: sendHash,
    isPending: isSending,
    reset: resetSend,
  } = useSendTransaction();

  const txHash = writeHash || sendHash;
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

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

  // Auto-connect
  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Infinite scroll handler
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || selectedToken) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const itemHeight = scrollHeight / 3;
      
      // If scrolled to bottom third, jump to middle
      if (scrollTop > itemHeight * 2 - clientHeight) {
        scrollEl.scrollTop = scrollTop - itemHeight;
      }
      // If scrolled to top third, jump to middle
      else if (scrollTop < itemHeight - clientHeight) {
        scrollEl.scrollTop = scrollTop + itemHeight;
      }
    };

    scrollEl.addEventListener("scroll", handleScroll);
    
    // Start in middle section
    const itemHeight = scrollEl.scrollHeight / 3;
    scrollEl.scrollTop = itemHeight;

    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [selectedToken]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (swapResultTimeoutRef.current) clearTimeout(swapResultTimeoutRef.current);
    };
  }, []);

  const inputToken = INPUT_TOKENS[inputSymbol];
  const route = selectedToken?.address ? getSwapRoute(inputSymbol, selectedToken.address) : null;

  // Balances
  const { data: nativeEthBalance, refetch: refetchNativeEthBalance } = useBalance({
    address,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const { data: donutBalance, refetch: refetchDonutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const inputBalance = inputSymbol === "ETH" ? nativeEthBalance?.value : donutBalance;

  const refetchInputBalance = useCallback(() => {
    if (inputSymbol === "ETH") refetchNativeEthBalance();
    else refetchDonutBalance();
  }, [inputSymbol, refetchNativeEthBalance, refetchDonutBalance]);

  // Calculate amounts
  const inputAmountWei = useMemo(() => {
    if (!inputAmount || inputAmount === "" || isNaN(parseFloat(inputAmount))) return 0n;
    try {
      const normalized = inputAmount.startsWith(".") ? `0${inputAmount}` : inputAmount;
      return parseUnits(normalized, inputToken.decimals);
    } catch {
      return 0n;
    }
  }, [inputAmount, inputToken.decimals]);

  const feeAmount = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return (inputAmountWei * BigInt(SWAP_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
  }, [inputAmountWei]);

  const amountToSwap = useMemo(() => inputAmountWei - feeAmount, [inputAmountWei, feeAmount]);

  // Get router for approval
  const routerForApproval = useMemo(() => {
    if (!route) return UNISWAP_V2_ROUTER;
    if (route.dex === "multiHop") return route.leg1.router;
    return route.router;
  }, [route]);

  // Allowance check
  const { data: inputAllowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, routerForApproval],
    chainId: base.id,
    query: { enabled: !!address && !inputToken.isNative, refetchInterval: 10_000 },
  });

  const needsApproval = !inputToken.isNative && (inputAllowance ?? 0n) < inputAmountWei;

  // Quote for single-hop V2
  const { data: v2Quote } = useReadContract({
    address: UNISWAP_V2_ROUTER,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountToSwap, route?.dex === "uniswapV2" ? route.path : [WETH_ADDRESS, DONUT_ADDRESS]],
    chainId: base.id,
    query: { enabled: amountToSwap > 0n && route?.dex === "uniswapV2", refetchInterval: 10_000 },
  });

  // Quote for single-hop Aerodrome
  const { data: aeroQuote } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountToSwap, route?.dex === "aerodrome" ? route.routes : []],
    chainId: base.id,
    query: { enabled: amountToSwap > 0n && route?.dex === "aerodrome", refetchInterval: 10_000 },
  });

  // Multi-hop: leg1 quote
  const { data: multiLeg1Quote } = useReadContract({
    address: UNISWAP_V2_ROUTER,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountToSwap, route?.dex === "multiHop" ? route.leg1.path : [WETH_ADDRESS, DONUT_ADDRESS]],
    chainId: base.id,
    query: { enabled: amountToSwap > 0n && route?.dex === "multiHop", refetchInterval: 10_000 },
  });

  const leg1Output = useMemo(() => {
    if (!multiLeg1Quote || !Array.isArray(multiLeg1Quote)) return 0n;
    return multiLeg1Quote[multiLeg1Quote.length - 1] as bigint;
  }, [multiLeg1Quote]);

  // Multi-hop: leg2 quote (Aerodrome)
  const { data: multiLeg2AeroQuote } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [leg1Output, route?.dex === "multiHop" && route.leg2.dex === "aerodrome" ? route.leg2.routes : []],
    chainId: base.id,
    query: { enabled: leg1Output > 0n && route?.dex === "multiHop" && route?.leg2.dex === "aerodrome", refetchInterval: 10_000 },
  });

  // Calculate output amount
  const outputAmount = useMemo(() => {
    if (!route) return 0n;
    
    if (route.dex === "uniswapV2") {
      if (!v2Quote || !Array.isArray(v2Quote)) return 0n;
      return v2Quote[v2Quote.length - 1] as bigint;
    }
    
    if (route.dex === "aerodrome") {
      if (!aeroQuote || !Array.isArray(aeroQuote)) return 0n;
      return aeroQuote[aeroQuote.length - 1] as bigint;
    }
    
    if (route.dex === "multiHop") {
      if (route.leg2.dex === "aerodrome") {
        if (!multiLeg2AeroQuote || !Array.isArray(multiLeg2AeroQuote)) return 0n;
        return multiLeg2AeroQuote[multiLeg2AeroQuote.length - 1] as bigint;
      }
    }
    
    return 0n;
  }, [route, v2Quote, aeroQuote, multiLeg2AeroQuote]);

  const outputAmountDisplay = useMemo(() => {
    if (!selectedToken || outputAmount === 0n) return "0";
    const formatted = Number(formatUnits(outputAmount, selectedToken.decimals ?? 18));
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }, [outputAmount, selectedToken]);

  const minOutputAmount = useMemo(() => {
    if (outputAmount === 0n) return 0n;
    const slippageBps = BigInt(Math.round(slippage * 100));
    return outputAmount - (outputAmount * slippageBps) / 10000n;
  }, [outputAmount, slippage]);

  // Reset transaction state
  const resetTx = useCallback(() => {
    resetWrite();
    resetSend();
  }, [resetWrite, resetSend]);

  const showSwapResultFn = useCallback((result: "success" | "failure") => {
    if (swapResultTimeoutRef.current) clearTimeout(swapResultTimeoutRef.current);
    setSwapResult(result);
    swapResultTimeoutRef.current = setTimeout(() => {
      setSwapResult(null);
    }, 3000);
  }, []);

  // Handle tile click
  const handleTileClick = async (tile: TokenTile) => {
    if (tile.isPlaceholder) return;
    
    if (tile.isDonutEcosystem) {
      setSelectedToken(tile);
      setInputSymbol(tile.allowedInputs?.[0] ?? "ETH");
      setInputAmount("");
      setTxStep("idle");
    } else if (tile.address) {
      // Open native Farcaster token page using deep link
      // The farcaster:// protocol should open in the native app
      const deepLink = `farcaster://token/base/${tile.address}`;
      const webFallback = `https://warpcast.com/~/token/eip155:8453:${tile.address}`;
      
      try {
        // Try deep link first (opens native app)
        window.location.href = deepLink;
      } catch {
        // Fallback to web URL
        try {
          await sdk.actions.openUrl(webFallback);
        } catch (err) {
          console.error("Failed to open token page:", err);
        }
      }
    }
  };

  // Handle back button
  const handleBack = () => {
    setSelectedToken(null);
    setInputAmount("");
    setTxStep("idle");
    setShowInputDropdown(false);
    resetTx();
  };

  // Handle swap
  const handleSwap = useCallback(async () => {
    if (!address || !selectedToken || !route || amountToSwap === 0n) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    try {
      // Step 1: Approve if needed
      if (needsApproval && txStep === "idle") {
        setTxStep("approving");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [routerForApproval, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
          chainId: base.id,
        });
        return;
      }

      // Step 2: Transfer fee
      if (txStep === "idle" || txStep === "approving") {
        setTxStep("transferring_fee");
        if (inputToken.isNative) {
          sendTransaction({
            to: TREASURY_ADDRESS,
            value: feeAmount,
            chainId: base.id,
          });
        } else {
          await writeContract({
            address: inputToken.address,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [TREASURY_ADDRESS, feeAmount],
            chainId: base.id,
          });
        }
        return;
      }

      // Step 3: Execute swap
      if (txStep === "transferring_fee") {
        setTxStep("swapping");
        
        if (route.dex === "uniswapV2") {
          if (inputToken.isNative) {
            await writeContract({
              address: UNISWAP_V2_ROUTER,
              abi: UNISWAP_V2_ROUTER_ABI,
              functionName: "swapExactETHForTokens",
              args: [minOutputAmount, route.path, address, deadline],
              value: amountToSwap,
              chainId: base.id,
            });
          } else {
            await writeContract({
              address: UNISWAP_V2_ROUTER,
              abi: UNISWAP_V2_ROUTER_ABI,
              functionName: "swapExactTokensForTokens",
              args: [amountToSwap, minOutputAmount, route.path, address, deadline],
              chainId: base.id,
            });
          }
        } else if (route.dex === "aerodrome") {
          await writeContract({
            address: AERODROME_ROUTER,
            abi: AERODROME_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountToSwap, minOutputAmount, route.routes, address, deadline],
            chainId: base.id,
          });
        }
        // Multi-hop needs more complex handling
        else if (route.dex === "multiHop") {
          console.log("Multi-hop swaps require multiple transactions");
        }
        return;
      }
    } catch (error) {
      console.error("Swap error:", error);
      showSwapResultFn("failure");
      setTxStep("idle");
      resetTx();
    }
  }, [
    address, selectedToken, route, amountToSwap, needsApproval, txStep,
    inputToken, feeAmount, minOutputAmount, routerForApproval,
    writeContract, sendTransaction, showSwapResultFn, resetTx
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
        resetTx();
        refetchAllowance();
        setTxStep("idle");
        handleSwap();
        return;
      }

      if (txStep === "transferring_fee") {
        resetTx();
        handleSwap();
        return;
      }

      if (txStep === "swapping") {
        showSwapResultFn("success");
        setTxStep("idle");
        setInputAmount("");
        refetchInputBalance();
        resetTx();
        return;
      }
    }
  }, [receipt, txStep, handleSwap, showSwapResultFn, resetTx, refetchAllowance, refetchInputBalance]);

  const isSwapDisabled =
    !isConnected ||
    amountToSwap === 0n ||
    outputAmount === 0n ||
    (inputBalance !== undefined && inputAmountWei > inputBalance) ||
    txStep !== "idle" ||
    isWriting ||
    isSending ||
    isConfirming;

  const buttonText = useMemo(() => {
    if (!isConnected) return "Connect Wallet";
    if (isWriting || isSending || isConfirming) {
      if (txStep === "approving") return "Approving...";
      if (txStep === "transferring_fee") return "Transferring Fee...";
      if (txStep === "swapping") return "Swapping...";
      return "Processing...";
    }
    if (swapResult === "success") return "Success!";
    if (swapResult === "failure") return "Failed - Try Again";
    if (inputBalance !== undefined && inputAmountWei > inputBalance) return "Insufficient Balance";
    if (amountToSwap === 0n) return "Enter Amount";
    if (needsApproval) return "Approve & Swap";
    return "Swap";
  }, [isConnected, isWriting, isSending, isConfirming, txStep, swapResult, inputBalance, inputAmountWei, amountToSwap, needsApproval]);

  // Available input tokens for selected token
  const availableInputs = selectedToken?.allowedInputs ?? ["ETH"];

  // RENDER: Token Grid View
  if (!selectedToken) {
    return (
      <main className="relative flex min-h-screen w-full flex-col bg-black text-white pb-20">
        {/* Header */}
        <div className="p-4 pb-2">
          <h1 className="text-2xl font-black">SWAP</h1>
          <p className="text-zinc-500 text-sm">Select a token to swap into</p>
        </div>

        {/* Scrollable token list with fade */}
        <div className="relative flex-1 overflow-hidden">
          {/* Top fade */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
          
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
          
          {/* Scrollable list */}
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto px-4 py-8 space-y-3 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {infiniteItems.map((tile, index) => (
              <TokenTileCard
                key={`${tile.id}-${index}`}
                tile={tile}
                onClick={() => handleTileClick(tile)}
              />
            ))}
          </div>
        </div>
        
        <NavBar />
      </main>
    );
  }

  // RENDER: Swap UI View
  return (
    <main className="relative flex min-h-screen w-full flex-col bg-black text-white pb-20">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleBack}
            className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-10 h-10 rounded-full" />
            <div>
              <h1 className="text-xl font-bold">Buy {selectedToken.symbol}</h1>
              <p className="text-xs text-zinc-500">{selectedToken.description}</p>
            </div>
          </div>
        </div>

        {/* Swap Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {/* Input Section */}
          <div className="rounded-xl bg-zinc-900 p-4 mb-2">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-zinc-500">You Pay</span>
              <span className="text-sm text-zinc-500">
                Balance: {inputBalance !== undefined 
                  ? Number(formatUnits(inputBalance as bigint, inputToken.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : "0"
                }
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Input token dropdown */}
              <div className="relative">
                <button
                  onClick={() => availableInputs.length > 1 && setShowInputDropdown(!showInputDropdown)}
                  className={cn(
                    "flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 min-w-[120px]",
                    availableInputs.length > 1 && "hover:bg-zinc-700 cursor-pointer"
                  )}
                >
                  <img src={inputToken.icon} alt={inputToken.symbol} className="w-6 h-6 rounded-full" />
                  <span className="font-semibold">{inputToken.symbol}</span>
                  {availableInputs.length > 1 && (
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", showInputDropdown && "rotate-180")} />
                  )}
                </button>
                
                {/* Dropdown */}
                {showInputDropdown && availableInputs.length > 1 && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden z-20">
                    {availableInputs.map((sym) => (
                      <button
                        key={sym}
                        onClick={() => {
                          setInputSymbol(sym);
                          setShowInputDropdown(false);
                          setInputAmount("");
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-700 transition-colors",
                          inputSymbol === sym && "bg-zinc-700"
                        )}
                      >
                        <img src={INPUT_TOKENS[sym].icon} alt={sym} className="w-6 h-6 rounded-full" />
                        <span className="font-semibold">{sym}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={inputAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "");
                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                    setInputAmount(val);
                  }
                }}
                className="flex-1 bg-transparent text-right text-2xl font-bold outline-none placeholder-zinc-600 min-w-0"
              />
              
              <button
                onClick={() => {
                  if (inputBalance) {
                    const max = formatUnits(inputBalance as bigint, inputToken.decimals);
                    setInputAmount(max);
                  }
                }}
                className="text-xs text-amber-500 font-bold hover:text-amber-400 flex-shrink-0"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-1 relative z-10">
            <div className="bg-zinc-800 rounded-full p-2 border-4 border-zinc-950">
              <ArrowDown className="w-4 h-4 text-zinc-400" />
            </div>
          </div>

          {/* Output Section */}
          <div className="rounded-xl bg-zinc-900 p-4 mt-2">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-zinc-500">You Receive</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 min-w-[120px]">
                <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" />
                <span className="font-semibold">{selectedToken.symbol}</span>
              </div>
              
              <div className="flex-1 text-right text-2xl font-bold text-zinc-300 min-w-0 truncate">
                {outputAmountDisplay}
              </div>
            </div>
          </div>

          {/* Fee Info */}
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Fee (0.05%)</span>
              <span>{feeAmount > 0n ? Number(formatUnits(feeAmount, inputToken.decimals)).toFixed(6) : "0"} {inputToken.symbol}</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>Route</span>
              <span>
                {route?.dex === "uniswapV2" && "Uniswap V2"}
                {route?.dex === "aerodrome" && "Aerodrome"}
                {route?.dex === "multiHop" && "V2 → Aerodrome"}
              </span>
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={isSwapDisabled}
            className={cn(
              "w-full mt-4 rounded-xl py-4 text-lg font-bold transition-all",
              swapResult === "success"
                ? "bg-green-500 text-white"
                : swapResult === "failure"
                ? "bg-red-500 text-white"
                : isSwapDisabled
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-amber-500 text-black hover:bg-amber-400"
            )}
          >
            {(isWriting || isSending || isConfirming) && (
              <Loader2 className="w-5 h-5 inline mr-2 animate-spin" />
            )}
            {buttonText}
          </button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showInputDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowInputDropdown(false)} 
        />
      )}

      <NavBar />
    </main>
  );
}