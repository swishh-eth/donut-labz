"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ChevronLeft, Lock, Check, Crown, Gamepad2, Layers, Rocket,
  Trophy, Star, Zap, Sparkles, HelpCircle, X, Users
} from "lucide-react";

// Helper to get initials
const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  return stripped ? stripped.slice(0, 2).toUpperCase() : label.slice(0, 2).toUpperCase();
};

// Sprinkle icon component
const SprinkleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="10" width="16" height="4" rx="2" fill="#FF6B6B" />
    <rect x="7" y="4" width="10" height="4" rx="2" fill="#4ECDC4" transform="rotate(45 12 6)" />
    <rect x="7" y="16" width="10" height="4" rx="2" fill="#FFE66D" transform="rotate(-45 12 18)" />
  </svg>
);

// Contract addresses
const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

const ERC20_ABI = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

// Premium price in DONUT (burned)
const PREMIUM_PRICE = 1000;

// Achievement skin definitions
type SkinTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'ultimate';
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
  animationType?: 'rainbow' | 'glow' | 'pulse' | 'sparkle' | 'fire' | 'electric';
}

const ACHIEVEMENT_SKINS: AchievementSkin[] = [
  // Flappy Donut Skins (6 total)
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
    requirement: { type: 'high_score', value: 300, description: 'Score 300+' },
    animated: true,
    animationType: 'glow',
  },
  {
    id: 'flappy-mythic',
    name: 'Storm Chaser',
    color: '#7C3AED',
    tier: 'mythic',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'games_played', value: 250, description: 'Play 250 games' },
    animated: true,
    animationType: 'electric',
  },
  {
    id: 'flappy-ultimate',
    name: 'Sky Legend',
    color: '#F472B6',
    tier: 'ultimate',
    gameId: 'flappy-donut',
    gameName: 'Flappy Donut',
    gameIcon: Gamepad2,
    requirement: { type: 'games_played', value: 500, description: 'Play 500 games' },
    animated: true,
    animationType: 'rainbow',
  },
  
  // Glaze Stack Skins (6 total)
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
    requirement: { type: 'high_score', value: 100, description: 'Score 100+' },
    animated: true,
    animationType: 'rainbow',
  },
  {
    id: 'stack-mythic',
    name: 'Tower Titan',
    color: '#14B8A6',
    tier: 'mythic',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'games_played', value: 250, description: 'Play 250 games' },
    animated: true,
    animationType: 'electric',
  },
  {
    id: 'stack-ultimate',
    name: 'Stack God',
    color: '#F59E0B',
    tier: 'ultimate',
    gameId: 'glaze-stack',
    gameName: 'Glaze Stack',
    gameIcon: Layers,
    requirement: { type: 'games_played', value: 500, description: 'Play 500 games' },
    animated: true,
    animationType: 'fire',
  },
  
  // Donut Dash Skins (6 total)
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
    requirement: { type: 'high_score', value: 1000, description: '1000+ sprinkles' },
    animated: true,
    animationType: 'sparkle',
  },
  {
    id: 'dash-mythic',
    name: 'Void Walker',
    color: '#6366F1',
    tier: 'mythic',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'games_played', value: 250, description: 'Play 250 games' },
    animated: true,
    animationType: 'electric',
  },
  {
    id: 'dash-ultimate',
    name: 'Dash Deity',
    color: '#10B981',
    tier: 'ultimate',
    gameId: 'donut-dash',
    gameName: 'Donut Dash',
    gameIcon: Rocket,
    requirement: { type: 'games_played', value: 500, description: 'Play 500 games' },
    animated: true,
    animationType: 'fire',
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
      
      // Get animated color
      let color = skin.color;
      if (skin.animated && !locked) {
        if (skin.animationType === 'rainbow') {
          const hue = (time / 20) % 360;
          color = `hsl(${hue}, 70%, 50%)`;
        } else if (skin.animationType === 'pulse') {
          const pulse = Math.sin(time / 300) * 0.2 + 0.8;
          const rgb = hexToRgb(skin.color);
          if (rgb) {
            const r = Math.round(rgb.r * pulse + 255 * (1 - pulse) * 0.3);
            const g = Math.round(rgb.g * pulse + 255 * (1 - pulse) * 0.3);
            const b = Math.round(rgb.b * pulse + 255 * (1 - pulse) * 0.3);
            color = `rgb(${r}, ${g}, ${b})`;
          }
        } else if (skin.animationType === 'sparkle') {
          const sparkle = Math.sin(time / 100) * 0.3 + 0.7;
          const rgb = hexToRgb(skin.color);
          if (rgb) {
            const r = Math.min(255, Math.round(rgb.r + 100 * sparkle));
            const g = Math.min(255, Math.round(rgb.g + 100 * sparkle));
            const b = Math.min(255, Math.round(rgb.b + 100 * sparkle));
            color = `rgb(${r}, ${g}, ${b})`;
          }
        } else if (skin.animationType === 'glow') {
          ctx.shadowColor = skin.color;
          ctx.shadowBlur = 10 + Math.sin(time / 200) * 8;
        } else if (skin.animationType === 'fire') {
          const hue = 20 + Math.sin(time / 150) * 20; // Orange to red
          const lightness = 50 + Math.sin(time / 100) * 10;
          color = `hsl(${hue}, 90%, ${lightness}%)`;
          ctx.shadowColor = '#FF4500';
          ctx.shadowBlur = 8 + Math.sin(time / 100) * 5;
        } else if (skin.animationType === 'electric') {
          const lightness = 50 + Math.sin(time / 50) * 20;
          const hue = 250 + Math.sin(time / 200) * 30; // Blue to purple
          color = `hsl(${hue}, 80%, ${lightness}%)`;
          if (Math.random() > 0.9) {
            ctx.shadowColor = '#00BFFF';
            ctx.shadowBlur = 15;
          }
        }
      }
      
      // Draw donut
      const gradient = ctx.createRadialGradient(
        centerX - radius * 0.2, centerY - radius * 0.2, 0,
        centerX, centerY, radius
      );
      gradient.addColorStop(0, lightenColor(color, 30));
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, darkenColor(color, 30));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Reset shadow
      ctx.shadowBlur = 0;
      
      // Draw hole
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Progress ring (if locked)
      if (locked && progress > 0) {
        ctx.strokeStyle = skin.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
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
  }, [skin, size, locked, progress]);
  
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

// Helper functions
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function lightenColor(color: string, percent: number): string {
  if (color.startsWith('hsl') || color.startsWith('rgb')) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const r = Math.min(255, rgb.r + (255 - rgb.r) * percent / 100);
  const g = Math.min(255, rgb.g + (255 - rgb.g) * percent / 100);
  const b = Math.min(255, rgb.b + (255 - rgb.b) * percent / 100);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function darkenColor(color: string, percent: number): string {
  if (color.startsWith('hsl') || color.startsWith('rgb')) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const r = rgb.r * (100 - percent) / 100;
  const g = rgb.g * (100 - percent) / 100;
  const b = rgb.b * (100 - percent) / 100;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
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

// Get tier badge color
function getTierBadgeColor(tier: SkinTier): string {
  switch (tier) {
    case 'ultimate': return 'bg-gradient-to-br from-amber-400 to-orange-500';
    case 'mythic': return 'bg-gradient-to-br from-violet-500 to-purple-600';
    case 'legendary': return 'bg-yellow-500';
    case 'epic': return 'bg-cyan-500';
    case 'rare': return 'bg-purple-500';
    default: return 'bg-zinc-600';
  }
}

// Get tier icon
function getTierIcon(tier: SkinTier) {
  switch (tier) {
    case 'ultimate': return <Crown className="w-3 h-3 text-black" />;
    case 'mythic': return <Sparkles className="w-3 h-3 text-white" />;
    case 'legendary': return <Sparkles className="w-3 h-3 text-black" />;
    case 'epic': return <Zap className="w-3 h-3 text-black" />;
    case 'rare': return <Star className="w-3 h-3 text-white" />;
    default: return <Trophy className="w-3 h-3 text-white" />;
  }
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
      <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center ${getTierBadgeColor(skin.tier)}`}>
        {getTierIcon(skin.tier)}
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
      
      {/* Progress or status - fixed height for consistent alignment */}
      <div className="min-h-[52px] flex flex-col justify-end">
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
          <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-600 w-full">
            <Crown className="w-3 h-3 shrink-0" />
            <span>Premium</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SkinMarketPage() {
  const { address, isConnecting, isReconnecting } = useAccount();
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>([]);
  const [equippedSkin, setEquippedSkin] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameId | 'all'>('all');
  const [showPremiumHelp, setShowPremiumHelp] = useState(false);
  const [premiumCount, setPremiumCount] = useState(0);
  
  // User stats per game
  const [userStats, setUserStats] = useState<Record<GameId, { gamesPlayed: number; highScore: number; totalScore: number }>>({
    'flappy-donut': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    'glaze-stack': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
    'donut-dash': { gamesPlayed: 0, highScore: 0, totalScore: 0 },
  });
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
  // Give wagmi time to initialize before showing content
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);
  
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Fetch premium count (burn stats)
  useEffect(() => {
    fetch('/api/burn-stats')
      .then(r => r.json())
      .then(data => {
        if (data.premiumUsers) setPremiumCount(data.premiumUsers);
      })
      .catch(console.error);
  }, []);

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
    // Wait for mount and wallet connection to be determined
    if (!isMounted || isConnecting || isReconnecting) return;
    
    if (!address) {
      setIsLoading(false);
      setHasFetched(true);
      return;
    }
    
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const fidParam = context?.user?.fid ? `&fid=${context.user.fid}` : '';
        const res = await fetch(`/api/games/skin-market/user-data?address=${address}${fidParam}`);
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
        setHasFetched(true);
      }
    };
    
    fetchUserData();
  }, [address, isConnecting, isReconnecting, isMounted, context?.user?.fid]);

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
      setPurchaseError(`Need ${PREMIUM_PRICE.toLocaleString()} sprinkles to unlock premium`);
      return;
    }
    
    setPurchaseError(null);
    setIsPurchasing(true);
    
    writeContract({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [DEAD_ADDRESS, costWei],
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
          body: JSON.stringify({ 
            address: address.toLowerCase(), 
            skinId,
            fid: context?.user?.fid,
          }),
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
        
        {/* Header - matches Games page style */}
        <div className="flex items-center justify-between px-4 mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.location.href = "/games"}
              className="p-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl font-bold tracking-wide">COLLECTION</h1>
          </div>
          {context?.user && (
            <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
              <div className="relative">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={context.user.pfpUrl || undefined} alt={context.user.displayName || context.user.username} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(context.user.displayName || context.user.username)}</AvatarFallback>
                </Avatar>
                {isPremium && hasFetched && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center border border-black">
                    <Crown className="w-2.5 h-2.5 text-black" />
                  </div>
                )}
              </div>
              <div className="leading-tight text-left">
                <div className="text-sm font-bold">{context.user.displayName || context.user.username}</div>
                {context.user.username && <div className="text-xs text-gray-400">@{context.user.username}</div>}
              </div>
            </div>
          )}
        </div>
        
        {(!isMounted || isLoading || isConnecting || isReconnecting || !hasFetched) ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 space-y-4">
            
            {/* Compact Premium Unlock Card (show if not premium) */}
            {!isPremium && (
              <div className="relative bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-xl p-4">
                {/* Help button */}
                <button
                  onClick={() => setShowPremiumHelp(true)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
                >
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                </button>
                
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Crown className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <h2 className="text-base font-bold text-amber-400">Unlock Premium</h2>
                    <p className="text-xs text-zinc-400">Earn {totalSkins} unique skins by playing</p>
                  </div>
                </div>
                
                {premiumCount > 0 && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
                    <Users className="w-3.5 h-3.5" />
                    <span><span className="text-amber-400 font-semibold">{premiumCount}</span> {premiumCount === 1 ? 'player has' : 'players have'} unlocked premium</span>
                  </div>
                )}
                
                {purchaseError && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400">{purchaseError}</p>
                  </div>
                )}
                
                <button
                  onClick={handlePurchasePremium}
                  disabled={isPending || isTxLoading || !address}
                  className="w-full mt-3 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
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
                      Burn {PREMIUM_PRICE.toLocaleString()} <SprinkleIcon className="w-4 h-4 inline-block" />
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Premium Help Modal */}
            {showPremiumHelp && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="w-full max-w-sm bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-amber-400" />
                      <span className="font-bold">Premium Benefits</span>
                    </div>
                    <button onClick={() => setShowPremiumHelp(false)} className="text-zinc-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <p className="text-sm text-zinc-400 flex items-center flex-wrap gap-1">
                      <span>Burn {PREMIUM_PRICE.toLocaleString()}</span>
                      <SprinkleIcon className="w-4 h-4 inline-block" />
                      <span>to unlock forever access to earn skins by playing games.</span>
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>Unlock {totalSkins} unique donut skins</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>Animated epic, legendary, mythic & ultimate skins</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>Track your achievements across all games</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>Use skins in all Sprinkles games</span>
                      </li>
                    </ul>
                    <div className="pt-2 border-t border-zinc-800">
                      <p className="text-xs text-zinc-500">Sprinkles are burned forever. Skins are tied to your wallet.</p>
                    </div>
                  </div>
                  <div className="p-4 border-t border-zinc-800 bg-zinc-800/50">
                    <button onClick={() => setShowPremiumHelp(false)} className="w-full py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200">
                      Got it!
                    </button>
                  </div>
                </div>
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
            
            {/* Tier Legend */}
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 pb-4 flex-wrap">
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
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-violet-500" />
                <span>Mythic</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
                <span>Ultimate</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <NavBar />
    </main>
  );
}