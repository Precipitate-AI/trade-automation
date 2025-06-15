"use client"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { useConnectors } from "wagmi"
import { useEffect, useState } from "react"

export default function WalletConnector() {
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { address } = useAccount()
  const [mounted, setMounted] = useState(false)
  const connectors = useConnectors()
  const injectedConnector = connectors.find((c) => c.type === "injected")

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return address ? (
    <button
      onClick={() => disconnect()}
      className="px-4 py-2 bg-precipitate-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
    >
      {address.slice(0, 6)}...{address.slice(-4)}
    </button>
  ) : (
    <button
      onClick={() => {
        if (injectedConnector) {
          connect({ connector: injectedConnector })
        } else {
          alert("No injected wallet (like MetaMask) found. Please install one.")
        }
      }}
      disabled={!injectedConnector}
      className="px-4 py-2 bg-precipitate-blue text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-60"
    >
      {injectedConnector ? "Connect Wallet" : "No Wallet Detected"}
    </button>
  )
}
