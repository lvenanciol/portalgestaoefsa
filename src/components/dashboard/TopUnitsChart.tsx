import { BarChart3 } from 'lucide-react'

export interface UnitRevenueItem {
  name: string
  value: number // pode vir em Milhões (se mock) ou em Reais (se Sankhya real)
  isMilhoes?: boolean
}

interface TopUnitsChartProps {
  data: UnitRevenueItem[]
  subtitulo?: string
}

export function TopUnitsChart({
  data,
  subtitulo = 'Receita acumulada 12 meses (TGFCAB)',
}: TopUnitsChartProps) {
  const semDados = !data || data.length === 0
  const max = semDados ? 1 : Math.max(...data.map((d) => d.value))

  const formatarValor = (val: number, isMilhoes?: boolean) => {
    // Se o valor já for pequeno (ex: < 500) e tiver flag ou escala de milhões
    if (isMilhoes || (val < 1000 && val > 0)) {
      return `R$ ${val.toFixed(1).replace('.', ',')}M`
    }
    if (val >= 1_000_000) {
      return `R$ ${(val / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
    }
    if (val >= 1000) {
      return `R$ ${(val / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`
    }
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
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
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">Top Unidades / Empresas</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#1B5E20] border border-emerald-200">
                Real
              </span>
            </div>
            <p className="text-[11px] text-gray-500">{subtitulo}</p>
          </div>
        </div>
      </div>

      {semDados ? (
        <div className="h-32 flex items-center justify-center text-xs text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
          Sem dados no momento
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((unit) => (
            <div key={unit.name} className="flex items-center gap-3">
              <span
                className="w-36 shrink-0 text-xs font-semibold text-gray-700 truncate"
                title={unit.name}
              >
                {unit.name}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                <div
                  className="h-full bg-[#1B5E20] rounded-md transition-all duration-700"
                  style={{ width: `${Math.max(4, (unit.value / (max || 1)) * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-bold text-gray-900 tabular-nums">
                {formatarValor(unit.value, unit.isMilhoes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
