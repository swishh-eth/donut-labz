// app/api/profiles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const addressesParam = searchParams.get("addresses");

  if (!addressesParam) {
    return NextResponse.json({ profiles: {} });
  }

  const addresses = addressesParam
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);

  if (addresses.length === 0) {
    return NextResponse.json({ profiles: {} });
  }

  const results: Record<string, any> = {};
  const uncachedAddresses: string[] = [];

  // Check Supabase cache first
  try {
    const { data: cachedProfiles } = await supabase
      .from("profile_cache")
      .select("*")
      .in("address", addresses);

    const now = Date.now();

    for (const addr of addresses) {
      const cached = cachedProfiles?.find(
        (p) => p.address.toLowerCase() === addr.toLowerCase()
      );

      if (cached) {
        const cachedTime = new Date(cached.updated_at).getTime();
        if (now - cachedTime < CACHE_TTL_MS) {
          // Cache hit - use stored profile
          results[addr] = cached.profile;
        } else {
          // Cache expired
          uncachedAddresses.push(addr);
        }
      } else {
        // Not in cache
        uncachedAddresses.push(addr);
      }
    }
  } catch (e) {
    console.error("Failed to read profile cache:", e);
    // If cache read fails, fetch all
    uncachedAddresses.push(...addresses.filter((a) => !results[a]));
  }

  // Fetch uncached addresses from Neynar (batch)
  if (uncachedAddresses.length > 0) {
    try {
      const addressList = uncachedAddresses.join(",");
      const res = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(addressList)}`,
        {
          headers: {
            accept: "application/json",
            api_key: NEYNAR_API_KEY,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();

        const profilesToUpsert: Array<{ address: string; profile: any }> = [];

        for (const addr of uncachedAddresses) {
          // Neynar might return keys in checksummed case format
          // Do a case-insensitive lookup to find the matching key
          const matchingKey = Object.keys(data).find(
            (key) => key.toLowerCase() === addr.toLowerCase()
          );
          const users = matchingKey ? data[matchingKey] : [];
          const user = users[0] || null;

          const profile = user
            ? {
                fid: user.fid,
                username: user.username,
                displayName: user.display_name,
                pfpUrl: user.pfp_url,
                neynarScore: user.experimental?.neynar_user_score || null,
              }
            : null;

          results[addr] = profile;
          profilesToUpsert.push({ address: addr.toLowerCase(), profile });
        }

        // Store in Supabase cache
        if (profilesToUpsert.length > 0) {
          const { error } = await supabase.from("profile_cache").upsert(
            profilesToUpsert.map((p) => ({
              address: p.address,
              profile: p.profile,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "address" }
          );

          if (error) {
            console.error("Failed to cache profiles:", error);
          }
        }
      } else {
        console.error("Neynar batch fetch failed:", await res.text());
        for (const addr of uncachedAddresses) {
          results[addr] = null;
        }
      }
    } catch (e) {
      console.error("Failed to batch fetch profiles:", e);
      for (const addr of uncachedAddresses) {
        results[addr] = null;
      }
    }
  }

  return NextResponse.json({ profiles: results });
}