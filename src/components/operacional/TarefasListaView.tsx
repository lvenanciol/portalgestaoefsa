import React, { useState } from 'react'
import {
  Calendar,
  Repeat,
  Paperclip,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Pencil,
  Trash2,
  Inbox,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export interface TarefasListaProps {
  itens: any[]
  onAbrirDetalhe: (t: any) => void
  onAbrirEditar: (t: any) => void
  onExcluir: (t: any) => void
  onMoverStatus?: (t: any, novoStatus: string) => Promise<void> | void
  onAbrirNova?: () => void
  obterIconeEmpresa: (emp: string) => React.ReactNode
}

interface GrupoStatusDef {
  key: string
  label: string
}

const GRUPOS_STATUS: GrupoStatusDef[] = [
  { key: 'em_andamento', label: 'EM ANDAMENTO' },
  { key: 'a_fazer', label: 'A FAZER' },
  { key: 'bloqueado', label: 'BLOQUEADO' },
  { key: 'concluido', label: 'CONCLUÍDO' },
]

const STATUS_OPCOES = [
  { key: 'a_fazer', label: 'A Fazer' },
  { key: 'em_andamento', label: 'Em Andamento' },
  { key: 'bloqueado', label: 'Bloqueado' },
  { key: 'concluido', label: 'Concluído' },
]

const PRIO_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  P1: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  P2: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  P3: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
}

const fmtDataCurta = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}

const obterIniciais = (nome?: string) => {
  if (!nome) return '—'
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function TarefasListaView({
  itens,
  onAbrirDetalhe,
  onAbrirEditar,
  onExcluir,
  onMoverStatus,
  onAbrirNova,
}: TarefasListaProps) {
  // Estado de grupos recolhidos (por padrão todos abertos)
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    em_andamento: true,
    a_fazer: true,
    bloqueado: true,
    concluido: true,
  })

  const toggleGrupo = (key: string) => {
    setGruposAbertos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // Agrupa tarefas pelo status_kanban normalizado
  const tarefasPorStatus = GRUPOS_STATUS.reduce<Record<string, any[]>>((acc, g) => {
    acc[g.key] = itens.filter((t) => {
      const sk =
        t.status_kanban ||
        (t.status === 'concluida'
          ? 'concluido'
          : t.status === 'em_andamento'
            ? 'em_andamento'
            : 'a_fazer')
      return sk === g.key
    })
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {GRUPOS_STATUS.map((grupo) => {
        const tarefasDoGrupo = tarefasPorStatus[grupo.key] || []
        const aberto = gruposAbertos[grupo.key] ?? true
        const count = tarefasDoGrupo.length

        return (
          <div key={grupo.key} className="space-y-2">
            {/* Cabeçalho do Grupo Recolhível */}
            <button
              type="button"
              onClick={() => toggleGrupo(grupo.key)}
              className="w-full flex items-center justify-between py-1 text-left text-xs font-bold text-gray-700 hover:text-gray-900 select-none group transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {aberto ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-transform" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-transform" />
                )}
                <span className="tracking-wide uppercase text-[11px] font-bold text-gray-700">
                  {grupo.label} ({count})
                </span>
              </div>
              <span className="text-[11px] text-gray-400 font-normal">
                {aberto ? 'Recolher' : 'Expandir'}
              </span>
            </button>

            {/* Conteúdo do Grupo */}
            {aberto && (
              <div className="space-y-2">
                {count === 0 ? (
                  /* Indicação discreta de grupo vazio */
                  <div className="flex items-center justify-center py-6 px-4 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 gap-2">
                    <Inbox className="h-4 w-4 text-gray-300" />
                    <span>Nenhuma tarefa {grupo.label.toLowerCase()}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tarefasDoGrupo.map((t) => {
                      const prio = (t.prioridade_p || 'P2').toUpperCase()
                      const prioStyle = PRIO_STYLES[prio] || PRIO_STYLES.P2
                      const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
                      const atrasada =
                        prazoIso && prazoIso < hoje && t.status_kanban !== 'concluido'
                      const anexosLista: string[] = Array.isArray(t.anexos)
                        ? t.anexos
                        : t.anexos
                          ? [t.anexos]
                          : []
                      const totalAnexos = anexosLista.length

                      const statusAtual =
                        STATUS_OPCOES.find(
                          (s) =>
                            s.key ===
                            (t.status_kanban ||
                              (t.status === 'concluida'
                                ? 'concluido'
                                : t.status === 'em_andamento'
                                  ? 'em_andamento'
                                  : 'a_fazer')),
                        )?.label || 'A Fazer'

                      return (
                        <div
                          key={t.id}
                          onClick={() => onAbrirDetalhe(t)}
                          className="bg-white rounded-xl border border-gray-200/90 hover:border-emerald-300/80 hover:shadow-xs p-3 sm:py-3.5 sm:px-4 cursor-pointer transition-all duration-150 group"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                            {/* NÍVEL PRINCIPAL (À ESQUERDA) */}
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* Etiqueta de prioridade arredondada */}
                              <span
                                className={cn(
                                  'shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md border mt-0.5',
                                  prioStyle.bg,
                                  prioStyle.text,
                                  prioStyle.border,
                                )}
                              >
                                {prio}
                              </span>

                              {/* Título e Metadados */}
                              <div className="min-w-0 flex-1">
                                <h3 className="text-xs sm:text-[13px] font-bold text-gray-900 group-hover:text-[#1B5E20] transition-colors truncate leading-tight">
                                  {t.titulo}
                                </h3>

                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1 flex-wrap">
                                  {/* Responsável com avatar circular e nome */}
                                  {t.responsavel ? (
                                    <div className="inline-flex items-center gap-1 text-gray-600">
                                      <span className="h-4 w-4 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                                        {obterIniciais(t.responsavel)}
                                      </span>
                                      <span className="font-medium text-gray-700 truncate max-w-[120px]">
                                        {t.responsavel}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 italic">Sem responsável</span>
                                  )}

                                  <span className="text-gray-300">·</span>

                                  {/* Nome da empresa */}
                                  <span className="font-medium text-gray-600 truncate max-w-[140px]">
                                    {t.empresa || 'Sem empresa'}
                                  </span>

                                  {/* Etiqueta de vínculo quando houver */}
                                  {t.vinculo_tipo && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        {t.vinculo_tipo === 'ata'
                                          ? 'ata'
                                          : t.vinculo_tipo === 'projeto'
                                            ? 'projeto'
                                            : t.vinculo_tipo === 'contrato'
                                              ? 'contrato'
                                              : t.vinculo_tipo}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* NÍVEL SECUNDÁRIO (ALINHADO À DIREITA / DESCE EM TELAS PEQUENAS) */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 flex-wrap"
                            >
                              {/* Prazo com ícone de calendário (destaque em VERMELHO quando atrasada) */}
                              <div
                                className={cn(
                                  'inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums',
                                  atrasada
                                    ? 'text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded-md'
                                    : 'text-gray-600',
                                )}
                                title={atrasada ? 'Tarefa atrasada!' : 'Prazo de conclusão'}
                              >
                                <Calendar
                                  className={cn(
                                    'h-3.5 w-3.5',
                                    atrasada ? 'text-red-600' : 'text-gray-400',
                                  )}
                                />
                                <span>{fmtDataCurta(t.prazo)}</span>
                              </div>

                              {/* Indicação de recorrência quando houver */}
                              {t.recorrencia && t.recorrencia !== 'Nenhuma' ? (
                                <div
                                  className="inline-flex items-center gap-1 text-xs text-gray-600"
                                  title={`Recorrência: ${t.recorrencia}`}
                                >
                                  <Repeat className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="text-[11px] font-medium">{t.recorrencia}</span>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs hidden sm:inline select-none">
                                  — —
                                </span>
                              )}

                              {/* Ícone de anexos com quantidade */}
                              <div
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs font-medium',
                                  totalAnexos > 0 ? 'text-gray-700' : 'text-gray-300',
                                )}
                                title={totalAnexos > 0 ? `${totalAnexos} anexo(s)` : 'Sem anexos'}
                              >
                                <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                <span>{totalAnexos > 0 ? totalAnexos : ''}</span>
                              </div>

                              {/* SELETOR DE STATUS NA LINHA */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-7 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
                                    title="Alterar status"
                                  >
                                    <span>{statusAtual}</span>
                                    <ChevronDown className="h-3 w-3 text-gray-400" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36 bg-white">
                                  {STATUS_OPCOES.map((op) => {
                                    const ativo = statusAtual === op.label
                                    return (
                                      <DropdownMenuItem
                                        key={op.key}
                                        onClick={() => onMoverStatus && onMoverStatus(t, op.key)}
                                        className={cn(
                                          'flex items-center justify-between text-xs font-medium cursor-pointer',
                                          ativo && 'bg-emerald-50 text-[#1B5E20] font-bold',
                                        )}
                                      >
                                        <span>{op.label}</span>
                                        {ativo && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                                      </DropdownMenuItem>
                                    )
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* MENU DE TRÊS PONTOS (Ações: Editar, Excluir) */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Mais ações"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36 bg-white">
                                  <DropdownMenuItem
                                    onClick={() => onAbrirEditar(t)}
                                    className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                    <span>Editar</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => onExcluir(t)}
                                    className="flex items-center gap-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                    <span>Excluir</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* AO FINAL DA LISTA: Linha discreta "Adicionar tarefa" */}
      {onAbrirNova && (
        <button
          type="button"
          onClick={onAbrirNova}
          className="w-full py-2.5 px-3 rounded-xl border border-dashed border-gray-200 hover:border-emerald-400 bg-white/70 hover:bg-emerald-50/40 text-xs font-semibold text-[#1B5E20] flex items-center justify-center sm:justify-start gap-2 transition-all duration-150 cursor-pointer shadow-2xs group"
        >
          <PlusCircle className="h-4 w-4 text-[#1B5E20] group-hover:scale-110 transition-transform" />
          <span>Adicionar tarefa</span>
        </button>
      )}
    </div>
  )
}
