"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Lock, Check, X, Sparkles, Star } from "lucide-react";
import { GAME_SKINS, getOwnedSkins, saveOwnedSkins, type GameSkin } from "@/lib/game-skins";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;
const LP_BURN_POOL = "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as const;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as const;

const ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    name: "transfer",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type RecentPlayer = {
  username: string;
  score: number;
  pfpUrl?: string;
};

type PurchaseStep = "idle" | "burn" | "lp" | "treasury" | "complete";

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Enhanced Skins Tile with seamless scrolling
function SkinsTile({ ownedSkins, onOpenShop }: { ownedSkins: string[]; onOpenShop: () => void }) {
  return (
    <button
      onClick={onOpenShop}
      className="relative w-full rounded-2xl border-2 border-purple-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-purple-400/80 group"
      style={{ minHeight: '110px', background: 'linear-gradient(135deg, rgba(147,51,234,0.2) 0%, rgba(236,72,153,0.15) 50%, rgba(251,146,60,0.1) 100%)' }}
    >
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-white/5 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
      
      {/* Floating sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Sparkles className="absolute top-3 right-12 w-4 h-4 text-yellow-400/60 animate-pulse" />
        <Sparkles className="absolute bottom-4 right-24 w-3 h-3 text-purple-400/60 animate-pulse" style={{ animationDelay: '0.5s' }} />
        <Star className="absolute top-6 right-32 w-3 h-3 text-pink-400/50 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {/* Seamless scrolling skins preview - duplicated for infinite loop */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="skins-scroll flex items-center gap-4 py-6 px-2">
          {/* First set */}
          {GAME_SKINS.map((skin: GameSkin, i: number) => (
            <div 
              key={`${skin.id}-1-${i}`}
              className="flex-shrink-0 w-14 h-14 rounded-full relative shadow-lg"
              style={{ 
                backgroundColor: skin.frostingColor,
                boxShadow: `0 0 20px ${skin.frostingColor}40`
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border-2 border-zinc-700" />
              </div>
              <div className="absolute top-1 left-2 w-3 h-3 rounded-full bg-white/30" />
            </div>
          ))}
          {/* Duplicate set for seamless loop */}
          {GAME_SKINS.map((skin: GameSkin, i: number) => (
            <div 
              key={`${skin.id}-2-${i}`}
              className="flex-shrink-0 w-14 h-14 rounded-full relative shadow-lg"
              style={{ 
                backgroundColor: skin.frostingColor,
                boxShadow: `0 0 20px ${skin.frostingColor}40`
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border-2 border-zinc-700" />
              </div>
              <div className="absolute top-1 left-2 w-3 h-3 rounded-full bg-white/30" />
            </div>
          ))}
        </div>
      </div>
      
      <div className="relative z-10 p-4">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-purple-500/20">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <span className="font-bold text-lg text-white">Skin Shop</span>
            <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full font-medium">{ownedSkins.length}/{GAME_SKINS.length}</span>
          </div>
          <div className="text-xs text-purple-200/70">Unlock unique styles for all games!</div>
        </div>
      </div>
      
      {/* Corner decoration */}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-xl" />
    </button>
  );
}

// Flappy Donut Game Tile with animated donut
function FlappyDonutTile({ recentPlayer, prizePool, isLoading }: { recentPlayer: RecentPlayer | null; prizePool: string; isLoading: boolean }) {
  const [showPlayer, setShowPlayer] = useState(false);
  
  useEffect(() => {
    if (recentPlayer && !isLoading) {
      const timer = setTimeout(() => setShowPlayer(true), 100);
      return () => clearTimeout(timer);
    }
  }, [recentPlayer, isLoading]);
  
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-pink-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-500/80"
      style={{ minHeight: '130px', background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(251,146,60,0.1) 100%)' }}
    >
      {/* Animated Flappy Donut with wings - positioned more to the left */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
        <div className="flappy-donut-float relative">
          {/* Left Wing */}
          <svg className="absolute -left-5 top-1/2 wing-flap" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'right center' }}>
            <ellipse cx="10" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          {/* Right Wing */}
          <svg className="absolute -right-5 top-1/2 wing-flap-reverse" width="24" height="16" viewBox="0 0 24 16" style={{ transformOrigin: 'left center' }}>
            <ellipse cx="14" cy="8" rx="10" ry="7" fill="rgba(255,255,255,0.9)" stroke="rgba(180,180,180,0.5)" strokeWidth="1"/>
          </svg>
          {/* Donut Body */}
          <svg width="60" height="60" viewBox="0 0 60 60">
            {/* Shadow */}
            <ellipse cx="33" cy="35" rx="20" ry="14" fill="rgba(0,0,0,0.15)" />
            {/* Main donut */}
            <circle cx="30" cy="30" r="22" fill="#F472B6" stroke="rgba(0,0,0,0.2)" strokeWidth="2"/>
            {/* Donut hole */}
            <circle cx="30" cy="30" r="7" fill="#1a1a1a" stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
            {/* Shine */}
            <circle cx="23" cy="23" r="4" fill="rgba(255,255,255,0.3)"/>
          </svg>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-28">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-pink-400" />
            <span className="font-bold text-base text-pink-400">Flappy Donut</span>
            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
          </div>
          <div className="text-[10px] text-pink-200/60 mb-2">Tap to fly, dodge the rolling pins!</div>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400">Pool: {prizePool} 🍩</span>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400">Weekly prizes</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 h-5">
            <span className="text-[9px] text-zinc-400">Last play:</span>
            <div className={`transition-opacity duration-300 ${showPlayer ? 'opacity-100' : 'opacity-0'}`}>
              {recentPlayer && (
                <span className="text-[9px] text-white bg-zinc-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />}
                  @{recentPlayer.username} scored {recentPlayer.score}
                </span>
              )}
            </div>
            {isLoading && (
              <div className="w-24 h-4 bg-zinc-800/50 rounded-full animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Coming Soon Tile
function ComingSoonTile() {
  return (
    <div className="relative w-full rounded-2xl border border-zinc-800 overflow-hidden opacity-60" style={{ minHeight: '90px', background: 'rgba(39,39,42,0.3)' }}>
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <Settings className="w-20 h-20 text-zinc-800 gear-spin" />
      </div>
      <div className="relative z-10 p-4 pr-20">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-gray-500" />
            <span className="font-bold text-base text-gray-500">NEW GAMES SOON</span>
          </div>
          <div className="text-[10px] text-gray-600">Something fun is in the works...</div>
        </div>
      </div>
    </div>
  );
}

export default function GamesPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { address } = useAccount();
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [recentPlayer, setRecentPlayer] = useState<RecentPlayer | null>(null);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [prizePool, setPrizePool] = useState<string>("0");
  const [showSkinShop, setShowSkinShop] = useState(false);
  const [ownedSkins, setOwnedSkins] = useState<string[]>(['classic']);
  const [buyingSkin, setBuyingSkin] = useState<GameSkin | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<GameSkin | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await (sdk as any).context;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    })();
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
    if (address) setOwnedSkins(getOwnedSkins(address));
  }, [address]);

  // Handle multi-step skin purchase
  useEffect(() => {
    if (!isTxSuccess || !buyingSkin || !address) return;
    
    const cost = buyingSkin.cost;
    const burnAmount = parseUnits(Math.floor(cost * 0.25).toString(), 18);
    const lpAmount = parseUnits(Math.floor(cost * 0.25).toString(), 18);
    const treasuryAmount = parseUnits((cost - Math.floor(cost * 0.25) - Math.floor(cost * 0.25)).toString(), 18);
    
    resetWrite();
    
    if (purchaseStep === "burn") {
      // Step 1 complete, now send to LP burn pool
      setPurchaseStep("lp");
      writeContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [LP_BURN_POOL, lpAmount],
      });
    } else if (purchaseStep === "lp") {
      // Step 2 complete, now send to treasury
      setPurchaseStep("treasury");
      writeContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY_ADDRESS, treasuryAmount],
      });
    } else if (purchaseStep === "treasury") {
      // All transfers complete! Mark skin as owned
      setPurchaseStep("complete");
      const newOwned = [...ownedSkins, buyingSkin.id];
      setOwnedSkins(newOwned);
      saveOwnedSkins(address, newOwned);
      refetchBalance();
      setBuyingSkin(null);
      setPurchaseStep("idle");
    }
  }, [isTxSuccess, buyingSkin, purchaseStep, address, ownedSkins, refetchBalance, resetWrite, writeContract]);

  useEffect(() => {
    const fetchGameData = async () => {
      setIsLoadingRecent(true);
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          setRecentPlayer(data.recentPlayer);
          setPrizePool(data.prizePool || "0");
        }
      } catch (e) {
        console.error("Failed to fetch game data:", e);
      } finally {
        setIsLoadingRecent(false);
      }
    };
    fetchGameData();
    const interval = setInterval(fetchGameData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      if (scrollHeight > 0) {
        setScrollFade({ top: Math.min(1, scrollTop / 100), bottom: Math.min(1, (scrollHeight - scrollTop) / 100) });
      }
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBuySkin = async (skin: GameSkin) => {
    if (!address || ownedSkins.includes(skin.id) || skin.cost === 0) return;
    
    const totalCost = skin.cost;
    const costWei = parseUnits(totalCost.toString(), 18);
    
    if (balance && balance < costWei) {
      setPurchaseError(`Need ${totalCost} DONUT to buy this skin`);
      return;
    }
    
    setPurchaseError(null);
    setBuyingSkin(skin);
    setPurchaseStep("burn");
    
    // Step 1: Send 25% to dead address (burn)
    const burnAmount = parseUnits(Math.floor(totalCost * 0.25).toString(), 18);
    writeContract({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [DEAD_ADDRESS, burnAmount],
    });
  };

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;
  const isPaying = isWritePending || isTxLoading;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .games-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .games-scroll::-webkit-scrollbar { display: none; }
        @keyframes gear-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .gear-spin { animation: gear-spin 8s linear infinite; }
        @keyframes flappy-donut-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .flappy-donut-float { animation: flappy-donut-float 1.5s ease-in-out infinite; }
        @keyframes wing-flap { 
          0%, 100% { transform: translateY(-50%) rotate(-10deg) scaleY(0.8); } 
          50% { transform: translateY(-50%) rotate(10deg) scaleY(1); } 
        }
        .wing-flap { animation: wing-flap 0.2s ease-in-out infinite; }
        @keyframes wing-flap-reverse { 
          0%, 100% { transform: translateY(-50%) rotate(10deg) scaleY(0.8); } 
          50% { transform: translateY(-50%) rotate(-10deg) scaleY(1); } 
        }
        .wing-flap-reverse { animation: wing-flap-reverse 0.2s ease-in-out infinite; }
        @keyframes skins-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .skins-scroll { animation: skins-scroll 20s linear infinite; width: max-content; }
        @keyframes skin-pulse { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.05); filter: brightness(1.2); } }
        .skin-animated-pulse { animation: skin-pulse 2s ease-in-out infinite; }
        @keyframes skin-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
        .skin-animated-rainbow { animation: skin-rainbow 3s linear infinite; }
        @keyframes skin-glow { 0%, 100% { box-shadow: 0 0 20px currentColor; } 50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; } }
        .skin-animated-glow { animation: skin-glow 2s ease-in-out infinite; }
        @keyframes skin-sparkle { 0%, 100% { filter: brightness(1); } 25% { filter: brightness(1.3); } 50% { filter: brightness(1); } 75% { filter: brightness(1.4); } }
        .skin-animated-sparkle { animation: skin-sparkle 1.5s ease-in-out infinite; }
      `}</style>

      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold tracking-wide">GAMES</h1>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden games-scroll" style={{ WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)` }}>
            <div className="space-y-3 pb-4">
              <SkinsTile ownedSkins={ownedSkins} onOpenShop={() => setShowSkinShop(true)} />
              <FlappyDonutTile recentPlayer={recentPlayer} prizePool={prizePool} isLoading={isLoadingRecent} />
              {[...Array(5)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      {/* Skin Shop Modal - Clean zinc/black/white design */}
      {showSkinShop && (
        <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-700 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-zinc-800">
                    <Palette className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="font-bold text-lg">Skin Shop</span>
                    <div className="text-xs text-zinc-400">{ownedSkins.length} of {GAME_SKINS.length} unlocked</div>
                  </div>
                </div>
                <button onClick={() => { setShowSkinShop(false); setSelectedPreview(null); }} className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Skin Preview */}
            {selectedPreview && (
              <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-800/50">
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-20 h-20 rounded-full relative shadow-xl ${selectedPreview.animated ? `skin-animated-${selectedPreview.animationType}` : ''}`}
                    style={{ 
                      backgroundColor: selectedPreview.frostingColor,
                      boxShadow: `0 0 30px ${selectedPreview.frostingColor}50`
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-700" />
                    </div>
                    <div className="absolute top-2 left-4 w-4 h-4 rounded-full bg-white/30" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{selectedPreview.name}</div>
                    <div className={`text-xs mb-1 ${selectedPreview.rarity === 'legendary' ? 'text-yellow-400' : selectedPreview.rarity === 'rare' ? 'text-purple-400' : 'text-zinc-400'}`}>
                      {selectedPreview.rarity.charAt(0).toUpperCase() + selectedPreview.rarity.slice(1)}
                      {selectedPreview.animated && ' ✨ Animated'}
                    </div>
                    {ownedSkins.includes(selectedPreview.id) ? (
                      <div className="flex items-center gap-1 text-green-400 text-sm">
                        <Check className="w-4 h-4" />
                        <span>Owned</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-400 text-sm">
                        <span className="text-lg">🍩</span>
                        <span className="font-bold">{selectedPreview.cost}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Purchase Progress */}
            {buyingSkin && purchaseStep !== "idle" && (
              <div className="px-5 py-3 bg-zinc-800 border-b border-zinc-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-white">Purchasing {buyingSkin.name}...</span>
                </div>
                <div className="flex gap-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "burn" || purchaseStep === "lp" || purchaseStep === "treasury" ? "bg-white" : "bg-zinc-700"}`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "lp" || purchaseStep === "treasury" ? "bg-white" : "bg-zinc-700"}`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "treasury" ? "bg-white" : "bg-zinc-700"}`} />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5">
                  {purchaseStep === "burn" && "Step 1/3: Burning 25%..."}
                  {purchaseStep === "lp" && "Step 2/3: Sending 25% to LP rewards..."}
                  {purchaseStep === "treasury" && "Step 3/3: Sending 50% to treasury..."}
                </p>
              </div>
            )}
            
            {purchaseError && (
              <div className="px-5 py-3 bg-red-500/10 border-b border-zinc-800">
                <p className="text-sm text-red-400">{purchaseError}</p>
              </div>
            )}
            
            {/* Skin Grid */}
            <div className="p-4 grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto">
              {GAME_SKINS.map((skin: GameSkin) => {
                const isOwned = ownedSkins.includes(skin.id);
                const isBuying = buyingSkin?.id === skin.id;
                const isSelected = selectedPreview?.id === skin.id;
                
                return (
                  <button
                    key={skin.id}
                    onClick={() => setSelectedPreview(skin)}
                    disabled={!!buyingSkin || isPaying}
                    className={`relative p-3 rounded-2xl border-2 transition-all ${
                      isSelected 
                        ? "border-white bg-zinc-800 scale-105" 
                        : isOwned 
                          ? "border-green-500/30 bg-zinc-800/30" 
                          : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/30"
                    } ${isBuying ? "border-white bg-zinc-800" : ""} ${buyingSkin && !isBuying ? "opacity-50" : ""}`}
                  >
                    {/* Rarity indicator */}
                    {skin.rarity !== 'common' && (
                      <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${skin.rarity === 'legendary' ? 'bg-yellow-400' : 'bg-purple-400'}`} />
                    )}
                    
                    <div 
                      className={`w-14 h-14 mx-auto mb-2 rounded-full relative shadow-lg transition-transform ${skin.animated ? `skin-animated-${skin.animationType}` : ''}`}
                      style={{ 
                        backgroundColor: skin.frostingColor,
                        boxShadow: isSelected ? `0 0 20px ${skin.frostingColor}60` : 'none'
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-zinc-900 border-2 border-zinc-700" />
                      </div>
                      <div className="absolute top-1 left-3 w-3 h-3 rounded-full bg-white/30" />
                    </div>
                    
                    <p className="text-xs font-bold truncate text-center">{skin.name}</p>
                    
                    {isOwned ? (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Check className="w-3 h-3 text-green-400" />
                      </div>
                    ) : skin.cost === 0 ? (
                      <span className="text-[10px] text-zinc-500 mt-1 block text-center">Free</span>
                    ) : (
                      <div className="flex items-center justify-center gap-0.5 mt-1">
                        {isBuying ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span className="text-[10px]">🍩</span>
                            <span className={`text-[10px] font-bold ${skin.rarity === 'legendary' ? 'text-yellow-400' : skin.rarity === 'rare' ? 'text-purple-400' : 'text-amber-400'}`}>{skin.cost}</span>
                          </>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Buy Button */}
            {selectedPreview && !ownedSkins.includes(selectedPreview.id) && selectedPreview.cost > 0 && (
              <div className="p-4 border-t border-zinc-800">
                <button
                  onClick={() => handleBuySkin(selectedPreview)}
                  disabled={!!buyingSkin || isPaying}
                  className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buyingSkin ? "Purchasing..." : `Buy for ${selectedPreview.cost} 🍩`}
                </button>
              </div>
            )}
            
            {/* Footer */}
            <div className="px-5 py-3 bg-zinc-800/50 border-t border-zinc-800">
              <p className="text-[10px] text-zinc-500 text-center">🔥 25% burned • 💧 25% LP rewards • 🏦 50% treasury</p>
            </div>
          </div>
        </div>
      )}
      
      <NavBar />
    </main>
  );
}