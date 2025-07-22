//components/equity-curve.tsx
'use client'
import { useEffect, useState } from "react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts"
import dayjs from "dayjs"

type Point = { 
  ts: number
  date: string
  'Base Strategy (1x)': number
  'Leveraged 3x + Stop Loss': number
  'Leveraged 5x + Stop Loss': number
}

const INITIAL_CAPITAL = 10000 // $10,000 starting capital

export default function EquityCurve() {
  const [data, setData] = useState<Point[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        console.log('Fetching equity curve data...')
        const res = await fetch('/api/pnl')
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.details || `API Error: ${res.status}`)
        }
        
        const runs = await res.json() as {
          id: "BASE_1x" | "LEV3_SL63" | "LEV5_SL63"
          equityCurve: { ts: number; eq: number }[]
        }[]
        
        console.log('Received equity curve data:', runs.length, 'strategies')
        
        // Log the date range of each strategy for debugging
        runs.forEach(run => {
          if (run.equityCurve.length > 0) {
            const firstDate = new Date(run.equityCurve[0].ts).toISOString().substring(0, 10)
            const lastDate = new Date(run.equityCurve[run.equityCurve.length - 1].ts).toISOString().substring(0, 10)
            console.log(`${run.id}: ${run.equityCurve.length} data points from ${firstDate} to ${lastDate}`)
          }
        })
        
        /* merge three curves on the same time axis ---------------------- */
        const tmp: Record<number, any> = {}
        
        // Initialize with starting values for all strategies
        const startTs = Math.min(...runs.flatMap(run => run.equityCurve.map(p => p.ts)))
        tmp[startTs] = {
          ts: startTs,
          date: dayjs(startTs).format("YYYY-MM-DD"),
          'Base Strategy (1x)': INITIAL_CAPITAL,
          'Leveraged 3x + Stop Loss': INITIAL_CAPITAL,
          'Leveraged 5x + Stop Loss': INITIAL_CAPITAL
        }
        
        runs.forEach(run => {
          run.equityCurve.forEach(p => {
            if (!tmp[p.ts]) {
              tmp[p.ts] = { 
                ts: p.ts, 
                date: dayjs(p.ts).format("YYYY-MM-DD")
              }
            }
            // Convert equity multiplier to dollar amount
            const dollarValue = p.eq * INITIAL_CAPITAL
            
            if (run.id === "BASE_1x") {
              tmp[p.ts]['Base Strategy (1x)'] = dollarValue
            } else if (run.id === "LEV3_SL63") {
              tmp[p.ts]['Leveraged 3x + Stop Loss'] = dollarValue
            } else if (run.id === "LEV5_SL63") {
              tmp[p.ts]['Leveraged 5x + Stop Loss'] = dollarValue
            }
          })
        })
        
        // Sort and fill gaps with last known values
        const sortedData = Object.values(tmp).sort((a, b) => a.ts - b.ts)
        let lastValues = {
          'Base Strategy (1x)': INITIAL_CAPITAL,
          'Leveraged 3x + Stop Loss': INITIAL_CAPITAL,
          'Leveraged 5x + Stop Loss': INITIAL_CAPITAL
        }
        
        const merged = sortedData.map(point => {
          // Fill in missing values with last known values
          if (point['Base Strategy (1x)'] !== undefined) {
            lastValues['Base Strategy (1x)'] = point['Base Strategy (1x)']
          } else {
            point['Base Strategy (1x)'] = lastValues['Base Strategy (1x)']
          }
          
          if (point['Leveraged 3x + Stop Loss'] !== undefined) {
            lastValues['Leveraged 3x + Stop Loss'] = point['Leveraged 3x + Stop Loss']
          } else {
            point['Leveraged 3x + Stop Loss'] = lastValues['Leveraged 3x + Stop Loss']
          }
          
          if (point['Leveraged 5x + Stop Loss'] !== undefined) {
            lastValues['Leveraged 5x + Stop Loss'] = point['Leveraged 5x + Stop Loss']
          } else {
            point['Leveraged 5x + Stop Loss'] = lastValues['Leveraged 5x + Stop Loss']
          }
          
          return point
        })
        
        setData(merged)
        setError(null)
        console.log('Equity curve data processed successfully')
      } catch (error) {
        console.error("Failed to fetch equity curve data:", error)
        setError(error instanceof Error ? error.message : 'Failed to load equity curve data')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center text-precipitate-light/60">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-precipitate-light/60 mx-auto mb-4"></div>
          Loading equity curves...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center text-precipitate-light/60">
        <div className="text-center">
          <div className="text-red-400 mb-2">⚠️ Unable to load equity curves</div>
          <div className="text-sm text-precipitate-light/40">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-precipitate-blue hover:bg-precipitate-blue/80 rounded text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value.toFixed(0)}`
  }

  const formatTooltipCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="w-full h-[500px] bg-gradient-to-br from-precipitate-dark to-precipitate-dark/90 rounded-lg p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <defs>
            <linearGradient id="baseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
            </linearGradient>
            <linearGradient id="lev3Gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.05}/>
            </linearGradient>
            <linearGradient id="lev5Gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(ts) => dayjs(ts).format("YYYY")}
            stroke="#9CA3AF"
            fontSize={12}
            tickMargin={10}
            minTickGap={80}
            tickCount={8}
          />
          
          <YAxis
            domain={['dataMin * 0.95', 'dataMax * 1.05']}
            tickFormatter={formatCurrency}
            stroke="#9CA3AF"
            fontSize={12}
            tickMargin={10}
            orientation="left"
          />
          
          <Tooltip
            labelFormatter={(ts) => `Date: ${dayjs(ts as number).format("MMMM D, YYYY")}`}
            formatter={(value: number, name: string) => [formatTooltipCurrency(value), name]}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F9FAFB',
              fontSize: '14px'
            }}
            labelStyle={{ color: '#D1D5DB', fontWeight: 'bold' }}
          />
          
          <Legend 
            wrapperStyle={{ 
              paddingTop: '20px',
              color: '#D1D5DB',
              fontSize: '14px'
            }}
          />
          
          <Area
            type="monotone"
            dataKey="Base Strategy (1x)"
            stroke="#3B82F6"
            strokeWidth={2.5}
            fill="url(#baseGradient)"
            dot={false}
            connectNulls={true}
          />
          
          <Area
            type="monotone"
            dataKey="Leveraged 3x + Stop Loss"
            stroke="#10B981"
            strokeWidth={2.5}
            fill="url(#lev3Gradient)"
            dot={false}
            connectNulls={true}
          />
          
          <Area
            type="monotone"
            dataKey="Leveraged 5x + Stop Loss"
            stroke="#F59E0B"
            strokeWidth={2.5}
            fill="url(#lev5Gradient)"
            dot={false}
            connectNulls={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
