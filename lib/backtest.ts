// lib/backtest.ts
import type { DailyCandle } from "./utils"

export interface Trade {
  entryTs: number        // millis
  exitTs: number
  entryPx: number
  exitPx: number
  leverage: number       // 1, 3 or 5
  stopPct: number        // 0 if none
  reason: "ema" | "stop"
  pnlPct: number         // % on *price*
  pnlOnEquity: number    // % on *equity* (pnlPct * leverage)
}

export interface StrategyRun {
  id: "BASE_1x" | "LEV3_SL63" | "LEV5_SL63"
  trades: Trade[]
  equityCurve: { ts: number; eq: number }[]   // eq = equity multiple, starts at 1
}

export function ema(values: number[], period = 5): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  values.forEach((v, i) => {
    if (i === 0) return out.push(v)         // seed with first close
    out.push(v * k + out[i - 1] * (1 - k))
  })
  return out
}

export function backtest(
  candles: DailyCandle[],
  leverage: 1 | 3 | 5,
  stopPct = 0               // 0   -> “no hard stop”
): StrategyRun {
  if (!candles.length) throw new Error("no candles")
  const closes = candles.map(c => c.close)
  const ema5   = ema(closes, 5)

  let equity   = 1
  let inPos    = false
  let entryPx  = 0
  let equityCurve: { ts: number; eq: number }[] = [{ ts: candles[0].timestamp, eq: 1 }]
  const trades: Trade[] = []

  for (let i = 1; i < candles.length - 1; i++) {
    const cPrev = candles[i - 1]
    const c     = candles[i]
    const nextOpen = candles[i + 1].open         // entry / exit price

    /* -------- entry ---------------------------------------------------- */
    if (!inPos && cPrev.close <= ema5[i - 1] && c.close > ema5[i]) {
      inPos   = true
      entryPx = nextOpen
      continue
    }

    if (!inPos) continue                         // nothing to manage

    /* -------- manage open position ------------------------------------- */
    const hitStop = stopPct > 0 && c.low <= entryPx * (1 - stopPct)
    const exitOnEma = cPrev.close >= ema5[i - 1] && c.close < ema5[i]
    if (!hitStop && !exitOnEma) continue

    // decide exit price + reason
    const exitPx  = hitStop ? entryPx * (1 - stopPct) : nextOpen
    const reason  = hitStop ? "stop" : "ema"
    const pnlPct  = (exitPx - entryPx) / entryPx
    const pnlEq   = pnlPct * leverage
    equity       *= 1 + pnlEq
    trades.push({
      entryTs: candles[i - 1].timestamp,
      exitTs : candles[i].timestamp,
      entryPx,
      exitPx,
      leverage,
      stopPct,
      reason,
      pnlPct,
      pnlOnEquity: pnlEq
    })
    equityCurve.push({ ts: candles[i].timestamp, eq: equity })

    inPos = false
  }

  const id = leverage === 1 ? "BASE_1x" : leverage === 3 ? "LEV3_SL63" : "LEV5_SL63"
  return { id, trades, equityCurve }
}
