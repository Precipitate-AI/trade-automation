import { NextResponse } from "next/server"
import { aggregateToFiveDayCandles, calculateEMA, type DailyCandle } from "@/lib/utils"
import { Info, Exchange, Wallet, type OrderRequest } from "hyperliquid-sdk" // Actual SDK import

// --- Configuration ---
const ANCHOR_DATE_STRING = "2024-06-20T00:00:00Z"
const EMA_PERIOD = 5
const BTC_ASSET_NAME = "BTC" // For Hyperliquid, typically just the asset name like "BTC" or "ETH" for perps
const LEVERAGE = 5 // 5x
const ORDER_USD_VALUE = 100 // $100
const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz" // Mainnet API URL
// const HYPERLIQUID_API_URL = "https://api.hyperliquid-testnet.xyz"; // Testnet API URL - uncomment to use testnet

export async function GET(request: Request) {
  console.log("Trade API called at:", new Date().toISOString())

  const hyperliquidPrivateKey = process.env.HYPERLIQUID_PRIVATE_KEY
  if (!hyperliquidPrivateKey) {
    console.error("HYPERLIQUID_PRIVATE_KEY environment variable not set.")
    return NextResponse.json({ error: "Server configuration error: Missing private key." }, { status: 500 })
  }

  const wallet = new Wallet(hyperliquidPrivateKey)
  const info = new Info(null, HYPERLIQUID_API_URL)
  const exchange = new Exchange(wallet, HYPERLIQUID_API_URL)

  // 1. Timeframe Logic
  const anchorTimestamp = new Date(ANCHOR_DATE_STRING).getTime()
  const currentUtcDate = new Date()
  currentUtcDate.setUTCHours(0, 0, 0, 0) // Normalize to start of current UTC day
  const currentTimestamp = currentUtcDate.getTime()

  const daysElapsed = Math.floor((currentTimestamp - anchorTimestamp) / (1000 * 60 * 60 * 24))

  if (!((daysElapsed + 1) % 5 === 0 && daysElapsed >= 4)) {
    const logMsg = `Not an execution day. Days elapsed since anchor: ${daysElapsed}. Today is day ${(daysElapsed % 5) + 1} of the current 5-day cycle.`
    console.log(logMsg)
    return NextResponse.json({ message: logMsg, status: "no_action_not_execution_day" })
  }
  console.log(`Execution day: ${currentUtcDate.toISOString()}. Days elapsed: ${daysElapsed}.`)

  try {
    // 2. Fetch Daily Candles
    const endTime = currentTimestamp // Candles up to the end of *yesterday* UTC
    const startTime = endTime - 300 * 24 * 60 * 60 * 1000 // Approx 300 days ago

    const rawCandles = await info.candlesSnapshot(BTC_ASSET_NAME, "1d", startTime, endTime)
    const dailyCandles: DailyCandle[] = rawCandles.map((sdkCandle: any) => ({
      timestamp: sdkCandle.t,
      open: Number.parseFloat(sdkCandle.o),
      high: Number.parseFloat(sdkCandle.h),
      low: Number.parseFloat(sdkCandle.l),
      close: Number.parseFloat(sdkCandle.c),
    }))

    if (dailyCandles.length < EMA_PERIOD * 5) {
      const errorMsg = `Not enough daily candle data. Fetched: ${dailyCandles.length}, Required for EMA: ${EMA_PERIOD * 5}`
      console.error(errorMsg)
      return NextResponse.json({ error: errorMsg, status: "error_insufficient_data" }, { status: 500 })
    }
    console.log(`Fetched ${dailyCandles.length} daily candles for ${BTC_ASSET_NAME}.`)

    // 3. Aggregate to 5-Day Candles
    const syntheticCandles = aggregateToFiveDayCandles(dailyCandles)
    if (syntheticCandles.length < EMA_PERIOD) {
      const errorMsg = `Not enough synthetic 5-day candles for EMA. Generated: ${syntheticCandles.length}, Required: ${EMA_PERIOD}`
      console.error(errorMsg)
      return NextResponse.json({ error: errorMsg, status: "error_insufficient_synthetic_data" }, { status: 500 })
    }
    console.log(`Aggregated into ${syntheticCandles.length} synthetic 5-day candles.`)

    // 4. Calculate 5-period EMA
    const closes = syntheticCandles.map((c) => c.close)
    const emas = calculateEMA(closes, EMA_PERIOD)
    const lastSyntheticCandle = syntheticCandles[syntheticCandles.length - 1]
    const currentEma = emas[emas.length - 1]

    console.log(
      `Last 5-Day Candle Close: ${lastSyntheticCandle.close} at ${new Date(lastSyntheticCandle.timestamp).toISOString()}`,
    )
    console.log(`Corresponding 5-period EMA: ${currentEma}`)

    // 5. Get Current Position & Set Leverage
    const userAddress = wallet.address
    await exchange.updateLeverage(LEVERAGE, BTC_ASSET_NAME, false) // isCross = false
    console.log(`Leverage for ${BTC_ASSET_NAME} set to ${LEVERAGE}x.`)

    const userState = await info.userState(userAddress)
    const btcAssetPosition = userState.assetPositions.find((p: any) => p.position.coin === BTC_ASSET_NAME)
    const currentPositionBTCSize = btcAssetPosition ? Number.parseFloat(btcAssetPosition.position.szi) : 0
    const currentPositionSide =
      btcAssetPosition && currentPositionBTCSize !== 0 ? btcAssetPosition.position.side.toUpperCase() : null // 'B' or 'S'

    console.log(`Current BTC Position: ${currentPositionBTCSize} BTC. Side: ${currentPositionSide || "None"}`)

    // 6. Trading Strategy Logic
    let actionTaken = "hold"
    let orderDetails = {}

    const allMarkPrices = await info.markPrices()
    const currentBtcPrice = Number.parseFloat(allMarkPrices[BTC_ASSET_NAME])

    if (!currentBtcPrice || currentBtcPrice <= 0) {
      throw new Error("Could not fetch valid BTC mark price for order sizing.")
    }

    if (lastSyntheticCandle.close > currentEma) {
      // Potential BUY signal
      if (currentPositionBTCSize === 0 || (currentPositionSide === "S" && currentPositionBTCSize !== 0)) {
        const btcSizeToBuy = ORDER_USD_VALUE / currentBtcPrice
        console.log(`BUY Signal: Close (${lastSyntheticCandle.close}) > EMA (${currentEma}).`)
        console.log(`Attempting to BUY ${btcSizeToBuy.toFixed(8)} BTC ($${ORDER_USD_VALUE} at $${currentBtcPrice}/BTC)`)

        const orderRequest: OrderRequest = {
          coin: BTC_ASSET_NAME,
          is_buy: true,
          sz: btcSizeToBuy,
          limit_px: currentBtcPrice.toString(), // For market, can be current price or slightly worse
          order_type: { Market: {} },
          reduce_only: false,
        }
        const result = await exchange.order(orderRequest, wallet.address)
        console.log("BUY Order Result:", result)
        actionTaken = "buy_executed"
        orderDetails = { side: "BUY", size: btcSizeToBuy, price: currentBtcPrice, result }
      } else {
        console.log(
          `HOLD Signal: Close (${lastSyntheticCandle.close}) > EMA (${currentEma}), but already in a long position.`,
        )
        actionTaken = "hold_already_long"
      }
    } else if (lastSyntheticCandle.close < currentEma) {
      // Potential SELL signal
      if (currentPositionBTCSize !== 0 && currentPositionSide === "B") {
        console.log(
          `SELL Signal: Close (${lastSyntheticCandle.close}) < EMA (${currentEma}). Existing long position found.`,
        )
        console.log(`Attempting to SELL ${Math.abs(currentPositionBTCSize)} BTC (reduce-only)`)

        const orderRequest: OrderRequest = {
          coin: BTC_ASSET_NAME,
          is_buy: false,
          sz: Math.abs(currentPositionBTCSize), // Ensure positive size
          limit_px: currentBtcPrice.toString(), // For market, can be current price or slightly better
          order_type: { Market: {} },
          reduce_only: true,
        }
        const result = await exchange.order(orderRequest, wallet.address)
        console.log("SELL Order Result:", result)
        actionTaken = "sell_executed"
        orderDetails = { side: "SELL", size: Math.abs(currentPositionBTCSize), result }
      } else {
        console.log(
          `HOLD Signal: Close (${lastSyntheticCandle.close}) < EMA (${currentEma}), but no existing long position to sell or is short.`,
        )
        actionTaken = "hold_not_long"
      }
    } else {
      console.log(`HOLD Signal: Close (${lastSyntheticCandle.close}) == EMA (${currentEma}). No action.`)
      actionTaken = "hold_close_equals_ema"
    }

    return NextResponse.json({
      message: "Trade logic executed.",
      status: "success",
      action: actionTaken,
      data: {
        lastCandleClose: lastSyntheticCandle.close,
        currentEma: currentEma,
        currentPositionBTC: currentPositionBTCSize,
        currentPositionSide: currentPositionSide,
        currentBtcPrice: currentBtcPrice,
      },
      orderDetails,
    })
  } catch (error: any) {
    console.error("Error during trade logic execution:", error)
    const errorMessage = error.message || "An unknown error occurred."
    const errorDetails = error.response?.data || error.stack // Include more details if available
    return NextResponse.json(
      {
        error: "Trade logic execution failed.",
        details: errorMessage,
        sdkError: errorDetails,
        status: "error_execution_failed",
      },
      { status: 500 },
    )
  }
}
