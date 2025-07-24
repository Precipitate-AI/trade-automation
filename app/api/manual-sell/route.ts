// app/api/manual-sell/route.ts
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { Hyperliquid } from "hyperliquid-sdk"

const ASSET = "BTC-PERP"

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")
    
    const wallet = new ethers.Wallet(pk)
    const apiUrl = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz"
    const sdk = new Hyperliquid(wallet, apiUrl)

    // Get current position
    const state = await sdk.info.perpetuals.getClearinghouseState(wallet.address)
    const posObj = state.assetPositions.find((p: any) => p.position.coin === ASSET)
    const posSz = posObj ? +posObj.position.szi : 0
    
    if (posSz <= 0) {
      return NextResponse.json({ error: "No long position to close" }, { status: 400 })
    }
    
    console.log(`Manual SELL: Closing ${posSz} ${ASSET} position`)
    
    // Cancel any existing orders first
    const openOrders = await sdk.info.perpetuals.getUserOpenOrders(wallet.address)
    const myOrders = openOrders.filter((o: any) => o.coin === ASSET)
    for (const o of myOrders) {
      await sdk.exchange.cancelOrder(o.order_id)
      console.log(`Cancelled order: ${o.order_id}`)
    }
    
    // Close position
    const sell = await sdk.exchange.placeOrder({
      coin: ASSET,
      is_buy: false,
      sz: Math.abs(posSz),
      limit_px: 0,
      order_type: { market: {} },
      reduce_only: true
    })
    
    console.log("Sell order result:", sell)
    
    return NextResponse.json({ 
      ok: true, 
      action: "manual-sell", 
      qty: Math.abs(posSz),
      result: sell 
    })
    
  } catch (err) {
    console.error("Manual sell error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}