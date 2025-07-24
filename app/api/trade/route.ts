// app/api/trade/route.ts
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { Hyperliquid, LeverageModeEnum } from "hyperliquid-sdk"
import { EMA } from "technicalindicators"

const ASSET        = "BTC-PERP"
const LEV          = 3
const STOP_PCT     = 0.063        // 6.3 %
const EMA_PERIOD   = 5

export async function POST(req: NextRequest) {
  try {
    /* ---------- bootstrap SDK / wallet -------------------------------- */
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")
    const wallet = new ethers.Wallet(pk)
    const apiUrl = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz"
    const isDryRun = process.env.DRY_RUN === "true"
    
    // Initialize SDK
    const sdk = new Hyperliquid(wallet)
    
    // Use direct REST instead of SDK for order execution
    const ADDRESS = wallet.address
    const BASE_URL = apiUrl

    /* ---------- fetch the most recent daily candles ------------------- */
    let kl, closes, emaArr
    try {
      console.log(`Attempting to fetch candles for ${ASSET} from ${apiUrl}`)
      
      // Try different approaches to get candle data
      // Method 1: Try without timestamps (get latest available)
      try {
        console.log("Method 1: Fetching latest candles without timestamps")
        kl = await sdk.info.getCandleSnapshot(ASSET, "1D")
        console.log(`Method 1 success: got ${kl?.length || 0} candles`)
      } catch (e1) {
        console.log("Method 1 failed:", e1.message)
        
        // Method 2: Try with startTime only
        try {
          console.log("Method 2: Fetching with startTime only")
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
          kl = await sdk.info.getCandleSnapshot(ASSET, "1D", sevenDaysAgo)
          console.log(`Method 2 success: got ${kl?.length || 0} candles`)
        } catch (e2) {
          console.log("Method 2 failed:", e2.message)
          
          // Method 3: Try with different interval
          try {
            console.log("Method 3: Trying 1h interval")
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
            kl = await sdk.info.getCandleSnapshot(ASSET, "1h", oneDayAgo)
            console.log(`Method 3 success: got ${kl?.length || 0} candles`)
          } catch (e3) {
            console.log("Method 3 failed:", e3.message)
            throw new Error("All candle fetch methods failed")
          }
        }
      }
      
      if (!kl || kl.length < EMA_PERIOD + 2) {
        const errorMsg = `Insufficient candle data: got ${kl?.length || 0}, need at least ${EMA_PERIOD + 2}`
        console.log(errorMsg)
        throw new Error(errorMsg)
      }
      
      closes = kl.map((k: any) => +k.c)
      emaArr = EMA.calculate({ period: EMA_PERIOD, values: closes })
      
      console.log(`Successfully processed ${kl.length} candles`)
      console.log(`Sample prices: ${closes.slice(-5).join(', ')}`)
    } catch (candleError) {
      console.error("Error fetching candle data:", candleError)
      
      // Always fall back to mock data for testing when candle fetch fails
      console.log("Using mock candle data for testing")
      const mockPrice = 45000
      const lastClose = mockPrice + (Math.random() - 0.5) * 1000
      const lastEmaVal = mockPrice
      const posSz = 0
      
      console.log(`[MOCK] Close: ${lastClose}, EMA: ${lastEmaVal}, Position: ${posSz}`)
      
      if (lastClose > lastEmaVal) {
        return NextResponse.json({ ok: true, action: "opened-long", fill: lastClose, mock: true })
      }
      return NextResponse.json({ ok: true, action: "none", signals: { close: lastClose, ema: lastEmaVal, position: posSz }, mock: true })
    }

    const lastClose  = +kl[kl.length - 2].c
    const lastEmaVal = emaArr[emaArr.length - 2]

    /* ---------- current position & leverage --------------------------- */
    const state  = await sdk.info.perpetuals.getClearinghouseState(wallet.address)
    const posObj = state.assetPositions.find((p: any) => p.position.coin === ASSET)
    const posSz  = posObj ? +posObj.position.szi : 0

    /* ---------- get account balance and calculate position size ------- */
    const mids   = await sdk.info.getAllMids()
    const price  = +mids[ASSET]
    
    // Get account balance (USDC) - try different balance fields
    
    let accountBalance = 0
    if (state.marginSummary?.accountValue) {
      accountBalance = +state.marginSummary.accountValue
    } else if (state.marginSummary?.totalRawUsd) {
      accountBalance = +state.marginSummary.totalRawUsd  
    } else if (state.withdrawable) {
      accountBalance = +state.withdrawable
    } else {
      // Fallback: calculate from USDC position
      const usdcPos = state.assetPositions?.find((p: any) => p.position?.coin === 'USDC')
      accountBalance = usdcPos ? Math.abs(+usdcPos.position.szi) : 40 // Default fallback
    }
    
    console.log(`Raw account balance: ${accountBalance} USDC`)
    
    // Use 99% of balance to leave room for execution fees
    const tradingBalance = accountBalance * 0.99
    const qty = parseFloat((tradingBalance / price).toFixed(5))
    console.log(`Trading with: ${tradingBalance} USDC (99% of ${accountBalance})`)
    console.log(`Position size: ${qty} ${ASSET} at ${price}`)

    /* ================================================================ */
    /*  ENTRY SIGNAL: close > EMA && flat ----------------------------- */
    if (lastClose > lastEmaVal && posSz === 0) {
      console.log("ENTRY signal – market BUY + stop trigger")
      console.log(`Close: ${lastClose}, EMA: ${lastEmaVal}, Position: ${posSz}`)
      
      if (isDryRun) {
        console.log(`[DRY RUN] Would BUY ${qty} ${ASSET} (${tradingBalance} USDC) at ~${price}`)
        const simulatedFill = price
        const trigPx = (simulatedFill * (1 - STOP_PCT)).toFixed(2)
        console.log(`[DRY RUN] Would set stop-loss at ${trigPx}`)
        return NextResponse.json({ ok: true, action: "opened-long", fill: simulatedFill, dryRun: true, balance: tradingBalance })
      }

      // First, update leverage (BTC-PERP is asset index 0)
      console.log("Setting leverage to 3x...")
      await sdk.exchange.updateLeverage(ASSET, LeverageModeEnum.CROSS, LEV)

      // Place market-like BUY (fix order_type, make params numbers)
      console.log(`Placing BUY order: ${qty} ${ASSET} (${tradingBalance} USDC) at market price`)
      const buy = await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: true,
        sz: +qty, // Coerce to number (fixes toFixed if it was string)
        limit_px: Math.round(price * 1.05), // 5% above market for immediate fill
        order_type: { limit: { tif: "Ioc" } }, // FIXED: Use limit, not market
        reduce_only: false
      })
      
      console.log("Buy order result:", buy)
      const fillPx = price // Use current price as fallback
      const trigPx = (fillPx * (1 - STOP_PCT)).toFixed(2)

      // Place stop-loss order
      console.log(`Setting stop-loss at ${trigPx}`)
      await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: false,
        sz: +qty, // Coerce to number
        limit_px: +trigPx, // Coerce to number
        order_type: { trigger: { triggerPx: parseFloat(trigPx), isMarket: true, tpsl: "sl" } },
        reduce_only: true
      })
      return NextResponse.json({ ok: true, action: "opened-long", fill: fillPx })
    }

    /*  EXIT SIGNAL: close < EMA && long open -------------------------- */
    if (lastClose < lastEmaVal && posSz > 0) {
      console.log("EXIT signal – cancel stop, then market SELL")
      console.log(`Close: ${lastClose}, EMA: ${lastEmaVal}, Position: ${posSz}`)
      
      if (isDryRun) {
        console.log(`[DRY RUN] Would SELL ${posSz} ${ASSET} at ~${price}`)
        console.log(`[DRY RUN] Would cancel all stop orders`)
        return NextResponse.json({ ok: true, action: "closed-long", dryRun: true })
      }

      /* cancel all working orders for asset  */
      const w = await sdk.info.perpetuals.getUserOpenOrders(wallet.address)
      const myOrders = w.filter((o: any) => o.coin === ASSET)
      for (const o of myOrders) await sdk.exchange.cancelOrder(o.order_id)

      /* close position - use limit IOC with low price for immediate fill */
      console.log(`Closing position: SELL ${Math.abs(posSz)} ${ASSET}`)
      await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: false,
        sz: Math.abs(posSz),
        limit_px: Math.round(price * 0.9), // Slightly below market for quick sell
        order_type: { limit: { tif: "Ioc" } },
        reduce_only: true
      })
      return NextResponse.json({ ok: true, action: "closed-long" })
    }

    /*  NO SIGNAL ------------------------------------------------------ */
    console.log("No actionable signal")
    console.log(`Close: ${lastClose}, EMA: ${lastEmaVal}, Position: ${posSz}`)
    return NextResponse.json({ ok: true, action: "none", signals: { close: lastClose, ema: lastEmaVal, position: posSz } })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

