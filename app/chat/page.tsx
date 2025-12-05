"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Send, MessageCircle, HelpCircle, X, Wallet } from "lucide-react";

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

export default function ChatPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [message, setMessage] = useState("");

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
                  {userHandle ? (
                    <div className="text-xs text-gray-400">{userHandle}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 uppercase">Messages</span>
              </div>
              <div className="text-2xl font-bold text-white">0</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400 uppercase">Network</span>
              </div>
              <div className="text-2xl font-bold text-purple-400">Base</div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-700 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-sm font-semibold text-white">
                  Onchain Messaging
                </span>
                <button
                  onClick={() => setShowHelpDialog(true)}
                  className="ml-1 text-gray-400 hover:text-white transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs font-medium text-blue-400">
                Coming Soon
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
                    <h2 className="text-xl font-bold text-white mb-2">
                      Onchain Chat on Base
                    </h2>
                  </div>

                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">1.</span>
                      <p>
                        <span className="text-white font-semibold">Send Messages</span> - Broadcast messages directly onchain on Base network for all Glazery users to see.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">2.</span>
                      <p>
                        <span className="text-white font-semibold">Permanent & Transparent</span> - Every message is stored onchain, creating a permanent, censorship-resistant chat history.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <span className="text-white font-bold flex-shrink-0">3.</span>
                      <p>
                        <span className="text-white font-semibold">Low Cost</span> - Base&apos;s low gas fees make onchain messaging affordable for everyone.
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800">
                      <p className="text-xs text-gray-400 italic">
                        Messages are publicly visible and permanently stored on the Base blockchain.
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
            {/* Empty State */}
            <div className="flex flex-col items-center justify-center h-full py-12 px-4">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
              <p className="text-sm text-gray-400 text-center max-w-xs">
                Onchain messaging is coming soon. Be the first to send a message in the Donut Lab!
              </p>
            </div>
          </div>

          {/* Message Input */}
          <div className="mt-auto pt-2">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                disabled
                className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm px-3 py-2 outline-none disabled:opacity-50"
              />
              <button
                disabled
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Messaging will be enabled soon
            </p>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}