import { useEffect, useState } from 'react'
import {
  LineChart as LineChartIcon,
  Loader2,
  Database,
  FlaskConical,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import pb from '@/lib/pocketbase/client'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Fase 11 — Indicadores: evolução mensal REAL de faturamento, A/P e A/R
// (janela 12m, Sankhya via proxy) + Parecer IA. Fallback mock com badge.

const fmtBRL = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

const fmtMilhoes = (v: number) =>
  'R$ ' +
  (Math.abs(v) / 1_000_000).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) +
  'M'

interface FinReal {
  fat?: [string, number, number][]
  ap_mensal?: [string, number, number][]
  ar_mensal?: [string, number, number][]
  falhas?: string[]
}

export default function IndicadoresPage() {
  const [dados, setDados] = useState<FinReal | null>(null)
  const [fonte, setFonte] = useState<'real' | 'mock'>('real')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/financeiro/real', { method: 'POST' })) as FinReal
      if (!r.fat?.length) throw new Error('sem dados')
      setDados(r)
      setFonte('real')
    } catch (e) {
      setErro(String(e))
      setFonte('mock')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const serie = (() => {
    if (fonte === 'real' && dados) {
      const meses = new Map<string, { fat: number; ap: number; ar: number }>()
      dados.fat?.forEach(([mes, , tot]) => {
        const m = meses.get(mes) || { fat: 0, ap: 0, ar: 0 }
        m.fat += tot
        meses.set(mes, m)
      })
      dados.ap_mensal?.forEach(([mes, tot]) => {
        const m = meses.get(mes) || { fat: 0, ap: 0, ar: 0 }
        m.ap += tot
        meses.set(mes, m)
      })
      dados.ar_mensal?.forEach(([mes, tot]) => {
        const m = meses.get(mes) || { fat: 0, ap: 0, ar: 0 }
        m.ar += tot
        meses.set(mes, m)
      })
      return Array.from(meses.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, m]) => ({
          mes: mes.slice(5) + '/' + mes.slice(2, 4),
          faturamento: m.fat,
          pagar: m.ap,
          receber: m.ar,
        }))
    }
    // mock plausível
    return [
      'Nov/25',
      'Dez/25',
      'Jan/26',
      'Fev/26',
      'Mar/26',
      'Abr/26',
      'Mai/26',
      'Jun/26',
      'Jul/26',
      'Ago/26',
      'Set/26',
      'Out/26',
    ].map((mes, i) => ({
      mes,
      faturamento: (14 + i * 0.3) * 1_000_000,
      pagar: (11 + (i % 3)) * 1_000_000,
      receber: (9 + (i % 2)) * 1_000_000,
    }))
  })()

  const contexto =
    fonte === 'real' && dados
      ? 'Indicadores mensais reais (Sankhya, 12m): ' +
        serie
          .map(
            (s) =>
              s.mes +
              ' fat ' +
              fmtMilhoes(s.faturamento) +
              ', A/P ' +
              fmtMilhoes(s.pagar) +
              ', A/R ' +
              fmtMilhoes(s.receber),
          )
          .join('; ') +
        '. Analise tendências e desequilíbrios.'
      : 'Indicadores de demonstração (mock).'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
        <span className="ml-2 text-sm text-gray-500">Consultando indicadores...</span>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <LineChartIcon className="h-6 w-6 text-[#1B5E20]" />
            Indicadores
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Evolução mensal de faturamento, contas a pagar e a receber — 12 meses
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fonte === 'real' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="h-3 w-3" /> Real — Sankhya
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <FlaskConical className="h-3 w-3" /> Demonstração (mock)
            </span>
          )}
          <Button variant="outline" size="sm" onClick={carregar} className="h-9">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {fonte === 'mock' && erro && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          Sem dados reais no momento ({erro.slice(0, 120)}) — exibindo série de demonstração.
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="text-sm font-bold text-gray-900 mb-4">Faturamento × A/P × A/R (R$)</div>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              <Tooltip
                formatter={(v: any) => fmtBRL(Number(v))}
                labelStyle={{ fontWeight: 700 }}
                contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="faturamento"
                name="Faturamento"
                stroke="#1B5E20"
                strokeWidth={2.5}
                dot={false}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="pagar"
                name="A Pagar (aberto)"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="receber"
                name="A Receber (aberto)"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ParecerIaCard
        titulo="Parecer IA — indicadores"
        contexto={contexto}
        prompt="Analise a evolução mensal de faturamento, contas a pagar e a receber. Destaque tendências, sazonalidade, desequilíbrios entre pagar e receber e dê 2-3 recomendações."
      />

      <div className="text-[11px] text-gray-400">
        Fonte:{' '}
        {fonte === 'real'
          ? 'Sankhya via edge proxy (TGFCAB/TGFFIN) · janela 12 meses'
          : 'série de demonstração'}
      </div>
    </div>
  )
}
