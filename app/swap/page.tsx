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
import { ArrowLeft, ArrowDown, Loader2, ChevronDown, Plus, Shield, X, ArrowUpDown } from "lucide-react";

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

// Fee configuration (0.1% = 10 basis points)
const SWAP_FEE_BPS = 10;
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
  isApprovalsTile?: boolean;
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
    name: "Coming Soon",
    description: "Your Glazery Here",
    isDonutEcosystem: false,
    isPlaceholder: true,
  },
  {
    id: "placeholder-2",
    symbol: "???",
    name: "Coming Soon",
    description: "Your Glazery Here",
    isDonutEcosystem: false,
    isPlaceholder: true,
  },
  {
    id: "placeholder-3",
    symbol: "???",
    name: "Coming Soon",
    description: "Your Glazery Here",
    isDonutEcosystem: false,
    isPlaceholder: true,
  },
  {
    id: "approvals",
    symbol: "🛡️",
    name: "Token Approvals",
    description: "Manage & revoke token approvals",
    isDonutEcosystem: false,
    isApprovalsTile: true,
  },
];

// Input token options
type InputSymbol = "ETH" | "DONUT";

interface InputToken {
  symbol: InputSymbol;
  address: Address;
  decimals: number;
  icon: string;
  isNative: boolean;
}

const INPUT_TOKENS: Record<InputSymbol, InputToken> = {
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
// When isSelling = true, we're selling the token (output becomes input)
function getSwapRoute(inputSymbol: InputSymbol, outputAddress: Address, isSelling: boolean = false) {
  const output = outputAddress.toLowerCase();
  
  if (!isSelling) {
    // BUYING MODE - existing routes
    
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
  } else {
    // SELLING MODE - reverse routes
    
    // Sell DONUT -> ETH: Uniswap V2 (reverse path)
    if (output === DONUT_ADDRESS.toLowerCase() && inputSymbol === "ETH") {
      return {
        dex: "uniswapV2" as const,
        router: UNISWAP_V2_ROUTER,
        path: [DONUT_ADDRESS, WETH_ADDRESS],
        isMultiHop: false,
        isSellRoute: true,
      };
    }
    
    // Sell SPRINKLES -> DONUT: Aerodrome (reverse)
    if (output === SPRINKLES_ADDRESS.toLowerCase() && inputSymbol === "DONUT") {
      return {
        dex: "aerodrome" as const,
        router: AERODROME_ROUTER,
        routes: [{ from: SPRINKLES_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY }],
        isMultiHop: false,
        isSellRoute: true,
      };
    }
    
    // Sell SPRINKLES -> ETH: Multi-hop SPRINKLES -> DONUT -> ETH
    if (output === SPRINKLES_ADDRESS.toLowerCase() && inputSymbol === "ETH") {
      return {
        dex: "multiHopSell" as const,
        leg1: { dex: "aerodrome", router: AERODROME_ROUTER, routes: [{ from: SPRINKLES_ADDRESS, to: DONUT_ADDRESS, stable: false, factory: AERODROME_FACTORY }] },
        leg2: { dex: "uniswapV2", router: UNISWAP_V2_ROUTER, path: [DONUT_ADDRESS, WETH_ADDRESS] },
        isMultiHop: true,
        isSellRoute: true,
      };
    }
  }
  
  return null;
}

// Approvals Tile Component
function ApprovalsTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full relative rounded-xl overflow-hidden border border-amber-500 hover:border-amber-400 transition-all active:scale-[0.98] text-left bg-amber-600"
      style={{ height: "110px" }}
    >
      <div className="relative flex items-center gap-4 p-4 h-full">
        {/* Shield Icon */}
        <div className="w-16 h-16 rounded-full bg-amber-500/30 border-2 border-amber-400/50 flex items-center justify-center flex-shrink-0">
          <Shield className="w-8 h-8 text-white" />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-xl text-white">
            Token Approvals
          </div>
          <div className="text-sm text-amber-100 mt-0.5">
            Manage & revoke approvals
          </div>
        </div>
      </div>
    </button>
  );
}

// Placeholder Tile Component
function PlaceholderTile() {
  return (
    <div 
      className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-dashed border-zinc-700"
      style={{ height: "110px" }}
    >
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
        <Plus className="w-7 h-7 text-zinc-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-zinc-500 text-xl">Your Glazery Here</div>
        <div className="text-sm text-zinc-600 mt-1">Build on Donut to get listed</div>
      </div>
    </div>
  );
}

// Token Tile Component
function TokenTileCard({ tile, onClick, onApprovalsClick, isFirst }: { tile: TokenTile; onClick: () => void; onApprovalsClick?: () => void; isFirst?: boolean }) {
  if (tile.isPlaceholder) {
    return <PlaceholderTile />;
  }
  
  if (tile.isApprovalsTile && onApprovalsClick) {
    return <ApprovalsTile onClick={onApprovalsClick} />;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full relative rounded-xl overflow-hidden border transition-all active:scale-[0.98] text-left",
        isFirst 
          ? "border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
          : "border-zinc-800 hover:border-zinc-600"
      )}
      style={{ height: "110px" }}
    >
      {/* Banner as background */}
      {tile.banner && (
        <div className="absolute inset-0">
          <img
            src={tile.banner}
            alt=""
            className="w-full h-full object-cover scale-110"
          />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/30" />
        </div>
      )}
      
      {/* Content */}
      <div className="relative flex items-center gap-4 p-4 h-full">
        {/* Token Icon */}
        <div className="relative flex-shrink-0">
          <img
            src={tile.icon}
            alt={tile.symbol}
            className={cn(
              "w-16 h-16 rounded-full border-2",
              isFirst ? "border-white/70" : "border-zinc-700"
            )}
          />
          {!tile.isDonutEcosystem && (
            <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full w-5 h-5 flex items-center justify-center text-[10px] text-black font-bold">
              ↗
            </div>
          )}
        </div>
        
        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-xl" style={{ textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>{tile.symbol}</span>
            <span className="text-sm text-zinc-300">{tile.name}</span>
          </div>
          <p className="text-sm text-zinc-400 truncate mt-1">{tile.description}</p>
        </div>
      </div>
    </button>
  );
}

export default function SwapPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  
  // Main state
  const [selectedToken, setSelectedToken] = useState<TokenTile | null>(null);
  const [inputSymbol, setInputSymbol] = useState<InputSymbol>("ETH");
  const [inputAmount, setInputAmount] = useState("");
  const [slippage] = useState(1.0);
  const [showInputDropdown, setShowInputDropdown] = useState(false);
  const [context, setContext] = useState<{
    user?: {
      fid: number;
      username?: string;
      displayName?: string;
      pfpUrl?: string;
    };
  } | null>(null);
  
  // Transaction state
  const [txStep, setTxStep] = useState<"idle" | "approving" | "approving_leg2" | "transferring_fee" | "swapping_leg1" | "swapping_leg2" | "setting_approval" | "revoking_approval">("idle");
  const [swapResult, setSwapResult] = useState<"success" | "failure" | null>(null);
  const swapResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leg1Complete, setLeg1Complete] = useState(false);
  const [leg1ReceivedAmount, setLeg1ReceivedAmount] = useState<bigint>(0n); // Track DONUT received from leg1
  
  // Approval management state
  const [showApprovalSection, setShowApprovalSection] = useState(false);
  const [customApprovalAmount, setCustomApprovalAmount] = useState("");
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);
  const [showApprovalsPage, setShowApprovalsPage] = useState(false);
  const [customApprovalToken, setCustomApprovalToken] = useState<{ address: Address; symbol: string; decimals: number; router: Address; routerName: string } | null>(null);
  const [isSellingMode, setIsSellingMode] = useState(false); // false = buying token, true = selling token

  // Just use the regular token tiles (no infinite duplication)
  const displayItems = TOKEN_TILES;

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

  // Hydrate Farcaster context
  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = await (sdk as any).context;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => { cancelled = true; };
  }, []);

  // Auto-connect
  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (swapResultTimeoutRef.current) clearTimeout(swapResultTimeoutRef.current);
    };
  }, []);

  const inputToken: InputToken = INPUT_TOKENS[inputSymbol as InputSymbol];
  const route = selectedToken?.address ? getSwapRoute(inputSymbol as InputSymbol, selectedToken.address, isSellingMode) : null;

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

  const { data: sprinklesBalance, refetch: refetchSprinklesBalance } = useReadContract({
    address: SPRINKLES_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  // In selling mode, input is the selected token; in buying mode, input is ETH/DONUT
  const inputBalance = useMemo(() => {
    if (isSellingMode) {
      // Selling: input is the selected token
      if (selectedToken?.address?.toLowerCase() === DONUT_ADDRESS.toLowerCase()) {
        return donutBalance as bigint | undefined;
      }
      if (selectedToken?.address?.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase()) {
        return sprinklesBalance as bigint | undefined;
      }
      return undefined;
    }
    // Buying: input is ETH or DONUT
    return inputSymbol === "ETH" ? nativeEthBalance?.value : (donutBalance as bigint | undefined);
  }, [isSellingMode, selectedToken, inputSymbol, nativeEthBalance, donutBalance, sprinklesBalance]);

  const refetchInputBalance = useCallback(() => {
    if (isSellingMode) {
      if (selectedToken?.address?.toLowerCase() === DONUT_ADDRESS.toLowerCase()) {
        refetchDonutBalance();
      } else if (selectedToken?.address?.toLowerCase() === SPRINKLES_ADDRESS.toLowerCase()) {
        refetchSprinklesBalance();
      }
    } else {
      if (inputSymbol === "ETH") refetchNativeEthBalance();
      else refetchDonutBalance();
    }
  }, [isSellingMode, selectedToken, inputSymbol, refetchNativeEthBalance, refetchDonutBalance, refetchSprinklesBalance]);

  // Get the correct decimals for input in selling mode
  const effectiveInputDecimals = isSellingMode ? (selectedToken?.decimals ?? 18) : inputToken.decimals;

  // Calculate amounts
  const inputAmountWei = useMemo(() => {
    if (!inputAmount || inputAmount === "" || isNaN(parseFloat(inputAmount))) return 0n;
    try {
      const normalized = inputAmount.startsWith(".") ? `0${inputAmount}` : inputAmount;
      return parseUnits(normalized, effectiveInputDecimals);
    } catch {
      return 0n;
    }
  }, [inputAmount, effectiveInputDecimals]);

  const feeAmount = useMemo(() => {
    if (inputAmountWei === 0n) return 0n;
    return (inputAmountWei * BigInt(SWAP_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
  }, [inputAmountWei]);

  const amountToSwap = useMemo(() => inputAmountWei - feeAmount, [inputAmountWei, feeAmount]);

  // Get router for approval
  const routerForApproval: Address = useMemo(() => {
    if (!route) return UNISWAP_V2_ROUTER;
    if (route.dex === "multiHop") return route.leg1.router;
    if (route.dex === "multiHopSell") return route.leg1.router;
    if ("router" in route) return route.router;
    return UNISWAP_V2_ROUTER;
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

  // For multi-hop: check if DONUT needs approval for Aerodrome (leg2)
  const { data: donutAllowanceForAero, refetch: refetchDonutAllowanceForAero } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, AERODROME_ROUTER],
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  // Allowance queries for approval management popup
  const { data: donutAllowanceForV2, refetch: refetchDonutAllowanceForV2 } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, UNISWAP_V2_ROUTER],
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const { data: sprinklesAllowanceForAero, refetch: refetchSprinklesAllowanceForAero } = useReadContract({
    address: SPRINKLES_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, AERODROME_ROUTER],
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  // Helper to format allowance display
  const formatAllowance = (allowance: bigint | undefined, decimals: number) => {
    if (!allowance || allowance === 0n) return "0";
    const formatted = Number(formatUnits(allowance, decimals));
    if (formatted > 1e12) return "Unlimited";
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

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

  // Check if DONUT needs approval for Aerodrome (leg2 of multi-hop)
  const needsLeg2Approval = route?.dex === "multiHop" && (donutAllowanceForAero ?? 0n) < leg1Output;

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

  // Handle revoke approval for any token/router combo
  const handleRevokeTokenApproval = useCallback(async (tokenAddress: Address, routerAddress: Address) => {
    if (!address) return;
    
    try {
      setTxStep("revoking_approval");
      await writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, 0n],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Revoke error:", error);
      setTxStep("idle");
    }
  }, [address, writeContract]);

  // Handle set custom approval for any token/router combo
  const handleSetTokenApproval = useCallback(async () => {
    if (!address || !customApprovalToken || !customApprovalAmount) return;
    
    try {
      setTxStep("setting_approval");
      const approvalAmountWei = parseUnits(customApprovalAmount, customApprovalToken.decimals);
      await writeContract({
        address: customApprovalToken.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [customApprovalToken.router, approvalAmountWei],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Approval error:", error);
      setTxStep("idle");
    }
  }, [address, customApprovalToken, customApprovalAmount, writeContract]);

  // Refetch all allowances
  const refetchAllAllowances = useCallback(() => {
    refetchDonutAllowanceForAero();
    refetchDonutAllowanceForV2();
    refetchSprinklesAllowanceForAero();
    refetchAllowance();
  }, [refetchDonutAllowanceForAero, refetchDonutAllowanceForV2, refetchSprinklesAllowanceForAero, refetchAllowance]);

  // Handle flip swap direction (selling not yet implemented)
  const handleFlipDirection = () => {
    // For now, just toggle the visual - full sell implementation coming later
    setIsSellingMode(!isSellingMode);
    setInputAmount("");
  };

  // Handle tile click
  const handleTileClick = async (tile: TokenTile) => {
    if (tile.isPlaceholder) return;
    
    if (tile.isDonutEcosystem) {
      setSelectedToken(tile);
      setInputSymbol(tile.allowedInputs?.[0] ?? "ETH");
      setInputAmount("");
      setTxStep("idle");
    } else if (tile.address) {
      // Open native Farcaster token page using the correct format
      try {
        await sdk.actions.viewToken({ token: `eip155:8453/erc20:${tile.address}` });
      } catch (error) {
        console.error("Failed to open token:", error);
      }
    }
  };

  // Handle back button
  const handleBack = () => {
    setSelectedToken(null);
    setInputAmount("");
    setTxStep("idle");
    setLeg1Complete(false);
    setLeg1ReceivedAmount(0n);
    setShowInputDropdown(false);
    setShowApprovalSection(false);
    setCustomApprovalAmount("");
    setShowApprovalPopup(false);
    setIsSellingMode(false);
    resetTx();
  };

  // Handle swap
  const handleSwap = useCallback(async () => {
    if (!address || !selectedToken || !route || amountToSwap === 0n) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    try {
      // Step 1: Approve input token if needed (for non-ETH inputs)
      // IMPORTANT: Only approve the exact amount needed, never max/unlimited
      if (needsApproval && txStep === "idle") {
        setTxStep("approving");
        await writeContract({
          address: inputToken.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [routerForApproval, inputAmountWei], // Exact amount only!
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

      // Step 3: Execute swap (single-hop or first leg of multi-hop)
      if (txStep === "transferring_fee") {
        if (route.dex === "uniswapV2") {
          setTxStep("swapping_leg1");
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
          setTxStep("swapping_leg1");
          await writeContract({
            address: AERODROME_ROUTER,
            abi: AERODROME_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountToSwap, minOutputAmount, route.routes, address, deadline],
            chainId: base.id,
          });
        } else if (route.dex === "multiHop") {
          // Multi-hop leg 1: ETH -> DONUT via Uniswap V2
          setTxStep("swapping_leg1");
          // Calculate min output for leg1 with slippage
          const leg1MinOutput = leg1Output - (leg1Output * BigInt(Math.round(slippage * 100))) / 10000n;
          await writeContract({
            address: UNISWAP_V2_ROUTER,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [leg1MinOutput, route.leg1.path, address, deadline],
            value: amountToSwap,
            chainId: base.id,
          });
        }
        return;
      }

      // Step 4 (multi-hop only): Approve DONUT for Aerodrome if needed, then swap
      if (txStep === "approving_leg2" && route.dex === "multiHop") {
        // Check current allowance
        const currentAllowance = donutAllowanceForAero as bigint ?? 0n;
        const donutToSwap = donutBalance as bigint ?? 0n;
        
        if (currentAllowance < donutToSwap && donutToSwap > 0n) {
          // Need approval first - approve exact amount only!
          await writeContract({
            address: DONUT_ADDRESS,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [AERODROME_ROUTER, donutToSwap], // Exact amount only!
            chainId: base.id,
          });
          return;
        }
        
        // Already approved or no DONUT - proceed to swap
        if (!donutToSwap || donutToSwap === 0n) {
          throw new Error("No DONUT balance for leg2");
        }
        
        // Execute leg2 swap directly
        setTxStep("swapping_leg2");
        await writeContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [donutToSwap, minOutputAmount, route.leg2.routes, address, deadline],
          chainId: base.id,
        });
        return;
      }

      // Step 5 (multi-hop only): Execute leg 2 if we get here after approval
      if (txStep === "swapping_leg2" && route.dex === "multiHop") {
        // Get current DONUT balance to swap
        const donutToSwap = donutBalance as bigint;
        if (!donutToSwap || donutToSwap === 0n) {
          throw new Error("No DONUT balance for leg2");
        }
        await writeContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [donutToSwap, minOutputAmount, route.leg2.routes, address, deadline],
          chainId: base.id,
        });
        return;
      }
    } catch (error) {
      console.error("Swap error:", error);
      showSwapResultFn("failure");
      setTxStep("idle");
      setLeg1Complete(false);
      resetTx();
    }
  }, [
    address, selectedToken, route, amountToSwap, inputAmountWei, needsApproval, txStep,
    inputToken, feeAmount, minOutputAmount, routerForApproval, leg1Output, donutBalance, donutAllowanceForAero, slippage,
    writeContract, sendTransaction, showSwapResultFn, resetTx
  ]);

  // Handle transaction receipts
  useEffect(() => {
    if (!receipt) return;

    if (receipt.status === "reverted") {
      showSwapResultFn("failure");
      setTxStep("idle");
      setLeg1Complete(false);
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
        console.log("Fee transfer complete, executing swap...");
        resetTx();
        // Don't call handleSwap directly - it checks txStep === "transferring_fee"
        // Instead, execute the swap directly here
        
        const executeSwap = async () => {
          if (!address || !route) {
            showSwapResultFn("failure");
            setTxStep("idle");
            return;
          }
          
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          
          try {
            if (route.dex === "uniswapV2") {
              setTxStep("swapping_leg1");
              if (inputToken.isNative) {
                writeContract({
                  address: UNISWAP_V2_ROUTER,
                  abi: UNISWAP_V2_ROUTER_ABI,
                  functionName: "swapExactETHForTokens",
                  args: [minOutputAmount, route.path, address, deadline],
                  value: amountToSwap,
                  chainId: base.id,
                });
              } else {
                writeContract({
                  address: UNISWAP_V2_ROUTER,
                  abi: UNISWAP_V2_ROUTER_ABI,
                  functionName: "swapExactTokensForTokens",
                  args: [amountToSwap, minOutputAmount, route.path, address, deadline],
                  chainId: base.id,
                });
              }
            } else if (route.dex === "aerodrome") {
              setTxStep("swapping_leg1");
              writeContract({
                address: AERODROME_ROUTER,
                abi: AERODROME_ROUTER_ABI,
                functionName: "swapExactTokensForTokens",
                args: [amountToSwap, minOutputAmount, route.routes, address, deadline],
                chainId: base.id,
              });
            } else if (route.dex === "multiHop") {
              setTxStep("swapping_leg1");
              const leg1MinOutput = leg1Output - (leg1Output * BigInt(Math.round(slippage * 100))) / 10000n;
              writeContract({
                address: UNISWAP_V2_ROUTER,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "swapExactETHForTokens",
                args: [leg1MinOutput, route.leg1.path, address, deadline],
                value: amountToSwap,
                chainId: base.id,
              });
            }
          } catch (error) {
            console.error("Swap error:", error);
            showSwapResultFn("failure");
            setTxStep("idle");
          }
        };
        
        setTimeout(executeSwap, 500);
        return;
      }

      if (txStep === "swapping_leg1") {
        // For single-hop swaps, we're done
        if (route?.dex !== "multiHop") {
          showSwapResultFn("success");
          setTxStep("idle");
          setInputAmount("");
          refetchInputBalance();
          resetTx();
          return;
        }
        // For multi-hop, execute leg2 directly
        console.log("Leg1 complete, starting leg2...");
        resetTx();
        
        // Capture current values for closure
        const currentAddress = address;
        const currentRoute = route;
        
        // Get the DONUT balance BEFORE we knew it (use the expected leg1Output)
        // We'll swap exactly what leg1 was supposed to give us
        const amountToSwapInLeg2 = leg1Output;
        
        // Execute leg2 directly here
        const executeLeg2 = async () => {
          if (!currentAddress || !currentRoute || currentRoute.dex !== "multiHop") {
            console.error("Missing address or route for leg2");
            showSwapResultFn("failure");
            setTxStep("idle");
            return;
          }
          
          if (amountToSwapInLeg2 === 0n) {
            console.error("No amount to swap in leg2");
            showSwapResultFn("failure");
            setTxStep("idle");
            return;
          }
          
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          
          try {
            // Refetch allowance to check if approval needed
            const allowanceResult = await refetchDonutAllowanceForAero();
            const currentAllowance = allowanceResult.data as bigint ?? 0n;
            
            console.log("Leg2 - Amount to swap:", amountToSwapInLeg2.toString());
            console.log("Leg2 - DONUT allowance:", currentAllowance.toString());
            
            // Check if approval needed for the amount we want to swap
            if (currentAllowance < amountToSwapInLeg2) {
              console.log("Leg2 - Approving DONUT for Aerodrome...");
              setTxStep("approving_leg2");
              setLeg1ReceivedAmount(amountToSwapInLeg2); // Store for after approval
              writeContract({
                address: DONUT_ADDRESS,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [AERODROME_ROUTER, amountToSwapInLeg2], // Exact amount only!
                chainId: base.id,
              });
              return;
            }
            
            // Execute leg2 swap with only the amount from leg1
            console.log("Leg2 - Swapping DONUT to SPRINKLES...");
            setTxStep("swapping_leg2");
            writeContract({
              address: AERODROME_ROUTER,
              abi: AERODROME_ROUTER_ABI,
              functionName: "swapExactTokensForTokens",
              args: [amountToSwapInLeg2, minOutputAmount, currentRoute.leg2.routes, currentAddress, deadline],
              chainId: base.id,
            });
          } catch (error) {
            console.error("Leg2 error:", error);
            showSwapResultFn("failure");
            setTxStep("idle");
            resetTx();
          }
        };
        
        setTimeout(executeLeg2, 1000);
        return;
      }

      if (txStep === "approving_leg2") {
        // Approval completed, now do the swap
        console.log("DONUT approval complete, executing leg2 swap...");
        resetTx();
        
        // Capture values for closure
        const currentAddress = address;
        const currentRoute = route;
        const amountToSwap = leg1ReceivedAmount; // Use the stored amount from leg1
        
        // Execute the swap directly
        const executeLeg2Swap = async () => {
          if (!currentAddress || !currentRoute || currentRoute.dex !== "multiHop") return;
          
          if (amountToSwap === 0n) {
            console.error("No stored amount for leg2 swap");
            showSwapResultFn("failure");
            setTxStep("idle");
            setLeg1Complete(false);
            setLeg1ReceivedAmount(0n);
            return;
          }
          
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
          
          console.log("Leg2 - Swapping", amountToSwap.toString(), "DONUT to SPRINKLES...");
          setTxStep("swapping_leg2");
          writeContract({
            address: AERODROME_ROUTER,
            abi: AERODROME_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountToSwap, minOutputAmount, currentRoute.leg2.routes, currentAddress, deadline],
            chainId: base.id,
          });
        };
        
        setTimeout(executeLeg2Swap, 500);
        return;
      }

      if (txStep === "swapping_leg2") {
        showSwapResultFn("success");
        setTxStep("idle");
        setLeg1Complete(false);
        setLeg1ReceivedAmount(0n);
        setInputAmount("");
        refetchInputBalance();
        refetchDonutBalance();
        resetTx();
        return;
      }

      if (txStep === "setting_approval" || txStep === "revoking_approval") {
        setTxStep("idle");
        setCustomApprovalAmount("");
        setCustomApprovalToken(null);
        refetchAllAllowances();
        resetTx();
        return;
      }
    }
  }, [receipt, txStep, route, address, minOutputAmount, amountToSwap, leg1Output, leg1ReceivedAmount, slippage, inputToken, showSwapResultFn, resetTx, refetchAllowance, refetchInputBalance, refetchDonutBalance, refetchDonutAllowanceForAero, refetchAllAllowances, writeContract]);

  const isSwapDisabled =
    !isConnected ||
    amountToSwap === 0n ||
    outputAmount === 0n ||
    (inputBalance !== undefined && inputAmountWei > inputBalance) ||
    txStep !== "idle" ||
    isWriting ||
    isSending ||
    isConfirming ||
    isSellingMode; // Selling not fully implemented yet

  const buttonText = useMemo(() => {
    if (!isConnected) return "Connect Wallet";
    if (isSellingMode) return "Selling Coming Soon";
    if (isWriting || isSending || isConfirming) {
      if (txStep === "approving") return "Approving...";
      if (txStep === "approving_leg2") return "Approving DONUT...";
      if (txStep === "transferring_fee") return "Transferring Fee...";
      if (txStep === "swapping_leg1") return route?.dex === "multiHop" ? "Swapping to DONUT..." : "Swapping...";
      if (txStep === "swapping_leg2") return "Swapping to SPRINKLES...";
      return "Processing...";
    }
    if (swapResult === "success") return "Success!";
    if (swapResult === "failure") return "Failed - Try Again";
    if (inputBalance !== undefined && inputAmountWei > inputBalance) return "Insufficient Balance";
    if (amountToSwap === 0n) return "Enter Amount";
    if (needsApproval) return "Approve & Swap";
    return "Swap";
  }, [isConnected, isSellingMode, isWriting, isSending, isConfirming, txStep, route, swapResult, inputBalance, inputAmountWei, amountToSwap, needsApproval]);

  // Available input tokens for selected token
  const availableInputs: InputSymbol[] = selectedToken?.allowedInputs ?? ["ETH"];

  // RENDER: Approvals Page
  if (showApprovalsPage) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowApprovalsPage(false);
                    setCustomApprovalToken(null);
                    setCustomApprovalAmount("");
                  }}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex items-center gap-2">
                  <Shield className="w-6 h-6 text-amber-500" />
                  <h1 className="text-2xl font-bold tracking-wide">APPROVALS</h1>
                </div>
              </div>
            </div>

            <p className="text-sm text-zinc-500 px-2 mb-4">
              Manage token approvals for DEX routers. Revoke unused approvals to protect your funds.
            </p>

            {/* Approvals List */}
            <div className="flex-1 overflow-y-auto px-2 space-y-3">
              {/* DONUT Approvals */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <img src={getDexScreenerIcon(DONUT_ADDRESS)} alt="DONUT" className="w-10 h-10 rounded-full border border-amber-500/50" />
                  <div>
                    <div className="font-bold text-lg text-amber-400">DONUT</div>
                    <div className="text-[10px] text-gray-400 uppercase">Token Approvals</div>
                  </div>
                </div>
                
                {/* DONUT -> Uniswap V2 */}
                <div className="flex items-center justify-between py-3 border-t border-amber-500/30">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400">Uniswap V2 Router</div>
                    <div className="text-base font-bold text-white">{formatAllowance(donutAllowanceForV2 as bigint, 18)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCustomApprovalToken({ 
                        address: DONUT_ADDRESS, 
                        symbol: "DONUT", 
                        decimals: 18, 
                        router: UNISWAP_V2_ROUTER,
                        routerName: "Uniswap V2"
                      })}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Set
                    </button>
                    {(donutAllowanceForV2 as bigint ?? 0n) > 0n && (
                      <button
                        onClick={() => handleRevokeTokenApproval(DONUT_ADDRESS, UNISWAP_V2_ROUTER)}
                        disabled={txStep !== "idle" || isWriting || isConfirming}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 border border-red-600/50 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                      >
                        {txStep === "revoking_approval" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* DONUT -> Aerodrome */}
                <div className="flex items-center justify-between py-3 border-t border-amber-500/30">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400">Aerodrome Router</div>
                    <div className="text-base font-bold text-white">{formatAllowance(donutAllowanceForAero as bigint, 18)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCustomApprovalToken({ 
                        address: DONUT_ADDRESS, 
                        symbol: "DONUT", 
                        decimals: 18, 
                        router: AERODROME_ROUTER,
                        routerName: "Aerodrome"
                      })}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Set
                    </button>
                    {(donutAllowanceForAero as bigint ?? 0n) > 0n && (
                      <button
                        onClick={() => handleRevokeTokenApproval(DONUT_ADDRESS, AERODROME_ROUTER)}
                        disabled={txStep !== "idle" || isWriting || isConfirming}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 border border-red-600/50 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                      >
                        {txStep === "revoking_approval" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SPRINKLES Approvals */}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <img src={getDexScreenerIcon(SPRINKLES_ADDRESS)} alt="SPRINKLES" className="w-10 h-10 rounded-full border border-amber-500/50" />
                  <div>
                    <div className="font-bold text-lg text-amber-400">SPRINKLES</div>
                    <div className="text-[10px] text-gray-400 uppercase">Token Approvals</div>
                  </div>
                </div>
                
                {/* SPRINKLES -> Aerodrome */}
                <div className="flex items-center justify-between py-3 border-t border-amber-500/30">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400">Aerodrome Router</div>
                    <div className="text-base font-bold text-white">{formatAllowance(sprinklesAllowanceForAero as bigint, 18)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCustomApprovalToken({ 
                        address: SPRINKLES_ADDRESS, 
                        symbol: "SPRINKLES", 
                        decimals: 18, 
                        router: AERODROME_ROUTER,
                        routerName: "Aerodrome"
                      })}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Set
                    </button>
                    {(sprinklesAllowanceForAero as bigint ?? 0n) > 0n && (
                      <button
                        onClick={() => handleRevokeTokenApproval(SPRINKLES_ADDRESS, AERODROME_ROUTER)}
                        disabled={txStep !== "idle" || isWriting || isConfirming}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 border border-red-600/50 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                      >
                        {txStep === "revoking_approval" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Set Custom Approval Modal */}
        {customApprovalToken && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="w-[90%] max-w-[400px] bg-zinc-900 rounded-2xl border border-zinc-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Set {customApprovalToken.symbol} Approval</h3>
                <button
                  onClick={() => {
                    setCustomApprovalToken(null);
                    setCustomApprovalAmount("");
                  }}
                  className="p-1 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              
              <p className="text-sm text-zinc-500 mb-4">
                Set approval amount for {customApprovalToken.routerName}
              </p>
              
              <div className="space-y-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter amount"
                  value={customApprovalAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                      setCustomApprovalAmount(val);
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                
                <button
                  onClick={handleSetTokenApproval}
                  disabled={!customApprovalAmount || txStep !== "idle" || isWriting || isConfirming}
                  className={cn(
                    "w-full py-3 rounded-xl text-lg font-semibold transition-all",
                    !customApprovalAmount || txStep !== "idle" || isWriting || isConfirming
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-500"
                  )}
                >
                  {txStep === "setting_approval" ? (
                    <Loader2 className="w-5 h-5 inline mr-2 animate-spin" />
                  ) : null}
                  {txStep === "setting_approval" ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          </div>
        )}

        <NavBar />
      </main>
    );
  }

  // RENDER: Token Grid View
  if (!selectedToken) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header matching home page */}
            <div className="flex items-center justify-between mb-3 px-2">
              <h1 className="text-2xl font-bold tracking-wide">SWAP</h1>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <div className="h-8 w-8 rounded-full border border-zinc-800 overflow-hidden">
                    {context.user.pfpUrl ? (
                      <img src={context.user.pfpUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-xs font-bold">
                        {(context.user.displayName || context.user.username || "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{context.user.displayName || context.user.username || "User"}</div>
                    {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
                  </div>
                </div>
              )}
            </div>

            <p className="text-zinc-500 text-xs mb-3 px-2">Select a token to swap into</p>

            {/* Scrollable token list */}
            <div className="flex-1 overflow-hidden relative">
              {/* Top fade */}
              <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
              
              {/* Bottom fade */}
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
              
              {/* Scrollable list - hidden scrollbar */}
              <div 
                className="h-full overflow-y-auto px-2 py-2 space-y-3 scrollbar-hide"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {displayItems.map((tile, index) => (
                  <TokenTileCard
                    key={tile.id}
                    tile={tile}
                    onClick={() => handleTileClick(tile)}
                    onApprovalsClick={() => setShowApprovalsPage(true)}
                    isFirst={index === 0}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <NavBar />
      </main>
    );
  }

  // RENDER: Swap UI View
  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header with back button */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-2xl font-bold tracking-wide">{isSellingMode ? "SELL" : "BUY"} {selectedToken.symbol}</h1>
            </div>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <div className="h-8 w-8 rounded-full border border-zinc-800 overflow-hidden">
                  {context.user.pfpUrl ? (
                    <img src={context.user.pfpUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-xs font-bold">
                      {(context.user.displayName || context.user.username || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{context.user.displayName || context.user.username || "User"}</div>
                  {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Token info row */}
          <div className="flex items-center gap-3 mb-4 px-2">
            <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-12 h-12 rounded-full border border-zinc-700" />
            <div className="flex-1">
              <p className="text-sm text-zinc-400">{selectedToken.description}</p>
            </div>
          </div>

          {/* Swap Card */}
          <div className="flex-1 overflow-y-auto px-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              {/* Input Section */}
              <div className="rounded-xl bg-zinc-900 p-4 mb-2">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-zinc-500">You Pay</span>
                  <span className="text-sm text-zinc-500">
                    Balance: {inputBalance !== undefined 
                      ? Number(formatUnits(inputBalance as bigint, effectiveInputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })
                      : "0"
                    }
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Token display - changes based on mode */}
                  {isSellingMode ? (
                    // Selling: input is the selected token (fixed)
                    <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 min-w-[120px]">
                      <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" />
                      <span className="font-semibold">{selectedToken.symbol}</span>
                    </div>
                  ) : (
                    // Buying: input token dropdown
                    <div className="relative">
                      <button
                        onClick={() => availableInputs.length > 1 && !isSellingMode && setShowInputDropdown(!showInputDropdown)}
                        className={cn(
                          "flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 min-w-[120px]",
                          availableInputs.length > 1 && !isSellingMode && "hover:bg-zinc-700 cursor-pointer"
                        )}
                      >
                        <img src={inputToken.icon} alt={inputToken.symbol} className="w-6 h-6 rounded-full" />
                        <span className="font-semibold">{inputToken.symbol}</span>
                        {availableInputs.length > 1 && !isSellingMode && (
                          <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform", showInputDropdown && "rotate-180")} />
                        )}
                      </button>
                      
                      {/* Dropdown */}
                      {showInputDropdown && availableInputs.length > 1 && !isSellingMode && (
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
                  )}
                  
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

          {/* Arrow - Click to flip */}
          <div className="flex justify-center -my-1 relative z-10">
            <button 
              onClick={handleFlipDirection}
              className="bg-zinc-800 rounded-full p-2 border-4 border-zinc-950 hover:bg-zinc-700 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Output Section */}
          <div className="rounded-xl bg-zinc-900 p-4 mt-2">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-zinc-500">You Receive</span>
            </div>
            
            <div className="flex items-center gap-3">
              {isSellingMode ? (
                // Selling: output is ETH/DONUT (can select)
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
              ) : (
                // Buying: output is the selected token (fixed)
                <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 min-w-[120px]">
                  <img src={selectedToken.icon} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" />
                  <span className="font-semibold">{selectedToken.symbol}</span>
                </div>
              )}
              
              <div className="flex-1 text-right text-2xl font-bold text-zinc-300 min-w-0 truncate">
                {isSellingMode && !route ? "Coming Soon" : outputAmountDisplay}
              </div>
            </div>
          </div>

          {/* Fee Info */}
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>Fee (0.1%)</span>
              <span>{feeAmount > 0n ? Number(formatUnits(feeAmount, effectiveInputDecimals)).toFixed(6) : "0"} {isSellingMode ? selectedToken.symbol : inputToken.symbol}</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>Route</span>
              <span>
                {route?.dex === "uniswapV2" && "Uniswap V2"}
                {route?.dex === "aerodrome" && "Aerodrome"}
                {route?.dex === "multiHop" && "V2 → Aerodrome"}
                {route?.dex === "multiHopSell" && "Aerodrome → V2"}
                {isSellingMode && !route && "—"}
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
            {(isWriting || isSending || isConfirming) && txStep !== "setting_approval" && txStep !== "revoking_approval" && (
              <Loader2 className="w-5 h-5 inline mr-2 animate-spin" />
            )}
            {buttonText}
          </button>
            </div>
          </div>
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