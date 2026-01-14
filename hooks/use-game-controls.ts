"use client";

import { useEffect, useCallback, useRef } from "react";

interface UseGameControlsOptions {
  onOpenLeaderboard: () => void;
  onOpenHelp: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function useGameControls({
  onOpenLeaderboard,
  onOpenHelp,
  isMuted,
  onToggleMute,
}: UseGameControlsOptions) {
  const registeredRef = useRef(false);

  // Register controls on mount
  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    const controls = {
      isMuted,
      onToggleMute,
      onOpenLeaderboard,
      onOpenHelp,
    };

    window.dispatchEvent(
      new CustomEvent('game-controls-register', { detail: controls })
    );

    return () => {
      registeredRef.current = false;
      window.dispatchEvent(new CustomEvent('game-controls-unregister'));
    };
  }, []); // Only run on mount/unmount

  // Update sound state when it changes
  useEffect(() => {
    if (!registeredRef.current) return;
    
    window.dispatchEvent(
      new CustomEvent('game-sound-update', { detail: { isMuted } })
    );
  }, [isMuted]);

  // Re-register if callbacks change (needed for proper closure updates)
  useEffect(() => {
    if (!registeredRef.current) return;

    const controls = {
      isMuted,
      onToggleMute,
      onOpenLeaderboard,
      onOpenHelp,
    };

    window.dispatchEvent(
      new CustomEvent('game-controls-register', { detail: controls })
    );
  }, [onToggleMute, onOpenLeaderboard, onOpenHelp, isMuted]);
}