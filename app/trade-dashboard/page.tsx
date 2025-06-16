// File: app/trade-dashboard/page.tsx
// This is the complete, merged file with live data fetching.

'use client'; // This component must be a client component to use hooks

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, TrendingUp, MinusCircle, Loader2 } from "lucide-react";

// Define a type for our bot's status object for great TypeScript support
type BotStatus = {
  isActive: boolean;
  position: {
    size: number;
    entryPrice: string | number;
  };
  lastSignal: string; // This will be a placeholder until we add a database
};

// This is the static log data you provided. It's kept for UI purposes
// until a database is integrated to store real-time logs.
const staticActivityLog = [
  // ... (your sample log data can remain here for display)
    { id: 1, timestamp: '2024-07-25 00:05:01 UTC', type: 'CHECK', details: 'Ran 5-day check. No signal found.', result: 'Skipped', status: 'neutral'},
    { id: 2, timestamp: '2024-07-20 00:05:03 UTC', type: 'BUY', details: 'Signal: Close > EMA. Placed market buy for 0.0015 BTC.', result: 'Executed', status: 'success'},
    { id: 3, timestamp: '2024-07-15 00:05:00 UTC', type: 'CHECK', details: 'Signal: Close < EMA. Position already flat.', result: 'Processed', status: 'info'},
    { id: 4, timestamp: '2024-07-10 14:30:00 UTC', type: 'SELL', details: 'Signal: Close < EMA. Closed position of 0.0012 BTC', result: 'Executed', status: 'success' },
    { id: 5, timestamp: '2024-07-05 08:15:00 UTC', type: 'ERROR', details: 'Failed to fetch candle data from exchange API.', result: 'Failed', status: 'error' },
];

const getStatusIcon = (status: string) => {
    // Your getStatusIcon function is great, so we keep it as is.
    switch (status) {
        case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case "error": return <AlertCircle className="h-4 w-4 text-red-500" />;
        case "info": return <TrendingUp className="h-4 w-4 text-blue-500" />;
        case "neutral": return <MinusCircle className="h-4 w-4 text-gray-500" />;
        default: return <MinusCircle className="h-4 w-4 text-gray-500" />;
    }
};

export default function TradeDashboardPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [nextRun, setNextRun] = useState<string>("Calculating...");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // --- DATA FETCHING LOGIC ---
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('Network response was not ok');
        const data: BotStatus = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch bot status:", err);
        setError("Could not load bot status. The backend might be offline.");
      } finally {
        setIsLoading(false);
      }
    };

    // --- NEXT RUN CALCULATION LOGIC ---
    const calculateNextRun = () => {
        const now = new Date();
        const nextRunDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 5, 0, 0));
        if (now.getTime() > nextRunDate.getTime()) {
            nextRunDate.setUTCDate(nextRunDate.getUTCDate() + 1);
        }
        const diff = nextRunDate.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setNextRun(`In ${hours}h ${minutes}m`);
    };

    fetchStatus();
    calculateNextRun();
    
    const statusInterval = setInterval(fetchStatus, 30000); // Refresh status data every 30s
    const runInterval = setInterval(calculateNextRun, 60000); // Update countdown every minute
    
    return () => { // Cleanup function
        clearInterval(statusInterval);
        clearInterval(runInterval);
    };
  }, []);

  // Prepare dynamic data for rendering, with fallbacks for loading state
  const positionSize = status?.position.size ?? 0;
  const botIsActive = status?.isActive ?? false;

  return (
    <div className="min-h-screen flex flex-col bg-precipitate-dark text-precipitate-light">
      <main className="flex-1 p-4 md:p-8 lg:p-12 pt-20 md:pt-24">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-precipitate-light">Trade Automation Status</h1>

          {error && <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-white mb-8">{error}</div>}

          {/* Stat Cards with Live Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
                {isLoading ? <Loader2 className="h-5 w-5 text-gray-400 animate-spin" /> : botIsActive ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center">
                    <span className={`h-3 w-3 rounded-full ${isLoading ? 'bg-gray-500' : botIsActive ? 'bg-green-500' : 'bg-red-500'} inline-block mr-2`}></span>
                    {isLoading ? "Loading..." : botIsActive ? "Active" : "Inactive"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Position</CardTitle>
                <TrendingUp className="h-5 w-5 text-precipitate-blue" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${positionSize > 0 ? 'text-green-400' : positionSize < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                    {isLoading ? "Loading..." : `${positionSize.toFixed(4)} BTC`}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Signal</CardTitle>
                <AlertCircle className="h-5 w-5 text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "Loading..." : (status?.lastSignal || "Awaiting Run")}</div>
                <p className="text-xs text-gray-400 pt-1">Based on last 5-day candle</p>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Next Scheduled Run</CardTitle>
                <Clock className="h-5 w-5 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "Loading..." : nextRun}</div>
                <p className="text-xs text-gray-400 pt-1">Daily check at 00:05 UTC</p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Log Table (Using Static Data as Placeholder) */}
          <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <p className="text-xs text-gray-500 pt-1">Note: This log is static sample data. Real-time logging requires a database.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-precipitate-light/30 hover:bg-precipitate-light/10">
                    <TableHead className="text-precipitate-light">Timestamp</TableHead>
                    <TableHead className="text-precipitate-light">Type</TableHead>
                    <TableHead className="text-precipitate-light">Details</TableHead>
                    <TableHead className="text-precipitate-light text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staticActivityLog.map((log) => (
                    <TableRow key={log.id} className="border-precipitate-light/30 hover:bg-precipitate-light/10">
                      <TableCell className="font-medium">{log.timestamp}</TableCell>
                      <TableCell>
                        <Badge className={`${log.type === "BUY" ? 'bg-green-600' : log.type === "SELL" ? 'bg-red-600' : log.type === "ERROR" ? 'bg-orange-600' : 'bg-precipitate-blue'} hover:opacity-80 text-white`}>
                          {log.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.details}</TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        {getStatusIcon(log.status)}
                        <span>{log.result}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
