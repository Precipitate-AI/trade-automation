// File: app/api/status/route.ts
// --- THE CORRECT SDK USAGE ---

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

export async function GET(req: NextRequest) {
  try {
    // Import the SDK module
    const hl = await import('hyperliquid-sdk');

    // Get the main Hyperliquid class from the module
    const Hyperliquid = hl.Hyperliquid;

    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Backend wallet not configured.");
    }

    const wallet = new ethers.Wallet(privateKey);
    
    // THE CORRECT PATTERN:
    // 1. Instantiate the main Hyperliquid class. The constructor likely takes an options object.
    const sdk = new Hyperliquid({ wallet });

    // 2. Access the pre-configured .info client from the sdk instance.
    const info = sdk.info;

    // 3. Use the client.
    const userState = await info.userState(wallet.address);
    const btcPosition = userState.assetPositions.find((p: any) => p.position.coin === "BTC");
    const positionSize = btcPosition ? parseFloat(btcPosition.position.szi) : 0;
    const entryPrice = btcPosition ? parseFloat(btcPosition.position.entryPx) : 0;
    
    const botStatus = {
      isActive: true,
      position: {
        size: positionSize,
        entryPrice: entryPrice || 'N/A'
      },
      lastSignal: "Awaiting Run",
    };

    return NextResponse.json(botStatus);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Failed to fetch status:", errorMessage);
    return NextResponse.json({ error: `Failed to fetch status: ${errorMessage}` }, { status: 500 });
  }
}
