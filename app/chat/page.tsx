"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Send, MessageCircle, HelpCircle, X, Wallet, Users, Star } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { GLAZERY_CHAT_ADDRESS, GLAZERY_CHAT_ABI } from "@/lib/contracts/glazery-chat";
import { parseAbiItem } from "viem";

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

export default function ChatPage() {
  const readyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();

  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");

  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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
    if (!publicClient) return [];

    try {
      const DEPLOYMENT_BLOCK = 39080208n;
      const BLOCKS_PER_DAY = 43200n; // ~2 sec per block on Base
      
      const currentBlock = await publicClient.getBlockNumber();
      const blocksSinceDeployment = currentBlock - DEPLOYMENT_BLOCK;
      const daysSinceDeployment = blocksSinceDeployment / BLOCKS_PER_DAY;
      
      // Start from deployment, then move forward 1 day at a time (keeping last 24h of messages)
      let fromBlock = DEPLOYMENT_BLOCK;
      if (daysSinceDeployment > 1n) {
        fromBlock = currentBlock - BLOCKS_PER_DAY; // Last 24 hours
      }
      
      const logs = await publicClient.getLogs({
        address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
        event: parseAbiItem("event MessageSent(address indexed sender, string message, uint256 timestamp)"),
        fromBlock,
        toBlock: "latest",
      });

      const parsedMessages: ChatMessage[] = logs.map((log) => ({
        sender: log.args.sender as string,
        message: log.args.message as string,
        timestamp: log.args.timestamp as bigint,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      }));

      // Sort by timestamp descending, take last 10 only
      return parsedMessages
        .sort((a, b) => Number(b.timestamp - a.timestamp))
        .slice(0, 10);
    } catch (e) {
      console.error("Failed to fetch messages:", e);
      return [];
    }
  },
  refetchInterval: 10000,
  enabled: !!publicClient,
  staleTime: 5000,
  gcTime: 30000,
});

  // Fetch chat stats from database
  const { data: statsData } = useQuery({
    queryKey: ["chat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/chat/leaderboard?limit=5");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch profiles for message senders
  const senderAddresses = [...new Set(messages?.map((m) => m.sender.toLowerCase()) || [])];

  const { data: profiles } = useQuery<Record<string, FarcasterProfile | null>>({
    queryKey: ["chat-profiles", senderAddresses],
    queryFn: async () => {
      if (senderAddresses.length === 0) return {};

      const profilePromises = senderAddresses.map(async (addr: string) => {
        try {
          const res = await fetch(`/api/neynar/user?address=${encodeURIComponent(addr)}`);
          if (!res.ok) return [addr, null];
          const data = await res.json();
          return [addr, data.user];
        } catch {
          return [addr, null];
        }
      });

      const results = await Promise.all(profilePromises);
      return Object.fromEntries(results);
    },
    enabled: senderAddresses.length > 0,
    staleTime: 300_000,
  });

  // Record points after successful transaction
  const recordPoints = useCallback(async () => {
    if (!address) return;

    try {
      const res = await fetch("/api/chat/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address }),
      });
      const data = await res.json();
      console.log("Points awarded:", data.pointsAwarded);

      queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
    } catch (e) {
      console.error("Failed to record points:", e);
    }
  }, [address, queryClient]);

  // Handle successful transaction
  useEffect(() => {
    if (isSuccess && hash) {
      recordPoints();
      setPendingMessage("");
      setMessage("");
      // Refetch messages after a short delay to allow indexing
      setTimeout(() => {
        refetchMessages();
      }, 2000);
    }
  }, [isSuccess, hash, recordPoints, refetchMessages]);

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !isConnected || isPending || isConfirming) return;

    setPendingMessage(message.trim());
    try {
      writeContract({
        address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
        abi: GLAZERY_CHAT_ABI,
        functionName: "sendMessage",
        args: [message.trim()],
      });
    } catch (e) {
      console.error("Failed to send message:", e);
      setPendingMessage("");
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const totalUsers = statsData?.stats?.total_users || 0;
  const totalMessages = statsData?.stats?.total_messages || 0;

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username ? `@${context.user.username}` : context?.user?.fid ? `fid ${context.user.fid}` : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
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
            <h1 className="text-2xl font-bold tracking-wide">ONCHAIN CHAT</h1>
            {context?.user ? (
              <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
                <Avatar className="h-8 w-8 border border-zinc-800">
                  <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                  <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(userDisplayName)}</AvatarFallback>
                </Avatar>
                <div className="leading-tight text-left">
                  <div className="text-sm font-bold">{userDisplayName}</div>
                  {userHandle ? <div className="text-xs text-gray-400">{userHandle}</div> : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <MessageCircle className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-gray-400 uppercase">Messages</span>
              </div>
              <div className="text-xl font-bold text-white">{totalMessages}</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Users className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-gray-400 uppercase">Chatters</span>
              </div>
              <div className="text-xl font-bold text-white">{totalUsers}</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Wallet className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] text-gray-400 uppercase">Network</span>
              </div>
              <div className="text-xl font-bold text-purple-400">Base</div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-700 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
                <span className="text-sm font-semibold text-white">Earn Points</span>
                <button
                  onClick={() => setShowHelpDialog(true)}
                  className="ml-1 text-gray-400 hover:text-white transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs font-medium text-gray-400">
                Neynar Score × Messages
              </div>
            </div>
          </div>

          {/* Help Dialog */}
          {showHelpDialog && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-in fade-in-0"
                onClick={() => setShowHelpDialog(false)}
              />
              <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 animate-in fade-in-0 zoom-in-95">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-black p-6 shadow-2xl">
                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-white mb-2">Onchain Chat Points</h2>
                  </div>

                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">1.</span>
                      <p>
                        <span className="text-white font-semibold">Send Messages</span> - Every message you send onchain earns you points based on your Neynar score.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">2.</span>
                      <p>
                        <span className="text-white font-semibold">Neynar Score</span> - Your Farcaster reputation score (0-1) determines how many points each message earns.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">3.</span>
                      <p>
                        <span className="text-white font-semibold">Example</span> - A user with 0.7 Neynar score earns 0.7 points per message sent.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">4.</span>
                      <p>
                        <span className="text-white font-semibold">Future Rewards</span> - Points may be used for future airdrops and rewards!
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800">
                      <p className="text-xs text-gray-400 italic">
                        Messages are permanently stored on Base. Gas fees apply.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowHelpDialog(false)}
                    className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Got it!
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto space-y-2 pb-2 scrollbar-hide">
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
                      className={`flex gap-3 p-3 rounded-lg ${
                        isOwnMessage ? "bg-blue-900/20 border border-blue-800/30" : "bg-zinc-900 border border-zinc-800"
                      }`}
                    >
                      <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
                        <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-white text-xs">
                          {initialsFrom(displayName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-white text-sm truncate">{displayName}</span>
                          {username && <span className="text-xs text-gray-500 truncate">{username}</span>}
                          <span className="text-xs text-gray-600 ml-auto flex-shrink-0">{timeAgo(msg.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-300 break-words">{msg.message}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Pending message */}
                {pendingMessage && (
                  <div className="flex gap-3 p-3 rounded-lg bg-blue-900/10 border border-blue-800/20 opacity-60">
                    <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">
                        {initialsFrom(userDisplayName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white text-sm truncate">{userDisplayName}</span>
                        <span className="text-xs text-blue-400 ml-auto flex-shrink-0">Sending...</span>
                      </div>
                      <p className="text-sm text-gray-300 break-words">{pendingMessage}</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message Input */}
          <div className="mt-auto pt-2">
            {!isConnected ? (
              <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm text-gray-400">Connect wallet to send messages</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    placeholder="Type a message..."
                    disabled={isPending || isConfirming}
                    className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm px-3 py-2 outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-gray-500 mr-2">{message.length}/280</span>
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isPending || isConfirming}
                    className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                {(isPending || isConfirming) && (
                  <p className="text-xs text-blue-400 text-center mt-2">
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