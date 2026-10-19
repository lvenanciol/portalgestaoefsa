import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Waves, Download } from 'lucide-react'
import { FLUXO_12 } from '@/data/financeiroData'
import { csvHeader, idiomaSalvo } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

// Fase 4 — Fluxo de Caixa: entradas/saídas (barras) + saldo final (linha),
// tabela mensal com saldo inicial/final e export CSV.

const fmtK = (v: number) =>
  (v < 0 ? '(' : '') +
  Math.abs(v / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) +
  (v < 0 ? ')' : '')

function TooltipFluxo({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any[]
  label?: string
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5 min-w-[180px]">
        <div className="font-bold text-gray-800 border-b border-gray-100 pb-1">{label}</div>
        {payload.map((e) => (
          <div key={e.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: e.color }}
              />
              <span className="text-gray-600 font-medium">{e.name}</span>
            </div>
            <span className="font-semibold text-gray-900 tabular-nums">R$ {fmtK(e.value)} mil</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function FluxoPage() {
  const dados = useMemo(
    () =>
      FLUXO_12.map((m) => ({
        ...m,
        saldoFinal: m.saldoInicial + m.entradas - m.saidas,
      })),
    [],
  )

  const exportCsv = () => {
    const header = csvHeader(idiomaSalvo(), [
      'csv_mes',
      'csv_saldo_inicial',
      'csv_entradas',
      'csv_saidas',
      'csv_saldo_final',
    ])
    const rows = dados.map((m) => [m.label, m.saldoInicial, m.entradas, m.saidas, m.saldoFinal])
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fluxo-caixa-12m.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const ultimo = dados[dados.length - 1]

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Waves className="h-6 w-6 text-[#1B5E20]" />
            Fluxo de Caixa
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Entradas, saídas e saldo — 12 meses (R$ mil) · consolidado grupo
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
          <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Saldo atual',
            v: 'R$ ' + fmtK(ultimo.saldoInicial + ultimo.entradas - ultimo.saidas) + ' mil',
          },
          { label: 'Entradas Out/26', v: 'R$ ' + fmtK(ultimo.entradas) + ' mil' },
          { label: 'Saídas Out/26', v: 'R$ ' + fmtK(ultimo.saidas) + ' mil' },
          {
            label: 'Resultado do mês',
            v: 'R$ ' + fmtK(ultimo.entradas - ultimo.saidas) + ' mil',
            cor: ultimo.entradas - ultimo.saidas >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {k.label}
            </div>
            <div className={'text-lg font-bold tabular-nums mt-1 ' + (k.cor || 'text-gray-900')}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-gray-900">Movimentação e saldo — 12 meses</span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(v) => `${v / 1000}M`}
              />
              <Tooltip content={<TooltipFluxo />} cursor={{ fill: '#F9FAFB' }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar
                dataKey="entradas"
                name="Entradas"
                fill="#1B5E20"
                radius={[4, 4, 0, 0]}
                animationDuration={600}
              />
              <Bar
                dataKey="saidas"
                name="Saídas"
                fill="#F59E0B"
                radius={[4, 4, 0, 0]}
                animationDuration={600}
              />
              <Line
                type="monotone"
                dataKey="saldoFinal"
                name="Saldo final"
                stroke="#0F3D13"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0F3D13' }}
                animationDuration={700}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela mensal */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-900">Detalhamento mensal</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Mês
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Saldo inicial
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Entradas
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Saídas
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Resultado
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-900 bg-gray-100/60">
                  Saldo final
                </th>
              </tr>
            </thead>
            <tbody>
              {dados.map((m) => {
                const res = m.entradas - m.saidas
                return (
                  <tr
                    key={m.key}
                    className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                  >
                    <td className="px-4 py-2 text-left text-[12px] font-semibold text-gray-800">
                      {m.label}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-gray-600">
                      {fmtK(m.saldoInicial)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-emerald-700 font-medium">
                      {fmtK(m.entradas)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-red-600 font-medium">
                      {fmtK(m.saidas)}
                    </td>
                    <td
                      className={
                        'px-3 py-2 text-[12px] tabular-nums font-semibold ' +
                        (res >= 0 ? 'text-emerald-700' : 'text-red-600')
                      }
                    >
                      {fmtK(res)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums font-bold bg-gray-50/60">
                      {fmtK(m.saldoInicial + res)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
