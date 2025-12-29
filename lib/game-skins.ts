// Global skins system - shared across all games
// Place at: lib/game-skins.ts

export const GAME_SKINS = [
  { id: "classic", name: "Classic Pink", frostingColor: "#FF69B4", sprinkleColors: ["#FFD700", "#00FF00", "#00BFFF", "#FF4500", "#FFFFFF", "#FF00FF"], cost: 0 },
  { id: "chocolate", name: "Chocolate", frostingColor: "#8B4513", sprinkleColors: ["#FFFFFF", "#FFD700", "#FF69B4", "#00BFFF", "#FF4500", "#00FF00"], cost: 100 },
  { id: "blueberry", name: "Blueberry", frostingColor: "#4169E1", sprinkleColors: ["#FFFFFF", "#FFD700", "#FF69B4", "#00FF00", "#FF4500", "#00BFFF"], cost: 100 },
  { id: "mint", name: "Mint Chip", frostingColor: "#98FB98", sprinkleColors: ["#8B4513", "#FFFFFF", "#FFD700", "#FF69B4", "#00BFFF", "#FF4500"], cost: 100 },
  { id: "sunset", name: "Sunset", frostingColor: "#FF6347", sprinkleColors: ["#FFD700", "#FF4500", "#FFFFFF", "#FF69B4", "#FFA500", "#FFFF00"], cost: 100 },
  { id: "galaxy", name: "Galaxy", frostingColor: "#9400D3", sprinkleColors: ["#FFFFFF", "#FFD700", "#00BFFF", "#FF69B4", "#4169E1", "#00FF00"], cost: 150 },
  { id: "gold", name: "Golden Glaze", frostingColor: "#FFD700", sprinkleColors: ["#FFFFFF", "#8B4513", "#FF4500", "#FF69B4", "#FFA500", "#FFFF00"], cost: 150 },
  { id: "rainbow", name: "Rainbow", frostingColor: "#FF1493", sprinkleColors: ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#9400D3"], cost: 200 },
  { id: "neon", name: "Neon Glow", frostingColor: "#00FF00", sprinkleColors: ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#0000FF", "#FF00FF"], cost: 200 },
  { id: "void", name: "Void", frostingColor: "#1a1a2e", sprinkleColors: ["#9400D3", "#4169E1", "#00BFFF", "#9400D3", "#4169E1", "#00BFFF"], cost: 250 },
] as const;

export type GameSkin = typeof GAME_SKINS[number];

// Get owned skins from localStorage
export function getOwnedSkins(address: string): string[] {
  if (typeof window === 'undefined') return ['classic'];
  const saved = localStorage.getItem(`game-skins-${address.toLowerCase()}`);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return ['classic'];
    }
  }
  return ['classic'];
}

// Save owned skins to localStorage
export function saveOwnedSkins(address: string, skinIds: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`game-skins-${address.toLowerCase()}`, JSON.stringify(skinIds));
}

// Get selected skin from localStorage
export function getSelectedSkin(address: string): string {
  if (typeof window === 'undefined') return 'classic';
  return localStorage.getItem(`game-selected-skin-${address.toLowerCase()}`) || 'classic';
}

// Save selected skin to localStorage
export function saveSelectedSkin(address: string, skinId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`game-selected-skin-${address.toLowerCase()}`, skinId);
}

// Get full skin object by ID
export function getSkinById(skinId: string): GameSkin {
  return GAME_SKINS.find(s => s.id === skinId) || GAME_SKINS[0];
}