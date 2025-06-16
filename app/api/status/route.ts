// File: app/api/status/route.ts
// --- FINAL WORKING VERSION ---

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

export async function GET(req: NextRequest) {
  try {
    // The module is a flat object with all exports as properties.
    const hl = await import('hyperliquid-sdk');

    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Backend wallet not configured.");
    }

    const wallet = new ethers.Wallet(privateKey);
    
    // CORRECT ACCESS: The Info class is a direct property of the module.
    const Info = hl.Info;
    const info = new Info("mainnet", false);

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
