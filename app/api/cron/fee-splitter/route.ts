import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  formatUnits,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Fee Splitter contract address
const FEE_SPLITTER_ADDRESS = "0xcB2604D87fe3e5b6fe33C5d5Ff05781602357D59" as const;

const FEE_SPLITTER_ABI = [
  {
    inputs: [],
    name: "distribute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "checkDistribution",
    outputs: [
      { name: "canDistribute", type: "bool" },
      { name: "balance", type: "uint256" },
      { name: "meetsMinimum", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "previewDistribution",
    outputs: [
      { name: "total", type: "uint256" },
      { name: "toLeaderboard", type: "uint256" },
      { name: "toLpBurn", type: "uint256" },
      { name: "toTreasury", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingDistribution",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Alchemy RPC for reliable Base mainnet access
const BASE_RPC_URL = "https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    console.log(`[Fee Splitter] Starting distribution, dryRun: ${dryRun}`);

    // Setup public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Check if there's anything to distribute
    const [canDistribute, balance, meetsMinimum] = await publicClient.readContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "checkDistribution",
    });

    const balanceFormatted = formatUnits(balance, 18);
    console.log(`[Fee Splitter] Balance: ${balanceFormatted} DONUT, canDistribute: ${canDistribute}, meetsMinimum: ${meetsMinimum}`);

    if (!canDistribute || balance === 0n) {
      return NextResponse.json({
        success: false,
        message: "Nothing to distribute",
        balance: balanceFormatted,
      });
    }

    // Preview distribution
    const [total, toLeaderboard, toLpBurn, toTreasury] = await publicClient.readContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "previewDistribution",
    });

    const preview = {
      total: formatUnits(total, 18),
      toLeaderboard: formatUnits(toLeaderboard, 18),
      toLpBurn: formatUnits(toLpBurn, 18),
      toTreasury: formatUnits(toTreasury, 18),
    };

    console.log(`[Fee Splitter] Preview:`, preview);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        balance: balanceFormatted,
        preview,
      });
    }

    // Setup wallet for sending
    const botPrivateKey = process.env.BOT_PRIVATE_KEY;
    if (!botPrivateKey) {
      return NextResponse.json(
        { error: "Bot wallet not configured" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Execute distribution
    const hash = await walletClient.writeContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "distribute",
    });

    console.log(`[Fee Splitter] Distribution tx: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      success: receipt.status === "success",
      txHash: hash,
      distributed: preview,
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (error: any) {
    console.error("[Fee Splitter] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to check splitter status
export async function GET() {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    const [canDistribute, balance, meetsMinimum] = await publicClient.readContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "checkDistribution",
    });

    let preview = null;
    if (balance > 0n) {
      const [total, toLeaderboard, toLpBurn, toTreasury] = await publicClient.readContract({
        address: FEE_SPLITTER_ADDRESS,
        abi: FEE_SPLITTER_ABI,
        functionName: "previewDistribution",
      });

      preview = {
        total: formatUnits(total, 18),
        toLeaderboard: formatUnits(toLeaderboard, 18),
        toLpBurn: formatUnits(toLpBurn, 18),
        toTreasury: formatUnits(toTreasury, 18),
      };
    }

    return NextResponse.json({
      feeSplitter: FEE_SPLITTER_ADDRESS,
      balance: formatUnits(balance, 18),
      canDistribute,
      meetsMinimum,
      preview,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}