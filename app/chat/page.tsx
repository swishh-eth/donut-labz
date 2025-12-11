"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Send, MessageCircle, HelpCircle, X, Sparkles, Timer, Heart } from "lucide-react";
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
};

type FarcasterProfile = {
  fid: number | null;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  neynarScore: number | null;
  custodyAddress?: string | null;
  verifiedAddresses?: string[] | null;
};

// DONUT token contract
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

// Sprinkles chat reward constants - NOW STARTS AT 10x
const CHAT_REWARDS_START_TIME = 1765163000; // Approx when sprinkles miner deployed
const HALVING_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds
const INITIAL_MULTIPLIER = 10.0; // Changed from 1.0 to 10.0
const MIN_MULTIPLIER = 1.0; // Changed from 0.1 to 1.0

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
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatAddress = (addr: string) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

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
  const [eligibilityError, setEligibilityError] = useState<string[] | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(getCurrentMultiplier());
  const [timeUntilHalving, setTimeUntilHalving] = useState(getTimeUntilNextHalving());
  const [tippingMessageHash, setTippingMessageHash] = useState<string | null>(null);

  const COOLDOWN_SECONDS = 30;

  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Separate hook for tip transactions
  const { 
    data: tipHash, 
    writeContract: writeTip, 
    isPending: isTipPending,
    reset: resetTip 
  } = useWriteContract();
  const { isLoading: isTipConfirming, isSuccess: isTipSuccess } = useWaitForTransactionReceipt({ hash: tipHash });

  // Update halving countdown every minute
  useEffect(() => {
    const updateHalvingInfo = () => {
      setCurrentMultiplier(getCurrentMultiplier());
      setTimeUntilHalving(getTimeUntilNextHalving());
    };

    const interval = setInterval(updateHalvingInfo, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
      }
    };

    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('focus', handleFocus);
    });

    return () => {
      inputs.forEach(input => {
        input.removeEventListener('focus', handleFocus);
      });
    };
  }, []);

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

  // Fetch messages from Supabase
  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages");
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      
      return data.messages.map((m: any) => ({
        sender: m.sender,
        message: m.message,
        timestamp: BigInt(m.timestamp),
        transactionHash: m.transaction_hash,
        blockNumber: BigInt(m.block_number),
      })) as ChatMessage[];
    },
    refetchInterval: 30000,
    staleTime: 10000,
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

      const res = await fetch(
        `/api/profiles?addresses=${encodeURIComponent(senderAddresses.join(","))}`
      );
      if (!res.ok) return { profiles: {} };
      return res.json();
    },
    enabled: senderAddresses.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  // Fetch tip counts for messages
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

  // Reset tip state after success and record the tip
  useEffect(() => {
    if (isTipSuccess && tippingMessageHash) {
      // Record the tip in the database
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

  const profiles = profilesData?.profiles || {};

  const recordPoints = useCallback(async () => {
    if (!address) return;

    try {
      const res = await fetch("/api/chat/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address, message: pendingMessage }),
      });
      const data = await res.json();
      console.log("Points awarded:", data.pointsAwarded);

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
      setCooldownRemaining(COOLDOWN_SECONDS);

      // Sync blockchain to Supabase, then refresh
      setTimeout(async () => {
        await fetch("/api/chat/messages?sync=true");
        refetchMessages();
      }, 3000);
    }
  }, [isSuccess, hash, recordPoints, refetchMessages]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || isPending || isConfirming || cooldownRemaining > 0 || isVerifying) return;

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

  const handleTip = (recipientAddress: string, messageHash: string) => {
    if (!isConnected || isTipPending || isTipConfirming) return;
    if (recipientAddress.toLowerCase() === address?.toLowerCase()) return; // Can't tip yourself
    
    setTippingMessageHash(messageHash);
    
    // Send 1 DONUT (18 decimals)
    const amount = parseUnits("1", 18);
    
    writeTip({
      address: DONUT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipientAddress as `0x${string}`, amount],
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username ? `@${context.user.username}` : context?.user?.fid ? `fid ${context.user.fid}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
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
              <div className="text-lg font-bold text-white">
                {typeof userPoints === 'number' ? userPoints.toFixed(2) : '0.00'}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Timer className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] text-amber-400">
                  {currentMultiplier.toFixed(1)}x • Halving in {timeUntilHalving}
                </span>
              </div>
            </div>

            <SprinklesClaimButton userFid={context?.user?.fid} compact />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            <button
              onClick={() => setShowHelpDialog(true)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 hover:bg-zinc-800 transition-colors"
            >
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
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={() => setShowHelpDialog(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
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
                        <div className="text-[11px] text-gray-400 mt-0.5">Every message you send earns sprinkles. Messages are stored permanently on Base.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Neynar Score Multiplier</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Your Farcaster reputation score (0-1) determines how many sprinkles you earn per message.</div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Halving Schedule</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Rewards halve every 30 days: 10x → 5x → 2.5x → 1.25x → 1x min. Chat early to earn more!
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Friday Airdrop</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Every Friday, claim your earned points as real SPRINKLES tokens! Points reset after claiming.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">
                        <Heart className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="font-semibold text-amber-400 text-xs">Tip with DONUT</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Love a message? Tap the heart to send 1 🍩DONUT directly to that person!
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">6</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Mine SPRINKLES Tokens</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          You can also mine real SPRINKLES tokens! Pay DONUT in the miner to earn tokens with the same halving schedule.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Current Rewards</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-300">
                        <span className="text-amber-400 font-bold">{currentMultiplier.toFixed(1)}x</span> × 0.8 score = <span className="text-white font-bold">{(currentMultiplier * 0.8).toFixed(1)}</span> sprinkles
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400">Next Halving</span>
                    </div>
                    <div className="text-xs text-amber-400 font-bold">
                      {timeUntilHalving}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto space-y-2 pb-2 min-h-0 scrollbar-hide"
          >
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-400">Loading messages...</div>
              </div>
            ) : (!messages || messages.length === 0) && !pendingMessage ? (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-gray-600" />
                </div>
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

                  return (
                    <div
                      key={`${msg.transactionHash}-${index}`}
                      className={`flex gap-2 p-2 rounded-lg ${
                        isOwnMessage ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900 border border-zinc-800"
                      }`}
                    >
                      <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                        <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(displayName)}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-white text-xs truncate">{displayName}</span>
                          {username && <span className="text-[10px] text-gray-500 truncate">{username}</span>}
                          <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                        </div>
                        <p className="text-xs text-gray-300 break-words">{msg.message}</p>
                      </div>

                      {/* Tip button - only show for other people's messages */}
                      {!isOwnMessage && isConnected && (
                        <button
                          onClick={() => handleTip(msg.sender, msg.transactionHash)}
                          disabled={isTipPending || isTipConfirming}
                          className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[32px] p-1 rounded-lg transition-all ${
                            isTipping
                              ? "bg-amber-500/20"
                              : tipCount > 0
                                ? "bg-amber-500/10"
                                : "hover:bg-amber-500/10"
                          }`}
                          title="Tip 1 DONUT"
                        >
                          <Heart 
                            className={`w-4 h-4 transition-colors ${
                              isTipping 
                                ? "text-amber-400 animate-pulse fill-amber-400" 
                                : tipCount > 0
                                  ? "text-amber-400 fill-amber-400/50"
                                  : "text-gray-500 hover:text-amber-400"
                            }`} 
                          />
                          {tipCount > 0 && (
                            <span className="text-[9px] font-bold text-amber-400 mt-0.5">
                              {tipCount}
                            </span>
                          )}
                        </button>
                      )}

                      {/* Show tip count for own messages only if they have tips */}
                      {isOwnMessage && tipCount > 0 && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[32px] p-1">
                          <Heart className="w-4 h-4 text-amber-400 fill-amber-400/50" />
                          <span className="text-[9px] font-bold text-amber-400 mt-0.5">
                            {tipCount}
                          </span>
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

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="flex-shrink-0 pt-2 pb-2">
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
                            {eligibilityError.map((reason, i) => (
                              <li key={i} className="text-[11px] text-red-300/80 leading-relaxed">{reason}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setEligibilityError(null)}
                      className="flex items-center justify-center px-4 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-xl hover:bg-red-900/50 transition-colors"
                    >
                      <X className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                    </button>
                  </div>
                )}

                {/* Tip confirmation toast */}
                {(isTipPending || isTipConfirming) && (
                  <div className="mb-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 flex items-center justify-center gap-2">
                    <Heart className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs text-amber-400">
                      {isTipPending ? "Confirm tip in wallet..." : "Sending 1 🍩DONUT..."}
                    </span>
                  </div>
                )}

                {isTipSuccess && (
                  <div className="mb-2 bg-green-500/10 border border-green-500/30 rounded-xl p-2 flex items-center justify-center gap-2">
                    <Heart className="w-4 h-4 text-green-400 fill-green-400" />
                    <span className="text-xs text-green-400">Tip sent! 🍩</span>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value.slice(0, 280));
                      if (eligibilityError) setEligibilityError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    placeholder={cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s...` : "Type a message..."}
                    disabled={isPending || isConfirming || cooldownRemaining > 0 || isVerifying}
                    className="flex-1 bg-transparent text-white placeholder-gray-500 text-base px-2 py-1.5 outline-none disabled:opacity-50"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="text-[10px] text-gray-500 mr-1">{message.length}/280</span>
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isPending || isConfirming || cooldownRemaining > 0 || isVerifying}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                  >
                    {cooldownRemaining > 0 ? (
                      <span className="text-xs font-bold">{cooldownRemaining}</span>
                    ) : isVerifying ? (
                      <span className="text-xs font-bold">...</span>
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {(isPending || isConfirming) && (
                  <p className="text-[10px] text-gray-400 text-center mt-1">
                    {isPending ? "Confirm in wallet..." : "Confirming transaction..."}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}