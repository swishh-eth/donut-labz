"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Info, Trophy, MessageCircle, Pickaxe } from "lucide-react";

interface NavBarProps {
  onMineClick?: () => void;
}

export function NavBar({ onMineClick }: NavBarProps) {
  const pathname = usePathname();
  const [isSwinging, setIsSwinging] = useState(false);

  const isMinePage = pathname === "/";

  // Periodic mining swing animation
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const triggerSwing = () => {
      setIsSwinging(true);
      setTimeout(() => setIsSwinging(false), 400);
      
      // If on mine page, swing more frequently (1-2 seconds)
      // Otherwise, swing every 3-6 seconds
      const nextSwing = isMinePage 
        ? 1000 + Math.random() * 1000
        : 3000 + Math.random() * 3000;
      timeoutId = setTimeout(triggerSwing, nextSwing);
    };

    // Start immediately if on mine page, otherwise delay
    const initialDelay = setTimeout(triggerSwing, isMinePage ? 500 : 2000);
    
    return () => {
      clearTimeout(initialDelay);
      clearTimeout(timeoutId);
    };
  }, [isMinePage]);

  const handleMineClick = (e: React.MouseEvent) => {
    if (isMinePage && onMineClick) {
      e.preventDefault();
      onMineClick();
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        paddingTop: "20px",
        background: "linear-gradient(to bottom, transparent 0%, black 30%, black 100%)",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-4 relative">
        {/* Leaderboard */}
        <Link
          href="/leaderboard"
          className={cn(
            "flex items-center justify-center p-3 transition-colors duration-200",
            pathname === "/leaderboard"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Trophy 
            className="transition-all duration-500 ease-out"
            style={{
              width: pathname === "/leaderboard" ? 28 : 20,
              height: pathname === "/leaderboard" ? 28 : 20,
            }}
          />
        </Link>

        {/* Chat - Onchain Messages */}
        <Link
          href="/chat"
          className={cn(
            "flex items-center justify-center p-3 transition-colors duration-200",
            pathname === "/chat"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <MessageCircle 
            className="transition-all duration-500 ease-out"
            style={{
              width: pathname === "/chat" ? 28 : 20,
              height: pathname === "/chat" ? 28 : 20,
            }}
          />
        </Link>

        {/* Main Mine Page - Pickaxe */}
        <Link
          href="/"
          onClick={handleMineClick}
          className={cn(
            "flex items-center justify-center p-3 transition-colors duration-200",
            pathname === "/"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Pickaxe 
            className="transition-all duration-500 ease-out"
            style={{
              width: pathname === "/" ? 28 : 20,
              height: pathname === "/" ? 28 : 20,
              transform: isSwinging ? 'rotate(15deg)' : 'rotate(0deg)',
            }}
          />
        </Link>

        {/* Swap */}
        <Link
          href="/swap"
          className={cn(
            "flex items-center justify-center p-3 transition-colors duration-200",
            pathname === "/swap"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <ArrowLeftRight 
            className="transition-all duration-500 ease-out"
            style={{
              width: pathname === "/swap" ? 28 : 20,
              height: pathname === "/swap" ? 28 : 20,
            }}
          />
        </Link>

        {/* About */}
        <Link
          href="/about"
          className={cn(
            "flex items-center justify-center p-3 transition-colors duration-200",
            pathname === "/about"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Info 
            className="transition-all duration-500 ease-out"
            style={{
              width: pathname === "/about" ? 28 : 20,
              height: pathname === "/about" ? 28 : 20,
            }}
          />
        </Link>
      </div>
    </nav>
  );
}