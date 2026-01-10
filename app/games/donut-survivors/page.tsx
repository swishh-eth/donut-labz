"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { X, HelpCircle, Volume2, VolumeX, Trophy, ChevronRight, Clock, Music, Share2 } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";

// Free Arcade Contract for Donut Survivors
const FREE_ARCADE_CONTRACT = "0xb2aA178Cd178A7330a7dFA966Ff2f723aaDb8fAF" as const;

const FREE_ARCADE_ABI = [
  {
    inputs: [{ name: "gameId", type: "string" }],
    name: "play",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

type PlayState = 'idle' | 'confirming' | 'recording' | 'error';

// Game constants
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 480;
const CANVAS_SCALE = 2;
const SCALED_WIDTH = CANVAS_WIDTH * CANVAS_SCALE;
const SCALED_HEIGHT = CANVAS_HEIGHT * CANVAS_SCALE;

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;

const PLAYER_SIZE = 36;
const PLAYER_SPEED = 2.8;
const PLAYER_MAX_HP = 120;

// XP progression (original values)
const BASE_XP_TO_LEVEL = 17;
const XP_SCALE = 1.1;

// Spatial grid for performance
const GRID_CELL_SIZE = 100;
const GRID_WIDTH = Math.ceil(WORLD_WIDTH / GRID_CELL_SIZE);
const GRID_HEIGHT = Math.ceil(WORLD_HEIGHT / GRID_CELL_SIZE);

const MAX_WEAPONS = 4;
const MAX_GADGETS = 4;

// Performance limits
const MAX_PARTICLES = 150;
const MAX_DAMAGE_NUMBERS = 30;
const MAX_PROJECTILES = 100;
const MAX_ENEMIES = 80;
const MAX_XP_ORBS = 150;

type WeaponType = 'sprinkle_shot' | 'frosting_ring' | 'glaze_wave' | 'sugar_stars' | 'orbiting_donuts' | 'cinnamon_trail' | 'candy_cannon' | 'mint_missiles';
type EnemyType = 'sprinkle' | 'gummy' | 'candy_corn' | 'chocolate_chunk' | 'jellybean' | 'licorice' | 'wind_spirit' | 'boss' | 'final_boss';
type GadgetType = 'sugar_rush' | 'thicc_glaze' | 'sprinkle_magnet' | 'donut_armor' | 'hyper_icing' | 'golden_sprinkles' | 'choco_shield' | 'candy_rush';
type UpgradeType = 'weapon' | 'gadget';
type MiniAppContext = { user?: { fid: number; username?: string; displayName?: string; pfpUrl?: string } };

interface Weapon { type: WeaponType; level: number; lastFired: number; angle?: number; }
interface Gadget { type: GadgetType; stacks: number; }
interface Enemy { x: number; y: number; type: EnemyType; hp: number; maxHp: number; speed: number; size: number; xpValue: number; damage: number; color: string; hitFlash: number; spawnAnim: number; zigzagPhase?: number; splitCount?: number; spawnTime?: number; }
interface Projectile { x: number; y: number; vx: number; vy: number; damage: number; size: number; color: string; piercing: number; lifetime: number; weaponType: WeaponType; trailTimer: number; }
interface XPOrb { x: number; y: number; value: number; size: number; collectAnim: number; spawnTime: number; magnetized?: boolean; }
interface DamageNumber { x: number; y: number; value: number; life: number; vy: number; isCrit?: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; type?: 'spark' | 'ring' | 'glow' | 'burst'; }
interface UpgradeOption { type: UpgradeType; weaponType?: WeaponType; gadgetType?: GadgetType; title: string; description: string; icon: string; }
interface LeaderboardEntry { rank: number; fid: number; username?: string; displayName?: string; pfpUrl?: string; score: number; }
interface Trail { x: number; y: number; life: number; color: string; }

type PowerUpType = 'magnet_burst' | 'health' | 'freeze';
interface PowerUp { x: number; y: number; type: PowerUpType; size: number; }

const POWERUP_CONFIG: Record<PowerUpType, { icon: string; color: string; name: string }> = {
  magnet_burst: { icon: '⊛', color: '#FF00FF', name: 'Magnet Burst' },
  health: { icon: '♥', color: '#FF6B6B', name: 'Health' },
  freeze: { icon: '❄', color: '#00FFFF', name: 'Freeze' },
};

const WEAPON_CONFIG: Record<WeaponType, { name: string; icon: string; color: string; baseDamage: number; baseCooldown: number; description: string }> = {
  sprinkle_shot: { name: 'Sprinkle Shot', icon: '◆', color: '#FF6B6B', baseDamage: 10, baseCooldown: 500, description: 'Fires sprinkles at nearest enemy' },
  frosting_ring: { name: 'Frosting Ring', icon: '◎', color: '#60A5FA', baseDamage: 8, baseCooldown: 100, description: 'Rotating ring of frosting damage' },
  glaze_wave: { name: 'Glaze Wave', icon: '◈', color: '#F472B6', baseDamage: 15, baseCooldown: 2000, description: 'Periodic wave damages all nearby' },
  sugar_stars: { name: 'Sugar Stars', icon: '✦', color: '#FBBF24', baseDamage: 6, baseCooldown: 800, description: 'Shoots stars in all directions' },
  orbiting_donuts: { name: 'Orbiting Donuts', icon: '◉', color: '#F472B6', baseDamage: 12, baseCooldown: 50, description: 'Donuts orbit around you' },
  cinnamon_trail: { name: 'Cinnamon Trail', icon: '▬', color: '#F97316', baseDamage: 5, baseCooldown: 100, description: 'Leave a burning trail' },
  candy_cannon: { name: 'Candy Cannon', icon: '●', color: '#A78BFA', baseDamage: 25, baseCooldown: 1500, description: 'Explosive candy balls' },
  mint_missiles: { name: 'Mint Missiles', icon: '▲', color: '#4ADE80', baseDamage: 8, baseCooldown: 1000, description: 'Homing missiles' },
};

const WEAPON_STATS: Record<WeaponType, { stat: string; perLevel: string }> = {
  sprinkle_shot: { stat: 'Projectiles', perLevel: '+1 every 3 lvl' },
  frosting_ring: { stat: 'Ring Size', perLevel: '+8 radius/lvl' },
  glaze_wave: { stat: 'Wave Range', perLevel: '+20 radius/lvl' },
  sugar_stars: { stat: 'Star Count', perLevel: '+1 star/lvl' },
  orbiting_donuts: { stat: 'Donut Count', perLevel: '+1 every 2 lvl' },
  cinnamon_trail: { stat: 'Trail Duration', perLevel: '+15 frames/lvl' },
  candy_cannon: { stat: 'Explosion', perLevel: '+1 radius/lvl' },
  mint_missiles: { stat: 'Missile Count', perLevel: '+1 every 3 lvl' },
};

const WEAPON_UNLOCK: Record<WeaponType, number> = { sprinkle_shot: 0, frosting_ring: 10, sugar_stars: 50, glaze_wave: 100, orbiting_donuts: 200, cinnamon_trail: 300, candy_cannon: 400, mint_missiles: 500 };
const STARTER_WEAPONS: WeaponType[] = ['sprinkle_shot', 'frosting_ring', 'sugar_stars', 'glaze_wave', 'orbiting_donuts', 'cinnamon_trail', 'candy_cannon', 'mint_missiles'];

const GADGET_CONFIG: Record<GadgetType, { name: string; icon: string; color: string; description: string; effect: string }> = {
  sugar_rush: { name: 'Sugar Rush', icon: '↯', color: '#FBBF24', description: '+20% Move Speed', effect: 'speed' },
  thicc_glaze: { name: 'Thicc Glaze', icon: '▣', color: '#60A5FA', description: '+30 Max HP', effect: 'max_hp' },
  sprinkle_magnet: { name: 'Sprinkle Magnet', icon: '⊕', color: '#A78BFA', description: '+40% Pickup Range', effect: 'magnet' },
  donut_armor: { name: 'Donut Armor', icon: '○', color: '#F472B6', description: '-15% Damage Taken', effect: 'defense' },
  hyper_icing: { name: 'Hyper Icing', icon: '★', color: '#FF6B6B', description: '+15% All Damage', effect: 'damage' },
  golden_sprinkles: { name: 'Golden Sprinkles', icon: '✧', color: '#FFD700', description: '+25% XP Gain', effect: 'xp_gain' },
  choco_shield: { name: 'Choco Shield', icon: '■', color: '#8B4513', description: '+0.5s Invincibility', effect: 'invincibility' },
  candy_rush: { name: 'Candy Rush', icon: '◇', color: '#FF69B4', description: '-10% Cooldowns', effect: 'cooldown' },
};
const GADGET_ORDER: GadgetType[] = ['sugar_rush', 'thicc_glaze', 'sprinkle_magnet', 'donut_armor', 'hyper_icing', 'golden_sprinkles', 'choco_shield', 'candy_rush'];

// Rebalanced enemy config with new types
const ENEMY_CONFIG: Record<EnemyType, { hp: number; speed: number; size: number; xpValue: number; damage: number; color: string; spawnWeight: number }> = {
  sprinkle: { hp: 15, speed: 1.0, size: 16, xpValue: 2, damage: 8, color: '#FF6B6B', spawnWeight: 45 },
  gummy: { hp: 30, speed: 1.1, size: 20, xpValue: 4, damage: 12, color: '#4ADE80', spawnWeight: 25 },
  candy_corn: { hp: 10, speed: 1.8, size: 12, xpValue: 2, damage: 6, color: '#FBBF24', spawnWeight: 15 },
  jellybean: { hp: 18, speed: 1.6, size: 14, xpValue: 3, damage: 10, color: '#FF69B4', spawnWeight: 10 }, // Zigzag movement
  licorice: { hp: 45, speed: 0.6, size: 24, xpValue: 8, damage: 15, color: '#1a1a1a', spawnWeight: 5 }, // Splits on death
  chocolate_chunk: { hp: 90, speed: 0.45, size: 32, xpValue: 12, damage: 20, color: '#A78BFA', spawnWeight: 3 },
  wind_spirit: { hp: 1, speed: 4.0, size: 18, xpValue: 0, damage: 0, color: '#87CEEB', spawnWeight: 0 }, // Push only, spawns in hordes
  boss: { hp: 25000, speed: 0.7, size: 70, xpValue: 200, damage: 40, color: '#FF1744', spawnWeight: 0 },
  final_boss: { hp: 50000, speed: 1.2, size: 120, xpValue: 500, damage: 9999, color: '#000000', spawnWeight: 0 },
};

// Prize info
interface PrizeInfo {
  totalPrize: number;
  prizeStructure: { rank: number; percent: number; amount: string }[];
}

const PRIZE_PERCENTAGES = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];

function calculatePrizeStructure(totalPrize: number) {
  return PRIZE_PERCENTAGES.map((percent, i) => ({
    rank: i + 1,
    percent,
    amount: ((totalPrize * percent) / 100).toFixed(2),
  }));
}

const DEFAULT_PRIZE_INFO: PrizeInfo = {
  totalPrize: 5,
  prizeStructure: calculatePrizeStructure(5),
};

function getSpatialCell(x: number, y: number): number { return Math.floor(y / GRID_CELL_SIZE) * GRID_WIDTH + Math.floor(x / GRID_CELL_SIZE); }
function getNearbyCells(x: number, y: number, radius: number): number[] {
  const cells: number[] = [];
  const minCx = Math.max(0, Math.floor((x - radius) / GRID_CELL_SIZE)), maxCx = Math.min(GRID_WIDTH - 1, Math.floor((x + radius) / GRID_CELL_SIZE));
  const minCy = Math.max(0, Math.floor((y - radius) / GRID_CELL_SIZE)), maxCy = Math.min(GRID_HEIGHT - 1, Math.floor((y + radius) / GRID_CELL_SIZE));
  for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) cells.push(cy * GRID_WIDTH + cx);
  return cells;
}

function getTimeUntilReset(): string {
  const now = new Date(), utcNow = new Date(now.toUTCString()), nextReset = new Date(utcNow);
  let daysUntilFriday = (5 - utcNow.getUTCDay() + 7) % 7;
  if (daysUntilFriday === 0 && utcNow.getUTCHours() >= 23) daysUntilFriday = 7;
  nextReset.setUTCDate(utcNow.getUTCDate() + daysUntilFriday);
  nextReset.setUTCHours(23, 0, 0, 0);
  const diff = nextReset.getTime() - utcNow.getTime();
  const days = Math.floor(diff / 86400000), hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

function getGadgetBonus(type: GadgetType, stacks: number): string {
  switch (type) {
    case 'sugar_rush': return `+${stacks * 20}% Speed`;
    case 'thicc_glaze': return `+${stacks * 30} HP`;
    case 'sprinkle_magnet': return `+${Math.round((Math.pow(1.4, stacks) - 1) * 100)}% Range`;
    case 'donut_armor': return `-${Math.min(stacks * 15, 75)}% Dmg`;
    case 'hyper_icing': return `+${Math.round((Math.pow(1.15, stacks) - 1) * 100)}% Dmg`;
    case 'golden_sprinkles': return `+${Math.round((Math.pow(1.25, stacks) - 1) * 100)}% XP`;
    case 'choco_shield': return `+${stacks * 0.5}s I-Frames`;
    case 'candy_rush': return `-${stacks * 10}% CD`;
    default: return '';
  }
}

export default function DonutSurvivorsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const { address } = useAccount();
  
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "levelup" | "gameover" | "equipment">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [killCount, setKillCount] = useState(0);
  const [userPfp, setUserPfp] = useState<string | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [selectedStarterWeapon, setSelectedStarterWeapon] = useState<WeaponType>('sprinkle_shot');
  const [showWeaponMenu, setShowWeaponMenu] = useState(false);
  const [showGadgetInfo, setShowGadgetInfo] = useState(false);
  const [rerollsLeft, setRerollsLeft] = useState(2);
  const [bansLeft, setBansLeft] = useState(1);
  const [bannedUpgrades, setBannedUpgrades] = useState<string[]>([]);
  const [banMode, setBanMode] = useState(false);
  const [equipmentData, setEquipmentData] = useState<{ weapons: Weapon[], gadgets: Gadget[], player: any } | null>(null);
  const [resetCountdown, setResetCountdown] = useState<string>(getTimeUntilReset());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isMusicOn, setIsMusicOn] = useState(true);
  
  // Play state management
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const currentEntryIdRef = useRef<string | null>(null);
  const currentFidRef = useRef<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gamesPlayedThisWeek, setGamesPlayedThisWeek] = useState(0);
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo>(DEFAULT_PRIZE_INFO);
  
  // Wagmi hooks
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  
  const playerRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, xp: 0, xpToLevel: BASE_XP_TO_LEVEL, level: 1, speed: PLAYER_SPEED, damage: 1, magnetRange: 70, xpMultiplier: 1, defense: 0, invincibilityBonus: 0, cooldownReduction: 0, vx: 0, vy: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const weaponsRef = useRef<Weapon[]>([]);
  const gadgetsRef = useRef<Gadget[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const xpOrbsRef = useRef<XPOrb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const trailPointsRef = useRef<{ x: number; y: number; life: number }[]>([]);
  const projectileTrailsRef = useRef<Trail[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const enemyGridRef = useRef<Map<number, Enemy[]>>(new Map());
  const freezeUntilRef = useRef(0);
  const screenFlashRef = useRef({ intensity: 0, color: '#FFF' });
  const lastWindHordeRef = useRef(0);
  
  const gameActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameStartTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const screenShakeRef = useRef({ intensity: 0, duration: 0, startTime: 0 });
  const joystickRef = useRef({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const moveInputRef = useRef({ x: 0, y: 0 });
  const enemiesKilledRef = useRef(0);
  const bossSpawnedRef = useRef(false);
  const bossWarningRef = useRef(false);
  const finalBossSpawnedRef = useRef(false);
  const finalBossWarningRef = useRef(false);
  const endlessModeRef = useRef(false);
  const endlessDifficultyRef = useRef(1.0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const donutImageRef = useRef<HTMLImageElement | null>(null);
  const donutLoadedRef = useRef(false);
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const pfpLoadedRef = useRef(false);
  
  // Anti-cheat metrics refs
  const xpCollectedRef = useRef(0);
  const damageDealtRef = useRef(0);
  const damageTakenRef = useRef(0);
  const powerUpsCollectedRef = useRef(0);
  const bossesDefeatedRef = useRef(0);
  
  // Sound throttling
  const lastSoundTimeRef = useRef<Record<string, number>>({});
  const activeSoundsRef = useRef(0);
  const maxConcurrentSounds = 4;
  
  // Music system with style changes every 5 minutes
  const musicNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
  const musicIntervalRef = useRef<number | null>(null);
  const musicPlayingRef = useRef(false);
  const musicStyleRef = useRef(0);

  useEffect(() => { const i = setInterval(() => setResetCountdown(getTimeUntilReset()), 60000); return () => clearInterval(i); }, []);
  useEffect(() => { (async () => { try { const ctx = await (sdk as any).context; if (ctx?.user) { setContext(ctx); if (ctx.user.pfpUrl) setUserPfp(ctx.user.pfpUrl); } } catch {} })(); }, []);
  useEffect(() => { sdk.actions.ready().catch(() => {}); }, []);
  useEffect(() => { if (!userPfp) return; const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { pfpImageRef.current = img; pfpLoadedRef.current = true; }; img.src = userPfp; }, [userPfp]);
  useEffect(() => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { donutImageRef.current = img; donutLoadedRef.current = true; }; img.src = '/coins/donut_logo.png'; }, []);
  useEffect(() => {
    const prevent = (e: TouchEvent) => { if (gameState === "playing") e.preventDefault(); };
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('touchstart', prevent, { passive: false });
    return () => { document.removeEventListener('touchmove', prevent); document.removeEventListener('touchstart', prevent); };
  }, [gameState]);
  
  // Fetch prize info
  useEffect(() => {
    const fetchPrizeInfo = async () => {
      try {
        const res = await fetch('/api/games/donut-survivors/prize-distribute');
        if (res.ok) {
          const data = await res.json();
          setPrizeInfo({
            totalPrize: data.totalPrize,
            prizeStructure: data.prizeStructure || calculatePrizeStructure(data.totalPrize),
          });
        }
      } catch (e) {
        console.error("Failed to fetch prize info:", e);
      }
    };
    fetchPrizeInfo();
  }, []);
  
  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const fid = context?.user?.fid;
      const url = fid ? `/api/games/donut-survivors/leaderboard?fid=${fid}&limit=10` : `/api/games/donut-survivors/leaderboard?limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard);
        if (data.userStats) {
          setGamesPlayedThisWeek(data.userStats.gamesPlayed || 0);
          setGamesPlayed(data.userStats.gamesPlayed || 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    }
  }, [context?.user?.fid]);
  
  useEffect(() => {
    if (context?.user?.fid) fetchLeaderboard();
  }, [context?.user?.fid, fetchLeaderboard]);
  
  // Submit score with anti-cheat metrics
  const submitScore = useCallback(async (finalScore: number, st: number, kills: number) => {
    const entryId = currentEntryIdRef.current;
    const fid = currentFidRef.current;
    if (!entryId || !fid) return;
    
    const gameDurationMs = Date.now() - gameStartTimeRef.current;
    const level = playerRef.current.level;
    const weaponsAcquired = weaponsRef.current.length;
    const gadgetsAcquired = gadgetsRef.current.length;
    const xpCollected = xpCollectedRef.current;
    const damageDealt = damageDealtRef.current;
    const damageTaken = damageTakenRef.current;
    const powerUpsCollected = powerUpsCollectedRef.current;
    const bossesDefeated = bossesDefeatedRef.current;
    
    const killsPerMinute = st > 0 ? (kills / st) * 60 : 0;
    const xpPerMinute = st > 0 ? (xpCollected / st) * 60 : 0;
    
    const metricsString = `${finalScore}-${gameDurationMs}-${st}-${kills}-${level}-${entryId}`;
    const checksum = Array.from(metricsString).reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0).toString(16);
    
    const metrics = {
      gameDurationMs,
      survivalTimeSeconds: st,
      kills,
      xpCollected,
      level,
      weaponsAcquired,
      gadgetsAcquired,
      bossesDefeated,
      powerUpsCollected,
      damageDealt: Math.round(damageDealt),
      damageTaken: Math.round(damageTaken),
      killsPerMinute: Math.round(killsPerMinute * 100) / 100,
      xpPerMinute: Math.round(xpPerMinute * 100) / 100,
      checksum,
    };
    
    console.log("[Donut Survivors] Submitting score with metrics:", { finalScore, st, kills, metrics });
    
    try {
      await fetch("/api/games/donut-survivors/submit-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, score: finalScore, survivalTime: st, kills, fid, metrics }),
      });
    } catch (error) {
      console.error("Failed to submit score:", error);
    }
  }, []);

  const initAudio = useCallback(() => { if (!audioContextRef.current) { try { audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); audioContextRef.current.state === 'suspended' && audioContextRef.current.resume(); } catch {} } }, []);
  
  // Throttled sound player to prevent audio overload
  const playSound = useCallback((freq: number, dur: number, type: OscillatorType = 'sine', vol: number = 0.1, soundKey?: string) => {
    if (isMuted || !audioContextRef.current) return;
    if (activeSoundsRef.current >= maxConcurrentSounds) return;
    if (soundKey) {
      const now = Date.now();
      const lastTime = lastSoundTimeRef.current[soundKey] || 0;
      const minInterval = soundKey === 'hit' ? 50 : soundKey === 'xp' ? 30 : 100;
      if (now - lastTime < minInterval) return;
      lastSoundTimeRef.current[soundKey] = now;
    }
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
      activeSoundsRef.current++;
      osc.onended = () => { activeSoundsRef.current = Math.max(0, activeSoundsRef.current - 1); };
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, [isMuted]);
  
  const playHit = useCallback(() => playSound(200 + Math.random() * 100, 0.08, 'sine', 0.08, 'hit'), [playSound]);
  const playKill = useCallback(() => playSound(400, 0.12, 'sine', 0.1, 'kill'), [playSound]);
  const playXP = useCallback(() => playSound(600 + Math.random() * 200, 0.04, 'sine', 0.04, 'xp'), [playSound]);
  const playHurt = useCallback(() => playSound(150, 0.15, 'sawtooth', 0.12, 'hurt'), [playSound]);
  const playLevelUp = useCallback(() => { if (isMuted || !audioContextRef.current) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playSound(f, 0.3, 'sine', 0.1), i * 80)); }, [isMuted, playSound]);
  const playPowerUp = useCallback(() => { if (isMuted || !audioContextRef.current) return; [400, 600, 800, 1000].forEach((f, i) => setTimeout(() => playSound(f, 0.15, 'sine', 0.12), i * 50)); }, [isMuted, playSound]);
  const playWindHorde = useCallback(() => { if (isMuted || !audioContextRef.current) return; playSound(800, 0.3, 'sine', 0.15); setTimeout(() => playSound(600, 0.2, 'sine', 0.1), 100); }, [isMuted, playSound]);
  
  // Music styles configuration
  const MUSIC_STYLES = [
    { // 0-5 min: Chill chiptune
      name: 'Chiptune',
      bpm: 180,
      bassNotes: [55, 65.41, 73.42, 82.41],
      melody: [220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33],
      bassType: 'triangle' as OscillatorType,
      melodyType: 'square' as OscillatorType,
      bassVol: 0.06,
      melodyVol: 0.04,
    },
    { // 5-10 min: Sci-fi synth
      name: 'Sci-Fi',
      bpm: 200,
      bassNotes: [41.2, 55, 61.74, 82.41],
      melody: [329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880],
      bassType: 'sawtooth' as OscillatorType,
      melodyType: 'sine' as OscillatorType,
      bassVol: 0.05,
      melodyVol: 0.05,
    },
    { // 10-15 min: Techno drive
      name: 'Techno',
      bpm: 240,
      bassNotes: [55, 55, 73.42, 55],
      melody: [440, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880],
      bassType: 'square' as OscillatorType,
      melodyType: 'sawtooth' as OscillatorType,
      bassVol: 0.07,
      melodyVol: 0.035,
    },
    { // 15-20 min: Dark industrial
      name: 'Industrial',
      bpm: 220,
      bassNotes: [36.71, 41.2, 49, 55],
      melody: [196, 220, 246.94, 293.66, 329.63, 369.99, 415.3, 440],
      bassType: 'sawtooth' as OscillatorType,
      melodyType: 'square' as OscillatorType,
      bassVol: 0.08,
      melodyVol: 0.04,
    },
    { // 20+ min: Chaos finale
      name: 'Chaos',
      bpm: 280,
      bassNotes: [32.7, 36.71, 41.2, 49],
      melody: [523.25, 554.37, 622.25, 659.25, 739.99, 783.99, 880, 932.33],
      bassType: 'sawtooth' as OscillatorType,
      melodyType: 'square' as OscillatorType,
      bassVol: 0.09,
      melodyVol: 0.045,
    },
  ];
  
  // Music system
  const startMusic = useCallback(() => {
    if (!audioContextRef.current || musicPlayingRef.current) return;
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    musicPlayingRef.current = true;
    musicStyleRef.current = 0;
    
    let noteIndex = 0;
    let beatCount = 0;
    let lastStyleCheck = 0;
    
    const playBeat = () => {
      if (!audioContextRef.current || !musicPlayingRef.current) return;
      const ctx = audioContextRef.current;
      
      // Check game time and update style every 5 minutes
      const gt = (performance.now() - gameStartTimeRef.current - pausedTimeRef.current) / 1000;
      const newStyle = Math.min(Math.floor(gt / 300), MUSIC_STYLES.length - 1);
      
      // Style transition
      if (newStyle !== musicStyleRef.current && gt - lastStyleCheck > 1) {
        musicStyleRef.current = newStyle;
        lastStyleCheck = gt;
        // Play transition sound
        const transOsc = ctx.createOscillator();
        const transGain = ctx.createGain();
        transOsc.type = 'sine';
        transOsc.frequency.setValueAtTime(880, ctx.currentTime);
        transOsc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
        transOsc.connect(transGain);
        transGain.connect(ctx.destination);
        transGain.gain.setValueAtTime(0.1, ctx.currentTime);
        transGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        transOsc.start();
        transOsc.stop(ctx.currentTime + 0.3);
      }
      
      const style = MUSIC_STYLES[musicStyleRef.current];
      
      // Bass line
      if (beatCount % 8 === 0) {
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = style.bassType;
        const bassNote = style.bassNotes[Math.floor(beatCount / 8) % style.bassNotes.length];
        bassOsc.frequency.setValueAtTime(bassNote, ctx.currentTime);
        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);
        bassGain.gain.setValueAtTime(style.bassVol, ctx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        bassOsc.start();
        bassOsc.stop(ctx.currentTime + 0.4);
      }
      
      // Melody
      if (beatCount % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = style.melodyType;
        osc.frequency.setValueAtTime(style.melody[noteIndex], ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(style.melodyVol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        noteIndex = (noteIndex + 1) % style.melody.length;
        if (Math.random() < 0.3) noteIndex = Math.floor(Math.random() * style.melody.length);
      }
      
      // Percussion - varies by style
      if (beatCount % 4 === 0 || beatCount % 4 === 2) {
        const noiseLength = musicStyleRef.current >= 2 ? 0.08 : 0.05; // Longer hits for techno+
        const noiseGain = ctx.createGain();
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(beatCount % 4 === 0 ? 100 : 4000, ctx.currentTime);
        const bufferSize = ctx.sampleRate * noiseLength;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        const kickVol = musicStyleRef.current >= 2 ? 0.12 : 0.08;
        const hatVol = musicStyleRef.current >= 2 ? 0.05 : 0.03;
        noiseGain.gain.setValueAtTime(beatCount % 4 === 0 ? kickVol : hatVol, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + noiseLength);
        noise.start();
      }
      
      // Extra percussion for techno+ styles
      if (musicStyleRef.current >= 2 && beatCount % 4 === 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
      
      // Arpeggio flourish for sci-fi style
      if (musicStyleRef.current === 1 && beatCount % 16 === 0) {
        [0, 50, 100, 150].forEach((delay, i) => {
          setTimeout(() => {
            if (!audioContextRef.current) return;
            const arpOsc = ctx.createOscillator();
            const arpGain = ctx.createGain();
            arpOsc.type = 'sine';
            arpOsc.frequency.setValueAtTime(style.melody[i % style.melody.length] * 2, ctx.currentTime);
            arpOsc.connect(arpGain);
            arpGain.connect(ctx.destination);
            arpGain.gain.setValueAtTime(0.03, ctx.currentTime);
            arpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            arpOsc.start();
            arpOsc.stop(ctx.currentTime + 0.1);
          }, delay);
        });
      }
      
      beatCount++;
    };
    
    // Start with initial style's BPM
    const updateInterval = () => {
      const style = MUSIC_STYLES[musicStyleRef.current];
      const intervalMs = 60000 / style.bpm;
      if (musicIntervalRef.current) clearInterval(musicIntervalRef.current);
      musicIntervalRef.current = window.setInterval(() => {
        playBeat();
        // Check if BPM changed
        const newStyle = MUSIC_STYLES[musicStyleRef.current];
        if (newStyle.bpm !== style.bpm) updateInterval();
      }, intervalMs);
    };
    updateInterval();
  }, [initAudio]);
  
  const stopMusic = useCallback(() => {
    musicPlayingRef.current = false;
    if (musicIntervalRef.current) {
      clearInterval(musicIntervalRef.current);
      musicIntervalRef.current = null;
    }
    musicStyleRef.current = 0;
  }, []);
  
  useEffect(() => {
    if (isMusicOn && gameState === 'playing') startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [isMusicOn, gameState, startMusic, stopMusic]);

  const shake = useCallback((intensity: number, duration: number) => { screenShakeRef.current = { intensity, duration, startTime: performance.now() }; }, []);
  const flash = useCallback((color: string, intensity: number) => { screenFlashRef.current = { color, intensity }; }, []);
  
  // Optimized particle spawner with limits
  const addParticles = useCallback((x: number, y: number, color: string, count: number, speed: number = 3, type?: 'spark' | 'ring' | 'glow' | 'burst') => {
    // Late game throttle
    const throttle = Math.max(0.3, 1 - (enemiesRef.current.length / MAX_ENEMIES) * 0.5);
    const actualCount = Math.floor(count * throttle);
    
    // Enforce max particles
    while (particlesRef.current.length + actualCount > MAX_PARTICLES) {
      particlesRef.current.shift();
    }
    
    for (let i = 0; i < actualCount; i++) {
      const a = (i / actualCount) * Math.PI * 2 + Math.random() * 0.5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(a) * speed * (0.5 + Math.random() * 0.5),
        vy: Math.sin(a) * speed * (0.5 + Math.random() * 0.5),
        life: 1, maxLife: 1, color,
        size: type === 'spark' ? 1 + Math.random() * 2 : type === 'burst' ? 4 + Math.random() * 4 : 2 + Math.random() * 3,
        type
      });
    }
  }, []);
  
  // Optimized damage number with limits
  const addDmgNum = useCallback((x: number, y: number, value: number, isCrit?: boolean) => {
    if (damageNumbersRef.current.length >= MAX_DAMAGE_NUMBERS) {
      damageNumbersRef.current.shift();
    }
    damageNumbersRef.current.push({ x, y, value, life: 1, vy: -2, isCrit });
  }, []);
  
  const rebuildGrid = useCallback(() => {
    enemyGridRef.current.clear();
    for (const e of enemiesRef.current) {
      const c = getSpatialCell(e.x, e.y);
      if (!enemyGridRef.current.has(c)) enemyGridRef.current.set(c, []);
      enemyGridRef.current.get(c)!.push(e);
    }
  }, []);
  
  const getEnemiesNear = useCallback((x: number, y: number, radius: number): Enemy[] => {
    const cells = getNearbyCells(x, y, radius), result: Enemy[] = [], seen = new Set<Enemy>();
    for (const c of cells) {
      const enemies = enemyGridRef.current.get(c);
      if (enemies) for (const e of enemies) if (!seen.has(e)) {
        seen.add(e);
        if (Math.hypot(e.x - x, e.y - y) <= radius + e.size) result.push(e);
      }
    }
    return result;
  }, []);

  // Improved spawn with randomization
  const spawnEnemy = useCallback((forceType?: EnemyType) => {
    if (enemiesRef.current.length >= MAX_ENEMIES) return;
    
    const p = playerRef.current;
    const gt = (performance.now() - gameStartTimeRef.current - pausedTimeRef.current) / 1000;
    
    // Randomized spawn distance and angle
    const angleOffset = (Math.random() - 0.5) * Math.PI * 0.5; // Random arc segment
    const baseAngle = Math.random() * Math.PI * 2;
    const a = baseAngle + angleOffset;
    const d = 250 + Math.random() * 200; // 250-450 distance (more variance)
    
    const x = Math.max(50, Math.min(WORLD_WIDTH - 50, p.x + Math.cos(a) * d));
    const y = Math.max(50, Math.min(WORLD_HEIGHT - 50, p.y + Math.sin(a) * d));
    
    let sel: EnemyType = forceType || 'sprinkle';
    
    if (!forceType) {
      // Progressive enemy types
      let types: EnemyType[] = ['sprinkle'];
      if (gt > 30) types.push('gummy');
      if (gt > 60) types.push('jellybean');
      if (gt > 90) types.push('candy_corn');
      if (gt > 150) types.push('licorice');
      if (gt > 240) types.push('chocolate_chunk');
      
      const weights = types.map(t => ENEMY_CONFIG[t].spawnWeight);
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < types.length; i++) {
        r -= weights[i];
        if (r <= 0) { sel = types[i]; break; }
      }
    }
    
    const c = ENEMY_CONFIG[sel];
    const endlessMult = endlessDifficultyRef.current;
    
    // Gentler scaling curves
    const ts = (1 + gt / 360) * endlessMult; // HP scales slower (was /240)
    const ss = (1 + gt / 900) * Math.sqrt(endlessMult); // Speed scales much slower (was /600)
    
    enemiesRef.current.push({
      x, y, type: sel,
      hp: Math.floor(c.hp * ts),
      maxHp: Math.floor(c.hp * ts),
      speed: c.speed * ss,
      size: c.size,
      xpValue: Math.floor(c.xpValue * endlessMult),
      damage: Math.floor(c.damage * endlessMult),
      color: c.color,
      hitFlash: 0,
      spawnAnim: 1,
      zigzagPhase: sel === 'jellybean' ? Math.random() * Math.PI * 2 : undefined,
      splitCount: sel === 'licorice' ? 2 : undefined
    });
    
    // Reduced spawn particles
    if (Math.random() < 0.5) addParticles(x, y, c.color, 3, 2, 'spark');
  }, [addParticles]);
  
  // Wind spirit horde spawn - circle formation
  const spawnWindHorde = useCallback(() => {
    const p = playerRef.current;
    const startDist = 350;
    const now = performance.now();
    
    // Spawn 10-14 wind spirits in a circle around player
    const count = 10 + Math.floor(Math.random() * 5);
    const startAngle = Math.random() * Math.PI * 2; // Random rotation offset
    
    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i / count) * Math.PI * 2;
      const x = p.x + Math.cos(angle) * startDist;
      const y = p.y + Math.sin(angle) * startDist;
      
      const c = ENEMY_CONFIG['wind_spirit'];
      enemiesRef.current.push({
        x, y, type: 'wind_spirit',
        hp: c.hp, maxHp: c.hp,
        speed: c.speed,
        size: c.size,
        xpValue: 0,
        damage: 0,
        color: c.color,
        hitFlash: 0,
        spawnAnim: 0.5,
        spawnTime: now // Track spawn time for 10s lifetime
      });
    }
    
    playWindHorde();
    // Ring particles around player
    addParticles(p.x, p.y, '#87CEEB', 20, 6, 'ring');
  }, [addParticles, playWindHorde]);

  const fireWeapons = useCallback(() => {
    const p = playerRef.current, now = Date.now();
    
    // Enforce projectile limit
    if (projectilesRef.current.length >= MAX_PROJECTILES) return;
    
    weaponsRef.current.forEach(w => {
      const cfg = WEAPON_CONFIG[w.type], cdRed = 1 - (p.cooldownReduction || 0), cd = cfg.baseCooldown * Math.pow(0.9, w.level - 1) * cdRed;
      if (now - w.lastFired < cd) return;
      w.lastFired = now;
      const dmg = cfg.baseDamage * (1 + (w.level - 1) * 0.3) * p.damage;
      
      if (w.type === 'sprinkle_shot') {
        const near = getEnemiesNear(p.x, p.y, 300).filter(e => e.type !== 'wind_spirit');
        let nearest: Enemy | null = null, nd = Infinity;
        for (const e of near) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nd) { nearest = e; nd = d; } }
        if (nearest) {
          const a = Math.atan2(nearest.y - p.y, nearest.x - p.x), cnt = Math.min(1 + Math.floor(w.level / 3), 3);
          for (let i = 0; i < cnt; i++) {
            const aa = a + (i - (cnt - 1) / 2) * 0.2;
            projectilesRef.current.push({ x: p.x, y: p.y, vx: Math.cos(aa) * 8, vy: Math.sin(aa) * 8, damage: dmg, size: 6, color: cfg.color, piercing: Math.floor(w.level / 2), lifetime: 60, weaponType: w.type, trailTimer: 0 });
          }
          addParticles(p.x, p.y, cfg.color, 2, 2, 'spark');
        }
      } else if (w.type === 'sugar_stars') {
        const cnt = 4 + w.level;
        for (let i = 0; i < cnt; i++) {
          const a = (i / cnt) * Math.PI * 2;
          projectilesRef.current.push({ x: p.x, y: p.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, damage: dmg, size: 8, color: cfg.color, piercing: 0, lifetime: 45, weaponType: w.type, trailTimer: 0 });
        }
        addParticles(p.x, p.y, cfg.color, 6, 3, 'ring');
      } else if (w.type === 'glaze_wave') {
        const rng = 80 + w.level * 20;
        getEnemiesNear(p.x, p.y, rng).filter(e => e.type !== 'wind_spirit').forEach(e => {
          e.hp -= dmg; e.hitFlash = 5;
          addDmgNum(e.x, e.y - e.size, Math.floor(dmg));
        });
        addParticles(p.x, p.y, cfg.color, 15, 8, 'ring');
        flash(cfg.color, 0.15);
      } else if (w.type === 'candy_cannon') {
        const near = getEnemiesNear(p.x, p.y, 350).filter(e => e.type !== 'wind_spirit');
        let nearest: Enemy | null = null, nd = Infinity;
        for (const e of near) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nd) { nearest = e; nd = d; } }
        if (nearest) {
          const a = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          projectilesRef.current.push({ x: p.x, y: p.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, damage: dmg, size: 12 + w.level, color: cfg.color, piercing: 99, lifetime: 80, weaponType: w.type, trailTimer: 0 });
          addParticles(p.x, p.y, cfg.color, 4, 3, 'spark');
        }
      } else if (w.type === 'mint_missiles') {
        const near = getEnemiesNear(p.x, p.y, 400).filter(e => e.type !== 'wind_spirit');
        const mc = 1 + Math.floor(w.level / 3);
        const targets = near.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, mc);
        targets.forEach((t, i) => {
          const a = Math.atan2(t.y - p.y, t.x - p.x) + (i - (targets.length - 1) / 2) * 0.15;
          projectilesRef.current.push({ x: p.x, y: p.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, damage: dmg, size: 8, color: cfg.color, piercing: 0, lifetime: 120, weaponType: w.type, trailTimer: 0 });
        });
        if (targets.length > 0) addParticles(p.x, p.y, cfg.color, 3, 2, 'spark');
      }
    });
  }, [addDmgNum, addParticles, getEnemiesNear, flash]);

  const updateOrbiting = useCallback((delta: number) => {
    const p = playerRef.current;
    weaponsRef.current.forEach(w => {
      if (w.type === 'orbiting_donuts') {
        w.angle = (w.angle || 0) + 0.05 * delta;
        const dmg = WEAPON_CONFIG[w.type].baseDamage * (1 + (w.level - 1) * 0.3) * p.damage;
        const cnt = 2 + Math.floor(w.level / 2), rad = 50 + w.level * 5;
        for (let i = 0; i < cnt; i++) {
          const a = w.angle + (i / cnt) * Math.PI * 2;
          const ox = p.x + Math.cos(a) * rad, oy = p.y + Math.sin(a) * rad;
          getEnemiesNear(ox, oy, 20).filter(e => e.type !== 'wind_spirit').forEach(e => {
            if (e.hitFlash === 0) {
              e.hp -= dmg; e.hitFlash = 8;
              addDmgNum(e.x, e.y - e.size, Math.floor(dmg));
              playHit();
              if (Math.random() < 0.3) addParticles(ox, oy, '#F472B6', 2, 2, 'spark');
            }
          });
        }
      } else if (w.type === 'frosting_ring') {
        w.angle = (w.angle || 0) + 0.08 * delta;
        const dmg = WEAPON_CONFIG[w.type].baseDamage * (1 + (w.level - 1) * 0.3) * p.damage * 0.1;
        const rad = 40 + w.level * 8;
        getEnemiesNear(p.x, p.y, rad + 15).filter(e => e.type !== 'wind_spirit').forEach(e => {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < rad + 10 && d > rad - 10) {
            e.hp -= dmg;
            if (Math.random() < 0.05) addDmgNum(e.x, e.y - e.size, Math.floor(dmg * 10));
          }
        });
      } else if (w.type === 'cinnamon_trail') {
        if (frameCountRef.current % 4 === 0) { // Reduced frequency
          trailPointsRef.current.push({ x: p.x, y: p.y, life: 60 + w.level * 15 });
        }
      }
    });
    
    const tw = weaponsRef.current.find(w => w.type === 'cinnamon_trail');
    if (tw) {
      const dmg = WEAPON_CONFIG['cinnamon_trail'].baseDamage * (1 + (tw.level - 1) * 0.3) * p.damage * 0.05;
      trailPointsRef.current = trailPointsRef.current.filter(pt => {
        pt.life -= delta;
        getEnemiesNear(pt.x, pt.y, 18 + tw.level * 3).filter(e => e.type !== 'wind_spirit').forEach(e => { e.hp -= dmg; });
        return pt.life > 0;
      });
    }
  }, [addDmgNum, addParticles, playHit, getEnemiesNear]);

  const genUpgrades = useCallback(() => {
    const cw = weaponsRef.current.map(w => w.type), aw = (Object.keys(WEAPON_CONFIG) as WeaponType[]).filter(t => !cw.includes(t) && !bannedUpgrades.includes(`weapon:${t}`));
    const opts: UpgradeOption[] = [];
    weaponsRef.current.forEach(w => { if (w.level < 8 && !bannedUpgrades.includes(`weapon:${w.type}`)) { const c = WEAPON_CONFIG[w.type]; opts.push({ type: 'weapon', weaponType: w.type, title: `${c.name} +`, description: `Lv ${w.level} → ${w.level + 1}`, icon: c.icon }); } });
    if (weaponsRef.current.length < MAX_WEAPONS) aw.forEach(t => { const c = WEAPON_CONFIG[t]; opts.push({ type: 'weapon', weaponType: t, title: c.name, description: c.description, icon: c.icon }); });
    const cg = gadgetsRef.current.map(g => g.type), ag = (Object.keys(GADGET_CONFIG) as GadgetType[]).filter(t => !cg.includes(t) && !bannedUpgrades.includes(`gadget:${t}`));
    gadgetsRef.current.forEach(g => { if (g.stacks < 5 && !bannedUpgrades.includes(`gadget:${g.type}`)) { const c = GADGET_CONFIG[g.type]; opts.push({ type: 'gadget', gadgetType: g.type, title: `${c.name} +`, description: `Stack ${g.stacks} → ${g.stacks + 1}`, icon: c.icon }); } });
    if (gadgetsRef.current.length < MAX_GADGETS) ag.forEach(t => { const c = GADGET_CONFIG[t]; opts.push({ type: 'gadget', gadgetType: t, title: c.name, description: c.description, icon: c.icon }); });
    setUpgradeOptions(opts.sort(() => Math.random() - 0.5).slice(0, 3));
  }, [bannedUpgrades]);

  const checkLevelUp = useCallback(() => {
    const p = playerRef.current;
    if (p.xp >= p.xpToLevel) {
      p.xp -= p.xpToLevel;
      p.level++;
      p.xpToLevel = Math.floor(BASE_XP_TO_LEVEL * Math.pow(XP_SCALE, p.level - 1));
      setPlayerLevel(p.level);
      playLevelUp();
      shake(8, 300);
      flash('#FFD700', 0.3);
      addParticles(p.x, p.y, '#FFD700', 25, 6, 'ring');
      genUpgrades();
      isPausedRef.current = true;
      setGameState("levelup");
    }
  }, [playLevelUp, shake, flash, addParticles, genUpgrades]);

  const applyUpgrade = useCallback((opt: UpgradeOption) => {
    const p = playerRef.current;
    if (opt.type === 'weapon' && opt.weaponType) {
      const ex = weaponsRef.current.find(w => w.type === opt.weaponType);
      if (ex) ex.level++;
      else weaponsRef.current.push({ type: opt.weaponType, level: 1, lastFired: 0, angle: 0 });
    } else if (opt.type === 'gadget' && opt.gadgetType) {
      const ex = gadgetsRef.current.find(g => g.type === opt.gadgetType);
      if (ex) ex.stacks++;
      else gadgetsRef.current.push({ type: opt.gadgetType, stacks: 1 });
      const cfg = GADGET_CONFIG[opt.gadgetType];
      switch (cfg.effect) {
        case 'speed': p.speed *= 1.20; break;
        case 'max_hp': p.maxHp += 30; p.hp = Math.min(p.hp + 30, p.maxHp); break;
        case 'magnet': p.magnetRange *= 1.40; break;
        case 'defense': p.defense = (p.defense || 0) + 0.15; break;
        case 'damage': p.damage *= 1.15; break;
        case 'xp_gain': p.xpMultiplier *= 1.25; break;
        case 'invincibility': p.invincibilityBonus = (p.invincibilityBonus || 0) + 500; break;
        case 'cooldown': p.cooldownReduction = (p.cooldownReduction || 0) + 0.10; break;
      }
    }
    isPausedRef.current = false;
    setBanMode(false);
    setGameState("playing");
  }, []);

  const openEquip = useCallback(() => { setEquipmentData({ weapons: [...weaponsRef.current], gadgets: [...gadgetsRef.current], player: { ...playerRef.current } }); isPausedRef.current = true; setGameState("equipment"); }, []);
  const closeEquip = useCallback(() => { isPausedRef.current = false; setGameState("playing"); setEquipmentData(null); }, []);

  const endGame = useCallback(() => {
    gameActiveRef.current = false;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    const st = Math.floor((performance.now() - gameStartTimeRef.current - pausedTimeRef.current) / 1000);
    const kills = enemiesKilledRef.current;
    const fs = kills;
    setScore(fs);
    setSurvivalTime(st);
    setKillCount(kills);
    setGameState("gameover");
    setHighScore(prev => Math.max(prev, fs));
    
    // Submit score to API
    submitScore(fs, st, kills);
    fetchLeaderboard();
  }, [submitScore, fetchLeaderboard]);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    
    const now = performance.now();
    const delta = Math.min((now - lastFrameTimeRef.current) / 16.667, 2);
    lastFrameTimeRef.current = now;
    frameCountRef.current++;
    
    // Screen shake
    let shakeX = 0, shakeY = 0;
    const sk = screenShakeRef.current;
    if (sk.duration > 0) {
      const el = now - sk.startTime;
      if (el < sk.duration) {
        const int = sk.intensity * (1 - el / sk.duration);
        shakeX = (Math.random() - 0.5) * int * 2;
        shakeY = (Math.random() - 0.5) * int * 2;
      } else sk.duration = 0;
    }
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, shakeX * CANVAS_SCALE, shakeY * CANVAS_SCALE);
    
    const p = playerRef.current;
    
    if (isPausedRef.current) { drawGame(ctx); gameLoopRef.current = requestAnimationFrame(gameLoop); return; }
    
    // Player movement
    const mx = moveInputRef.current.x, my = moveInputRef.current.y, ml = Math.hypot(mx, my);
    const tvx = ml > 0 ? (mx / ml) * p.speed : 0, tvy = ml > 0 ? (my / ml) * p.speed : 0;
    if (ml > 0) { p.vx += (tvx - p.vx) * 0.2 * delta; p.vy += (tvy - p.vy) * 0.2 * delta; }
    else { p.vx *= (1 - 0.15 * delta); p.vy *= (1 - 0.15 * delta); if (Math.abs(p.vx) < 0.01) p.vx = 0; if (Math.abs(p.vy) < 0.01) p.vy = 0; }
    p.x += p.vx * delta; p.y += p.vy * delta;
    p.x = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_WIDTH - PLAYER_SIZE / 2, p.x));
    p.y = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_HEIGHT - PLAYER_SIZE / 2, p.y));
    cameraRef.current = { x: p.x - CANVAS_WIDTH / 2, y: p.y - CANVAS_HEIGHT / 2 };
    
    const gt = now - gameStartTimeRef.current - pausedTimeRef.current;
    const gs = gt / 1000;
    
    // Slower spawn rate scaling (min 600ms instead of 400ms, slower ramp)
    const sr = Math.max(600, 2200 - gt / 300);
    if (now - lastSpawnTimeRef.current > sr) {
      // Spawn count scales slower
      const sc = 1 + Math.floor(gt / 90000); // Was /60000
      for (let i = 0; i < sc; i++) spawnEnemy();
      lastSpawnTimeRef.current = now;
    }
    
    // Wind spirit horde every 45 seconds after 5 minutes
    if (gs >= 300 && now - lastWindHordeRef.current > 45000) {
      spawnWindHorde();
      lastWindHordeRef.current = now;
    }
    
    // Boss warnings and spawns
    if (gs >= 590 && !bossWarningRef.current) bossWarningRef.current = true;
    if (gs >= 600 && !bossSpawnedRef.current) {
      bossSpawnedRef.current = true;
      enemiesRef.current.forEach(e => { if (e.type !== 'wind_spirit') addParticles(e.x, e.y, e.color, 6, 3); });
      enemiesRef.current = enemiesRef.current.filter(e => e.type === 'wind_spirit');
      const a = Math.random() * Math.PI * 2, d = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.6, c = ENEMY_CONFIG['boss'];
      enemiesRef.current.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, type: 'boss', hp: c.hp, maxHp: c.hp, speed: c.speed, size: c.size, xpValue: c.xpValue, damage: c.damage, color: c.color, hitFlash: 0, spawnAnim: 1 });
      shake(20, 500);
      flash('#FF1744', 0.4);
    }
    
    if (gs >= 1190 && !finalBossWarningRef.current) finalBossWarningRef.current = true;
    if (gs >= 1200 && !finalBossSpawnedRef.current) {
      finalBossSpawnedRef.current = true;
      enemiesRef.current = enemiesRef.current.filter(e => e.type === 'boss' || e.type === 'wind_spirit');
      const a = Math.random() * Math.PI * 2, d = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.7, c = ENEMY_CONFIG['final_boss'];
      enemiesRef.current.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, type: 'final_boss', hp: c.hp, maxHp: c.hp, speed: c.speed, size: c.size, xpValue: c.xpValue, damage: c.damage, color: c.color, hitFlash: 0, spawnAnim: 1 });
      shake(40, 1000);
      flash('#000', 0.5);
    }
    
    // Endless mode scaling
    if (endlessModeRef.current && gs >= 1200) {
      const minutesPast20 = Math.floor((gs - 1200) / 60);
      endlessDifficultyRef.current = Math.pow(1.05, minutesPast20);
    }
    
    rebuildGrid();
    fireWeapons();
    updateOrbiting(delta);
    
    // Update projectiles with optimized trails
    projectilesRef.current = projectilesRef.current.filter(proj => {
      // Reduced trail frequency
      proj.trailTimer += delta;
      if (proj.trailTimer >= 3) {
        proj.trailTimer = 0;
        if (projectileTrailsRef.current.length < 200) {
          projectileTrailsRef.current.push({ x: proj.x, y: proj.y, life: 1, color: proj.color });
        }
      }
      
      // Homing for mint missiles
      if (proj.weaponType === 'mint_missiles') {
        const near = getEnemiesNear(proj.x, proj.y, 200).filter(e => e.type !== 'wind_spirit');
        let nearest: Enemy | null = null, nd = Infinity;
        for (const e of near) { const d = Math.hypot(e.x - proj.x, e.y - proj.y); if (d < nd) { nearest = e; nd = d; } }
        if (nearest) {
          const ta = Math.atan2(nearest.y - proj.y, nearest.x - proj.x);
          const ca = Math.atan2(proj.vy, proj.vx);
          const na = ca + Math.sign(ta - ca) * Math.min(Math.abs(ta - ca), 0.15);
          const sp = Math.hypot(proj.vx, proj.vy);
          proj.vx = Math.cos(na) * sp;
          proj.vy = Math.sin(na) * sp;
        }
      }
      
      proj.x += proj.vx * delta;
      proj.y += proj.vy * delta;
      proj.lifetime -= delta;
      if (proj.lifetime <= 0) return false;
      
      for (const e of getEnemiesNear(proj.x, proj.y, proj.size + 50)) {
        if (e.type === 'wind_spirit') continue;
        if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.size + proj.size) {
          e.hp -= proj.damage;
          e.hitFlash = 5;
          addDmgNum(e.x, e.y - e.size, Math.floor(proj.damage));
          playHit();
          addParticles(proj.x, proj.y, proj.color, 3, 2, 'spark');
          
          if (proj.weaponType === 'candy_cannon') {
            getEnemiesNear(proj.x, proj.y, 60 + proj.size).filter(o => o.type !== 'wind_spirit').forEach(o => {
              if (o !== e) { o.hp -= proj.damage * 0.6; o.hitFlash = 5; }
            });
            addParticles(proj.x, proj.y, '#A78BFA', 15, 6, 'burst');
            shake(5, 100);
            flash('#A78BFA', 0.2);
            return false;
          }
          if (proj.weaponType === 'mint_missiles') {
            getEnemiesNear(proj.x, proj.y, 35).filter(o => o.type !== 'wind_spirit').forEach(o => {
              if (o !== e) { o.hp -= proj.damage * 0.5; o.hitFlash = 5; }
            });
            addParticles(proj.x, proj.y, '#4ADE80', 8, 4, 'ring');
            return false;
          }
          if (proj.piercing > 0) { proj.piercing--; proj.damage *= 0.8; }
          else return false;
        }
      }
      return true;
    });
    
    // Update projectile trails
    projectileTrailsRef.current = projectileTrailsRef.current.filter(t => {
      t.life -= 0.1;
      return t.life > 0;
    });
    
    // Update enemies
    const isFrozen = now < freezeUntilRef.current;
    enemiesRef.current = enemiesRef.current.filter(e => {
      e.hitFlash = Math.max(0, e.hitFlash - 1);
      e.spawnAnim = Math.max(0, e.spawnAnim - 0.05 * delta);
      
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
      
      if (!isFrozen && dist > 0) {
        let moveX = (dx / dist) * e.speed * delta;
        let moveY = (dy / dist) * e.speed * delta;
        
        // Jellybean zigzag movement
        if (e.type === 'jellybean' && e.zigzagPhase !== undefined) {
          e.zigzagPhase += 0.15 * delta;
          const perpX = -dy / dist, perpY = dx / dist;
          const zigzag = Math.sin(e.zigzagPhase) * 1.5;
          moveX += perpX * zigzag * delta;
          moveY += perpY * zigzag * delta;
        }
        
        e.x += moveX;
        e.y += moveY;
      }
      
      // Wind spirits push player but don't damage
      if (e.type === 'wind_spirit') {
        if (dist < e.size + PLAYER_SIZE / 2 + 20) {
          const pushStrength = 6;
          const pushX = (p.x - e.x) / dist * pushStrength;
          const pushY = (p.y - e.y) / dist * pushStrength;
          p.vx += pushX * delta;
          p.vy += pushY * delta;
          addParticles(p.x, p.y, '#87CEEB', 2, 3, 'spark');
        }
        // Wind spirits despawn after 10 seconds
        const age = (now - (e.spawnTime || now)) / 1000;
        if (age > 10) {
          addParticles(e.x, e.y, '#87CEEB', 4, 2, 'spark');
          return false;
        }
        return true;
      }
      
      // Final boss instant kill
      if (e.type === 'final_boss' && dist < e.size + PLAYER_SIZE / 2) {
        p.hp = 0;
        shake(50, 1000);
        flash('#FF0000', 0.8);
        endGame();
        return false;
      }
      
      // Normal collision damage
      if (dist < e.size + PLAYER_SIZE / 2 && Date.now() > invincibleUntilRef.current) {
        const dr = Math.min(p.defense || 0, 0.75);
        const ad = Math.floor(e.damage * (1 - dr));
        p.hp -= ad;
        invincibleUntilRef.current = Date.now() + 750 + (p.invincibilityBonus || 0);
        playHurt();
        shake(10, 200);
        flash('#FF6B6B', 0.3);
        addParticles(p.x, p.y, '#FF6B6B', 8, 4);
        if (p.hp <= 0) { endGame(); return false; }
      }
      
      // Enemy death
      if (e.hp <= 0) {
        // Licorice splits into smaller enemies
        if (e.type === 'licorice' && e.splitCount && e.splitCount > 0) {
          for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const splitDist = 20;
            if (enemiesRef.current.length < MAX_ENEMIES) {
              enemiesRef.current.push({
                x: e.x + Math.cos(angle) * splitDist,
                y: e.y + Math.sin(angle) * splitDist,
                type: 'sprinkle',
                hp: 15, maxHp: 15,
                speed: 1.2,
                size: 14,
                xpValue: 1,
                damage: 6,
                color: '#333',
                hitFlash: 0,
                spawnAnim: 0.5
              });
            }
          }
        }
        
        const oc = e.type === 'boss' ? 20 : e.type === 'final_boss' ? 50 : e.type === 'chocolate_chunk' ? 5 : e.type === 'licorice' ? 3 : 1;
        for (let i = 0; i < oc; i++) {
          if (xpOrbsRef.current.length < MAX_XP_ORBS) {
            xpOrbsRef.current.push({
              x: e.x + (Math.random() - 0.5) * (e.type === 'boss' || e.type === 'final_boss' ? 80 : 20),
              y: e.y + (Math.random() - 0.5) * (e.type === 'boss' || e.type === 'final_boss' ? 80 : 20),
              value: e.type === 'final_boss' ? 20 : e.type === 'boss' ? 10 : e.xpValue,
              size: 6 + (e.type === 'boss' || e.type === 'final_boss' ? 10 : e.xpValue),
              collectAnim: 0,
              spawnTime: now
            });
          }
        }
        
        // Power-up drops
        const powerUpChance = e.type === 'boss' || e.type === 'final_boss' ? 1.0 : e.type === 'chocolate_chunk' ? 0.01 : 0.0025;
        if (Math.random() < powerUpChance) {
          const types: PowerUpType[] = ['magnet_burst', 'health', 'freeze'];
          powerUpsRef.current.push({ x: e.x, y: e.y, type: types[Math.floor(Math.random() * types.length)], size: 14 });
        }
        
        // Endless mode trigger
        if (e.type === 'final_boss') {
          endlessModeRef.current = true;
          shake(50, 1500);
          flash('#FFD700', 0.5);
          addParticles(e.x, e.y, '#FFD700', 60, 15, 'burst');
        }
        
        playKill();
        addParticles(e.x, e.y, e.color, e.type === 'boss' || e.type === 'final_boss' ? 30 : 8, e.type === 'boss' || e.type === 'final_boss' ? 8 : 4, 'burst');
        if (e.type === 'boss' || e.type === 'final_boss') { shake(30, 800); flash(e.color, 0.4); }
        enemiesKilledRef.current++;
        setKillCount(enemiesKilledRef.current);
        return false;
      }
      return true;
    });
    
    // Update XP orbs
    xpOrbsRef.current = xpOrbsRef.current.filter(o => {
      const dx = p.x - o.x, dy = p.y - o.y, dist = Math.hypot(dx, dy);
      const age = (now - o.spawnTime) / 1000;
      if (age > 10 && !o.magnetized) return false;
      if (o.collectAnim > 0) { o.collectAnim -= 0.1 * delta; return o.collectAnim > 0; }
      
      if (o.magnetized && dist > 5) {
        const magnetSpeed = 15;
        o.x += (dx / dist) * magnetSpeed * delta;
        o.y += (dy / dist) * magnetSpeed * delta;
      } else if (dist < p.magnetRange) {
        const sp = 5 * (1 - dist / p.magnetRange) + 2;
        o.x += (dx / dist) * sp * delta;
        o.y += (dy / dist) * sp * delta;
      }
      
      if (dist < PLAYER_SIZE / 2 + o.size) {
        p.xp += o.value * p.xpMultiplier;
        playXP();
        o.collectAnim = 1;
        if (Math.random() < 0.3) addParticles(o.x, o.y, '#F472B6', 2, 2, 'spark');
      }
      return true;
    });
    
    // Update powerups
    powerUpsRef.current = powerUpsRef.current.filter(pu => {
      const dx = p.x - pu.x, dy = p.y - pu.y, dist = Math.hypot(dx, dy);
      if (dist < PLAYER_SIZE / 2 + pu.size) {
        playPowerUp();
        addParticles(pu.x, pu.y, POWERUP_CONFIG[pu.type].color, 12, 5, 'ring');
        flash(POWERUP_CONFIG[pu.type].color, 0.25);
        
        if (pu.type === 'magnet_burst') {
          xpOrbsRef.current.forEach(o => { o.magnetized = true; });
          addParticles(p.x, p.y, '#FF00FF', 15, 8, 'ring');
        } else if (pu.type === 'health') {
          p.hp = Math.min(p.hp + 20, p.maxHp);
          addParticles(p.x, p.y, '#FF6B6B', 10, 4, 'glow');
        } else if (pu.type === 'freeze') {
          freezeUntilRef.current = now + 10000;
          addParticles(p.x, p.y, '#00FFFF', 20, 6, 'ring');
          enemiesRef.current.forEach(e => { if (Math.random() < 0.3) addParticles(e.x, e.y, '#00FFFF', 3, 2, 'spark'); });
        }
        return false;
      }
      return true;
    });
    
    checkLevelUp();
    drawGame(ctx);
    
    // Decay screen flash
    screenFlashRef.current.intensity *= 0.85;
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [spawnEnemy, spawnWindHorde, fireWeapons, updateOrbiting, checkLevelUp, endGame, addDmgNum, addParticles, playHit, playKill, playXP, playHurt, playPowerUp, rebuildGrid, getEnemiesNear, shake, flash]);

  const drawGame = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current, p = playerRef.current;
    const now = performance.now();
    
    // Background
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = -cam.x % 50; x < CANVAS_WIDTH; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
    for (let y = -cam.y % 50; y < CANVAS_HEIGHT; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
    
    // World bounds
    ctx.strokeStyle = 'rgba(244,114,182,0.3)';
    ctx.lineWidth = 3;
    const wl = -cam.x, wt = -cam.y, wr = WORLD_WIDTH - cam.x, wb = WORLD_HEIGHT - cam.y;
    if (wl > 0) { ctx.beginPath(); ctx.moveTo(wl, 0); ctx.lineTo(wl, CANVAS_HEIGHT); ctx.stroke(); }
    if (wr < CANVAS_WIDTH) { ctx.beginPath(); ctx.moveTo(wr, 0); ctx.lineTo(wr, CANVAS_HEIGHT); ctx.stroke(); }
    if (wt > 0) { ctx.beginPath(); ctx.moveTo(0, wt); ctx.lineTo(CANVAS_WIDTH, wt); ctx.stroke(); }
    if (wb < CANVAS_HEIGHT) { ctx.beginPath(); ctx.moveTo(0, wb); ctx.lineTo(CANVAS_WIDTH, wb); ctx.stroke(); }
    
    // Cinnamon trail
    const tw = weaponsRef.current.find(w => w.type === 'cinnamon_trail');
    if (tw) {
      trailPointsRef.current.forEach(pt => {
        const a = pt.life / (60 + tw.level * 15);
        ctx.fillStyle = `rgba(249,115,22,${a * 0.6})`;
        ctx.beginPath();
        ctx.arc(pt.x - cam.x, pt.y - cam.y, 10 + tw.level * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    // XP orbs
    xpOrbsRef.current.forEach(o => {
      const sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx < -20 || sx > CANVAS_WIDTH + 20 || sy < -20 || sy > CANVAS_HEIGHT + 20) return;
      const sc = o.collectAnim > 0 ? 1 + (1 - o.collectAnim) * 0.5 : 1;
      const age = (now - o.spawnTime) / 1000;
      const isBlinking = age > 7;
      const blinkAlpha = isBlinking ? (Math.sin(age * 10) * 0.4 + 0.6) : 1;
      const al = o.collectAnim > 0 ? o.collectAnim : blinkAlpha;
      ctx.save();
      ctx.globalAlpha = al;
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 10;
      if (donutImageRef.current && donutLoadedRef.current) {
        ctx.drawImage(donutImageRef.current, sx - o.size * sc, sy - o.size * sc, o.size * 2 * sc, o.size * 2 * sc);
      } else {
        ctx.fillStyle = '#F472B6';
        ctx.beginPath();
        ctx.arc(sx, sy, o.size * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    });
    
    // Power-ups
    powerUpsRef.current.forEach(pu => {
      const sx = pu.x - cam.x, sy = pu.y - cam.y;
      if (sx < -20 || sx > CANVAS_WIDTH + 20 || sy < -20 || sy > CANVAS_HEIGHT + 20) return;
      const cfg = POWERUP_CONFIG[pu.type];
      const pulse = 1 + Math.sin(now / 150) * 0.15;
      ctx.save();
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = cfg.color + '40';
      ctx.beginPath();
      ctx.arc(sx, sy, pu.size * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(sx, sy, pu.size * 0.7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${Math.floor(pu.size)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.icon, sx, sy);
      ctx.shadowBlur = 0;
      ctx.restore();
    });
    
    // Enemies
    const isFrozen = now < freezeUntilRef.current;
    enemiesRef.current.forEach(e => {
      const sx = e.x - cam.x, sy = e.y - cam.y;
      if (sx < -100 || sx > CANVAS_WIDTH + 100 || sy < -100 || sy > CANVAS_HEIGHT + 100) return;
      
      ctx.save();
      ctx.translate(sx, sy);
      const spSc = e.spawnAnim > 0 ? 1.5 - e.spawnAnim * 0.5 : 1;
      const spAl = e.spawnAnim > 0 ? 1 - e.spawnAnim * 0.3 : 1;
      ctx.scale(spSc, spSc);
      ctx.globalAlpha = spAl;
      
      const drawFrozen = isFrozen && e.type !== 'wind_spirit';
      ctx.fillStyle = e.hitFlash > 0 ? '#FFF' : drawFrozen ? '#88DDFF' : e.color;
      if (drawFrozen) { ctx.shadowColor = '#00FFFF'; ctx.shadowBlur = 8; }
      
      if (e.type === 'sprinkle') {
        ctx.beginPath();
        ctx.roundRect(-e.size / 2, -e.size / 4, e.size, e.size / 2, e.size / 4);
        ctx.fill();
      } else if (e.type === 'gummy') {
        ctx.beginPath();
        ctx.arc(0, 0, e.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-e.size / 3, -e.size / 2, e.size / 4, 0, Math.PI * 2);
        ctx.arc(e.size / 3, -e.size / 2, e.size / 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'candy_corn') {
        ctx.beginPath();
        ctx.moveTo(0, -e.size / 2);
        ctx.lineTo(-e.size / 2, e.size / 2);
        ctx.lineTo(e.size / 2, e.size / 2);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 'jellybean') {
        // Jellybean - elongated pill shape
        ctx.beginPath();
        ctx.ellipse(0, 0, e.size / 2, e.size / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-e.size / 6, -e.size / 8, e.size / 6, e.size / 8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'licorice') {
        // Licorice - twisted rectangle
        ctx.fillStyle = e.hitFlash > 0 ? '#FFF' : drawFrozen ? '#88DDFF' : '#1a1a1a';
        ctx.beginPath();
        ctx.roundRect(-e.size / 2, -e.size / 3, e.size, e.size * 0.66, 4);
        ctx.fill();
        // Red stripes
        ctx.fillStyle = e.hitFlash > 0 ? '#FFF' : '#FF4444';
        ctx.fillRect(-e.size / 2 + 4, -e.size / 3 + 4, 3, e.size * 0.66 - 8);
        ctx.fillRect(e.size / 2 - 7, -e.size / 3 + 4, 3, e.size * 0.66 - 8);
      } else if (e.type === 'chocolate_chunk') {
        ctx.beginPath();
        ctx.roundRect(-e.size / 2, -e.size / 2, e.size, e.size, 5);
        ctx.fill();
      } else if (e.type === 'wind_spirit') {
        // Wind spirit - ethereal swirl with fade based on age
        const age = (now - (e.spawnTime || now)) / 1000;
        const fadeAlpha = age > 8 ? Math.max(0.2, 1 - (age - 8) / 2) : 1; // Fade out last 2 seconds
        ctx.globalAlpha = 0.6 * fadeAlpha;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const phase = now / 200 + i * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(phase) * 4, Math.sin(phase) * 4, e.size / 2 - i * 2, 0, Math.PI * 1.5);
          ctx.stroke();
        }
        ctx.fillStyle = '#FFF';
        ctx.globalAlpha = 0.8 * fadeAlpha;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.type === 'boss') {
        ctx.shadowColor = '#FF1744';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(0, 0, e.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (e.type === 'final_boss') {
        const pulse = Math.sin(now / 150) * 0.3 + 0.7;
        ctx.shadowColor = '#8B0000';
        ctx.shadowBlur = 50 * pulse;
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(0, 0, e.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Health bar for tanky enemies
      if (e.maxHp > 20 && e.type !== 'wind_spirit') {
        const bw = e.type === 'boss' || e.type === 'final_boss' ? e.size * 1.5 : e.size * 1.2;
        const hp = e.hp / e.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(-bw / 2, -e.size / 2 - 12, bw, e.type === 'boss' || e.type === 'final_boss' ? 6 : 4);
        ctx.fillStyle = hp > 0.5 ? '#4ADE80' : hp > 0.25 ? '#FBBF24' : '#FF6B6B';
        ctx.fillRect(-bw / 2, -e.size / 2 - 12, bw * hp, e.type === 'boss' || e.type === 'final_boss' ? 6 : 4);
      }
      ctx.restore();
    });
    
    // Projectile trails
    projectileTrailsRef.current.forEach(t => {
      const sx = t.x - cam.x, sy = t.y - cam.y;
      if (sx < -10 || sx > CANVAS_WIDTH + 10 || sy < -10 || sy > CANVAS_HEIGHT + 10) return;
      ctx.globalAlpha = t.life * 0.5;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 * t.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    
    // Projectiles
    projectilesRef.current.forEach(pr => {
      const sx = pr.x - cam.x, sy = pr.y - cam.y;
      if (sx < -20 || sx > CANVAS_WIDTH + 20 || sy < -20 || sy > CANVAS_HEIGHT + 20) return;
      ctx.fillStyle = pr.color;
      ctx.shadowColor = pr.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, pr.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    
    // Player weapon effects
    const psx = p.x - cam.x, psy = p.y - cam.y;
    weaponsRef.current.forEach(w => {
      if (w.type === 'orbiting_donuts') {
        const cnt = 2 + Math.floor(w.level / 2), rad = 50 + w.level * 5;
        for (let i = 0; i < cnt; i++) {
          const a = (w.angle || 0) + (i / cnt) * Math.PI * 2;
          const ox = psx + Math.cos(a) * rad, oy = psy + Math.sin(a) * rad;
          ctx.shadowColor = '#F472B6';
          ctx.shadowBlur = 10;
          if (donutImageRef.current && donutLoadedRef.current) {
            ctx.drawImage(donutImageRef.current, ox - 12, oy - 12, 24, 24);
          } else {
            ctx.fillStyle = '#F472B6';
            ctx.beginPath();
            ctx.arc(ox, oy, 12, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      } else if (w.type === 'frosting_ring') {
        const rad = 40 + w.level * 8;
        ctx.strokeStyle = `rgba(96,165,250,${0.3 + Math.sin((w.angle || 0) * 2) * 0.2})`;
        ctx.lineWidth = 8 + w.level * 2;
        ctx.shadowColor = '#60A5FA';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(psx, psy, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
    
    // Player
    const inv = Date.now() < invincibleUntilRef.current, rad = PLAYER_SIZE / 2;
    ctx.save();
    ctx.translate(psx, psy);
    if (inv && Math.floor(frameCountRef.current / 4) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.shadowColor = '#F472B6';
    ctx.shadowBlur = 20;
    if (pfpImageRef.current && pfpLoadedRef.current) {
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pfpImageRef.current, -rad, -rad, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
      ctx.save();
      ctx.translate(psx, psy);
      if (inv && Math.floor(frameCountRef.current / 4) % 2 === 0) ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#F472B6';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath();
      ctx.arc(0, 0, rad / 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    
    // Particles
    particlesRef.current = particlesRef.current.filter(pt => {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.95;
      pt.vy *= 0.95;
      pt.life -= 0.03;
      if (pt.life <= 0) return false;
      
      const sx = pt.x - cam.x, sy = pt.y - cam.y;
      if (sx < -20 || sx > CANVAS_WIDTH + 20 || sy < -20 || sy > CANVAS_HEIGHT + 20) return false;
      
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      
      if (pt.type === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2 * pt.life;
        ctx.beginPath();
        ctx.arc(sx, sy, pt.size * (2 - pt.life), 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.type === 'burst') {
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(sx, sy, pt.size * pt.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, pt.size * pt.life, 0, Math.PI * 2);
        ctx.fill();
      }
      return true;
    });
    ctx.globalAlpha = 1;
    
    // Damage numbers
    damageNumbersRef.current = damageNumbersRef.current.filter(d => {
      d.y += d.vy;
      d.vy *= 0.95;
      d.life -= 0.025;
      if (d.life <= 0) return false;
      const sx = d.x - cam.x, sy = d.y - cam.y;
      if (sx < -50 || sx > CANVAS_WIDTH + 50 || sy < -50 || sy > CANVAS_HEIGHT + 50) return false;
      ctx.globalAlpha = d.life;
      ctx.fillStyle = d.isCrit ? '#FFD700' : '#FFF';
      ctx.font = d.isCrit ? 'bold 18px monospace' : 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.value.toString(), sx, sy);
      return true;
    });
    ctx.globalAlpha = 1;
    
    // Screen flash overlay
    if (screenFlashRef.current.intensity > 0.01) {
      ctx.fillStyle = screenFlashRef.current.color;
      ctx.globalAlpha = screenFlashRef.current.intensity;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
    }
    
    // HUD
    const gt = Math.floor((now - gameStartTimeRef.current - pausedTimeRef.current) / 1000);
    const m = Math.floor(gt / 60), s = gt % 60;
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 28);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#F472B6';
    ctx.fillText(`LV ${p.level}`, CANVAS_WIDTH / 2, 44);
    
    // Status indicators
    let indicatorY = 58;
    const freezeRemaining = Math.max(0, (freezeUntilRef.current - now) / 1000);
    if (freezeRemaining > 0) {
      ctx.fillStyle = '#00FFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`❄ FROZEN ${freezeRemaining.toFixed(1)}s`, CANVAS_WIDTH / 2, indicatorY);
      indicatorY += 14;
    }
    if (endlessModeRef.current) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 10px monospace';
      const diffPercent = Math.round((endlessDifficultyRef.current - 1) * 100);
      ctx.fillText(`∞ ENDLESS MODE +${diffPercent}%`, CANVAS_WIDTH / 2, indicatorY);
      indicatorY += 14;
    }
    
    // Music style indicator
    const musicStyles = ['♪ Chiptune', '♪ Sci-Fi', '♪ Techno', '♪ Industrial', '♪ Chaos'];
    const currentStyle = Math.min(Math.floor(gt / 300), musicStyles.length - 1);
    if (isMusicOn && gt > 0) {
      ctx.fillStyle = currentStyle === 0 ? '#F472B6' : currentStyle === 1 ? '#60A5FA' : currentStyle === 2 ? '#4ADE80' : currentStyle === 3 ? '#A78BFA' : '#FF6B6B';
      ctx.font = '9px monospace';
      ctx.globalAlpha = 0.7;
      ctx.fillText(musicStyles[currentStyle], CANVAS_WIDTH / 2, indicatorY);
      ctx.globalAlpha = 1;
    }
    
    // Boss warnings
    if (bossWarningRef.current && !bossSpawnedRef.current) {
      ctx.fillStyle = '#FF1744';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('⚠ BOSS INCOMING ⚠', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
    }
    if (finalBossWarningRef.current && !finalBossSpawnedRef.current) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('☠ FINAL BOSS ☠', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
    }
    
    // Wind horde warning
    if (gt >= 300) {
      const timeSinceHorde = (now - lastWindHordeRef.current) / 1000;
      if (timeSinceHorde > 40 && timeSinceHorde < 45) {
        ctx.fillStyle = '#87CEEB';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('~ WIND SPIRITS APPROACHING ~', CANVAS_WIDTH / 2, 72);
      }
    }
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(`${enemiesKilledRef.current} kills`, 15, 28);
    
    // Health bar
    const hp = p.hp / p.maxHp;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(15, CANVAS_HEIGHT - 35, 100, 8);
    ctx.fillStyle = hp > 0.5 ? '#4ADE80' : hp > 0.25 ? '#FBBF24' : '#FF6B6B';
    ctx.fillRect(15, CANVAS_HEIGHT - 35, 100 * hp, 8);
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.ceil(p.hp)}/${p.maxHp}`, 15, CANVAS_HEIGHT - 40);
    
    // XP bar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(15, CANVAS_HEIGHT - 22, CANVAS_WIDTH - 30, 6);
    ctx.fillStyle = '#F472B6';
    ctx.fillRect(15, CANVAS_HEIGHT - 22, (CANVAS_WIDTH - 30) * (p.xp / p.xpToLevel), 6);
    
    // Weapon icons
    ctx.textAlign = 'right';
    weaponsRef.current.forEach((w, i) => {
      const c = WEAPON_CONFIG[w.type];
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = c.color;
      ctx.fillText(c.icon, CANVAS_WIDTH - 15 - i * 26, 28);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#FFF';
      ctx.fillText(w.level.toString(), CANVAS_WIDTH - 10 - i * 26, 38);
    });
    
    // Gadget icons
    gadgetsRef.current.forEach((g, i) => {
      const c = GADGET_CONFIG[g.type];
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = c.color;
      ctx.fillText(c.icon, CANVAS_WIDTH - 15 - i * 24, 56);
      ctx.font = '7px monospace';
      ctx.fillStyle = '#888';
      ctx.fillText('×' + g.stacks.toString(), CANVAS_WIDTH - 10 - i * 24, 65);
    });
    
    if (weaponsRef.current.length > 0 || gadgetsRef.current.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('tap items ▶', CANVAS_WIDTH - 15, 78);
    }
    
    // Joystick
    const j = joystickRef.current;
    if (j.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.startX, j.startY, 50, 0, Math.PI * 2);
      ctx.stroke();
      const dx = j.currentX - j.startX, dy = j.currentY - j.startY;
      const dist = Math.min(Math.hypot(dx, dy), 50);
      const a = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(244,114,182,0.6)';
      ctx.beginPath();
      ctx.arc(j.startX + Math.cos(a) * dist, j.startY + Math.sin(a) * dist, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [isMusicOn]);

  const startGame = useCallback(() => {
    initAudio();
    playerRef.current = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, xp: 0, xpToLevel: BASE_XP_TO_LEVEL, level: 1, speed: PLAYER_SPEED, damage: 1, magnetRange: 70, xpMultiplier: 1, defense: 0, invincibilityBonus: 0, cooldownReduction: 0, vx: 0, vy: 0 };
    cameraRef.current = { x: 0, y: 0 };
    weaponsRef.current = [{ type: selectedStarterWeapon, level: 1, lastFired: 0, angle: 0 }];
    gadgetsRef.current = [];
    enemiesRef.current = [];
    projectilesRef.current = [];
    xpOrbsRef.current = [];
    particlesRef.current = [];
    damageNumbersRef.current = [];
    trailPointsRef.current = [];
    projectileTrailsRef.current = [];
    powerUpsRef.current = [];
    enemyGridRef.current.clear();
    freezeUntilRef.current = 0;
    screenFlashRef.current = { intensity: 0, color: '#FFF' };
    lastWindHordeRef.current = 0;
    
    frameCountRef.current = 0;
    gameStartTimeRef.current = performance.now();
    pausedTimeRef.current = 0;
    lastSpawnTimeRef.current = performance.now();
    invincibleUntilRef.current = 0;
    screenShakeRef.current = { intensity: 0, duration: 0, startTime: 0 };
    enemiesKilledRef.current = 0;
    moveInputRef.current = { x: 0, y: 0 };
    joystickRef.current = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    isPausedRef.current = false;
    bossSpawnedRef.current = false;
    bossWarningRef.current = false;
    finalBossSpawnedRef.current = false;
    finalBossWarningRef.current = false;
    endlessModeRef.current = false;
    endlessDifficultyRef.current = 1.0;
    
    // Reset anti-cheat metrics
    xpCollectedRef.current = 0;
    damageDealtRef.current = 0;
    damageTakenRef.current = 0;
    powerUpsCollectedRef.current = 0;
    bossesDefeatedRef.current = 0;
    
    setRerollsLeft(2);
    setBansLeft(1);
    setBannedUpgrades([]);
    setBanMode(false);
    setScore(0);
    setPlayerLevel(1);
    setSurvivalTime(0);
    setKillCount(0);
    setGameState("playing");
    setShowWeaponMenu(false);
    setShowGadgetInfo(false);
    
    lastFrameTimeRef.current = performance.now();
    gameActiveRef.current = true;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [initAudio, gameLoop, selectedStarterWeapon]);

  // Handle blockchain play
  const recordEntryAndStartGame = useCallback(async (hash: string) => {
    if (!context?.user) return;
    setPlayState('recording');
    try {
      const res = await fetch("/api/games/donut-survivors/free-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context.user.fid,
          walletAddress: address,
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl,
          txHash: hash,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentEntryId(data.entryId);
        currentEntryIdRef.current = data.entryId;
        currentFidRef.current = context.user.fid;
        setPlayState('idle');
        resetWrite();
        startGame();
      } else {
        setErrorMessage(data.error || "Failed to record entry");
        setPlayState('error');
      }
    } catch (error) {
      console.error("Failed to record entry:", error);
      setErrorMessage("Failed to record entry");
      setPlayState('error');
    }
  }, [context?.user, address, resetWrite, startGame]);

  const handlePlay = useCallback(async () => {
    if (!address || !context?.user?.fid) {
      setErrorMessage("Please connect your wallet");
      return;
    }
    setErrorMessage(null);
    setPlayState('confirming');
    writeContract({
      address: FREE_ARCADE_CONTRACT,
      abi: FREE_ARCADE_ABI,
      functionName: "play",
      args: ["donut-survivors"],
    });
  }, [address, context?.user?.fid, writeContract]);

  useEffect(() => {
    if (isConfirmed && txHash && playState === 'confirming') {
      recordEntryAndStartGame(txHash);
    }
  }, [isConfirmed, txHash, playState, recordEntryAndStartGame]);

  useEffect(() => {
    if (writeError) {
      setPlayState('error');
      setErrorMessage(writeError.message?.includes("User rejected") ? "Transaction rejected" : "Transaction failed");
    }
  }, [writeError]);

  const handleShare = useCallback(async () => {
    const miniappUrl = "https://farcaster.xyz/miniapps/BdklKYkhvUwo/sprinkles";
    const castText = `🍩 I survived ${Math.floor(survivalTime / 60)}:${(survivalTime % 60).toString().padStart(2, '0')} and scored ${score} in Donut Survivors! Can you beat it?`;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(miniappUrl)}`);
    } catch {
      try { await navigator.clipboard.writeText(castText + "\n\n" + miniappUrl); alert("Copied!"); } catch {}
    }
  }, [score, survivalTime]);

  const checkEquipClick = useCallback((x: number, y: number): boolean => x >= CANVAS_WIDTH - 120 && x <= CANVAS_WIDTH && y >= 0 && y <= 85, []);
  
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (gameState !== "playing") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    if (checkEquipClick(x, y) && (weaponsRef.current.length > 0 || gadgetsRef.current.length > 0)) { openEquip(); return; }
    joystickRef.current = { active: true, startX: x, startY: y, currentX: x, currentY: y };
  }, [gameState, checkEquipClick, openEquip]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!joystickRef.current.active) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    joystickRef.current.currentX = x;
    joystickRef.current.currentY = y;
    const dx = x - joystickRef.current.startX, dy = y - joystickRef.current.startY, dist = Math.hypot(dx, dy);
    if (dist > 8) {
      const nd = Math.min((dist - 8) / 42, 1), cd = Math.pow(nd, 0.8);
      moveInputRef.current = { x: (dx / dist) * cd, y: (dy / dist) * cd };
    } else moveInputRef.current = { x: 0, y: 0 };
  }, []);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    joystickRef.current.active = false;
    moveInputRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    const update = () => {
      let x = 0, y = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) x--;
      if (keys.has('ArrowRight') || keys.has('KeyD')) x++;
      if (keys.has('ArrowUp') || keys.has('KeyW')) y--;
      if (keys.has('ArrowDown') || keys.has('KeyS')) y++;
      moveInputRef.current = { x, y };
    };
    const down = (e: KeyboardEvent) => {
      keys.add(e.code);
      update();
      if ((e.code === 'Tab' || e.code === 'KeyE') && gameState === 'playing') { e.preventDefault(); openEquip(); }
      if (e.code === 'Escape' && gameState === 'equipment') closeEquip();
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.code); update(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [gameState, openEquip, closeEquip]);

  useEffect(() => {
    if (gameState !== "menu" && gameState !== "gameover") return;
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let id: number;
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      for (let x = -(t * 10) % 40; x < CANVAS_WIDTH + 40; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
      for (let y = -(t * 10) % 40; y < CANVAS_HEIGHT + 40; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
      ctx.textAlign = 'center';
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('DONUT SURVIVORS', CANVAS_WIDTH / 2, 80);
      ctx.shadowBlur = 0;
      const py = 155 + Math.sin(t * 1.5) * 8, pr = 28;
      ctx.save();
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 25;
      if (pfpImageRef.current && pfpLoadedRef.current) {
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, pr, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(pfpImageRef.current, CANVAS_WIDTH / 2 - pr, py - pr, pr * 2, pr * 2);
        ctx.restore();
        ctx.strokeStyle = '#F472B6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, pr, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#F472B6';
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 4; i++) {
        const a = t * 1.5 + (i / 4) * Math.PI * 2;
        const ox = CANVAS_WIDTH / 2 + Math.cos(a) * 55, oy = py + Math.sin(a) * 55 * 0.6;
        ctx.fillStyle = '#F472B6';
        ctx.shadowColor = '#F472B6';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ox, oy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (gameState === "gameover") {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF6B6B';
        ctx.font = 'bold 22px monospace';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 255);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 40px monospace';
        ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 295);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText(`${Math.floor(survivalTime / 60)}:${(survivalTime % 60).toString().padStart(2, '0')} · ${killCount} kills`, CANVAS_WIDTH / 2, 320);
        if (score >= highScore && score > 0) {
          ctx.fillStyle = '#F472B6';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('NEW HIGH SCORE', CANVAS_WIDTH / 2, 340);
        }
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px monospace';
        ctx.fillText('Drag to move · Auto-attack', CANVAS_WIDTH / 2, 260);
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [gameState, score, survivalTime, killCount, highScore]);

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none">
      <style>{`
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent !important; }
        main, main * { user-select: none !important; -webkit-user-select: none !important; touch-action: none !important; }
        html, body { overscroll-behavior: none !important; overflow: hidden !important; position: fixed !important; width: 100% !important; height: 100% !important; }
        @keyframes tilePopIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-pop { animation: tilePopIn 0.35s ease-out forwards; opacity: 0; }
        .pop-delay-1 { animation-delay: 50ms; }
        .pop-delay-2 { animation-delay: 130ms; }
        .pop-delay-3 { animation-delay: 210ms; }
        .pop-delay-4 { animation-delay: 290ms; }
      `}</style>
      
      <div className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 overflow-y-auto hide-scrollbar" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <Header title="SURVIVORS" user={context?.user} />
        
        {/* Prize Pool / Leaderboard Button */}
        <button onClick={() => setShowLeaderboard(true)} className="animate-pop pop-delay-1 relative w-full mb-3 px-4 py-3 bg-gradient-to-br from-zinc-900/80 to-zinc-800/60 border border-zinc-700/50 rounded-xl transition-all active:scale-[0.98] hover:border-zinc-600 group" style={{ minHeight: '70px' }}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2"><img src="/coins/USDC_LOGO.png" alt="USDC" className="w-4 h-4 rounded-full" /><span className="text-[10px] text-zinc-400 font-medium">Weekly Prize Pool</span></div>
              <span className="text-2xl font-bold text-white">${prizeInfo.totalPrize} USDC</span>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1 text-zinc-500 group-hover:text-zinc-300 transition-colors"><span className="text-[10px]">View Leaderboard</span><ChevronRight className="w-3 h-3" /></div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /><span>Resets in <span className="font-bold text-zinc-300">{resetCountdown}</span></span></div>
            </div>
          </div>
        </button>
        
        <div className="flex flex-col items-center">
          <div className="animate-pop pop-delay-2 relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
            <canvas ref={canvasRef} width={SCALED_WIDTH} height={SCALED_HEIGHT} className="rounded-2xl border border-zinc-800 w-full h-full" style={{ touchAction: "none" }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onPointerCancel={handlePointerUp} onContextMenu={e => e.preventDefault()} />
            
            {/* Level Up Screen */}
            {gameState === "levelup" && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-30 rounded-2xl">
                <div className="text-[10px] text-yellow-400/60 uppercase tracking-widest mb-1">Level {playerLevel}</div>
                <h2 className="text-xl font-bold text-white mb-3">{banMode ? 'Select to Ban' : 'Choose Upgrade'}</h2>
                <div className="flex flex-col gap-2 w-full max-w-[290px]">
                  {upgradeOptions.map((opt, i) => {
                    const cfg = opt.type === 'weapon' && opt.weaponType ? WEAPON_CONFIG[opt.weaponType] : opt.type === 'gadget' && opt.gadgetType ? GADGET_CONFIG[opt.gadgetType] : null;
                    return (
                      <button key={i} onClick={() => { if (banMode) { setBansLeft(b => b - 1); setBannedUpgrades(prev => [...prev, opt.type === 'weapon' ? `weapon:${opt.weaponType}` : `gadget:${opt.gadgetType}`]); setBanMode(false); genUpgrades(); } else applyUpgrade(opt); }} className={`flex items-center gap-3 p-3 bg-zinc-900/80 border rounded-lg transition-all active:scale-[0.98] ${banMode ? 'border-red-500/70 hover:bg-red-500/15' : opt.type === 'weapon' ? 'border-zinc-700/50 hover:border-pink-500/70' : 'border-zinc-700/50 hover:border-blue-500/70'}`}>
                        <span className="text-2xl font-bold w-8 text-center" style={{ color: banMode ? '#FF6B6B' : cfg?.color || '#FFF' }}>{opt.icon}</span>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{opt.title}</span>
                            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${banMode ? 'bg-red-500/20 text-red-400' : opt.type === 'weapon' ? 'bg-pink-500/15 text-pink-400' : 'bg-blue-500/15 text-blue-400'}`}>{banMode ? 'Ban' : opt.type}</span>
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{opt.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => { if (rerollsLeft > 0) { setRerollsLeft(r => r - 1); genUpgrades(); } }} disabled={rerollsLeft <= 0 || banMode} className={`px-4 py-2 rounded-lg text-xs font-medium ${rerollsLeft > 0 && !banMode ? 'bg-zinc-800 text-yellow-400 border border-zinc-700' : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'}`}>↻ Reroll ({rerollsLeft})</button>
                  <button onClick={() => setBanMode(!banMode)} disabled={bansLeft <= 0 && !banMode} className={`px-4 py-2 rounded-lg text-xs font-medium ${banMode ? 'bg-red-500 text-white' : bansLeft > 0 ? 'bg-zinc-800 text-red-400 border border-zinc-700' : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'}`}>{banMode ? '✕ Cancel' : `⊘ Ban (${bansLeft})`}</button>
                </div>
              </div>
            )}
            
            {/* Menu/Gameover Buttons */}
            {(gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 pointer-events-none z-20">
                <div className="pointer-events-auto grid grid-cols-2 gap-2 w-[240px]">
                  <button onClick={() => { setShowWeaponMenu(true); setShowGadgetInfo(false); }} className="px-4 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-200 active:scale-95 text-sm">
                    WEAPONS
                  </button>
                  <button onClick={() => { setShowGadgetInfo(true); setShowWeaponMenu(false); }} className="px-4 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-200 active:scale-95 text-sm">
                    GADGETS
                  </button>
                </div>
                <button 
                  onClick={handlePlay} 
                  disabled={playState === 'confirming' || playState === 'recording' || isPending || isConfirming}
                  className="pointer-events-auto px-8 py-2.5 bg-white text-black font-bold rounded-lg hover:bg-gray-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {(playState === 'confirming' || isPending || isConfirming) ? (
                    <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />...</span>
                  ) : playState === 'recording' ? (
                    <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />...</span>
                  ) : (
                    gameState === "gameover" ? "PLAY AGAIN" : "PLAY"
                  )}
                </button>
                <span className="text-[10px] text-zinc-500 pointer-events-auto">Gas Only (~$0.001)</span>
                {errorMessage && <span className="text-[10px] text-red-400 pointer-events-auto">{errorMessage}</span>}
                {gameState === "gameover" && (
                  <button onClick={handleShare} className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-400 active:scale-95 text-sm">
                    <Share2 className="w-4 h-4" />Share Score
                  </button>
                )}
                <div className="text-[10px] text-zinc-500">{gamesPlayedThisWeek} games this week</div>
              </div>
            )}
            
            {/* Weapon Selection Menu */}
            {showWeaponMenu && (gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-0 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-40 rounded-2xl">
                <h2 className="text-xl font-bold text-white mb-4">Starting Weapon</h2>
                <div className="grid grid-cols-4 gap-2.5 max-w-[290px]">
                  {STARTER_WEAPONS.map(t => {
                    const c = WEAPON_CONFIG[t], req = WEAPON_UNLOCK[t], unlocked = gamesPlayed >= req, sel = selectedStarterWeapon === t;
                    return (<button key={t} onClick={() => unlocked && setSelectedStarterWeapon(t)} disabled={!unlocked} className={`relative w-16 h-16 rounded-lg border-2 ${sel ? 'border-pink-500 bg-pink-500/15' : unlocked ? 'border-zinc-700/50 bg-zinc-900/80 hover:border-zinc-500' : 'border-zinc-800/50 bg-zinc-900/30'}`}>
                      <span className="text-2xl" style={{ color: unlocked ? c.color : '#444' }}>{c.icon}</span>
                      {!unlocked && <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-lg"><span className="text-[9px] text-zinc-500">{req}</span></div>}
                    </button>);
                  })}
                </div>
                <div className="mt-4 text-center">
                  <div className="text-sm font-bold" style={{ color: WEAPON_CONFIG[selectedStarterWeapon].color }}>{WEAPON_CONFIG[selectedStarterWeapon].name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{WEAPON_CONFIG[selectedStarterWeapon].description}</div>
                </div>
                <button onClick={() => setShowWeaponMenu(false)} className="mt-5 px-8 py-2 bg-zinc-800 text-white text-sm rounded-lg border border-zinc-700">Confirm</button>
              </div>
            )}
            
            {/* Gadget Info */}
            {showGadgetInfo && (gameState === "menu" || gameState === "gameover") && (
              <div className="absolute inset-0 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-40 rounded-2xl">
                <h2 className="text-xl font-bold text-white mb-4">Gadgets</h2>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
                  {GADGET_ORDER.map(t => { const c = GADGET_CONFIG[t]; return (<div key={t} className="flex items-center gap-2.5 p-2.5 bg-zinc-900/80 border border-zinc-800/50 rounded-lg"><span className="text-xl" style={{ color: c.color }}>{c.icon}</span><div className="flex-1 min-w-0"><div className="text-xs font-medium text-white truncate">{c.name}</div><div className="text-[10px] text-zinc-500">{c.description}</div></div></div>); })}
                </div>
                <p className="mt-4 text-[10px] text-zinc-500 text-center">Earn through level ups · Max 4 · Stack up to 5×</p>
                <button onClick={() => setShowGadgetInfo(false)} className="mt-4 px-8 py-2 bg-zinc-800 text-white text-sm rounded-lg border border-zinc-700">Got it</button>
              </div>
            )}
          </div>
        </div>
        
        <div className="animate-pop pop-delay-3 mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg"><HelpCircle className="w-3 h-3 text-zinc-500" /><span className="text-[11px] text-zinc-400">Help</span></button>
          <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900/80 border rounded-lg ${isMuted ? 'border-red-500/30' : 'border-zinc-800'}`}>{isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-500" />}<span className="text-[11px] text-zinc-400">{isMuted ? 'Muted' : 'Sound'}</span></button>
          <button onClick={() => setIsMusicOn(!isMusicOn)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900/80 border rounded-lg ${isMusicOn ? 'border-pink-500/50' : 'border-zinc-800'}`}><Music className={`w-3 h-3 ${isMusicOn ? 'text-pink-400' : 'text-zinc-500'}`} /><span className="text-[11px] text-zinc-400">{isMusicOn ? 'Music' : 'Music'}</span></button>
        </div>
      </div>
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4" />How to Play</h2>
              <div className="space-y-2.5">
                {[['1', 'Movement', 'Drag anywhere to move. WASD/Arrow keys also work!'], ['2', 'Auto-Attack', 'Your weapons fire automatically at nearby enemies!'], ['3', 'Collect XP', 'Kill enemies to drop pink donuts. Walk over them to level up!'], ['4', 'Weapons', 'Collect up to 4 weapons. Each can be leveled up to 8!'], ['5', 'Gadgets', 'Passive boosts (max 4). Stack them up to 5 times each!'], ['6', 'Equipment', 'Tap items in top-right or press E to view your gear!'], ['7', 'New Enemies', 'Jellybeans zigzag! Licorice splits when killed!'], ['8', 'Wind Spirits', 'After 5 min, wind hordes push you but don\'t hurt!']].map(([n, t, d]) => (<div key={n} className="flex gap-2.5"><div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">{n}</div><div><div className="font-semibold text-white text-xs">{t}</div><div className="text-[11px] text-gray-400">{d}</div></div></div>))}
              </div>
              <button onClick={() => setShowHelp(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200">Got it</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Equipment Viewer Modal */}
      {gameState === "equipment" && equipmentData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) closeEquip(); }} onTouchEnd={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); closeEquip(); } }}>
          <div className="w-full max-w-[360px] bg-black/98 backdrop-blur-sm flex flex-col rounded-2xl overflow-hidden border border-zinc-700" style={{ maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 p-3 border-b border-zinc-800 relative">
              <button onClick={() => closeEquip()} onTouchEnd={(e) => { e.preventDefault(); closeEquip(); }} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center">Game Paused</div>
              <h2 className="text-lg font-bold text-white text-center">Equipment</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div>
                <div className="text-xs text-pink-400 uppercase tracking-wider mb-2">Weapons {equipmentData.weapons.length}/{MAX_WEAPONS}</div>
                <div className="space-y-2">
                  {equipmentData.weapons.map((w, i) => {
                    const cfg = WEAPON_CONFIG[w.type], stats = WEAPON_STATS[w.type];
                    const dmg = cfg.baseDamage * (1 + (w.level - 1) * 0.3) * equipmentData.player.damage;
                    const cdRed = 1 - (equipmentData.player.cooldownReduction || 0);
                    const cd = cfg.baseCooldown * Math.pow(0.9, w.level - 1) * cdRed;
                    return (
                      <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl" style={{ color: cfg.color }}>{cfg.icon}</span>
                          <span className="font-medium text-white text-sm flex-1">{cfg.name}</span>
                          <span className="text-[10px] bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded">LV {w.level}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[9px]">
                          <div><span className="text-zinc-500">DMG:</span> <span className="text-zinc-300">{Math.floor(dmg)}</span></div>
                          <div><span className="text-zinc-500">CD:</span> <span className="text-zinc-300">{Math.floor(cd)}ms</span></div>
                          <div><span className="text-zinc-500">{stats.stat}:</span> <span className="text-zinc-300 text-[8px]">{stats.perLevel}</span></div>
                        </div>
                      </div>
                    );
                  })}
                  {equipmentData.weapons.length === 0 && <div className="text-zinc-600 text-xs text-center py-2">No weapons</div>}
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-400 uppercase tracking-wider mb-2">Gadgets {equipmentData.gadgets.length}/{MAX_GADGETS}</div>
                <div className="space-y-2">
                  {equipmentData.gadgets.map((g, i) => {
                    const cfg = GADGET_CONFIG[g.type];
                    return (
                      <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl" style={{ color: cfg.color }}>{cfg.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white text-sm">{cfg.name}</span>
                              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">×{g.stacks}</span>
                            </div>
                            <div className="text-[9px] text-green-400">{getGadgetBonus(g.type, g.stacks)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {equipmentData.gadgets.length === 0 && <div className="text-zinc-600 text-xs text-center py-2">No gadgets</div>}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Stats</div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                  <div><span className="text-zinc-500">Max HP:</span> <span className="text-zinc-300">{equipmentData.player.maxHp}</span></div>
                  <div><span className="text-zinc-500">Speed:</span> <span className="text-zinc-300">{equipmentData.player.speed.toFixed(2)}</span></div>
                  <div><span className="text-zinc-500">Damage:</span> <span className="text-zinc-300">×{equipmentData.player.damage.toFixed(2)}</span></div>
                  <div><span className="text-zinc-500">XP:</span> <span className="text-zinc-300">×{equipmentData.player.xpMultiplier.toFixed(2)}</span></div>
                  <div><span className="text-zinc-500">Pickup:</span> <span className="text-zinc-300">{Math.floor(equipmentData.player.magnetRange)}px</span></div>
                  <div><span className="text-zinc-500">Defense:</span> <span className="text-zinc-300">{Math.floor((equipmentData.player.defense || 0) * 100)}%</span></div>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 p-3 border-t border-zinc-800">
              <button onClick={() => closeEquip()} onTouchEnd={(e) => { e.preventDefault(); closeEquip(); }} className="w-full px-6 py-3 bg-pink-500 text-white text-sm font-bold rounded-lg hover:bg-pink-400 transition-all active:scale-[0.98]">Resume Game</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowLeaderboard(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <button onClick={() => setShowLeaderboard(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10"><X className="h-4 w-4" /></button>
              <div className="p-4 pb-2 flex-shrink-0">
                <h2 className="text-base font-bold text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-white" />Weekly Leaderboard</h2>
              </div>
              <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
                <span className="text-xs text-gray-400">Prize Pool</span>
                <span className="text-sm font-bold text-white">${prizeInfo.totalPrize} USDC</span>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', maxHeight: '50vh' }}>
                {leaderboard.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-500 text-sm">No scores yet this week. Be the first!</div>
                ) : leaderboard.map((entry, index) => {
                  const prize = prizeInfo.prizeStructure[index];
                  return (
                    <div key={entry.fid} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${entry.rank <= 3 ? "bg-zinc-800/30" : ""}`}>
                      <span className={`w-6 text-center font-bold ${entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}</span>
                      {entry.pfpUrl ? (
                        <img src={entry.pfpUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-700" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-white">{entry.displayName || entry.username || `fid:${entry.fid}`}</span>
                        {prize && <span className="text-[10px] text-green-400">${prize.amount}</span>}
                      </div>
                      <span className="font-bold text-sm text-white">{entry.score}</span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0">
                <p className="text-[10px] text-zinc-500 text-center">Best score per player counts · Resets {resetCountdown}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <NavBar />
    </main>
  );
}