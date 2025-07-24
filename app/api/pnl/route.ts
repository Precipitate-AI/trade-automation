// app/api/pnl/route.ts
import { NextResponse } from "next/server"
import { backtest, StrategyRun } from "@/lib/backtest"
import type { DailyCandle } from "@/lib/utils"

async function fetchAllHistoricalData(): Promise<any[][]> {
  console.log('Fetching complete Bitcoin historical data from CoinGecko...')
  
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily`
  
  const response = await fetch(url, { 
    next: { revalidate: 60 * 60 * 6 } // 6-hour cache
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from CoinGecko: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  // Convert CoinGecko data to the format expected by the backtesting function
  // CoinGecko returns [timestamp, price], we need [timestamp, open, high, low, close]
  // We will use the price for all OHLC values
  const candles = data.prices.map((priceData: [number, number]) => {
    const [timestamp, price] = priceData
    return [timestamp, price, price, price, price]
  })

  console.log(`Successfully fetched ${candles.length} candles from CoinGecko`)
  return candles
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
