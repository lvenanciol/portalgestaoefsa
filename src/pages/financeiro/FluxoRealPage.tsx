import { useEffect, useMemo, useState } from 'react'
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
import { Waves, Download, Loader2, RefreshCw, Database, FlaskConical } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { FLUXO_12 } from '@/data/financeiroData'
import { useBotoes } from '@/services/botoes-service'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Fase 6b — Fluxo de Caixa REAL: entradas/saídas = baixas TGFFIN (DHBAIXA),
// saldo inicial em cadeia a partir do saldo do mês anterior. Fallback: mock.

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

export default function FluxoRealPage() {
  const [dados, setDados] = useState<any[] | null>(null)
  const [fonte, setFonte] = useState<'real' | 'mock'>('real')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const { pode } = useBotoes()

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/financeiro/real', { method: 'POST' })) as {
        fluxo?: [string, number, number][]
      }
      const rows = r.fluxo || []
      if (rows.length === 0) throw new Error('sem dados de fluxo')
      // saldo inicial em cadeia: começa em 0 no 1º mês da janela
      let saldo = 0
      const lista = rows
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((m) => {
          const saldoInicial = saldo
          saldo = saldoInicial + m[1] - m[2]
          return {
            key: m[0],
            label: m[0].slice(5) + '/' + m[0].slice(2, 4),
            entradas: m[1],
            saidas: m[2],
            saldoInicial,
            saldoFinal: saldo,
          }
        })
      setDados(lista)
      setFonte('real')
    } catch (e) {
      // fallback mock
      const mock = FLUXO_12.map((m) => ({
        key: m.key,
        label: m.label,
        entradas: m.entradas * 1000,
        saidas: m.saidas * 1000,
        saldoInicial: m.saldoInicial * 1000,
        saldoFinal: (m.saldoInicial + m.entradas - m.saidas) * 1000,
      }))
      setDados(mock)
      setFonte('mock')
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const exportCsv = () => {
    if (!dados) return
    const header = ['Mês', 'Saldo inicial', 'Entradas', 'Saídas', 'Saldo final']
    const rows = dados.map((m) => [m.label, m.saldoInicial, m.entradas, m.saidas, m.saldoFinal])
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fluxo-caixa-real.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const ultimo = dados && dados.length ? dados[dados.length - 1] : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {fonte === 'real' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="h-3 w-3" /> Real — baixas TGFFIN
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <FlaskConical className="h-3 w-3" /> Demonstração (mock)
            </span>
          )}
          {erro && fonte === 'mock' && (
            <span className="text-[11px] text-gray-400 truncate max-w-[300px]">({erro})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} className="h-9">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          {pode('financeiro', 'exportar_csv') && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
          <span className="ml-2 text-sm text-gray-500">Consultando baixas no Sankhya...</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          {ultimo && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'SALDO ACUMULADO 12M', v: 'R$ ' + fmtK(ultimo.saldoFinal) + ' mil' },
                { label: 'ENTRADAS ' + ultimo.label, v: 'R$ ' + fmtK(ultimo.entradas) + ' mil' },
                { label: 'SAÍDAS ' + ultimo.label, v: 'R$ ' + fmtK(ultimo.saidas) + ' mil' },
                {
                  label: 'RESULTADO DO MÊS',
                  v: 'R$ ' + fmtK(ultimo.entradas - ultimo.saidas) + ' mil',
                  cor: ultimo.entradas - ultimo.saidas >= 0 ? 'text-emerald-700' : 'text-red-600',
                },
              ].map((k) => (
                <div
                  key={k.label}
                  className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {k.label}
                  </div>
                  <div
                    className={cn('text-lg font-bold tabular-nums mt-1', k.cor || 'text-gray-900')}
                  >
                    {k.v}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gráfico */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
            <div className="text-sm font-bold text-gray-900 mb-4">
              Movimentação e saldo — 12 meses (R$ mil)
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

          {/* Tabela */}
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
                  {dados?.map((m) => {
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
                          className={cn(
                            'px-3 py-2 text-[12px] tabular-nums font-semibold',
                            res >= 0 ? 'text-emerald-700' : 'text-red-600',
                          )}
                        >
                          {fmtK(res)}
                        </td>
                        <td className="px-3 py-2 text-[12px] tabular-nums font-bold bg-gray-50/60">
                          {fmtK(m.saldoFinal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parecer IA — contexto conforme a fonte */}
          <ParecerIaCard
            titulo="Parecer IA — fluxo de caixa"
            contexto={
              fonte === 'real' && dados
                ? 'Fluxo de caixa REAL (baixas TGFFIN, 12m): ' +
                  dados
                    .map(
                      (m) =>
                        m.label +
                        ' entradas R$ ' +
                        fmtK(m.entradas) +
                        ' mil, saídas R$ ' +
                        fmtK(m.saidas) +
                        ' mil',
                    )
                    .join('; ') +
                  '. Saldo acumulado 12m: R$ ' +
                  fmtK(dados[dados.length - 1].saldoFinal) +
                  ' mil.'
                : 'Fluxo de caixa de demonstração (mock) — dados não reais.'
            }
            prompt="Analise o fluxo de caixa (entradas vs saídas por mês, saldo acumulado). Destaque meses de pressão de caixa, tendência e 2-3 recomendações de gestão de tesouraria."
          />
        </>
      )}
    </div>
  )
}
