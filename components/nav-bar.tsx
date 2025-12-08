"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Flame, Info, Trophy, MessageCircle, Pickaxe } from "lucide-react";

export function NavBar() {
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-zinc-800"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        paddingTop: "8px",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-4 relative">
        {/* Leaderboard */}
        <Link
          href="/leaderboard"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/leaderboard"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Trophy className={cn(
            "transition-all",
            pathname === "/leaderboard" ? "w-7 h-7" : "w-5 h-5"
          )} />
        </Link>

        {/* Chat - Onchain Messages */}
        <Link
          href="/chat"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/chat"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <MessageCircle className={cn(
            "transition-all",
            pathname === "/chat" ? "w-7 h-7" : "w-5 h-5"
          )} />
        </Link>

        {/* Main Mine Page - Pickaxe */}
        <Link
          href="/"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Pickaxe 
            className={cn(
              "transition-all origin-bottom-right",
              pathname === "/" ? "w-7 h-7" : "w-5 h-5"
            )}
            style={{
              transform: isSwinging ? 'rotate(-45deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease-in-out'
            }}
          />
        </Link>

        {/* Blazery */}
        <Link
          href="/blazery"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/blazery"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Flame className={cn(
            "transition-all",
            pathname === "/blazery" ? "w-7 h-7" : "w-5 h-5"
          )} />
        </Link>

        {/* About */}
        <Link
          href="/about"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/about"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <Info className={cn(
            "transition-all",
            pathname === "/about" ? "w-7 h-7" : "w-5 h-5"
          )} />
        </Link>
      </div>
    </nav>
  );
}