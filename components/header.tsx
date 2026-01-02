"use client";

import { useEffect, useState, useRef, memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface HeaderProps {
  title: string;
  user?: {
    displayName?: string;
    username?: string;
    pfpUrl?: string;
  } | null;
}

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Memoized user section to prevent re-renders
const UserSection = memo(function UserSection({ user }: { user: HeaderProps["user"] }) {
  if (!user) return null;
  
  const displayName = user.displayName ?? user.username ?? "Player";
  const handle = user.username ? `@${user.username}` : "";
  const avatarUrl = user.pfpUrl ?? null;

  return (
    <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
      <Avatar className="h-8 w-8 border border-zinc-800">
        <AvatarImage src={avatarUrl || undefined} alt={displayName} className="object-cover" />
        <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(displayName)}</AvatarFallback>
      </Avatar>
      <div className="leading-tight text-left">
        <div className="text-sm font-bold">{displayName}</div>
        {handle && <div className="text-xs text-gray-400">{handle}</div>}
      </div>
    </div>
  );
});

export function Header({ title, user }: HeaderProps) {
  const [displayedTitle, setDisplayedTitle] = useState(title);
  const [animationState, setAnimationState] = useState<"idle" | "fading-out" | "fading-in">("fading-in");
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip animation logic on first render - just fade in
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setAnimationState("fading-in");
      return;
    }

    // If title changed, start fade-out
    if (title !== displayedTitle) {
      setAnimationState("fading-out");
      
      // After fade-out, update title and fade-in
      const timeout = setTimeout(() => {
        setDisplayedTitle(title);
        setAnimationState("fading-in");
      }, 250); // Match fade-out duration
      
      return () => clearTimeout(timeout);
    }
  }, [title, displayedTitle]);

  return (
    <>
      <style>{`
        @keyframes headerFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes headerFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .header-fade-in {
          animation: headerFadeIn 0.4s ease-out forwards;
        }
        .header-fade-out {
          animation: headerFadeOut 0.25s ease-in forwards;
        }
      `}</style>
      <div className="flex items-center justify-between mb-4 h-12">
        <h1 
          className={`text-2xl font-bold tracking-wide ${
            animationState === "fading-out" ? "header-fade-out" : "header-fade-in"
          }`}
        >
          {displayedTitle}
        </h1>
        <UserSection user={user} />
      </div>
    </>
  );
}