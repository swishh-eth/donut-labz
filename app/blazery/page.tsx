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
import { formatEther, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { cn, getEthPrice } from "@/lib/utils";
import { NavBar } from "@/components/nav-bar";
import { Flame, Coins, ArrowRight, HelpCircle, X } from "lucide-react";

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

export default function BlazeryPage() {
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [blazeResult, setBlazeResult] = useState<"success" | "failure" | null>(null);
  const [txStep, setTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const blazeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetBlazeResult = useCallback(() => {
    if (blazeResultTimeoutRef.current) {
      clearTimeout(blazeResultTimeoutRef.current);
      blazeResultTimeoutRef.current = null;
    }
    setBlazeResult(null);
  }, []);

  const showBlazeResultFn = useCallback((result: "success" | "failure") => {
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

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

  const { data: rawAuctionState, refetch: refetchAuctionState } =
    useReadContract({
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

  useEffect(() => {
    if (!readyRef.current && auctionState) {
      readyRef.current = true;
      sdk.actions.ready().catch(() => {});
    }
  }, [auctionState]);

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isConfirming } =
    useWaitForTransactionReceipt({
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
      showBlazeResultFn("failure");
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
    showBlazeResultFn,
    writeContract,
    txStep,
  ]);

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === "success" || receipt.status === "reverted") {
      if (receipt.status === "reverted") {
        showBlazeResultFn("failure");
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
        showBlazeResultFn("success");
        setTxStep("idle");
        refetchAuctionState();
        const resetTimer = setTimeout(() => {
          resetWrite();
        }, 500);
        return () => clearTimeout(resetTimer);
      }
    }
    return;
  }, [receipt, refetchAuctionState, resetWrite, showBlazeResultFn, txStep]);

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
    if (blazeResult === "failure") return "FAILURE";
    if (isWriting || isConfirming) {
      if (txStep === "approving") return "APPROVING…";
      if (txStep === "buying") return "BURNING…";
      return "PROCESSING…";
    }
    return "BURN";
  }, [blazeResult, isConfirming, isWriting, auctionState, txStep]);

  const hasInsufficientLP =
    auctionState && auctionState.paymentTokenBalance < auctionState.price;

  const blazeProfitLoss = useMemo(() => {
    if (!auctionState) return null;

    const lpValueInEth =
      Number(formatEther(auctionState.price)) *
      Number(formatEther(auctionState.paymentTokenPrice));
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
    !auctionState ||
    isWriting ||
    isConfirming ||
    blazeResult !== null ||
    hasInsufficientLP;

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const lpLink = "https://app.uniswap.org/explore/pools/base/0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703";

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      {/* Rising Flames CSS */}
      <style jsx global>{`
        @keyframes rise-flame {
          0% { 
            transform: translateY(0) rotate(0deg); 
          }
          100% { 
            transform: translateY(-400px) rotate(10deg); 
          }
        }
        .rising-flame {
          animation: rise-flame 8s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(255,255,255,0.8));
        }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Rising Flames from bottom */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Flame className="absolute bottom-16 left-[5%] w-6 h-6 text-white/20 rising-flame" style={{ animationDelay: '0s', animationDuration: '7s' }} />
          <Flame className="absolute bottom-20 left-[15%] w-7 h-7 text-white/15 rising-flame" style={{ animationDelay: '1s', animationDuration: '9s' }} />
          <Flame className="absolute bottom-12 left-[25%] w-5 h-5 text-white/20 rising-flame" style={{ animationDelay: '2s', animationDuration: '6s' }} />
          <Flame className="absolute bottom-24 left-[35%] w-8 h-8 text-white/15 rising-flame" style={{ animationDelay: '0.5s', animationDuration: '8s' }} />
          <Flame className="absolute bottom-16 left-[48%] w-6 h-6 text-white/20 rising-flame" style={{ animationDelay: '3s', animationDuration: '7.5s' }} />
          <Flame className="absolute bottom-20 left-[60%] w-7 h-7 text-white/15 rising-flame" style={{ animationDelay: '1.5s', animationDuration: '8.5s' }} />
          <Flame className="absolute bottom-12 left-[72%] w-5 h-5 text-white/20 rising-flame" style={{ animationDelay: '2.5s', animationDuration: '6.5s' }} />
          <Flame className="absolute bottom-24 left-[82%] w-8 h-8 text-white/15 rising-flame" style={{ animationDelay: '0.8s', animationDuration: '9.5s' }} />
          <Flame className="absolute bottom-16 left-[92%] w-6 h-6 text-white/20 rising-flame" style={{ animationDelay: '4s', animationDuration: '7s' }} />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">BURN</h1>
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

          {/* Pay / Get Cards */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-4 h-4 text-white" />
                <span className="text-xs text-gray-400 uppercase">Pay</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {auctionPriceDisplay}
              </div>
              <div className="text-xs text-gray-400">
                LP ($
                {auctionState
                  ? (
                      Number(formatEther(auctionState.price)) *
                      Number(formatEther(auctionState.paymentTokenPrice)) *
                      ethUsdPrice
                    ).toFixed(2)
                  : "0.00"}
                )
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Flame className="w-4 h-4 text-white" />
                <span className="text-xs text-gray-400 uppercase">Get</span>
              </div>
              <div className="text-2xl font-bold text-white">
                Ξ{claimableDisplay}
              </div>
              <div className="text-xs text-gray-400">
                $
                {auctionState
                  ? (
                      Number(formatEther(auctionState.wethAccumulated)) *
                      ethUsdPrice
                    ).toFixed(2)
                  : "0.00"}
              </div>
            </div>
          </div>

          {/* LP Balance */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400 uppercase mb-1">
                  Your LP Balance
                </div>
                <div className="text-lg font-bold text-white">
                  {address && auctionState?.paymentTokenBalance
                    ? formatEth(auctionState.paymentTokenBalance, 4)
                    : "0"}{" "}
                  <span className="text-sm text-gray-400">DONUT-ETH</span>
                </div>
              </div>
              <a
                href={lpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 bg-white text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Get LP
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            {hasInsufficientLP && (
              <div className="text-xs text-red-400 mt-2">
                Insufficient LP balance to burn
              </div>
            )}
          </div>

          {/* Profit/Loss Indicator */}
          {blazeProfitLoss && (
            <div
              className={cn(
                "bg-zinc-900 border rounded-lg p-3 mb-4 text-center",
                blazeProfitLoss.isProfitable
                  ? "border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                  : "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
              )}
            >
              <div
                className={cn(
                  "text-sm font-semibold",
                  blazeProfitLoss.isProfitable ? "text-green-400" : "text-red-400"
                )}
              >
                {blazeProfitLoss.isProfitable
                  ? `Profitable! +$${blazeProfitLoss.profitLoss.toFixed(2)}`
                  : `Unprofitable: $${blazeProfitLoss.profitLoss.toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                ${blazeProfitLoss.lpValueInUsd.toFixed(2)} LP → ${blazeProfitLoss.wethValueInUsd.toFixed(2)} WETH
              </div>
            </div>
          )}

          {/* Burn Pool Info - Tappable */}
          <button
            onClick={() => setShowHelpDialog(true)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-sm font-semibold text-white">
                  Burn Pool
                </span>
                <HelpCircle className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-xs font-medium text-gray-400">
                Burn LP → Get WETH
              </div>
            </div>
          </button>

          {/* Help Dialog */}
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

                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    How The Burn Pool Works
                  </h2>

                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        1
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Burn LP Tokens</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Exchange your DONUT-ETH LP tokens for WETH from the burn pool.
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        2
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Dutch Auction</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Price starts high and decreases until someone burns.
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        3
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Profit Indicator</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Green = profit, Red = loss based on current prices.
                        </div>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        4
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Get LP</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Get DONUT-ETH LP tokens from Uniswap.
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500 text-center mt-4">
                    LP tokens are permanently burned. This is irreversible.
                  </p>

                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Burn Button */}
          <button
            className={cn(
              "w-full rounded-xl py-4 text-lg font-bold transition-colors",
              blazeResult === "success"
                ? "bg-green-500 text-white"
                : blazeResult === "failure"
                  ? "bg-red-500 text-white"
                  : isBlazeDisabled
                    ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                    : "bg-white text-black hover:bg-gray-200"
            )}
            onClick={handleBlaze}
            disabled={isBlazeDisabled}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      <NavBar />
    </main>
  );
}