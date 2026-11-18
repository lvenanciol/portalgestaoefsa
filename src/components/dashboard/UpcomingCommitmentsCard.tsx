import { CalendarDays, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Commitment } from '@/data/mockData'

interface UpcomingCommitmentsCardProps {
  commitments: Commitment[]
}

// ============================================================================
// CARD "PRÓXIMOS COMPROMISSOS" — 18/11/2026
//
// DIRETIVA DO DONO: "ao clicar no compromisso abre a tela da tarefa".
// Antes o card era somente leitura: o item tinha ícone de seta mas não
// navegava para lugar nenhum. O `id` do compromisso agora é o ID REAL da
// tarefa (era 'com-<índice>'), e o clique leva para /tarefas?tarefa=<id>,
// que a tela de Tarefas já sabe abrir (abre o detalhe direto).
// ============================================================================
export function UpcomingCommitmentsCard({ commitments }: UpcomingCommitmentsCardProps) {
  const navigate = useNavigate()

  const abrir = (id: string) => {
    if (!id) return
    // id sintético ('com-N') não aponta para tarefa: vai para a lista
    if (/^com-\d+$/.test(id)) {
      navigate('/tarefas')
      return
    }
    navigate('/tarefas?tarefa=' + encodeURIComponent(id))
  }

  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 550ms both',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20]">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Próximos Compromissos</h3>
            <p className="text-[11px] text-gray-500">Agenda executiva e governança do grupo</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/tarefas')}
          className="text-xs font-semibold text-[#1B5E20] hover:text-[#0F3D13] inline-flex items-center gap-0.5 hover:underline"
        >
          <span>Agenda</span>
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {/* Lista: cada item abre a tarefa/compromisso no clique */}
      <div className="space-y-2.5">
        {commitments.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => abrir(String(item.id))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                abrir(String(item.id))
              }
            }}
            title="Abrir a tarefa"
            className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 bg-emerald-50/40 hover:bg-emerald-50/70 hover:border-emerald-200 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200/60 text-[#1B5E20] shrink-0">
                <span className="text-xs font-extrabold leading-none tabular-nums">{item.day}</span>
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

            <ArrowUpRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          </div>
        ))}
        {commitments.length === 0 && (
          <p className="text-center text-[12px] text-gray-400 py-8">
            Nenhum compromisso futuro no momento.
          </p>
        )}
      </div>
    </div>
  )
}
