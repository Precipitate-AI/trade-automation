// app/api/manual-buy-nomeida/route.ts - Using nomeida/hyperliquid SDK
import { NextRequest, NextResponse } from "next/server"
import { Hyperliquid } from 'hyperliquid'

const ORDER_USD = 100
const LEV = 3

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")

    // Get wallet address from private key
    const ADDRESS = "0x" + pk.slice(2, 42) // Extract address from private key
    const IS_TESTNET = process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
    
    console.log(`Using ${IS_TESTNET ? 'testnet' : 'mainnet'}, wallet: ${ADDRESS}`)

    // Initialize nomeida/hyperliquid SDK
    const sdk = new Hyperliquid({
      address: ADDRESS,
      privateKey: pk,
      chain: IS_TESTNET ? 'Testnet' : 'Mainnet'
    })

    // Step 1: Explore available methods
    console.log("Perpetuals methods:", Object.keys(sdk.info.perpetuals))
    console.log("Spot methods:", Object.keys(sdk.info.spot))
    
    // Try using perpetuals methods which might have meta
    let meta
    try {
      // Check if perpetuals has meta methods
      const perpMethods = Object.keys(sdk.info.perpetuals)
      console.log("Available perpetuals methods:", perpMethods)
      
      // Try common meta method names
      for (const method of perpMethods) {
        if (method.toLowerCase().includes('meta')) {
          console.log(`Trying perpetuals method: ${method}`)
          meta = await sdk.info.perpetuals[method]()
          break
        }
      }
      
      if (!meta) {
        // Try the first method that looks promising
        const firstMethod = perpMethods[0]
        console.log(`Trying first method: ${firstMethod}`)
        meta = await sdk.info.perpetuals[firstMethod]()
      }
    } catch (e) {
      console.log("Perpetuals method failed:", e.message)
      throw new Error(`Could not fetch meta. Perpetuals methods: ${Object.keys(sdk.info.perpetuals).join(', ')}`)
    }
    
    console.log("Meta structure:", JSON.stringify(meta, null, 2))
    
    // Find BTC asset - adapt based on structure
    const universe = meta.universe || meta.meta?.universe || meta
    const btcAsset = Array.isArray(universe) ? universe.find((a: any) => a.name === 'BTC') : null
    if (!btcAsset) {
      console.log("Available assets:", Array.isArray(universe) ? universe.map((a: any) => a.name) : 'Not an array')
      throw new Error('BTC asset not found in universe')
    }
    
    const assetIndex = universe.indexOf(btcAsset)
    const szDecimals = btcAsset.szDecimals
    
    console.log(`BTC asset index: ${assetIndex}, decimals: ${szDecimals}`)

    // Step 2: Get current price - try spot methods for pricing
    console.log("Fetching current prices...")
    const spotMethods = Object.keys(sdk.info.spot)
    console.log("Available spot methods:", spotMethods)
    
    let allMids
    for (const method of spotMethods) {
      if (method.toLowerCase().includes('mid') || method.toLowerCase().includes('price')) {
        try {
          console.log(`Trying spot method: ${method}`)
          allMids = await sdk.info.spot[method]()
          break
        } catch (e) {
          console.log(`Spot method ${method} failed:`, e.message)
        }
      }
    }
    
    if (!allMids) {
      throw new Error(`Could not fetch prices. Spot methods: ${spotMethods.join(', ')}`)
    }
    
    const price = parseFloat(allMids[assetIndex] || allMids.BTC || allMids['BTC-PERP'])
    const size = ORDER_USD / price
    const sizeStr = size.toFixed(szDecimals)
    
    console.log(`Current BTC price: ${price}, order size: ${sizeStr} (${ORDER_USD} USDC)`)

    // Step 3: Update leverage (cross margin)
    console.log(`Setting leverage to ${LEV}x...`)
    const leverageResult = await sdk.exchange.updateLeverage({
      asset: assetIndex,
      is_cross: true,
      leverage: LEV
    })
    
    console.log("Leverage update result:", leverageResult)

    // Step 4: Place market-like buy order (IOC with high limitPx)
    console.log("Placing buy order...")
    const orderResponse = await sdk.exchange.placeOrder({
      coin: 'BTC-PERP',
      is_buy: true,
      sz: parseFloat(sizeStr), // SDK expects number
      limit_px: 999999999, // Extreme for immediate fill
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false
    })

    console.log('Order executed:', orderResponse)

    return NextResponse.json({
      ok: true,
      action: "manual-buy-nomeida",
      qty: sizeStr,
      price,
      leverage: LEV,
      result: {
        leverage: leverageResult,
        order: orderResponse
      }
    })

  } catch (err) {
    console.error("Manual buy nomeida error:", err)
    return NextResponse.json({
      error: (err as Error).message,
      details: (err as any).response?.data || 'No additional details'
    }, { status: 500 })
  }
}