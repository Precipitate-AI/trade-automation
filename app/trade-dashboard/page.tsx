import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2, Clock, TrendingUp, MinusCircle } from "lucide-react"

// Sample data - in a real app, this would come from an API
const botStatus = {
  status: "Active",
  color: "bg-green-500",
  icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
}
const currentPosition = "0.00 BTC" // Example: "0.15 BTC", "-0.05 BTC"
const lastSignal = "Hold - No Signal" // Example: "BUY Executed", "SELL Signal"
const nextRun = "In 20 hours..." // This would be dynamic

const activityLog = [
  {
    id: 1,
    timestamp: "2024-06-24 10:05:15 UTC",
    type: "BUY",
    details: "Signal: Close > EMA. Order Size: 0.0015 BTC at $69,500",
    result: "Executed",
    status: "success",
  },
  {
    id: 2,
    timestamp: "2024-06-24 00:00:05 UTC",
    type: "CHECK",
    details: "Daily cron trigger. Execution day.",
    result: "Processed",
    status: "info",
  },
  {
    id: 3,
    timestamp: "2024-06-23 00:00:03 UTC",
    type: "CHECK",
    details: "Daily cron trigger. Not execution day.",
    result: "Skipped",
    status: "neutral",
  },
  {
    id: 4,
    timestamp: "2024-06-19 14:30:00 UTC",
    type: "SELL",
    details: "Signal: Close < EMA. Position Closed: 0.0012 BTC",
    result: "Executed",
    status: "success",
  },
  {
    id: 5,
    timestamp: "2024-06-10 08:15:00 UTC",
    type: "ERROR",
    details: "Failed to fetch candle data from exchange API.",
    result: "Failed",
    status: "error",
  },
]

const getStatusIcon = (status: string) => {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case "info":
      return <TrendingUp className="h-4 w-4 text-blue-500" /> // Or appropriate icon
    case "neutral":
      return <MinusCircle className="h-4 w-4 text-gray-500" />
    default:
      return <MinusCircle className="h-4 w-4 text-gray-500" />
  }
}

export default function TradeDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col bg-precipitate-dark text-precipitate-light">
      {/* Header is handled by layout.tsx */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 pt-20 md:pt-24">
        {" "}
        {/* Added padding-top for fixed header */}
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-precipitate-light">Trade Automation Status</h1>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
                {botStatus.icon}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold flex items-center">
                  <span className={`h-3 w-3 rounded-full ${botStatus.color} inline-block mr-2`}></span>
                  {botStatus.status}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Position</CardTitle>
                <TrendingUp className="h-5 w-5 text-precipitate-blue" /> {/* Or appropriate icon */}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{currentPosition}</div>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Signal</CardTitle>
                <AlertCircle className="h-5 w-5 text-amber-400" /> {/* Or appropriate icon */}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lastSignal}</div>
                <p className="text-xs text-gray-400 pt-1">Based on last 5-day candle</p>
              </CardContent>
            </Card>
            <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Next Scheduled Run</CardTitle>
                <Clock className="h-5 w-5 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{nextRun}</div>
                <p className="text-xs text-gray-400 pt-1">Daily check at 00:00 UTC</p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Log Table */}
          <Card className="bg-precipitate-light/5 border-precipitate-light/20 text-precipitate-light">
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
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
                  {activityLog.map((log) => (
                    <TableRow key={log.id} className="border-precipitate-light/30 hover:bg-precipitate-light/10">
                      <TableCell className="font-medium">{log.timestamp}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.type === "BUY"
                              ? "default"
                              : log.type === "SELL"
                                ? "destructive"
                                : log.type === "ERROR"
                                  ? "destructive"
                                  : "secondary"
                          }
                          className={
                            log.type === "BUY"
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : log.type === "SELL"
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : log.type === "ERROR"
                                  ? "bg-orange-600 hover:bg-orange-700 text-white"
                                  : "bg-precipitate-blue hover:bg-blue-600 text-white"
                          }
                        >
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
      {/* Footer is handled by layout.tsx */}
    </div>
  )
}
