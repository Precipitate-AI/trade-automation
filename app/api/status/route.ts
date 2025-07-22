import { NextResponse } from "next/server";

export async function GET() {
  // This is a mock API response. In a real application, you would fetch
  // the actual bot status from a database or other persistent storage.
  const mockStatus = {
    isActive: true,
    position: {
      size: 0.0015,
      entryPrice: "29000.00",
    },
    lastSignal: "BUY",
  };

  return NextResponse.json(mockStatus);
}