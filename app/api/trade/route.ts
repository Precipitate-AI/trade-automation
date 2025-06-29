// File: app/api/trade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { EMA } from "technicalindicators";
import { Hyperliquid, LeverageModeEnum } from 'hyperliquid-sdk';

// --- STRATEGY CONFIGURATION ---
const ASSET = "BTC-PERP";
const LEVERAGE = 5;
const ORDER_SIZE_USD = 100;
const EMA_PERIOD = 5;
const ANCHOR_DATE_STRING = "2024-06-20T00:00:00Z";
const ANCHOR_TIMESTAMP = Date.parse(ANCHOR_DATE_STRING);

type SyntheticCandle = { t: number; o: number; h: number; l: number; c: number; };

function createSynthetic5DCandles(dailyKlines: any[]): SyntheticCandle[] {
  const syntheticCandles: SyntheticCandle[] = [];
  for (let i = 0; i < dailyKlines.length; i += 5) {
    const chunk = dailyKlines.slice(i, i + 5);
    if (chunk.length === 5) {
      syntheticCandles.push({
        t: chunk[0].t,
        o: parseFloat(chunk[0].o),
        h: Math.max(...chunk.map((k: any) => parseFloat(k.h))),
        l: Math.min(...chunk.map((k: any) => parseFloat(k.l))),
        c: parseFloat(chunk[4].c),
      });
    }
  }
  return syntheticCandles;
}

export async function POST(req: NextRequest) {
  try {
    const now = new Date();
    const daysSinceAnchor = Math.floor((now.getTime() - ANCHOR_TIMESTAMP) / (1000 * 60 * 60 * 24));
    
    if (daysSinceAnchor % 5 !== 4) {
       console.log(`Not an execution day. Day ${daysSinceAnchor % 5 + 1}/5 in cycle. Exiting.`);
       return NextResponse.json({ success: true, message: "Not an execution day." });
    }

    console.log("✅ Execution Day! Running 5-Day EMA strategy...");

    const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Server configuration error: Private key not found.");
    }
    
    const wallet = new ethers.Wallet(privateKey);
    const sdk = new Hyperliquid(wallet);
    
    console.log(`Fetching daily ('1D') kline data for ${ASSET}...`);
    const startTime = Date.now() - (300 * 24 * 60 * 60 * 1000);
    const dailyKlines = await sdk.info.getCandleSnapshot(ASSET, "1D", startTime, Date.now());
    const syntheticCandles = createSynthetic5DCandles(dailyKlines);
    
    if (syntheticCandles.length < EMA_PERIOD + 2) {
      throw new Error("Not enough data for EMA calculation.");
    }
    
    const closingPrices = syntheticCandles.map((c: any) => c.c);
    const emaValues = EMA.calculate({ period: EMA_PERIOD, values: closingPrices });
    
    const lastClosePrice = syntheticCandles[syntheticCandles.length - 2].c;
    const lastEmaValue = emaValues[emaValues.length - 2];

    console.log(`Last 5-Day Close: ${lastClosePrice}, EMA: ${lastEmaValue}`);

    const userState = await sdk.info.perpetuals.getClearinghouseState(wallet.address);
    const position = userState.assetPositions.find((p: any) => p.position.coin === ASSET);
    const currentPositionSize = position ? parseFloat(position.position.szi) : 0;
    
    await sdk.exchange.updateLeverage(ASSET, LeverageModeEnum.CROSS, LEVERAGE as any);

    const allMids = await sdk.info.getAllMids();
    const assetPrice = parseFloat(allMids[ASSET]);
    const orderSizeInAsset = ORDER_SIZE_USD / assetPrice;

    let orderRequest: any;

    if (lastClosePrice > lastEmaValue && currentPositionSize === 0) {
      console.log("ENTRY SIGNAL: Placing Market Buy order.");
      orderRequest = { coin: ASSET, is_buy: true, sz: parseFloat(orderSizeInAsset.toPrecision(4)), limit_px: '0', order_type: { "market": { "tif": "Ioc" } }, reduce_only: false };
      await sdk.exchange.placeOrder(orderRequest); 

    } else if (lastClosePrice < lastEmaValue && currentPositionSize > 0) {
      console.log("EXIT SIGNAL: Closing long position.");
      orderRequest = { coin: ASSET, is_buy: false, sz: Math.abs(currentPositionSize), limit_px: '0', order_type: { "market": { "tif": "Ioc" } }, reduce_only: true };
      await sdk.exchange.placeOrder(orderRequest);
      
    } else {
      console.log("... NO SIGNAL: Conditions not met.");
    }

    return NextResponse.json({ success: true, message: "Strategy executed successfully." });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("Strategy execution failed:", errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
