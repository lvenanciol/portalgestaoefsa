import React, { useState, useRef, useMemo } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Pencil,
  Trash2,
  Paperclip,
  Calendar,
  AlertCircle,
  ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'

export interface TarefasListaProps {
  itens: any[]
  onAbrirDetalhe: (t: any) => void
  onAbrirEditar: (t: any) => void
  onExcluir: (t: any) => void
  obterIconeEmpresa: (emp: string) => React.ReactNode
}

type ColunaId =
  | 'titulo'
  | 'empresa'
  | 'responsavel'
  | 'prazo'
  | 'prioridade_p'
  | 'status_kanban'
  | 'vinculo_tipo'
  | 'anexos'
  | 'acoes'

interface ColunaDef {
  id: ColunaId
  label: string
  larguraPadrao: number
  larguraMinima: number
  ordenavel: boolean
}

const COLUNAS_BASE: ColunaDef[] = [
  { id: 'titulo', label: 'Título', larguraPadrao: 280, larguraMinima: 180, ordenavel: true },
  { id: 'empresa', label: 'Empresa', larguraPadrao: 150, larguraMinima: 110, ordenavel: true },
  {
    id: 'responsavel',
    label: 'Responsável',
    larguraPadrao: 170,
    larguraMinima: 120,
    ordenavel: true,
  },
  { id: 'prazo', label: 'Prazo', larguraPadrao: 120, larguraMinima: 95, ordenavel: true },
  {
    id: 'prioridade_p',
    label: 'Prioridade',
    larguraPadrao: 110,
    larguraMinima: 90,
    ordenavel: true,
  },
  { id: 'status_kanban', label: 'Status', larguraPadrao: 130, larguraMinima: 100, ordenavel: true },
  { id: 'vinculo_tipo', label: 'Vínculo', larguraPadrao: 110, larguraMinima: 90, ordenavel: true },
  { id: 'anexos', label: 'Anexos', larguraPadrao: 90, larguraMinima: 80, ordenavel: false },
  { id: 'acoes', label: 'Ações', larguraPadrao: 90, larguraMinima: 80, ordenavel: false },
]

const STATUS_MAP: Record<string, { label: string; cor: string }> = {
  a_fazer: { label: 'A Fazer', cor: 'bg-gray-100 text-gray-700 border-gray-200' },
  em_andamento: { label: 'Em Andamento', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
  bloqueado: { label: 'Bloqueado', cor: 'bg-red-50 text-red-700 border-red-200' },
  concluido: { label: 'Concluído', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const PRIO_MAP: Record<string, { label: string; cor: string }> = {
  P1: { label: 'P1 - Crítica', cor: 'bg-red-100 text-red-700 border-red-200' },
  P2: { label: 'P2 - Normal', cor: 'bg-amber-100 text-amber-700 border-amber-200' },
  P3: { label: 'P3 - Baixa', cor: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const fmtData = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

export function TarefasListaView({
  itens,
  onAbrirDetalhe,
  onAbrirEditar,
  onExcluir,
  obterIconeEmpresa,
}: TarefasListaProps) {
  // 1. Ordem das colunas (DnD)
  const [ordemColunas, setOrdemColunas] = useState<ColunaId[]>(() => COLUNAS_BASE.map((c) => c.id))

  // 2. Larguras das colunas (Resize)
  const [larguras, setLarguras] = useState<Record<ColunaId, number>>(() => {
    const init: Record<string, number> = {}
    COLUNAS_BASE.forEach((c) => {
      init[c.id] = c.larguraPadrao
    })
    return init as Record<ColunaId, number>
  })

  // 3. Ordenação
  const [sortCol, setSortCol] = useState<ColunaId>('prazo')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Drag and Drop estado
  const [arrastandoCol, setArrastandoCol] = useState<ColunaId | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColunaId | null>(null)

  // Redimensionamento estado
  const resizingRef = useRef<{
    colId: ColunaId
    startX: number
    startWidth: number
  } | null>(null)

  const handleMouseDownResize = (colId: ColunaId, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const currentWidth = larguras[colId] || 120
    resizingRef.current = {
      colId,
      startX: e.clientX,
      startWidth: currentWidth,
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = moveEvent.clientX - resizingRef.current.startX
      const colDef = COLUNAS_BASE.find((c) => c.id === resizingRef.current!.colId)
      const minW = colDef?.larguraMinima || 60
      const newWidth = Math.max(minW, resizingRef.current.startWidth + delta)
      setLarguras((prev) => ({
        ...prev,
        [resizingRef.current!.colId]: newWidth,
      }))
    }

    const handleMouseUp = () => {
      resizingRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Alternar ordenação
  const alternarSort = (colId: ColunaId) => {
    const colDef = COLUNAS_BASE.find((c) => c.id === colId)
    if (!colDef?.ordenavel) return
    if (sortCol === colId) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colId)
      setSortDir('asc')
    }
  }

  // Drag and drop handlers
  const handleDragStart = (colId: ColunaId, e: React.DragEvent) => {
    setArrastandoCol(colId)
    e.dataTransfer.setData('text/plain', colId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (colId: ColunaId, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCol !== colId) {
      setDragOverCol(colId)
    }
  }

  const handleDrop = (colTarget: ColunaId, e: React.DragEvent) => {
    e.preventDefault()
    if (!arrastandoCol || arrastandoCol === colTarget) {
      setArrastandoCol(null)
      setDragOverCol(null)
      return
    }

    setOrdemColunas((prev) => {
      const idxOrigem = prev.indexOf(arrastandoCol)
      const idxDestino = prev.indexOf(colTarget)
      if (idxOrigem < 0 || idxDestino < 0) return prev
      const nova = [...prev]
      nova.splice(idxOrigem, 1)
      nova.splice(idxDestino, 0, arrastandoCol)
      return nova
    })

    setArrastandoCol(null)
    setDragOverCol(null)
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // Dados ordenados
  const itensOrdenados = useMemo(() => {
    return [...itens].sort((a, b) => {
      let valA: any = a[sortCol] ?? ''
      let valB: any = b[sortCol] ?? ''

      if (sortCol === 'prazo') {
        valA = a.prazo ? String(a.prazo).slice(0, 10) : '9999-99-99'
        valB = b.prazo ? String(b.prazo).slice(0, 10) : '9999-99-99'
      } else if (sortCol === 'prioridade_p') {
        const peso: Record<string, number> = { P1: 1, P2: 2, P3: 3 }
        valA = peso[a.prioridade_p] || 4
        valB = peso[b.prioridade_p] || 4
      } else if (sortCol === 'status_kanban') {
        const peso: Record<string, number> = {
          a_fazer: 1,
          em_andamento: 2,
          bloqueado: 3,
          concluido: 4,
        }
        valA = peso[a.status_kanban] || 5
        valB = peso[b.status_kanban] || 5
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [itens, sortCol, sortDir])

  const colunasMapeadas = ordemColunas
    .map((id) => COLUNAS_BASE.find((c) => c.id === id)!)
    .filter(Boolean)

  return (
    <div className="bg-white rounded-xl border border-gray-200/90 shadow-xs overflow-hidden">
      {/* Contêiner com scroll horizontal */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          {/* Cabeçalho da tabela */}
          <thead>
            <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-600 select-none">
              {colunasMapeadas.map((col) => {
                const w = larguras[col.id] || col.larguraPadrao
                const isDragOver = dragOverCol === col.id
                const isBeingDragged = arrastandoCol === col.id
                const isSortActive = sortCol === col.id

                return (
                  <th
                    key={col.id}
                    style={{ width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` }}
                    className={cn(
                      'relative px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
                      isDragOver && 'bg-emerald-50 text-[#1B5E20]',
                      isBeingDragged && 'opacity-40',
                      col.ordenavel && 'cursor-pointer hover:bg-gray-100 hover:text-gray-900',
                    )}
                    draggable={col.id !== 'acoes'}
                    onDragStart={(e) => handleDragStart(col.id, e)}
                    onDragOver={(e) => handleDragOver(col.id, e)}
                    onDrop={(e) => handleDrop(col.id, e)}
                    onDragEnd={() => {
                      setArrastandoCol(null)
                      setDragOverCol(null)
                    }}
                    onClick={() => alternarSort(col.id)}
                    title={
                      col.ordenavel
                        ? 'Clique para ordenar; arraste o cabeçalho para reordenar a coluna'
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-1.5 pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        {col.id !== 'acoes' && (
                          <GripVertical className="h-3 w-3 text-gray-400 opacity-60 hover:opacity-100 cursor-grab shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
                      </div>
                      {col.ordenavel && (
                        <span className="shrink-0">
                          {isSortActive ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-[#1B5E20]" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-[#1B5E20]" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-gray-300 opacity-60" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Alça de redimensionamento da coluna */}
                    <div
                      onMouseDown={(e) => handleMouseDownResize(col.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#1B5E20] group-hover:bg-gray-300 transition-colors z-10"
                      title="Arrastar para redimensionar largura"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Corpo da tabela */}
          <tbody className="divide-y divide-gray-100 bg-white">
            {itensOrdenados.length === 0 ? (
              <tr>
                <td
                  colSpan={colunasMapeadas.length}
                  className="py-12 text-center text-gray-400 text-xs"
                >
                  Nenhuma tarefa encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              itensOrdenados.map((t) => {
                const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
                const atrasada = prazoIso && prazoIso < hoje && t.status_kanban !== 'concluido'
                const statusInfo = STATUS_MAP[t.status_kanban] || {
                  label: t.status_kanban || 'A Fazer',
                  cor: 'bg-gray-100 text-gray-600',
                }
                const prioInfo = PRIO_MAP[t.prioridade_p] || {
                  label: t.prioridade_p || 'P2',
                  cor: 'bg-gray-100 text-gray-600',
                }

                // Array de anexos
                const anexosLista: string[] = Array.isArray(t.anexos)
                  ? t.anexos
                  : t.anexos
                    ? [t.anexos]
                    : []

                // Subtarefas
                const subs = Array.isArray(t.subtarefas)
                  ? t.subtarefas
                  : (() => {
                      try {
                        return JSON.parse(t.subtarefas || '[]')
                      } catch (_) {
                        return []
                      }
                    })()

                return (
                  <tr
                    key={t.id}
                    onClick={() => onAbrirDetalhe(t)}
                    className="hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                  >
                    {colunasMapeadas.map((col) => {
                      const w = larguras[col.id] || col.larguraPadrao

                      return (
                        <td
                          key={col.id}
                          style={{ width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` }}
                          className="px-3 py-2.5 text-gray-700 align-middle"
                        >
                          {col.id === 'titulo' && (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-gray-900 group-hover:text-[#1B5E20] truncate flex items-center gap-1.5">
                                <span className="truncate">{t.titulo}</span>
                                {atrasada && (
                                  <span className="shrink-0 px-1 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-700">
                                    Atrasada
                                  </span>
                                )}
                              </div>
                              {subs.length > 0 && (
                                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                  <ListChecks className="h-3 w-3" />
                                  <span>
                                    {subs.filter((s: any) => s.ok).length}/{subs.length} subs
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {col.id === 'empresa' && (
                            <div className="flex items-center gap-1.5 truncate">
                              {obterIconeEmpresa(t.empresa)}
                              <span className="truncate font-medium text-gray-800">
                                {t.empresa || '—'}
                              </span>
                            </div>
                          )}

                          {col.id === 'responsavel' && (
                            <span className="truncate font-medium text-gray-800 block">
                              {t.responsavel || '—'}
                            </span>
                          )}

                          {col.id === 'prazo' && (
                            <div className="flex items-center gap-1 tabular-nums">
                              <Calendar className="h-3 w-3 text-gray-400 shrink-0" />
                              <span
                                className={cn(
                                  'font-medium',
                                  atrasada ? 'text-red-600 font-bold' : 'text-gray-700',
                                )}
                              >
                                {fmtData(t.prazo)}
                              </span>
                            </div>
                          )}

                          {col.id === 'prioridade_p' && (
                            <span
                              className={cn(
                                'inline-block text-[10px] font-bold px-2 py-0.5 rounded border',
                                prioInfo.cor,
                              )}
                            >
                              {prioInfo.label}
                            </span>
                          )}

                          {col.id === 'status_kanban' && (
                            <span
                              className={cn(
                                'inline-block text-[10px] font-bold px-2 py-0.5 rounded border',
                                statusInfo.cor,
                              )}
                            >
                              {statusInfo.label}
                            </span>
                          )}

                          {col.id === 'vinculo_tipo' && (
                            <div>
                              {t.vinculo_tipo ? (
                                <span className="inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {t.vinculo_tipo === 'ata'
                                    ? 'Ata'
                                    : t.vinculo_tipo === 'projeto'
                                      ? 'Projeto'
                                      : t.vinculo_tipo}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          )}

                          {col.id === 'anexos' && (
                            <div>
                              {anexosLista.length > 0 ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1B5E20] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded"
                                  title={`${anexosLista.length} anexo(s)`}
                                >
                                  <Paperclip className="h-3 w-3" />
                                  <span>{anexosLista.length}</span>
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          )}

                          {col.id === 'acoes' && (
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                title="Editar tarefa"
                                onClick={() => onAbrirEditar(t)}
                                className="p-1 rounded text-gray-400 hover:text-[#1B5E20] hover:bg-emerald-50 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Excluir tarefa"
                                onClick={() => onExcluir(t)}
                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Barra de rodapé da lista com totalizadores */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200/80 flex items-center justify-between text-[11px] text-gray-500">
        <div>
          Total de <strong className="text-gray-800">{itens.length}</strong> tarefa(s) exibida(s)
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span>* Arraste a borda para redimensionar; arraste o cabeçalho para reordenar</span>
        </div>
      </div>
    </div>
  )
}
