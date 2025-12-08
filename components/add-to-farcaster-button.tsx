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

  // All states use same base styling for consistent size
  const baseStyles = "flex items-center justify-center gap-2 p-3 rounded-lg transition-colors";

  if (isLoading) {
    return (
      <div className={`${baseStyles} bg-zinc-700 text-zinc-400`}>
        <span className="text-xs font-semibold">Loading...</span>
      </div>
    );
  }

  if (isAdded) {
    return (
      <div className={`${baseStyles} bg-zinc-800 text-zinc-500 cursor-default`}>
        <Check className="w-4 h-4" strokeWidth={3} />
        <span className="text-xs font-semibold">Added to Farcaster</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleAddToFarcaster}
      className={`${baseStyles} bg-amber-600 hover:bg-amber-500 text-black`}
    >
      <Plus className="w-4 h-4" strokeWidth={3} />
      <span className="text-xs font-semibold">Add to Farcaster</span>
    </button>
  );
}