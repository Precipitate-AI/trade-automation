// File: app/api/manual-trade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { Hyperliquid, LeverageModeEnum } from 'hyperliquid-sdk';

export async function POST(req: NextRequest) {
  try {
    const { coin, isBuy, size, limitPx = '0', orderType = 'market', reduceOnly = false, leverage } = await req.json();

    if (!coin || typeof isBuy !== 'boolean' || !size) {
      return NextResponse.json({ error: "Missing required trade parameters: coin, isBuy, size." }, { status: 400 });
    }

    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Server configuration error: Private key not found.");
    }

    const wallet = new ethers.Wallet(privateKey);
    const sdk = new Hyperliquid(wallet);

    // Log all available assets
    const allAssets = await sdk.custom.getAllAssets();
    console.log("All available assets:", allAssets);
    // Get current price
    const mids = await sdk.info.getAllMids();
    const currentPrice = +mids[coin];
    console.log(`Current ${coin} price: ${currentPrice}`);

    // Get current position to determine if closing
    const state = await sdk.info.perpetuals.getClearinghouseState(wallet.address);
    const posObj = state.assetPositions.find((p: any) => p.position.coin === coin);
    const currentPosition = posObj ? +posObj.position.szi : 0;
    console.log(`Current ${coin} position: ${currentPosition}`);

    // If this is a sell and we have a position, close the entire position
    if (!isBuy && currentPosition > 0) {
      console.log(`Closing entire position of ${currentPosition} ${coin}`);
      size = Math.abs(currentPosition); // Override size with full position
    }

    // Set leverage if provided
    if (leverage) {
      console.log(`Setting leverage for ${coin} to ${leverage}x`);
      await sdk.exchange.updateLeverage(coin, LeverageModeEnum.CROSS, parseInt(leverage));
    }

    const orderRequest: any = {
      coin: coin,
      is_buy: isBuy,
      sz: +size, // Coerce to number
    
      limit_px: +limitPx, // Coerce to number
      order_type: {},
      reduce_only: !isBuy && currentPosition > 0 ? true : reduceOnly, // Auto reduce-only for position closing
    };

    if (orderType === 'market') {
      orderRequest.order_type = { limit: { tif: "Ioc" } }; // Market-like using IOC limit
      // Use price within 5% of current market for immediate fill
      orderRequest.limit_px = isBuy ? Math.round(currentPrice * 1.05) : Math.round(currentPrice * 0.95);
    } else if (orderType === 'limit') {
      orderRequest.order_type = { limit: { tif: "Gtc" } }; // Good-Till-Cancelled for limit orders
    } else {
      return NextResponse.json({ error: "Invalid orderType. Must be 'market' or 'limit'." }, { status: 400 });
    }

    console.log(`Placing order: ${JSON.stringify(orderRequest)}`);
    const result = await sdk.exchange.placeOrder(orderRequest);
    console.log("Order result:", result);

    if (result.status === 'ok') {
      return NextResponse.json({ success: true, message: "Trade executed successfully.", result });
    } else {
      return NextResponse.json({ success: false, error: result.response, result }, { status: 500 });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Manual trade failed:", errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
