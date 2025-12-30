// lib/game-skins.ts

export type GameSkin = {
  id: string;
  name: string;
  frostingColor: string;
  cost: number;
  rarity: 'common' | 'rare' | 'legendary';
  animated?: boolean;
  animationType?: 'pulse' | 'rainbow' | 'sparkle' | 'glow';
};

export const GAME_SKINS: GameSkin[] = [
  // Free starter skin
  { id: 'classic', name: 'Classic', frostingColor: '#F472B6', cost: 0, rarity: 'common' },
  
  // Common skins - 10 DONUT
  { id: 'mint', name: 'Mint', frostingColor: '#34D399', cost: 10, rarity: 'common' },
  { id: 'blueberry', name: 'Blueberry', frostingColor: '#60A5FA', cost: 10, rarity: 'common' },
  { id: 'grape', name: 'Grape', frostingColor: '#A78BFA', cost: 10, rarity: 'common' },
  { id: 'lemon', name: 'Lemon', frostingColor: '#FBBF24', cost: 10, rarity: 'common' },
  { id: 'orange', name: 'Orange', frostingColor: '#FB923C', cost: 10, rarity: 'common' },
  
  // Rare skins - 50 DONUT
  { id: 'ruby', name: 'Ruby', frostingColor: '#EF4444', cost: 50, rarity: 'rare' },
  { id: 'emerald', name: 'Emerald', frostingColor: '#10B981', cost: 50, rarity: 'rare' },
  { id: 'sapphire', name: 'Sapphire', frostingColor: '#3B82F6', cost: 50, rarity: 'rare' },
  { id: 'amethyst', name: 'Amethyst', frostingColor: '#8B5CF6', cost: 50, rarity: 'rare' },
  
  // Legendary animated skins - 100 DONUT
  { id: 'rainbow', name: 'Rainbow', frostingColor: '#F472B6', cost: 100, rarity: 'legendary', animated: true, animationType: 'rainbow' },
  { id: 'golden', name: 'Golden', frostingColor: '#FFD700', cost: 100, rarity: 'legendary', animated: true, animationType: 'glow' },
  { id: 'cosmic', name: 'Cosmic', frostingColor: '#7C3AED', cost: 100, rarity: 'legendary', animated: true, animationType: 'sparkle' },
];

const STORAGE_KEY_OWNED = 'donut-labs-owned-skins';
const STORAGE_KEY_SELECTED = 'donut-labs-selected-skin';

export function getOwnedSkins(address: string): string[] {
  if (typeof window === 'undefined') return ['classic'];
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_OWNED}-${address.toLowerCase()}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed.includes('classic')) parsed.unshift('classic');
      return parsed;
    }
  } catch {}
  return ['classic'];
}

export function saveOwnedSkins(address: string, skinIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_OWNED}-${address.toLowerCase()}`, JSON.stringify(skinIds));
  } catch {}
}

export function getSelectedSkin(address: string): string {
  if (typeof window === 'undefined') return 'classic';
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_SELECTED}-${address.toLowerCase()}`);
    if (stored) return stored;
  } catch {}
  return 'classic';
}

export function saveSelectedSkin(address: string, skinId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_SELECTED}-${address.toLowerCase()}`, skinId);
  } catch {}
}

export function getSkinById(id: string): GameSkin {
  return GAME_SKINS.find(s => s.id === id) || GAME_SKINS[0];
}