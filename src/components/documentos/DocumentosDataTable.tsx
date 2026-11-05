import React, { useState, useEffect } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical, Columns3, RotateCcw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ColunaConfig<T> {
  id: string
  label: string
  render?: (item: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (item: T) => any
  className?: string
  width?: string
}

interface DocumentosDataTableProps<T> {
  tabelaId: string
  colunasPadrao: ColunaConfig<T>[]
  dados: T[]
  keyExtractor: (item: T) => string
  acoes?: (item: T) => React.ReactNode
  onLinhaClick?: (item: T) => void
  emptyMessage?: string
}

export function DocumentosDataTable<T>({
  tabelaId,
  colunasPadrao,
  dados,
  keyExtractor,
  acoes,
  onLinhaClick,
  emptyMessage = 'Nenhum documento encontrado.',
}: DocumentosDataTableProps<T>) {
  // Chaves de localStorage com versão v4
  // 1) Ordem das colunas
  const storageOrdemKey = `pge_colunas_ordem_v4_${tabelaId}`
  // 2) Visibilidade das colunas (quais colunas estão visíveis)
  const storageVisibilidadeKey = `pge_colunas_visibilidade_v4_${tabelaId}`

  // Inicializa ordem das colunas garantindo validação contra as colunas padrão
  const [colunasOrdem, setColunasOrdem] = useState<string[]>(() => {
    try {
      const salvo = localStorage.getItem(storageOrdemKey)
      if (salvo) {
        const parsed = JSON.parse(salvo)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const idsPadrao = colunasPadrao.map((c) => c.id)
          // Se a lista salva contém todas as colunas padrão (ou pelo menos grande maioria das colunas padrão atuais)
          // mas sem perder nenhuma nova
          const validos = parsed.filter((id) => idsPadrao.includes(id))
          // Se o cache salvo tinha muito menos colunas que o padrão (ex: apenas 2 quando há 13),
          // descarta o cache para evitar esconder colunas novas
          if (validos.length < idsPadrao.length * 0.7) {
            return idsPadrao
          }
          // Garante que qualquer coluna ausente seja adicionada
          idsPadrao.forEach((id) => {
            if (!validos.includes(id)) {
              validos.push(id)
            }
          })
          return validos
        }
      }
    } catch {
      /* intentionally ignored */
    }
    return colunasPadrao.map((c) => c.id)
  })

  // Visibilidade das colunas (conjunto de IDs visíveis)
  const [colunasVisiveis, setColunasVisiveis] = useState<string[]>(() => {
    try {
      const salvo = localStorage.getItem(storageVisibilidadeKey)
      if (salvo) {
        const parsed = JSON.parse(salvo)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const idsPadrao = colunasPadrao.map((c) => c.id)
          const validos = parsed.filter((id) => idsPadrao.includes(id))
          // Se o usuário tinha menos de 3 colunas salvas num grid com 13, reseta para todas visíveis
          if (validos.length >= Math.min(3, idsPadrao.length)) {
            // Garante que novas colunas adicionadas ao sistema fiquem visíveis por padrão
            idsPadrao.forEach((id) => {
              if (!parsed.includes(id) && !validos.includes(id)) {
                validos.push(id)
              }
            })
            return validos
          }
        }
      }
    } catch {
      /* intentionally ignored */
    }
    // Por padrão todas as colunas vêm visíveis
    return colunasPadrao.map((c) => c.id)
  })

  // Sincroniza se novas colunas foram adicionadas nas props (ex: troca de aba)
  useEffect(() => {
    const idsPadrao = colunasPadrao.map((c) => c.id)
    setColunasOrdem((prev) => {
      const validos = prev.filter((id) => idsPadrao.includes(id))
      // Se não sobrou quase nada ou tabela mudou completamente, reseta para padrao
      if (validos.length === 0 || validos.length < idsPadrao.length * 0.5) {
        return idsPadrao
      }
      idsPadrao.forEach((id) => {
        if (!validos.includes(id)) validos.push(id)
      })
      return validos
    })

    setColunasVisiveis((prev) => {
      const validos = prev.filter((id) => idsPadrao.includes(id))
      if (validos.length === 0) return idsPadrao
      // Qualquer nova coluna que não estava no estado anterior entra como visível
      idsPadrao.forEach((id) => {
        if (!prev.includes(id) && !validos.includes(id)) validos.push(id)
      })
      return validos
    })
  }, [colunasPadrao, tabelaId])

  // Ordenação de dados
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Drag and drop state
  const [draggedColId, setDraggedColId] = useState<string | null>(null)

  const salvarNovaOrdem = (novaOrdem: string[]) => {
    setColunasOrdem(novaOrdem)
    try {
      localStorage.setItem(storageOrdemKey, JSON.stringify(novaOrdem))
    } catch {
      /* intentionally ignored */
    }
  }

  const salvarVisibilidade = (novasVisiveis: string[]) => {
    setColunasVisiveis(novasVisiveis)
    try {
      localStorage.setItem(storageVisibilidadeKey, JSON.stringify(novasVisiveis))
    } catch {
      /* intentionally ignored */
    }
  }

  const toggleColunaVisivel = (colId: string) => {
    // Evita desmarcar se for a última visível
    if (colunasVisiveis.includes(colId) && colunasVisiveis.length <= 1) return
    let novaLista: string[]
    if (colunasVisiveis.includes(colId)) {
      novaLista = colunasVisiveis.filter((id) => id !== colId)
    } else {
      novaLista = [...colunasVisiveis, colId]
    }
    salvarVisibilidade(novaLista)
  }

  const resetarColunas = () => {
    const padraoIds = colunasPadrao.map((c) => c.id)
    salvarNovaOrdem(padraoIds)
    salvarVisibilidade(padraoIds)
  }

  const handleHeaderClick = (col: ColunaConfig<T>) => {
    if (!col.sortable) return
    if (sortCol === col.id) {
      if (sortDir === 'asc') {
        setSortDir('desc')
      } else {
        setSortCol(null)
        setSortDir('asc')
      }
    } else {
      setSortCol(col.id)
      setSortDir('asc')
    }
  }

  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedColId(colId)
    e.dataTransfer.setData('text/plain', colId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault()
    if (!draggedColId || draggedColId === targetColId) {
      setDraggedColId(null)
      return
    }

    const novaOrdem = [...colunasOrdem]
    const idxOrigem = novaOrdem.indexOf(draggedColId)
    const idxDestino = novaOrdem.indexOf(targetColId)

    if (idxOrigem !== -1 && idxDestino !== -1) {
      novaOrdem.splice(idxOrigem, 1)
      novaOrdem.splice(idxDestino, 0, draggedColId)
      salvarNovaOrdem(novaOrdem)
    }

    setDraggedColId(null)
  }

  // Lista ordenada e filtrada das definições de coluna visíveis
  const colunasExibidas = colunasOrdem
    .filter((id) => colunasVisiveis.includes(id))
    .map((id) => colunasPadrao.find((c) => c.id === id))
    .filter(Boolean) as ColunaConfig<T>[]

  // Dados ordenados
  const dadosOrdenados = React.useMemo(() => {
    if (!sortCol) return dados
    const colDef = colunasPadrao.find((c) => c.id === sortCol)
    if (!colDef) return dados

    return [...dados].sort((a, b) => {
      let valA = colDef.sortValue ? colDef.sortValue(a) : (a as any)[sortCol]
      let valB = colDef.sortValue ? colDef.sortValue(b) : (b as any)[sortCol]

      if (valA === undefined || valA === null) valA = ''
      if (valB === undefined || valB === null) valB = ''

      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()

      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [dados, sortCol, sortDir, colunasPadrao])

  return (
    <div className="bg-white rounded-xl border border-gray-200/90 shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/90 border-b border-gray-200 text-gray-500 text-[10.5px] uppercase font-bold tracking-wider select-none">
              {colunasExibidas.map((col) => {
                const ativo = sortCol === col.id
                return (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, col.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, col.id)}
                    onClick={() => handleHeaderClick(col)}
                    className={cn(
                      'px-3 py-3 font-semibold transition-colors group cursor-pointer hover:bg-gray-100/70',
                      col.className,
                      draggedColId === col.id && 'opacity-40 bg-gray-200',
                    )}
                    style={{ width: col.width }}
                    title="Clique para ordenar · Arraste para reposicionar coluna"
                  >
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="h-3 w-3 text-gray-300 group-hover:text-gray-500 cursor-grab shrink-0" />
                      <span className="truncate">{col.label}</span>
                      {col.sortable !== false && (
                        <span className="shrink-0">
                          {ativo ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-emerald-700" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-emerald-700" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
              <th className="px-3 py-3 text-right font-semibold text-[10.5px] uppercase tracking-wider w-40">
                <div className="flex items-center justify-end gap-2">
                  <span>{acoes ? 'Ações' : ''}</span>
                  <Popover>
                    <TooltipProvider delayDuration={250}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Gerenciar colunas visíveis"
                              className="h-6 w-6 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <Columns3 className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px]">
                          Exibir / ocultar colunas ({colunasVisiveis.length}/{colunasPadrao.length})
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <PopoverContent
                      align="end"
                      className="w-64 p-3 bg-white shadow-lg border border-gray-200 rounded-xl space-y-2.5"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          <Columns3 className="h-3.5 w-3.5 text-emerald-700" />
                          Colunas da Grade
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={resetarColunas}
                          className="h-6 text-[10.5px] text-gray-500 hover:text-emerald-700 px-1.5 gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar padrão
                        </Button>
                      </div>

                      <div className="text-[11px] text-gray-500">
                        Selecione as colunas que deseja exibir:
                      </div>

                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                        {colunasPadrao.map((col) => {
                          const visivel = colunasVisiveis.includes(col.id)
                          return (
                            <label
                              key={col.id}
                              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs text-gray-700 select-none transition-colors"
                            >
                              <Checkbox
                                checked={visivel}
                                onCheckedChange={() => toggleColunaVisivel(col.id)}
                                disabled={visivel && colunasVisiveis.length <= 1}
                              />
                              <span
                                className={cn(
                                  'truncate',
                                  visivel
                                    ? 'font-medium text-gray-900'
                                    : 'text-gray-400 line-through',
                                )}
                              >
                                {col.label}
                              </span>
                            </label>
                          )
                        })}
                      </div>

                      <div className="pt-2 border-t border-gray-100 text-[10.5px] text-gray-400 text-right">
                        {colunasVisiveis.length} de {colunasPadrao.length} visíveis
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[12.5px] text-gray-700">
            {dadosOrdenados.length === 0 ? (
              <tr>
                <td
                  colSpan={colunasExibidas.length + 1}
                  className="px-6 py-12 text-center text-gray-400 text-xs"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              dadosOrdenados.map((item) => {
                const key = keyExtractor(item)
                return (
                  <tr
                    key={key}
                    onClick={() => onLinhaClick && onLinhaClick(item)}
                    className={cn(
                      'transition-colors group',
                      onLinhaClick
                        ? 'cursor-pointer hover:bg-emerald-50/40'
                        : 'hover:bg-emerald-50/20',
                    )}
                  >
                    {colunasExibidas.map((col) => {
                      const valor = col.render ? col.render(item) : ((item as any)[col.id] ?? '—')
                      return (
                        <td key={col.id} className={cn('px-3 py-2.5 align-middle', col.className)}>
                          {valor}
                        </td>
                      )
                    })}
                    <td
                      className="px-3 py-2.5 text-right align-middle shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {acoes ? acoes(item) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
