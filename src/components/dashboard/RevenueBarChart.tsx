import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { MonthlyRevenue } from '@/data/mockData'

interface RevenueBarChartProps {
  data: MonthlyRevenue[]
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
    const meses: Record<string, string> = {
      Nov: 'Nov/25',
      Dez: 'Dez/25',
      Jan: 'Jan/26',
      Fev: 'Fev/26',
      Mar: 'Mar/26',
      Abr: 'Abr/26',
      Mai: 'Mai/26',
      Jun: 'Jun/26',
      Jul: 'Jul/26',
      Ago: 'Ago/26',
      Set: 'Set/26',
      Out: 'Out/26',
    }
    return (
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5 min-w-[170px]">
        <div className="font-bold text-gray-800 border-b border-gray-100 pb-1 flex justify-between items-center">
          <span>{meses[label || ''] || label}</span>
        </div>
        <div className="space-y-1 pt-0.5">
          {payload.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 font-medium">{entry.name}</span>
              </div>
              <span className="font-semibold text-gray-900 tabular-nums">
                R$ {entry.value.toFixed(1).replace('.', ',')}M
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function RevenueBarChart({ data }: RevenueBarChartProps) {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 300ms both',
      }}
    >
      {/* Header com título e legenda 2 séries */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">Receita — Últimos 12 meses</h3>
          <p className="text-xs text-gray-500">
            Faturamento bruto mensal consolidado em R$ milhões
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3 text-xs font-medium text-gray-600 bg-gray-50/80 px-3 py-1.5 rounded-lg border border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1B5E20]" />
            <span>Extrafruti</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" />
            <span>Casafruti</span>
          </div>
        </div>
      </div>

      {/* Barras agrupadas — 2 séries (verde Extrafruti, laranja Casafruti) */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            barCategoryGap={6}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
            <XAxis
              dataKey="monthShort"
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6B7280', fontSize: 11 }}
              tickFormatter={(val) => `${val}M`}
              domain={[0, 25]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
            <Bar
              dataKey="extrafruti"
              name="Extrafruti"
              fill="#1B5E20"
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="casafruti"
              name="Casafruti"
              fill="#F59E0B"
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
