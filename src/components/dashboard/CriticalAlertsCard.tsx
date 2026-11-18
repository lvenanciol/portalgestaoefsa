import { AlertCircle, Clock, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CriticalAlert } from '@/data/mockData'
import { cn } from '@/lib/utils'

interface CriticalAlertsCardProps {
  alerts: CriticalAlert[]
}

// ============================================================================
// CARD "ALERTAS CRÍTICOS" — 18/11/2026
//
// DIRETIVA DO DONO: "ao clicar no alerta abre a tela do documento vinculado".
//
// O alerta de contrato nasce com id 'alt-contr-<idDoContrato>'. No clique, o
// prefixo é removido e o usuário vai para a tela de Contratos já aberta no
// registro. Alerta de tarefas atrasadas ('alt-tar') leva para a lista de
// tarefas filtrada por atrasadas. Alerta sem origem conhecida (mock) não
// navega — melhor não levar a lugar nenhum do que a uma tela errada.
// ============================================================================
export function CriticalAlertsCard({ alerts }: CriticalAlertsCardProps) {
  const navigate = useNavigate()

  const abrir = (id: string) => {
    const vid = String(id || '')
    if (vid.startsWith('alt-contr-')) {
      const contratoId = vid.replace('alt-contr-', '')
      if (contratoId) {
        navigate('/contratos?contrato=' + encodeURIComponent(contratoId))
        return
      }
    }
    if (vid === 'alt-tar') {
      navigate('/tarefas?filtro=atrasadas')
      return
    }
    // alerta de origem desconhecida (mock): não navega
  }

  const clicavel = (id: string) => {
    const vid = String(id || '')
    return vid.startsWith('alt-contr-') || vid === 'alt-tar'
  }

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

      {/* Lista: alerta com origem abre o registro vinculado */}
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            role={clicavel(alert.id) ? 'button' : undefined}
            tabIndex={clicavel(alert.id) ? 0 : undefined}
            onClick={() => clicavel(alert.id) && abrir(alert.id)}
            onKeyDown={(e) => {
              if (!clicavel(alert.id)) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                abrir(alert.id)
              }
            }}
            title={clicavel(alert.id) ? 'Abrir o documento vinculado' : undefined}
            className={cn(
              'p-3 rounded-lg border border-gray-100 bg-gray-50/50 transition-colors flex items-center justify-between gap-3',
              clicavel(alert.id)
                ? 'hover:bg-gray-50 hover:border-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30'
                : '',
            )}
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
                {clicavel(alert.id) && <ArrowUpRight className="h-3 w-3" />}
              </span>
            )}
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="text-center text-[12px] text-gray-400 py-8">
            Nenhum alerta crítico no momento.
          </p>
        )}
      </div>
    </div>
  )
}
