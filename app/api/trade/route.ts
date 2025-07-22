// app/api/trade/route.ts
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { Hyperliquid, LeverageModeEnum } from "hyperliquid-sdk"
import { EMA } from "technicalindicators"

const ASSET        = "BTC-PERP"
const LEV          = 3
const STOP_PCT     = 0.063        // 6.3 %
const EMA_PERIOD   = 5
const ORDER_USD    = 100

export async function POST(req: NextRequest) {
  try {
    /* ---------- bootstrap SDK / wallet -------------------------------- */
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")
    const wallet = new ethers.Wallet(pk)
    const sdk    = new Hyperliquid(wallet)

    /* ---------- fetch the most recent 200 daily candles --------------- */
    const msDay  = 24 * 60 * 60 * 1000
    const start  = Date.UTC(2024, 0, 1) // January 1, 2024 UTC
    const kl     = await sdk.info.getCandleSnapshot(ASSET, "1D", start, Date.now())
    if (kl.length < EMA_PERIOD + 2) throw new Error("not enough candles")
    const closes = kl.map((k: any) => +k.c)
    const emaArr = EMA.calculate({ period: EMA_PERIOD, values: closes })

    const lastClose  = +kl[kl.length - 2].c
    const lastEmaVal = emaArr[emaArr.length - 2]

    /* ---------- current position & leverage --------------------------- */
    const state  = await sdk.info.perpetuals.getClearinghouseState(wallet.address)
    const posObj = state.assetPositions.find((p: any) => p.position.coin === ASSET)
    const posSz  = posObj ? +posObj.position.szi : 0
    await sdk.exchange.updateLeverage(ASSET, LeverageModeEnum.CROSS, parseInt(LEV as any))

    /* ---------- helper ------------------------------------------------ */
    const mids   = await sdk.info.getAllMids()
    const price  = +mids[ASSET]
    const qty    = +(ORDER_USD / price).toPrecision(4)

    /* ================================================================ */
    /*  ENTRY SIGNAL: close > EMA && flat ----------------------------- */
    if (lastClose > lastEmaVal && posSz === 0) {
      console.log("ENTRY signal – market BUY + stop trigger")
      const buy = await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: true,
        sz: qty,
        limit_px: "0",
        order_type: { market: { tif: "Ioc" } },
        reduce_only: false
      })
      const fillPx = +buy.data.averagePx     // use fill to set stop
      const trigPx = (fillPx * (1 - STOP_PCT)).toFixed(2)

      await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: false,
        sz: qty,
        limit_px: "0",
        order_type: { trigger: { trig_px: trigPx, isMarket: true } },
        reduce_only: true
      })
      return NextResponse.json({ ok: true, action: "opened-long", fill: fillPx })
    }

    /*  EXIT SIGNAL: close < EMA && long open -------------------------- */
    if (lastClose < lastEmaVal && posSz > 0) {
      console.log("EXIT signal – cancel stop, then market SELL")
      /* cancel all working orders for asset  */
      const w = await sdk.info.getOpenOrders()
      const myOrders = w.filter((o: any) => o.coin === ASSET)
      for (const o of myOrders) await sdk.exchange.cancelOrder(o.order_id)

      /* close position */
      await sdk.exchange.placeOrder({
        coin: ASSET,
        is_buy: false,
        sz: posSz,
        limit_px: "0",
        order_type: { market: { tif: "Ioc" } },
        reduce_only: true
      })
      return NextResponse.json({ ok: true, action: "closed-long" })
    }

    /*  NO SIGNAL ------------------------------------------------------ */
    console.log("No actionable signal")
    return NextResponse.json({ ok: true, action: "none" })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

