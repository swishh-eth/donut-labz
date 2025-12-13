"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { formatEther } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { AddToFarcasterButton } from "@/components/add-to-farcaster-button";
import { DuneDashboardButton } from "@/components/dune-dashboard-button";
import { CommunityLPButton } from "@/components/community-lp-button";
import { LearnMoreButton } from "@/components/learn-more-button";
import { Info, Pickaxe, Flame, Building, Beaker, Code, Sparkles, MessageCircle, Timer, Dices, Trophy, ChevronDown } from "lucide-react";

const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as const;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

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
  variant?: 'default' | 'amber';
};

const Section = ({ icon, title, children, variant = 'default' }: SectionProps) => {
  const styles = {
    default: 'bg-zinc-900 border border-zinc-800',
    amber: 'border border-amber-500 bg-gradient-to-br from-amber-600/20 to-orange-600/20',
  };

  const titleStyles = {
    default: 'text-white',
    amber: 'text-amber-400',
  };

  return (
    <div className={`rounded-xl p-3 ${styles[variant]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className={`text-sm font-bold ${titleStyles[variant]}`}>{title}</h2>
      </div>
      <div className="text-xs text-gray-400 space-y-1.5">
        {children}
      </div>
    </div>
  );
};

export default function AboutPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [donutExpanded, setDonutExpanded] = useState(false);
  const [sprinklesExpanded, setSprinklesExpanded] = useState(false);

  // Read SPRINKLES balance of dead address (burned tokens)
  const [burnedBalance, setBurnedBalance] = useState<string>("0");
  
  useEffect(() => {
    const fetchBurnedBalance = async () => {
      try {
        // Use Base public RPC to fetch balance
        const response = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: '0xa890060BE1788a676dBC3894160f5dc5DeD2C98D',
                data: '0x70a08231000000000000000000000000000000000000000000000000000000000000dEaD'
              },
              'latest'
            ]
          })
        });
        const data = await response.json();
        if (data.result) {
          const balanceBigInt = BigInt(data.result);
          const formatted = Math.floor(Number(formatEther(balanceBigInt))).toLocaleString();
          setBurnedBalance(formatted);
        }
      } catch (error) {
        console.error('Failed to fetch burned balance:', error);
      }
    };

    fetchBurnedBalance();
    const interval = setInterval(fetchBurnedBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  const formattedBurned = burnedBalance;

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

  // Handle scroll fade
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      
      if (scrollHeight > 0) {
        const topFade = Math.min(1, scrollTop / 100);
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 100);
        setScrollFade({ top: topFade, bottom: bottomFade });
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
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
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        .about-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .about-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative z-10">
          {/* Fixed Header */}
          <div className="flex-shrink-0">
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

            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <AddToFarcasterButton variant="default" />
              <DuneDashboardButton variant="default" />
              <CommunityLPButton variant="default" />
              <LearnMoreButton variant="default" />
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden about-scroll"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            <div className="space-y-2 pb-4">
              {/* What is $DONUT - Clickable Folder */}
              <button
                onClick={() => setDonutExpanded(!donutExpanded)}
                className="w-full text-left border border-amber-500 bg-gradient-to-br from-amber-600/20 to-orange-600/20 rounded-xl p-3 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-amber-400">What Is $DONUT</h2>
                  </div>
                  <ChevronDown 
                    className={`w-4 h-4 text-amber-400 transition-transform duration-300 ${donutExpanded ? 'rotate-180' : ''}`} 
                  />
                </div>
                <div className="text-xs text-gray-400 space-y-1.5">
                  <p>$DONUT is a store-of-value token on Base, mined through a continuous Dutch auction instead of proof-of-work or staking.</p>
                  <p>Auction revenue increases $DONUT's liquidity and scarcity.</p>
                  
                  <div className="mt-2 mb-2">
                    <p className="text-white font-semibold text-[11px] mb-1">DONUT Revenue Split:</p>
                    <div className="pl-2 border-l border-amber-500/30 ml-1 space-y-1">
                      <p><span className="text-amber-400 font-semibold">80%</span> → Previous Glazer (rewards active miners)</p>
                      <p><span className="text-amber-400 font-semibold">15%</span> → Treasury (LP buybacks & burns)</p>
                      <p><span className="text-amber-400 font-semibold">5%</span> → Provider Fee (builder codes)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mt-2">
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">4/sec</div>
                      <div className="text-[10px] text-gray-500">Start Rate</div>
                    </div>
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">30 days</div>
                      <div className="text-[10px] text-gray-500">Halving</div>
                    </div>
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">0.01/s</div>
                      <div className="text-[10px] text-gray-500">Tail Rate</div>
                    </div>
                  </div>
                </div>
              </button>

              {/* DONUT Expanded Tiles */}
              <div 
                className={`space-y-2 overflow-hidden transition-all duration-300 ease-out ${
                  donutExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {/* How Mining Works - DONUT */}
                <Section
                  icon={<Pickaxe className="w-4 h-4 text-white" />}
                  title="How DONUT Mining Works"
                >
                  <p>Only one active miner at a time, called the <span className="text-white font-semibold">King Glazer</span>.</p>
                  <p>The right to mine is bought through a continuous Dutch auction:</p>
                  <div className="pl-2 border-l border-zinc-700 ml-1 space-y-1">
                    <p>• Price doubles after each purchase</p>
                    <p>• Then decays to 0 over one hour</p>
                    <p>• Anyone can purchase control at current price</p>
                  </div>
                </Section>

                {/* Proof of Just-In-Time Stake - DONUT */}
                <Section
                  icon={<Flame className="w-4 h-4 text-white" />}
                  title="Proof of Just-In-Time Stake"
                >
                  <p>ETH is "staked" only while controlling emissions.</p>
                  <p>Profit if the next purchase pays more, lose if it pays less.</p>
                  <p>Earn <span className="text-white font-semibold">$DONUT</span> the entire time you hold control.</p>
                </Section>

                {/* Treasury */}
                <Section
                  icon={<Building className="w-4 h-4 text-white" />}
                  title="Treasury"
                >
                  <p>Treasury ETH is used to buy and burn DONUT-WETH LP in the Blazery.</p>
                  <p>Once sufficient liquidity is established, governance can decide to buy/burn DONUT directly or reinvest.</p>
                </Section>

                {/* Builder Codes */}
                <Section
                  icon={<Code className="w-4 h-4 text-white" />}
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

              {/* What is $SPRINKLES - Clickable Folder */}
              <button
                onClick={() => setSprinklesExpanded(!sprinklesExpanded)}
                className="w-full text-left border border-amber-500 bg-gradient-to-br from-amber-600/20 to-orange-600/20 rounded-xl p-3 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-amber-400">What Is $SPRINKLES</h2>
                  </div>
                  <ChevronDown 
                    className={`w-4 h-4 text-amber-400 transition-transform duration-300 ${sprinklesExpanded ? 'rotate-180' : ''}`} 
                  />
                </div>
                <div className="text-xs text-gray-400 space-y-1.5">
                  <p>$SPRINKLES is a companion token to $DONUT, mined by paying $DONUT in a separate auction.</p>
                  <p className="text-white font-semibold">Max Supply: 210,000,000 SPRINKLES (10x DONUT)</p>
                  <p className="text-gray-500 text-[10px]">10M preminted & seeded with 1,000 DONUT for permanent LP</p>
                  
                  <div className="mt-2 mb-2">
                    <p className="text-white font-semibold text-[11px] mb-1">SPRINKLES Revenue Split:</p>
                    <div className="pl-2 border-l border-amber-500/30 ml-1 space-y-1">
                      <p><span className="text-amber-400 font-semibold">80%</span> → Previous Miner (rewards active miners)</p>
                      <p><span className="text-amber-400 font-semibold">10%</span> → Buy & Burn SPRINKLES (increases scarcity)</p>
                      <p><span className="text-amber-400 font-semibold">2.5%</span> → Leaderboard Prizes (weekly rewards)</p>
                      <p><span className="text-amber-400 font-semibold">2.5%</span> → SPRINKLES/DONUT LP Burn Reward Pool</p>
                      <p><span className="text-amber-400 font-semibold">5%</span> → Donut Labs (prize mechanics & buybacks)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mt-2">
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">40/sec</div>
                      <div className="text-[10px] text-gray-500">Start Rate</div>
                    </div>
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">30 days</div>
                      <div className="text-[10px] text-gray-500">Halving</div>
                    </div>
                    <div className="bg-amber-900/30 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">0.1/s</div>
                      <div className="text-[10px] text-gray-500">Tail Rate</div>
                    </div>
                  </div>

                  <div className="mt-3 p-2 bg-amber-900/30 border border-amber-500/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] text-amber-400 font-semibold">Total SPRINKLES Burned</span>
                      </div>
                      <span className="text-sm font-bold text-amber-300">{formattedBurned}</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* SPRINKLES Expanded Tiles */}
              <div 
                className={`space-y-2 overflow-hidden transition-all duration-300 ease-out ${
                  sprinklesExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {/* How Mining Works - SPRINKLES */}
                <Section
                  icon={<Pickaxe className="w-4 h-4 text-white" />}
                  title="How SPRINKLES Mining Works"
                >
                  <p>Same auction mechanics as DONUT, but you pay <span className="text-white font-semibold">$DONUT</span> instead of ETH.</p>
                  <p>The right to mine is bought through a continuous Dutch auction:</p>
                  <div className="pl-2 border-l border-zinc-700 ml-1 space-y-1">
                    <p>• Price doubles after each purchase</p>
                    <p>• Then decays to 1 DONUT over one hour</p>
                    <p>• Anyone can purchase control at current price</p>
                  </div>
                </Section>

                {/* Proof of Just-In-Time Stake - SPRINKLES */}
                <Section
                  icon={<Flame className="w-4 h-4 text-white" />}
                  title="Proof of Just-In-Time Stake"
                >
                  <p>DONUT is "staked" only while controlling emissions.</p>
                  <p>Profit if the next purchase pays more, lose if it pays less.</p>
                  <p>Earn <span className="text-white font-semibold">$SPRINKLES</span> the entire time you hold control.</p>
                </Section>

                {/* What is Donut Labs? */}
                <Section
                  icon={<Beaker className="w-4 h-4 text-white" />}
                  title="What is Donut Labs?"
                >
                  <p>Donut Labs is an independent donut shop operating inside the $DONUT ecosystem.</p>
                  <p>We build fun ways to interact with $DONUT and $SPRINKLES, including mining interfaces, games, and social features.</p>
                  <p className="text-gray-500 italic">Your friendly neighborhood donut shop on Base.</p>
                </Section>

                {/* Leaderboard */}
                <Section
                  icon={<Trophy className="w-4 h-4 text-white" />}
                  title="Leaderboard"
                >
                  <p>Compete weekly on the Donut Labs leaderboard for a share of the prize pool!</p>
                  <p>Earn points by mining:</p>
                  <div className="pl-2 border-l border-zinc-700 ml-1 space-y-1 mt-1">
                    <p>• <span className="text-white font-semibold">Mine DONUT</span> = 2 points per mine</p>
                    <p>• <span className="text-white font-semibold">Mine SPRINKLES</span> = 1 point per mine</p>
                  </div>
                  <p className="mt-2">Top 3 glazers split the weekly prize pool:</p>
                  <div className="grid grid-cols-3 gap-2 text-center mt-2">
                    <div className="bg-zinc-800 rounded-lg p-2">
                      <div className="text-sm font-bold text-white">🥇 1st</div>
                      <div className="text-[10px] text-gray-400">50%</div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-2">
                      <div className="text-sm font-bold text-white">🥈 2nd</div>
                      <div className="text-[10px] text-gray-400">30%</div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg p-2">
                      <div className="text-sm font-bold text-white">🥉 3rd</div>
                      <div className="text-[10px] text-gray-400">20%</div>
                    </div>
                  </div>
                  <p className="mt-2 text-gray-500 text-[10px]">Leaderboard resets every Friday at 12pm UTC. Prizes include ETH, DONUT, and SPRINKLES!</p>
                </Section>

                {/* Games */}
                <Section
                  icon={<Dices className="w-4 h-4 text-white" />}
                  title="Games"
                >
                  <p>Donut Labs features onchain games where you can win ETH, DONUT, and SPRINKLES.</p>
                  <p>All games are <span className="text-white font-semibold">100% onchain</span> and <span className="text-white font-semibold">provably fair</span> — every bet, spin, and outcome is recorded on Base and verifiable.</p>
                  <div className="pl-2 border-l border-zinc-700 ml-1 space-y-1 mt-2">
                    <p>• <span className="text-white">Glaze Wheel</span> — Spin to win from the prize pool</p>
                    <p>• <span className="text-white">Daily Lottery</span> — Buy tickets for daily draws</p>
                    <p>• <span className="text-gray-500">More games coming soon...</span></p>
                  </div>
                  <p className="mt-2 text-gray-500 text-[10px]">All games have a 1% DONUT fee that funds the SPRINKLES LP burn rewards pool.</p>
                </Section>

                {/* Chat to Earn */}
                <Section
                  icon={<MessageCircle className="w-4 h-4 text-white" />}
                  title="Chat to Earn Sprinkles"
                >
                  <p>Send onchain messages in the Chat tab to earn sprinkles points!</p>
                  <p>Your earnings per message = <span className="text-white font-semibold">Multiplier × Neynar Score</span></p>
                  <div className="mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Timer className="w-3 h-3 text-white" />
                      <span className="text-[10px] text-white font-semibold">Halving Schedule</span>
                    </div>
                    <p className="text-[10px] text-gray-400">Multiplier halves every 30 days: 1x → 0.5x → 0.25x → min 0.1x</p>
                    <p className="text-[10px] text-gray-500 mt-1">Chat early to earn more sprinkles!</p>
                  </div>
                </Section>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}