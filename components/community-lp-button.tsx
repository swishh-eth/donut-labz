"use client";

import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { sdk } from "@farcaster/miniapp-sdk";

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
  const handleClick = async () => {
    const url = "https://app.uniswap.org/explore/pools/base/0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703";
    
    try {
      await sdk.actions.openUrl({ url });
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
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