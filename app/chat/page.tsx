"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Send, MessageCircle, HelpCircle, X, Sparkles, Timer, Heart, Plus } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { GLAZERY_CHAT_ADDRESS, GLAZERY_CHAT_ABI } from "@/lib/contracts/glazery-chat";
import { SprinklesClaimButton } from "@/components/sprinkles-claim-button";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type ChatMessage = {
  sender: string;
  message: string;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: bigint;
  isSystemMessage?: boolean;
  systemType?: "mine_donut" | "mine_sprinkles";
};

type FarcasterProfile = {
  fid: number | null;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  neynarScore: number | null;
};

const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as `0x${string}`;
const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const CHAT_REWARDS_START_TIME = 1765163000;
const HALVING_PERIOD = 30 * 24 * 60 * 60;
const INITIAL_MULTIPLIER = 4.0;
const MIN_MULTIPLIER = 0.5;

const getCurrentMultiplier = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  const halvings = Math.floor(elapsed / HALVING_PERIOD);
  let multiplier = INITIAL_MULTIPLIER;
  for (let i = 0; i < halvings; i++) {
    multiplier = multiplier / 2;
    if (multiplier < MIN_MULTIPLIER) {
      multiplier = MIN_MULTIPLIER;
      break;
    }
  }
  return multiplier;
};

const getTimeUntilNextHalving = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  const currentPeriod = Math.floor(elapsed / HALVING_PERIOD);
  const nextHalvingTime = CHAT_REWARDS_START_TIME + ((currentPeriod + 1) * HALVING_PERIOD);
  const secondsRemaining = nextHalvingTime - now;
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const timeAgo = (timestamp: bigint) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function ChatPage() {
  const readyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [rateLimitBanRemaining, setRateLimitBanRemaining] = useState(0);
  const [eligibilityError, setEligibilityError] = useState<string[] | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(getCurrentMultiplier());
  const [timeUntilHalving, setTimeUntilHalving] = useState(getTimeUntilNextHalving());
  const [tippingMessageHash, setTippingMessageHash] = useState<string | null>(null);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<'left' | 'right'>('left');
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const COOLDOWN_SECONDS = 30;
  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: tipHash, writeContract: writeTip, isPending: isTipPending, reset: resetTip } = useWriteContract();
  const { isLoading: isTipConfirming, isSuccess: isTipSuccess } = useWaitForTransactionReceipt({ hash: tipHash });

  // Focus input when chat expands and scroll to bottom smoothly
  useEffect(() => {
    if (isChatExpanded) {
      // Smooth scroll to bottom synced with slide animation
      const container = messagesContainerRef.current;
      if (container) {
        const scrollToBottom = () => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        };
        // Start scroll immediately, it will animate alongside the input slide
        scrollToBottom();
      }
      // Focus input after animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isChatExpanded]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMultiplier(getCurrentMultiplier());
      setTimeUntilHalving(getTimeUntilNextHalving());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rateLimitBanRemaining <= 0) return;
    const timer = setInterval(() => {
      setRateLimitBanRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitBanRemaining]);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as any).context) as MiniAppContext;
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

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages?limit=20");
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return data.messages.map((m: any) => ({
        sender: m.sender,
        message: m.message,
        timestamp: BigInt(m.timestamp),
        transactionHash: m.transaction_hash,
        blockNumber: BigInt(m.block_number),
        isSystemMessage: m.is_system_message || false,
        systemType: m.system_type || null,
      })) as ChatMessage[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["chat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/chat/leaderboard?limit=50");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const userPoints = statsData?.leaderboard?.find(
    (entry: { address: string; total_points: number }) =>
      entry.address.toLowerCase() === address?.toLowerCase()
  )?.total_points || 0;

  const senderAddresses = [...new Set(messages?.map((m) => m.sender.toLowerCase()) || [])];

  const { data: profilesData } = useQuery<{ profiles: Record<string, FarcasterProfile | null> }>({
    queryKey: ["chat-profiles-batch", senderAddresses.join(",")],
    queryFn: async () => {
      if (senderAddresses.length === 0) return { profiles: {} };
      const res = await fetch(`/api/profiles?addresses=${encodeURIComponent(senderAddresses.join(","))}`);
      if (!res.ok) return { profiles: {} };
      return res.json();
    },
    enabled: senderAddresses.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const messageHashes = messages?.map(m => m.transactionHash) || [];
  const { data: tipCountsData, refetch: refetchTipCounts } = useQuery<{ tips: Record<string, number> }>({
    queryKey: ["chat-tips", messageHashes.join(",")],
    queryFn: async () => {
      if (messageHashes.length === 0) return { tips: {} };
      const res = await fetch(`/api/chat/tips?hashes=${encodeURIComponent(messageHashes.join(","))}`);
      if (!res.ok) return { tips: {} };
      return res.json();
    },
    enabled: messageHashes.length > 0,
    staleTime: 30000,
  });

  const tipCounts = tipCountsData?.tips || {};
  const profiles = profilesData?.profiles || {};

  useEffect(() => {
    if (isTipSuccess && tippingMessageHash) {
      const recordTip = async () => {
        try {
          const msg = messages?.find(m => m.transactionHash === tippingMessageHash);
          if (msg) {
            await fetch("/api/chat/tips", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageHash: tippingMessageHash,
                fromAddress: address,
                toAddress: msg.sender,
                amount: "1",
              }),
            });
            refetchTipCounts();
          }
        } catch (e) {
          console.error("Failed to record tip:", e);
        }
      };
      recordTip();
      setTippingMessageHash(null);
      resetTip();
    }
  }, [isTipSuccess, tippingMessageHash, resetTip, refetchTipCounts, messages, address]);

  const recordPoints = useCallback(async () => {
    if (!address) return;
    try {
      await fetch("/api/chat/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address, message: pendingMessage }),
      });
      queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
    } catch (e) {
      console.error("Failed to record points:", e);
    }
  }, [address, queryClient, pendingMessage]);

  useEffect(() => {
    if (isSuccess && hash) {
      recordPoints();
      setPendingMessage("");
      setMessage("");
      setIsChatExpanded(false);
      setCooldownRemaining(COOLDOWN_SECONDS);
      setTimeout(async () => {
        await fetch("/api/chat/messages?sync=true");
        refetchMessages();
      }, 3000);
    }
  }, [isSuccess, hash, recordPoints, refetchMessages]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || isPending || isConfirming || cooldownRemaining > 0 || rateLimitBanRemaining > 0 || isVerifying) return;
    setEligibilityError(null);
    setIsVerifying(true);
    try {
      const verifyRes = await fetch("/api/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address, message: message.trim(), fid: context?.user?.fid }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.eligible) {
        if (verifyData.rateLimitBan && verifyData.banSecondsRemaining) {
          setRateLimitBanRemaining(verifyData.banSecondsRemaining);
        }
        setEligibilityError(verifyData.reasons || ["Not eligible to send messages"]);
        setIsVerifying(false);
        return;
      }
      setPendingMessage(message.trim());
      setIsVerifying(false);
      writeContract({
        address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
        abi: GLAZERY_CHAT_ABI,
        functionName: "sendMessage",
        args: [message.trim()],
      });
    } catch (e) {
      console.error("Failed to send message:", e);
      setEligibilityError(["Something went wrong, try again"]);
      setPendingMessage("");
      setIsVerifying(false);
    }
  };

  const handleTip = async (recipientAddress: string, messageHash: string) => {
    if (!isConnected || isTipPending || isTipConfirming) return;
    if (recipientAddress.toLowerCase() === address?.toLowerCase()) return;
    
    // Light haptic feedback
    try {
      await sdk.haptics.impactOccurred("light");
    } catch {
      // Silent fail if haptics not supported
    }
    
    setTippingMessageHash(messageHash);
    writeTip({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipientAddress as `0x${string}`, parseUnits("1", 18)],
    });
  };

  const openUserProfile = async (username: string | null) => {
    if (!username) return;
    const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/${cleanUsername}`);
    } catch {
      window.open(`https://warpcast.com/${cleanUsername}`, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username ? `@${context.user.username}` : context?.user?.fid ? `fid ${context.user.fid}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const formatBanTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleChatInput = () => {
    if (isChatExpanded) {
      setIsChatExpanded(false);
    } else {
      setIsChatExpanded(true);
    }
  };

  // Drag handlers for button repositioning
  const handleDragStart = (clientX: number) => {
    if (isChatExpanded) return;
    setDragStartX(clientX);
  };

  const handleDragMove = (clientX: number) => {
    if (isChatExpanded || dragStartX === 0) return;
    
    const delta = Math.abs(clientX - dragStartX);
    // Only start dragging after moving 10px (prevents accidental drags)
    if (!isDragging && delta > 10) {
      setIsDragging(true);
    }
    
    if (!isDragging) return;
    
    const container = buttonContainerRef.current;
    if (!container) return;
    
    const containerWidth = container.offsetWidth - 44; // subtract button width
    const moveDelta = clientX - dragStartX;
    const currentPos = buttonPosition === 'left' ? 0 : containerWidth;
    let newX = currentPos + moveDelta;
    
    // Clamp to bounds
    newX = Math.max(0, Math.min(containerWidth, newX));
    setDragX(newX);
  };

  const handleDragEnd = () => {
    if (!isDragging && dragStartX !== 0) {
      // It was a tap, not a drag
      setDragStartX(0);
      return;
    }
    
    if (!isDragging) return;
    
    setIsDragging(false);
    setDragStartX(0);
    
    const container = buttonContainerRef.current;
    if (!container) return;
    
    const containerWidth = container.offsetWidth - 44;
    const threshold = containerWidth / 2;
    
    // Snap to nearest position
    if (dragX > threshold) {
      setButtonPosition('right');
    } else {
      setButtonPosition('left');
    }
    setDragX(0);
  };

  // Get button transform based on drag state
  const getButtonTransform = () => {
    if (isChatExpanded) return 'translateX(0)';
    if (isDragging) return `translateX(${dragX}px)`;
    
    const container = buttonContainerRef.current;
    if (!container) return 'translateX(0)';
    
    const containerWidth = container.offsetWidth - 44;
    return buttonPosition === 'right' ? `translateX(${containerWidth}px)` : 'translateX(0)';
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        .chat-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .chat-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 shadow-inner" 
        style={{ 
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", 
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" 
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h1 className="text-2xl font-bold tracking-wide">CHAT</h1>
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

          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-1 mb-0.5">
                <Sparkles className="w-3 h-3 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                <span className="text-[9px] text-gray-400 uppercase">Your Sprinkles</span>
              </div>
              <div className="text-lg font-bold text-white">{typeof userPoints === 'number' ? userPoints.toFixed(2) : '0.00'}</div>
              <div className="flex items-center gap-1 mt-1">
                <Timer className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] text-amber-400">{currentMultiplier.toFixed(1)}x • Halving in {timeUntilHalving}</span>
              </div>
            </div>
            <SprinklesClaimButton userFid={context?.user?.fid} compact />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            <button onClick={() => setShowHelpDialog(true)} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-xs font-semibold text-white">Earn Sprinkles</span>
                <HelpCircle className="w-3 h-3 text-gray-400" />
              </div>
            </button>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 opacity-50 cursor-not-allowed">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Cosmetics</span>
                <span className="text-[9px] text-gray-600">Soon</span>
              </div>
            </div>
          </div>

          {showHelpDialog && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10">
                    <X className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    How to Earn Sprinkles
                  </h2>
                  <div className="space-y-3">
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Send Onchain Messages</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Every message earns sprinkles. Stored permanently on Base.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Neynar Score Multiplier</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Your Farcaster reputation (0-1) determines earnings.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Halving Schedule</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Rewards halve every 30 days: 4x → 2x → 1x → 0.5x min.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Friday Airdrop</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Claim earned points as real SPRINKLES tokens every Friday!</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">!</div>
                      <div>
                        <div className="font-semibold text-red-400 text-xs">Rate Limit</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Max 5 messages per 5 minutes to prevent spam.</div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowHelpDialog(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors">Got it</button>
                </div>
              </div>
            </div>
          )}

          {/* Messages container - extends to bottom */}
          <div 
            ref={messagesContainerRef} 
            className="flex-1 overflow-y-auto space-y-2 min-h-0 chat-scroll pt-12 pb-16"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 100%)',
            }}
          >
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12"><div className="text-gray-400">Loading messages...</div></div>
            ) : (!messages || messages.length === 0) && !pendingMessage ? (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4"><MessageCircle className="w-8 h-8 text-gray-600" /></div>
                <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
                <p className="text-sm text-gray-400 text-center max-w-xs">Be the first to send an onchain message!</p>
              </div>
            ) : (
              <>
                {[...(messages || [])].reverse().map((msg, index) => {
                  const profile = profiles?.[msg.sender.toLowerCase()];
                  const displayName = profile?.displayName || formatAddress(msg.sender);
                  const username = profile?.username ? `@${profile.username}` : null;
                  const avatarUrl = profile?.pfpUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.sender.toLowerCase()}`;
                  const isOwnMessage = address?.toLowerCase() === msg.sender.toLowerCase();
                  const isTipping = tippingMessageHash === msg.transactionHash;
                  const tipCount = tipCounts[msg.transactionHash] || 0;

                  if (msg.isSystemMessage) {
                    const tokenName = msg.systemType === "mine_donut" ? "DONUT" : "SPRINKLES";
                    return (
                      <div key={`${msg.transactionHash}-${index}`} className="flex gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <button onClick={() => openUserProfile(username)} disabled={!username} className={`flex-shrink-0 ${username ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                          <Avatar className="h-8 w-8 border border-amber-500/50">
                            <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                            <AvatarFallback className="bg-amber-500/20 text-amber-400 text-xs">{initialsFrom(displayName)}</AvatarFallback>
                          </Avatar>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <button onClick={() => openUserProfile(username)} disabled={!username} className={`font-semibold text-amber-400 text-xs truncate ${username ? "hover:text-amber-300" : ""}`}>{displayName}</button>
                            {username && <button onClick={() => openUserProfile(username)} className="text-[10px] text-amber-400/60 truncate hover:text-amber-400">{username}</button>}
                            <span className="text-[10px] text-amber-400/40 ml-auto flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                          </div>
                          <p className="text-xs text-amber-400">started mining {tokenName}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={`${msg.transactionHash}-${index}`} className={`flex gap-2 p-2 rounded-lg ${isOwnMessage ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900 border border-zinc-800"}`}>
                      <button onClick={() => openUserProfile(username)} disabled={!username} className={`flex-shrink-0 ${username ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                        <Avatar className="h-8 w-8 border border-zinc-700">
                          <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                          <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(displayName)}</AvatarFallback>
                        </Avatar>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <button onClick={() => openUserProfile(username)} disabled={!username} className={`font-semibold text-white text-xs truncate ${username ? "hover:text-amber-400" : ""}`}>{displayName}</button>
                          {username && <button onClick={() => openUserProfile(username)} className="text-[10px] text-gray-500 truncate hover:text-amber-400">{username}</button>}
                          <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                        </div>
                        <p className="text-xs text-gray-300 break-words">{msg.message}</p>
                      </div>
                      {!isOwnMessage && isConnected && (
                        <button onClick={() => handleTip(msg.sender, msg.transactionHash)} disabled={isTipPending || isTipConfirming} className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[32px] p-1 rounded-lg transition-all ${isTipping ? "bg-amber-500/20" : tipCount > 0 ? "bg-amber-500/10" : "hover:bg-amber-500/10"}`} title="Tip 1 DONUT">
                          <Heart className={`w-4 h-4 transition-colors ${isTipping ? "text-amber-400 animate-pulse fill-amber-400" : tipCount > 0 ? "text-amber-400 fill-amber-400/50" : "text-gray-500 hover:text-amber-400"}`} />
                          {tipCount > 0 && <span className="text-[9px] font-bold text-amber-400 mt-0.5">{tipCount}</span>}
                        </button>
                      )}
                      {isOwnMessage && tipCount > 0 && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[32px] p-1">
                          <Heart className="w-4 h-4 text-amber-400 fill-amber-400/50" />
                          <span className="text-[9px] font-bold text-amber-400 mt-0.5">{tipCount}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {pendingMessage && (
                  <div className="flex gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 opacity-60">
                    <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(userDisplayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-white text-xs truncate">{userDisplayName}</span>
                        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">Sending...</span>
                      </div>
                      <p className="text-xs text-gray-300 break-words">{pendingMessage}</p>
                    </div>
                  </div>
                )}
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Floating chat input - positioned absolutely at bottom */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <div className="px-2 pointer-events-auto">
              {/* Safe tap zone wrapper - extra padding prevents accidental taps on messages */}
              <div className="pt-8 pb-2">
                {!isConnected ? (
                <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-sm text-gray-400">Connect wallet to send messages</p>
                </div>
              ) : (
                <>
                  {eligibilityError && (
                    <div className="mb-2 flex rounded-xl overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                      <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-xl p-3">
                        <div className="flex items-start gap-2">
                          <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-red-400 mb-1">Cannot Send Message</p>
                            <ul className="space-y-1">
                              {eligibilityError.map((reason, i) => <li key={i} className="text-[11px] text-red-300/80 leading-relaxed">{reason}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setEligibilityError(null)} className="flex items-center justify-center px-4 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-xl hover:bg-red-900/50 transition-colors">
                        <X className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                      </button>
                    </div>
                  )}
                  {rateLimitBanRemaining > 0 && (
                    <div className="mb-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-red-400">Rate limited! Too many messages.</span>
                      </div>
                      <div className="text-sm font-bold text-red-400">{formatBanTime(rateLimitBanRemaining)}</div>
                    </div>
                  )}
                  {(isTipPending || isTipConfirming) && (
                    <div className="mb-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span className="text-xs text-amber-400">{isTipPending ? "Confirm tip in wallet..." : "Sending 1 🍩DONUT..."}</span>
                    </div>
                  )}
                  {isTipSuccess && (
                    <div className="mb-2 bg-green-500/10 border border-green-500/30 rounded-xl p-2 flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4 text-green-400 fill-green-400" />
                      <span className="text-xs text-green-400">Tip sent! 🍩</span>
                    </div>
                  )}
                  
                  {/* Sliding input container */}
                  <div 
                    ref={buttonContainerRef}
                    className="relative w-full"
                    onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
                    onTouchEnd={handleDragEnd}
                    onMouseMove={(e) => isDragging && handleDragMove(e.clientX)}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                  >
                    {/* Button wrapper for positioning */}
                    <div 
                      className={`flex items-center gap-2 ${isDragging ? '' : 'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]'}`}
                      style={{ 
                        transform: getButtonTransform(),
                        width: 'fit-content'
                      }}
                    >
                      <button 
                        onClick={() => !isDragging && toggleChatInput()}
                        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
                        onMouseDown={(e) => handleDragStart(e.clientX)}
                        disabled={(cooldownRemaining > 0 || rateLimitBanRemaining > 0) && !isDragging}
                        className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-300 overflow-visible touch-none select-none ${
                          isChatExpanded 
                            ? "bg-zinc-700 text-white" 
                            : cooldownRemaining > 0
                              ? "bg-amber-500 text-black"
                              : rateLimitBanRemaining > 0
                                ? "bg-red-500 text-white"
                                : "bg-white text-black hover:bg-gray-200"
                        }`}
                      >
                      {cooldownRemaining > 0 ? (
                        <span className="text-xs font-bold text-black">{cooldownRemaining}</span>
                      ) : rateLimitBanRemaining > 0 ? (
                        <Timer className="w-5 h-5 text-white" />
                      ) : (
                        <Plus className={`w-5 h-5 transition-transform duration-300 ${isChatExpanded ? "rotate-45" : ""}`} />
                      )}
                      </button>
                    </div>
                  </div>
                    
                  {/* Expanded input - full width bar */}
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      isChatExpanded ? "max-h-20 opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
                    }`}
                  >
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={message}
                        onChange={(e) => { setMessage(e.target.value.slice(0, 280)); if (eligibilityError) setEligibilityError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                        placeholder="Type a message..."
                        disabled={isPending || isConfirming || isVerifying}
                        className="flex-1 bg-transparent text-white placeholder-gray-500 text-base px-2 py-1 outline-none disabled:opacity-50 min-w-0"
                        style={{ fontSize: '16px' }}
                      />
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{message.length}/280</span>
                      <button 
                        onClick={handleSendMessage} 
                        disabled={!message.trim() || isPending || isConfirming || isVerifying} 
                        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                      >
                        {isVerifying ? <span className="text-xs font-bold">...</span> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  {(isPending || isConfirming) && <p className="text-[10px] text-gray-400 text-center mt-1">{isPending ? "Confirm in wallet..." : "Confirming transaction..."}</p>}
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}