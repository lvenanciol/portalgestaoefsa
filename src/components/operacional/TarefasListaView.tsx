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
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { limparTextoResponsavel } from '@/lib/responsavel-utils'
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
  obterIconeEmpresa?: (emp: string) => React.ReactNode
  onVincularProjeto?: (t: any) => void
  onDesvincularProjeto?: (t: any) => void
}

interface GrupoStatusDef {
  key: string
  label: string
}

const GRUPOS_STATUS: GrupoStatusDef[] = [
  { key: 'triagem', label: 'TRIAGEM' },
  { key: 'em_andamento', label: 'EM ANDAMENTO' },
  { key: 'a_fazer', label: 'A FAZER' },
  { key: 'bloqueado', label: 'BLOQUEADO' },
  { key: 'concluido', label: 'CONCLUÍDO' },
]

const STATUS_OPCOES = [
  { key: 'triagem', label: 'Triagem' },
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

const PRIO_LABEL: Record<string, string> = {
  P1: 'Alta',
  P2: 'Normal',
  P3: 'Baixa',
}

export function TarefasListaView({
  itens,
  onAbrirDetalhe,
  onAbrirEditar,
  onExcluir,
  onMoverStatus,
  onAbrirNova,
  onVincularProjeto,
  onDesvincularProjeto,
}: TarefasListaProps) {
  // Linhas expandidas para exibir detalhes adicionais (como o marco do projeto)
  const [linhasExpandidas, setLinhasExpandidas] = useState<Record<string, boolean>>({})

  const toggleExpandirLinha = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setLinhasExpandidas((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Estado de grupos recolhidos (por padrão todos abertos)
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    triagem: true,
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
            : 'triagem')
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
              <div className="space-y-1.5">
                {count === 0 ? (
                  /* Indicação discreta de grupo vazio */
                  <div className="flex items-center justify-center py-6 px-4 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 gap-2">
                    <Inbox className="h-4 w-4 text-gray-300" />
                    <span>Nenhuma tarefa {grupo.label.toLowerCase()}</span>
                  </div>
                ) : (
                  <>
                    {/* CABEÇALHO DE COLUNAS: Tarefa | Prioridade | Responsável | Empresa | Prazo | Ações */}
                    <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200/70 select-none">
                      <div className="col-span-4">Tarefa</div>
                      <div className="col-span-2">Prioridade</div>
                      <div className="col-span-2">Responsável</div>
                      <div className="col-span-2">Empresa</div>
                      <div className="col-span-1">Prazo</div>
                      <div className="col-span-1 text-right">Ações</div>
                    </div>

                    <div className="space-y-2">
                      {tarefasDoGrupo.map((t) => {
                        const prio = (t.prioridade_p || 'P2').toUpperCase()
                        const prioStyle = PRIO_STYLES[prio] || PRIO_STYLES.P2
                        const prioTexto = PRIO_LABEL[prio] || 'Normal'
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
                                    : 'triagem')),
                          )?.label || 'Triagem'

                        const responsavelLimpo = limparTextoResponsavel(t.responsavel)
                        const ehProjeto =
                          t.origem === 'projeto' || t.vinculo_tipo === 'projeto' || !!t.projeto_id
                        const linhaAberta = !!linhasExpandidas[t.id]
                        const nomeMarco =
                          t.expand?.marco_id?.nome ||
                          t.marco_nome ||
                          (t.marco_id ? `Marco ${t.marco_id}` : '')
                        const nomeProjeto =
                          t.expand?.projeto_id?.nome ||
                          t.projeto_nome ||
                          (t.projeto_id ? `Projeto ${t.projeto_id}` : '')

                        return (
                          <div
                            key={t.id}
                            onClick={() => onAbrirDetalhe(t)}
                            className="bg-white rounded-xl border border-gray-200/90 hover:border-emerald-300/80 hover:shadow-xs p-3 sm:py-3 sm:px-4 cursor-pointer transition-all duration-150 group"
                          >
                            {/* LAYOUT EM GRID EM TELAS GRANDES (LG+), FLEX EM TELAS MENORES */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                              {/* COLUNA 1: Título + Vínculo (4 colunas) */}
                              <div className="lg:col-span-4 flex items-start gap-2.5 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="text-xs sm:text-[13px] font-bold text-gray-900 group-hover:text-[#1B5E20] transition-colors truncate leading-tight">
                                      {t.titulo}
                                    </h3>
                                    {/* Botão de expansão quando tiver detalhes de projeto/marco */}
                                    {ehProjeto && (
                                      <button
                                        type="button"
                                        onClick={(e) => toggleExpandirLinha(t.id, e)}
                                        className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                                        title={
                                          linhaAberta ? 'Ocultar detalhes' : 'Ver marco vinculado'
                                        }
                                      >
                                        <ChevronDown
                                          className={cn(
                                            'h-3.5 w-3.5 transition-transform duration-200',
                                            linhaAberta && 'rotate-180',
                                          )}
                                        />
                                      </button>
                                    )}
                                  </div>
                                  {/* Badge de Vínculo (Prompt 7): Nenhum -> avulsa (neutro cinza); Contrato -> de contrato (verde claro); Ata -> de ata (verde claro); Tarefa -> subtarefa (cinza); Projeto -> de projeto (verde) */}
                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                    {ehProjeto ? (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        de projeto
                                      </span>
                                    ) : t.vinculo_tipo === 'contrato' ? (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200">
                                        de contrato
                                      </span>
                                    ) : t.vinculo_tipo === 'ata' ? (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200">
                                        de ata
                                      </span>
                                    ) : t.vinculo_tipo === 'tarefa' ? (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                        subtarefa
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                        avulsa
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* COLUNA 2: Prioridade (coluna após Tarefa: P1 Alta / P2 Normal / P3 Baixa) (2 colunas) */}
                              <div className="lg:col-span-2 flex items-center gap-1.5 text-xs min-w-0">
                                <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                  Prioridade:
                                </span>
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border',
                                    prioStyle.bg,
                                    prioStyle.text,
                                    prioStyle.border,
                                  )}
                                  title={`${prio} — ${prioTexto}`}
                                >
                                  <span className="font-bold">{prio}</span>
                                  <span className="text-gray-400">·</span>
                                  <span>{prioTexto}</span>
                                </span>
                              </div>

                              {/* COLUNA 3: Responsável (somente texto com tag de cargo + nome, sem avatar circular de iniciais) (2 colunas) */}
                              <div className="lg:col-span-2 flex items-center gap-1.5 text-xs text-gray-700 min-w-0">
                                <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                  Resp:
                                </span>
                                {responsavelLimpo ? (
                                  <span
                                    className="font-medium truncate text-gray-800"
                                    title={responsavelLimpo}
                                  >
                                    {responsavelLimpo}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 italic text-xs">
                                    Sem responsável
                                  </span>
                                )}
                              </div>

                              {/* COLUNA 3: Empresa (ícone da empresa + nome) (2 colunas) */}
                              <div className="lg:col-span-2 flex items-center gap-1.5 text-xs text-gray-700 min-w-0">
                                <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                  Empresa:
                                </span>
                                {t.empresa ? (
                                  <div
                                    className="inline-flex items-center gap-1.5 min-w-0 truncate"
                                    title={t.empresa}
                                  >
                                    <EmpresaIcon nome={t.empresa} className="h-4 w-4 shrink-0" />
                                    <span className="font-medium truncate text-gray-800">
                                      {t.empresa}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic text-xs">Sem empresa</span>
                                )}
                              </div>

                              {/* COLUNA 4: Prazo (1 coluna) */}
                              <div className="lg:col-span-1 flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] uppercase font-bold text-gray-400 lg:hidden shrink-0">
                                  Prazo:
                                </span>
                                <div
                                  className={cn(
                                    'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
                                    atrasada
                                      ? 'text-red-600 font-bold bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md'
                                      : 'text-gray-600',
                                  )}
                                  title={atrasada ? 'Tarefa atrasada!' : 'Prazo de conclusão'}
                                >
                                  <Calendar
                                    className={cn(
                                      'h-3 w-3 shrink-0',
                                      atrasada ? 'text-red-600' : 'text-gray-400',
                                    )}
                                  />
                                  <span>{fmtDataCurta(t.prazo)}</span>
                                </div>
                              </div>

                              {/* COLUNA 6: Recorrência, Anexos, Seletor de Status e Menu ⋯ (1 coluna / direita) */}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="lg:col-span-1 flex items-center justify-between lg:justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100 flex-wrap"
                              >
                                {/* Indicação de recorrência quando houver */}
                                {t.recorrencia && t.recorrencia !== 'Nenhuma' ? (
                                  <div
                                    className="inline-flex items-center gap-1 text-xs text-gray-600"
                                    title={`Recorrência: ${t.recorrencia}`}
                                  >
                                    <Repeat className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-[11px] font-medium hidden sm:inline">
                                      {t.recorrencia}
                                    </span>
                                  </div>
                                ) : null}

                                {/* Ícone de anexos com quantidade */}
                                {totalAnexos > 0 && (
                                  <div
                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700"
                                    title={`${totalAnexos} anexo(s)`}
                                  >
                                    <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{totalAnexos}</span>
                                  </div>
                                )}

                                {/* SELETOR DE STATUS NA LINHA */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
                                      title="Alterar status"
                                    >
                                      <span className="truncate max-w-[85px]">{statusAtual}</span>
                                      <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
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
                                          {ativo && (
                                            <Check className="h-3.5 w-3.5 text-[#1B5E20]" />
                                          )}
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
                                  <DropdownMenuContent align="end" className="w-48 bg-white">
                                    <DropdownMenuItem
                                      onClick={() => onAbrirEditar(t)}
                                      className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                      <span>Editar</span>
                                    </DropdownMenuItem>

                                    {/* Ações rápidas de vínculo a projeto */}
                                    {ehProjeto && onDesvincularProjeto ? (
                                      <DropdownMenuItem
                                        onClick={() => onDesvincularProjeto(t)}
                                        className="flex items-center gap-2 text-xs font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-50 cursor-pointer"
                                      >
                                        <Repeat className="h-3.5 w-3.5 text-amber-600" />
                                        <span>Desvincular do projeto</span>
                                      </DropdownMenuItem>
                                    ) : null}

                                    {!ehProjeto && onVincularProjeto ? (
                                      <DropdownMenuItem
                                        onClick={() => onVincularProjeto(t)}
                                        className="flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                                      >
                                        <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                                        <span>Vincular a projeto</span>
                                      </DropdownMenuItem>
                                    ) : null}

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

                            {/* Detalhes expandidos: marco vinculado e projeto */}
                            {ehProjeto && linhaAberta && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-emerald-50/40 rounded-lg px-3 py-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-semibold text-emerald-900 shrink-0">
                                    Marco vinculado:
                                  </span>
                                  <span className="font-medium text-emerald-800 truncate">
                                    {nomeMarco || 'Marco não informado'}
                                  </span>
                                  {nomeProjeto && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="text-gray-500 text-[11px] truncate">
                                        Projeto: {nomeProjeto}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {onDesvincularProjeto && (
                                  <button
                                    type="button"
                                    onClick={() => onDesvincularProjeto(t)}
                                    className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold underline underline-offset-2 shrink-0 ml-2"
                                  >
                                    Desvincular
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
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
