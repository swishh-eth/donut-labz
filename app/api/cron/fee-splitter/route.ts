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

// Shared distribution logic
async function executeDistribution(dryRun: boolean = false) {
  console.log(`[Fee Splitter] Starting distribution check, dryRun: ${dryRun}`);

  // Setup public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  // Check if there's anything to distribute
  let checkResult;
  try {
    checkResult = await publicClient.readContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "checkDistribution",
    });
  } catch (error: any) {
    console.error(`[Fee Splitter] Failed to check distribution:`, error.message);
    throw new Error(`Failed to check distribution: ${error.message}`);
  }

  const [canDistribute, balance, meetsMinimum] = checkResult;
  const balanceFormatted = formatUnits(balance, 18);
  
  console.log(`[Fee Splitter] Check results:`, {
    balance: balanceFormatted,
    canDistribute,
    meetsMinimum,
  });

  if (balance === 0n) {
    return {
      success: false,
      reason: "no_balance",
      message: "No SPRINKLES balance to distribute",
      balance: balanceFormatted,
      canDistribute,
      meetsMinimum,
    };
  }

  if (!meetsMinimum) {
    return {
      success: false,
      reason: "below_minimum",
      message: "Balance below minimum threshold",
      balance: balanceFormatted,
      canDistribute,
      meetsMinimum,
    };
  }

  if (!canDistribute) {
    return {
      success: false,
      reason: "cannot_distribute",
      message: "Contract reports cannot distribute",
      balance: balanceFormatted,
      canDistribute,
      meetsMinimum,
    };
  }

  // Preview distribution
  let preview;
  try {
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
    console.log(`[Fee Splitter] Preview:`, preview);
  } catch (error: any) {
    console.error(`[Fee Splitter] Failed to preview distribution:`, error.message);
    throw new Error(`Failed to preview distribution: ${error.message}`);
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      balance: balanceFormatted,
      preview,
    };
  }

  // Setup wallet for sending
  const botPrivateKey = process.env.BOT_PRIVATE_KEY;
  if (!botPrivateKey) {
    console.error(`[Fee Splitter] BOT_PRIVATE_KEY not configured`);
    throw new Error("Bot wallet not configured");
  }

  const account = privateKeyToAccount(botPrivateKey as `0x${string}`);
  console.log(`[Fee Splitter] Using bot wallet: ${account.address}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(BASE_RPC_URL),
  });

  // Check bot has enough ETH for gas
  const botBalance = await publicClient.getBalance({ address: account.address });
  const botBalanceEth = formatUnits(botBalance, 18);
  console.log(`[Fee Splitter] Bot ETH balance: ${botBalanceEth}`);

  if (botBalance < BigInt(0.0001 * 1e18)) {
    console.error(`[Fee Splitter] Bot has insufficient ETH for gas`);
    throw new Error(`Bot has insufficient ETH for gas: ${botBalanceEth} ETH`);
  }

  // Execute distribution
  let hash;
  try {
    console.log(`[Fee Splitter] Sending distribute transaction...`);
    hash = await walletClient.writeContract({
      address: FEE_SPLITTER_ADDRESS,
      abi: FEE_SPLITTER_ABI,
      functionName: "distribute",
    });
    console.log(`[Fee Splitter] Transaction sent: ${hash}`);
  } catch (error: any) {
    console.error(`[Fee Splitter] Failed to send transaction:`, error.message);
    throw new Error(`Failed to send distribute transaction: ${error.message}`);
  }

  // Wait for confirmation
  let receipt;
  try {
    console.log(`[Fee Splitter] Waiting for confirmation...`);
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Fee Splitter] Transaction confirmed, status: ${receipt.status}`);
  } catch (error: any) {
    console.error(`[Fee Splitter] Failed to confirm transaction:`, error.message);
    throw new Error(`Transaction sent but failed to confirm: ${hash}`);
  }

  if (receipt.status !== "success") {
    console.error(`[Fee Splitter] Transaction reverted`);
    throw new Error(`Transaction reverted: ${hash}`);
  }

  return {
    success: true,
    txHash: hash,
    distributed: preview,
    blockNumber: receipt.blockNumber.toString(),
    botWallet: account.address,
  };
}

// GET endpoint - Vercel cron uses GET by default, so this handles the cron
export async function GET(request: NextRequest) {
  try {
    // Check if this is a cron request (has authorization) or just a status check
    const authHeader = request.headers.get("authorization");
    const isCronRequest = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    // Check for execute param (manual trigger from browser with ?execute=true)
    const url = new URL(request.url);
    const executeParam = url.searchParams.get("execute") === "true";
    const dryRunParam = url.searchParams.get("dryRun") === "true";

    console.log(`[Fee Splitter] GET request - isCron: ${isCronRequest}, execute: ${executeParam}, dryRun: ${dryRunParam}`);

    // If it's a cron request, execute the distribution
    if (isCronRequest) {
      console.log(`[Fee Splitter] Cron triggered distribution`);
      const result = await executeDistribution(false);
      return NextResponse.json(result);
    }

    // If execute param is set (for testing), run with dryRun option
    if (executeParam) {
      console.log(`[Fee Splitter] Manual execute triggered`);
      const result = await executeDistribution(dryRunParam);
      return NextResponse.json(result);
    }

    // Otherwise just return status
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
      hint: "Add ?execute=true&dryRun=true to test, or ?execute=true to run (requires auth)",
    });
  } catch (error: any) {
    console.error("[Fee Splitter] GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST endpoint - for manual API calls
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log(`[Fee Splitter] Unauthorized POST request`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    console.log(`[Fee Splitter] POST request - dryRun: ${dryRun}`);

    const result = await executeDistribution(dryRun);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Fee Splitter] POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}