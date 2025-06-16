// File: app/api/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import * as hl from "hyperliquid-sdk";

export async function GET(req: NextRequest) {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!privateKey) {
    // This isn't a critical error for the frontend, so we just return a default state
    return NextResponse.json({ error: "Backend wallet not configured." }, { status: 500 });
  }

  try {
    const wallet = new ethers.Wallet(privateKey);
    const info = new Info("mainnet", false);

    // Fetch user state which contains position information
    const userState = await info.userState(wallet.address);
    const btcPosition = userState.assetPositions.find(p => p.position.coin === "BTC");
    const positionSize = btcPosition ? parseFloat(btcPosition.position.szi) : 0;
    const entryPrice = btcPosition ? parseFloat(btcPosition.position.entryPx) : 0;

    // In a real-world scenario, you would also fetch last signal/logs from a DB
    // For now, we'll send back the live position data.
    const botStatus = {
      isActive: true, // You can build logic to change this
      position: {
        size: positionSize,
        entryPrice: entryPrice
      },
      lastSignal: "Checking...", // Placeholder
    };

    return NextResponse.json(botStatus);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Failed to fetch status:", errorMessage);
    return NextResponse.json({ error: "Failed to fetch bot status." }, { status: 500 });
  }
}
