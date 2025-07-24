// app/api/manual-buy-simple/route.ts - Direct order without leverage setting
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"

const BASE_URL = 'https://api.hyperliquid.xyz'
const ORDER_USD = 100

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")

    const wallet = new ethers.Wallet(pk)
    const ADDRESS = wallet.address
    
    console.log(`Using wallet: ${ADDRESS}`)

    // Step 1: Fetch meta for asset info
    const metaRes = await fetch(`${BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' })
    })
    
    if (!metaRes.ok) {
      const errorText = await metaRes.text()
      throw new Error(`Meta fetch failed: ${metaRes.status} ${errorText}`)
    }
    
    const metaData = await metaRes.json()
    const { universe } = metaData
    
    // Find BTC asset
    const assetIndex = universe.findIndex((a: any) => a.name === 'BTC')
    if (assetIndex === -1) {
      console.log("Available assets:", universe.map((a: any) => a.name))
      throw new Error('BTC asset not found in universe')
    }
    
    const szDecimals = universe[assetIndex].szDecimals
    console.log(`BTC asset index: ${assetIndex}, decimals: ${szDecimals}`)

    // Step 2: Get current price
    const allMidsRes = await fetch(`${BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    })
    
    if (!allMidsRes.ok) {
      const errorText = await allMidsRes.text()
      throw new Error(`AllMids fetch failed: ${allMidsRes.status} ${errorText}`)
    }
    
    const allMids = await allMidsRes.json()
    const price = parseFloat(allMids[assetIndex])
    const size = ORDER_USD / price
    const sizeStr = size.toFixed(szDecimals)
    
    console.log(`Current BTC price: ${price}, order size: ${sizeStr}`)

    // Step 3: Generate nonce and place order directly
    const currentNonce = Date.now()
    console.log(`Generated nonce: ${currentNonce}`)
    
    const orderAction = {
      type: 'order',
      grouping: 'na',
      orders: [{
        asset: assetIndex,
        isBuy: true,
        reduceOnly: false,
        limitPx: '999999999', // High price for immediate fill
        sz: sizeStr,
        orderType: { limit: { tif: 'Ioc' } }
      }]
    }
    
    const orderPayload = await signPayload(orderAction, currentNonce, wallet, ADDRESS)
    console.log("Order payload:", JSON.stringify(orderPayload, null, 2))
    
    const orderRes = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    })
    
    if (!orderRes.ok) {
      const errorText = await orderRes.text()
      console.log("Order error response:", errorText)
      throw new Error(`Order failed: ${orderRes.status} ${errorText}`)
    }
    
    const orderResult = await orderRes.json()
    console.log("Order result:", orderResult)

    return NextResponse.json({
      ok: true,
      action: "manual-buy-simple",
      qty: sizeStr,
      price,
      result: orderResult
    })

  } catch (err) {
    console.error("Manual buy simple error:", err)
    return NextResponse.json({
      error: (err as Error).message
    }, { status: 500 })
  }
}

async function signPayload(action: any, nonce: number, wallet: ethers.Wallet, address: string) {
  const connectionId = ethers.hexlify(ethers.randomBytes(32))
  
  // Hash: keccak256(concat(uint64(nonce) as 8 bytes + bytes(action JSON)))
  const message = ethers.keccak256(ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(nonce, 8), 8),
    ethers.toUtf8Bytes(JSON.stringify(action))
  ]))

  const signature = await wallet.signMessage(ethers.getBytes(message))

  return { 
    action, 
    nonce, 
    signature,
    agent: {
      address,
      connectionId
    }
  }
}