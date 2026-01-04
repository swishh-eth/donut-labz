"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Copy, ExternalLink, Check } from "lucide-react";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type CopiedState = string | null;

// Donut coin component
const DonutCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/donut_logo.png" alt="DONUT" className="w-full h-full object-cover" />
  </span>
);

// Sprinkles coin component
const SprinklesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/sprinkles_logo.png" alt="SPRINKLES" className="w-full h-full object-cover" />
  </span>
);

const CONTRACTS = [
  {
    name: "$DONUT Token",
    address: "0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
    description: "ERC-20 token contract",
    type: "donut",
  },
  {
    name: "$SPRINKLES Token",
    address: "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D",
    description: "ERC-20 token contract",
    type: "sprinkles",
  },
  {
    name: "gDONUT (LSG)",
    address: "0xC78B6e362cB0f48b59E573dfe7C99d92153a16d3",
    description: "Liquid Staked Governance DONUT",
    type: "donut",
  },
  {
    name: "DONUT Miner",
    address: "0xf5af51e15E408A78488fBdb06c6f544040a226f6",
    description: "Dutch auction miner",
    type: "donut",
  },
  {
    name: "SPRINKLES Miner",
    address: "0x924b2d4a89b84A37510950031DCDb6552Dc97bcC",
    description: "SPRINKLES miner contract",
    type: "sprinkles",
  },
  {
    name: "DONUT Fee Splitter",
    address: "0xcB2604D87fe3e5b6fe33C5d5Ff05781602357D59",
    description: "Splits SPRINKLES miner fees",
    type: "sprinkles",
  },
  {
    name: "LP Burn Rewards",
    address: "0x710e042d4F13f5c649dBb1774A3695BFcAC253ce",
    description: "LP burn reward distribution",
    type: "donut",
  },
  {
    name: "Treasury",
    address: "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d",
    description: "Protocol treasury",
    type: "neutral",
  },
  {
    name: "DONUT/ETH LP",
    address: "0xEF2a5b4B5Fb475Ff80E72311C8bb7D546c33E5FE",
    description: "Uniswap V3 pool",
    type: "donut",
  },
  {
    name: "SPRINKLES/DONUT LP",
    address: "0x47E8b03017d8b8d058bA5926838cA4dD4531e668",
    description: "Uniswap V2 pool",
    type: "sprinkles",
  },
];

const LINKS = [
  {
    name: "Warpcast Profile",
    url: "https://warpcast.com/swishh.eth",
    description: "Follow @swishh.eth",
    isFarcaster: true,
  },
  {
    name: "Twitter / X",
    url: "https://x.com/swi3hh",
    description: "@swi3hh",
    isFarcaster: false,
  },
  {
    name: "Dune Dashboard",
    url: "https://dune.com/chromium_donut_tech/donut-labs",
    description: "Analytics & data",
    isFarcaster: false,
  },
  {
    name: "BaseScan (DONUT)",
    url: "https://basescan.org/token/0xAE4a37d554C6D6F3E398546d8566B25052e0169C",
    description: "View on explorer",
    isFarcaster: false,
  },
  {
    name: "BaseScan (SPRINKLES)",
    url: "https://basescan.org/token/0xa890060BE1788a676dBC3894160f5dc5DeD2C98D",
    description: "View on explorer",
    isFarcaster: false,
  },
  {
    name: "DexScreener (DONUT)",
    url: "https://dexscreener.com/base/0xef2a5b4b5fb475ff80e72311c8bb7d546c33e5fe",
    description: "Chart & price",
    isFarcaster: false,
  },
  {
    name: "DexScreener (SPRINKLES)",
    url: "https://dexscreener.com/base/0x47e8b03017d8b8d058ba5926838ca4dd4531e668",
    description: "Chart & price",
    isFarcaster: false,
  },
];

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function LinksContractsPage() {
  const readyRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [copied, setCopied] = useState<CopiedState>(null);

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

  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      sdk.haptics.notificationOccurred("success").catch(() => {});
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleOpenUrl = async (url: string, isFarcaster?: boolean) => {
    try {
      if (isFarcaster && url.includes("warpcast.com/")) {
        const username = url.split("warpcast.com/")[1]?.split("/")[0];
        if (username) {
          await sdk.actions.openUrl({ url: `https://warpcast.com/${username}` });
          return;
        }
      }
      await sdk.actions.openUrl({ url });
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleBuyToken = async (tokenAddress: string) => {
    try {
      // Use experimental viewToken with CAIP-19 asset ID format
      const experimental = (sdk as any).experimental;
      if (experimental?.viewToken) {
        await experimental.viewToken({
          token: `eip155:8453/erc20:${tokenAddress}`
        });
      } else {
        // Fallback - try actions.viewToken
        const actions = sdk.actions as any;
        if (actions.viewToken) {
          await actions.viewToken({
            token: `eip155:8453/erc20:${tokenAddress}`
          });
        } else {
          // Final fallback to Uniswap
          await sdk.actions.openUrl({ url: `https://app.uniswap.org/swap?outputCurrency=${tokenAddress}&chain=base` });
        }
      }
    } catch {
      window.open(`https://app.uniswap.org/swap?outputCurrency=${tokenAddress}&chain=base`, "_blank");
    }
  };

  const getAddressColor = (type: string) => {
    if (type === "donut") return "text-pink-400";
    if (type === "sprinkles") return "text-green-400";
    return "text-gray-400";
  };

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style>{`
        .links-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .links-scroll::-webkit-scrollbar {
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
          {/* Header */}
          <div className="flex-shrink-0">
            <Header title="LINKS & CONTRACTS" user={context?.user} />

            {/* Buy Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => handleBuyToken("0xAE4a37d554C6D6F3E398546d8566B25052e0169C")}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-pink-500/20 border border-pink-500/50 hover:bg-pink-500/30 transition-colors active:scale-[0.98]"
              >
                <DonutCoin className="w-5 h-5" />
                <span className="text-sm font-bold text-pink-400">Buy DONUT</span>
              </button>
              <button
                onClick={() => handleBuyToken("0xa890060BE1788a676dBC3894160f5dc5DeD2C98D")}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-green-500/20 border border-green-500/50 hover:bg-green-500/30 transition-colors active:scale-[0.98]"
              >
                <SprinklesCoin className="w-5 h-5" />
                <span className="text-sm font-bold text-green-400">Buy SPRINKLES</span>
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden links-scroll"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            <div className="space-y-6 pb-4">
              {/* Contracts Section */}
              <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Smart Contracts</h2>
                <div className="space-y-2">
                  {CONTRACTS.map((contract) => (
                    <div
                      key={contract.address}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{contract.name}</div>
                        <div className="text-xs text-gray-500">{contract.description}</div>
                        <div className={`text-xs font-mono mt-1 ${getAddressColor(contract.type)}`}>{formatAddress(contract.address)}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={() => handleCopy(contract.address)}
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          {copied === contract.address ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenUrl(`https://basescan.org/address/${contract.address}`)}
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Links Section */}
              <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Useful Links</h2>
                <div className="space-y-2">
                  {LINKS.map((link) => (
                    <button
                      key={link.url}
                      onClick={() => handleOpenUrl(link.url, link.isFarcaster)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{link.name}</div>
                        <div className="text-xs text-gray-500">{link.description}</div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400 ml-3 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}