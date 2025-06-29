// File: app/api/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { Hyperliquid } from 'hyperliquid-sdk';

export async function GET(req: NextRequest) {
  try {
    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Backend wallet not configured.");
    }

    const wallet = new ethers.Wallet(privateKey);
    const sdk = new Hyperliquid(wallet);

    const userState = await sdk.info.perpetuals.getClearinghouseState(wallet.address);
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
