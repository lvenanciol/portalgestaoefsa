import { useMemo } from 'react'
import { Scale, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { BALANCETE_OUT26 } from '@/data/financeiroData'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Fase 4 — Balancete: grades hierárquicas (conta/nome), quadratura
// (Σ débitos = Σ créditos) com fonte [rodapé] e export CSV.

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function BalancetePage() {
  const linhas = BALANCETE_OUT26

  const totais = useMemo(() => {
    const debitos = linhas.reduce((a, l) => a + l.debitos, 0)
    const creditos = linhas.reduce((a, l) => a + l.creditos, 0)
    return { debitos, creditos, quadrado: Math.abs(debitos - creditos) < 0.01 }
  }, [linhas])

  const exportCsv = () => {
    const header = ['Conta', 'Nome', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo atual']
    const rows = linhas.map((l) => [
      l.conta,
      l.nome,
      l.saldoAnterior,
      l.debitos,
      l.creditos,
      l.saldoAtual,
    ])
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'balancete-out26.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isGrupo = (conta: string) => !conta.includes('.')

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Scale className="h-6 w-6 text-[#1B5E20]" />
            Balancete
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Balancete analítico Outubro/2026 · Extrafruti (R$)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
          <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
        </Button>
      </div>

      {/* Quadratura */}
      <div
        className={cn(
          'rounded-xl border p-4 flex items-center gap-3',
          totais.quadrado ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
        )}
      >
        {totais.quadrado ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-600" />
        )}
        <div>
          <div className="text-sm font-bold text-gray-900">
            {totais.quadrado ? 'Quadratura fechada' : 'Quadratura aberta'} — fonte: rodapé do
            balancete
          </div>
          <div className="text-xs text-gray-600 tabular-nums">
            Σ Débitos {fmtBRL(totais.debitos)} = Σ Créditos {fmtBRL(totais.creditos)}
          </div>
        </div>
      </div>

      {/* Grade */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-bold text-gray-900">Balancete analítico — Out/26</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 min-w-[240px]">
                  Conta / Nome
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Saldo anterior
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Débitos
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Créditos
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-900 bg-gray-100/60">
                  Saldo atual
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const grupo = isGrupo(l.conta)
                const sub = l.conta.split('.').length === 2
                return (
                  <tr
                    key={l.conta}
                    className={cn(
                      'border-b border-gray-50 transition-colors',
                      grupo
                        ? 'bg-emerald-50/40 font-bold'
                        : sub
                          ? 'bg-gray-50/40 font-semibold'
                          : 'hover:bg-gray-50/60',
                    )}
                  >
                    <td className="px-4 py-2 text-left">
                      <span
                        className={cn(
                          'text-[12px]',
                          grupo ? 'text-[#1B5E20]' : sub ? 'text-gray-800' : 'text-gray-600',
                          !grupo && (sub ? '' : 'pl-4'),
                        )}
                      >
                        <span className="text-[10px] text-gray-400 font-semibold mr-2 tabular-nums">
                          {l.conta}
                        </span>
                        {l.nome}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-gray-600">
                      {fmtBRL(l.saldoAnterior)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-gray-800">
                      {fmtBRL(l.debitos)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-gray-800">
                      {fmtBRL(l.creditos)}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums font-bold bg-gray-50/60">
                      {fmtBRL(l.saldoAtual)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100/80 border-t-2 border-gray-200">
                <td className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  TOTAIS
                </td>
                <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums text-gray-900">—</td>
                <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums text-gray-900">
                  {fmtBRL(totais.debitos)}
                </td>
                <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums text-gray-900">
                  {fmtBRL(totais.creditos)}
                </td>
                <td className="px-3 py-2.5 text-[12px] font-bold tabular-nums text-gray-900">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
