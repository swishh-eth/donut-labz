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
import { ArrowLeft, Flame, Sparkles } from "lucide-react";
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

const DEADLINE_BUFFER_SECONDS = 5 * 60;
const LP_TOKEN_ADDRESS = "0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703" as Address;

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
] as const;

const toBigInt = (value: bigint | number) =>
  typeof value === "bigint" ? value : BigInt(value);

const formatEth = (value: bigint, maximumFractionDigits = 4) => {
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
  const [blazeResult, setBlazeResult] = useState<"success" | "failure" | null>(null);
  const [txStep, setTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const blazeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

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

  const resetBlazeResult = useCallback(() => {
    if (blazeResultTimeoutRef.current) {
      clearTimeout(blazeResultTimeoutRef.current);
      blazeResultTimeoutRef.current = null;
    }
    setBlazeResult(null);
  }, []);

  const showBlazeResult = useCallback((result: "success" | "failure") => {
    if (blazeResultTimeoutRef.current) {
      clearTimeout(blazeResultTimeoutRef.current);
    }
    setBlazeResult(result);
    blazeResultTimeoutRef.current = setTimeout(() => {
      setBlazeResult(null);
      blazeResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
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

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (blazeResultTimeoutRef.current) {
        clearTimeout(blazeResultTimeoutRef.current);
      }
    };
  }, []);

  // Read auction state
  const { data: rawAuctionState, refetch: refetchAuctionState } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall,
    abi: MULTICALL_ABI,
    functionName: "getAuction",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: {
      refetchInterval: 3_000,
    },
  });

  const auctionState = useMemo(() => {
    if (!rawAuctionState) return undefined;
    return rawAuctionState as unknown as AuctionState;
  }, [rawAuctionState]);

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

  const handleBlaze = useCallback(async () => {
    if (!auctionState) return;
    resetBlazeResult();
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) {
          throw new Error("Wallet connector not available yet.");
        }
        const result = await connectAsync({
          connector: primaryConnector,
          chainId: base.id,
        });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) {
        throw new Error("Unable to determine wallet address.");
      }

      const price = auctionState.price;
      const epochId = toBigInt(auctionState.epochId);
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
      );
      const maxPaymentTokenAmount = price;

      if (txStep === "idle") {
        setTxStep("approving");
        await writeContract({
          account: targetAddress as Address,
          address: LP_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACT_ADDRESSES.multicall as Address, price],
          chainId: base.id,
        });
        return;
      }

      if (txStep === "buying") {
        await writeContract({
          account: targetAddress as Address,
          address: CONTRACT_ADDRESSES.multicall as Address,
          abi: MULTICALL_ABI,
          functionName: "buy",
          args: [epochId, deadline, maxPaymentTokenAmount],
          chainId: base.id,
        });
      }
    } catch (error) {
      console.error("Failed to blaze:", error);
      showBlazeResult("failure");
      setTxStep("idle");
      resetWrite();
    }
  }, [
    address,
    connectAsync,
    auctionState,
    primaryConnector,
    resetBlazeResult,
    resetWrite,
    showBlazeResult,
    writeContract,
    txStep,
  ]);

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === "success" || receipt.status === "reverted") {
      if (receipt.status === "reverted") {
        showBlazeResult("failure");
        setTxStep("idle");
        refetchAuctionState();
        const resetTimer = setTimeout(() => {
          resetWrite();
        }, 500);
        return () => clearTimeout(resetTimer);
      }

      if (txStep === "approving") {
        resetWrite();
        setTxStep("buying");
        return;
      }

      if (txStep === "buying") {
        showBlazeResult("success");
        setTxStep("idle");
        refetchAuctionState();
        const resetTimer = setTimeout(() => {
          resetWrite();
        }, 500);
        return () => clearTimeout(resetTimer);
      }
    }
    return;
  }, [receipt, refetchAuctionState, resetWrite, showBlazeResult, txStep]);

  useEffect(() => {
    if (txStep === "buying" && !isWriting && !isConfirming && !txHash) {
      handleBlaze();
    }
  }, [txStep, isWriting, isConfirming, txHash, handleBlaze]);

  const auctionPriceDisplay = auctionState
    ? formatEth(auctionState.price, auctionState.price === 0n ? 0 : 5)
    : "—";

  const claimableDisplay = auctionState
    ? formatEth(auctionState.wethAccumulated, 8)
    : "—";

  const buttonLabel = useMemo(() => {
    if (!auctionState) return "Loading…";
    if (blazeResult === "success") return "SUCCESS";
    if (blazeResult === "failure") return "FAILED";
    if (isWriting || isConfirming) {
      if (txStep === "approving") return "APPROVING…";
      if (txStep === "buying") return "BURNING…";
      return "PROCESSING…";
    }
    return "BURN";
  }, [blazeResult, isConfirming, isWriting, auctionState, txStep]);

  const hasInsufficientLP = auctionState && auctionState.paymentTokenBalance < auctionState.price;

  const blazeProfitLoss = useMemo(() => {
    if (!auctionState) return null;

    const lpValueInEth = Number(formatEther(auctionState.price)) * Number(formatEther(auctionState.paymentTokenPrice));
    const lpValueInUsd = lpValueInEth * ethUsdPrice;

    const wethReceivedInEth = Number(formatEther(auctionState.wethAccumulated));
    const wethValueInUsd = wethReceivedInEth * ethUsdPrice;

    const profitLoss = wethValueInUsd - lpValueInUsd;
    const isProfitable = profitLoss > 0;

    return {
      profitLoss,
      isProfitable,
      lpValueInUsd,
      wethValueInUsd,
    };
  }, [auctionState, ethUsdPrice]);

  const isBlazeDisabled =
    !auctionState || isWriting || isConfirming || blazeResult !== null || hasInsufficientLP;

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/")}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
                <Flame className="w-6 h-6 text-amber-400" />
                BURN
              </h1>
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
          </div>

          {/* Two Section Layout */}
          <div className="flex-1 flex flex-col gap-3">
            {/* SPRINKLES Section - Coming Soon */}
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col items-center justify-center">
              <Sparkles className="w-10 h-10 text-gray-500 mb-2" />
              <h2 className="text-lg font-bold text-gray-400 mb-1">SPRINKLES Burn</h2>
              <p className="text-xs text-gray-500 text-center">Coming Soon</p>
            </div>

            {/* DONUT LP Burn Section */}
            <div className="flex-1 rounded-xl border border-amber-500/30 bg-zinc-900 p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🍩</span>
                <h2 className="text-lg font-bold text-amber-400">DONUT LP Burn</h2>
              </div>

              {/* Pay / Get Cards */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg border border-amber-500/50 bg-black p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    PAY
                  </div>
                  <div className="text-lg font-semibold text-amber-400">
                    {auctionPriceDisplay} LP
                  </div>
                  <div className="text-[10px] text-gray-400">
                    ${auctionState
                      ? (
                          Number(formatEther(auctionState.price)) *
                          Number(formatEther(auctionState.paymentTokenPrice)) *
                          ethUsdPrice
                        ).toFixed(2)
                      : "0.00"}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-700 bg-black p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    GET
                  </div>
                  <div className="text-lg font-semibold text-white">
                    Ξ{claimableDisplay}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    ${auctionState
                      ? (Number(formatEther(auctionState.wethAccumulated)) * ethUsdPrice).toFixed(2)
                      : "0.00"}
                  </div>
                </div>
              </div>

              {/* Profit/Loss Indicator */}
              {blazeProfitLoss && (
                <div className={cn(
                  "text-center text-[10px] font-semibold px-2 py-1 rounded mb-2",
                  blazeProfitLoss.isProfitable ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                )}>
                  {blazeProfitLoss.isProfitable ? "💰 " : "⚠️ "}
                  {blazeProfitLoss.isProfitable ? "+" : ""}${blazeProfitLoss.profitLoss.toFixed(2)}
                </div>
              )}

              {/* Burn Button */}
              <button
                onClick={handleBlaze}
                disabled={isBlazeDisabled}
                className={cn(
                  "w-full rounded-xl py-3 text-base font-bold transition-all duration-300",
                  blazeResult === "success"
                    ? "bg-green-500 text-white"
                    : blazeResult === "failure"
                      ? "bg-red-500 text-white"
                      : isBlazeDisabled
                        ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                )}
              >
                {buttonLabel}
              </button>

              {/* LP Balance & Get LP Link */}
              <div className="flex items-center justify-between mt-2 px-1">
                <div className="text-[10px] text-gray-400">
                  Balance:{" "}
                  <span className="text-white font-semibold">
                    {address && auctionState?.paymentTokenBalance
                      ? formatEth(auctionState.paymentTokenBalance, 4)
                      : "0"}
                  </span>{" "}
                  LP
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