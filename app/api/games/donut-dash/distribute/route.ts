import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONTRACT_ADDRESS = "0xE0a8c447D18166478aBeadb06ae5458Cd3E68B40" as `0x${string}`;

const CONTRACT_ABI = [
  {
    inputs: [{ name: "winners", type: "address[10]" }],
    name: "distribute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "canDistribute",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentWeek",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrizePool",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function GET(req: NextRequest) {
  try {
    const canDistribute = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "canDistribute",
    });

    const currentWeek = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "currentWeek",
    });

    const prizePool = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getPrizePool",
    });

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    return NextResponse.json({
      contractWeek: Number(currentWeek),
      dbWeek: config?.current_week || 1,
      canDistribute,
      prizePool: prizePool.toString(),
      prizePoolFormatted: (Number(prizePool) / 1e18).toFixed(2) + " DONUT",
      contractAddress: CONTRACT_ADDRESS,
    });
  } catch (error) {
    console.error("Error checking distribution status:", error);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canDistribute = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "canDistribute",
    });

    if (!canDistribute) {
      return NextResponse.json({
        success: false,
        message: "Distribution not allowed at this time",
      });
    }

    const { data: config } = await supabase
      .from("donut_dash_config")
      .select("current_week")
      .eq("id", 1)
      .single();

    const dbWeek = config?.current_week || 1;

    const { data: topPlayers, error } = await supabase
      .from("donut_dash_scores")
      .select("fid, wallet_address, username, display_name, score")
      .eq("week", dbWeek)
      .gt("score", 0)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Error fetching top players:", error);
      return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
    }

    const seenFids = new Set<number>();
    const winners: { fid: number; wallet: string; score: number; username?: string }[] = [];
    
    for (const player of topPlayers || []) {
      if (!seenFids.has(player.fid) && player.wallet_address) {
        seenFids.add(player.fid);
        winners.push({
          fid: player.fid,
          wallet: player.wallet_address,
          score: player.score,
          username: player.username,
        });
        if (winners.length >= 10) break;
      }
    }

    if (winners.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No eligible winners for this week",
      });
    }

    const zeroAddr = "0x0000000000000000000000000000000000000000" as `0x${string}`;
    const winnerAddresses: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] = [
      (winners[0]?.wallet as `0x${string}`) || zeroAddr,
      (winners[1]?.wallet as `0x${string}`) || zeroAddr,
      (winners[2]?.wallet as `0x${string}`) || zeroAddr,
      (winners[3]?.wallet as `0x${string}`) || zeroAddr,
      (winners[4]?.wallet as `0x${string}`) || zeroAddr,
      (winners[5]?.wallet as `0x${string}`) || zeroAddr,
      (winners[6]?.wallet as `0x${string}`) || zeroAddr,
      (winners[7]?.wallet as `0x${string}`) || zeroAddr,
      (winners[8]?.wallet as `0x${string}`) || zeroAddr,
      (winners[9]?.wallet as `0x${string}`) || zeroAddr,
    ] as const;

    const prizePool = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "getPrizePool",
    });

    if (!process.env.BOT_PRIVATE_KEY) {
      return NextResponse.json({ error: "Bot wallet not configured" }, { status: 500 });
    }

    const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
    });

    const txHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "distribute",
      args: [winnerAddresses],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "success") {
      const prizeShares = [3000, 2000, 1500, 1000, 800, 600, 500, 300, 200, 100];
      const winnersData = winners.map((w, i) => ({
        rank: i + 1,
        fid: w.fid,
        wallet: w.wallet,
        score: w.score,
        username: w.username,
        prize: ((BigInt(prizePool) * BigInt(prizeShares[i])) / 10000n).toString(),
      }));

      await supabase.from("donut_dash_distributions").insert({
        week: dbWeek,
        prize_pool: prizePool.toString(),
        tx_hash: txHash,
        winners: winnersData,
      });

      await supabase
        .from("donut_dash_config")
        .update({ current_week: dbWeek + 1 })
        .eq("id", 1);

      return NextResponse.json({
        success: true,
        week: dbWeek,
        txHash,
        prizePool: prizePool.toString(),
        winners: winnersData,
        message: `Successfully distributed prizes for week ${dbWeek}`,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Transaction failed",
        txHash,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Distribution error:", error);
    return NextResponse.json(
      { error: "Distribution failed", details: String(error) },
      { status: 500 }
    );
  }
}