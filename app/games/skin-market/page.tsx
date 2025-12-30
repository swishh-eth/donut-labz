"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { 
  Palette, Clock, Users, ExternalLink, Check, ChevronLeft, 
  Sparkles, Droplets, Building, Share2
} from "lucide-react";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const LP_BURN_POOL = "0xaCCeeB232556f20Ec6c0690938DBda936D153630" as const;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as const;
const SKIN_NFT_ADDRESS = "0x0000000000000000000000000000000000000000" as const; // TODO: Deploy contract

const ERC20_ABI = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

type WeeklySkin = {
  id: string;
  name: string;
  frostingColor: string;
  description: string;
  price: number;
  artist: {
    username: string;
    displayName: string;
    pfpUrl: string;
    fid: number;
    walletAddress: string;
  };
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  mintCount: number;
  maxMints?: number; // Optional cap
  animated?: boolean;
  animationType?: 'rainbow' | 'glow' | 'sparkle' | 'pulse';
  rarity: 'common' | 'rare' | 'legendary';
};

type PurchaseStep = "idle" | "approving" | "artist" | "lp" | "burn" | "complete";

// Calculate time until next Friday 11PM UTC
function getTimeUntilReset(): { days: number; hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const utcNow = new Date(now.toUTCString());
  
  const nextReset = new Date(utcNow);
  const currentDay = utcNow.getUTCDay();
  const currentHour = utcNow.getUTCHours();
  
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0 && currentHour >= 23) {
    daysUntilFriday = 7;
  }
  
  nextReset.setUTCDate(utcNow.getUTCDate() + daysUntilFriday);
  nextReset.setUTCHours(23, 0, 0, 0);
  
  const diff = nextReset.getTime() - utcNow.getTime();
  
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

// Animated Donut Preview Component
function DonutPreview({ skin, size = 120 }: { skin: WeeklySkin; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      
      const centerX = size / 2;
      const centerY = size / 2;
      const radius = size * 0.38;
      const holeRadius = radius * 0.35;
      const time = Date.now();
      
      // Calculate animated color
      let color = skin.frostingColor;
      if (skin.animated && skin.animationType === 'rainbow') {
        const hue = (time / 20) % 360;
        color = `hsl(${hue}, 70%, 60%)`;
      }
      
      // Glow effect
      if (skin.animated && (skin.animationType === 'glow' || skin.animationType === 'rainbow')) {
        const glowIntensity = 20 + Math.sin(time / 200) * 10;
        ctx.shadowColor = color;
        ctx.shadowBlur = glowIntensity;
      }
      
      // Shadow
      ctx.beginPath();
      ctx.ellipse(centerX + 4, centerY + 6, radius, radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Main donut body
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Donut hole
      ctx.beginPath();
      ctx.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Shine
      ctx.beginPath();
      ctx.arc(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fill();
      
      // Sparkle particles for sparkle animation
      if (skin.animated && skin.animationType === 'sparkle') {
        for (let i = 0; i < 6; i++) {
          const angle = (time / 500 + i * Math.PI / 3) % (Math.PI * 2);
          const dist = radius + 8 + Math.sin(time / 200 + i) * 4;
          const sparkleX = centerX + Math.cos(angle) * dist;
          const sparkleY = centerY + Math.sin(angle) * dist;
          const sparkleSize = 2 + Math.sin(time / 150 + i * 2) * 1;
          
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(time / 100 + i) * 0.3})`;
          ctx.fill();
        }
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [skin, size]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={size} 
      height={size} 
      className="mx-auto"
    />
  );
}

// Countdown Timer Component
function CountdownTimer({ onTick }: { onTick?: () => void }) {
  const [time, setTime] = useState(getTimeUntilReset());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeUntilReset());
      onTick?.();
    }, 1000);
    return () => clearInterval(interval);
  }, [onTick]);
  
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
        <span className="text-lg font-bold tabular-nums">{time.days}</span>
        <span className="text-xs text-zinc-400">d</span>
      </div>
      <span className="text-zinc-600">:</span>
      <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
        <span className="text-lg font-bold tabular-nums">{String(time.hours).padStart(2, '0')}</span>
        <span className="text-xs text-zinc-400">h</span>
      </div>
      <span className="text-zinc-600">:</span>
      <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
        <span className="text-lg font-bold tabular-nums">{String(time.minutes).padStart(2, '0')}</span>
        <span className="text-xs text-zinc-400">m</span>
      </div>
      <span className="text-zinc-600">:</span>
      <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1">
        <span className="text-lg font-bold tabular-nums">{String(time.seconds).padStart(2, '0')}</span>
        <span className="text-xs text-zinc-400">s</span>
      </div>
    </div>
  );
}

export default function SkinMarketPage() {
  const { address } = useAccount();
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [currentSkin, setCurrentSkin] = useState<WeeklySkin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMinted, setHasMinted] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [recentMinters, setRecentMinters] = useState<{ username: string; pfpUrl?: string }[]>([]);
  
  const { writeContract, data: txHash, isPending: isWritePending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({ hash: txHash });
  
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Initialize Farcaster SDK
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
    sdk.actions.ready().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch current week's skin
  useEffect(() => {
    const fetchSkin = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/games/skin-market/current');
        if (res.ok) {
          const data = await res.json();
          setCurrentSkin(data.skin);
          setRecentMinters(data.recentMinters || []);
          if (address && data.minters?.includes(address.toLowerCase())) {
            setHasMinted(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch skin:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSkin();
  }, [address]);

  // Check if user already minted
  useEffect(() => {
    if (!address || !currentSkin) return;
    const checkMinted = async () => {
      try {
        const res = await fetch(`/api/games/skin-market/check-minted?address=${address}&skinId=${currentSkin.id}`);
        if (res.ok) {
          const data = await res.json();
          setHasMinted(data.hasMinted);
        }
      } catch (e) {
        console.error("Failed to check mint status:", e);
      }
    };
    checkMinted();
  }, [address, currentSkin]);

  // Handle multi-step purchase
  useEffect(() => {
    if (!isTxSuccess || !currentSkin || !address) return;
    
    const price = currentSkin.price;
    const artistAmount = parseUnits(Math.floor(price * 0.80).toString(), 18);
    const lpAmount = parseUnits(Math.floor(price * 0.15).toString(), 18);
    const treasuryAmount = parseUnits((price - Math.floor(price * 0.80) - Math.floor(price * 0.15)).toString(), 18);
    
    resetWrite();
    
    if (purchaseStep === "artist") {
      // Step 1 complete, send to LP
      setPurchaseStep("lp");
      writeContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [LP_BURN_POOL, lpAmount],
      });
    } else if (purchaseStep === "lp") {
      // Step 2 complete, send to treasury
      setPurchaseStep("burn");
      writeContract({
        address: DONUT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [TREASURY_ADDRESS, treasuryAmount],
      });
    } else if (purchaseStep === "burn") {
      // All transfers complete! Record the mint
      setPurchaseStep("complete");
      
      // Record mint in database
      fetch('/api/games/skin-market/record-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.toLowerCase(),
          skinId: currentSkin.id,
          username: context?.user?.username,
          pfpUrl: context?.user?.pfpUrl,
        }),
      }).then(() => {
        setHasMinted(true);
        setCurrentSkin(prev => prev ? { ...prev, mintCount: prev.mintCount + 1 } : null);
        refetchBalance();
      }).catch(console.error);
      
      setPurchaseStep("idle");
    }
  }, [isTxSuccess, currentSkin, purchaseStep, address, context, refetchBalance, resetWrite, writeContract]);

  // Handle errors
  useEffect(() => {
    if (writeError || isTxError) {
      setPurchaseError("Transaction failed. Please try again.");
      setPurchaseStep("idle");
      resetWrite();
    }
  }, [writeError, isTxError, resetWrite]);

  const handleMint = async () => {
    if (!address || !currentSkin || hasMinted) return;
    
    const costWei = parseUnits(currentSkin.price.toString(), 18);
    if (balance && balance < costWei) {
      setPurchaseError(`Need ${currentSkin.price} DONUT to mint`);
      return;
    }
    
    setPurchaseError(null);
    setPurchaseStep("artist");
    
    // Step 1: Send 80% to artist
    const artistAmount = parseUnits(Math.floor(currentSkin.price * 0.80).toString(), 18);
    writeContract({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [currentSkin.artist.walletAddress as `0x${string}`, artistAmount],
    });
  };

  const handleShare = useCallback(async () => {
    if (!currentSkin) return;
    const miniappUrl = "https://farcaster.xyz/miniapps/5argX24fr_Tq/sprinkles";
    const castText = `🎨 Just minted the "${currentSkin.name}" skin by @${currentSkin.artist.username} on Sprinkles!\n\n${currentSkin.mintCount + 1} minted so far. Get yours before the week ends! 🍩`;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`);
    } catch {
      try {
        await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl);
        alert("Copied to clipboard!");
      } catch {}
    }
  }, [currentSkin]);

  const isPaying = isWritePending || isTxLoading || purchaseStep !== "idle";

  // Mock data for development
  const mockSkin: WeeklySkin = {
    id: "week-52-cosmic",
    name: "Cosmic Swirl",
    frostingColor: "#8B5CF6",
    description: "A mesmerizing cosmic donut with swirling galaxies. Limited edition by artist @cosmicart.",
    price: 500,
    artist: {
      username: "cosmicart",
      displayName: "Cosmic Art",
      pfpUrl: "https://i.imgur.com/cosmic.png",
      fid: 12345,
      walletAddress: "0x1234567890123456789012345678901234567890",
    },
    weekNumber: 52,
    weekStart: "2024-12-23",
    weekEnd: "2024-12-30",
    mintCount: 47,
    animated: true,
    animationType: "glow",
    rarity: "legendary",
  };

  const displaySkin = currentSkin || mockSkin;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .float-animation { animation: float 3s ease-in-out infinite; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}>
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 mb-4">
          <button 
            onClick={() => window.location.href = "/games"}
            className="p-2 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Skin Market</h1>
            <p className="text-xs text-zinc-400">Weekly artist collaboration</p>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 space-y-4">
            {/* Timer Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-zinc-400">Time Remaining</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <span>Week {displaySkin.weekNumber}</span>
                </div>
              </div>
              <CountdownTimer />
            </div>
            
            {/* Skin Preview Card */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Skin Display */}
              <div className="relative p-8 flex items-center justify-center" style={{ background: `radial-gradient(circle at center, ${displaySkin.frostingColor}20 0%, transparent 70%)` }}>
                <div className="float-animation">
                  <DonutPreview skin={displaySkin} size={160} />
                </div>
                
                {/* Rarity Badge */}
                <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold ${
                  displaySkin.rarity === 'legendary' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  displaySkin.rarity === 'rare' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                  'bg-zinc-700/50 text-zinc-300 border border-zinc-600'
                }`}>
                  {displaySkin.rarity === 'legendary' && <Sparkles className="w-3 h-3 inline mr-1" />}
                  {displaySkin.rarity.charAt(0).toUpperCase() + displaySkin.rarity.slice(1)}
                </div>
              </div>
              
              {/* Skin Info */}
              <div className="p-5 border-t border-zinc-800">
                <h2 className="text-2xl font-bold mb-2">{displaySkin.name}</h2>
                <p className="text-sm text-zinc-400 mb-4">{displaySkin.description}</p>
                
                {/* Artist Info */}
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl mb-4">
                  <Avatar className="h-12 w-12 border-2 border-zinc-700">
                    <AvatarImage src={displaySkin.artist.pfpUrl} alt={displaySkin.artist.displayName} />
                    <AvatarFallback className="bg-zinc-700">{displaySkin.artist.displayName.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-bold">{displaySkin.artist.displayName}</div>
                    <div className="text-sm text-zinc-400">@{displaySkin.artist.username}</div>
                  </div>
                  <button 
                    onClick={() => sdk.actions.openUrl(`https://warpcast.com/${displaySkin.artist.username}`)}
                    className="p-2 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="text-2xl font-bold">{displaySkin.mintCount}</div>
                    <div className="text-xs text-zinc-500">Minted</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-lg">🍩</span>
                    </div>
                    <div className="text-2xl font-bold">{displaySkin.price}</div>
                    <div className="text-xs text-zinc-500">Price</div>
                  </div>
                </div>
                
                {/* Recent Minters */}
                {recentMinters.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-zinc-500 mb-2">Recent Minters</div>
                    <div className="flex -space-x-2">
                      {recentMinters.slice(0, 8).map((minter, i) => (
                        <Avatar key={i} className="h-8 w-8 border-2 border-zinc-900">
                          <AvatarImage src={minter.pfpUrl} />
                          <AvatarFallback className="bg-zinc-700 text-xs">{minter.username?.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                      ))}
                      {recentMinters.length > 8 && (
                        <div className="h-8 w-8 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-xs">
                          +{recentMinters.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Purchase Progress */}
                {purchaseStep !== "idle" && purchaseStep !== "complete" && (
                  <div className="mb-4 p-3 bg-zinc-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Processing purchase...</span>
                    </div>
                    <div className="flex gap-1">
                      <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "artist" || purchaseStep === "lp" || purchaseStep === "burn" ? "bg-white" : "bg-zinc-700"}`} />
                      <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "lp" || purchaseStep === "burn" ? "bg-white" : "bg-zinc-700"}`} />
                      <div className={`h-1.5 flex-1 rounded-full transition-colors ${purchaseStep === "burn" ? "bg-white" : "bg-zinc-700"}`} />
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-2">
                      {purchaseStep === "artist" && "Step 1/3: Sending 80% to artist..."}
                      {purchaseStep === "lp" && "Step 2/3: Sending 15% to LP rewards..."}
                      {purchaseStep === "burn" && "Step 3/3: Sending 5% to treasury..."}
                    </p>
                  </div>
                )}
                
                {/* Error Message */}
                {purchaseError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-sm text-red-400">{purchaseError}</p>
                  </div>
                )}
                
                {/* Mint Button */}
                {hasMinted ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 py-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <Check className="w-5 h-5 text-green-400" />
                      <span className="font-bold text-green-400">You own this skin!</span>
                    </div>
                    <button
                      onClick={handleShare}
                      className="w-full py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleMint}
                    disabled={isPaying || !address}
                    className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!address ? "Connect Wallet to Mint" : isPaying ? "Processing..." : `Mint for ${displaySkin.price} 🍩`}
                  </button>
                )}
              </div>
            </div>
            
            {/* Split Info */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <div className="text-xs text-zinc-500 mb-3 text-center">How your DONUT is distributed</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-zinc-800/50 rounded-xl">
                  <Palette className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                  <div className="text-lg font-bold text-purple-400">80%</div>
                  <div className="text-[10px] text-zinc-500">Artist</div>
                </div>
                <div className="text-center p-2 bg-zinc-800/50 rounded-xl">
                  <Droplets className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                  <div className="text-lg font-bold text-blue-400">15%</div>
                  <div className="text-[10px] text-zinc-500">LP Rewards</div>
                </div>
                <div className="text-center p-2 bg-zinc-800/50 rounded-xl">
                  <Building className="w-5 h-5 mx-auto mb-1 text-green-400" />
                  <div className="text-lg font-bold text-green-400">5%</div>
                  <div className="text-[10px] text-zinc-500">Treasury</div>
                </div>
              </div>
            </div>
            
            {/* Info Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                How It Works
              </h3>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li>• Each week features a new skin by a Farcaster artist</li>
                <li>• Mint to unlock the skin for all Donut Labs games</li>
                <li>• 75% of proceeds go directly to the artist</li>
                <li>• Your skin is stored as an NFT on Base</li>
                <li>• Limited time only - new skin each Friday!</li>
              </ul>
            </div>
          </div>
        )}
      </div>
      
      <NavBar />
    </main>
  );
}