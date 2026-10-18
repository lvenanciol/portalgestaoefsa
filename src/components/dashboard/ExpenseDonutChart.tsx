import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { ExpenseSegment } from '@/data/mockData'

interface ExpenseDonutChartProps {
  data: ExpenseSegment[]
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: ExpenseSegment
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const item = payload[0].payload
    return (
      <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-lg text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-gray-800">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.name}</span>
        </div>
        <div className="font-bold text-gray-900 tabular-nums">{item.percentage}% das despesas</div>
      </div>
    )
  }
  return null
}

export function ExpenseDonutChart({ data }: ExpenseDonutChartProps) {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 400ms both',
      }}
    >
      <div className="mb-2">
        <h3 className="text-sm font-bold text-gray-900">Composição de Despesas</h3>
        <p className="text-[11px] text-gray-500">Distribuição percentual consolidada</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Rosca com 100% no centro */}
        <div className="relative w-[130px] h-[130px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={58}
                paddingAngle={3}
                dataKey="percentage"
                animationDuration={700}
                animationEasing="ease-out"
                stroke="#FFFFFF"
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Centro exibindo o total 100% */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[15px] font-extrabold text-gray-900 leading-none">100%</span>
            <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tighter mt-0.5">
              Total
            </span>
          </div>
        </div>

        {/* Legenda lateral com cor, nome e % de cada segmento (soma = 100%) */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {data.map((segment) => (
            <div key={segment.name} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                  style={{ backgroundColor: segment.color }}
                />
                <span
                  className="text-gray-600 truncate text-[11px] font-medium"
                  title={segment.name}
                >
                  {segment.name}
                </span>
              </div>
              <span className="font-bold text-gray-900 tabular-nums text-[12px] shrink-0">
                {segment.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
