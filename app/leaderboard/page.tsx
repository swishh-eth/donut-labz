"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

export default function LeaderboardPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          <h1 className="text-2xl font-bold tracking-wide mb-4">LEADERBOARD</h1>
          
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((rank) => (
              <div
                key={rank}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-white">#{rank}</span>
                  <div>
                    <div className="font-semibold">User {rank}</div>
                    <div className="text-xs text-gray-400">@user{rank}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{(1000 - rank * 100).toLocaleString()}</div>
                  <div className="text-xs text-gray-400">donuts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}