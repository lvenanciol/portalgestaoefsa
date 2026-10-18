import { Download, Calendar, RefreshCw } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { MOCK_DATA, COMPANIES } from '@/data/mockData'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueBarChart } from '@/components/dashboard/RevenueBarChart'
import { MarginLineChart } from '@/components/dashboard/MarginLineChart'
import { ExpenseDonutChart } from '@/components/dashboard/ExpenseDonutChart'
import { CriticalAlertsCard } from '@/components/dashboard/CriticalAlertsCard'
import { UpcomingCommitmentsCard } from '@/components/dashboard/UpcomingCommitmentsCard'

export default function Index() {
  const { selectedCompany } = useApp()

  const currentKpis = MOCK_DATA.kpisByCompany[selectedCompany] || MOCK_DATA.kpisByCompany.extrafruti
  const activeCompany = COMPANIES.find((c) => c.id === selectedCompany) || COMPANIES[0]

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

        {/* À direita: botão "Exportar" com ícone de download e chip de período "Janeiro 2026" */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Chip de período "Janeiro 2026" (estático) */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-gray-500" />
            <span>Janeiro 2026</span>
          </div>

          {/* Botão secundário "Exportar" com ícone de download */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-semibold text-gray-800 shadow-2xs transition-all duration-150 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
          >
            <Download className="h-3.5 w-3.5 text-gray-600" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* 2) SEÇÃO KPI: Grid responsivo de 6 cards (3 desktop, 2 tablet, 1 mobile) */}
      <section aria-label="Indicadores-Chave de Desempenho">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentKpis.map((kpi, idx) => (
            <KpiCard key={kpi.id} kpi={kpi} index={idx} />
          ))}
        </div>
      </section>

      {/* 3) LINHA DE GRÁFICOS (Desktop: 2/3 barras + 1/3 coluna empilhando linha e rosca) */}
      <section aria-label="Demonstrativos Gráficos">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Barras "Receita 12m por empresa" (spans 2/3 da linha no desktop) */}
          <div className="lg:col-span-2">
            <RevenueBarChart data={MOCK_DATA.monthlyRevenues} />
          </div>

          {/* Coluna de 1/3 empilhando Linha de Margem Bruta e Rosca de Despesas */}
          <div className="flex flex-col gap-4">
            <MarginLineChart data={MOCK_DATA.marginSeries} />
            <ExpenseDonutChart data={MOCK_DATA.expenseComposition} />
          </div>
        </div>
      </section>

      {/* 4) COLUNA LATERAL INFERIOR: Dois cards lado a lado no desktop, empilhados no mobile */}
      <section aria-label="Alertas e Governança">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Alertas Críticos (3 itens coerentes com o badge do sino) */}
          <CriticalAlertsCard alerts={MOCK_DATA.criticalAlerts} />

          {/* Card Próximos Compromissos (4 compromissos) */}
          <UpcomingCommitmentsCard commitments={MOCK_DATA.commitments} />
        </div>
      </section>
    </div>
  )
}
