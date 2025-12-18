"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { Clock, Ticket, Users, HelpCircle, X, History, Trophy } from "lucide-react";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";

export default function LotteryPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const { address, isConnected } = useAccount();
  
  // UI state
  const [ticketAmount, setTicketAmount] = useState("10");
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState("Coming Soon");
  
  // Coming soon state
  const isComingSoon = true;
  
  // Mock data - replace with contract reads
  const [userTickets, setUserTickets] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  
  // User balance mock
  const userBalance = 88;
  
  const TICKET_PRESETS = [1, 5, 10, 25, 50, 100];

  // Calculate win chance
  const selectedAmount = parseInt(ticketAmount || "0");
  const potentialTickets = userTickets + selectedAmount;
  const potentialTotal = totalTickets + selectedAmount;
  const winChance = potentialTotal > 0 ? ((potentialTickets / potentialTotal) * 100).toFixed(2) : "0.00";

  // Load context
  useEffect(() => {
    const loadContext = async () => {
      try {
        const ctx = await sdk.context;
        setContext(ctx as { user?: { fid: number; username?: string; pfpUrl?: string } });
      } catch {}
    };
    loadContext();
  }, []);

  // SDK ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const handleBuyTickets = () => {
    if (isComingSoon) return;
    // TODO: Implement purchase logic
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
          50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.5); }
        }
        .float-animation { animation: float 3s ease-in-out infinite; }
        .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-3 shadow-inner overflow-hidden"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">THE DAILY DONUT LOTTERY</h1>
            {isComingSoon ? (
              <span className="text-[9px] bg-zinc-700 text-gray-400 px-2 py-0.5 rounded-full font-bold">SOON</span>
            ) : (
              <span className="text-[9px] bg-[#22c55e] text-black px-2 py-0.5 rounded-full font-bold">LIVE</span>
            )}
          </div>
          {context?.user?.pfpUrl ? (
            <img src={context.user.pfpUrl} alt="" className="h-8 w-8 rounded-full border border-zinc-700 object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          
          {/* Main Prize Display Card */}
          <div className="relative rounded-2xl border-2 border-amber-400 overflow-hidden pulse-glow" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
            {/* Decorative donuts */}
            <div className="absolute top-2 left-3 text-2xl opacity-20 float-animation" style={{ animationDelay: '0s' }}>🍩</div>
            <div className="absolute top-4 right-4 text-xl opacity-20 float-animation" style={{ animationDelay: '0.5s' }}>🍩</div>
            <div className="absolute bottom-3 left-6 text-lg opacity-20 float-animation" style={{ animationDelay: '1s' }}>🍩</div>
            <div className="absolute bottom-2 right-8 text-2xl opacity-20 float-animation" style={{ animationDelay: '1.5s' }}>🍩</div>
            
            <div className="relative z-10 p-5">
              {/* Prize Pool */}
              <div className="text-center mb-4">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Prize Pool</div>
                {isComingSoon ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-5xl">🍩</span>
                    <span className="text-4xl font-black text-gray-500">Coming Soon</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-5xl">🍩</span>
                    <span className="text-5xl font-black text-amber-400">{prizePool.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              {/* Stats Row */}
              <div className="flex items-center justify-center gap-6 text-sm text-gray-400 mb-4">
                <div className="flex items-center gap-1.5">
                  <Ticket className="w-4 h-4" />
                  <span>{totalTickets.toLocaleString()} tickets</span>
                </div>
                <div className="w-px h-4 bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>{Math.floor(totalTickets / 8) || 0} players</span>
                </div>
              </div>
              
              {/* Countdown */}
              <div className="bg-black/40 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-gray-400">{isComingSoon ? "Launching" : "Next draw in"}</span>
                </div>
                <div className="text-2xl font-bold text-white mt-1 font-mono">{timeRemaining}</div>
              </div>
            </div>
          </div>

          {/* Your Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase mb-1">Balance</div>
              <div className="flex items-center justify-center gap-1">
                <span className="text-lg">🍩</span>
                <span className="text-lg font-bold text-white">{userBalance}</span>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase mb-1">Your Tickets</div>
              <div className="flex items-center justify-center gap-1">
                <Ticket className="w-4 h-4 text-amber-400" />
                <span className="text-lg font-bold text-white">{userTickets}</span>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <div className="text-[9px] text-gray-500 uppercase mb-1">Win Chance</div>
              <div className="text-lg font-bold text-green-400">{userTickets > 0 ? ((userTickets / (totalTickets || 1)) * 100).toFixed(2) : "0.00"}%</div>
            </div>
          </div>

          {/* Buy Tickets Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-center mb-4">
              <div className="text-sm font-bold text-white mb-1">Buy Tickets</div>
              <div className="text-xs text-gray-500">1 DONUT = 1 Ticket</div>
            </div>
            
            {/* Quick Select Buttons */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              {TICKET_PRESETS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setTicketAmount(amount.toString())}
                  className={cn(
                    "py-2.5 rounded-lg font-bold text-sm transition-all",
                    ticketAmount === amount.toString()
                      ? "bg-amber-500 text-black"
                      : "bg-zinc-800 text-white hover:bg-zinc-700"
                  )}
                >
                  {amount}
                </button>
              ))}
            </div>
            
            {/* Custom Amount Input */}
            <div className="relative mb-3">
              <input
                type="number"
                value={ticketAmount}
                onChange={(e) => setTicketAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-bold text-center focus:outline-none focus:border-amber-500 pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-xl">🍩</span>
                <button
                  onClick={() => setTicketAmount(Math.floor(userBalance).toString())}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-zinc-700 px-2 py-1 rounded"
                >
                  MAX
                </button>
              </div>
            </div>
            
            {/* Cost Preview */}
            {selectedAmount > 0 && (
              <div className="bg-zinc-800/50 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Cost: <span className="text-white font-bold">{selectedAmount} DONUT</span>
                </div>
                <div className="text-sm text-gray-400">
                  Win chance: <span className="text-green-400 font-bold">{winChance}%</span>
                </div>
              </div>
            )}
            
            {/* Buy Button */}
            <button
              onClick={handleBuyTickets}
              disabled={isComingSoon}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-lg transition-all",
                isComingSoon
                  ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  : "bg-white text-black hover:bg-gray-100 active:scale-[0.98]"
              )}
            >
              {isComingSoon ? (
                <span className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5" /> Coming Soon
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Ticket className="w-5 h-5" /> Buy {selectedAmount} Tickets
                </span>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center justify-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">How It Works</span>
              </div>
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center justify-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Past Winners</span>
              </div>
            </button>
          </div>

          {/* Info Cards */}
          <div className="space-y-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm mb-1">Winner Takes All</div>
                  <div className="text-xs text-gray-400">One lucky winner is drawn daily and receives the entire prize pool. No house edge!</div>
                </div>
              </div>
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Ticket className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm mb-1">Fair Odds</div>
                  <div className="text-xs text-gray-400">Your chance of winning = your tickets ÷ total tickets. More tickets = better odds!</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🍩</span> How the Lottery Works
                </h2>
                
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-white text-sm">Buy Tickets</div>
                      <div className="text-xs text-gray-400">1 DONUT = 1 lottery ticket. Buy as many as you want!</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-sm">Wait for Draw</div>
                      <div className="text-xs text-gray-400">Every day at midnight UTC, a winner is randomly selected.</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-green-400 text-sm">Winner Takes All!</div>
                      <div className="text-xs text-gray-400">The winner receives 100% of the prize pool. No fees, no house edge.</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="text-xs text-amber-400 font-bold mb-1">💡 Pro Tip</div>
                  <div className="text-xs text-gray-400">The more tickets you buy, the higher your chances of winning. But remember - anyone can win with just 1 ticket!</div>
                </div>
                
                <button onClick={() => setShowHelp(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black">Got it!</button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" /> Past Winners
                </h2>
                
                {/* No winners yet state */}
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🍩</div>
                  <div className="text-white font-bold mb-1">No Winners Yet</div>
                  <div className="text-xs text-gray-400">Be the first to win the daily lottery!</div>
                </div>
                
                <button onClick={() => setShowHistory(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}