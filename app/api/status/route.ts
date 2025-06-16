// File: app/api/status/route.ts
// --- THE FINAL DIAGNOSTIC ---

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  console.log("--- STARTING FINAL SDK INSPECTION (using dynamic import) ---");
  try {
    const module = await import('hyperliquid-sdk');
    
    console.log("✅ SDK module loaded via dynamic import.");
    
    // Log the entire module object for inspection
    console.log("Full module object:", JSON.stringify(module, null, 2));

    // Log the top-level keys
    console.log("Top-level keys of module:", Object.keys(module));

    // Explicitly check the two possibilities from our previous attempts
    if (module && module.default) {
      console.log("✅ module.default EXISTS.");
      console.log("Keys within module.default:", Object.keys(module.default));
    } else {
      console.log("❌ module.default DOES NOT exist.");
    }

    if (module && module.Hyperliquid) {
      console.log("✅ module.Hyperliquid EXISTS.");
      console.log("Keys within module.Hyperliquid:", Object.keys(module.Hyperliquid));
    } else {
         console.log("❌ module.Hyperliquid DOES NOT exist.");
    }

    return NextResponse.json({ 
      message: "Final inspection complete. Please check the Vercel function logs."
    });

  } catch (error: any) {
    console.error("❌ CRITICAL ERROR during SDK inspection:", error.message);
    return NextResponse.json({ error: `Failed during inspection: ${error.message}` }, { status: 500 });
  }
}
