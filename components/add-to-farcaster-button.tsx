"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Plus, Check } from "lucide-react";

type AddToFarcasterButtonProps = {
  variant?: "default" | "compact";
};

export function AddToFarcasterButton({ variant = "default" }: AddToFarcasterButtonProps) {
  const [isAdded, setIsAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkIfAdded = async () => {
      try {
        const context = await (sdk as any).context;
        // The context includes client.added which tells us if user has added the mini app
        if (context?.client?.added) {
          setIsAdded(true);
        }
      } catch (error) {
        console.error("Failed to check mini app status:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkIfAdded();
  }, []);

  const handleAddToFarcaster = async () => {
    if (isAdded) return;
    
    try {
      const result = await sdk.actions.addMiniApp();
      if (result) {
        setIsAdded(true);
      }
    } catch (error) {
      console.error("Failed to add to Farcaster:", error);
    }
  };

  if (isLoading) {
    if (variant === "compact") {
      return (
        <div className="flex items-center justify-center gap-1.5 bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg">
          <span className="text-xs font-semibold">...</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 bg-zinc-700 text-zinc-400 p-3 rounded-lg">
        <span className="text-xs font-semibold">Loading...</span>
      </div>
    );
  }

  if (isAdded) {
    if (variant === "compact") {
      return (
        <div className="flex items-center justify-center gap-1.5 bg-zinc-800 text-zinc-500 px-3 py-1.5 rounded-lg cursor-default">
          <Check className="w-4 h-4" strokeWidth={3} />
          <span className="text-xs font-semibold">Added</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 bg-zinc-800 text-zinc-500 p-3 rounded-lg cursor-default">
        <Check className="w-5 h-5" strokeWidth={3} />
        <span className="text-xs font-semibold">Added to Farcaster</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <button
        onClick={handleAddToFarcaster}
        className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-black px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
        <span className="text-xs font-semibold">Add</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleAddToFarcaster}
      className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-black p-3 rounded-lg transition-colors"
    >
      <Plus className="w-5 h-5" strokeWidth={3} />
      <span className="text-xs font-semibold">Add to Farcaster</span>
    </button>
  );
}