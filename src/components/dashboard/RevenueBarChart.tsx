import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { MonthlyRevenueEmpresas } from '@/services/sankhya-dashboard-service'

interface RevenueBarChartProps {
  data: MonthlyRevenueEmpresas[]
  empresaSelecionada?: string // '' (consolidado), 'Extrafruti', 'Casafruti', 'FoldBox'
  ultimaAtualizacao?: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
    name: string
    color: string
    dataKey: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const total = payload.reduce((acc, cur) => acc + (cur.value || 0), 0)
    return (
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5 min-w-[190px]">
        <div className="font-bold text-gray-800 border-b border-gray-100 pb-1 flex justify-between items-center">
          <span>{label}</span>
          <span className="text-[10px] text-gray-400 font-normal">Sankhya ERP</span>
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
          {payload.length > 1 && (
            <div className="border-t border-gray-100 pt-1 mt-1 flex items-center justify-between font-bold text-gray-900">
              <span>Total Mês</span>
              <span>R$ {total.toFixed(1).replace('.', ',')}M</span>
            </div>
          )}
        </div>
      </div>
    )
  }
  return null
}

export function RevenueBarChart({
  data,
  empresaSelecionada = '',
  ultimaAtualizacao,
}: RevenueBarChartProps) {
  const isConsolidado = !empresaSelecionada || empresaSelecionada === 'Consolidado'
  const isExtrafruti = empresaSelecionada.toLowerCase().includes('extrafruti')
  const isCasafruti = empresaSelecionada.toLowerCase().includes('casafruti')
  const isFoldbox = empresaSelecionada.toLowerCase().includes('foldbox')

  const semDados = !data || data.length === 0

  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 300ms both',
      }}
    >
      {/* Header com título e legenda dinâmica */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">Receita — Últimos 12 meses</h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#1B5E20] border border-emerald-200">
              Real (Sankhya)
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {isConsolidado
              ? 'Faturamento bruto mensal por empresa em R$ milhões (TGFCAB)'
              : `Faturamento bruto mensal de ${empresaSelecionada} em R$ milhões (TGFCAB)`}
          </p>
        </div>

        {/* Legendas de cores */}
        <div className="flex items-center flex-wrap gap-3 text-xs font-medium text-gray-600 bg-gray-50/80 px-3 py-1.5 rounded-lg border border-gray-100">
          {(isConsolidado || isExtrafruti) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#1B5E20]" />
              <span>Extrafruti</span>
            </div>
          )}
          {(isConsolidado || isCasafruti) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" />
              <span>Casafruti</span>
            </div>
          )}
          {(isConsolidado || isFoldbox) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#0F3D13]" />
              <span>FoldBox</span>
            </div>
          )}
        </div>
      </div>

      {/* Gráfico de barras */}
      {semDados ? (
        <div className="h-[280px] w-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
          <p className="text-sm font-medium">
            Sem dados de faturamento sincronizados para este filtro.
          </p>
          <span className="text-xs mt-1 text-gray-400">
            Aguardando próxima sincronização ou selecione outra empresa.
          </span>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              barCategoryGap={isConsolidado ? 6 : 14}
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
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />

              {isConsolidado ? (
                <>
                  <Bar
                    dataKey="extrafruti"
                    name="Extrafruti"
                    fill="#1B5E20"
                    radius={[3, 3, 0, 0]}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="casafruti"
                    name="Casafruti"
                    fill="#F59E0B"
                    radius={[3, 3, 0, 0]}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Bar
                    dataKey="foldbox"
                    name="FoldBox"
                    fill="#0F3D13"
                    radius={[3, 3, 0, 0]}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </>
              ) : isExtrafruti ? (
                <Bar
                  dataKey="extrafruti"
                  name="Extrafruti"
                  fill="#1B5E20"
                  radius={[4, 4, 0, 0]}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              ) : isCasafruti ? (
                <Bar
                  dataKey="casafruti"
                  name="Casafruti"
                  fill="#F59E0B"
                  radius={[4, 4, 0, 0]}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              ) : (
                <Bar
                  dataKey="foldbox"
                  name="FoldBox"
                  fill="#0F3D13"
                  radius={[4, 4, 0, 0]}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {ultimaAtualizacao && (
        <div className="mt-2 text-[10px] text-gray-400 text-right">
          Sincronizado em {ultimaAtualizacao}
        </div>
      )}
    </div>
  )
}
