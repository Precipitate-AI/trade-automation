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
    // Set leverage if provided
    if (leverage) {
      console.log(`Setting leverage for ${coin} to ${leverage}x`);
      await sdk.exchange.updateLeverage(coin, LeverageModeEnum.CROSS, parseInt(leverage));
    }

    const orderRequest: any = {
      coin: coin,
      is_buy: isBuy,
      sz: size,
    
      limit_px: limitPx,
      order_type: {},
      reduce_only: reduceOnly,
    };

    if (orderType === 'market') {
      orderRequest.order_type.market = { tif: "Ioc" };
    } else if (orderType === 'limit') {
      orderRequest.order_type.limit = { tif: "Gtc" }; // Good-Till-Cancelled for limit orders
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
