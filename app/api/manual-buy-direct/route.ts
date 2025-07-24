// app/api/manual-buy-direct/route.ts - Direct REST API approach
import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"

const ORDER_USD = 100
const LEV = 3

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.HYPERLIQUID_PRIVATE_KEY
    if (!pk) throw new Error("HYPERLIQUID_PRIVATE_KEY env missing")

    const wallet = new ethers.Wallet(pk)
    const isTestnet = process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
    const BASE_URL = isTestnet ? 'https://api.hyperliquid-testnet.xyz' : 'https://api.hyperliquid.xyz'
    
    console.log(`Using ${BASE_URL}, wallet: ${wallet.address}`)

    // Step 1: Fetch meta to get asset info
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
    
    // Find BTC-PERP asset index  
    console.log("Available assets:", metaData.universe.map((a: any) => a.name))
    const btcAsset = metaData.universe.find((asset: any) => 
      asset.name === 'BTC-PERP' || asset.name === 'BTC' || asset.name.includes('BTC')
    )
    if (!btcAsset) throw new Error("BTC-PERP asset not found")
    const assetIndex = metaData.universe.indexOf(btcAsset)
    
    console.log(`BTC asset index: ${assetIndex}, decimals: ${btcAsset.szDecimals}`)

    // Step 2: Get current price
    const allMidsRes = await fetch(`${BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
    })
    const allMids = await allMidsRes.json()
    const price = parseFloat(allMids[assetIndex])
    const size = parseFloat((ORDER_USD / price).toFixed(btcAsset.szDecimals))
    
    console.log(`Current BTC price: ${price}, order size: ${size}`)

    // Step 3: Get nonce
    const nonceRes = await fetch(`${BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nonce' })
    })
    const { nonce } = await nonceRes.json()
    
    console.log(`Got nonce: ${nonce}`)

    // Step 4: Update leverage (signed action)
    const leverageAction = {
      type: 'updateLeverage',
      asset: assetIndex,
      isCross: true,
      leverage: LEV
    }
    
    const leveragePayload = await signAction(leverageAction, nonce, wallet)
    const leverageRes = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leveragePayload)
    })
    const leverageResult = await leverageRes.json()
    
    console.log(`Leverage update result:`, leverageResult)

    // Step 5: Place order (IOC for market-like behavior)
    const orderAction = {
      type: 'order',
      grouping: 'na',
      orders: [{
        asset: assetIndex,
        isBuy: true,
        reduceOnly: false,
        limitPx: '999999999', // High price for immediate fill
        sz: size.toString(),
        orderType: { limit: { tif: 'Ioc' } }
      }]
    }
    
    const orderPayload = await signAction(orderAction, nonce + 1, wallet)
    const orderRes = await fetch(`${BASE_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    })
    const orderResult = await orderRes.json()
    
    console.log(`Order result:`, orderResult)

    return NextResponse.json({
      ok: true,
      action: "manual-buy-direct",
      qty: size,
      price,
      leverage: LEV,
      result: orderResult
    })

  } catch (err) {
    console.error("Manual buy direct error:", err)
    return NextResponse.json({
      error: (err as Error).message
    }, { status: 500 })
  }
}

async function signAction(action: any, nonce: number, wallet: ethers.Wallet) {
  const connectionId = ethers.hexlify(ethers.randomBytes(32))
  
  // Create the message to sign (nonce + stringified action)
  const message = ethers.solidityPackedKeccak256(
    ['uint32', 'string'],
    [nonce, JSON.stringify(action)]
  )
  
  // Sign the message
  const signature = await wallet.signMessage(ethers.getBytes(message))
  
  return {
    action,
    nonce,
    signature,
    agent: {
      address: wallet.address,
      connectionId
    }
  }
}