import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface DailyCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface SyntheticCandle {
  timestamp: number // Represents the end of the 5-day period
  open: number
  high: number
  low: number
  close: number
}

export function aggregateToFiveDayCandles(dailyCandles: DailyCandle[]): SyntheticCandle[] {
  const fiveDayCandles: SyntheticCandle[] = []
  if (dailyCandles.length < 5) return fiveDayCandles

  // Ensure daily candles are sorted by timestamp ascending
  const sortedDailies = [...dailyCandles].sort((a, b) => a.timestamp - b.timestamp)

  for (let i = 0; i <= sortedDailies.length - 5; i += 5) {
    const chunk = sortedDailies.slice(i, i + 5)
    const open = chunk[0].open
    const high = Math.max(...chunk.map((c) => c.high))
    const low = Math.min(...chunk.map((c) => c.low))
    const close = chunk[4].close
    const timestamp = chunk[4].timestamp // Timestamp of the last day in the period
    fiveDayCandles.push({ timestamp, open, high, low, close })
  }
  return fiveDayCandles
}

export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return []

  const k = 2 / (period + 1)
  const emas: number[] = []

  // Calculate initial SMA for the first EMA value
  let sma = 0
  for (let i = 0; i < period; i++) {
    sma += closes[i]
  }
  emas.push(sma / period)

  // Calculate subsequent EMAs
  for (let i = period; i < closes.length; i++) {
    const ema = closes[i] * k + emas[emas.length - 1] * (1 - k)
    emas.push(ema)
  }
  return emas
}
