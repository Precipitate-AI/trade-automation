import { NextResponse } from "next/server"
import { aggregateToFiveDayCandles, calculateEMA, type DailyCandle } from "@/lib/utils"
// import { Info, Exchange, Wallet } from 'hyperliquid-sdk'; // Actual SDK import

// --- Configuration ---
const ANCHOR_DATE_STRING = "2024-06-20T00:00:00Z"
const EMA_PERIOD = 5
const BTC_ASSET_NAME = "BTC-PERP" // Or whatever the SDK expects for BTC Perpetual
const LEVERAGE = 5 // 5x
const ORDER_USD_VALUE = 100 // $100

// --- Mock Hyperliquid SDK ---
// Replace these with actual SDK calls
const mockSdk = {
  exchange: {
    marketData: {
      getCandleHistory: async (
        asset: string,
        interval: string,
        startTime: number,
        endTime: number,
      ): Promise<DailyCandle[]> => {
        console.log(
          `[MockSDK] Fetching ${interval} candles for ${asset} from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`,
        )
        // Simulate fetching ~300 daily candles. For simplicity, generate some random data.
        const candles: DailyCandle[] = []
        let currentTimestamp = startTime
        const oneDayMs = 24 * 60 * 60 * 1000
        const numCandles = Math.min(300, Math.floor((endTime - startTime) / oneDayMs))

        for (let i = 0; i < numCandles; i++) {
          const open = 70000 + Math.random() * 1000 - 500
          const close = open + Math.random() * 200 - 100
          const high = Math.max(open, close) + Math.random() * 100
          const low = Math.min(open, close) - Math.random() * 100
          candles.push({ timestamp: currentTimestamp, open, high, low, close })
          currentTimestamp += oneDayMs
        }
        return candles.sort((a, b) => a.timestamp - b.timestamp) // Ensure sorted
      },
    },
    actions: {
      updateLeverage: async (asset: string, leverage: number, isCross: boolean) => {
        console.log(`[MockSDK] Setting leverage for ${asset} to ${leverage}x (isCross: ${isCross})`)
        return { status: "ok" }
      },
      order: async (asset: string, isBuy: boolean, size: number, limitPrice: number | null, reduceOnly: boolean) => {
        console.log(
          `[MockSDK] Placing ${isBuy ? "BUY" : "SELL"} order for ${asset}, size: ${size}, reduceOnly: ${reduceOnly}`,
        )
        return { status: "ok", orderId: `mockOrder_${Date.now()}` }
      },
    },
    info: {
      userState: async (walletAddress: string) => {
        console.log(`[MockSDK] Fetching user state for ${walletAddress}`)
        // Simulate no position or an existing position
        // return { assetPositions: [] }; // No position
        return { assetPositions: [{ asset: BTC_ASSET_NAME, position: { entryPx: "69000", szi: "0.0014", side: "B" } }] } // Example long position
      },
      getMarkPrice: async (asset: string) => {
        console.log(`[MockSDK] Fetching mark price for ${asset}`)
        return 70000 + Math.random() * 100 // Simulate current price
      },
    },
  },
  // wallet: new Wallet(process.env.HYPERLIQUID_PRIVATE_KEY), // Actual wallet initialization
}
// --- End Mock SDK ---

export async function GET(request: Request) {
  console.log("Trade API called at:", new Date().toISOString())

  const hyperliquidPrivateKey = process.env.HYPERLIQUID_PRIVATE_KEY
  if (!hyperliquidPrivateKey) {
    console.error("HYPERLIQUID_PRIVATE_KEY environment variable not set.")
    return NextResponse.json({ error: "Server configuration error: Missing private key." }, { status: 500 })
  }
  // const wallet = new Wallet(hyperliquidPrivateKey); // Actual SDK
  // const info = new Info(null, wallet.address); // Actual SDK
  // const exchange = new Exchange(wallet, info); // Actual SDK
  const { exchange /* wallet */ } = mockSdk // Using mock

  // 1. Timeframe Logic
  const anchorTimestamp = new Date(ANCHOR_DATE_STRING).getTime()
  const currentUtcDate = new Date()
  currentUtcDate.setUTCHours(0, 0, 0, 0) // Normalize to start of current UTC day
  const currentTimestamp = currentUtcDate.getTime()

  const daysElapsed = Math.floor((currentTimestamp - anchorTimestamp) / (1000 * 60 * 60 * 24))

  if (!((daysElapsed + 1) % 5 === 0 && daysElapsed >= 4)) {
    // daysElapsed >=4 ensures we are past the first 5-day period
    const logMsg = `Not an execution day. Days elapsed since anchor: ${daysElapsed}. Today is day ${(daysElapsed % 5) + 1} of the current 5-day cycle.`
    console.log(logMsg)
    return NextResponse.json({ message: logMsg, status: "no_action_not_execution_day" })
  }
  console.log(`Execution day: ${currentUtcDate.toISOString()}. Days elapsed: ${daysElapsed}.`)

  try {
    // 2. Fetch Daily Candles (approx 300, ending yesterday UTC)
    const endTime = currentTimestamp // Candles up to the end of *yesterday* UTC to form the completed 5-day candle
    const startTime = endTime - 300 * 24 * 60 * 60 * 1000 // Approx 300 days ago

    const dailyCandles = await exchange.marketData.getCandleHistory(BTC_ASSET_NAME, "1D", startTime, endTime)
    if (dailyCandles.length < EMA_PERIOD * 5) {
      // Need enough data for EMA_PERIOD synthetic candles
      const errorMsg = `Not enough daily candle data to proceed. Fetched: ${dailyCandles.length}, Required for EMA: ${EMA_PERIOD * 5}`
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
    const emas = calculateEMA(closes, EMA_PERIOD) // EMAs correspond to candles from index EMA_PERIOD-1 onwards

    // Align EMAs with their respective candles. The first EMA corresponds to syntheticCandles[EMA_PERIOD-1]
    // So, the last EMA corresponds to the last synthetic candle.
    const lastSyntheticCandle = syntheticCandles[syntheticCandles.length - 1]
    const currentEma = emas[emas.length - 1] // EMA for the most recently completed 5-Day candle

    console.log(
      `Last 5-Day Candle Close: ${lastSyntheticCandle.close} at ${new Date(lastSyntheticCandle.timestamp).toISOString()}`,
    )
    console.log(`Corresponding 5-period EMA: ${currentEma}`)

    // 5. Get Current Position & Set Leverage
    // const userAddress = wallet.address; // Actual SDK
    const userAddress = "0xMockAddress" // Mock
    await exchange.actions.updateLeverage(BTC_ASSET_NAME, LEVERAGE, false) // Assuming not cross-margin
    console.log(`Leverage for ${BTC_ASSET_NAME} set to ${LEVERAGE}x.`)

    const userState = await exchange.info.userState(userAddress)
    const btcPosition = userState.assetPositions.find(
      (p) => p.asset === BTC_ASSET_NAME && Number.parseFloat(p.position.szi) !== 0,
    )
    const currentPositionBTCSize = btcPosition ? Number.parseFloat(btcPosition.position.szi) : 0
    const currentPositionSide = btcPosition ? btcPosition.position.side : null // 'B' for Buy/Long, 'S' for Sell/Short

    console.log(`Current BTC Position: ${currentPositionBTCSize} BTC. Side: ${currentPositionSide || "None"}`)

    // 6. Trading Strategy Logic
    let actionTaken = "hold"
    let orderDetails = {}

    if (lastSyntheticCandle.close > currentEma) {
      // Potential BUY signal
      if (
        currentPositionBTCSize === 0 ||
        (currentPositionSide === "S" && currentPositionBTCSize > 0) /* if short, close and go long */
      ) {
        const currentBtcPrice = await exchange.info.getMarkPrice(BTC_ASSET_NAME)
        if (!currentBtcPrice || currentBtcPrice <= 0) {
          throw new Error("Could not fetch valid BTC price for order sizing.")
        }
        const btcSizeToBuy = ORDER_USD_VALUE / currentBtcPrice
        console.log(
          `BUY Signal: Close (${lastSyntheticCandle.close}) > EMA (${currentEma}). No existing long position or is short.`,
        )
        console.log(`Attempting to BUY ${btcSizeToBuy.toFixed(6)} BTC ($${ORDER_USD_VALUE} at $${currentBtcPrice}/BTC)`)
        // const result = await exchange.actions.order(BTC_ASSET_NAME, true, btcSizeToBuy, null, false); // Market BUY
        // console.log("BUY Order Result:", result);
        // actionTaken = "buy_executed";
        // orderDetails = { side: "BUY", size: btcSizeToBuy, price: currentBtcPrice, result };

        // Mocked execution
        actionTaken = "buy_signal_generated_mock"
        orderDetails = { side: "BUY", size: btcSizeToBuy, price: currentBtcPrice, mockOrderId: `mockBuy_${Date.now()}` }
        console.log("Mock BUY executed:", orderDetails)
      } else {
        console.log(
          `HOLD Signal: Close (${lastSyntheticCandle.close}) > EMA (${currentEma}), but already in a long position.`,
        )
        actionTaken = "hold_already_long"
      }
    } else if (lastSyntheticCandle.close < currentEma) {
      // Potential SELL signal
      if (currentPositionBTCSize > 0 && currentPositionSide === "B") {
        // Only sell if in a long position
        console.log(
          `SELL Signal: Close (${lastSyntheticCandle.close}) < EMA (${currentEma}). Existing long position found.`,
        )
        console.log(`Attempting to SELL ${currentPositionBTCSize} BTC (reduce-only)`)
        // const result = await exchange.actions.order(BTC_ASSET_NAME, false, currentPositionBTCSize, null, true); // Market SELL, reduce-only
        // console.log("SELL Order Result:", result);
        // actionTaken = "sell_executed";
        // orderDetails = { side: "SELL", size: currentPositionBTCSize, result };

        // Mocked execution
        actionTaken = "sell_signal_generated_mock"
        orderDetails = { side: "SELL", size: currentPositionBTCSize, mockOrderId: `mockSell_${Date.now()}` }
        console.log("Mock SELL executed:", orderDetails)
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
      },
      orderDetails,
    })
  } catch (error) {
    console.error("Error during trade logic execution:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."
    return NextResponse.json(
      { error: "Trade logic execution failed.", details: errorMessage, status: "error_execution_failed" },
      { status: 500 },
    )
  }
}
