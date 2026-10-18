import { Download, Calendar, RefreshCw } from 'lucide-react'
import { MOCK_DATA, COMPANIES } from '@/data/mockData'
import { useBotoes } from '@/services/botoes-service'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueBarChart } from '@/components/dashboard/RevenueBarChart'
import { MarginLineChart } from '@/components/dashboard/MarginLineChart'
import { ExpenseDonutChart } from '@/components/dashboard/ExpenseDonutChart'
import { TopUnitsChart } from '@/components/dashboard/TopUnitsChart'
import { CriticalAlertsCard } from '@/components/dashboard/CriticalAlertsCard'
import { UpcomingCommitmentsCard } from '@/components/dashboard/UpcomingCommitmentsCard'
import { AiInsightsCard } from '@/components/dashboard/AiInsightsCard'

export default function Index() {
  const activeCompany = COMPANIES[0]
  const { pode } = useBotoes()

  return (
    <div className="space-y-6 pb-8">
      {/* 1) CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
              Dashboard Executivo
            </h1>
            <span
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
              style={{
                backgroundColor: `${activeCompany.color}12`,
                borderColor: `${activeCompany.color}35`,
                color: activeCompany.color,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: activeCompany.color }}
              />
              {activeCompany.name}
            </span>
          </div>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 text-emerald-600 animate-spin-reverse" />
            Visão geral do grupo — atualizado há 5 minutos
          </p>
        </div>

        {/* À direita: chip de período + Exportar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-gray-500" />
            <span>Janeiro 2026</span>
          </div>

          {pode('dashboard', 'exportar') && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-semibold text-gray-800 shadow-2xs transition-all duration-150 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
            >
              <Download className="h-3.5 w-3.5 text-gray-600" />
              <span>Exportar</span>
            </button>
          )}
        </div>
      </div>

      {/* 2) SEÇÃO KPI: 6 cards */}
      <section aria-label="Indicadores-Chave de Desempenho">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_DATA.kpis.map((kpi, idx) => (
            <KpiCard key={kpi.id} kpi={kpi} index={idx} />
          ))}
        </div>
      </section>

      {/* 3) LINHA DE GRÁFICOS: barras 2/3 + coluna 1/3 (linha + rosca) */}
      <section aria-label="Demonstrativos Gráficos">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <RevenueBarChart data={MOCK_DATA.monthlyRevenues} />
          </div>

          <div className="flex flex-col gap-4">
            <MarginLineChart data={MOCK_DATA.marginSeries} />
            <ExpenseDonutChart data={MOCK_DATA.expenseComposition} total={MOCK_DATA.expenseTotal} />
          </div>
        </div>
      </section>

      {/* 4) LINHA INFERIOR: Top Unidades (esq) + Compromissos (dir) */}
      <section aria-label="Unidades e Agenda">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopUnitsChart data={MOCK_DATA.topUnits} />
          <UpcomingCommitmentsCard commitments={MOCK_DATA.commitments} />
        </div>
      </section>

      {/* 5) COLUNA DIREITA: Alertas Críticos + Pareceres IA */}
      <section aria-label="Alertas e IA">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CriticalAlertsCard alerts={MOCK_DATA.criticalAlerts} />
          <AiInsightsCard />
        </div>
      </section>
    </div>
  )
}
