"use client";

import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { NavBar } from "@/components/nav-bar";
import { Trophy, Clock, CheckCircle, Circle, ExternalLink, Sparkles, Users, Gift, ChevronDown, ChevronUp, X, HelpCircle, Video, Tag, Award, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

type Challenge = {
  id: string;
  title: string;
  description: string;
  prizeDonut: number;
  prizeSprinkles: number;
  requirements: string[];
  deadline?: string;
  participants: number;
  completions: number;
  isActive: boolean;
  isNew?: boolean;
  isHot?: boolean;
  icon: React.ElementType;
  difficulty: "easy" | "medium" | "hard";
  category: "stream" | "social" | "gameplay";
};

// Challenge Card Component
function ChallengeCard({ 
  challenge, 
  isExpanded, 
  onToggle,
  onSubmit 
}: { 
  challenge: Challenge;
  isExpanded: boolean;
  onToggle: () => void;
  onSubmit: () => void;
}) {
  const difficultyColors = {
    easy: "bg-green-500/20 text-green-400 border-green-500/30",
    medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    hard: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const categoryIcons = {
    stream: Video,
    social: Users,
    gameplay: Trophy,
  };

  const CategoryIcon = categoryIcons[challenge.category];

  return (
    <div 
      className={cn(
        "challenge-card rounded-xl border overflow-hidden transition-all duration-300",
        challenge.isActive 
          ? "bg-zinc-900 border-zinc-700" 
          : "bg-zinc-900/50 border-zinc-800 opacity-60"
      )}
    >
      {/* Main card content - clickable */}
      <button
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
            challenge.isActive 
              ? "bg-white" 
              : "bg-zinc-800"
          )}>
            <challenge.icon className={cn("w-6 h-6", challenge.isActive ? "text-black" : "text-gray-500")} />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-white text-sm">{challenge.title}</span>
              {!challenge.isActive && (
                <span className="text-[8px] bg-zinc-700 text-gray-400 px-1.5 py-0.5 rounded-full font-bold">
                  ENDED
                </span>
              )}
            </div>
            
            <p className="text-xs text-gray-400 line-clamp-2">{challenge.description}</p>
          </div>
          
          {/* Prize + Expand */}
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-xs font-bold text-amber-400">🍩 {challenge.prizeDonut}</div>
              <div className="text-[10px] text-gray-400">✨ {challenge.prizeSprinkles.toLocaleString()}</div>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </div>
      </button>
      
      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-zinc-700 pt-3 space-y-3">
          {/* Prize breakdown */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Gift className="w-3 h-3" /> Prize Pool
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍩</span>
                <div>
                  <div className="text-lg font-black text-amber-400">{challenge.prizeDonut}</div>
                  <div className="text-[9px] text-gray-500">$DONUT</div>
                </div>
              </div>
              <div className="text-gray-600 text-xl">+</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <div>
                  <div className="text-lg font-black text-gray-300">{challenge.prizeSprinkles.toLocaleString()}</div>
                  <div className="text-[9px] text-gray-500">$SPRINKLES</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Requirements */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Requirements
            </div>
            <div className="space-y-2">
              {challenge.requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-amber-400">{idx + 1}</span>
                  </div>
                  <p className="text-xs text-gray-300">{req}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Stats - only show if there's data */}
          {(challenge.participants > 0 || challenge.completions > 0 || challenge.deadline) && (
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <div className="flex items-center gap-3">
                {challenge.participants > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {challenge.participants} participants
                  </span>
                )}
                {challenge.completions > 0 && (
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    {challenge.completions} completed
                  </span>
                )}
              </div>
              {challenge.deadline && (
                <span className="flex items-center gap-1 text-amber-400">
                  <Clock className="w-3 h-3" />
                  Ends {challenge.deadline}
                </span>
              )}
            </div>
          )}
          
          {/* Submit button */}
          {challenge.isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSubmit();
              }}
              className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-100 transition-all active:scale-[0.98]"
            >
              Submit Entry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Submit Modal
function SubmitModal({ 
  challenge, 
  onClose, 
  onSubmit 
}: { 
  challenge: Challenge;
  onClose: () => void;
  onSubmit: (proof: string) => void;
}) {
  const [proofLink, setProofLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!proofLink.trim()) return;
    setIsSubmitting(true);
    
    // Simulate submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      onSubmit(proofLink);
      
      setTimeout(() => {
        onClose();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
        <div className="relative mx-4 rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 hover:bg-zinc-800 hover:text-white z-10">
            <X className="h-4 w-4" />
          </button>
          
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Submitted!</h2>
              <p className="text-sm text-gray-400">Your entry is being reviewed by @Swishh.eth</p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" /> Submit Entry
              </h2>
              <p className="text-[10px] text-gray-500 mb-4">for "{challenge.title}"</p>
              
              {/* Prize reminder */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                <div className="text-[10px] text-amber-400 mb-1">You're competing for:</div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-amber-400">🍩 {challenge.prizeDonut} DONUT</span>
                  <span className="text-sm font-bold text-gray-300">✨ {challenge.prizeSprinkles.toLocaleString()} SPRINKLES</span>
                </div>
              </div>
              
              {/* Proof link input */}
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1 block">Link to your proof (Retake clip, cast, etc.)</label>
                <div className="relative">
                  <input
                    type="url"
                    value={proofLink}
                    onChange={(e) => setProofLink(e.target.value)}
                    placeholder="https://retake.xyz/clip/..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 pr-10"
                  />
                  <ExternalLink className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                </div>
              </div>
              
              {/* Requirements checklist reminder */}
              <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
                <div className="text-[10px] text-gray-400 mb-2">Make sure you've completed:</div>
                <div className="space-y-1">
                  {challenge.requirements.map((req, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px] text-gray-300">
                      <Circle className="w-3 h-3 text-amber-400" />
                      <span className="line-clamp-1">{req}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <button
                onClick={handleSubmit}
                disabled={!proofLink.trim() || isSubmitting}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition-all",
                  proofLink.trim() && !isSubmitting
                    ? "bg-white text-black hover:bg-gray-100"
                    : "bg-zinc-700 text-zinc-400"
                )}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  "Submit for Review"
                )}
              </button>
              
              <p className="text-[9px] text-gray-500 text-center mt-2">
                Entries are reviewed by @Swishh.eth within 24 hours
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<{ user?: { fid: number; username?: string; pfpUrl?: string } } | null>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<string | null>(null);
  const [submitChallenge, setSubmitChallenge] = useState<Challenge | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [filter, setFilter] = useState<"all" | "stream" | "social" | "gameplay">("all");

  // Challenges data
  const challenges: Challenge[] = [
    {
      id: "donut-stream",
      title: "EAT A DONUT ON STREAM",
      description: "Show your love for DONUT by eating a real donut during your gaming stream! Tag @Swishh.eth while live on Retake.",
      prizeDonut: 25,
      prizeSprinkles: 2500,
      requirements: [
        "Go live on Retake with your gaming stream",
        "Eat a real donut on camera during your stream",
        "Tag @Swishh.eth in chat while you are LIVE completing the challenge",
        "Clip the moment and submit the link below"
      ],
      deadline: "Jan 31",
      participants: 0,
      completions: 0,
      isActive: true,
      isNew: false,
      isHot: false,
      icon: Video,
      difficulty: "easy",
      category: "stream",
    },
    {
      id: "high-roller",
      title: "HIGH ROLLER STREAK",
      description: "Win 5 games in a row on any Sprinkles game. Screenshot your streak!",
      prizeDonut: 20,
      prizeSprinkles: 2000,
      requirements: [
        "Play any Sprinkles game (Dice, Mines, Tower, Wheel)",
        "Win 5 games in a row without losing",
        "Screenshot showing your win streak",
        "Submit screenshot link as proof"
      ],
      participants: 0,
      completions: 0,
      isActive: true,
      isNew: false,
      isHot: false,
      icon: Trophy,
      difficulty: "hard",
      category: "gameplay",
    },
    {
      id: "social-shill",
      title: "DONUT EVANGELIST",
      description: "Share your biggest Sprinkles win on Farcaster with 🍩✨",
      prizeDonut: 5,
      prizeSprinkles: 500,
      requirements: [
        "Win any amount on a Sprinkles game",
        "Post about your win on Farcaster",
        "Include 🍩✨ in your cast",
        "Tag @Swishh.eth in your cast"
      ],
      participants: 0,
      completions: 0,
      isActive: true,
      isNew: false,
      isHot: false,
      icon: Users,
      difficulty: "easy",
      category: "social",
    },
  ];

  const filteredChallenges = filter === "all" 
    ? challenges 
    : challenges.filter(c => c.category === filter);

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

  const handleSubmitEntry = (proof: string) => {
    console.log("Submitted proof:", proof);
    // TODO: Send to backend/API
  };

  const totalPrizeDonut = challenges.filter(c => c.isActive).reduce((sum, c) => sum + c.prizeDonut, 0);
  const totalPrizeSprinkles = challenges.filter(c => c.isActive).reduce((sum, c) => sum + c.prizeSprinkles, 0);
  const totalParticipants = challenges.reduce((sum, c) => sum + c.participants, 0);

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        @keyframes sparkle-drift {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
          50% { transform: translateY(-10px) rotate(180deg); opacity: 1; }
        }
        .sparkle-drift { animation: sparkle-drift 3s ease-in-out infinite; }
      `}</style>

      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col bg-black px-2 shadow-inner overflow-hidden"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide">TOURNAMENTS</h1>
            <span className="text-[9px] bg-amber-500 text-black px-1.5 py-0.5 rounded-full font-bold animate-pulse">NEW</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <HelpCircle className="w-4 h-4" />
            </button>
            {context?.user?.pfpUrl ? (
              <img src={context.user.pfpUrl} alt="" className="h-7 w-7 rounded-full border border-zinc-700 object-cover" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700" />
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2 mb-3 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-400 uppercase">Active Prizes</div>
            <div className="text-sm font-bold text-amber-400">🍩 {totalPrizeDonut}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-400 uppercase">Sprinkles Pool</div>
            <div className="text-sm font-bold text-gray-300">✨ {totalPrizeSprinkles.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-400 uppercase">Participants</div>
            <div className="text-sm font-bold text-white">{totalParticipants}</div>
          </div>
        </div>

        {/* Hosted by Sprinkles banner */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 mb-3 flex-shrink-0">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 sparkle-drift" />
            <span className="text-xs font-bold text-white">Hosted by</span>
            <span className="text-sm font-black text-amber-400">SPRINKLES</span>
            <Sparkles className="w-4 h-4 text-amber-400 sparkle-drift" style={{ animationDelay: '0.5s' }} />
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1">Complete challenges, get verified, win prizes!</p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-3 flex-shrink-0 overflow-x-auto pb-1">
          {[
            { id: "all", label: "All", icon: Trophy },
            { id: "stream", label: "Stream", icon: Video },
            { id: "social", label: "Social", icon: Users },
            { id: "gameplay", label: "Gameplay", icon: Award },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0",
                filter === cat.id
                  ? "bg-white text-black"
                  : "bg-zinc-800 text-gray-400 border border-zinc-700 hover:border-zinc-600"
              )}
            >
              <cat.icon className="w-3 h-3" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Challenges list */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {filteredChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              isExpanded={expandedChallenge === challenge.id}
              onToggle={() => setExpandedChallenge(expandedChallenge === challenge.id ? null : challenge.id)}
              onSubmit={() => setSubmitChallenge(challenge)}
            />
          ))}
          
          {filteredChallenges.length === 0 && (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-gray-500">No challenges in this category yet</p>
            </div>
          )}
          
          {/* Coming soon teaser */}
          <div className="bg-zinc-900/50 border border-dashed border-zinc-700 rounded-xl p-4 text-center">
            <div className="text-gray-500 text-xs mb-1">More challenges coming soon...</div>
            <div className="text-[10px] text-gray-600">Follow @Swishh.eth for announcements!</div>
          </div>
        </div>

        {/* Submit Modal */}
        {submitChallenge && (
          <SubmitModal
            challenge={submitChallenge}
            onClose={() => setSubmitChallenge(null)}
            onSubmit={handleSubmitEntry}
          />
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
                  <Trophy className="w-4 h-4 text-amber-400" /> How Tournaments Work
                </h2>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">1</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Pick a Challenge</div>
                      <div className="text-[11px] text-gray-400">Browse active challenges and find one you want to complete.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Complete Requirements</div>
                      <div className="text-[11px] text-gray-400">Follow ALL the requirements listed for the challenge.</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-black">3</div>
                    <div>
                      <div className="font-semibold text-white text-xs">Submit Proof</div>
                      <div className="text-[11px] text-gray-400">Clip it, screenshot it, or link to it - then submit!</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-black">4</div>
                    <div>
                      <div className="font-semibold text-green-400 text-xs">Get Verified & Paid!</div>
                      <div className="text-[11px] text-gray-400">@Swishh.eth reviews entries within 24h. Winners get paid directly!</div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="text-[10px] text-amber-400 font-bold mb-1">💡 Pro Tip:</div>
                  <div className="text-[10px] text-gray-400">The more creative and entertaining your submission, the better chance you have of getting featured!</div>
                </div>
                
                <button onClick={() => setShowHelp(false)} className="mt-3 w-full rounded-xl bg-white py-2 text-sm font-bold text-black">Got it!</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}