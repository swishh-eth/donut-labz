"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { Plus } from "lucide-react";

type AddToFarcasterButtonProps = {
  variant?: "default" | "compact";
};

export function AddToFarcasterButton({ variant = "default" }: AddToFarcasterButtonProps) {
  const handleAddToFarcaster = async () => {
    try {
      await sdk.actions.addMiniApp();
    } catch (error) {
      console.error("Failed to add to Farcaster:", error);
    }
  };

  if (variant === "compact") {
    return (
      <button
        onClick={handleAddToFarcaster}
        className="flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
        <span className="text-xs font-semibold">Add</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleAddToFarcaster}
      className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-lg transition-colors"
    >
      <Plus className="w-5 h-5" strokeWidth={3} />
      <span className="text-xs font-semibold">Add to Farcaster</span>
    </button>
  );
}