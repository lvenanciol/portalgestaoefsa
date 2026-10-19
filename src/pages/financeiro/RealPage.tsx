import { useEffect, useMemo, useState } from 'react'
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
import { Database, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { Button } from '@/components/ui/button'
import { useBotoes } from '@/services/botoes-service'
import { cn } from '@/lib/utils'

// Fase 6 — Aba "Real (Sankhya)": faturamento 12m por empresa, A/P e A/R
// abertos (aging + top 5), KPIs consolidados e Parecer IA sobre os números.

const fmtBRL = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

const fmtMilhoes = (v: number) => {
  const m = Math.abs(v) / 1_000_000
  return (
    'R$ ' + m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  )
}

interface FinReal {
  ok: boolean
  gerado_em?: string
  empresas?: [number, string][]
  fat?: [string, number, number][] // MES, CODEMP, TOT
  ap_mensal?: [string, number, number][]
  ar_mensal?: [string, number, number][]
  ap_aging?: [string, number, number][]
  ar_aging?: [string, number, number][]
  ap_top?: [string, number][]
  ar_top?: [string, number][]
  falhas?: string[]
}

function TooltipFat({
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
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs">
        <div className="font-bold text-gray-800 border-b border-gray-100 pb-1 mb-1">{label}</div>
        {payload.map((p) => (
          <div key={p.name} className="flex justify-between gap-3">
            <span className="text-gray-600 font-medium">{p.name}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{fmtBRL(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

function AgingCard({ titulo, buckets }: { titulo: string; buckets?: [string, number, number][] }) {
  const ordem = ['vencido', '0-30d', '31-60d', '+60d']
  const cores: Record<string, string> = {
    vencido: 'bg-red-600',
    '0-30d': 'bg-emerald-600',
    '31-60d': 'bg-amber-500',
    '+60d': 'bg-orange-500',
  }
  const rotulos: Record<string, string> = {
    vencido: 'Vencido',
    '0-30d': 'A vencer (30d)',
    '31-60d': '31–60 dias',
    '+60d': '+60 dias',
  }
  const mapa = new Map<string, [number, number]>()
  ;(buckets || []).forEach((b) => mapa.set(b[0], [b[1], b[2]]))
  const total = (buckets || []).reduce((a, b) => a + b[1], 0) || 1
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
      <div className="text-sm font-bold text-gray-900 mb-3">{titulo}</div>
      <div className="space-y-2.5">
        {ordem.map((f) => {
          const v = mapa.get(f)?.[0] || 0
          const n = mapa.get(f)?.[1] || 0
          return (
            <div key={f}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 font-semibold text-gray-700">
                  <span className={cn('w-2 h-2 rounded-full', cores[f])} />
                  {rotulos[f]}
                </span>
                <span className="tabular-nums font-bold text-gray-900">{fmtBRL(v)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', cores[f])}
                  style={{ width: `${(v / total) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {n} título(s) · {((v / total) * 100).toFixed(0)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function RealPage() {
  const { pode } = useBotoes()
  const [dados, setDados] = useState<FinReal | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/financeiro/real', { method: 'POST' })
      setDados(r as FinReal)
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const agg = useMemo(() => {
    if (!dados) return null
    const nomeEmpresa = new Map<number, string>()
    ;(dados.empresas || []).forEach((e) => nomeEmpresa.set(Number(e[0]), String(e[1])))

    // faturamento consolidado por mês
    const porMes = new Map<string, number>()
    ;(dados.fat || []).forEach((r) => porMes.set(r[0], (porMes.get(r[0]) || 0) + r[2]))
    const fatMensal = Array.from(porMes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, tot]) => ({ mes: mes.slice(5) + '/' + mes.slice(2, 4), total: tot }))

    // faturamento por empresa (12m)
    const porEmp = new Map<number, number>()
    ;(dados.fat || []).forEach((r) => porEmp.set(r[1], (porEmp.get(r[1]) || 0) + r[2]))
    const fatEmpresas = Array.from(porEmp.entries())
      .map(([cod, tot]) => ({ nome: nomeEmpresa.get(cod) || 'Emp ' + cod, total: tot }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const fatTotal = Array.from(porMes.values()).reduce((a, b) => a + b, 0)
    const apTotal = (dados.ap_mensal || []).reduce((a, r) => a + r[1], 0)
    const arTotal = (dados.ar_mensal || []).reduce((a, r) => a + r[1], 0)
    const vencidoAp = (dados.ap_aging || []).find((b) => b[0] === 'vencido')?.[1] || 0
    const vencidoAr = (dados.ar_aging || []).find((b) => b[0] === 'vencido')?.[1] || 0
    const ultimoMes = fatMensal.length ? fatMensal[fatMensal.length - 1].mes : ''

    return { fatMensal, fatEmpresas, fatTotal, apTotal, arTotal, vencidoAp, vencidoAr, ultimoMes }
  }, [dados])

  const contextoParecer = agg
    ? 'Faturamento 12m consolidado: ' +
      fmtBRL(agg.fatTotal) +
      '. Último mês: ' +
      agg.ultimoMes +
      '. A/P aberto (12m): ' +
      fmtBRL(agg.apTotal) +
      ', vencido: ' +
      fmtBRL(agg.vencidoAp) +
      '. A/R aberto (12m): ' +
      fmtBRL(agg.arTotal) +
      ', vencido: ' +
      fmtBRL(agg.vencidoAr) +
      '. Maiores fornecedores em aberto: ' +
      (dados.ap_top || []).map((t) => t[0] + ' (' + fmtBRL(t[1]) + ')').join('; ') +
      '. Maiores clientes em aberto: ' +
      (dados.ar_top || []).map((t) => t[0] + ' (' + fmtBRL(t[1]) + ')').join('; ') +
      '. Faturamento por empresa (top): ' +
      agg.fatEmpresas.map((f) => f.nome + ' ' + fmtBRL(f.total)).join('; ')
    : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
        <span className="ml-2 text-sm text-gray-500">Consultando Sankhya via proxy...</span>
      </div>
    )
  }

  if (erro || !dados || !agg) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Erro ao carregar dados reais: {erro || 'sem dados'}
        <Button variant="outline" size="sm" className="ml-auto" onClick={carregar}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {dados.falhas && dados.falhas.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          Consultas com falha: {dados.falhas.join(' · ')}
        </div>
      )}

      {/* KPIs reais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'FATURAMENTO 12M', v: fmtMilhoes(agg.fatTotal), cor: 'text-gray-900' },
          { label: 'A PAGAR ABERTO', v: fmtMilhoes(agg.apTotal), cor: 'text-red-600' },
          { label: 'A RECEBER ABERTO', v: fmtMilhoes(agg.arTotal), cor: 'text-emerald-700' },
          {
            label: 'VENCIDO (A/P + A/R)',
            v: fmtMilhoes(agg.vencidoAp + agg.vencidoAr),
            cor: 'text-red-600',
          },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {k.label}
            </div>
            <div className={cn('text-lg font-bold tabular-nums mt-1', k.cor)}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Faturamento mensal consolidado */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#1B5E20]" />
            <span className="text-sm font-bold text-gray-900">
              Faturamento mensal — 12 meses (todas as empresas)
            </span>
          </div>
          <span className="text-[11px] text-gray-400">NFs liberadas · TGFCAB</span>
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agg.fatMensal} margin={{ top: 10, right: 10, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="mes"
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1_000_000 ? Math.round(v / 1_000_000) + 'M' : Math.round(v / 1000) + 'k'
                }
              />
              <Tooltip content={<TooltipFat />} cursor={{ fill: '#F9FAFB' }} />
              <Bar
                dataKey="total"
                name="Faturamento"
                fill="#1B5E20"
                radius={[4, 4, 0, 0]}
                animationDuration={600}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Aging A/P + A/R */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgingCard titulo="Contas a Pagar — aberto (12m)" buckets={dados.ap_aging} />
        <AgingCard titulo="Contas a Receber — aberto (12m)" buckets={dados.ar_aging} />
      </div>

      {/* Top 5 + empresas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="text-sm font-bold text-gray-900 mb-3">Top 5 fornecedores em aberto</div>
          <div className="space-y-2">
            {(dados.ap_top || []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-gray-700 font-medium truncate">{t[0]}</span>
                <span className="font-bold text-gray-900 tabular-nums shrink-0">
                  {fmtBRL(t[1])}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="text-sm font-bold text-gray-900 mb-3">Top 5 clientes em aberto</div>
          <div className="space-y-2">
            {(dados.ar_top || []).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-gray-700 font-medium truncate">{t[0]}</span>
                <span className="font-bold text-gray-900 tabular-nums shrink-0">
                  {fmtBRL(t[1])}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="text-sm font-bold text-gray-900 mb-3">Faturamento por empresa (12m)</div>
          <div className="space-y-2">
            {agg.fatEmpresas.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-gray-700 font-medium truncate">{f.nome}</span>
                <span className="font-bold text-gray-900 tabular-nums shrink-0">
                  {fmtMilhoes(f.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parecer IA */}
      <ParecerIaCard
        titulo="Parecer IA — posição financeira real"
        contexto={contextoParecer}
        prompt="Analise a posição financeira do grupo com base nestes dados reais do ERP. Destaque riscos (inadimplência, concentração, vencidos) e 2-3 recomendações práticas."
      />

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>Fonte: Sankhya via edge proxy (DbExplorerSP) · janela 12 meses</span>
        {pode('financeiro_real', 'atualizar') && (
          <button
            type="button"
            onClick={carregar}
            className="inline-flex items-center gap-1 hover:text-gray-600 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        )}
      </div>
    </div>
  )
}
