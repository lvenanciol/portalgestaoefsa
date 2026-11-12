import { useEffect, useState } from 'react'
import { CalendarDays, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useApp } from '@/context/AppContext'
import { useRealtime } from '@/hooks/use-realtime'
import { carregarDadosDoUsuario } from '@/services/alertas-service'
import { CriticalAlert, Commitment } from '@/data/mockData'
import { cn } from '@/lib/utils'

/**
 * TELA DEFAULT /inicio — dashboard reduzido para usuários/grupos SEM permissão
 * de Dashboard Executivo. Duas seções (Próximos Compromissos e Alertas
 * Críticos), ambas exibindo somente itens em que o usuário logado participa
 * (responsável, mencionado ou participante — helper alertas-usuario),
 * ordenados por data. Fail-closed: sem vínculo, nada aparece.
 */
export default function InicioPage() {
  const { user } = useAuth()
  const { empresas } = useApp()
  const [alertas, setAlertas] = useState<CriticalAlert[]>([])
  const [compromissos, setCompromissos] = useState<Commitment[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    if (!user) return
    setCarregando(true)
    try {
      const dados = await carregarDadosDoUsuario(user)
      setAlertas(dados.alertas)
      setCompromissos(dados.compromissos)
    } catch (_) {
      setAlertas([])
      setCompromissos([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useRealtime('tarefas', () => {
    carregar()
  })
  useRealtime('atas_reunioes', () => {
    carregar()
  })

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Início</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Olá{user?.name ? ', ' + user.name.split(' ')[0] : ''} — aqui está o que depende de você.
        </p>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SEÇÃO: Próximos Compromissos */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20]">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Próximos Compromissos</h3>
                  <p className="text-[11px] text-gray-500">
                    Só o que você participa ou é responsável
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20] tabular-nums">
                {compromissos.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {compromissos.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200/60 text-[#1B5E20] shrink-0">
                      <span className="text-xs font-extrabold leading-none tabular-nums">
                        {item.day}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#1B5E20]/80">
                        {item.monthShort}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-gray-800 line-clamp-1 block">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate block">
                        {item.time} | {item.location}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {compromissos.length === 0 && (
                <p className="text-center text-[12px] text-gray-400 py-8">
                  Nenhum compromisso futuro com a sua participação.
                </p>
              )}
            </div>
          </div>

          {/* SEÇÃO: Alertas Críticos */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-red-50 border border-red-200/60 flex items-center justify-center text-red-600">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Alertas Críticos</h3>
                  <p className="text-[11px] text-gray-500">
                    Ocorrências ligadas a você que demandam ação
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 tabular-nums">
                {alertas.length}
              </span>
            </div>
            <div className="space-y-3">
              {alertas.map((alert) => (
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
                    <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                      {alert.detail}
                    </span>
                  )}
                </div>
              ))}
              {alertas.length === 0 && (
                <p className="text-center text-[12px] text-gray-400 py-8">
                  Nenhum alerta crítico ligado a você no momento.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
