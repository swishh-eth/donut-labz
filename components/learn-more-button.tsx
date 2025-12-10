"use client";

import { useState, useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { BookOpen, X, ExternalLink, Flame, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, zeroAddress } from "viem";

type LearnMoreButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

// Contract addresses
const CONTRACTS = {
  donutToken: "0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
  sprinklesToken: "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D",
  donutMiner: "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6",
  sprinklesMiner: "0x924b2d4a89b84A37510950031DCDb6552Dc97bcC",
  sprinklesDonutLP: "0x47e8b03017d8b8d058ba5926838ca4dd4531e668",
  leaderboard: "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586",
  wheel: "0x855F3E6F870C4D4dEB4959523484be3b147c4c0C",
  wheelAuction: "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4",
  messaging: "0x543832Fe5EFB216a79f64BE52A24547D6d875685",
  donutLabsTreasury: "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d",
  deadAddress: "0x000000000000000000000000000000000000dEaD",
};

// ERC20 ABI for allowance and approve
const ERC20_ABI = [
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
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function LearnMoreButton({
  className,
  variant = "default",
  size = "default",
}: LearnMoreButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<"donut" | "sprinkles" | null>(null);
  const { address } = useAccount();

  // Read DONUT allowance for SPRINKLES miner
  const { data: donutAllowance, refetch: refetchDonutAllowance } = useReadContract({
    address: CONTRACTS.donutToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, CONTRACTS.sprinklesMiner as `0x${string}`],
    chainId: base.id,
    query: {
      enabled: !!address && showDialog,
      refetchInterval: 10_000,
    },
  });

  // Read SPRINKLES allowance (for future use - currently no spender contract)
  const { data: sprinklesAllowance, refetch: refetchSprinklesAllowance } = useReadContract({
    address: CONTRACTS.sprinklesToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, CONTRACTS.sprinklesMiner as `0x${string}`],
    chainId: base.id,
    query: {
      enabled: !!address && showDialog,
      refetchInterval: 10_000,
    },
  });

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  // Handle successful revoke
  useEffect(() => {
    if (isSuccess) {
      refetchDonutAllowance();
      refetchSprinklesAllowance();
      setRevokeTarget(null);
      resetWrite();
    }
  }, [isSuccess, refetchDonutAllowance, refetchSprinklesAllowance, resetWrite]);

  const hasDonutApproval = donutAllowance && (donutAllowance as bigint) > 0n;
  const hasSprinklesApproval = sprinklesAllowance && (sprinklesAllowance as bigint) > 0n;

  const formatAllowance = (allowance: bigint | undefined) => {
    if (!allowance || allowance === 0n) return "0";
    const formatted = Number(formatUnits(allowance, 18));
    if (formatted > 1_000_000_000) return "∞";
    if (formatted > 1_000_000) return `${(formatted / 1_000_000).toFixed(1)}M`;
    if (formatted > 1_000) return `${(formatted / 1_000).toFixed(1)}K`;
    return formatted.toFixed(2);
  };

  const handleRevokeDonut = async () => {
    if (!address) return;
    setRevokeTarget("donut");
    try {
      await writeContract({
        address: CONTRACTS.donutToken as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.sprinklesMiner as `0x${string}`, 0n],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to revoke:", error);
      setRevokeTarget(null);
      resetWrite();
    }
  };

  const handleRevokeSprinkles = async () => {
    if (!address) return;
    setRevokeTarget("sprinkles");
    try {
      await writeContract({
        address: CONTRACTS.sprinklesToken as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.sprinklesMiner as `0x${string}`, 0n],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to revoke:", error);
      setRevokeTarget(null);
      resetWrite();
    }
  };

  const openTokenInWallet = async (address: string) => {
    try {
      await sdk.actions.viewToken({ token: `eip155:8453/erc20:${address}` });
    } catch (error) {
      console.error("Failed to open token:", error);
    }
  };

  const openBasescan = (address: string) => {
    if (!address) return;
    window.open(`https://basescan.org/address/${address}`, "_blank", "noopener,noreferrer");
  };

  const openDexScreener = (address: string) => {
    if (!address) return;
    window.open(`https://dexscreener.com/base/${address}`, "_blank", "noopener,noreferrer");
  };

  const openBurnedLP = () => {
    window.open(`https://basescan.org/token/${CONTRACTS.sprinklesDonutLP}?a=${CONTRACTS.deadAddress}`, "_blank", "noopener,noreferrer");
  };

  const isRevoking = isWriting || isConfirming;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className={cn(
          "flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white p-3 rounded-lg transition-colors",
          className
        )}
      >
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold">Links & Contracts</span>
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setShowDialog(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[80vh] overflow-y-auto">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
              <button
                onClick={() => setShowDialog(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                Links & Contracts
              </h2>
              <p className="text-[9px] text-gray-500 italic mb-3">Don't trust, verify.</p>

              {/* Token Buttons - Split Design */}
              <div className="space-y-1.5 mb-3">
                <p className="text-[9px] text-gray-500 uppercase">Tokens</p>
                
                {/* DONUT Token - Split Tile */}
                <div className="flex rounded-lg overflow-hidden border border-zinc-800">
                  {/* Left side - Token info & view */}
                  <button
                    onClick={() => openTokenInWallet(CONTRACTS.donutToken)}
                    className="flex-1 flex items-center gap-2 bg-zinc-900 p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-base">🍩</span>
                    <div className="text-left flex-1">
                      <div className="text-xs font-bold text-white">$DONUT</div>
                      <div className="text-[9px] text-gray-500 font-mono">{CONTRACTS.donutToken.slice(0, 6)}...{CONTRACTS.donutToken.slice(-4)}</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  
                  {/* Right side - Approval status */}
                  {hasDonutApproval ? (
                    <button
                      onClick={handleRevokeDonut}
                      disabled={isRevoking}
                      className={cn(
                        "w-24 flex flex-col items-center justify-center bg-amber-950/50 border-l border-amber-500/30 hover:bg-amber-950/70 transition-colors",
                        isRevoking && revokeTarget === "donut" && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isRevoking && revokeTarget === "donut" ? (
                        <span className="text-[9px] text-amber-400">Revoking...</span>
                      ) : (
                        <>
                          <div className="text-[10px] font-bold text-amber-400">{formatAllowance(donutAllowance as bigint)}</div>
                          <div className="text-[8px] text-amber-500 flex items-center gap-0.5">
                            <ShieldX className="w-2.5 h-2.5" />
                            Revoke
                          </div>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="w-24 flex flex-col items-center justify-center bg-zinc-900/50 border-l border-zinc-700 opacity-50">
                      <div className="text-[10px] font-bold text-gray-500">0</div>
                      <div className="text-[8px] text-gray-600">Approved</div>
                    </div>
                  )}
                </div>

                {/* SPRINKLES Token - Split Tile */}
                <div className="flex rounded-lg overflow-hidden border border-zinc-800">
                  {/* Left side - Token info & view */}
                  <button
                    onClick={() => openTokenInWallet(CONTRACTS.sprinklesToken)}
                    className="flex-1 flex items-center gap-2 bg-zinc-900 p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-base">✨</span>
                    <div className="text-left flex-1">
                      <div className="text-xs font-bold text-white">$SPRINKLES</div>
                      <div className="text-[9px] text-gray-500 font-mono">{CONTRACTS.sprinklesToken.slice(0, 6)}...{CONTRACTS.sprinklesToken.slice(-4)}</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  
                  {/* Right side - Approval status */}
                  {hasSprinklesApproval ? (
                    <button
                      onClick={handleRevokeSprinkles}
                      disabled={isRevoking}
                      className={cn(
                        "w-24 flex flex-col items-center justify-center bg-amber-950/50 border-l border-amber-500/30 hover:bg-amber-950/70 transition-colors",
                        isRevoking && revokeTarget === "sprinkles" && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isRevoking && revokeTarget === "sprinkles" ? (
                        <span className="text-[9px] text-amber-400">Revoking...</span>
                      ) : (
                        <>
                          <div className="text-[10px] font-bold text-amber-400">{formatAllowance(sprinklesAllowance as bigint)}</div>
                          <div className="text-[8px] text-amber-500 flex items-center gap-0.5">
                            <ShieldX className="w-2.5 h-2.5" />
                            Revoke
                          </div>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="w-24 flex flex-col items-center justify-center bg-zinc-900/50 border-l border-zinc-700 opacity-50">
                      <div className="text-[10px] font-bold text-gray-500">0</div>
                      <div className="text-[8px] text-gray-600">Approved</div>
                    </div>
                  )}
                </div>
              </div>

              {/* LP Pools */}
              <div className="space-y-1.5 mb-3">
                <p className="text-[9px] text-gray-500 uppercase">Liquidity Pools</p>
                
                <button
                  onClick={() => openDexScreener(CONTRACTS.donutToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-[11px] font-semibold text-white">DONUT/WETH Pool</div>
                    <div className="text-[9px] text-gray-500">DexScreener</div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white transition-colors" />
                </button>

                <button
                  onClick={openBurnedLP}
                  className="w-full flex items-center justify-between bg-orange-950/30 border border-orange-500/30 rounded-lg p-2 hover:bg-orange-950/50 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <div className="text-left">
                      <div className="text-[11px] font-semibold text-orange-400">SPRINKLES/DONUT LP</div>
                      <div className="text-[9px] text-orange-600">🔥 100% Burned - View on Basescan</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-orange-500 group-hover:text-orange-300 transition-colors" />
                </button>
              </div>

              {/* Contracts */}
              <div className="space-y-1.5 mb-3">
                <p className="text-[9px] text-gray-500 uppercase">Contracts</p>
                
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => openBasescan(CONTRACTS.donutMiner)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">DONUT Miner</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.sprinklesMiner)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">SPRINKLES Miner</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.leaderboard)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">Leaderboard</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.wheel)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">Wheel</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.wheelAuction)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">Wheel Auction</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.messaging)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[9px] font-semibold text-white">Messaging</span>
                    <ExternalLink className="w-2.5 h-2.5 text-gray-500 group-hover:text-white" />
                  </button>
                </div>
              </div>

              {/* Treasury */}
              <div className="space-y-1.5">
                <p className="text-[9px] text-gray-500 uppercase">Treasury</p>
                
                <button
                  onClick={() => openBasescan(CONTRACTS.donutLabsTreasury)}
                  className="w-full flex items-center justify-between bg-amber-950/30 border border-amber-500/30 rounded-lg p-2 hover:bg-amber-950/50 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-[11px] font-semibold text-amber-400">Donut Labs Treasury</div>
                    <div className="text-[9px] text-gray-500 font-mono">{CONTRACTS.donutLabsTreasury.slice(0, 6)}...{CONTRACTS.donutLabsTreasury.slice(-4)}</div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-amber-400 group-hover:text-amber-300 transition-colors" />
                </button>
              </div>

              <button
                onClick={() => setShowDialog(false)}
                className="mt-3 w-full rounded-xl bg-white py-2 text-xs font-bold text-black hover:bg-gray-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}