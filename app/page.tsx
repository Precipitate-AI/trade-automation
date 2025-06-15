"use client"

import { useAccount } from "wagmi"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button" // Assuming you have a Button component from shadcn/ui

export default function HomePage() {
  const { address, isConnected } = useAccount()
  const router = useRouter()

  const handleAccessDashboard = () => {
    router.push("/trade-dashboard")
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-precipitate-dark text-precipitate-light">
      <main className="text-center pt-24 pb-12 px-4">
        {" "}
        {/* Padding-top to avoid overlap with fixed header */}
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Automated Trading</h1>
        <p className="text-lg sm:text-xl text-gray-400 mb-8 max-w-xl mx-auto">executed on Hyperliquid</p>
        {isConnected && address && (
          <Button
            onClick={handleAccessDashboard}
            className="px-8 py-3 bg-precipitate-blue text-white rounded-lg hover:bg-blue-600 transition-colors text-lg font-semibold"
          >
            Access Dashboard
          </Button>
        )}
        {!isConnected && (
          <div className="mt-8 p-6 bg-precipitate-light bg-opacity-5 backdrop-blur-sm border border-precipitate-light/20 rounded-lg shadow-xl max-w-md mx-auto">
            <p className="text-gray-300">Connect your wallet to access the trading dashboard.</p>
          </div>
        )}
      </main>
    </div>
  )
}
