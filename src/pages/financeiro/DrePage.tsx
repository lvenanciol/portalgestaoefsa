import { useMemo, useState } from 'react'
import { Table2, Download, TrendingUp, TrendingDown } from 'lucide-react'
import { DRE_LINHAS, MESES_12 } from '@/data/financeiroData'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { useBotoes } from '@/services/botoes-service'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Fase 4 — DRE: matriz 12 meses + coluna YTD, linhas de grupo em negrito
// com fundo, gráfico de composição do resultado e export CSV.

const fmtK = (v: number) =>
  (v < 0 ? '(' : '') +
  Math.abs(v / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) +
  (v < 0 ? ')' : '')

const fmtPct = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export default function DrePage() {
  const [mesSelecionado, setMesSelecionado] = useState(11) // Out/26 (índice)
  const { pode } = useBotoes()

  const idx = useMemo(() => {
    const m: Record<string, number> = {}
    DRE_LINHAS.forEach((l, i) => (m[l.label] = i))
    return m
  }, [])

  const ytd = useMemo(
    () => DRE_LINHAS.map((l) => l.valores.slice(2).reduce((a, b) => a + b, 0)),
    [],
  )

  const receitaBruta = DRE_LINHAS[idx['RECEITA OPERACIONAL BRUTA']].valores[mesSelecionado]
  const lucroLiquido = DRE_LINHAS[idx['LUCRO LÍQUIDO']].valores[mesSelecionado]
  const ebitda = DRE_LINHAS[idx['EBITDA']].valores[mesSelecionado]
  const margemLiquida = (lucroLiquido / receitaBruta) * 100

  const exportCsv = () => {
    const header = [
      'Conta',
      'Descrição',
      ...MESES_12.map((m) => m.short + '/' + String(m.ano).slice(2)),
      'YTD',
    ]
    const rows = DRE_LINHAS.map((l) => [
      l.conta,
      l.label,
      ...l.valores.map((v) => String(v)),
      String(ytd[DRE_LINHAS.indexOf(l)]),
    ])
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dre-12m.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // barras de composição do mês selecionado
  const composicao = [
    { label: 'CMV', v: Math.abs(DRE_LINHAS[idx['CMV']].valores[mesSelecionado]), cor: '#1B5E20' },
    {
      label: 'Vendas',
      v: Math.abs(DRE_LINHAS[idx['Despesas com vendas']].valores[mesSelecionado]),
      cor: '#F59E0B',
    },
    {
      label: 'Admin.',
      v: Math.abs(DRE_LINHAS[idx['Despesas administrativas']].valores[mesSelecionado]),
      cor: '#3B82F6',
    },
    {
      label: 'Logística',
      v: Math.abs(DRE_LINHAS[idx['Despesas logísticas']].valores[mesSelecionado]),
      cor: '#9CA3AF',
    },
    { label: 'Lucro', v: lucroLiquido, cor: '#059669' },
  ]
  const totalComp = composicao.reduce((a, c) => a + c.v, 0)

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Table2 className="h-6 w-6 text-[#1B5E20]" />
            DRE Gerencial
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Demonstração do Resultado — 12 meses (R$ mil) · consolidado grupo
          </p>
        </div>
        {pode('financeiro', 'exportar_csv') && (
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        )}
      </div>

      {/* KPIs do mês selecionado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Receita bruta', v: fmtK(receitaBruta), cor: 'text-gray-900' },
          { label: 'EBITDA', v: fmtK(ebitda), cor: 'text-gray-900' },
          { label: 'Lucro líquido', v: fmtK(lucroLiquido), cor: 'text-emerald-700' },
          { label: 'Margem líquida', v: fmtPct(margemLiquida), cor: 'text-emerald-700' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {k.label}
            </div>
            <div className={cn('text-lg font-bold tabular-nums mt-1', k.cor)}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Matriz DRE */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#1B5E20]" />
            <span className="text-sm font-bold text-gray-900">
              Matriz DRE — clique no mês para destacar
            </span>
          </div>
          <span className="text-[11px] text-gray-400">valores em R$ mil</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky left-0 bg-gray-50/80 z-10 min-w-[220px]">
                  Conta / Descrição
                </th>
                {MESES_12.map((m, i) => (
                  <th
                    key={m.key}
                    onClick={() => setMesSelecionado(i)}
                    className={cn(
                      'px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
                      i === mesSelecionado
                        ? 'text-[#1B5E20] bg-emerald-50'
                        : 'text-gray-500 hover:text-gray-800',
                    )}
                  >
                    {m.short}
                  </th>
                ))}
                <th className="px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-900 bg-gray-100/60">
                  YTD
                </th>
              </tr>
            </thead>
            <tbody>
              {DRE_LINHAS.map((l) => {
                const isGrupo = l.nivel === 1
                return (
                  <tr
                    key={l.conta}
                    className={cn(
                      'border-b border-gray-50 transition-colors',
                      isGrupo ? 'bg-emerald-50/40 font-bold' : 'hover:bg-gray-50/60',
                    )}
                  >
                    <td
                      className={cn(
                        'px-4 py-2 text-left sticky left-0 z-10 bg-inherit min-w-[220px]',
                        isGrupo ? 'text-[#1B5E20]' : 'text-gray-700 pl-8',
                      )}
                    >
                      <span className="text-[10px] text-gray-400 font-semibold mr-2 tabular-nums">
                        {l.conta}
                      </span>
                      {l.label}
                    </td>
                    {l.valores.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          'px-2.5 py-2 text-[12px] tabular-nums',
                          v < 0 && 'text-red-600',
                          i === mesSelecionado && 'bg-emerald-50/60 font-semibold',
                        )}
                      >
                        {fmtK(v)}
                      </td>
                    ))}
                    <td className="px-2.5 py-2 text-[12px] tabular-nums font-bold bg-gray-50/60">
                      {fmtK(ytd[DRE_LINHAS.indexOf(l)])}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Composição do resultado do mês */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-bold text-gray-900">
              Composição do resultado — {MESES_12[mesSelecionado].label}
            </span>
          </div>
        </div>
        <div className="flex h-8 w-full rounded-lg overflow-hidden border border-gray-100">
          {composicao.map((c) => (
            <div
              key={c.label}
              style={{ width: `${(c.v / totalComp) * 100}%`, backgroundColor: c.cor }}
              className="h-full transition-all duration-300"
              title={`${c.label}: ${fmtK(c.v)}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          {composicao.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.cor }} />
              <span className="text-gray-600 font-medium">{c.label}</span>
              <span className="font-bold text-gray-900 tabular-nums">{fmtK(c.v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Parecer IA — DRE do mês selecionado (dados de demonstração) */}
      <ParecerIaCard
        titulo={'Parecer IA — DRE ' + MESES_12[mesSelecionado].label}
        contexto={
          'DRE gerencial de ' +
          MESES_12[mesSelecionado].label +
          ' (dados de demonstração, R$ mil): ' +
          'receita bruta ' +
          fmtK(receitaBruta) +
          ', CMV ' +
          fmtK(DRE_LINHAS[idx['CMV']].valores[mesSelecionado]) +
          ', lucro bruto ' +
          fmtK(DRE_LINHAS[idx['LUCRO BRUTO']].valores[mesSelecionado]) +
          ', EBITDA ' +
          fmtK(ebitda) +
          ', lucro líquido ' +
          fmtK(lucroLiquido) +
          ', margem líquida ' +
          fmtPct(margemLiquida) +
          '.'
        }
        prompt="Analise a DRE do mês (receita, custos, despesas, EBITDA e margem). Compare implicitamente com benchmarks de varejo alimentar frescos, aponte desvios e dê 2-3 recomendações de melhoria de margem."
      />
    </div>
  )
}
