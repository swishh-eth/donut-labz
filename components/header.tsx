"use client";

import { useEffect, useState, useRef, memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, HelpCircle, Volume2, VolumeX } from "lucide-react";

interface HeaderProps {
  title: string;
  user?: {
    displayName?: string;
    username?: string;
    pfpUrl?: string;
  } | null;
}

interface GameControls {
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenLeaderboard: () => void;
  onOpenHelp: () => void;
}

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

// Memoized user section to prevent re-renders
const UserSection = memo(function UserSection({ 
  user, 
  isVisible 
}: { 
  user: HeaderProps["user"];
  isVisible: boolean;
}) {
  if (!user) return null;
  
  const displayName = user.displayName ?? user.username ?? "Player";
  const handle = user.username ? `@${user.username}` : "";
  const avatarUrl = user.pfpUrl ?? null;

  return (
    <div 
      className={`flex items-center gap-2 rounded-full bg-black px-3 py-1 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none absolute right-0'
      }`}
    >
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

// Game controls section
const GameControlsSection = memo(function GameControlsSection({
  controls,
  isVisible
}: {
  controls: GameControls | null;
  isVisible: boolean;
}) {
  if (!controls) return null;

  return (
    <div 
      className={`flex items-center gap-1.5 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none absolute right-0'
      }`}
    >
      {/* Leaderboard Button */}
      <button
        onClick={controls.onOpenLeaderboard}
        className="p-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
      >
        <Trophy className="w-5 h-5 text-zinc-400" />
      </button>
      
      {/* How to Play Button */}
      <button
        onClick={controls.onOpenHelp}
        className="p-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
      >
        <HelpCircle className="w-5 h-5 text-zinc-400" />
      </button>
      
      {/* Sound Toggle Button */}
      <button
        onClick={controls.onToggleMute}
        className={`p-2 rounded-lg border bg-zinc-900 hover:bg-zinc-800 transition-all ${
          controls.isMuted ? 'border-red-500/50 hover:border-red-400/50' : 'border-zinc-700 hover:border-zinc-600'
        }`}
      >
        {controls.isMuted ? (
          <VolumeX className="w-5 h-5 text-red-400" />
        ) : (
          <Volume2 className="w-5 h-5 text-zinc-400" />
        )}
      </button>
    </div>
  );
});

export function Header({ title, user }: HeaderProps) {
  const [displayedTitle, setDisplayedTitle] = useState(title);
  const [animationState, setAnimationState] = useState<"idle" | "fading-out" | "fading-in">("fading-in");
  const [gameControls, setGameControls] = useState<GameControls | null>(null);
  const [isGamePage, setIsGamePage] = useState(false);
  const isFirstRender = useRef(true);

  // Listen for game control registration
  useEffect(() => {
    const handleRegister = (e: CustomEvent<GameControls>) => {
      setGameControls(e.detail);
      setIsGamePage(true);
    };

    const handleUnregister = () => {
      setIsGamePage(false);
      // Delay clearing controls to allow fade out animation
      setTimeout(() => {
        setGameControls(null);
      }, 300);
    };

    const handleSoundUpdate = (e: CustomEvent<{ isMuted: boolean }>) => {
      setGameControls(prev => prev ? { ...prev, isMuted: e.detail.isMuted } : null);
    };

    window.addEventListener('game-controls-register', handleRegister as EventListener);
    window.addEventListener('game-controls-unregister', handleUnregister);
    window.addEventListener('game-sound-update', handleSoundUpdate as EventListener);

    return () => {
      window.removeEventListener('game-controls-register', handleRegister as EventListener);
      window.removeEventListener('game-controls-unregister', handleUnregister);
      window.removeEventListener('game-sound-update', handleSoundUpdate as EventListener);
    };
  }, []);

  // Title animation effect
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setAnimationState("fading-in");
      return;
    }

    if (title !== displayedTitle) {
      setAnimationState("fading-out");
      
      const timeout = setTimeout(() => {
        setDisplayedTitle(title);
        setAnimationState("fading-in");
      }, 250);
      
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
        <div className="relative flex items-center">
          <UserSection user={user} isVisible={!isGamePage} />
          <GameControlsSection controls={gameControls} isVisible={isGamePage} />
        </div>
      </div>
    </>
  );
}