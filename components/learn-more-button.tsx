"use client";

import { useState } from "react";
import { BookOpen, X, ExternalLink, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type LearnMoreButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

// Contract addresses
const CONTRACTS = {
  donutToken: "0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
  sprinklesToken: "0x98DCF4D319fd761EE144C8682300A890Df9f4398",
  donutMiner: "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6",
  sprinklesMiner: "0x4AcfB87F3CDA3Bb2962F54862181c3f2CdcA5fa0",
  donutWethLP: "0xD534F1B29E0F79b5e24f3d4e7a5B0f1d9f6E8C7A", // Update with actual LP address
  sprinklesDonutLP: "0x1f23d5b26a2d9c6278f39d87e1c58d1121a57d22",
  leaderboard: "0x4681A6DeEe2D74f5DE48CEcd2A572979EA641586",
  feeSplitter: "0x62c9a9Cf11F076CF31bCCb7Ad85299670215684B",
  donutLabsTreasury: "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d",
};

export function LearnMoreButton({
  className,
  variant = "default",
  size = "default",
}: LearnMoreButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopy = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const openFarcasterToken = (address: string) => {
    window.open(`https://warpcast.com/~/token/${address}`, "_blank", "noopener,noreferrer");
  };

  const openBasescan = (address: string) => {
    window.open(`https://basescan.org/address/${address}`, "_blank", "noopener,noreferrer");
  };

  const openDexScreener = (address: string) => {
    window.open(`https://dexscreener.com/base/${address}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className={cn(
          "flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-lg transition-colors",
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
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button
                onClick={() => setShowDialog(false)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                Links & Contracts
              </h2>

              {/* Token Buttons */}
              <div className="space-y-2 mb-4">
                <p className="text-[10px] text-gray-500 uppercase">Tokens</p>
                
                <button
                  onClick={() => openFarcasterToken(CONTRACTS.donutToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🍩</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white">$DONUT</div>
                      <div className="text-[10px] text-gray-500 font-mono">{CONTRACTS.donutToken.slice(0, 6)}...{CONTRACTS.donutToken.slice(-4)}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </button>

                <button
                  onClick={() => openFarcasterToken(CONTRACTS.sprinklesToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <div className="text-left">
                      <div className="text-sm font-bold text-white">$SPRINKLES</div>
                      <div className="text-[10px] text-gray-500 font-mono">{CONTRACTS.sprinklesToken.slice(0, 6)}...{CONTRACTS.sprinklesToken.slice(-4)}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                </button>
              </div>

              {/* LP Pools */}
              <div className="space-y-2 mb-4">
                <p className="text-[10px] text-gray-500 uppercase">Liquidity Pools</p>
                
                <button
                  onClick={() => openDexScreener(CONTRACTS.donutToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold text-white">DONUT/WETH Pool</div>
                    <div className="text-[10px] text-gray-500">DexScreener</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                </button>

                <button
                  onClick={() => openDexScreener(CONTRACTS.sprinklesToken)}
                  className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 hover:bg-zinc-800 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold text-white">SPRINKLES/DONUT Pool</div>
                    <div className="text-[10px] text-gray-500">DexScreener</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-colors" />
                </button>
              </div>

              {/* Contracts */}
              <div className="space-y-2 mb-4">
                <p className="text-[10px] text-gray-500 uppercase">Contracts</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openBasescan(CONTRACTS.donutMiner)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[10px] font-semibold text-white">DONUT Miner</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.sprinklesMiner)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[10px] font-semibold text-white">SPRINKLES Miner</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.leaderboard)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[10px] font-semibold text-white">Leaderboard</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white" />
                  </button>

                  <button
                    onClick={() => openBasescan(CONTRACTS.feeSplitter)}
                    className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors group"
                  >
                    <span className="text-[10px] font-semibold text-white">Fee Splitter</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white" />
                  </button>
                </div>
              </div>

              {/* Treasury */}
              <div className="space-y-2">
                <p className="text-[10px] text-gray-500 uppercase">Treasury</p>
                
                <button
                  onClick={() => openBasescan(CONTRACTS.donutLabsTreasury)}
                  className="w-full flex items-center justify-between bg-amber-950/30 border border-amber-500/30 rounded-lg p-2.5 hover:bg-amber-950/50 transition-colors group"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold text-amber-400">Donut Labs Treasury</div>
                    <div className="text-[10px] text-gray-500 font-mono">{CONTRACTS.donutLabsTreasury.slice(0, 6)}...{CONTRACTS.donutLabsTreasury.slice(-4)}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 transition-colors" />
                </button>
              </div>

              <button
                onClick={() => setShowDialog(false)}
                className="mt-4 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
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