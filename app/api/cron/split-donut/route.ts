import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Contract addresses - UPDATE AFTER DEPLOYMENT
const SPLITTER_ADDRESS = "0x_SPLITTER_CONTRACT_ADDRESS" as `0x${string}`;

// Bot wallet private key - same as other cron jobs (distribute, split-weth)
// NOT treasury - this is a separate hot wallet with minimal ETH for gas
const AUTOMATION_PRIVATE_KEY = process.env.AUTOMATION_WALLET_PRIVATE_KEY as `0x${string}`;

// Cron secret to prevent unauthorized calls
const CRON_SECRET = process.env.CRON_SECRET;

const SPLITTER_ABI = [
  {
    inputs: [],
    name: "split",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingDonut",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this header)
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!AUTOMATION_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Automation wallet not configured" },
        { status: 500 }
      );
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // Check if there's anything to split
    const pendingDonut = await publicClient.readContract({
      address: SPLITTER_ADDRESS,
      abi: SPLITTER_ABI,
      functionName: "pendingDonut",
    });

    if (pendingDonut === 0n) {
      return NextResponse.json({
        success: true,
        message: "No DONUT to split",
        pending: "0",
      });
    }

    // Create wallet client
    const account = privateKeyToAccount(AUTOMATION_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    // Call split()
    const hash = await walletClient.writeContract({
      address: SPLITTER_ADDRESS,
      abi: SPLITTER_ABI,
      functionName: "split",
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      success: true,
      message: "Split successful",
      pending: pendingDonut.toString(),
      txHash: hash,
      status: receipt.status,
    });
  } catch (error) {
    console.error("Cron split error:", error);
    return NextResponse.json(
      { error: "Failed to split", details: String(error) },
      { status: 500 }
    );
  }
}

// Vercel cron config - every hour
export const runtime = "nodejs";
export const dynamic = "force-dynamic";