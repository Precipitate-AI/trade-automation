// app/api/pnl/route.ts
import { NextResponse } from "next/server"
import { backtest, StrategyRun } from "@/lib/backtest"
import type { DailyCandle } from "@/lib/utils"

// Start from 2017-01-01 (Bitcoin data available from this point)
const startTime = new Date('2017-01-01').getTime()

// Primary and fallback URLs for Binance API
const binanceURLs = [
  `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${startTime}&limit=5000`,
  `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${startTime}&limit=5000`,
  `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${startTime}&limit=5000`
]

async function fetchWithRetry(urls: string[], options?: RequestInit): Promise<Response> {
  let lastError: Error | null = null
  
  for (const url of urls) {
    try {
      console.log(`Attempting to fetch from: ${url}`)
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; trade-automation/1.0)',
          ...options?.headers
        }
      })
      
      if (response.ok) {
        console.log(`Successfully fetched from: ${url}`)
        return response
      } else {
        console.log(`HTTP ${response.status} from ${url}: ${response.statusText}`)
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.log(`Error fetching from ${url}:`, error)
      lastError = error as Error
      continue
    }
  }
  
  throw lastError || new Error('All API endpoints failed')
}

export async function GET() {
  try {
    console.log('Starting PnL API request...')
    
    const raw = await fetchWithRetry(binanceURLs, { 
      next: { revalidate: 60 * 60 * 6 } // 6-hour cache
    })
    
    if (!raw.ok) {
      throw new Error(`Binance API error: ${raw.status} ${raw.statusText}`)
    }
    
    const kl = await raw.json() as any[][]
    console.log(`Fetched ${kl.length} candles from Binance`)
    
    if (!Array.isArray(kl) || kl.length === 0) {
      throw new Error('No candle data received from Binance API')
    }

    const candles: DailyCandle[] = kl.map(k => ({
      timestamp: k[0],
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4]
    }))

    console.log(`Processing ${candles.length} candles for backtesting`)

    // 3 strategies
    const s1 = backtest(candles, 1, 0)
    const s2 = backtest(candles, 3, 0.063)
    const s3 = backtest(candles, 5, 0.063)

    const payload: StrategyRun[] = [s1, s2, s3]
    console.log('Backtest completed successfully')
    
    return NextResponse.json(payload, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=21600' // 6 hours
      }
    })
  } catch (err) {
    console.error('PnL API error:', err)
    return NextResponse.json(
      { 
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
        details: 'Failed to fetch Bitcoin price data. This may be due to API rate limits or regional restrictions.'
      }, 
      { status: 500 }
    )
  }
}
