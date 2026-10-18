import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { BarChart3, Loader2, RefreshCw, AlertTriangle, Database, Building2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Fase 8 — Desempenho por Unidade (REAL): faturamento e posição de títulos
// POR EMPRESA (unidade gerencial do grupo) direto do Sankhya via proxy.
// Nota: TGFCAB/TGFFIN são por CODEMP — a unidade gerencial do grupo é a
// empresa (Extrafruti/Casafruti/FoldBox + filiais). Fallback mock quando
// o proxy falha.

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
  empresas?: [number, string][]
  fat?: [string, number, number][]
  ap_por_empresa?: [number, string, number][]
  ar_por_empresa?: [number, string, number][]
  ap_mensal?: [string, number, number][]
  ar_mensal?: [string, number, number][]
  falhas?: string[]
}

function TooltipEmp({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs">
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

function RankingList({
  titulo,
  itens,
}: {
  titulo: string
  itens: { nome: string; total: number }[]
}) {
  const max = Math.max(...itens.map((i) => i.total), 1)
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
      <div className="text-sm font-bold text-gray-900 mb-3">{titulo}</div>
      <div className="space-y-2.5">
        {itens.map((i, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 text-gray-700 font-medium truncate">
                <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
                {i.nome}
              </span>
              <span className="font-bold text-gray-900 tabular-nums shrink-0">
                {fmtBRL(i.total)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1B5E20] transition-all"
                style={{ width: `${(i.total / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {itens.length === 0 && <p className="text-[12px] text-gray-400">Sem dados no período.</p>}
      </div>
    </div>
  )
}

export default function DesempenhoPage() {
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

    // Faturamento 12m por empresa (todas as CODEMP com NF liberada)
    const porEmp = new Map<number, number>()
    ;(dados.fat || []).forEach((r) => porEmp.set(r[1], (porEmp.get(r[1]) || 0) + r[2]))
    const fatEmpresas = Array.from(porEmp.entries())
      .map(([cod, tot]) => ({ nome: nomeEmpresa.get(cod) || 'Empresa ' + cod, total: tot }))
      .sort((a, b) => b.total - a.total)

    const fatTotal = fatEmpresas.reduce((a, f) => a + f.total, 0)
    const apPorEmp = (dados.ap_por_empresa || []).map((r) => ({
      nome: String(r[1]) || nomeEmpresa.get(Number(r[0])) || 'Empresa ' + r[0],
      total: Number(r[2]),
    }))
    const arPorEmp = (dados.ar_por_empresa || []).map((r) => ({
      nome: String(r[1]) || nomeEmpresa.get(Number(r[0])) || 'Empresa ' + r[0],
      total: Number(r[2]),
    }))
    const apTotal = apPorEmp.reduce((a, x) => a + x.total, 0)
    const arTotal = arPorEmp.reduce((a, x) => a + x.total, 0)

    // gráfico: top 8 empresas por faturamento
    const grafico = fatEmpresas.slice(0, 8).map((f) => ({ nome: f.nome, faturamento: f.total }))

    return { fatEmpresas, fatTotal, apPorEmp, arPorEmp, apTotal, arTotal, grafico }
  }, [dados])

  const contextoParecer = agg
    ? 'Desempenho por empresa (dados reais Sankhya, janela 12m). Faturamento total: ' +
      fmtBRL(agg.fatTotal) +
      '. Ranking: ' +
      agg.fatEmpresas.map((f) => f.nome + ' ' + fmtBRL(f.total)).join('; ') +
      '. A/P aberto por empresa: ' +
      (agg.apPorEmp.map((x) => x.nome + ' ' + fmtBRL(x.total)).join('; ') || 'nenhum') +
      '. A/R aberto por empresa: ' +
      (agg.arPorEmp.map((x) => x.nome + ' ' + fmtBRL(x.total)).join('; ') || 'nenhum') +
      '. Analise concentração, desequilíbrios entre unidades e riscos.'
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
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="h-6 w-6 text-[#1B5E20]" />
            Desempenho por Unidade
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Faturamento e posição de títulos por empresa/unidade — dados reais do ERP (12 meses)
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
          <Database className="h-3 w-3" /> Real — Sankhya
        </span>
      </div>

      {dados.falhas && dados.falhas.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          Consultas com falha: {dados.falhas.join(' · ')}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'FATURAMENTO 12M (GRUPO)', v: fmtMilhoes(agg.fatTotal), cor: 'text-gray-900' },
          { label: 'A PAGAR ABERTO', v: fmtMilhoes(agg.apTotal), cor: 'text-red-600' },
          { label: 'A RECEBER ABERTO', v: fmtMilhoes(agg.arTotal), cor: 'text-emerald-700' },
          {
            label: 'EMPRESAS COM FATURAMENTO',
            v: String(agg.fatEmpresas.length),
            cor: 'text-gray-900',
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

      {/* Gráfico por empresa */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#1B5E20]" />
            <span className="text-sm font-bold text-gray-900">
              Faturamento por empresa — 12 meses
            </span>
          </div>
          <span className="text-[11px] text-gray-400">NFs liberadas · TGFCAB</span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={agg.grafico}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
              <XAxis
                type="number"
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1_000_000 ? Math.round(v / 1_000_000) + 'M' : Math.round(v / 1000) + 'k'
                }
              />
              <YAxis
                type="category"
                dataKey="nome"
                width={150}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#374151', fontSize: 11, fontWeight: 600 }}
              />
              <Tooltip content={<TooltipEmp />} cursor={{ fill: '#F9FAFB' }} />
              <Bar
                dataKey="faturamento"
                name="Faturamento"
                fill="#1B5E20"
                radius={[0, 4, 4, 0]}
                animationDuration={600}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rankings A/P e A/R por empresa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingList titulo="A Pagar em aberto — por empresa" itens={agg.apPorEmp} />
        <RankingList titulo="A Receber em aberto — por empresa" itens={agg.arPorEmp} />
      </div>

      {/* Parecer IA */}
      <ParecerIaCard
        titulo="Parecer IA — desempenho por unidade"
        contexto={contextoParecer}
        prompt="Analise o desempenho das unidades/empresas do grupo. Destaque concentração de receita, unidades com desequilíbrio entre A/R e A/P, riscos e 2-3 recomendações práticas."
      />

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>Fonte: Sankhya via edge proxy (DbExplorerSP) · janela 12 meses · TGFCAB/TGFFIN</span>
        <button
          type="button"
          onClick={carregar}
          className="inline-flex items-center gap-1 hover:text-gray-600 font-semibold"
        >
          <RefreshCw className="h-3 w-3" /> Atualizar
        </button>
      </div>
    </div>
  )
}
