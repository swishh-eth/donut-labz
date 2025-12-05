"use client";

import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type LearnMoreButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

export function LearnMoreButton({
  className,
  variant = "default",
  size = "default",
}: LearnMoreButtonProps) {
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
      <BookOpen className="h-4 w-4" />
      <span>Learn More</span>
    </Button>
  );
}