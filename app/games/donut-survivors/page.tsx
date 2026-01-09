"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Play, X, HelpCircle, Volume2, VolumeX } from "lucide-react";

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

const BASE_XP_TO_LEVEL = 15;
const XP_SCALE = 1.25;

type WeaponType = 'sprinkle_shot' | 'frosting_ring' | 'glaze_wave' | 'sugar_stars' | 'orbiting_donuts' | 'cinnamon_trail';
type EnemyType = 'sprinkle' | 'gummy' | 'candy_corn' | 'chocolate_chunk';
type UpgradeType = 'weapon' | 'gadget';

interface Weapon { type: WeaponType; level: number; lastFired: number; angle?: number; }
interface WeaponConfig { name: string; icon: string; color: string; baseDamage: number; baseCooldown: number; description: string; }
interface Enemy { x: number; y: number; type: EnemyType; hp: number; maxHp: number; speed: number; size: number; xpValue: number; damage: number; color: string; hitFlash: number; }
interface Projectile { x: number; y: number; vx: number; vy: number; damage: number; size: number; color: string; piercing: number; lifetime: number; weaponType: WeaponType; }
interface XPOrb { x: number; y: number; value: number; size: number; }
interface DamageNumber { x: number; y: number; value: number; life: number; vy: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface UpgradeOption { type: UpgradeType; weaponType?: WeaponType; gadgetType?: GadgetType; title: string; description: string; icon: string; }

const WEAPON_CONFIG: Record<WeaponType, WeaponConfig> = {
  sprinkle_shot: { name: 'Sprinkle Shot', icon: '🍬', color: '#FF6B6B', baseDamage: 10, baseCooldown: 500, description: 'Fires sprinkles at nearest enemy' },
  frosting_ring: { name: 'Frosting Ring', icon: '🔵', color: '#60A5FA', baseDamage: 8, baseCooldown: 100, description: 'Rotating ring of frosting damage' },
  glaze_wave: { name: 'Glaze Wave', icon: '🌊', color: '#F472B6', baseDamage: 15, baseCooldown: 2000, description: 'Periodic wave damages all nearby' },
  sugar_stars: { name: 'Sugar Stars', icon: '⭐', color: '#FBBF24', baseDamage: 6, baseCooldown: 800, description: 'Shoots stars in all directions' },
  orbiting_donuts: { name: 'Orbiting Donuts', icon: '🍩', color: '#F472B6', baseDamage: 12, baseCooldown: 50, description: 'Donuts orbit around you' },
  cinnamon_trail: { name: 'Cinnamon Trail', icon: '🔥', color: '#F97316', baseDamage: 5, baseCooldown: 100, description: 'Leave a damaging trail behind' },
};

// Games required to unlock each starter weapon
const WEAPON_UNLOCK_REQUIREMENTS: Record<WeaponType, number> = {
  sprinkle_shot: 0,    // Always unlocked
  frosting_ring: 10,   // 10 games
  sugar_stars: 50,     // 50 games
  glaze_wave: 100,     // 100 games
  orbiting_donuts: 200,// 200 games
  cinnamon_trail: 300, // 300 games
};

const STARTER_WEAPON_ORDER: WeaponType[] = ['sprinkle_shot', 'frosting_ring', 'sugar_stars', 'glaze_wave', 'orbiting_donuts', 'cinnamon_trail'];

// Gadgets - passive upgrades that modify gameplay (max 4)
type GadgetType = 'sugar_rush' | 'thicc_glaze' | 'sprinkle_magnet' | 'donut_armor' | 'hyper_icing' | 'golden_sprinkles' | 'choco_shield' | 'candy_rush';

interface GadgetConfig {
  name: string;
  icon: string;
  color: string;
  description: string;
  effect: string;
}

const GADGET_CONFIG: Record<GadgetType, GadgetConfig> = {
  sugar_rush: { name: 'Sugar Rush', icon: '⚡', color: '#FBBF24', description: '+20% Move Speed', effect: 'speed' },
  thicc_glaze: { name: 'Thicc Glaze', icon: '🛡️', color: '#60A5FA', description: '+30 Max HP', effect: 'max_hp' },
  sprinkle_magnet: { name: 'Sprinkle Magnet', icon: '🧲', color: '#A78BFA', description: '+40% Pickup Range', effect: 'magnet' },
  donut_armor: { name: 'Donut Armor', icon: '🍩', color: '#F472B6', description: '-15% Damage Taken', effect: 'defense' },
  hyper_icing: { name: 'Hyper Icing', icon: '💪', color: '#FF6B6B', description: '+15% All Damage', effect: 'damage' },
  golden_sprinkles: { name: 'Golden Sprinkles', icon: '✨', color: '#FFD700', description: '+25% XP Gain', effect: 'xp_gain' },
  choco_shield: { name: 'Choco Shield', icon: '🍫', color: '#8B4513', description: '+0.5s Invincibility', effect: 'invincibility' },
  candy_rush: { name: 'Candy Rush', icon: '🍭', color: '#FF69B4', description: '-10% Weapon Cooldowns', effect: 'cooldown' },
};

const MAX_GADGETS = 4;

interface Gadget {
  type: GadgetType;
  stacks: number; // How many times this gadget has been picked
}

const ENEMY_CONFIG: Record<EnemyType, { hp: number; speed: number; size: number; xpValue: number; damage: number; color: string; spawnWeight: number }> = {
  sprinkle: { hp: 15, speed: 1.0, size: 16, xpValue: 2, damage: 4, color: '#FF6B6B', spawnWeight: 50 },
  gummy: { hp: 30, speed: 1.2, size: 20, xpValue: 4, damage: 6, color: '#4ADE80', spawnWeight: 30 },
  candy_corn: { hp: 10, speed: 2.0, size: 12, xpValue: 2, damage: 3, color: '#FBBF24', spawnWeight: 15 },
  chocolate_chunk: { hp: 100, speed: 0.5, size: 32, xpValue: 15, damage: 12, color: '#A78BFA', spawnWeight: 5 },
};

export default function DonutSurvivorsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  
  const [gameState, setGameState] = useState<"menu" | "playing" | "levelup" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [killCount, setKillCount] = useState(0);
  const [userPfp, setUserPfp] = useState<string | null>(null);
  const [userFid, setUserFid] = useState<number | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(500); // Set to 500 for testing, 0 for prod
  const [selectedStarterWeapon, setSelectedStarterWeapon] = useState<WeaponType>('sprinkle_shot');
  const [isLoadingStats, setIsLoadingStats] = useState(false); // false for testing
  
  const playerRef = useRef({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, xp: 0, xpToLevel: BASE_XP_TO_LEVEL, level: 1, speed: PLAYER_SPEED, damage: 1, magnetRange: 70, xpMultiplier: 1, facingAngle: 0, defense: 0, invincibilityBonus: 0, cooldownReduction: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const weaponsRef = useRef<Weapon[]>([]);
  const gadgetsRef = useRef<Gadget[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const xpOrbsRef = useRef<XPOrb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const trailPointsRef = useRef<{ x: number; y: number; life: number }[]>([]);
  
  const gameActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const gameStartTimeRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const screenShakeRef = useRef({ intensity: 0, duration: 0, startTime: 0 });
  const joystickRef = useRef({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const moveInputRef = useRef({ x: 0, y: 0 });
  const enemiesKilledRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const donutImageRef = useRef<HTMLImageElement | null>(null);
  const donutLoadedRef = useRef(false);
  const pfpImageRef = useRef<HTMLImageElement | null>(null);
  const pfpLoadedRef = useRef(false);

  // Fetch Farcaster context for PFP and FID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await (sdk as any).context;
        if (!cancelled && ctx?.user) {
          if (ctx.user.pfpUrl) setUserPfp(ctx.user.pfpUrl);
          if (ctx.user.fid) {
            setUserFid(ctx.user.fid);
            // TODO: Fetch games played from API when ready
            // For testing: set to 500 to unlock all weapons, or 0 to test progression
            setGamesPlayed(500);
          }
        }
      } catch {}
      if (!cancelled) setIsLoadingStats(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // SDK ready
  useEffect(() => {
    sdk.actions.ready().catch(() => {});
  }, []);

  // Prevent swipe-to-close gesture on the entire document
  useEffect(() => {
    const preventSwipe = (e: TouchEvent) => {
      if (gameState === "playing") {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchmove', preventSwipe, { passive: false });
    document.addEventListener('touchstart', preventSwipe, { passive: false });
    
    return () => {
      document.removeEventListener('touchmove', preventSwipe);
      document.removeEventListener('touchstart', preventSwipe);
    };
  }, [gameState]);

  // Load PFP image when URL is available
  useEffect(() => {
    if (!userPfp) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { pfpImageRef.current = img; pfpLoadedRef.current = true; };
    img.onerror = () => { pfpLoadedRef.current = false; };
    img.src = userPfp;
  }, [userPfp]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { donutImageRef.current = img; donutLoadedRef.current = true; };
    img.src = '/coins/donut_logo.png';
  }, []);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
      } catch {}
    }
  }, []);

  const playSound = useCallback((freq: number, duration: number, type: OscillatorType = 'sine', vol: number = 0.1) => {
    if (isMuted || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [isMuted]);

  const playHitSound = useCallback(() => playSound(200 + Math.random() * 100, 0.1), [playSound]);
  const playKillSound = useCallback(() => playSound(400, 0.15), [playSound]);
  const playXPSound = useCallback(() => playSound(600 + Math.random() * 200, 0.05, 'sine', 0.05), [playSound]);
  const playHurtSound = useCallback(() => playSound(150, 0.2, 'sawtooth', 0.15), [playSound]);
  
  const playLevelUpSound = useCallback(() => {
    if (isMuted || !audioContextRef.current) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => playSound(freq, 0.4, 'sine', 0.15), i * 80);
    });
  }, [isMuted, playSound]);

  const triggerScreenShake = useCallback((intensity: number, duration: number) => {
    screenShakeRef.current = { intensity, duration, startTime: performance.now() };
  }, []);

  const addParticles = useCallback((x: number, y: number, color: string, count: number, speed: number = 3) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      particlesRef.current.push({ x, y, vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5), vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5), life: 1, maxLife: 1, color, size: 2 + Math.random() * 3 });
    }
  }, []);

  const addDamageNumber = useCallback((x: number, y: number, value: number) => {
    damageNumbersRef.current.push({ x, y, value, life: 1, vy: -2 });
  }, []);

  const spawnEnemy = useCallback(() => {
    const player = playerRef.current;
    const gameTime = (performance.now() - gameStartTimeRef.current) / 1000;
    const angle = Math.random() * Math.PI * 2;
    const distance = 300 + Math.random() * 100;
    const x = Math.max(50, Math.min(WORLD_WIDTH - 50, player.x + Math.cos(angle) * distance));
    const y = Math.max(50, Math.min(WORLD_HEIGHT - 50, player.y + Math.sin(angle) * distance));
    
    // Slower enemy type unlocks
    let types: EnemyType[] = ['sprinkle'];
    if (gameTime > 60) types.push('gummy');       // 1 min
    if (gameTime > 120) types.push('candy_corn'); // 2 min
    if (gameTime > 240) types.push('chocolate_chunk'); // 4 min
    
    const weights = types.map(t => ENEMY_CONFIG[t].spawnWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let selectedType: EnemyType = 'sprinkle';
    for (let i = 0; i < types.length; i++) { random -= weights[i]; if (random <= 0) { selectedType = types[i]; break; } }
    
    const config = ENEMY_CONFIG[selectedType];
    // Slower scaling
    const timeScale = 1 + gameTime / 240;  // HP scales very slowly
    const speedScale = 1 + gameTime / 600; // Speed scales even slower
    
    enemiesRef.current.push({ x, y, type: selectedType, hp: Math.floor(config.hp * timeScale), maxHp: Math.floor(config.hp * timeScale), speed: config.speed * speedScale, size: config.size, xpValue: config.xpValue, damage: config.damage, color: config.color, hitFlash: 0 });
  }, []);

  const fireWeapons = useCallback(() => {
    const player = playerRef.current;
    const now = Date.now();
    
    weaponsRef.current.forEach(weapon => {
      const config = WEAPON_CONFIG[weapon.type];
      const cooldownReduction = 1 - (playerRef.current.cooldownReduction || 0);
      const cooldown = config.baseCooldown * Math.pow(0.9, weapon.level - 1) * cooldownReduction;
      if (now - weapon.lastFired < cooldown) return;
      weapon.lastFired = now;
      const damage = config.baseDamage * (1 + (weapon.level - 1) * 0.3) * player.damage;

      if (weapon.type === 'sprinkle_shot') {
        let nearestEnemy: Enemy | null = null;
        let nearestDist = Infinity;
        for (const e of enemiesRef.current) {
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d < nearestDist && d < 300) {
            nearestEnemy = e;
            nearestDist = d;
          }
        }
        if (nearestEnemy) {
          const angle = Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x);
          const count = Math.min(1 + Math.floor(weapon.level / 3), 3);
          for (let i = 0; i < count; i++) {
            const a = angle + (i - (count - 1) / 2) * 0.2;
            projectilesRef.current.push({ x: player.x, y: player.y, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, damage, size: 6, color: config.color, piercing: Math.floor(weapon.level / 2), lifetime: 60, weaponType: weapon.type });
          }
        }
      } else if (weapon.type === 'sugar_stars') {
        const count = 4 + weapon.level;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          projectilesRef.current.push({ x: player.x, y: player.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, damage, size: 8, color: config.color, piercing: 0, lifetime: 45, weaponType: weapon.type });
        }
      } else if (weapon.type === 'glaze_wave') {
        const range = 80 + weapon.level * 20;
        enemiesRef.current.forEach(e => { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < range) { e.hp -= damage; e.hitFlash = 5; addDamageNumber(e.x, e.y - e.size, Math.floor(damage)); } });
        addParticles(player.x, player.y, config.color, 20, 8);
      }
    });
  }, [addDamageNumber, addParticles]);

  const updateOrbitingWeapons = useCallback((delta: number) => {
    const player = playerRef.current;
    weaponsRef.current.forEach(weapon => {
      if (weapon.type === 'orbiting_donuts') {
        weapon.angle = (weapon.angle || 0) + 0.05 * delta;
        const damage = WEAPON_CONFIG[weapon.type].baseDamage * (1 + (weapon.level - 1) * 0.3) * player.damage;
        const count = 2 + Math.floor(weapon.level / 2), radius = 50 + weapon.level * 5;
        for (let i = 0; i < count; i++) {
          const a = weapon.angle + (i / count) * Math.PI * 2;
          const ox = player.x + Math.cos(a) * radius, oy = player.y + Math.sin(a) * radius;
          enemiesRef.current.forEach(e => { if (Math.hypot(e.x - ox, e.y - oy) < e.size + 15 && e.hitFlash === 0) { e.hp -= damage; e.hitFlash = 8; addDamageNumber(e.x, e.y - e.size, Math.floor(damage)); playHitSound(); } });
        }
      } else if (weapon.type === 'frosting_ring') {
        weapon.angle = (weapon.angle || 0) + 0.08 * delta;
        const damage = WEAPON_CONFIG[weapon.type].baseDamage * (1 + (weapon.level - 1) * 0.3) * player.damage * 0.1;
        const radius = 40 + weapon.level * 8;
        enemiesRef.current.forEach(e => { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < radius + 10 && d > radius - 10) { e.hp -= damage; if (Math.random() < 0.1) addDamageNumber(e.x, e.y - e.size, Math.floor(damage * 10)); } });
      } else if (weapon.type === 'cinnamon_trail') {
        if (frameCountRef.current % 3 === 0) trailPointsRef.current.push({ x: player.x, y: player.y, life: 30 + weapon.level * 10 });
      }
    });
    
    const trailWeapon = weaponsRef.current.find(w => w.type === 'cinnamon_trail');
    if (trailWeapon) {
      const damage = WEAPON_CONFIG['cinnamon_trail'].baseDamage * (1 + (trailWeapon.level - 1) * 0.3) * player.damage * 0.05;
      trailPointsRef.current = trailPointsRef.current.filter(p => { p.life -= delta; enemiesRef.current.forEach(e => { if (Math.hypot(e.x - p.x, e.y - p.y) < 15 + trailWeapon.level * 2) e.hp -= damage; }); return p.life > 0; });
    }
  }, [addDamageNumber, playHitSound]);

  const generateUpgradeOptions = useCallback(() => {
    const options: UpgradeOption[] = [];
    const currentWeaponTypes = weaponsRef.current.map(w => w.type);
    const availableWeapons = (Object.keys(WEAPON_CONFIG) as WeaponType[]).filter(t => !currentWeaponTypes.includes(t));
    
    // Weapon upgrades
    weaponsRef.current.forEach(w => { 
      if (w.level < 8 && Math.random() < 0.5) { 
        const c = WEAPON_CONFIG[w.type]; 
        options.push({ type: 'weapon', weaponType: w.type, title: `${c.name} +`, description: `Level ${w.level} → ${w.level + 1}`, icon: c.icon }); 
      } 
    });
    
    // New weapon option
    if (weaponsRef.current.length < 6 && availableWeapons.length > 0) { 
      const t = availableWeapons[Math.floor(Math.random() * availableWeapons.length)]; 
      const c = WEAPON_CONFIG[t]; 
      options.push({ type: 'weapon', weaponType: t, title: c.name, description: c.description, icon: c.icon }); 
    }
    
    // Gadget options (only if under max gadgets OR upgrading existing)
    const currentGadgetTypes = gadgetsRef.current.map(g => g.type);
    const availableGadgets = (Object.keys(GADGET_CONFIG) as GadgetType[]).filter(t => !currentGadgetTypes.includes(t));
    
    // Upgrade existing gadgets
    gadgetsRef.current.forEach(g => {
      if (g.stacks < 5 && Math.random() < 0.4) {
        const c = GADGET_CONFIG[g.type];
        options.push({ type: 'gadget', gadgetType: g.type, title: `${c.name} +`, description: `Stack ${g.stacks} → ${g.stacks + 1}`, icon: c.icon });
      }
    });
    
    // New gadget option (only if under limit)
    if (gadgetsRef.current.length < MAX_GADGETS && availableGadgets.length > 0) {
      const shuffled = availableGadgets.sort(() => Math.random() - 0.5);
      const numToAdd = Math.min(2, shuffled.length);
      for (let i = 0; i < numToAdd; i++) {
        const t = shuffled[i];
        const c = GADGET_CONFIG[t];
        options.push({ type: 'gadget', gadgetType: t, title: c.name, description: c.description, icon: c.icon });
      }
    }
    
    setUpgradeOptions(options.sort(() => Math.random() - 0.5).slice(0, 3));
  }, []);

  const checkLevelUp = useCallback(() => {
    const p = playerRef.current;
    if (p.xp >= p.xpToLevel) {
      p.xp -= p.xpToLevel; p.level++; p.xpToLevel = Math.floor(BASE_XP_TO_LEVEL * Math.pow(XP_SCALE, p.level - 1));
      setPlayerLevel(p.level); playLevelUpSound(); triggerScreenShake(8, 300); addParticles(p.x, p.y, '#FFD700', 30, 6);
      generateUpgradeOptions();
      isPausedRef.current = true;
      setGameState("levelup");
    }
  }, [playLevelUpSound, triggerScreenShake, addParticles, generateUpgradeOptions]);

  const applyUpgrade = useCallback((opt: UpgradeOption) => {
    const p = playerRef.current;
    
    if (opt.type === 'weapon' && opt.weaponType) {
      const existing = weaponsRef.current.find(w => w.type === opt.weaponType);
      if (existing) existing.level++; 
      else weaponsRef.current.push({ type: opt.weaponType, level: 1, lastFired: 0, angle: 0 });
    } else if (opt.type === 'gadget' && opt.gadgetType) {
      const existing = gadgetsRef.current.find(g => g.type === opt.gadgetType);
      if (existing) {
        existing.stacks++;
      } else {
        gadgetsRef.current.push({ type: opt.gadgetType, stacks: 1 });
      }
      
      // Apply gadget effect
      const config = GADGET_CONFIG[opt.gadgetType];
      switch (config.effect) {
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
    setGameState("playing");
  }, []);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    for (let x = -cam.x % 50; x < CANVAS_WIDTH; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
    for (let y = -cam.y % 50; y < CANVAS_HEIGHT; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(244,114,182,0.3)'; ctx.lineWidth = 3;
    const wl = -cam.x, wt = -cam.y, wr = WORLD_WIDTH - cam.x, wb = WORLD_HEIGHT - cam.y;
    if (wl > 0) { ctx.beginPath(); ctx.moveTo(wl, 0); ctx.lineTo(wl, CANVAS_HEIGHT); ctx.stroke(); }
    if (wr < CANVAS_WIDTH) { ctx.beginPath(); ctx.moveTo(wr, 0); ctx.lineTo(wr, CANVAS_HEIGHT); ctx.stroke(); }
    if (wt > 0) { ctx.beginPath(); ctx.moveTo(0, wt); ctx.lineTo(CANVAS_WIDTH, wt); ctx.stroke(); }
    if (wb < CANVAS_HEIGHT) { ctx.beginPath(); ctx.moveTo(0, wb); ctx.lineTo(CANVAS_WIDTH, wb); ctx.stroke(); }
  }, []);

  const drawTrail = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current, tw = weaponsRef.current.find(w => w.type === 'cinnamon_trail');
    if (!tw) return;
    trailPointsRef.current.forEach(p => { const alpha = p.life / (30 + tw.level * 10); ctx.fillStyle = `rgba(249,115,22,${alpha * 0.6})`; ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, 8 + tw.level * 2, 0, Math.PI * 2); ctx.fill(); });
  }, []);

  const drawXPOrbs = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    xpOrbsRef.current.forEach(o => {
      const sx = o.x - cam.x, sy = o.y - cam.y;
      if (sx < -20 || sx > CANVAS_WIDTH + 20 || sy < -20 || sy > CANVAS_HEIGHT + 20) return;
      ctx.shadowColor = '#F472B6'; ctx.shadowBlur = 10;
      if (donutImageRef.current && donutLoadedRef.current) ctx.drawImage(donutImageRef.current, sx - o.size, sy - o.size, o.size * 2, o.size * 2);
      else { ctx.fillStyle = '#F472B6'; ctx.beginPath(); ctx.arc(sx, sy, o.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
    });
  }, []);

  const drawEnemies = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    enemiesRef.current.forEach(e => {
      const sx = e.x - cam.x, sy = e.y - cam.y;
      if (sx < -50 || sx > CANVAS_WIDTH + 50 || sy < -50 || sy > CANVAS_HEIGHT + 50) return;
      ctx.save(); ctx.translate(sx, sy);
      ctx.fillStyle = e.hitFlash > 0 ? '#FFF' : e.color;
      if (e.type === 'sprinkle') { ctx.beginPath(); ctx.roundRect(-e.size / 2, -e.size / 4, e.size, e.size / 2, e.size / 4); ctx.fill(); }
      else if (e.type === 'gummy') { ctx.beginPath(); ctx.arc(0, 0, e.size / 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-e.size / 3, -e.size / 2, e.size / 4, 0, Math.PI * 2); ctx.arc(e.size / 3, -e.size / 2, e.size / 4, 0, Math.PI * 2); ctx.fill(); }
      else if (e.type === 'candy_corn') { ctx.beginPath(); ctx.moveTo(0, -e.size / 2); ctx.lineTo(-e.size / 2, e.size / 2); ctx.lineTo(e.size / 2, e.size / 2); ctx.closePath(); ctx.fill(); }
      else if (e.type === 'chocolate_chunk') { ctx.beginPath(); ctx.roundRect(-e.size / 2, -e.size / 2, e.size, e.size, 5); ctx.fill(); ctx.fillStyle = e.hitFlash > 0 ? '#FFF' : '#000'; ctx.beginPath(); ctx.arc(-e.size / 5, -e.size / 8, 3, 0, Math.PI * 2); ctx.arc(e.size / 5, -e.size / 8, 3, 0, Math.PI * 2); ctx.fill(); }
      if (e.maxHp > 20) { const bw = e.size * 1.2, hp = e.hp / e.maxHp; ctx.fillStyle = '#333'; ctx.fillRect(-bw / 2, -e.size / 2 - 10, bw, 4); ctx.fillStyle = hp > 0.5 ? '#4ADE80' : hp > 0.25 ? '#FBBF24' : '#FF6B6B'; ctx.fillRect(-bw / 2, -e.size / 2 - 10, bw * hp, 4); }
      ctx.restore();
    });
  }, []);

  const drawProjectiles = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    projectilesRef.current.forEach(p => {
      const sx = p.x - cam.x, sy = p.y - cam.y;
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      if (p.weaponType === 'sugar_stars') { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? p.size : p.size / 2; if (i === 0) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
    });
  }, []);

  const drawOrbitingWeapons = useCallback((ctx: CanvasRenderingContext2D) => {
    const p = playerRef.current, cam = cameraRef.current, sx = p.x - cam.x, sy = p.y - cam.y;
    weaponsRef.current.forEach(w => {
      if (w.type === 'orbiting_donuts') {
        const count = 2 + Math.floor(w.level / 2), radius = 50 + w.level * 5;
        for (let i = 0; i < count; i++) {
          const a = (w.angle || 0) + (i / count) * Math.PI * 2, ox = sx + Math.cos(a) * radius, oy = sy + Math.sin(a) * radius;
          ctx.shadowColor = '#F472B6'; ctx.shadowBlur = 10;
          if (donutImageRef.current && donutLoadedRef.current) ctx.drawImage(donutImageRef.current, ox - 12, oy - 12, 24, 24);
          else { ctx.fillStyle = '#F472B6'; ctx.beginPath(); ctx.arc(ox, oy, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill(); }
          ctx.shadowBlur = 0;
        }
      } else if (w.type === 'frosting_ring') {
        const radius = 40 + w.level * 8;
        ctx.strokeStyle = `rgba(96,165,250,${0.3 + Math.sin((w.angle || 0) * 2) * 0.2})`; ctx.lineWidth = 8 + w.level * 2; ctx.shadowColor = '#60A5FA'; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
      }
    });
  }, []);

  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const p = playerRef.current, cam = cameraRef.current, sx = p.x - cam.x, sy = p.y - cam.y;
    const inv = Date.now() < invincibleUntilRef.current;
    ctx.save(); ctx.translate(sx, sy);
    if (inv && Math.floor(frameCountRef.current / 4) % 2 === 0) ctx.globalAlpha = 0.5;
    
    const radius = PLAYER_SIZE / 2;
    
    // Draw pink glow
    ctx.shadowColor = '#F472B6';
    ctx.shadowBlur = 20;
    
    if (pfpImageRef.current && pfpLoadedRef.current) {
      // Draw PFP with circular clip
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(pfpImageRef.current, -radius, -radius, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
      
      // Redraw border glow
      ctx.save();
      ctx.translate(sx, sy);
      if (inv && Math.floor(frameCountRef.current / 4) % 2 === 0) ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#F472B6';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Fallback to donut
      ctx.fillStyle = '#F472B6';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath();
      ctx.arc(0, 0, radius / 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Sprinkles
      const colors = ['#FF6B6B', '#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frameCountRef.current * 0.02;
        ctx.save();
        ctx.translate(Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.6);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-2, -5, 4, 10);
        ctx.restore();
      }
    }
    ctx.restore();
  }, []);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    particlesRef.current = particlesRef.current.filter(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; if (p.life <= 0) return false; ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); return true; });
    ctx.globalAlpha = 1;
  }, []);

  const drawDamageNumbers = useCallback((ctx: CanvasRenderingContext2D) => {
    const cam = cameraRef.current;
    damageNumbersRef.current = damageNumbersRef.current.filter(d => { d.y += d.vy; d.life -= 0.025; if (d.life <= 0) return false; ctx.globalAlpha = d.life; ctx.fillStyle = '#FFF'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(d.value.toString(), d.x - cam.x, d.y - cam.y); return true; });
    ctx.globalAlpha = 1;
  }, []);

  const drawHUD = useCallback((ctx: CanvasRenderingContext2D) => {
    const p = playerRef.current, gt = Math.floor((performance.now() - gameStartTimeRef.current) / 1000), m = Math.floor(gt / 60), s = gt % 60;
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 30);
    ctx.font = '12px monospace'; ctx.fillStyle = '#F472B6'; ctx.fillText(`LV ${p.level}`, CANVAS_WIDTH / 2, 48);
    ctx.textAlign = 'left'; ctx.fillStyle = '#FFF'; ctx.font = '14px monospace'; ctx.fillText(`☠ ${enemiesKilledRef.current}`, 15, 30);
    const hp = p.hp / p.maxHp; ctx.fillStyle = '#333'; ctx.fillRect(15, CANVAS_HEIGHT - 35, 100, 10); ctx.fillStyle = hp > 0.5 ? '#4ADE80' : hp > 0.25 ? '#FBBF24' : '#FF6B6B'; ctx.fillRect(15, CANVAS_HEIGHT - 35, 100 * hp, 10);
    ctx.fillStyle = '#FFF'; ctx.font = '10px monospace'; ctx.fillText(`${Math.ceil(p.hp)}/${p.maxHp}`, 15, CANVAS_HEIGHT - 40);
    ctx.fillStyle = '#333'; ctx.fillRect(15, CANVAS_HEIGHT - 20, CANVAS_WIDTH - 30, 8); ctx.fillStyle = '#F472B6'; ctx.fillRect(15, CANVAS_HEIGHT - 20, (CANVAS_WIDTH - 30) * (p.xp / p.xpToLevel), 8);
    
    // Draw weapons (top right)
    ctx.textAlign = 'right'; 
    weaponsRef.current.forEach((w, i) => { 
      const c = WEAPON_CONFIG[w.type]; 
      ctx.font = '16px serif'; 
      ctx.fillText(c.icon, CANVAS_WIDTH - 15 - i * 24, 30); 
      ctx.font = '8px monospace'; 
      ctx.fillStyle = '#F472B6'; 
      ctx.fillText(w.level.toString(), CANVAS_WIDTH - 10 - i * 24, 40); 
      ctx.fillStyle = '#FFF'; 
    });
    
    // Draw gadgets (below weapons)
    gadgetsRef.current.forEach((g, i) => { 
      const c = GADGET_CONFIG[g.type]; 
      ctx.font = '14px serif'; 
      ctx.fillText(c.icon, CANVAS_WIDTH - 15 - i * 22, 58); 
      ctx.font = '7px monospace'; 
      ctx.fillStyle = '#60A5FA'; 
      ctx.fillText(g.stacks.toString(), CANVAS_WIDTH - 10 - i * 22, 67); 
      ctx.fillStyle = '#FFF'; 
    });
  }, []);

  const drawJoystick = useCallback((ctx: CanvasRenderingContext2D) => {
    const j = joystickRef.current; if (!j.active) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(j.startX, j.startY, 50, 0, Math.PI * 2); ctx.stroke();
    const dx = j.currentX - j.startX, dy = j.currentY - j.startY, dist = Math.min(Math.hypot(dx, dy), 50), a = Math.atan2(dy, dx);
    ctx.fillStyle = 'rgba(244,114,182,0.6)'; ctx.beginPath(); ctx.arc(j.startX + Math.cos(a) * dist, j.startY + Math.sin(a) * dist, 20, 0, Math.PI * 2); ctx.fill();
  }, []);

  const endGame = useCallback(async () => {
    gameActiveRef.current = false; if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    const st = Math.floor((performance.now() - gameStartTimeRef.current) / 1000), fs = st * 10 + enemiesKilledRef.current * 5;
    setScore(fs); setSurvivalTime(st); setGameState("gameover"); setHighScore(prev => Math.max(prev, fs));
    
    // TODO: Record game played when API is ready
    // For now, just increment locally for testing
    if (st >= 60) {
      setGamesPlayed(prev => prev + 1);
    }
  }, []);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !gameActiveRef.current) return;
    const now = performance.now(), delta = Math.min((now - lastFrameTimeRef.current) / 16.667, 2);
    lastFrameTimeRef.current = now; frameCountRef.current++;

    let shakeX = 0, shakeY = 0; const shake = screenShakeRef.current;
    if (shake.duration > 0) { const el = now - shake.startTime; if (el < shake.duration) { const int = shake.intensity * (1 - el / shake.duration); shakeX = (Math.random() - 0.5) * int * 2; shakeY = (Math.random() - 0.5) * int * 2; } else shake.duration = 0; }
    ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, shakeX * CANVAS_SCALE, shakeY * CANVAS_SCALE);

    const p = playerRef.current, mx = moveInputRef.current.x, my = moveInputRef.current.y, ml = Math.hypot(mx, my);
    
    // Pause game logic during level up (only update visuals)
    if (isPausedRef.current) {
      // Just redraw without updating
      drawBackground(ctx); drawTrail(ctx); drawXPOrbs(ctx); drawEnemies(ctx); drawProjectiles(ctx); drawOrbitingWeapons(ctx); drawPlayer(ctx); drawParticles(ctx); drawDamageNumbers(ctx); drawHUD(ctx);
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }
    
    if (ml > 0) { p.x += (mx / ml) * p.speed * delta; p.y += (my / ml) * p.speed * delta; }
    p.x = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_WIDTH - PLAYER_SIZE / 2, p.x));
    p.y = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_HEIGHT - PLAYER_SIZE / 2, p.y));
    cameraRef.current = { x: p.x - CANVAS_WIDTH / 2, y: p.y - CANVAS_HEIGHT / 2 };

    // Spawn rate: starts at 2000ms, decreases to 400ms minimum over time
    const gt = now - gameStartTimeRef.current, sr = Math.max(400, 2000 - gt / 200);
    if (now - lastSpawnTimeRef.current > sr) { 
      // Spawn count increases every 60 seconds
      const spawnCount = 1 + Math.floor(gt / 60000);
      for (let i = 0; i < spawnCount; i++) spawnEnemy(); 
      lastSpawnTimeRef.current = now; 
    }

    fireWeapons(); updateOrbitingWeapons(delta);

    projectilesRef.current = projectilesRef.current.filter(proj => {
      proj.x += proj.vx * delta; proj.y += proj.vy * delta; proj.lifetime -= delta; if (proj.lifetime <= 0) return false;
      for (const e of enemiesRef.current) { if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.size + proj.size) { e.hp -= proj.damage; e.hitFlash = 5; addDamageNumber(e.x, e.y - e.size, Math.floor(proj.damage)); playHitSound(); addParticles(proj.x, proj.y, proj.color, 5, 2); if (proj.piercing > 0) { proj.piercing--; proj.damage *= 0.8; } else return false; } }
      return true;
    });

    enemiesRef.current = enemiesRef.current.filter(e => {
      e.hitFlash = Math.max(0, e.hitFlash - 1);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
      if (dist > 0) { e.x += (dx / dist) * e.speed * delta; e.y += (dy / dist) * e.speed * delta; }
      if (dist < e.size + PLAYER_SIZE / 2 && Date.now() > invincibleUntilRef.current) { 
        // Apply defense reduction
        const damageReduction = Math.min(p.defense || 0, 0.75); // Cap at 75% reduction
        const actualDamage = Math.floor(e.damage * (1 - damageReduction));
        p.hp -= actualDamage; 
        // Apply invincibility bonus from gadgets
        const invincibilityTime = 750 + (p.invincibilityBonus || 0);  // was 500
        invincibleUntilRef.current = Date.now() + invincibilityTime; 
        playHurtSound(); triggerScreenShake(10, 200); addParticles(p.x, p.y, '#FF6B6B', 10, 4); 
        if (p.hp <= 0) { endGame(); return false; } 
      }
      if (e.hp <= 0) { for (let i = 0; i < (e.type === 'chocolate_chunk' ? 5 : 1); i++) xpOrbsRef.current.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y + (Math.random() - 0.5) * 20, value: e.xpValue, size: 6 + e.xpValue }); playKillSound(); addParticles(e.x, e.y, e.color, 12, 4); enemiesKilledRef.current++; setKillCount(enemiesKilledRef.current); return false; }
      return true;
    });

    xpOrbsRef.current = xpOrbsRef.current.filter(o => {
      const dx = p.x - o.x, dy = p.y - o.y, dist = Math.hypot(dx, dy);
      if (dist < p.magnetRange) { const spd = 5 * (1 - dist / p.magnetRange) + 2; o.x += (dx / dist) * spd * delta; o.y += (dy / dist) * spd * delta; }
      if (dist < PLAYER_SIZE / 2 + o.size) { p.xp += o.value * p.xpMultiplier; playXPSound(); return false; }
      return true;
    });

    checkLevelUp();
    drawBackground(ctx); drawTrail(ctx); drawXPOrbs(ctx); drawEnemies(ctx); drawProjectiles(ctx); drawOrbitingWeapons(ctx); drawPlayer(ctx); drawParticles(ctx); drawDamageNumbers(ctx); drawHUD(ctx); drawJoystick(ctx);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [spawnEnemy, fireWeapons, updateOrbitingWeapons, checkLevelUp, endGame, drawBackground, drawTrail, drawXPOrbs, drawEnemies, drawProjectiles, drawOrbitingWeapons, drawPlayer, drawParticles, drawDamageNumbers, drawHUD, drawJoystick, addDamageNumber, addParticles, playHitSound, playKillSound, playXPSound, playHurtSound, triggerScreenShake]);

  const startGame = useCallback(() => {
    initAudioContext();
    playerRef.current = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, xp: 0, xpToLevel: BASE_XP_TO_LEVEL, level: 1, speed: PLAYER_SPEED, damage: 1, magnetRange: 70, xpMultiplier: 1, facingAngle: 0, defense: 0, invincibilityBonus: 0, cooldownReduction: 0 };
    cameraRef.current = { x: 0, y: 0 }; 
    // Use selected starter weapon
    weaponsRef.current = [{ type: selectedStarterWeapon, level: 1, lastFired: 0, angle: 0 }];
    gadgetsRef.current = []; // Reset gadgets
    enemiesRef.current = []; projectilesRef.current = []; xpOrbsRef.current = []; particlesRef.current = []; damageNumbersRef.current = []; trailPointsRef.current = [];
    frameCountRef.current = 0; gameStartTimeRef.current = performance.now(); lastSpawnTimeRef.current = performance.now(); invincibleUntilRef.current = 0;
    screenShakeRef.current = { intensity: 0, duration: 0, startTime: 0 }; enemiesKilledRef.current = 0; moveInputRef.current = { x: 0, y: 0 }; joystickRef.current = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };
    isPausedRef.current = false;
    setScore(0); setPlayerLevel(1); setSurvivalTime(0); setKillCount(0); setGameState("playing");
    lastFrameTimeRef.current = performance.now(); gameActiveRef.current = true;
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [initAudioContext, gameLoop, selectedStarterWeapon]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (gameState !== "playing") return;
    e.preventDefault();
    e.stopPropagation();
    
    // Capture pointer to prevent gesture interference
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width), y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    joystickRef.current = { active: true, startX: x, startY: y, currentX: x, currentY: y };
  }, [gameState]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!joystickRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width), y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    joystickRef.current.currentX = x; joystickRef.current.currentY = y;
    const dx = x - joystickRef.current.startX, dy = y - joystickRef.current.startY, dist = Math.hypot(dx, dy);
    if (dist > 5) { const cd = Math.min(dist, 50); moveInputRef.current = { x: (dx / dist) * (cd / 50), y: (dy / dist) * (cd / 50) }; } else moveInputRef.current = { x: 0, y: 0 };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    joystickRef.current.active = false;
    moveInputRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    const update = () => { let x = 0, y = 0; if (keys.has('ArrowLeft') || keys.has('KeyA')) x--; if (keys.has('ArrowRight') || keys.has('KeyD')) x++; if (keys.has('ArrowUp') || keys.has('KeyW')) y--; if (keys.has('ArrowDown') || keys.has('KeyS')) y++; moveInputRef.current = { x, y }; };
    const down = (e: KeyboardEvent) => { keys.add(e.code); update(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.code); update(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    if (gameState !== "menu" && gameState !== "gameover") return;
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    let id: number; const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; const off = (t * 20) % 50;
      for (let x = -off; x < CANVAS_WIDTH; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
      for (let y = -off; y < CANVAS_HEIGHT; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
      for (let i = 0; i < 8; i++) { const ex = ((t * 30 + i * 80) % (CANVAS_WIDTH + 40)) - 20, ey = 100 + Math.sin(t + i * 2) * 30 + i * 40, c = ENEMY_CONFIG[(['sprinkle', 'gummy', 'candy_corn'] as EnemyType[])[i % 3]]; ctx.fillStyle = c.color + '60'; ctx.beginPath(); ctx.arc(ex, ey, c.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.shadowColor = '#F472B6'; ctx.shadowBlur = 20;
      ctx.fillText('DONUT', CANVAS_WIDTH / 2, 70); ctx.fillText('SURVIVORS', CANVAS_WIDTH / 2, 100); ctx.shadowBlur = 0;
      
      const py = 180 + Math.sin(t * 2) * 10;
      const playerRadius = 30;
      
      // Draw player (PFP or donut fallback)
      ctx.save();
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = 20;
      
      if (pfpImageRef.current && pfpLoadedRef.current) {
        // Draw PFP with circular clip
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, playerRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(pfpImageRef.current, CANVAS_WIDTH / 2 - playerRadius, py - playerRadius, playerRadius * 2, playerRadius * 2);
        ctx.restore();
        
        // Draw border glow
        ctx.save();
        ctx.strokeStyle = '#F472B6';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#F472B6';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, playerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        // Fallback donut
        ctx.fillStyle = '#F472B6';
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, playerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0d0d0d';
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH / 2, py, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Orbiting donuts
      for (let i = 0; i < 3; i++) { const a = t * 2 + (i / 3) * Math.PI * 2, ox = CANVAS_WIDTH / 2 + Math.cos(a) * 60, oy = py + Math.sin(a) * 60; ctx.fillStyle = '#F472B6'; ctx.shadowColor = '#F472B6'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(ox, oy, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
      
      if (gameState === "gameover") {
        ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 24px monospace'; ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, 255);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 36px monospace'; ctx.fillText(`${score}`, CANVAS_WIDTH / 2, 290);
        ctx.fillStyle = '#888'; ctx.font = '12px monospace'; ctx.fillText(`Time: ${Math.floor(survivalTime / 60)}:${(survivalTime % 60).toString().padStart(2, '0')} | Kills: ${killCount}`, CANVAS_WIDTH / 2, 315);
        ctx.fillStyle = '#F472B6'; ctx.font = '10px monospace'; ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2, 335);
      } else { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px monospace'; ctx.fillText('Drag to move • Auto-attack', CANVAS_WIDTH / 2, 265); ctx.fillText('Survive as long as you can!', CANVAS_WIDTH / 2, 285); }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [gameState, score, survivalTime, killCount, highScore]);

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white select-none overscroll-none fixed inset-0">
      <style>{`
        * { -webkit-tap-highlight-color: transparent !important; }
        main, main * { user-select: none !important; -webkit-user-select: none !important; touch-action: none !important; }
        html, body { overscroll-behavior: none !important; overflow: hidden !important; position: fixed !important; width: 100% !important; height: 100% !important; }
      `}</style>
      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col items-center justify-center bg-black p-4"
        onTouchStart={e => { if (gameState === "playing") e.preventDefault(); }}
        onTouchMove={e => { if (gameState === "playing") e.preventDefault(); }}
      >
        <div className="relative w-full" style={{ maxWidth: `${CANVAS_WIDTH}px`, aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
          <canvas ref={canvasRef} width={SCALED_WIDTH} height={SCALED_HEIGHT} className="rounded-2xl border border-zinc-800 w-full h-full" style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onPointerCancel={handlePointerUp} onContextMenu={e => e.preventDefault()} onTouchStart={e => { if (gameState === "playing") e.preventDefault(); }} onTouchMove={e => e.preventDefault()} onTouchEnd={e => e.preventDefault()} />
          {gameState === "levelup" && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 z-30 rounded-2xl">
              <h2 className="text-2xl font-bold text-yellow-400 mb-2">LEVEL UP!</h2>
              <p className="text-sm text-zinc-400 mb-4">Level {playerLevel} - Choose an upgrade</p>
              <div className="flex flex-col gap-2 w-full max-w-[280px]">
                {upgradeOptions.map((opt, i) => (
                  <button 
                    key={i} 
                    onClick={() => applyUpgrade(opt)} 
                    className={`flex items-center gap-3 p-3 bg-zinc-900 border rounded-xl hover:bg-zinc-800 transition-all active:scale-95 ${
                      opt.type === 'weapon' ? 'border-pink-500/50 hover:border-pink-500' : 'border-blue-500/50 hover:border-blue-500'
                    }`}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{opt.title}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          opt.type === 'weapon' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {opt.type === 'weapon' ? 'WEAPON' : 'GADGET'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400">{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-zinc-500">
                Weapons: {weaponsRef.current.length}/6 • Gadgets: {gadgetsRef.current.length}/{MAX_GADGETS}
              </div>
            </div>
          )}
          {(gameState === "menu" || gameState === "gameover") && (
            <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-3 pointer-events-none z-20">
              {/* Starter Weapon Selector */}
              <div className="pointer-events-auto bg-black/80 backdrop-blur-sm rounded-xl p-3 border border-zinc-800">
                <div className="text-[10px] text-zinc-400 text-center mb-2">STARTER WEAPON</div>
                <div className="flex gap-1.5 flex-wrap justify-center max-w-[280px]">
                  {STARTER_WEAPON_ORDER.map((weaponType) => {
                    const config = WEAPON_CONFIG[weaponType];
                    const required = WEAPON_UNLOCK_REQUIREMENTS[weaponType];
                    const isUnlocked = gamesPlayed >= required;
                    const isSelected = selectedStarterWeapon === weaponType;
                    
                    return (
                      <button
                        key={weaponType}
                        onClick={() => isUnlocked && setSelectedStarterWeapon(weaponType)}
                        disabled={!isUnlocked}
                        className={`relative flex flex-col items-center justify-center w-12 h-12 rounded-lg border-2 transition-all ${
                          isSelected 
                            ? 'border-pink-500 bg-pink-500/20' 
                            : isUnlocked 
                              ? 'border-zinc-700 bg-zinc-900 hover:border-zinc-500' 
                              : 'border-zinc-800 bg-zinc-900/50 opacity-50'
                        }`}
                        title={isUnlocked ? config.name : `Unlock at ${required} games`}
                      >
                        <span className="text-lg">{config.icon}</span>
                        {!isUnlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                            <span className="text-[8px] text-zinc-400">🔒{required}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9px] text-zinc-500 text-center mt-2">
                  {WEAPON_CONFIG[selectedStarterWeapon].name} • {gamesPlayed} games played
                </div>
              </div>
              
              <button onClick={startGame} className="pointer-events-auto flex items-center gap-2 px-6 py-2 bg-green-500 text-black font-bold rounded-full hover:bg-green-400 active:scale-95">
                <Play className="w-4 h-4" /><span className="text-sm">{gameState === "gameover" ? "Play Again" : "Play"}</span>
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full hover:border-zinc-500"><HelpCircle className="w-3 h-3 text-zinc-400" /><span className="text-xs">How to Play</span></button>
          <button onClick={() => setIsMuted(!isMuted)} className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-900 border rounded-full hover:border-zinc-500 ${isMuted ? 'border-red-500/50' : 'border-zinc-700'}`}>{isMuted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-zinc-400" />}<span className="text-xs">{isMuted ? 'Muted' : 'Sound'}</span></button>
        </div>
      </div>
      {showHelp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
              <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4" />How to Play</h2>
              <div className="space-y-2.5">
                {[
                  ['1', 'Movement', 'Drag anywhere to move. WASD/Arrow keys also work!'], 
                  ['2', 'Auto-Attack', 'Your weapons fire automatically at nearby enemies!'], 
                  ['3', 'Collect XP', 'Kill enemies to drop pink donuts. Walk over them to level up!'], 
                  ['4', 'Weapons', 'Collect up to 6 weapons. Each can be leveled up to 8!'],
                  ['5', 'Gadgets', 'Passive boosts (max 4). Stack them up to 5 times each!']
                ].map(([n, t, d]) => (
                  <div key={n} className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">{n}</div>
                    <div><div className="font-semibold text-white text-xs">{t}</div><div className="text-[11px] text-gray-400">{d}</div></div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowHelp(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200">Got it</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}