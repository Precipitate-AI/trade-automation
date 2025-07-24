// app/api/manual-buy/route.ts
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import ccxt from 'ccxt'

const ASSET = "BTC-PERP"  // Try the exact Hyperliquid format first
const LEV = 3
const ORDER_USD = 100

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")
    
    // Get wallet address from private key
    const wallet = new ethers.Wallet(pk)
    const walletAddress = wallet.address
    
    const isTestnet = process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
    
    console.log(`Using testnet: ${isTestnet}, wallet: ${walletAddress}`)
    
    // Initialize CCXT exchange
    const exchange = new ccxt.hyperliquid({
      walletAddress: walletAddress,
      privateKey: pk,
      sandbox: isTestnet, // Use sandbox for testnet
      timeout: 30000,
      enableRateLimit: true
    })

    // Load markets to get precision info
    await exchange.loadMarkets()
    
    // Debug: log available markets
    const markets = Object.keys(exchange.markets)
    console.log("Available markets:", markets.slice(0, 10)) // First 10 markets
    const btcMarkets = markets.filter(m => m.includes('BTC'))
    console.log("BTC markets:", btcMarkets)
    
    // Try different BTC symbol formats
    let actualAsset = ASSET
    if (!exchange.markets[ASSET]) {
      const possibleSymbols = ['BTC/USD:USD', 'BTC/USD', 'BTC-USD', 'BTC:USD', 'BTCUSD', 'BTC/USDT:USDT']
      for (const symbol of possibleSymbols) {
        if (exchange.markets[symbol]) {
          actualAsset = symbol
          break
        }
      }
      // If still not found, use the first BTC market
      if (!exchange.markets[actualAsset] && btcMarkets.length > 0) {
        actualAsset = btcMarkets[0]
      }
    }
    
    console.log(`Using asset symbol: ${actualAsset}`)
    
    // Get current price to calculate size
    const ticker = await exchange.fetchTicker(actualAsset)
    const price = ticker.last || ticker.close || ticker.bid
    if (!price) throw new Error("Could not get current price")
    
    const size = ORDER_USD / price
    
    console.log(`Manual BUY: ${size} ${actualAsset} at ~${price} with ${LEV}x leverage`)

    // Set leverage (cross margin)
    await exchange.setLeverage(LEV, actualAsset, { marginMode: 'cross' })

    // Place market order (CCXT simulates with IOC limit)
    const order = await exchange.createMarketOrder(actualAsset, 'buy', size, undefined, { 
      reduceOnly: false 
    })
    
    console.log("Order result:", order)

    return NextResponse.json({ 
      ok: true, 
      action: "manual-buy", 
      qty: size, 
      price,
      leverage: LEV,
      result: order 
    })
    
  } catch (err) {
    console.error("Manual buy error:", err)
    return NextResponse.json({ 
      error: (err as Error).message,
      details: (err as any).cause?.message || 'No additional details'
    }, { status: 500 })
  }
}