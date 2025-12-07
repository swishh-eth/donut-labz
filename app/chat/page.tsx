"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Send, MessageCircle, HelpCircle, X, Sparkles } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, http, parseAbiItem } from "viem";
import { GLAZERY_CHAT_ADDRESS, GLAZERY_CHAT_ABI } from "@/lib/contracts/glazery-chat";
import { ShareRewardButton } from "@/components/share-reward-button";

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

// Create a dedicated public client for Base
const basePublicClient = createPublicClient({
  chain: base,
  transport: http("https://base.publicnode.com"),
});

export default function ChatPage() {
  const readyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const wagmiPublicClient = usePublicClient({ chainId: base.id });

  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [eligibilityError, setEligibilityError] = useState<string[] | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const COOLDOWN_SECONDS = 30;

  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Prevent iOS zoom on input focus
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

  // Farcaster SDK context
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

  // Fetch messages from blockchain events
  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages-onchain"],
    queryFn: async () => {
      const client = wagmiPublicClient || basePublicClient;

      try {
        const DEPLOYMENT_BLOCK = 39080208n;
        const BLOCKS_PER_HOUR = 1800n;

        const currentBlock = await client.getBlockNumber();
        console.log("Current block:", currentBlock.toString());

        let fromBlock = currentBlock - BLOCKS_PER_HOUR;

        if (fromBlock < DEPLOYMENT_BLOCK) {
          fromBlock = DEPLOYMENT_BLOCK;
        }

        console.log("Fetching from:", fromBlock.toString(), "to:", currentBlock.toString());

        const logs = await client.getLogs({
          address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
          event: parseAbiItem("event MessageSent(address indexed sender, string message, uint256 timestamp)"),
          fromBlock,
          toBlock: currentBlock,
        });

        console.log("Logs found:", logs.length);

        const parsedMessages: ChatMessage[] = logs.map((log) => ({
          sender: log.args.sender as string,
          message: log.args.message as string,
          timestamp: log.args.timestamp as bigint,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }));

        return parsedMessages
          .sort((a, b) => Number(b.timestamp - a.timestamp))
          .slice(0, 20);
      } catch (e) {
        console.error("Failed to fetch messages:", e);
        return [];
      }
    },
    refetchInterval: 15000,
    staleTime: 10000,
    gcTime: 30000,
  });

  // Fetch chat stats from database
  const { data: statsData } = useQuery({
    queryKey: ["chat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/chat/leaderboard?limit=50");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Get current user's points
  const userPoints = statsData?.leaderboard?.find(
    (entry: { address: string; total_points: number }) =>
      entry.address.toLowerCase() === address?.toLowerCase()
  )?.total_points || 0;

  // Fetch profiles for message senders
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

  const profiles = profilesData?.profiles || {};

  // Record points after successful transaction
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

  // Handle successful transaction
  useEffect(() => {
    if (isSuccess && hash) {
      recordPoints();
      setPendingMessage("");
      setMessage("");

      // Start cooldown timer
      setCooldownRemaining(COOLDOWN_SECONDS);

      setTimeout(() => {
        refetchMessages();
      }, 2000);
    }
  }, [isSuccess, hash, recordPoints, refetchMessages]);

  // Cooldown countdown timer
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

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || isPending || isConfirming || cooldownRemaining > 0 || isVerifying) return;

    setEligibilityError(null);
    setIsVerifying(true);

    try {
      // Verify eligibility BEFORE transaction
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

      // Eligible - proceed with transaction
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

  // Scroll to bottom on new messages
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
          {/* Header */}
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

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Sparkles className="w-3 h-3 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                <span className="text-[9px] text-gray-400 uppercase">Your Sprinkles</span>
              </div>
              <div className="text-lg font-bold text-white">
                {typeof userPoints === 'number' ? userPoints.toFixed(2) : '0.00'}
              </div>
            </div>

            {/* Share Reward Button */}
            <ShareRewardButton userFid={context?.user?.fid} compact />
          </div>

          {/* Info Banner - Tap to open help */}
          <button
            onClick={() => setShowHelpDialog(true)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 mb-3 flex-shrink-0 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span className="text-xs font-semibold text-white">Earn Sprinkles</span>
                <HelpCircle className="w-3 h-3 text-gray-400" />
              </div>
              <div className="text-[10px] font-medium text-gray-400">
                Neynar Score × Messages
              </div>
            </div>
          </button>

          {/* Help Dialog */}
          {showHelpDialog && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={() => setShowHelpDialog(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                    How to Earn Sprinkles
                  </h2>

                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        1
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Send Messages</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Every onchain message earns sprinkles based on your Neynar score.
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        2
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Neynar Score</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Your Farcaster reputation (0-1) determines sprinkles per message.
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        3
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Example</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          0.7 Neynar score = 0.7 sprinkles per message.
                        </div>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                        4
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">Future Rewards</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Sprinkles may be used for airdrops and rewards!
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500 text-center mt-4">
                    Messages are permanently stored on Base. Gas fees apply.
                  </p>

                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto space-y-2 pb-2 min-h-0"
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
                <p className="text-sm text-gray-400 text-center max-w-xs">
                  Be the first to send an onchain message!
                </p>
              </div>
            ) : (
              <>
                {[...(messages || [])].reverse().map((msg, index) => {
                  const profile = profiles?.[msg.sender.toLowerCase()];
                  const displayName = profile?.displayName || formatAddress(msg.sender);
                  const username = profile?.username ? `@${profile.username}` : null;
                  const avatarUrl = profile?.pfpUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.sender.toLowerCase()}`;
                  const isOwnMessage = address?.toLowerCase() === msg.sender.toLowerCase();

                  return (
                    <div
                      key={`${msg.transactionHash}-${index}`}
                      className={`flex gap-2 p-2 rounded-lg ${
                        isOwnMessage ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900 border border-zinc-800"
                      }`}
                    >
                      <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                        <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-white text-xs">
                          {initialsFrom(displayName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-white text-xs truncate">{displayName}</span>
                          {username && <span className="text-[10px] text-gray-500 truncate">{username}</span>}
                          <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                        </div>
                        <p className="text-xs text-gray-300 break-words">{msg.message}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Pending message */}
                {pendingMessage && (
                  <div className="flex gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 opacity-60">
                    <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">
                        {initialsFrom(userDisplayName)}
                      </AvatarFallback>
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

          {/* Message Input - Fixed at bottom */}
          <div className="flex-shrink-0 pt-2 pb-2">
            {!isConnected ? (
              <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-sm text-gray-400">Connect wallet to send messages</p>
              </div>
            ) : (
              <>
{/* Eligibility Error Box */}
{eligibilityError && (
  <div className="mb-2 bg-red-950/50 border border-red-500/50 rounded-xl p-3 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
    <div className="flex items-start gap-2">
      <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-red-400 mb-1">Cannot Send Message</p>
        <ul className="space-y-1">
          {eligibilityError.map((reason, i) => (
            <li key={i} className="text-[11px] text-red-300/80 break-words">{reason}</li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setEligibilityError(null)}
        className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
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