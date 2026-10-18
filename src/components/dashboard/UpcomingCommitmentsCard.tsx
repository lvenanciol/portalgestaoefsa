import { CalendarDays, ArrowUpRight } from 'lucide-react'
import { Commitment } from '@/data/mockData'

interface UpcomingCommitmentsCardProps {
  commitments: Commitment[]
}

export function UpcomingCommitmentsCard({ commitments }: UpcomingCommitmentsCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 500ms both',
      }}
    >
      {/* Header com ícone de calendário */}
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
          className="text-xs font-semibold text-[#1B5E20] hover:text-[#0F3D13] inline-flex items-center gap-0.5 hover:underline"
        >
          <span>Agenda</span>
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {/* Lista de 4 compromissos */}
      <div className="space-y-2.5">
        {commitments.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 bg-gray-50/40 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Chip de data (dia + mês abreviado) */}
              <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-200/60 text-[#1B5E20] shrink-0">
                <span className="text-xs font-extrabold leading-none tabular-nums">{item.day}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#1B5E20]/80">
                  {item.monthShort}
                </span>
              </div>

              {/* Título */}
              <div className="min-w-0">
                <span className="text-xs font-semibold text-gray-800 line-clamp-1 block">
                  {item.title}
                </span>
                <span className="text-[11px] text-gray-400">
                  Horário: 09:30 — Sala de Reunião 01
                </span>
              </div>
            </div>

            {/* Tag-pill com o nome da empresa */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border"
              style={{
                backgroundColor: `${item.companyColor}12`,
                borderColor: `${item.companyColor}30`,
                color: item.companyColor,
              }}
            >
              {item.company}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
