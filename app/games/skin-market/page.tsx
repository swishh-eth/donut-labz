"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { 
  ChevronLeft, Lock, Check, Crown, Gamepad2, Layers, Rocket,
  Trophy, Star, Zap, Sparkles
} from "lucide-react";

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as const;

const ERC20_ABI = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

// Premium price in DONUT
const PREMIUM_PRICE = 25;

// Achievement skin definitions
type SkinTier = 'common' | 'rare' | 'epic' | 'legendary';
type GameId = 'flappy-donut' | 'glaze-stack' | 'donut-dash';

interface AchievementSkin {
  id: string;
  name: string;
  color: string;
  tier: SkinTier;
  gameId: GameId;
  gameName: string;
  gameIcon: typeof Gamepad2;
  requirement: {
    type: 'games_played' | 'high_score' | 'total_score';
    value: number;
    description: string;
  };
  animated?: boolean;
  animationType?: 'rainbow' | 'glow' | 'pulse' | 'sparkle';
}

const ACHIEVEMENT_SKINS: AchievementSkin[] = [
  // Flappy Donut Skins
  {
    id: 'flappy-bronze',
    name: 'Sky Rookie',
    color: '#CD7F32',
    tier: 'common',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'games_played', value: 25, description: 'Play 25 games' },
  },
  {
    id: 'flappy-silver',
    name: 'Wing Master',
    color: '#C0C0C0',
    tier: 'rare',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'games_played', value: 50, description: 'Play 50 games' },
  },
  {
    id: 'flappy-epic',
    name: 'Cloud Surfer',
    color: '#06B6D4',
    tier: 'epic',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'games_played', value: 100, description: 'Play 100 games' },
    animated: true,
    animationType: 'pulse',
  },
  {
    id: 'flappy-gold',
    name: 'Golden Aviator',
    color: '#FFD700',
    tier: 'legendary',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'high_score', value: 300, description: 'Score 300+ in one game' },
    animated: true,
    animationType: 'glow',
  },
  
  // Glaze Stack Skins
  {
    id: 'stack-bronze',
    name: 'Stack Starter',
    color: '#FF6B6B',
    tier: 'common',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'games_played', value: 25, description: 'Play 25 games' },
  },
  {
    id: 'stack-silver',
    name: 'Tower Builder',
    color: '#4ECDC4',
    tier: 'rare',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'games_played', value: 50, description: 'Play 50 games' },
  },
  {
    id: 'stack-epic',
    name: 'Sky Stacker',
    color: '#8B5CF6',
    tier: 'epic',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'games_played', value: 100, description: 'Play 100 games' },
    animated: true,
    animationType: 'pulse',
  },
  {
    id: 'stack-gold',
    name: 'Glaze Architect',
    color: '#9D4EDD',
    tier: 'legendary',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'high_score', value: 100, description: 'Score 100+ in one game' },
    animated: true,
    animationType: 'rainbow',
  },
  
  // Donut Dash Skins
  {
    id: 'dash-bronze',
    name: 'Jetpack Novice',
    color: '#3B82F6',
    tier: 'common',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'games_played', value: 25, description: 'Play 25 games' },
  },
  {
    id: 'dash-silver',
    name: 'Speed Demon',
    color: '#F97316',
    tier: 'rare',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'games_played', value: 50, description: 'Play 50 games' },
  },
  {
    id: 'dash-epic',
    name: 'Rocket Rider',
    color: '#EF4444',
    tier: 'epic',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'games_played', value: 100, description: 'Play 100 games' },
    animated: true,
    animationType: 'pulse',
  },
  {
    id: 'dash-gold',
    name: 'Cosmic Cruiser',
    color: '#EC4899',
    tier: 'legendary',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'high_score', value: 1000, description: 'Collect 1000+ sprinkles' },
    animated: true,
    animationType: 'sparkle',
  },
];

// Animated Donut Preview Component
function DonutPreview({ skin, size = 80, locked = false, progress = 0 }: { 
  skin: AchievementSkin; 
  size?: number; 
  locked?: boolean;
  progress?: number;
}) {
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
      
      // Calculate color
      let color = locked ? '#3f3f46' : skin.color;
      if (!locked && skin.animated && skin.animationType === 'rainbow') {
        const hue = (time / 20) % 360;
        color = `hsl(${hue}, 70%, 60%)`;
      }
      
      // Glow effect for animated skins
      if (!locked && skin.animated && (skin.animationType === 'glow' || skin.animationType === 'rainbow')) {
        const glowIntensity = 15 + Math.sin(time / 200) * 8;
        ctx.shadowColor = color;
        ctx.shadowBlur = glowIntensity;
      }
      
      // Shadow
      ctx.beginPath();
      ctx.ellipse(centerX + 2, centerY + 3, radius, radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Main donut body
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = locked ? "rgba(255,255,255,0.1)" : "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Donut hole
      ctx.beginPath();
      ctx.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();
      
      // Shine
      if (!locked) {
        ctx.beginPath();
        ctx.arc(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fill();
      }
      
      // Sparkle particles for sparkle animation
      if (!locked && skin.animated && skin.animationType === 'sparkle') {
        for (let i = 0; i < 5; i++) {
          const angle = (time / 500 + i * Math.PI / 2.5) % (Math.PI * 2);
          const dist = radius + 5 + Math.sin(time / 200 + i) * 3;
          const sparkleX = centerX + Math.cos(angle) * dist;
          const sparkleY = centerY + Math.sin(angle) * dist;
          const sparkleSize = 1.5 + Math.sin(time / 150 + i * 2) * 0.8;
          
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(time / 100 + i) * 0.3})`;
          ctx.fill();
        }
      }
      
      // Pulse effect
      if (!locked && skin.animated && skin.animationType === 'pulse') {
        const pulseRadius = radius + 5 + Math.sin(time / 300) * 5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)}, ${0.3 + Math.sin(time / 300) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Lock overlay
      if (locked) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [skin, size, locked]);
  
  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        width={size} 
        height={size}
      />
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Lock className="w-5 h-5 text-zinc-500" />
        </div>
      )}
    </div>
  );
}

// Progress bar component
function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const percent = Math.min((current / target) * 100, 100);
  return (
    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div 
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

// Achievement Card Component
function AchievementCard({ 
  skin, 
  isPremium, 
  userStats,
  unlockedSkins,
  equippedSkin,
  onEquip,
}: { 
  skin: AchievementSkin;
  isPremium: boolean;
  userStats: { gamesPlayed: number; highScore: number; totalScore: number } | null;
  unlockedSkins: string[];
  equippedSkin: string | null;
  onEquip: (skinId: string) => void;
}) {
  const isUnlocked = unlockedSkins.includes(skin.id);
  const isEquipped = equippedSkin === skin.id;
  
  // Calculate progress
  let current = 0;
  let target = skin.requirement.value;
  
  if (userStats) {
    if (skin.requirement.type === 'games_played') {
      current = userStats.gamesPlayed;
    } else if (skin.requirement.type === 'high_score') {
      current = userStats.highScore;
    } else if (skin.requirement.type === 'total_score') {
      current = userStats.totalScore;
    }
  }
  
  const progress = Math.min(current / target, 1);
  const isComplete = current >= target;
  const canUnlock = isPremium && isComplete && !isUnlocked;
  
  return (
    <div className={`relative p-3 rounded-xl border transition-all ${
      isEquipped 
        ? 'bg-zinc-800 border-white/50' 
        : isUnlocked 
          ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-600' 
          : 'bg-zinc-900/50 border-zinc-800'
    }`}>
      {/* Tier badge */}
      <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center ${
        skin.tier === 'legendary' ? 'bg-yellow-500' :
        skin.tier === 'epic' ? 'bg-cyan-500' :
        skin.tier === 'rare' ? 'bg-purple-500' : 'bg-zinc-600'
      }`}>
        {skin.tier === 'legendary' ? <Sparkles className="w-3 h-3 text-black" /> :
         skin.tier === 'epic' ? <Zap className="w-3 h-3 text-black" /> :
         skin.tier === 'rare' ? <Star className="w-3 h-3 text-white" /> :
         <Trophy className="w-3 h-3 text-white" />}
      </div>
      
      {/* Donut preview */}
      <div className="flex justify-center mb-2">
        <DonutPreview 
          skin={skin} 
          size={70} 
          locked={!isUnlocked && !isPremium}
          progress={progress}
        />
      </div>
      
      {/* Name */}
      <h3 className={`text-sm font-bold text-center mb-1 ${isUnlocked ? 'text-white' : 'text-zinc-500'}`}>
        {skin.name}
      </h3>
      
      {/* Requirement */}
      <p className="text-[10px] text-zinc-500 text-center mb-2">
        {skin.requirement.description}
      </p>
      
      {/* Progress or status */}
      {isUnlocked ? (
        <button
          onClick={() => onEquip(skin.id)}
          className={`w-full py-1.5 rounded-lg text-xs font-bold transition-colors ${
            isEquipped 
              ? 'bg-white text-black' 
              : 'bg-zinc-800 text-white hover:bg-zinc-700'
          }`}
        >
          {isEquipped ? (
            <span className="flex items-center justify-center gap-1">
              <Check className="w-3 h-3" /> Equipped
            </span>
          ) : 'Equip'}
        </button>
      ) : isPremium ? (
        <div className="space-y-1">
          <ProgressBar current={current} target={target} color={skin.color} />
          <p className="text-[10px] text-zinc-500 text-center">
            {current} / {target}
          </p>
          {canUnlock && (
            <button
              onClick={() => onEquip(skin.id)}
              className="w-full py-1.5 bg-green-500 text-black rounded-lg text-xs font-bold hover:bg-green-400"
            >
              Claim!
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-600">
          <Crown className="w-3 h-3" />
          Premium Required
        </div>
      )}
    </div>
  );
}

export default function SkinMarketPage() {
  const { address } = useAccount();
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>([]);
  const [equippedSkin, setEquippedSkin] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameId | 'all'>('all');
  
  // User stats per game
  const [userStats, setUserStats] = useState<Record<GameId, { gamesPlayed: number; highScore: number; totalScore: number }>>({
    'flappy-donut': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    'glaze-stack': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    'donut-dash': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
  });
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
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

  // Fetch premium status and user data
  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }
    
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/games/skin-market/user-data?address=${address}`);
        if (res.ok) {
          const data = await res.json();
          setIsPremium(data.isPremium || false);
          setUnlockedSkins(data.unlockedSkins || []);
          setEquippedSkin(data.equippedSkin || null);
          if (data.stats) {
            setUserStats(data.stats);
          }
        }
      } catch (e) {
        console.error("Failed to fetch user data:", e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserData();
  }, [address]);

  // Handle premium purchase success
  useEffect(() => {
    if (isTxSuccess && isPurchasing) {
      // Record premium purchase
      fetch('/api/games/skin-market/purchase-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address?.toLowerCase(),
          txHash,
          fid: context?.user?.fid,
          username: context?.user?.username,
        }),
      }).then(() => {
        setIsPremium(true);
        setIsPurchasing(false);
        resetWrite();
        refetchBalance();
      }).catch((e) => {
        console.error("Failed to record premium:", e);
        setPurchaseError("Failed to record purchase. Please contact support.");
        setIsPurchasing(false);
      });
    }
  }, [isTxSuccess, isPurchasing, address, txHash, context, resetWrite, refetchBalance]);

  // Handle errors
  useEffect(() => {
    if (writeError) {
      setPurchaseError("Transaction failed. Please try again.");
      setIsPurchasing(false);
      resetWrite();
    }
  }, [writeError, resetWrite]);

  const handlePurchasePremium = async () => {
    if (!address) return;
    
    const costWei = parseUnits(PREMIUM_PRICE.toString(), 18);
    if (balance && balance < costWei) {
      setPurchaseError(`Need ${PREMIUM_PRICE} DONUT to unlock premium`);
      return;
    }
    
    setPurchaseError(null);
    setIsPurchasing(true);
    
    writeContract({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [TREASURY_ADDRESS, costWei],
    });
  };

  const handleEquipSkin = async (skinId: string) => {
    if (!address) return;
    
    // Check if this is a claim action (skin not yet unlocked but requirements met)
    if (!unlockedSkins.includes(skinId)) {
      // Claim the skin first
      try {
        const res = await fetch('/api/games/skin-market/claim-skin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.toLowerCase(), skinId }),
        });
        if (res.ok) {
          setUnlockedSkins(prev => [...prev, skinId]);
        }
      } catch (e) {
        console.error("Failed to claim skin:", e);
        return;
      }
    }
    
    // Equip the skin
    try {
      const res = await fetch('/api/games/skin-market/equip-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.toLowerCase(), skinId }),
      });
      if (res.ok) {
        setEquippedSkin(skinId);
      }
    } catch (e) {
      console.error("Failed to equip skin:", e);
    }
  };

  const filteredSkins = selectedGame === 'all' 
    ? ACHIEVEMENT_SKINS 
    : ACHIEVEMENT_SKINS.filter(s => s.gameId === selectedGame);

  const games = [
    { id: 'all' as const, name: 'All', icon: Trophy },
    { id: 'flappy-donut' as const, name: 'Flappy', icon: Gamepad2 },
    { id: 'glaze-stack' as const, name: 'Stack', icon: Layers },
    { id: 'donut-dash' as const, name: 'Dash', icon: Rocket },
  ];

  const totalUnlocked = unlockedSkins.length;
  const totalSkins = ACHIEVEMENT_SKINS.length;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
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
          <div className="flex-1">
            <h1 className="text-xl font-bold">Skin Collection</h1>
            <p className="text-xs text-zinc-400">Unlock skins by playing games</p>
          </div>
          {isPremium && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full">
              <Crown className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400 font-bold">Premium</span>
            </div>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 space-y-4">
            
            {/* Premium Unlock Card (show if not premium) */}
            {!isPremium && (
              <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                    <Crown className="w-8 h-8 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-amber-400 mb-1">Unlock Premium</h2>
                    <p className="text-sm text-zinc-400 mb-3">
                      Get access to earn exclusive skins by playing games. One-time payment, forever access!
                    </p>
                    <ul className="text-xs text-zinc-500 space-y-1 mb-4">
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-400" />
                        <span>Unlock 12 unique donut skins</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-400" />
                        <span>6 animated epic & legendary skins</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-400" />
                        <span>Track your achievements</span>
                      </li>
                    </ul>
                  </div>
                </div>
                
                {purchaseError && (
                  <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400">{purchaseError}</p>
                  </div>
                )}
                
                <button
                  onClick={handlePurchasePremium}
                  disabled={isPending || isTxLoading || !address}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending || isTxLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : !address ? (
                    'Connect Wallet'
                  ) : (
                    <>
                      <Crown className="w-4 h-4" />
                      Unlock for {PREMIUM_PRICE} 🍩
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Stats Card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Skins Collected</p>
                  <p className="text-2xl font-bold">{totalUnlocked} <span className="text-zinc-500 text-lg">/ {totalSkins}</span></p>
                </div>
                <div className="flex -space-x-3">
                  {ACHIEVEMENT_SKINS.slice(0, 4).map((skin, i) => (
                    <div key={skin.id} className="w-10 h-10 rounded-full border-2 border-black overflow-hidden" style={{ backgroundColor: unlockedSkins.includes(skin.id) ? skin.color : '#27272a' }}>
                      {!unlockedSkins.includes(skin.id) && (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock className="w-3 h-3 text-zinc-600" />
                        </div>
                      )}
                    </div>
                  ))}
                  {totalSkins > 4 && (
                    <div className="w-10 h-10 rounded-full border-2 border-black bg-zinc-800 flex items-center justify-center text-xs">
                      +{totalSkins - 4}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Game Filter */}
            <div className="flex gap-2">
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                    selectedGame === game.id 
                      ? 'bg-white text-black' 
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <game.icon className="w-3 h-3" />
                  {game.name}
                </button>
              ))}
            </div>
            
            {/* Skins Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {filteredSkins.map(skin => (
                <AchievementCard
                  key={skin.id}
                  skin={skin}
                  isPremium={isPremium}
                  userStats={userStats[skin.gameId]}
                  unlockedSkins={unlockedSkins}
                  equippedSkin={equippedSkin}
                  onEquip={handleEquipSkin}
                />
              ))}
            </div>
            
            {/* How it works */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                How to Unlock Skins
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Get Premium</p>
                    <p className="text-xs text-zinc-500">One-time {PREMIUM_PRICE} DONUT payment unlocks all achievements</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Gamepad2 className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Play Games</p>
                    <p className="text-xs text-zinc-500">Each game has 4 skins to unlock based on milestones</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Earn Achievements</p>
                    <p className="text-xs text-zinc-500">Common → Rare → Epic → Legendary</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Tier Legend */}
            <div className="flex items-center justify-center gap-3 text-xs text-zinc-500 pb-4 flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-zinc-600" />
                <span>Common</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span>Rare</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                <span>Epic</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>Legendary</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <NavBar />
    </main>
  );
}