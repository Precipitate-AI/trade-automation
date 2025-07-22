// app/api/pnl/route.ts
import { NextRequest, NextResponse } from "next/server"
import { backtest, StrategyRun } from "@/lib/backtest"
import type { DailyCandle } from "@/lib/utils"

const binanceURL =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=1483228800000"

export async function GET(req: NextRequest) {
  try {
    const raw = await fetch(binanceURL, { next: { revalidate: 60 * 60 * 6 } }) // 6-h cache
    const kl = (await raw.json()) as any[][]

    const candles: DailyCandle[] = kl.map(k => ({
      timestamp: k[0],
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4]
    }))

    // 3 strategies
    const s1 = backtest(candles, 1, 0)
    const s2 = backtest(candles, 5, 0.063)
    const s3 = backtest(candles, 3, 0.063)

    const payload: StrategyRun[] = [s1, s2, s3]
    return NextResponse.json(payload, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
