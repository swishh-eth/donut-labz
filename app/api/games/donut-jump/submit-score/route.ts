// Place in: app/api/games/donut-jump/submit-score/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Anti-cheat metrics interface
interface GameMetrics {
  gameDurationMs: number;
  maxHeight: number;
  jumpCount: number;
  platformsLanded: number;
  powerUpsCollected: number;
  springBounces: number;
  coinsPerSecondPeak: number;
  coinsPerMinute: number;
  heightPerJump: number;
  coinsPerPlatform: number;
  checksum: string;
}

// Validate checksum matches the metrics
function validateChecksum(score: number, metrics: GameMetrics, entryId: string): boolean {
  const metricsString = `${score}-${metrics.gameDurationMs}-${metrics.maxHeight}-${metrics.jumpCount}-${metrics.platformsLanded}-${entryId}`;
  const expectedChecksum = Array.from(metricsString).reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0).toString(16);
  return metrics.checksum === expectedChecksum;
}

// Check for obvious cheating patterns
function detectCheating(score: number, metrics: GameMetrics): { isSuspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Game too short for the score
  if (metrics.gameDurationMs < 15000 && score > 5) {
    reasons.push(`Game too short: ${metrics.gameDurationMs}ms with score ${score}`);
  }
  
  // Impossibly fast coin collection (more than 5 per second sustained)
  if (metrics.coinsPerSecondPeak > 6) {
    reasons.push(`Impossible collection rate: ${metrics.coinsPerSecondPeak} coins/sec`);
  }
  
  // No jumps but has score
  if (metrics.jumpCount === 0 && score > 0) {
    reasons.push(`No jumps recorded but score is ${score}`);
  }
  
  // Score higher than platforms landed (impossible without cheating)
  if (score > metrics.platformsLanded * 3 && metrics.platformsLanded > 0) {
    reasons.push(`Score ${score} too high for ${metrics.platformsLanded} platforms`);
  }
  
  // Coins per minute way too high (legit max is around 30-35)
  if (metrics.coinsPerMinute > 50) {
    reasons.push(`Coins per minute too high: ${metrics.coinsPerMinute}`);
  }
  
  // Height per jump impossibly high (physics max is around 80)
  if (metrics.heightPerJump > 120 && metrics.jumpCount > 5) {
    reasons.push(`Height per jump impossible: ${metrics.heightPerJump}`);
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
  console.log("[Donut Jump] Submit score called");
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { entryId, score, fid, metrics } = body;

    console.log("[Donut Jump] Submit score body:", { entryId, score, fid, hasMetrics: !!metrics });

    if (!entryId || score === undefined || !fid) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: entryId, score, fid" },
        { status: 400 }
      );
    }

    // Score validation - donuts collected only
    if (score < 0 || score > 10000) {
      return NextResponse.json({ success: false, error: "Invalid score" }, { status: 400 });
    }

    const currentWeek = getCurrentWeek();

    // Fetch the specific entry
    const { data: entry, error: fetchError } = await supabase
      .from("donut_jump_scores")
      .select("*")
      .eq("id", entryId)
      .eq("fid", fid)
      .single();

    console.log("[Donut Jump] Entry fetch result:", { entry, fetchError });

    if (fetchError || !entry) {
      console.error("[Donut Jump] Error fetching entry:", fetchError);
      return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
    }

    // Check if score was already submitted for THIS entry
    if (entry.score > 0) {
      console.log("[Donut Jump] Score already submitted for this entry:", entry.score);
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
        console.warn("[Donut Jump] Checksum mismatch for entry:", entryId);
        flagReasons.push("Checksum mismatch - possible tampering");
        flagged = true;
      }

      // Detect cheating patterns
      const cheatingCheck = detectCheating(score, metrics);
      if (cheatingCheck.isSuspicious) {
        console.warn("[Donut Jump] Suspicious activity detected:", cheatingCheck.reasons);
        flagReasons = [...flagReasons, ...cheatingCheck.reasons];
        flagged = true;
      }
    } else if (score > 10) {
      // No metrics submitted but score is significant - flag for review
      flagged = true;
      flagReasons.push("No metrics submitted with score > 10");
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

    // ALWAYS update this entry with the score (even if flagged - you review on Friday)
    const { error: updateError } = await supabase
      .from("donut_jump_scores")
      .update({ 
        score, 
        metrics: metricsToStore,
        updated_at: new Date().toISOString() 
      })
      .eq("id", entryId);

    if (updateError) {
      console.error("[Donut Jump] Error updating score:", updateError);
      return NextResponse.json({ success: false, error: "Failed to submit score" }, { status: 500 });
    }

    console.log("[Donut Jump] Score submitted:", score, "for entry:", entryId, "flagged:", flagged);

    // Get user's best score this week (across all their entries)
    const { data: userBestEntry } = await supabase
      .from("donut_jump_scores")
      .select("score")
      .eq("fid", fid)
      .eq("week", currentWeek)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    const bestScore = userBestEntry?.score || score;
    const isPersonalBest = score >= bestScore;

    // Get rank (count of players with higher best scores + 1)
    // First get best score per player
    const { data: allScores } = await supabase
      .from("donut_jump_scores")
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
      bestScore,
      isPersonalBest,
      rank,
      week: currentWeek,
    });
  } catch (error: any) {
    console.error("[Donut Jump] Submit score error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}