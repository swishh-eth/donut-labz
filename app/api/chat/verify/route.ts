import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limit: 5 messages per 5 minutes
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_MESSAGES = 5;
const BAN_DURATION_SECONDS = 5 * 60; // 5 minute ban for exceeding rate limit

export async function POST(request: NextRequest) {
  try {
    const { senderAddress, message } = await request.json();

    if (!senderAddress) {
      return NextResponse.json({
        eligible: false,
        reasons: ["Wallet address is required"],
      });
    }

    const reasons: string[] = [];

    // Check for duplicate messages (spam prevention)
    if (message && message.trim()) {
      const { data: recentMessages } = await supabase
        .from("chat_messages")
        .select("message")
        .eq("sender", senderAddress.toLowerCase())
        .gte("timestamp", Math.floor(Date.now() / 1000) - 300) // Last 5 minutes
        .order("timestamp", { ascending: false })
        .limit(10);

      if (recentMessages) {
        const duplicateCount = recentMessages.filter(
          (m) => m.message?.toLowerCase() === message.toLowerCase()
        ).length;

        if (duplicateCount >= 2) {
          reasons.push("Please don't send duplicate messages");
        }
      }
    }

    // Check rate limit
    const { data: rateLimitData } = await supabase
      .from("chat_rate_limits")
      .select("*")
      .eq("address", senderAddress.toLowerCase())
      .single();

    const now = Date.now();

    if (rateLimitData) {
      // Check if user is banned
      if (rateLimitData.banned_until && new Date(rateLimitData.banned_until).getTime() > now) {
        const banSecondsRemaining = Math.ceil((new Date(rateLimitData.banned_until).getTime() - now) / 1000);
        return NextResponse.json({
          eligible: false,
          reasons: ["Rate limited - too many messages"],
          rateLimitBan: true,
          banSecondsRemaining,
        });
      }

      // Check message count in window
      const windowStart = now - RATE_LIMIT_WINDOW_MS;
      const messageTimestamps: number[] = rateLimitData.message_timestamps || [];
      const recentTimestamps = messageTimestamps.filter((ts) => ts > windowStart);

      if (recentTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
        // Ban the user
        const bannedUntil = new Date(now + BAN_DURATION_SECONDS * 1000).toISOString();
        await supabase
          .from("chat_rate_limits")
          .update({ banned_until: bannedUntil })
          .eq("address", senderAddress.toLowerCase());

        return NextResponse.json({
          eligible: false,
          reasons: ["Rate limited - too many messages (5 per 5 minutes)"],
          rateLimitBan: true,
          banSecondsRemaining: BAN_DURATION_SECONDS,
        });
      }

      // Update timestamps
      const updatedTimestamps = [...recentTimestamps, now];
      await supabase
        .from("chat_rate_limits")
        .update({ 
          message_timestamps: updatedTimestamps,
          banned_until: null 
        })
        .eq("address", senderAddress.toLowerCase());
    } else {
      // Create new rate limit record
      await supabase.from("chat_rate_limits").insert({
        address: senderAddress.toLowerCase(),
        message_timestamps: [now],
      });
    }

    // Return result
    if (reasons.length > 0) {
      return NextResponse.json({
        eligible: false,
        reasons,
      });
    }

    return NextResponse.json({
      eligible: true,
    });
  } catch (error) {
    console.error("Verify error:", error);
    return NextResponse.json({
      eligible: false,
      reasons: ["Server error - please try again"],
    });
  }
}