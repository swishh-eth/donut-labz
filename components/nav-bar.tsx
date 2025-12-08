"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Flame, Info, Trophy, MessageCircle, Pickaxe } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();
  const [isSwinging, setIsSwinging] = useState(false);

  // Periodic mining swing animation
  useEffect(() => {
    const triggerSwing = () => {
      setIsSwinging(true);
      setTimeout(() => setIsSwinging(false), 400);
      
      // Random interval between 3-6 seconds
      const nextSwing = 3000 + Math.random() * 3000;
      setTimeout(triggerSwing, nextSwing);
    };

    const initialDelay = setTimeout(triggerSwing, 2000);
    return () => clearTimeout(initialDelay);
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-zinc-800"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        paddingTop: "8px",
      }}
    >
      <style jsx>{`
        @keyframes pickaxeSwing {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-45deg); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(-30deg); }
          100% { transform: rotate(0deg); }
        }
        .pickaxe-swing {
          animation: pickaxeSwing 0.4s ease-in-out;
        }
      `}</style>
      
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
              "transition-all",
              pathname === "/" ? "w-7 h-7" : "w-5 h-5",
              isSwinging && "pickaxe-swing"
            )}
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