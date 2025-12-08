"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterDialog } from "@/components/add-to-farcaster-dialog";
import DonutMiner from "@/components/donut-miner";
import SprinklesMiner from "@/components/sprinkles-miner";
import { ArrowLeft } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function HomePage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [selectedMiner, setSelectedMiner] = useState<"donut" | "sprinkles" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => { cancelled = true; };
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

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  // If a miner is selected, show that miner's UI
  if (selectedMiner === "donut") {
    return (
      <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header with back button */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMiner(null)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-2xl font-bold tracking-wide">DONUT</h1>
              </div>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                  </div>
                </div>
              )}
            </div>
            <DonutMiner context={context} />
          </div>
        </div>
        <NavBar />
      </main>
    );
  }

  if (selectedMiner === "sprinkles") {
    return (
      <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <AddToFarcasterDialog showOnFirstVisit={true} />
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header with back button */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMiner(null)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h1 className="text-2xl font-bold tracking-wide">SPRINKLES</h1>
              </div>
              {context?.user && (
                <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                  <Avatar className="h-8 w-8 border border-zinc-800">
                    <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight text-left">
                    <div className="text-sm font-bold">{userDisplayName}</div>
                    {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                  </div>
                </div>
              )}
            </div>
            <SprinklesMiner context={context} />
          </div>
        </div>
        <NavBar />
      </main>
    );
  }

  // Mining selection screen
  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <AddToFarcasterDialog showOnFirstVisit={true} />
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">MINE</h1>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle && <div className="text-xs text-gray-400">{userHandle}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center items-center gap-6">
            <h2 className="text-xl text-gray-400 font-medium">I want to mine...</h2>

            {/* Mining Tiles */}
            <div className="w-full grid grid-cols-2 gap-4 px-2">
              {/* Donut Tile */}
              <button
                onClick={() => setSelectedMiner("donut")}
                className="aspect-square bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-zinc-800 hover:border-zinc-700 transition-all active:scale-95"
              >
                <div className="text-6xl">🍩</div>
                <div className="text-lg font-bold text-white">Donuts</div>
                <div className="text-xs text-gray-400">Pay ETH, earn DONUT</div>
              </button>

              {/* Sprinkles Tile */}
              <button
                onClick={() => setSelectedMiner("sprinkles")}
                className="aspect-square bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-zinc-800 hover:border-zinc-700 transition-all active:scale-95"
              >
                <div className="text-6xl">✨</div>
                <div className="text-lg font-bold text-white">Sprinkles</div>
                <div className="text-xs text-gray-400">Pay DONUT, earn SPRINKLES</div>
              </button>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}