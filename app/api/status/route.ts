// File: app/api/status/route.ts
// --- FINAL FIX using require() ---

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
// FIX: Use require() for maximum compatibility with CommonJS modules.
const hl = require('hyperliquid-sdk');

export async function GET(req: NextRequest) {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "Backend wallet not configured." }, { status: 500 });
  }

  try {
    const wallet = new ethers.Wallet(privateKey);
    // FIX: Access the Info class directly on the required module.
    const info = new hl.Info("mainnet", false);

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
