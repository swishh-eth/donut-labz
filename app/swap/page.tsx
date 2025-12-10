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
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as Address;

// Uniswap V2 Router on Base (for DONUT-WETH pool)
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" as Address;

// Aerodrome Router (for SPRINKLES-DONUT pool)
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address;
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address;

// Token definitions - only tokens with verified Aerodrome pools
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
    symbol: "ETH",
    name: "Ethereum",
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
];

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

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Swap leg definition for multi-hop swaps
type SwapLeg = {
  dex: "uniswap" | "aerodrome";
  fromToken: Address;
  toToken: Address;
  // For Uniswap V2
  path?: Address[];
  // For Aerodrome
  routes?: { from: Address; to: Address; stable: boolean; factory: Address }[];
};

// Full swap info with multiple legs
type SwapInfo = {
  legs: SwapLeg[];
  displayPath: string[];
  // Is this a multi-hop cross-DEX swap?
  isMultiHop: boolean;
};

function getSwapInfo(fromToken: Address, toToken: Address): SwapInfo {
  const from = fromToken.toLowerCase();
  const to = toToken.toLowerCase();
  
  // DONUT <-> WETH: Single leg via Uniswap V2
  if ((from === DONUT_ADDRESS.toLowerCase() && to === WETH_ADDRESS.toLowerCase()) ||
      (from === WETH_ADDRESS.toLowerCase() && to === DONUT_ADDRESS.toLowerCase())) {
    return {
      legs: [{
        dex: "uniswap",
        fromToken,
        toToken,
        path: [fromToken, toToken],
      }],
      displayPath: [
        from === DONUT_ADDRESS.toLowerCase() ? "DONUT" : "ETH",
        to === DONUT_ADDRESS.toLowerCase() ? "DONUT" : "ETH",
      ],
      isMultiHop: false,
    };
  }
  
  // DONUT <-> SPRINKLES: Single leg via Aerodrome
  if ((from === DONUT_ADDRESS.toLowerCase() && to === SPRINKLES_ADDRESS.toLowerCase()) ||
      (from === SPRINKLES_ADDRESS.toLowerCase() && to === DONUT_ADDRESS.toLowerCase())) {
    return {
      legs: [{
        dex: "aerodrome",
        fromToken,
        toToken,
        routes: [{
          from: fromToken,
          to: toToken,
          stable: false,
          factory: AERODROME_FACTORY,
        }],
      }],
      displayPath: [
        from === DONUT_ADDRESS.toLowerCase() ? "DONUT" : "SPRINKLES",
        to === DONUT_ADDRESS.toLowerCase() ? "DONUT" : "SPRINKLES",
      ],
      isMultiHop: false,
    };
  }

  // ETH -> SPRINKLES: Two legs - ETH -> DONUT (Uniswap) then DONUT -> SPRINKLES (Aerodrome)
  if (from === WETH_ADDRESS.toLowerCase() && to === SPRINKLES_ADDRESS.toLowerCase()) {
    return {
      legs: [
        {
          dex: "uniswap",
          fromToken: WETH_ADDRESS,
          toToken: DONUT_ADDRESS,
          path: [WETH_ADDRESS, DONUT_ADDRESS],
        },
        {
          dex: "aerodrome",
          fromToken: DONUT_ADDRESS,
          toToken: SPRINKLES_ADDRESS,
          routes: [{
            from: DONUT_ADDRESS,
            to: SPRINKLES_ADDRESS,
            stable: false,
            factory: AERODROME_FACTORY,
          }],
        },
      ],
      displayPath: ["ETH", "DONUT", "SPRINKLES"],
      isMultiHop: true,
    };
  }

  // SPRINKLES -> ETH: Two legs - SPRINKLES -> DONUT (Aerodrome) then DONUT -> ETH (Uniswap)
  if (from === SPRINKLES_ADDRESS.toLowerCase() && to === WETH_ADDRESS.toLowerCase()) {
    return {
      legs: [
        {
          dex: "aerodrome",
          fromToken: SPRINKLES_ADDRESS,
          toToken: DONUT_ADDRESS,
          routes: [{
            from: SPRINKLES_ADDRESS,
            to: DONUT_ADDRESS,
            stable: false,
            factory: AERODROME_FACTORY,
          }],
        },
        {
          dex: "uniswap",
          fromToken: DONUT_ADDRESS,
          toToken: WETH_ADDRESS,
          path: [DONUT_ADDRESS, WETH_ADDRESS],
        },
      ],
      displayPath: ["SPRINKLES", "DONUT", "ETH"],
      isMultiHop: true,
    };
  }

  // Default: try Uniswap direct (may fail)
  return {
    legs: [{
      dex: "uniswap",
      fromToken,
      toToken,
      path: [fromToken, toToken],
    }],
    displayPath: ["?", "?"],
    isMultiHop: false,
  };
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
  // For multi-hop: approving_leg1, swapping_leg1, approving_leg2, swapping_leg2
  const [txStep, setTxStep] = useState<
    "idle" | 
    "approving" | 
    "transferring_fee" | 
    "swapping_leg1" | 
    "approving_leg2" | 
    "swapping_leg2"
  >("idle");
  const [swapResult, setSwapResult] = useState<"success" | "failure" | null>(null);
  const swapResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track intermediate DONUT balance for multi-hop swaps
  const [intermediateAmount, setIntermediateAmount] = useState<bigint>(0n);

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

  // Get swap info to determine routing
  const swapInfo = useMemo(() => {
    return getSwapInfo(inputToken.address, outputToken.address);
  }, [inputToken.address, outputToken.address]);

  // First leg info
  const firstLeg = swapInfo.legs[0];
  const secondLeg = swapInfo.legs[1]; // May be undefined for single-hop

  // Determine which router to approve for the first leg
  const routerForLeg1 = firstLeg.dex === "uniswap" ? UNISWAP_V2_ROUTER : AERODROME_ROUTER;
  const routerForLeg2 = secondLeg?.dex === "uniswap" ? UNISWAP_V2_ROUTER : AERODROME_ROUTER;

  // Read allowance for first leg router
  const { data: inputAllowance, refetch: refetchAllowance } = useReadContract({
    address: inputToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, routerForLeg1],
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10_000,
    },
  });

  // Read DONUT allowance for second leg (for multi-hop)
  const { data: donutAllowanceForLeg2, refetch: refetchDonutAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, routerForLeg2 ?? zeroAddress],
    chainId: base.id,
    query: {
      enabled: !!address && swapInfo.isMultiHop,
      refetchInterval: 5_000,
    },
  });

  // Read DONUT balance (for multi-hop intermediate)
  const { data: donutBalance, refetch: refetchDonutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      enabled: !!address && swapInfo.isMultiHop,
      refetchInterval: 5_000,
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

  // Amount after fee (what gets swapped in first leg)
  const amountAfterFee = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return inputAmountWei - feeAmount;
  }, [inputAmountWei, feeAmount]);

  // Get quote for first leg (Uniswap)
  const { data: leg1UniswapQuote, refetch: refetchLeg1Uniswap } = useReadContract({
    address: UNISWAP_V2_ROUTER,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountAfterFee, firstLeg.path ?? []],
    chainId: base.id,
    query: {
      enabled: amountAfterFee > 0n && firstLeg.dex === "uniswap" && !!firstLeg.path?.length,
      refetchInterval: 10_000,
    },
  });

  // Get quote for first leg (Aerodrome)
  const { data: leg1AerodromeQuote, refetch: refetchLeg1Aerodrome } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountAfterFee, firstLeg.routes ?? []],
    chainId: base.id,
    query: {
      enabled: amountAfterFee > 0n && firstLeg.dex === "aerodrome" && !!firstLeg.routes?.length,
      refetchInterval: 10_000,
    },
  });

  // First leg output (intermediate DONUT amount for multi-hop)
  const leg1Output = useMemo(() => {
    const quoteData = firstLeg.dex === "uniswap" ? leg1UniswapQuote : leg1AerodromeQuote;
    if (!quoteData || !Array.isArray(quoteData) || quoteData.length < 2) return 0n;
    return quoteData[quoteData.length - 1] as bigint;
  }, [firstLeg.dex, leg1UniswapQuote, leg1AerodromeQuote]);

  // Get quote for second leg (if multi-hop)
  const { data: leg2UniswapQuote, refetch: refetchLeg2Uniswap } = useReadContract({
    address: UNISWAP_V2_ROUTER,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [leg1Output, secondLeg?.path ?? []],
    chainId: base.id,
    query: {
      enabled: leg1Output > 0n && swapInfo.isMultiHop && secondLeg?.dex === "uniswap" && !!secondLeg?.path?.length,
      refetchInterval: 10_000,
    },
  });

  const { data: leg2AerodromeQuote, refetch: refetchLeg2Aerodrome } = useReadContract({
    address: AERODROME_ROUTER,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [leg1Output, secondLeg?.routes ?? []],
    chainId: base.id,
    query: {
      enabled: leg1Output > 0n && swapInfo.isMultiHop && secondLeg?.dex === "aerodrome" && !!secondLeg?.routes?.length,
      refetchInterval: 10_000,
    },
  });

  // Final output amount
  const outputAmount = useMemo(() => {
    if (!swapInfo.isMultiHop) {
      // Single hop - just return leg1 output
      return leg1Output;
    }
    // Multi-hop - return leg2 output
    const leg2Quote = secondLeg?.dex === "uniswap" ? leg2UniswapQuote : leg2AerodromeQuote;
    if (!leg2Quote || !Array.isArray(leg2Quote) || leg2Quote.length < 2) return 0n;
    return leg2Quote[leg2Quote.length - 1] as bigint;
  }, [swapInfo.isMultiHop, leg1Output, secondLeg?.dex, leg2UniswapQuote, leg2AerodromeQuote]);

  const refetchQuote = useCallback(() => {
    if (firstLeg.dex === "uniswap") {
      refetchLeg1Uniswap();
    } else {
      refetchLeg1Aerodrome();
    }
    if (swapInfo.isMultiHop && secondLeg) {
      if (secondLeg.dex === "uniswap") {
        refetchLeg2Uniswap();
      } else {
        refetchLeg2Aerodrome();
      }
    }
  }, [firstLeg.dex, swapInfo.isMultiHop, secondLeg, refetchLeg1Uniswap, refetchLeg1Aerodrome, refetchLeg2Uniswap, refetchLeg2Aerodrome]);

  const outputAmountDisplay = useMemo(() => {
    if (outputAmount === 0n) return "0";
    const formatted = Number(formatUnits(outputAmount, outputToken.decimals));
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [outputAmount, outputToken.decimals]);

  // Minimum output with slippage (applied to final output)
  const minOutputAmount = useMemo(() => {
    if (outputAmount === 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return outputAmount - (outputAmount * slippageBps) / 10000n;
  }, [outputAmount, slippage]);

  // Minimum intermediate amount for leg1 (with slippage)
  const minLeg1Output = useMemo(() => {
    if (leg1Output === 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return leg1Output - (leg1Output * slippageBps) / 10000n;
  }, [leg1Output, slippage]);

  // Check if needs approval for first leg
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
    console.log("handleSwap called", { address, inputAmountWei: inputAmountWei.toString(), txStep, needsApproval, isMultiHop: swapInfo.isMultiHop });
    
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
        setTxStep("idle");
      }
      return;
    }
    
    if (inputAmountWei === 0n) {
      console.log("Input amount is 0");
      return;
    }
    
    resetSwapResult();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    try {
      // Step 1: Approve input token for first leg router (if needed)
      if (needsApproval && txStep === "idle") {
        console.log("Starting approval for leg 1 on", firstLeg.dex);
        setTxStep("approving");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [routerForLeg1, inputAmountWei],
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
        console.log("Executing fee transfer");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [TREASURY_ADDRESS, feeAmount],
          chainId: base.id,
        });
        return;
      }

      // Step 3: Execute first leg swap
      if (txStep === "swapping_leg1") {
        console.log("Executing leg 1 swap via", firstLeg.dex);
        
        if (firstLeg.dex === "uniswap" && firstLeg.path) {
          // For single-hop, use final minOutput. For multi-hop, use intermediate minOutput
          const minOut = swapInfo.isMultiHop ? minLeg1Output : minOutputAmount;
          await writeContract({
            address: UNISWAP_V2_ROUTER,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountAfterFee, minOut, firstLeg.path, address, deadline],
            chainId: base.id,
          });
        } else if (firstLeg.dex === "aerodrome" && firstLeg.routes) {
          const minOut = swapInfo.isMultiHop ? minLeg1Output : minOutputAmount;
          await writeContract({
            address: AERODROME_ROUTER,
            abi: AERODROME_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountAfterFee, minOut, firstLeg.routes, address, deadline],
            chainId: base.id,
          });
        }
        return;
      }

      // Step 4: Approve DONUT for second leg router (multi-hop only)
      if (txStep === "approving_leg2" && swapInfo.isMultiHop && secondLeg) {
        console.log("Approving DONUT for leg 2 on", secondLeg.dex);
        // Approve max uint256 for convenience
        await writeContract({
          address: DONUT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [routerForLeg2!, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
          chainId: base.id,
        });
        return;
      }

      // Step 5: Execute second leg swap (multi-hop only)
      if (txStep === "swapping_leg2" && swapInfo.isMultiHop && secondLeg) {
        console.log("Executing leg 2 swap via", secondLeg.dex);
        
        // Get current DONUT balance to swap all of it
        const donutBal = donutBalance as bigint ?? 0n;
        // Use the intermediate amount we tracked, or current balance
        const swapAmount = intermediateAmount > 0n ? intermediateAmount : donutBal;
        
        if (secondLeg.dex === "uniswap" && secondLeg.path) {
          await writeContract({
            address: UNISWAP_V2_ROUTER,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [swapAmount, minOutputAmount, secondLeg.path, address, deadline],
            chainId: base.id,
          });
        } else if (secondLeg.dex === "aerodrome" && secondLeg.routes) {
          await writeContract({
            address: AERODROME_ROUTER,
            abi: AERODROME_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [swapAmount, minOutputAmount, secondLeg.routes, address, deadline],
            chainId: base.id,
          });
        }
        return;
      }
    } catch (error: any) {
      console.error("Swap failed:", error);
      // Check if user rejected/cancelled
      if (error?.message?.includes("User rejected") || error?.message?.includes("cancelled") || error?.code === 4001) {
        console.log("User cancelled transaction");
      } else {
        showSwapResultFn("failure");
      }
      setTxStep("idle");
      setIntermediateAmount(0n);
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
    minLeg1Output,
    swapInfo,
    firstLeg,
    secondLeg,
    routerForLeg1,
    routerForLeg2,
    intermediateAmount,
    donutBalance,
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
      setIntermediateAmount(0n);
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
        setTxStep("swapping_leg1");
        return;
      }

      if (txStep === "swapping_leg1") {
        if (swapInfo.isMultiHop) {
          // After leg1, check if we need to approve DONUT for leg2
          resetWrite();
          refetchDonutBalance();
          refetchDonutAllowance();
          // Store intermediate amount (will be updated when balance refetches)
          setIntermediateAmount(leg1Output);
          
          // Check if DONUT is already approved for leg2 router
          const donutAllowance = donutAllowanceForLeg2 as bigint ?? 0n;
          if (donutAllowance < leg1Output) {
            setTxStep("approving_leg2");
          } else {
            setTxStep("swapping_leg2");
          }
          return;
        } else {
          // Single hop complete
          showSwapResultFn("success");
          setTxStep("idle");
          setInputAmount("");
          refetchInputBalance();
          refetchAllowance();
          resetWrite();
          return;
        }
      }

      if (txStep === "approving_leg2") {
        resetWrite();
        refetchDonutAllowance();
        setTxStep("swapping_leg2");
        return;
      }

      if (txStep === "swapping_leg2") {
        // Multi-hop complete!
        showSwapResultFn("success");
        setTxStep("idle");
        setIntermediateAmount(0n);
        setInputAmount("");
        refetchInputBalance();
        refetchAllowance();
        refetchDonutBalance();
        resetWrite();
        return;
      }
    }
  }, [receipt, txStep, swapInfo.isMultiHop, leg1Output, donutAllowanceForLeg2, resetWrite, showSwapResultFn, refetchInputBalance, refetchAllowance, refetchDonutBalance, refetchDonutAllowance]);

  // Auto-continue swap after approval/fee transfer - only if we have a pending step
  const pendingStepRef = useRef(false);
  
  useEffect(() => {
    // Only auto-continue if we're in a middle step and not already processing
    if (
      (txStep === "transferring_fee" || txStep === "swapping_leg1" || txStep === "approving_leg2" || txStep === "swapping_leg2") && 
      !isWriting && 
      !isConfirming && 
      !txHash &&
      !pendingStepRef.current
    ) {
      pendingStepRef.current = true;
      // Small delay to prevent rapid re-firing
      const timer = setTimeout(() => {
        handleSwap();
        pendingStepRef.current = false;
      }, 500);
      return () => {
        clearTimeout(timer);
        pendingStepRef.current = false;
      };
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
      if (txStep === "swapping_leg1") return swapInfo.isMultiHop ? "Swapping (1/2)..." : "Swapping...";
      if (txStep === "approving_leg2") return "Approving DONUT...";
      if (txStep === "swapping_leg2") return "Swapping (2/2)...";
      return "Processing...";
    }
    if (!inputAmount || inputAmount === "0") return "Enter Amount";
    if (!hasSufficientBalance) return "Insufficient Balance";
    if (needsApproval) return swapInfo.isMultiHop ? "Approve & Multi-Swap" : "Approve & Swap";
    return swapInfo.isMultiHop ? "Multi-Swap" : "Swap";
  }, [swapResult, isWriting, isConfirming, txStep, inputAmount, hasSufficientBalance, needsApproval, swapInfo.isMultiHop]);

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
                {swapInfo.displayPath.join(" → ")}
                {swapInfo.isMultiHop ? (
                  <span className="text-gray-500 ml-1">
                    ({firstLeg.dex === "uniswap" ? "Uni" : "Aero"} → {secondLeg?.dex === "uniswap" ? "Uni" : "Aero"})
                  </span>
                ) : (
                  <span className="text-gray-500 ml-1">
                    ({firstLeg.dex === "uniswap" ? "Uniswap" : "Aerodrome"})
                  </span>
                )}
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
              Powered by {swapInfo.isMultiHop ? "Uniswap + Aerodrome" : (firstLeg.dex === "uniswap" ? "Uniswap" : "Aerodrome")} • 0.3% fee supports Donut Labs
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