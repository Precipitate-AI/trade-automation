// app/api/pnl/route.ts
import { NextResponse } from "next/server"
import { backtest, StrategyRun } from "@/lib/backtest"
import type { DailyCandle } from "@/lib/utils"

// Start from 2017-01-01 (Bitcoin data available from this point)
const startTime = new Date('2017-01-01').getTime()

async function fetchAllHistoricalData(): Promise<any[][]> {
  console.log('Fetching complete Bitcoin historical data from 2017 to present...')
  
  // Since Binance has a 1000 limit, we need to make multiple requests
  const allCandles: any[][] = []
  let currentStartTime = startTime
  const now = Date.now()
  const maxLimit = 1000
  let requestCount = 0
  const maxRequests = 25 // Increased to ensure complete 2017-2025 coverage, ~8.5 years = ~3100 days
  
  while (currentStartTime < now && requestCount < maxRequests) {
    console.log(`Request ${requestCount + 1}: Fetching from ${new Date(currentStartTime).toISOString()}`)
    
    const urls = [
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${currentStartTime}&limit=${maxLimit}`,
      `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${currentStartTime}&limit=${maxLimit}`,
      `https://api2.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${currentStartTime}&limit=${maxLimit}`,
      `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${currentStartTime}&limit=${maxLimit}`,
      `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${currentStartTime}&limit=${maxLimit}`
    ]
    
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
    
    // If we got less than the limit, we've reached the end
    if (batch.length < maxLimit) {
      console.log('Reached end of available data (partial batch)')
      break
    }
    
    // Move to next batch using the last timestamp + 1 millisecond to avoid gaps
    const lastCandle = batch[batch.length - 1]
    currentStartTime = lastCandle[0] + 1
    requestCount++
    
    // No delay needed for daily data requests
  }
  
  if (requestCount >= maxRequests) {
    console.log(`Hit maximum request limit (${maxRequests}), may not have complete data`)
    console.log(`Last timestamp processed: ${new Date(currentStartTime).toISOString()}`)
  } else {
    console.log(`Successfully completed data fetch in ${requestCount} requests`)
  }
  
  // Remove duplicates and sort by timestamp to ensure proper order
  const uniqueCandles = Array.from(
    new Map(allCandles.map(candle => [candle[0], candle])).values()
  ).sort((a, b) => a[0] - b[0])
  
  console.log(`Total candles fetched: ${allCandles.length}, unique candles: ${uniqueCandles.length}`)
  if (uniqueCandles.length > 0) {
    console.log(`Date range: ${new Date(uniqueCandles[0]?.[0]).toISOString()} to ${new Date(uniqueCandles[uniqueCandles.length - 1]?.[0]).toISOString()}`)
    
    // Log some sample dates to verify continuity
    const sampleDates = uniqueCandles
      .filter((_, index) => index % Math.floor(uniqueCandles.length / 10) === 0)
      .map(candle => new Date(candle[0]).toISOString().substring(0, 10))
    console.log(`Sample dates: ${sampleDates.join(', ')}`)
  }
  
  return uniqueCandles
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
      } else if (response.status === 451) {
        console.log(`HTTP 451 from ${url}: Unavailable for legal reasons, trying next endpoint...`)
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
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
