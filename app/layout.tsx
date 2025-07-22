//app/layout.tsx

import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { Providers } from "./providers"
import Image from "next/image"
import WalletConnector from "@/components/wallet-connector"

export const metadata: Metadata = {
  title: "Trade Automation on Hyperliquid",
  description: "AI-powered Trader Agent on Hyperliquid.",
  icons: {
    icon: "/logo.png",
  },
    generator: 'v0.dev'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-screen bg-precipitate-dark text-precipitate-light">
        <Providers>
          <header className="fixed top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-50 bg-precipitate-dark/80 backdrop-blur-md">
            <Image
              src="/logo.png"
              width={50}
              height={71}
              alt="Precipitate AI Insight"
              priority
              className="w-[40px] h-auto md:w-[50px]"
            />
            <WalletConnector />
          </header>
          {children}
          <footer className="fixed bottom-0 left-0 right-0 p-3 md:p-4 text-center text-xs md:text-sm text-gray-500 bg-precipitate-dark/80 backdrop-blur-md">
            Powered by Precipitate AI
          </footer>
        </Providers>
      </body>
    </html>
  )
}
