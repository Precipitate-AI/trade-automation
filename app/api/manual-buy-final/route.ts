// app/api/manual-buy-final/route.ts - Bulletproof Direct REST Implementation
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"

const BASE_URL = 'https://api.hyperliquid.xyz'
const ORDER_USD = 100
const LEV = 3

// Using native fetch in Next.js 15+ (no agent needed)

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")

    const wallet = new ethers.Wallet(pk)
    const ADDRESS = wallet.address
    
    console.log(`Using wallet: ${ADDRESS}`)

    // Step 1: Fetch meta (unsigned) for asset index/decimals
    console.log("Fetching meta...")
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
    
    // Find BTC asset (meta uses 'BTC' for BTC-PERP)
    const assetIndex = universe.findIndex((a: any) => a.name === 'BTC')
    if (assetIndex === -1) {
      console.log("Available assets:", universe.map((a: any) => a.name))
      throw new Error('BTC asset not found in universe')
    }
    
    const szDecimals = universe[assetIndex].szDecimals
    console.log(`BTC asset index: ${assetIndex}, decimals: ${szDecimals}`)

    // Step 2: Get current price
    console.log("Fetching current prices...")
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
    const sizeStr = size.toFixed(szDecimals) // String with exact decimals
    
    console.log(`Current BTC price: ${price}, order size: ${sizeStr} (${ORDER_USD} USDC)`)

    // Step 3: Generate nonce (client-side timestamp)
    console.log("Generating nonces...")
    const currentNonce = Date.now() // Milliseconds timestamp
    const leverageNonce = currentNonce
    const orderNonce = currentNonce + 1 // Increment for second action
    console.log(`Generated nonces - leverage: ${leverageNonce}, order: ${orderNonce}`)

    // Step 4: Update leverage (signed, cross margin)
    console.log(`Setting leverage to ${LEV}x...`)
    const leverageAction = {
      type: 'updateLeverage',
      asset: assetIndex,
      isCross: true,
      leverage: LEV
    }
    
    const leveragePayload = await signPayload(leverageAction, leverageNonce, wallet, ADDRESS)
    console.log("Leverage payload:", JSON.stringify(leveragePayload, null, 2))
    
    const levRes = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leveragePayload)
    })
    
    if (!levRes.ok) {
      const errorText = await levRes.text()
      console.log("Leverage error response:", errorText)
      throw new Error(`Leverage update failed: ${levRes.status} ${errorText}`)
    }
    
    const leverageResult = await levRes.json()
    console.log("Leverage update result:", leverageResult)

    // Step 5: Place order (signed, IOC for market simulation)
    console.log("Placing buy order...")
    
    const orderAction = {
      type: 'order',
      grouping: 'na',
      orders: [{
        asset: assetIndex,
        isBuy: true,
        reduceOnly: false,
        limitPx: '999999999', // Extreme high price for immediate fill on buy
        sz: sizeStr, // String format required
        orderType: { limit: { tif: 'Ioc' } } // Immediate or cancel
      }]
    }
    
    const orderPayload = await signPayload(orderAction, orderNonce, wallet, ADDRESS)
    console.log("Order payload:", JSON.stringify(orderPayload, null, 2))
    
    const orderRes = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    })
    
    if (!orderRes.ok) {
      const errorText = await orderRes.text()
      throw new Error(`Order failed: ${orderRes.status} ${errorText}`)
    }
    
    const orderResult = await orderRes.json()
    console.log("Order result:", orderResult)

    return NextResponse.json({
      ok: true,
      action: "manual-buy-final",
      qty: sizeStr,
      price,
      leverage: LEV,
      result: {
        leverage: leverageResult,
        order: orderResult
      }
    })

  } catch (err) {
    console.error("Manual buy final error:", err)
    return NextResponse.json({
      error: (err as Error).message
    }, { status: 500 })
  }
}

async function signPayload(action: any, nonce: number, wallet: ethers.Wallet, address: string) {
  // Create the connectionId 
  const connectionId = ethers.hexlify(ethers.randomBytes(32))
  
  // Hash: keccak256(concat(uint64(nonce) as 8 bytes + bytes(action JSON)))
  const message = ethers.keccak256(ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(nonce, 8), 8), // Fixed 8 bytes for uint64
    ethers.toUtf8Bytes(JSON.stringify(action))
  ]))

  const signature = await wallet.signMessage(ethers.getBytes(message))

  // Return the full payload structure that Hyperliquid expects
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