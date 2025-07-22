// app/api/pnl/route.ts
import { NextResponse } from "next/server"
import { backtest, StrategyRun } from "@/lib/backtest"
import type { DailyCandle } from "@/lib/utils"

// Start from 2017-01-01 (Bitcoin data available from this point)
const startTime = new Date('2017-01-01').getTime()

async function fetchAllHistoricalData(): Promise<any[][]> {
  const allCandles: any[][] = []
  let currentStartTime = startTime
  const now = Date.now()
  const limit = 1000 // Binance max limit per request
  
  // Primary and fallback URLs for Binance API
  const getUrls = (start: number, lim: number) => [
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=${lim}`,
    `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=${lim}`,
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${start}&limit=${lim}`
  ]
  
  while (currentStartTime < now) {
    console.log(`Fetching data from: ${new Date(currentStartTime).toISOString()}`)
    
    const urls = getUrls(currentStartTime, limit)
    const response = await fetchWithRetry(urls, { 
      next: { revalidate: 60 * 60 * 6 } // 6-hour cache
    })
    
    const batch = await response.json() as any[][]
    
    if (!Array.isArray(batch) || batch.length === 0) {
      console.log('No more data available')
      break
    }
    
    allCandles.push(...batch)
    console.log(`Fetched ${batch.length} candles, total: ${allCandles.length}`)
    
    // Move to the next batch - use the last timestamp + 1 day
    const lastCandle = batch[batch.length - 1]
    currentStartTime = lastCandle[0] + (24 * 60 * 60 * 1000) // Add 1 day in milliseconds
    
    // If we got less than the limit, we've reached the end
    if (batch.length < limit) {
      console.log('Reached end of available data')
      break
    }
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`Total candles fetched: ${allCandles.length}`)
  console.log(`Date range: ${new Date(allCandles[0]?.[0]).toISOString()} to ${new Date(allCandles[allCandles.length - 1]?.[0]).toISOString()}`)
  
  return allCandles
}

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
    
    const kl = await fetchAllHistoricalData()
    console.log(`Fetched ${kl.length} candles from Binance (full historical data)`)
    
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
