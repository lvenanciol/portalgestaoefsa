import { BarChart3 } from 'lucide-react'
import { UnitRevenue } from '@/data/mockData'

interface TopUnitsChartProps {
  data: UnitRevenue[]
}

// SPEC: barras horizontais Top Unidades por Receita (5 unidades, valores exatos)
export function TopUnitsChart({ data }: TopUnitsChartProps) {
  const max = Math.max(...data.map((d) => d.value))

  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 450ms both',
      }}
    >
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20]">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Top Unidades por Receita</h3>
            <p className="text-[11px] text-gray-500">Receita acumulada no período</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data.map((unit) => (
          <div key={unit.name} className="flex items-center gap-3">
            <span
              className="w-32 shrink-0 text-xs font-semibold text-gray-700 truncate"
              title={unit.name}
            >
              {unit.name}
            </span>
            <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
              <div
                className="h-full bg-[#1B5E20] rounded-md transition-all duration-700"
                style={{ width: `${(unit.value / max) * 100}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-bold text-gray-900 tabular-nums">
              R$ {unit.value.toFixed(1).replace('.', ',')}M
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
