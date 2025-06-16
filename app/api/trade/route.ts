// File: app/api/trade/route.ts
// --- CORRECTED VERSION ---

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { EMA } from "technicalindicators";
// CORRECTED IMPORT: Import the entire library as `hl`
import * as hl from "hyperliquid-sdk";

// --- STRATEGY CONFIGURATION ---
const ASSET = "BTC";
const LEVERAGE = 5;
const ORDER_SIZE_USD = 100;
const EMA_PERIOD = 5;
const ANCHOR_DATE_STRING = "2024-06-20T00:00:00Z";
const ANCHOR_TIMESTAMP = Date.parse(ANCHOR_DATE_STRING);

// Corrected Types
type SyntheticCandle = { t: number; o: number; h: number; l: number; c: number; };

function createSynthetic5DCandles(dailyKlines: hl.Kline[]): SyntheticCandle[] {
  const syntheticCandles: SyntheticCandle[] = [];
  for (let i = 0; i < dailyKlines.length; i += 5) {
    const chunk = dailyKlines.slice(i, i + 5);
    if (chunk.length === 5) {
      syntheticCandles.push({
        t: chunk[0].t,
        o: parseFloat(chunk[0].o),
        h: Math.max(...chunk.map(k => parseFloat(k.h))),
        l: Math.min(...chunk.map(k => parseFloat(k.l))),
        c: parseFloat(chunk[4].c),
      });
    }
  }
  return syntheticCandles;
}

export async function POST(req: NextRequest) {
  const now = new Date();
  const daysSinceAnchor = Math.floor((now.getTime() - ANCHOR_TIMESTAMP) / (1000 * 60 * 60 * 24));
  
  if (daysSinceAnchor % 5 !== 4) {
    console.log(`Not an execution day. Day ${daysSinceAnchor} in cycle. Exiting.`);
    return NextResponse.json({ success: true, message: "Not an execution day." });
  }

  console.log("✅ Execution Day! Running 5-Day EMA strategy...");

  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Critical Error: Private key not found in .env.local");
    return NextResponse.json({ success: false, error: "Server configuration error." }, { status: 500 });
  }

  const wallet = new ethers.Wallet(privateKey);
  // CORRECTED USAGE
  const info = new hl.Info("mainnet", false);
  const exchange = new hl.Exchange(wallet, "mainnet");
  await exchange.connect();
  
  try {
    console.log(`Fetching daily ('1D') kline data for ${ASSET}...`);
    const startTime = Date.now() - (300 * 24 * 60 * 60 * 1000);
    const dailyKlines = await info.klines(ASSET, "1D", startTime);
    const syntheticCandles = createSynthetic5DCandles(dailyKlines);
    
    if (syntheticCandles.length < EMA_PERIOD + 2) {
      throw new Error("Not enough data to form synthetic candles for EMA calculation.");
    }
    
    const closingPrices = syntheticCandles.map(c => c.c);
    const emaValues = EMA.calculate({ period: EMA_PERIOD, values: closingPrices });
    
    const lastClosePrice = syntheticCandles[syntheticCandles.length - 2].c;
    const lastEmaValue = emaValues[emaValues.length - 2];

    console.log(`Last 5-Day Close: ${lastClosePrice}, EMA: ${lastEmaValue}`);

    const userState = await info.userState(wallet.address);
    const position = userState.assetPositions.find(p => p.position.coin === ASSET);
    const currentPositionSize = position ? parseFloat(position.position.szi) : 0;
    
    await exchange.updateLeverage(LEVERAGE, ASSET, true);

    const allMids = await info.allMids();
    const assetPrice = parseFloat(allMids[ASSET]);
    const orderSizeInAsset = ORDER_SIZE_USD / assetPrice;

    // CORRECTED USAGE
    let orderRequest: hl.OrderRequest;

    if (lastClosePrice > lastEmaValue && currentPositionSize === 0) {
      console.log("ENTRY SIGNAL: Placing Market Buy order.");
      orderRequest = { coin: ASSET, is_buy: true, sz: parseFloat(orderSizeInAsset.toPrecision(4)), limit_px: "0", order_type: { "market": { "tif": "Ioc" } }, reduce_only: false };
      await exchange.order(orderRequest);
      console.log("BUY order placed successfully.");
    } else if (lastClosePrice < lastEmaValue && currentPositionSize > 0) {
      console.log("EXIT SIGNAL: Closing long position.");
      orderRequest = { coin: ASSET, is_buy: false, sz: Math.abs(currentPositionSize), limit_px: "0", order_type: { "market": { "tif": "Ioc" } }, reduce_only: true };
      await exchange.order(orderRequest);
      console.log("SELL order placed successfully.");
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
