import {
  ResponsiveContainer,
  LineChart,
  Line,
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
    name: string
    color: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-lg text-xs space-y-1">
        <div className="text-gray-500 font-medium">{label}</div>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600 font-medium">{entry.name}</span>
            </div>
            <span className="font-bold text-gray-900 tabular-nums">
              {entry.value.toFixed(1).replace('.', ',')}%
            </span>
          </div>
        ))}
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
          <h3 className="text-sm font-bold text-gray-900">Margem Bruta % — 12 meses</h3>
          <p className="text-[11px] text-gray-500">Evolução mensal por empresa</p>
        </div>
      </div>

      {/* Legenda 2 séries */}
      <div className="flex items-center gap-3 text-xs font-medium text-gray-600 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1B5E20]" />
          <span>Extrafruti</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <span>Casafruti</span>
        </div>
      </div>

      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
            />
            <YAxis
              domain={[10, 30]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="extrafruti"
              name="Extrafruti"
              stroke="#1B5E20"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: '#1B5E20', strokeWidth: 1, stroke: '#FFFFFF' }}
              activeDot={{ r: 4, fill: '#16A34A' }}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="casafruti"
              name="Casafruti"
              stroke="#F59E0B"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: '#F59E0B', strokeWidth: 1, stroke: '#FFFFFF' }}
              activeDot={{ r: 4, fill: '#F59E0B' }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
