"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterButton } from "@/components/add-to-farcaster-button";
import { DuneDashboardButton } from "@/components/dune-dashboard-button";
import { CommunityLPButton } from "@/components/community-lp-button";
import { LearnMoreButton } from "@/components/learn-more-button";
import { Info, Pickaxe, PieChart, Clock, Flame, Building, Beaker, Code } from "lucide-react";

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

type SectionProps = {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
};

const Section = ({ icon, title, children }: SectionProps) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h2 className="text-sm font-bold text-white">{title}</h2>
    </div>
    <div className="text-xs text-gray-400 space-y-1.5">
      {children}
    </div>
  </div>
);

export default function AboutPage() {
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

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="page-transition flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-wide">INFO</h1>
            {context?.user && (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage
                    src={userAvatarUrl || undefined}
                    alt={userDisplayName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-zinc-800 text-white">
                    {initialsFrom(userDisplayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle && (
                    <div className="text-xs text-gray-400">{userHandle}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 pb-4">
            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-2">
              <AddToFarcasterButton variant="default" />
              <DuneDashboardButton variant="default" />
              <CommunityLPButton variant="default" />
              <LearnMoreButton variant="default" />
            </div>

            {/* What is $DONUT */}
            <Section
              icon={<Info className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="What Is $DONUT"
            >
              <p>$DONUT is a store-of-value token on Base, mined through a continuous Dutch auction instead of proof-of-work or staking.</p>
              <p>Auction revenue increases $DONUT's liquidity and scarcity.</p>
            </Section>

            {/* How Mining Works */}
            <Section
              icon={<Pickaxe className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="How Mining Works"
            >
              <p>Only one active miner at a time, called the <span className="text-white font-semibold">King Glazer</span>.</p>
              <p>The right to mine is bought with ETH through a continuous Dutch auction:</p>
              <div className="pl-2 border-l border-zinc-700 ml-1 space-y-1">
                <p>• Price doubles after each purchase</p>
                <p>• Then decays to 0 over one hour</p>
                <p>• Anyone can purchase control at current price</p>
              </div>
            </Section>

            {/* Revenue Split */}
            <Section
              icon={<PieChart className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="Revenue Split"
            >
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-lg font-bold text-white">80%</div>
                  <div className="text-[10px] text-gray-500">Prev Glazer</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-lg font-bold text-white">15%</div>
                  <div className="text-[10px] text-gray-500">Treasury</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-lg font-bold text-white">5%</div>
                  <div className="text-[10px] text-gray-500">Provider</div>
                </div>
              </div>
            </Section>

            {/* Emission Schedule */}
            <Section
              icon={<Clock className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="Emission Schedule"
            >
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">4/sec</div>
                  <div className="text-[10px] text-gray-500">Start Rate</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">30 days</div>
                  <div className="text-[10px] text-gray-500">Halving</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <div className="text-sm font-bold text-white">0.01/s</div>
                  <div className="text-[10px] text-gray-500">Tail Rate</div>
                </div>
              </div>
            </Section>

            {/* Proof of Just-In-Time Stake */}
            <Section
              icon={<Flame className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="Proof of Just-In-Time Stake"
            >
              <p>ETH is "staked" only while controlling emissions.</p>
              <p>Profit if the next purchase pays more, lose if it pays less.</p>
              <p>Earn $DONUT the entire time you hold control.</p>
            </Section>

            {/* Treasury */}
            <Section
              icon={<Building className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="Treasury"
            >
              <p>Treasury ETH is used to buy and burn DONUT-WETH LP in the Blazery.</p>
              <p>Once sufficient liquidity is established, governance can decide to buy/burn DONUT directly or reinvest.</p>
            </Section>

            {/* What is Donut Labs? */}
            <Section
              icon={<Beaker className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="What is Donut Labs?"
            >
              <p>Donut Labs is an independent donut shop operating inside the $DONUT ecosystem.</p>
              <p>When you Glaze through this mini-app, you're automatically entered into the <span className="text-white font-semibold">weekly rewards leaderboard</span>.</p>
              <p>Top 3 Glazers of the week split the prize pool!</p>
              <p className="text-gray-500 italic">More Glazes = More Entries = Higher Rank</p>
            </Section>

            {/* Builder Codes */}
            <Section
              icon={<Code className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />}
              title="Builder Codes"
            >
              <p>Anyone can host their own Donut Shop by deploying a frontend.</p>
              <p>Add your builder code to earn 5% of all purchases made through your shop.</p>
              <div className="mt-2 pt-2 border-t border-zinc-800">
                <p className="text-[10px] text-gray-500 mb-1">Official Donut Shops:</p>
                <div className="flex gap-2">
                  <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] text-white">GlazeCorp @heesh</span>
                  <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] text-white">Pinky Glazer @bigbroc</span>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}