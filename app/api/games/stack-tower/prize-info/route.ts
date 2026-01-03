// Place in: app/api/games/stack-tower/prize-info/route.ts

import { NextRequest, NextResponse } from "next/server";

// Weekly USDC prize pool for Glaze Stack
const WEEKLY_PRIZE_POOL = 5; // $5 USDC

// Prize distribution percentages (same as Donut Dash)
const PRIZE_PERCENTAGES = [40, 20, 15, 8, 5, 4, 3, 2, 2, 1];

function calculatePrizeStructure(totalPrize: number) {
  return PRIZE_PERCENTAGES.map((percent, i) => ({
    rank: i + 1,
    percent,
    amount: ((totalPrize * percent) / 100).toFixed(2),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const totalPrize = WEEKLY_PRIZE_POOL;
    const prizeStructure = calculatePrizeStructure(totalPrize);

    return NextResponse.json({
      success: true,
      totalPrize,
      prizeStructure,
      currency: "USDC",
    });
  } catch (error) {
    console.error("Prize info error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}