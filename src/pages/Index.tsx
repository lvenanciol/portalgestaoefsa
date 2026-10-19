import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Calendar, RefreshCw, Database, FlaskConical, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  MOCK_DATA,
  COMPANIES,
  KPI,
  UnitRevenue,
  ExpenseSegment,
  CriticalAlert,
  Commitment,
} from '@/data/mockData'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { TopUnitsChart } from '@/components/dashboard/TopUnitsChart'
import { CriticalAlertsCard } from '@/components/dashboard/CriticalAlertsCard'
import { UpcomingCommitmentsCard } from '@/components/dashboard/UpcomingCommitmentsCard'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { cn } from '@/lib/utils'

// Fase 12 — Dashboard Executivo REAL: KPIs, faturamento mensal, top
// empresas, carteira A/R por aging, alertas (vencidos, contratos vencendo,
// tarefas atrasadas) e compromissos (tarefas com prazo) — tudo do ERP +
// coleções operacionais. Fallback: mock da SPEC com badge.

const fmtBRL0 = (v: number) =>
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
  ok: boolean
  empresas?: [number, string][]
  fat?: [string, number, number][]
  ap_mensal?: [string, number, number][]
  ar_mensal?: [string, number, number][]
  ap_aging?: [string, number, number][]
  ar_aging?: [string, number, number][]
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
            <span className="font-semibold text-gray-900 tabular-nums">{fmtBRL0(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

const MES_CURTO = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export default function Index() {
  const [fonte, setFonte] = useState<'real' | 'mock' | 'loading'>('loading')
  const [kpis, setKpis] = useState<KPI[]>([])
  const [fatMensal, setFatMensal] = useState<{ mes: string; total: number }[]>([])
  const [topEmpresas, setTopEmpresas] = useState<UnitRevenue[]>([])
  const [arAging, setArAging] = useState<ExpenseSegment[]>([])
  const [alertas, setAlertas] = useState<CriticalAlert[]>([])
  const [compromissos, setCompromissos] = useState<Commitment[]>([])
  const [contextoIa, setContextoIa] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const r = (await pb.send('/backend/v1/financeiro/real', { method: 'POST' })) as FinReal
        if (!r.ok || !r.fat?.length) throw new Error('sem dados reais')

        const nomeEmpresa = new Map<number, string>()
        ;(r.empresas || []).forEach((e) => nomeEmpresa.set(Number(e[0]), String(e[1])))

        // KPIs
        const fat12 = r.fat.reduce((a, x) => a + x[2], 0)
        const porMes = new Map<string, number>()
        r.fat.forEach(([mes, , tot]) => porMes.set(mes, (porMes.get(mes) || 0) + tot))
        const meses = Array.from(porMes.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        const ultTot = meses.length ? meses[meses.length - 1][1] : 0
        const antTot = meses.length > 1 ? meses[meses.length - 2][1] : 0
        const deltaFat = antTot > 0 ? ((ultTot - antTot) / antTot) * 100 : 0
        const apTotal = (r.ap_mensal || []).reduce((a, x) => a + x[1], 0)
        const arTotal = (r.ar_mensal || []).reduce((a, x) => a + x[1], 0)
        const vencAp = (r.ap_aging || []).find((b) => b[0] === 'vencido')?.[1] || 0
        const vencAr = (r.ar_aging || []).find((b) => b[0] === 'vencido')?.[1] || 0

        setKpis([
          {
            id: 'fat12',
            label: 'FATURAMENTO 12M',
            value: fmtMilhoes(fat12),
            numericValue: fat12,
            delta: '',
            deltaType: 'positive',
            iconName: 'dollar-sign',
          },
          {
            id: 'fatmes',
            label: 'FATURAMENTO ÚLTIMO MÊS',
            value: fmtMilhoes(ultTot),
            numericValue: ultTot,
            delta: (deltaFat >= 0 ? '+' : '') + deltaFat.toFixed(1).replace('.', ',') + '%',
            deltaType: deltaFat >= 0 ? 'positive' : 'negative',
            iconName: 'chart-line',
          },
          {
            id: 'ar',
            label: 'A RECEBER ABERTO',
            value: fmtMilhoes(arTotal),
            numericValue: arTotal,
            delta: '',
            deltaType: 'positive',
            iconName: 'dollar-sign',
          },
          {
            id: 'ap',
            label: 'A PAGAR ABERTO',
            value: fmtMilhoes(apTotal),
            numericValue: apTotal,
            delta: '',
            deltaType: 'negative',
            iconName: 'clock',
          },
          {
            id: 'venar',
            label: 'RECEBÍVEL VENCIDO',
            value: fmtMilhoes(vencAr),
            numericValue: vencAr,
            delta: '',
            deltaType: 'negative',
            iconName: 'alert-triangle',
          },
          {
            id: 'venap',
            label: 'PAGAR VENCIDO',
            value: fmtMilhoes(vencAp),
            numericValue: vencAp,
            delta: '',
            deltaType: 'negative',
            iconName: 'alert-triangle',
          },
        ])

        // gráfico mensal
        setFatMensal(
          meses.map(([mes, tot]) => ({ mes: mes.slice(5) + '/' + mes.slice(2, 4), total: tot })),
        )

        // top empresas (12m)
        const porEmp = new Map<number, number>()
        r.fat.forEach(([, emp, tot]) => porEmp.set(emp, (porEmp.get(emp) || 0) + tot))
        setTopEmpresas(
          Array.from(porEmp.entries())
            .map(([cod, tot]) => ({ name: nomeEmpresa.get(cod) || 'Emp ' + cod, value: tot }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5),
        )

        // rosca A/R aging
        const rotulos: Record<string, string> = {
          vencido: 'Vencido',
          '0-30d': 'A vencer 30d',
          '31-60d': '31–60d',
          '+60d': '+60d',
        }
        const cores: Record<string, string> = {
          vencido: '#DC2626',
          '0-30d': '#1B5E20',
          '31-60d': '#F59E0B',
          '+60d': '#EA580C',
        }
        const totalAr = (r.ar_aging || []).reduce((a, b) => a + b[1], 0) || 1
        setArAging(
          (r.ar_aging || []).map((b) => ({
            name: rotulos[b[0]] || b[0],
            value: b[1],
            percentage: Math.round((b[1] / totalAr) * 100),
            color: cores[b[0]] || '#9CA3AF',
          })),
        )

        // alertas reais
        const als: CriticalAlert[] = []
        if (vencAp + vencAr > 0) {
          als.push({
            id: 'alt-venc',
            title: 'Títulos vencidos em aberto',
            description: 'A/P ' + fmtMilhoes(vencAp) + ' · A/R ' + fmtMilhoes(vencAr),
            detail: 'Ver A/P & A/R no Financeiro',
            severity: 'critical',
          })
        }
        try {
          const contratos = await pb.collection('contratos').getFullList()
          const hoje = new Date()
          const fim = (c: any) => (c.fim ? new Date(c.fim) : null)
          contratos
            .filter((c: any) => {
              const f = fim(c)
              return f && c.status !== 'encerrado'
            })
            .sort((a: any, b: any) => fim(a)!.getTime() - fim(b)!.getTime())
            .slice(0, 3)
            .forEach((c: any) => {
              const f = fim(c)!
              const dias = Math.ceil((f.getTime() - hoje.getTime()) / 86400000)
              if (dias <= 90) {
                als.push({
                  id: 'alt-contr-' + c.id,
                  title:
                    dias <= 0
                      ? 'Contrato vencido'
                      : dias <= 30
                        ? 'Contrato vence em até 30 dias'
                        : dias <= 60
                          ? 'Contrato vence em 31-60 dias'
                          : 'Contrato vence em 61-90 dias',
                  description: c.parte + ' — ' + (c.titulo || ''),
                  detail: f.toLocaleDateString('pt-BR'),
                  severity: dias <= 30 ? 'critical' : 'warning',
                })
              }
            })
        } catch (_e) {
          // contratos sem permissão ou coleção vazia — segue sem alerta
        }
        try {
          const hoje = new Date().toISOString().slice(0, 10)
          const ts = await pb.collection('tarefas').getFullList({ filter: "status!='concluida'" })
          const atrasadas = ts.filter((t: any) => t.prazo && String(t.prazo).slice(0, 10) < hoje)
          if (atrasadas.length) {
            als.push({
              id: 'alt-tar',
              title: atrasadas.length + ' tarefa(s) atrasada(s)',
              description: 'Tarefas & Agenda',
              detail: '',
              severity: 'critical',
            })
          }
          // compromissos: próximas tarefas com prazo
          const proximas = ts
            .filter((t: any) => t.prazo && String(t.prazo).slice(0, 10) >= hoje)
            .sort((a: any, b: any) => String(a.prazo).localeCompare(String(b.prazo)))
            .slice(0, 4)
          setCompromissos(
            proximas.map((t: any, i: number) => {
              const d = String(t.prazo).slice(0, 10).split('-')
              return {
                id: 'com-' + i,
                day: d[2],
                monthShort: MES_CURTO[parseInt(d[1], 10) - 1] || '',
                title: t.titulo,
                time: 'Prazo',
                location: t.responsavel || '',
              }
            }),
          )
        } catch (_e2) {
          // tarefas indisponíveis — segue sem compromissos
        }
        setAlertas(als)

        setContextoIa(
          'Dashboard executivo do grupo (dados reais Sankhya): faturamento 12m ' +
            fmtMilhoes(fat12) +
            ', último mês ' +
            fmtMilhoes(ultTot) +
            ' (' +
            (deltaFat >= 0 ? '+' : '') +
            deltaFat.toFixed(1) +
            '% vs mês anterior)' +
            ', A/P aberto ' +
            fmtMilhoes(apTotal) +
            ' (vencido ' +
            fmtMilhoes(vencAp) +
            ')' +
            ', A/R aberto ' +
            fmtMilhoes(arTotal) +
            ' (vencido ' +
            fmtMilhoes(vencAr) +
            ')' +
            '. Top empresas: ' +
            topEmpresas.map((t) => t.name + ' ' + fmtMilhoes(t.value)).join('; ') +
            '.' +
            (als.length ? ' Alertas: ' + als.map((a) => a.title).join('; ') + '.' : ''),
        )
        setFonte('real')
      } catch (_) {
        setFonte('mock')
      }
    })()
  }, [])

  const activeCompany = COMPANIES[0]

  if (fonte === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
        <span className="ml-2 text-sm text-gray-500">Carregando dashboard...</span>
      </div>
    )
  }

  const mock = fonte === 'mock'

  return (
    <div className="space-y-6 pb-8">
      {/* 1) CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
              Dashboard Executivo
            </h1>
            {mock ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <FlaskConical className="h-3 w-3" /> Demonstração (mock)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="h-3 w-3" /> Real — Sankhya
              </span>
            )}
          </div>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            {mock ? (
              <>Visão geral do grupo — dados de demonstração</>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 text-emerald-600" />
                Visão geral do grupo — dados reais do ERP (12 meses)
              </>
            )}
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-2xs">
          <Calendar className="h-3.5 w-3.5 text-gray-500" />
          <span>{mock ? 'Janeiro 2026' : 'Últimos 12 meses'}</span>
        </div>
      </div>

      {/* 2) KPIs */}
      <section aria-label="Indicadores-Chave de Desempenho">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(mock ? MOCK_DATA.kpis : kpis).map((kpi, idx) => (
            <KpiCard key={kpi.id} kpi={kpi} index={idx} />
          ))}
        </div>
      </section>

      {/* 3) GRÁFICOS */}
      <section aria-label="Demonstrativos Gráficos">
        {mock ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">{/* mock: RevenueBarChart */}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Faturamento — Últimos 12 meses
                  </h3>
                  <p className="text-xs text-gray-500">
                    Consolidado do grupo (NFs liberadas · TGFCAB)
                  </p>
                </div>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fatMensal} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                        v >= 1_000_000
                          ? Math.round(v / 1_000_000) + 'M'
                          : Math.round(v / 1000) + 'k'
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
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
              <h3 className="text-base font-bold text-gray-900 mb-1">Carteira A/R por aging</h3>
              <p className="text-xs text-gray-500 mb-3">
                Títulos em aberto por faixa de vencimento
              </p>
              <div className="space-y-2.5">
                {arAging.map((b) => (
                  <div key={b.name}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 font-semibold text-gray-700">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: b.color }}
                        />
                        {b.name}
                      </span>
                      <span className="tabular-nums font-bold text-gray-900">
                        {fmtMilhoes(b.value)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: b.percentage + '%', backgroundColor: b.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4) TOP UNIDADES + COMPROMISSOS */}
      <section aria-label="Unidades e Agenda">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopUnitsChart data={mock ? MOCK_DATA.topUnits : topEmpresas} />
          <UpcomingCommitmentsCard commitments={mock ? MOCK_DATA.commitments : compromissos} />
        </div>
      </section>

      {/* 5) ALERTAS + IA */}
      <section aria-label="Alertas e IA">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CriticalAlertsCard alerts={mock ? MOCK_DATA.criticalAlerts : alertas} />
          {mock ? (
            <ParecerIaCard
              titulo="Pareceres IA — Gemini Flash"
              contexto="Dashboard de demonstração (mock)."
              prompt="Você é o analista da diretoria do grupo Extrafruti. Explique em 3 frases que este dashboard está em modo demonstração e quais dados reais já estão disponíveis nas telas Financeiro, Desempenho e Indicadores."
            />
          ) : (
            <ParecerIaCard
              titulo="Pareceres IA — Gemini Flash"
              contexto={contextoIa}
              prompt="Você é o analista da diretoria do grupo Extrafruti. Analise os KPIs reais do Dashboard (faturamento 12m e do mês, A/P e A/R abertos e vencidos, concentração por empresa, alertas). Destaque riscos e oportunidades e dê 3 recomendações práticas para a reunião de resultados."
            />
          )}
        </div>
      </section>
    </div>
  )
}
