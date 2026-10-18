import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { MarginPoint } from '@/data/mockData'

interface MarginLineChartProps {
  data: MarginPoint[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-lg text-xs space-y-1">
        <div className="text-gray-500 font-medium">{label} 2025</div>
        <div className="font-bold text-[#1B5E20] text-sm tabular-nums">
          {payload[0].value.toFixed(1)}%
        </div>
      </div>
    )
  }
  return null
}

export function MarginLineChart({ data }: MarginLineChartProps) {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 350ms both',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Margem Bruta 12m</h3>
          <p className="text-[11px] text-gray-500">Média consolidada do grupo (%)</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
            Meta: 32%
          </span>
        </div>
      </div>

      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1B5E20" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1B5E20" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
            />
            <YAxis
              domain={[30, 35]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="margem"
              stroke="#1B5E20"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#marginGradient)"
              animationDuration={900}
              animationEasing="ease-out"
              dot={{ r: 2.5, fill: '#1B5E20', strokeWidth: 1, stroke: '#FFFFFF' }}
              activeDot={{ r: 4, fill: '#16A34A' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
