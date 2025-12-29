"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Settings, Gamepad2, Trophy, Coins, Palette, Lock, Check, X } from "lucide-react";
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

// Skins Tile with scrolling preview
function SkinsTile({ ownedSkins, onOpenShop }: { ownedSkins: string[]; onOpenShop: () => void }) {
  return (
    <button
      onClick={onOpenShop}
      className="relative w-full rounded-2xl border-2 border-purple-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-purple-500/80"
      style={{ minHeight: '100px', background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(236,72,153,0.1) 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="skins-scroll flex items-center gap-3 py-4 px-2">
          {[...GAME_SKINS, ...GAME_SKINS].map((skin: GameSkin, i: number) => (
            <div 
              key={`${skin.id}-${i}`}
              className="flex-shrink-0 w-12 h-12 rounded-full relative opacity-30"
              style={{ backgroundColor: "#D4A574" }}
            >
              <div className="absolute inset-1 rounded-full" style={{ background: `linear-gradient(180deg, ${skin.frostingColor} 0%, ${skin.frostingColor} 50%, transparent 50%)` }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-zinc-900" />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="relative z-10 p-4">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-base text-purple-400">Skin Shop</span>
            <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{ownedSkins.length}/{GAME_SKINS.length}</span>
          </div>
          <div className="text-[10px] text-purple-200/60">Customize your donut for all games!</div>
        </div>
      </div>
    </button>
  );
}

// Flappy Donut Game Tile
function FlappyDonutTile({ recentPlayer, prizePool }: { recentPlayer: RecentPlayer | null; prizePool: string }) {
  return (
    <button
      onClick={() => window.location.href = "/games/game-1"}
      className="relative w-full rounded-2xl border-2 border-pink-500/50 overflow-hidden transition-all duration-300 active:scale-[0.98] hover:border-pink-500/80"
      style={{ minHeight: '120px', background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(251,146,60,0.1) 100%)' }}
    >
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-30">
        <div className="donut-float">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="rgba(236,72,153,0.5)" />
            <circle cx="50" cy="50" r="16" fill="#1a1a1a" />
            <path d="M 20 50 A 30 30 0 0 1 80 50" fill="rgba(236,72,153,0.6)" />
          </svg>
        </div>
      </div>
      
      <div className="relative z-10 p-4 pr-24">
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
          
          {recentPlayer ? (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-zinc-400">Last play:</span>
              <span className="text-[9px] text-white bg-zinc-800/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                {recentPlayer.pfpUrl && <img src={recentPlayer.pfpUrl} alt="" className="w-3.5 h-3.5 rounded-full" />}
                @{recentPlayer.username} scored {recentPlayer.score}
              </span>
            </div>
          ) : (
            <span className="text-[9px] text-zinc-500">Be the first to play today!</span>
          )}
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
  const [prizePool, setPrizePool] = useState<string>("0");
  const [showSkinShop, setShowSkinShop] = useState(false);
  const [ownedSkins, setOwnedSkins] = useState<string[]>(['classic']);
  const [buyingSkin, setBuyingSkin] = useState<GameSkin | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

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
      try {
        const res = await fetch('/api/games/flappy/recent');
        if (res.ok) {
          const data = await res.json();
          setRecentPlayer(data.recentPlayer);
          setPrizePool(data.prizePool || "0");
        }
      } catch (e) {
        console.error("Failed to fetch game data:", e);
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
        @keyframes donut-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(10deg); } }
        .donut-float { animation: donut-float 3s ease-in-out infinite; }
        @keyframes skins-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .skins-scroll { animation: skins-scroll 20s linear infinite; }
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
              <FlappyDonutTile recentPlayer={recentPlayer} prizePool={prizePool} />
              {[...Array(5)].map((_, i) => <ComingSoonTile key={i} />)}
            </div>
          </div>
        </div>
      </div>
      
      {showSkinShop && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-400" />
                <span className="font-bold">Skin Shop</span>
                <span className="text-xs text-zinc-500">{ownedSkins.length}/{GAME_SKINS.length}</span>
              </div>
              <button onClick={() => setShowSkinShop(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Purchase Progress */}
            {buyingSkin && purchaseStep !== "idle" && (
              <div className="px-4 py-3 bg-purple-500/10 border-b border-zinc-800">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-purple-300">Purchasing {buyingSkin.name}...</span>
                </div>
                <div className="flex gap-1">
                  <div className={`h-1 flex-1 rounded-full ${purchaseStep === "burn" || purchaseStep === "lp" || purchaseStep === "treasury" ? "bg-purple-500" : "bg-zinc-700"}`} />
                  <div className={`h-1 flex-1 rounded-full ${purchaseStep === "lp" || purchaseStep === "treasury" ? "bg-purple-500" : "bg-zinc-700"}`} />
                  <div className={`h-1 flex-1 rounded-full ${purchaseStep === "treasury" ? "bg-purple-500" : "bg-zinc-700"}`} />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {purchaseStep === "burn" && "Step 1/3: Burning 25%..."}
                  {purchaseStep === "lp" && "Step 2/3: Sending 25% to LP rewards..."}
                  {purchaseStep === "treasury" && "Step 3/3: Sending 50% to treasury..."}
                </p>
              </div>
            )}
            
            {purchaseError && (
              <div className="px-4 py-2 bg-red-500/10 border-b border-zinc-800">
                <p className="text-sm text-red-400">{purchaseError}</p>
              </div>
            )}
            
            <div className="p-4 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
              {GAME_SKINS.map((skin: GameSkin) => {
                const isOwned = ownedSkins.includes(skin.id);
                const isBuying = buyingSkin?.id === skin.id;
                
                return (
                  <button
                    key={skin.id}
                    onClick={() => !isOwned && skin.cost > 0 && !buyingSkin && handleBuySkin(skin)}
                    disabled={isOwned || !!buyingSkin || isPaying}
                    className={`relative p-4 rounded-xl border-2 transition-all ${isOwned ? "border-green-500/50 bg-green-500/10" : "border-zinc-700 hover:border-purple-500/50"} ${isBuying ? "border-purple-500 bg-purple-500/10" : ""} ${buyingSkin && !isBuying ? "opacity-50" : ""}`}
                  >
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full relative" style={{ backgroundColor: "#D4A574" }}>
                      <div className="absolute inset-1 rounded-full" style={{ background: `linear-gradient(180deg, ${skin.frostingColor} 0%, ${skin.frostingColor} 50%, transparent 50%)` }} />
                      <div className="absolute inset-0 flex items-center justify-center"><div className="w-4 h-4 rounded-full bg-zinc-900" /></div>
                      <div className="absolute top-2 left-3 w-1.5 h-0.5 rounded-full" style={{ backgroundColor: skin.sprinkleColors[0] }} />
                      <div className="absolute top-3 right-3 w-1.5 h-0.5 rounded-full rotate-45" style={{ backgroundColor: skin.sprinkleColors[1] }} />
                      <div className="absolute top-4 left-5 w-1.5 h-0.5 rounded-full -rotate-45" style={{ backgroundColor: skin.sprinkleColors[2] }} />
                    </div>
                    
                    <p className="text-sm font-bold truncate">{skin.name}</p>
                    
                    {isOwned ? (
                      <div className="flex items-center justify-center gap-1 mt-2"><Check className="w-4 h-4 text-green-400" /><span className="text-xs text-green-400">Owned</span></div>
                    ) : skin.cost === 0 ? (
                      <span className="text-xs text-zinc-500 mt-2 block">Free</span>
                    ) : (
                      <div className="flex items-center justify-center gap-1 mt-2">
                        {isBuying ? <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> : <><Lock className="w-3 h-3 text-amber-400" /><span className="text-xs text-amber-400">{skin.cost} 🍩</span></>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
              <p className="text-xs text-zinc-400 text-center">25% burned • 25% LP rewards • 50% treasury</p>
            </div>
          </div>
        </div>
      )}
      
      <NavBar />
    </main>
  );
}