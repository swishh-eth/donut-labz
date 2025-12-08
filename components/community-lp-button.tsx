"use client";

import { Droplet } from "lucide-react";

type CommunityLPButtonProps = {
  variant?: "default" | "compact";
};

export function CommunityLPButton({ variant = "default" }: CommunityLPButtonProps) {
  const handleClick = () => {
    window.open(
      "https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts",
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (variant === "compact") {
    return (
      <button
        onClick={handleClick}
        className="flex items-center justify-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white px-3 py-1.5 rounded-lg transition-colors"
      >
        <Droplet className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold">Peeples Pool</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white p-3 rounded-lg transition-colors"
    >
      <Droplet className="w-4 h-4 text-white" />
      <span className="text-xs font-semibold">Peeples Pool</span>
    </button>
  );
}