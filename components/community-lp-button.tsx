"use client";

import { Target } from "lucide-react";

type CommunityLPButtonProps = {
  variant?: "default" | "compact";
};

export function CommunityLPButton({ variant = "default" }: CommunityLPButtonProps) {
  const handleClick = () => {
    window.open(
      "https://peeples.fun/token/8453/0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
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
        <Target className="w-4 h-4" />
        <span className="text-xs font-semibold">Peeples Pool</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white p-3 rounded-lg transition-colors"
    >
      <Target className="w-4 h-4" />
      <span className="text-xs font-semibold">Peeples Pool</span>
    </button>
  );
}