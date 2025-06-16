// File: app/api/status/route.ts
// --- TEMPORARY DIAGNOSTIC CODE ---

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  console.log("--- STARTING SDK MODULE INSPECTION ---");
  try {
    const hl = require('hyperliquid-sdk');
    
    console.log("✅ SDK module loaded successfully.");
    console.log("Type of loaded module:", typeof hl);

    // We will log the keys of the module itself
    console.log("Top-level keys of the module:", Object.keys(hl));

    // We will ALSO check for the '.default' property that has been causing issues
    if (hl && hl.default) {
      console.log("✅ '.default' property exists.");
      console.log("Keys within '.default':", Object.keys(hl.default));
    } else {
      console.log("❌ '.default' property does NOT exist.");
    }

    // Return a success message so we know the function ran without crashing
    return NextResponse.json({ 
      message: "SDK inspection complete. Please check the Vercel function logs for the output of 'console.log'."
    });

  } catch (error: any) {
    console.error("❌ CRITICAL ERROR during SDK inspection:", error.message);
    return NextResponse.json({ error: `Failed during inspection: ${error.message}` }, { status: 500 });
  }
}
