import { AlertCircle, Clock } from 'lucide-react'
import { CriticalAlert } from '@/data/mockData'
import { cn } from '@/lib/utils'

interface CriticalAlertsCardProps {
  alerts: CriticalAlert[]
}

export function CriticalAlertsCard({ alerts }: CriticalAlertsCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 500ms both',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-red-50 border border-red-200/60 flex items-center justify-center text-red-600">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Alertas Críticos</h3>
            <p className="text-[11px] text-gray-500">Ocorrências prioritárias que demandam ação</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 tabular-nums">
          {alerts.length} pendentes
        </span>
      </div>

      {/* Lista: 3 itens da SPEC */}
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span
                className={cn(
                  'mt-1 w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs',
                  alert.severity === 'critical' ? 'bg-[#DC2626]' : 'bg-[#F59E0B]',
                )}
                title={alert.severity === 'critical' ? 'Crítico' : 'Atenção'}
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-gray-900 block truncate">
                  {alert.title}
                </span>
                <span className="text-[12px] text-gray-600 block truncate">
                  {alert.description}
                </span>
              </div>
            </div>
            {alert.detail && (
              <span className="text-[11px] font-semibold text-gray-500 shrink-0 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {alert.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
