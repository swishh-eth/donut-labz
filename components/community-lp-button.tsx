"use client";

import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
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
    window.open(
      "https://farcaster.xyz/miniapps/OBSXNsOaGYv1/peeples-donuts",
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={cn("gap-2 transition-all", className)}
    >
      <Users className="h-4 w-4" />
      <span>Community LP Pool</span>
    </Button>
  );
}