// Place in: app/api/games/donut-survivors/submit-score/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Anti-cheat metrics interface for Donut Survivors
interface GameMetrics {
  gameDurationMs: number;
  survivalTimeSeconds: number;
  kills: number;
  xpCollected: number;
  level: number;
  weaponsAcquired: number;
  gadgetsAcquired: number;
  bossesDefeated: number;
  powerUpsCollected: number;
  damageDealt: number;
  damageTaken: number;
  killsPerMinute: number;
  xpPerMinute: number;
  checksum: string;
}

// Validate checksum matches the metrics
function validateChecksum(score: number, metrics: GameMetrics, entryId: string): boolean {
  const metricsString = `${score}-${metrics.gameDurationMs}-${metrics.survivalTimeSeconds}-${metrics.kills}-${metrics.level}-${entryId}`;
  const expectedChecksum = Array.from(metricsString).reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0).toString(16);
  return metrics.checksum === expectedChecksum;
}

// Check for obvious cheating patterns
function detectCheating(score: number, metrics: GameMetrics): { isSuspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Game too short for the score
  // Survival time should roughly match game duration
  if (metrics.gameDurationMs < 30000 && score > 100) {
    reasons.push(`Game too short: ${metrics.gameDurationMs}ms with score ${score}`);
  }
  
  // Survival time mismatch with duration
  const expectedSurvivalMs = metrics.survivalTimeSeconds * 1000;
  if (Math.abs(expectedSurvivalMs - metrics.gameDurationMs) > 5000) {
    reasons.push(`Survival time mismatch: ${metrics.survivalTimeSeconds}s vs ${metrics.gameDurationMs}ms duration`);
  }
  
  // Impossibly fast kill rate (more than 60 kills per minute is very suspicious)
  if (metrics.killsPerMinute > 60 && metrics.survivalTimeSeconds > 60) {
    reasons.push(`Impossible kill rate: ${metrics.killsPerMinute} kills/min`);
  }
  
  // Level too high for survival time
  // With 1.1 XP scale, leveling is faster - roughly 1 level per 15 seconds with good play
  const maxReasonableLevel = Math.floor(metrics.survivalTimeSeconds / 12) + 5;
  if (metrics.level > maxReasonableLevel && metrics.level > 25) {
    reasons.push(`Level ${metrics.level} too high for ${metrics.survivalTimeSeconds}s survival`);
  }
  
  // XP per minute too high (with all multipliers, 300/min is extreme)
  if (metrics.xpPerMinute > 300 && metrics.survivalTimeSeconds > 60) {
    reasons.push(`XP rate too high: ${metrics.xpPerMinute} XP/min`);
  }
  
  // Score calculation sanity check
  // Score = kills
  const expectedScore = metrics.kills;
  if (Math.abs(score - expectedScore) > 5) {
    reasons.push(`Score mismatch: got ${score}, expected ${expectedScore}`);
  }
  
  // No kills but has score (impossible)
  if (metrics.kills === 0 && score > 0) {
    reasons.push(`No kills but score is ${score}`);
  }
  
  // Bosses defeated but not enough time
  // First boss at 10 min, final boss at 20 min
  if (metrics.bossesDefeated > 0 && metrics.survivalTimeSeconds < 580) {
    reasons.push(`Boss defeated before 10 minutes: ${metrics.survivalTimeSeconds}s`);
  }
  if (metrics.bossesDefeated > 1 && metrics.survivalTimeSeconds < 1180) {
    reasons.push(`Final boss defeated before 20 minutes: ${metrics.survivalTimeSeconds}s`);
  }
  
  // More weapons/gadgets than possible (max 4 each)
  if (metrics.weaponsAcquired > 4 || metrics.gadgetsAcquired > 4) {
    reasons.push(`Too many weapons/gadgets: ${metrics.weaponsAcquired}/${metrics.gadgetsAcquired}`);
  }
  
  return {
    isSuspicious: reasons.length > 0,
    reasons
  };
}

// Get current week number (weeks start on Friday 11PM UTC / 6PM EST)
function getCurrentWeek(): number {
  const now = new Date();
  // Epoch: Friday Jan 3, 2025 23:00 UTC
  const epoch = new Date(Date.UTC(2025, 0, 3, 23, 0, 0));
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / msPerWeek);
  return weeksSinceEpoch + 1;
}

export async function POST(req: NextRequest) {
  console.log("[Donut Survivors] Submit score called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { entryId, score, survivalTime, kills, fid, metrics } = body;

    console.log("[Donut Survivors] Submit score body:", { entryId, score, survivalTime, kills, fid, hasMetrics: !!metrics });

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: entryId, score, fid" },
        { status: 400 }
      );
    }

    // Score validation
    if (score < 0 || score > 1000000) {
      return NextResponse.json({ success: false, error: "Invalid score" }, { status: 400 });
    }

    const currentWeek = getCurrentWeek();

    // Fetch the specific entry
    const { data: entry, error: fetchError } = await supabase
      .from("donut_survivors_scores")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .single();

    console.log("[Donut Survivors] Entry fetch result:", { entry, fetchError });

    if (fetchError || !entry) {
      console.error("[Donut Survivors] Error fetching entry:", fetchError);
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    // Check if score was already submitted for THIS entry
    if (entry.score > 0) {
      console.log("[Donut Survivors] Score already submitted for this entry:", entry.score);
      return NextResponse.json(
        { success: false, error: "Score already submitted for this entry" },
        { status: 400 }
      );
    }

    // Anti-cheat validation
    let flagged = false;
    let flagReasons: string[] = [];
    let checksumValid = true;

    if (metrics) {
      // Validate checksum
      checksumValid = validateChecksum(score, metrics, entryId);
      if (!checksumValid) {
        console.warn("[Donut Survivors] Checksum mismatch for entry:", entryId);
        flagReasons.push("Checksum mismatch - possible tampering");
        flagged = true;
      }

      // Detect cheating patterns
      const cheatingCheck = detectCheating(score, metrics);
      if (cheatingCheck.isSuspicious) {
        console.warn("[Donut Survivors] Suspicious activity detected:", cheatingCheck.reasons);
        flagReasons = [...flagReasons, ...cheatingCheck.reasons];
        flagged = true;
      }
    } else if (score > 100) {
      // No metrics submitted but score is significant - flag for review
      flagged = true;
      flagReasons.push("No metrics submitted with score > 100");
    }

    // Prepare metrics object for storage
    const metricsToStore = metrics ? {
      ...metrics,
      checksumValid,
      flagged,
      flagReasons: flagReasons.length > 0 ? flagReasons : undefined,
      submittedAt: new Date().toISOString(),
    } : {
      flagged: true,
      flagReasons: ["No metrics provided"],
      submittedAt: new Date().toISOString(),
    };

    // ALWAYS update this entry with the score (even if flagged - review on Friday)
    const { error: updateError } = await supabase
      .from("donut_survivors_scores")
      .update({ 
        score,
        survival_time: survivalTime || 0,
        kills: kills || 0,
        metrics: metricsToStore,
        updated_at: new Date().toISOString() 
      })
      .eq("id", entryId);

    if (updateError) {
      console.error("[Donut Survivors] Error updating score:", updateError);
      return NextResponse.json({ success: false, error: "Failed to submit score" }, { status: 500 });
    }

    console.log("[Donut Survivors] Score submitted:", score, "for entry:", entryId, "flagged:", flagged);

    // Get user's best score this week (across all their entries)
    const { data: userBestEntry } = await supabase
      .from("donut_survivors_scores")
      .select("score")
      .eq("fid", fid)
      .eq("week", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    const bestScore = userBestEntry?.score || score;
    const isPersonalBest = score >= bestScore;

    // Get rank (count of players with higher best scores + 1)
    const { data: allScores } = await supabase
      .from("donut_survivors_scores")
      .select("fid, score")
      .eq("week", currentWeek)
      .gt("score", 0);

    // Calculate best score per player
    const playerBests = new Map<number, number>();
    allScores?.forEach((s) => {
      if (!playerBests.has(s.fid) || s.score > playerBests.get(s.fid)!) {
        playerBests.set(s.fid, s.score);
      }
    });

    // Count how many players have a better best score
    let betterCount = 0;
    playerBests.forEach((playerBest, playerFid) => {
      if (playerFid !== fid && playerBest > bestScore) {
        betterCount++;
      }
    });

    const rank = betterCount + 1;

    return NextResponse.json({
      success: true,
      score,
      survivalTime,
      kills,
      bestScore,
      isPersonalBest,
      rank,
      week: currentWeek,
    });
  } catch (error: any) {
    console.error("[Donut Survivors] Submit score error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}