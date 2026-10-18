import { useMemo, useState } from 'react'
import {
  ClipboardCheck,
  CalendarDays,
  Loader2,
  CheckCircle2,
  Circle,
  CircleDot,
  Lock,
} from 'lucide-react'
import { CHECKLIST_FECHAMENTO, ChecklistItem, MESES_12 } from '@/data/financeiroData'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 4 — Checklist de Fechamento: progresso do mês, status por item
// (pendente/em andamento/concluído/bloqueado), seletor de mês de fechamento.

const STATUS_META: Record<
  ChecklistItem['status'],
  { label: string; cor: string; icon: typeof Circle }
> = {
  pendente: { label: 'Pendente', cor: 'text-gray-500 bg-gray-100 border-gray-200', icon: Circle },
  em_andamento: {
    label: 'Em andamento',
    cor: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: CircleDot,
  },
  concluido: {
    label: 'Concluído',
    cor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
  },
  bloqueado: { label: 'Bloqueado', cor: 'text-red-700 bg-red-50 border-red-200', icon: Lock },
}

export default function FechamentoPage() {
  const [mesKey, setMesKey] = useState('out26')
  const [itens, setItens] = useState<ChecklistItem[]>(CHECKLIST_FECHAMENTO)
  const [salvando, setSalvando] = useState(false)

  const mes = MESES_12.find((m) => m.key === mesKey) || MESES_12[11]

  const progresso = useMemo(() => {
    const concluidos = itens.filter((i) => i.status === 'concluido').length
    return { concluidos, total: itens.length, pct: Math.round((concluidos / itens.length) * 100) }
  }, [itens])

  const alternar = (id: string) => {
    setSalvando(true)
    setItens((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status:
                i.status === 'concluido' ? 'pendente' : ('concluido' as ChecklistItem['status']),
            }
          : i,
      ),
    )
    setTimeout(() => setSalvando(false), 400)
  }

  const avancar = (id: string) => {
    const ordem: ChecklistItem['status'][] = ['pendente', 'em_andamento', 'concluido']
    setItens((prev) =>
      prev.map((i) => {
        if (i.id !== id || i.status === 'bloqueado') return i
        const idx = ordem.indexOf(i.status)
        return { ...i, status: ordem[(idx + 1) % ordem.length] }
      }),
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="h-6 w-6 text-[#1B5E20]" />
            Fechamento
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Checklist do fechamento contábil-financeiro mensal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <Select value={mesKey} onValueChange={setMesKey}>
            <SelectTrigger className="h-9 w-40 text-xs bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_12.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label} {m.ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progresso */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-900">
            Fechamento {mes.label} {mes.ano}
          </span>
          <span className="text-sm font-bold text-[#1B5E20] tabular-nums">
            {progresso.concluidos}/{progresso.total} · {progresso.pct}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1B5E20] transition-all duration-500"
            style={{ width: `${progresso.pct}%` }}
          />
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
          {salvando && <Loader2 className="h-3 w-3 animate-spin" />}
          Clique no status para avançar (pendente → em andamento → concluído) · itens bloqueados
          exigem desbloqueio da Operações
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 w-10">
                  #
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Tarefa
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Responsável
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Prazo
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {[...itens]
                .sort((a, b) => a.ordem - b.ordem)
                .map((i) => {
                  const meta = STATUS_META[i.status]
                  const Icon = meta.icon
                  const atrasada = i.status !== 'concluido' && i.prazoDia <= 8
                  return (
                    <tr
                      key={i.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-[12px] font-bold text-gray-400 tabular-nums">
                        {i.ordem}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'text-[13px] font-semibold',
                            i.status === 'concluido'
                              ? 'text-gray-500 line-through'
                              : 'text-gray-900',
                          )}
                        >
                          {i.tarefa}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-600">{i.responsavel}</td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        <span
                          className={cn(atrasada ? 'text-red-600 font-semibold' : 'text-gray-600')}
                        >
                          dia {i.prazoDia}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            i.status === 'bloqueado'
                              ? undefined
                              : i.status === 'concluido'
                                ? alternar(i.id)
                                : avancar(i.id)
                          }
                          disabled={i.status === 'bloqueado'}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all',
                            meta.cor,
                            i.status === 'bloqueado'
                              ? 'opacity-70 cursor-not-allowed'
                              : 'hover:scale-[1.03] active:scale-95',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parecer IA — status do fechamento */}
      <ParecerIaCard
        titulo={'Parecer IA — fechamento ' + mes.label}
        contexto={
          'Checklist do fechamento contábil de ' +
          mes.label +
          ' ' +
          mes.ano +
          ': ' +
          progresso.concluidos +
          ' de ' +
          progresso.total +
          ' tarefas concluídas (' +
          progresso.pct +
          '%). ' +
          'Itens pendentes/em andamento: ' +
          itens
            .filter((i) => i.status !== 'concluido')
            .map((i) => i.tarefa + ' (' + i.responsavel + ', prazo dia ' + i.prazoDia + ')')
            .join('; ') +
          '.'
        }
        prompt="Analise o andamento do fechamento contábil. Identifique gargalos (itens atrasados ou bloqueados, dependências entre áreas) e dê 2-3 recomendações para cumprir o prazo de fechamento no dia 10."
      />
    </div>
  )
}
