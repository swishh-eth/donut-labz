"use client";

import { useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { BookOpen, X, ExternalLink, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

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
  wheel: "", // Coming soon
  donutLabsTreasury: "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d",
  deadAddress: "0x000000000000000000000000000000000000dEaD",
};

// SPRINKLES miner is now live!
const SPRINKLES_ENABLED = true;

export function LearnMoreButton({
  className,
  variant = "default",
  size = "default",
}: LearnMoreButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  const openTokenInWallet = async (address: string) => {
    try {
      // Use viewToken with CAIP-19 format for Base chain
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
    // Link to dead address holdings of the LP token to show burned LP
    window.open(`https://basescan.org/token/${CONTRACTS.sprinklesDonutLP}?a=${CONTRACTS.deadAddress}`, "_blank", "noopener,noreferrer");
  };

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

              {/* Token Buttons */}
              <div className="space-y-1.5 mb-3">
                <p className="text-[9px] text-gray-500 uppercase">Tokens</p>
                
                <button
                  onClick={() => openTokenInWallet(CONTRACTS.donutToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🍩</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white">$DONUT</div>
                      <div className="text-[9px] text-gray-500 font-mono">{CONTRACTS.donutToken.slice(0, 6)}...{CONTRACTS.donutToken.slice(-4)}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                </button>

                <button
                  onClick={() => openTokenInWallet(CONTRACTS.sprinklesToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white">$SPRINKLES</div>
                      <div className="text-[9px] text-gray-500 font-mono">{CONTRACTS.sprinklesToken.slice(0, 6)}...{CONTRACTS.sprinklesToken.slice(-4)}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                </button>
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
                      <div className="text-[9px] text-orange-600">🔥 100% Burned - View Proof</div>
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

                  <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 opacity-50 cursor-not-allowed">
                    <span className="text-[9px] font-semibold text-white">Wheel</span>
                    <span className="text-gray-500 text-[9px]">???</span>
                  </div>
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