// File: app/api/status/route.ts
// --- FINAL, CORRECTED VERSION ---

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

export async function GET(req: NextRequest) {
  // Use dynamic import() to ensure this only runs on the server
  // and doesn't break the client-side build.
  const hl: any = await import('hyperliquid-sdk');

  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "Backend wallet not configured." }, { status: 500 });
  }

  try {
    const wallet = new ethers.Wallet(privateKey);
    
    // The access pattern from our logs is still correct:
    const Info = hl.Hyperliquid.Info;
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
    return NextResponse.json({ error: `Runtime error in /api/status: ${errorMessage}` }, { status: 500 });
  }
}
