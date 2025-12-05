"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Flame, Info, Trophy, MessageCircle } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

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

        {/* Main Glazery Page */}
        <Link
          href="/"
          className={cn(
            "flex items-center justify-center p-3 transition-all",
            pathname === "/"
              ? "text-white"
              : "text-gray-400 hover:text-gray-300"
          )}
        >
          <div
            className={cn(
              "rounded-full border-[5px] transition-all",
              pathname === "/" 
                ? "border-white w-7 h-7" 
                : "border-gray-400 w-5 h-5 border-[3px]"
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