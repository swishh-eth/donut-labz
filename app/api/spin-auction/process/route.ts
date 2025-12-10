// app/api/spin-auction/process/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const SPIN_AUCTION_ADDRESS = "0x3f22C2258365a97FB319d23e053faB6f76d5F1b4";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});

/**
 * POST /api/spin-auction/process
 * Called by frontend after a successful buySpin transaction
 * Verifies the transaction and credits the spin
 */
export async function POST(request: NextRequest) {
  console.log("=== Processing spin purchase ===");

  try {
    const body = await request.json();
    const { txHash, address } = body;

    console.log("Request:", { txHash, address });

    if (!txHash || !address) {
      return NextResponse.json(
        { error: "Missing txHash or address" },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Check if we've already processed this transaction
    const { data: existingPurchase } = await supabase
      .from("spin_purchases")
      .select("id")
      .eq("tx_hash", txHash)
      .single();

    if (existingPurchase) {
      console.log("Already processed tx:", txHash);
      return NextResponse.json({
        success: true,
        message: "Already processed",
      });
    }

    // Get transaction receipt
    console.log("Fetching transaction receipt...");
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    console.log("Receipt status:", receipt.status);

    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "Transaction failed" },
        { status: 400 }
      );
    }

    // Verify transaction was to the SpinAuction contract
    if (receipt.to?.toLowerCase() !== SPIN_AUCTION_ADDRESS.toLowerCase()) {
      console.log("Wrong contract:", receipt.to);
      return NextResponse.json(
        { error: "Invalid transaction target" },
        { status: 400 }
      );
    }

    // Find SpinPurchased event in logs
    let purchaseEvent = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === SPIN_AUCTION_ADDRESS.toLowerCase()) {
        try {
          if (log.topics[1]) {
            const buyer = "0x" + log.topics[1].slice(26);
            const data = log.data.slice(2);
            const price = BigInt("0x" + data.slice(0, 64));
            const wheelAmount = BigInt("0x" + data.slice(64, 128));
            const donutLabsAmount = BigInt("0x" + data.slice(128, 192));
            const leaderboardAmount = BigInt("0x" + data.slice(192, 256));
            const timestamp = BigInt("0x" + data.slice(256, 320));
            const purchaseId = BigInt("0x" + data.slice(320, 384));

            purchaseEvent = {
              buyer: buyer.toLowerCase(),
              price: Number(price) / 1e18,
              wheelAmount: Number(wheelAmount) / 1e18,
              donutLabsAmount: Number(donutLabsAmount) / 1e18,
              leaderboardAmount: Number(leaderboardAmount) / 1e18,
              timestamp: Number(timestamp),
              purchaseId: Number(purchaseId),
            };
            console.log("Parsed purchase event:", purchaseEvent);
            break;
          }
        } catch (e) {
          console.error("Failed to parse log:", e);
        }
      }
    }

    if (!purchaseEvent) {
      console.log("No SpinPurchased event found");
      return NextResponse.json(
        { error: "SpinPurchased event not found in transaction" },
        { status: 400 }
      );
    }

    // Verify the buyer matches the claimed address
    if (purchaseEvent.buyer !== normalizedAddress) {
      console.log("Address mismatch:", purchaseEvent.buyer, "vs", normalizedAddress);
      return NextResponse.json(
        { error: "Address mismatch" },
        { status: 400 }
      );
    }

    // Record the purchase first (prevents double-processing)
    const { error: purchaseError } = await supabase
      .from("spin_purchases")
      .insert({
        tx_hash: txHash,
        address: normalizedAddress,
        price: purchaseEvent.price,
        wheel_amount: purchaseEvent.wheelAmount,
        donut_labs_amount: purchaseEvent.donutLabsAmount,
        leaderboard_amount: purchaseEvent.leaderboardAmount,
        purchase_id: purchaseEvent.purchaseId,
        created_at: new Date().toISOString(),
      });

    if (purchaseError) {
      // If duplicate key, already processed
      if (purchaseError.code === "23505") {
        console.log("Duplicate tx, already processed");
        return NextResponse.json({
          success: true,
          message: "Already processed",
        });
      }
      console.error("Failed to record purchase:", purchaseError);
      // Continue anyway - still want to credit spin
    }

    // Credit the spin to the user
    console.log("Crediting spin to:", normalizedAddress);

    const { data: existingUser } = await supabase
      .from("user_spins")
      .select("total_spins")
      .eq("address", normalizedAddress)
      .single();

    if (existingUser) {
      const { error: updateError } = await supabase
        .from("user_spins")
        .update({
          total_spins: existingUser.total_spins + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("address", normalizedAddress);

      if (updateError) {
        console.error("Failed to update spins:", updateError);
        return NextResponse.json(
          { error: "Failed to credit spin" },
          { status: 500 }
        );
      }
      console.log("Updated spins to:", existingUser.total_spins + 1);
    } else {
      const { error: insertError } = await supabase
        .from("user_spins")
        .insert({
          address: normalizedAddress,
          total_spins: 1,
          spins_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Failed to insert spins:", insertError);
        return NextResponse.json(
          { error: "Failed to credit spin" },
          { status: 500 }
        );
      }
      console.log("Created new user with 1 spin");
    }

    // Get new spin count
    const { data: newSpinData } = await supabase
      .from("user_spins")
      .select("total_spins, spins_used")
      .eq("address", normalizedAddress)
      .single();

    const availableSpins =
      (newSpinData?.total_spins || 1) - (newSpinData?.spins_used || 0);

    console.log("Success! Available spins:", availableSpins);

    return NextResponse.json({
      success: true,
      message: "Spin credited successfully",
      purchaseId: purchaseEvent.purchaseId,
      newSpinCount: availableSpins,
      price: purchaseEvent.price,
    });
  } catch (error: any) {
    console.error("Failed to process spin purchase:", error);
    return NextResponse.json(
      { error: "Failed to process purchase", details: error.message },
      { status: 500 }
    );
  }
}