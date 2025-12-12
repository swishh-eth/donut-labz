// app/api/sprinkles-claim/sign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encodePacked, keccak256, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The signer private key (same one used in contract)
const SIGNER_PRIVATE_KEY = process.env.SPRINKLES_CLAIM_SIGNER_KEY as `0x${string}`;
const SPRINKLES_CLAIM_ADDRESS = process.env.NEXT_PUBLIC_SPRINKLES_CLAIM_ADDRESS;
const CHAIN_ID = 8453; // Base mainnet

export async function POST(request: NextRequest) {
  try {
    const { address, amount, epoch } = await request.json();

    console.log("Claim sign request:", { address, amount, epoch });

    if (!address || amount === undefined || epoch === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!SIGNER_PRIVATE_KEY) {
      console.error("SPRINKLES_CLAIM_SIGNER_KEY not set");
      return NextResponse.json(
        { error: "Server not configured: missing signer key" },
        { status: 500 }
      );
    }

    if (!SPRINKLES_CLAIM_ADDRESS) {
      console.error("NEXT_PUBLIC_SPRINKLES_CLAIM_ADDRESS not set");
      return NextResponse.json(
        { error: "Server not configured: missing contract address" },
        { status: 500 }
      );
    }

    // Verify user has these points in database
    const { data: userData, error } = await supabase
      .from("chat_points")
      .select("total_points")
      .eq("address", address.toLowerCase())
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Database error: " + error.message },
        { status: 500 }
      );
    }

    if (!userData) {
      return NextResponse.json(
        { error: "User not found in leaderboard" },
        { status: 404 }
      );
    }

    // Verify the requested amount matches database (with small tolerance for rounding)
    const dbPoints = userData.total_points;
    console.log("DB points:", dbPoints, "Requested:", amount);
    
    if (Math.abs(dbPoints - amount) > 0.01) {
      return NextResponse.json(
        { error: `Amount mismatch: DB has ${dbPoints}, requested ${amount}` },
        { status: 400 }
      );
    }

    // Convert amount to wei
    const amountWei = parseUnits(amount.toString(), 18);

    // Create message hash matching contract
    // keccak256(abi.encodePacked(msg.sender, amount, currentEpoch, block.chainid, address(this)))
    const messageHash = keccak256(
      encodePacked(
        ["address", "uint256", "uint256", "uint256", "address"],
        [
          address as `0x${string}`,
          amountWei,
          BigInt(epoch),
          BigInt(CHAIN_ID),
          SPRINKLES_CLAIM_ADDRESS as `0x${string}`,
        ]
      )
    );

    console.log("Message hash:", messageHash);

    // Sign the message
    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
    console.log("Signer address:", account.address);
    
    const signature = await account.signMessage({
      message: { raw: messageHash },
    });

    console.log("Signature generated:", signature.slice(0, 20) + "...");

    return NextResponse.json({
      signature,
      amount: amountWei.toString(),
      epoch,
    });
  } catch (error: any) {
    console.error("Error signing claim:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sign claim" },
      { status: 500 }
    );
  }
}
