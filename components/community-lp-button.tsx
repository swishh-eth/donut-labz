"use client";

import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

type CommunityLPButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

export function CommunityLPButton({
  className,
  variant = "default",
  size = "default",
}: CommunityLPButtonProps) {
  const handleClick = () => {
    window.location.href = "https://warpcast.com/~/miniapps/OBSXNsOaGYv1/peeples-donuts";
  };

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={cn("gap-2 transition-all", className)}
    >
      <Coins className="h-4 w-4" />
      <span>Community LP</span>
    </Button>
  );
}