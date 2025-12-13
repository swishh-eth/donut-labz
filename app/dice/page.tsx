"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { Dices, TrendingUp, TrendingDown, Trophy, History, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BetHistory = {
  id: string;
  prediction: "over" | "under";
  target: number;
  result: number;
  won: boolean;
  amount: number;
  payout: number;
  timestamp: number;
};

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function DicePage() {
  const readyRef = useRef(false);
  const [betAmount, setBetAmount] = useState<string>("10");
  const [target, setTarget] = useState<number>(50);
  const [prediction, setPrediction] = useState<"over" | "under">("over");
  const [isRolling, setIsRolling] = useState(false);
  const [rollResult, setRollResult] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<boolean | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [history, setHistory] = useState<BetHistory[]>([]);
  const [animatingDice, setAnimatingDice] = useState<string>("⚀");
  const [streak, setStreak] = useState(0);
  const [balance, setBalance] = useState(1000); // Fake balance for testing

  const { address, isConnected } = useAccount();

  // Calculate multiplier based on win chance
  const winChance = prediction === "over" ? 100 - target : target;
  const multiplier = winChance > 0 ? (98 / winChance).toFixed(2) : "0.00"; // 2% house edge
  const potentialWin = (parseFloat(betAmount || "0") * parseFloat(multiplier)).toFixed(2);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  // Dice animation effect
  useEffect(() => {
    if (!isRolling) return;
    const interval = setInterval(() => {
      setAnimatingDice(DICE_FACES[Math.floor(Math.random() * 6)]);
    }, 80);
    return () => clearInterval(interval);
  }, [isRolling]);

  const handleRoll = async () => {
    if (isRolling) return;
    const amount = parseFloat(betAmount || "0");
    if (amount <= 0 || amount > balance) return;

    setIsRolling(true);
    setRollResult(null);
    setLastWin(null);

    // Simulate roll delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate random result (1-100)
    const result = Math.floor(Math.random() * 100) + 1;
    setRollResult(result);

    // Determine win/loss
    const won = prediction === "over" ? result > target : result < target;
    setLastWin(won);

    // Update streak
    if (won) {
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }

    // Update fake balance
    if (won) {
      setBalance(prev => prev + amount * parseFloat(multiplier) - amount);
    } else {
      setBalance(prev => prev - amount);
    }

    // Add to history
    const newBet: BetHistory = {
      id: Date.now().toString(),
      prediction,
      target,
      result,
      won,
      amount,
      payout: won ? amount * parseFloat(multiplier) : 0,
      timestamp: Date.now(),
    };
    setHistory(prev => [newBet, ...prev.slice(0, 19)]);

    // Haptic feedback
    try {
      await sdk.haptics.impactOccurred(won ? "medium" : "heavy");
    } catch {}

    setIsRolling(false);
  };

  const quickBets = [10, 25, 50, 100];

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-5px) rotate(-5deg); }
          50% { transform: translateX(5px) rotate(5deg); }
          75% { transform: translateX(-5px) rotate(-5deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
          50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.6); }
        }
        @keyframes number-reveal {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .dice-shake { animation: shake 0.1s infinite; }
        .glow-pulse { animation: glow-pulse 1s ease-in-out infinite; }
        .number-reveal { animation: number-reveal 0.3s ease-out forwards; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-wide">DICE</h1>
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
              BETA
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowHistory(true)}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800"
            >
              <History className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800"
            >
              <HelpCircle className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-2 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Balance</div>
            <div className="text-sm font-bold text-white">🍩{balance.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Streak</div>
            <div className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" />{streak}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Multiplier</div>
            <div className="text-sm font-bold text-green-400">{multiplier}x</div>
          </div>
        </div>

        {/* Dice Result - Compact */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <div
            className={cn(
              "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
              isRolling && "dice-shake",
              lastWin === true && "bg-green-500/20 border-2 border-green-500",
              lastWin === false && "bg-red-500/20 border-2 border-red-500",
              lastWin === null && "bg-zinc-900 border-2 border-zinc-700"
            )}
          >
            {isRolling ? (
              <span className="text-5xl">{animatingDice}</span>
            ) : rollResult !== null ? (
              <div className="number-reveal flex flex-col items-center">
                <span className={cn("text-3xl font-black", lastWin ? "text-green-400" : "text-red-400")}>
                  {rollResult}
                </span>
                <span className={cn("text-[10px] font-bold", lastWin ? "text-green-400" : "text-red-400")}>
                  {lastWin ? "WIN!" : "LOSE"}
                </span>
              </div>
            ) : (
              <Dices className="w-10 h-10 text-zinc-600" />
            )}
            {lastWin === true && (
              <div className="absolute inset-0 rounded-full glow-pulse pointer-events-none" />
            )}
          </div>

          {/* Target & Stats */}
          <div className="text-center mt-2">
            <div className="text-xs text-gray-400">
              Roll {prediction === "over" ? "OVER" : "UNDER"} <span className="text-white font-bold text-lg">{target}</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {winChance}% chance • Win 🍩{potentialWin}
            </div>
          </div>
        </div>

        {/* Controls - Compact */}
        <div className="flex-shrink-0 space-y-2 pb-1">
          {/* Target Slider */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">Target</span>
              <span className="text-xs font-bold text-white">{target}</span>
            </div>
            <input
              type="range"
              min="5"
              max="95"
              value={target}
              onChange={(e) => setTarget(parseInt(e.target.value))}
              disabled={isRolling}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
            />
          </div>

          {/* Over/Under Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPrediction("under")}
              disabled={isRolling}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm transition-all",
                prediction === "under"
                  ? "bg-red-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-gray-400"
              )}
            >
              <TrendingDown className="w-4 h-4" />
              UNDER {target}
            </button>
            <button
              onClick={() => setPrediction("over")}
              disabled={isRolling}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm transition-all",
                prediction === "over"
                  ? "bg-green-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-gray-400"
              )}
            >
              <TrendingUp className="w-4 h-4" />
              OVER {target}
            </button>
          </div>

          {/* Bet Amount */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-400">Bet (DONUT)</span>
              <div className="flex gap-1">
                {quickBets.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount.toString())}
                    disabled={isRolling}
                    className="text-[9px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBetAmount(Math.max(1, parseFloat(betAmount || "0") / 2).toString())}
                disabled={isRolling}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
              >
                ½
              </button>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                disabled={isRolling}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-center font-bold focus:outline-none focus:border-amber-500 disabled:opacity-50"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={() => setBetAmount(Math.min(balance, parseFloat(betAmount || "0") * 2).toString())}
                disabled={isRolling}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
              >
                2×
              </button>
            </div>
          </div>

          {/* Roll Button */}
          <button
            onClick={handleRoll}
            disabled={isRolling || parseFloat(betAmount || "0") <= 0 || parseFloat(betAmount || "0") > balance}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-base transition-all",
              isRolling
                ? "bg-amber-500/50 text-amber-200 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-400 text-black"
            )}
          >
            {isRolling ? (
              <span className="flex items-center justify-center gap-2">
                <Dices className="w-5 h-5 animate-spin" />
                ROLLING...
              </span>
            ) : (
              "🎲 ROLL DICE"
            )}
          </button>
        </div>

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl max-h-[60vh] overflow-hidden flex flex-col">
                <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" /> Roll History
                </h2>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {history.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">No rolls yet</p>
                  ) : (
                    history.map((bet) => (
                      <div key={bet.id} className={cn("p-2 rounded-lg border", bet.won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30")}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-xl font-bold", bet.won ? "text-green-400" : "text-red-400")}>{bet.result}</span>
                            <span className="text-xs text-gray-400">{bet.prediction === "over" ? ">" : "<"} {bet.target}</span>
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-bold", bet.won ? "text-green-400" : "text-red-400")}>
                              {bet.won ? `+${bet.payout.toFixed(0)}` : `-${bet.amount}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button onClick={() => setShowHistory(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelp(false)} />
            <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
              <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <button onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Dices className="w-4 h-4" /> How to Play
                </h2>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Set Target (5-95)</div>
                      <div className="text-[11px] text-gray-400">Use the slider to pick your number.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Pick Over or Under</div>
                      <div className="text-[11px] text-gray-400">Guess if the roll will be higher or lower.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-amber-400 text-xs">Bet & Roll</div>
                      <div className="text-[11px] text-gray-400">Lower chance = higher multiplier. 2% fee.</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <p className="text-[10px] text-gray-400 text-center">🎲 100% onchain • Provably fair</p>
                </div>
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}