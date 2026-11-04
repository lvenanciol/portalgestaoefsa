import React, { useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react'
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
  // Ordem das colunas carregada do localStorage
  const [colunasOrdem, setColunasOrdem] = useState<string[]>(() => {
    try {
      const salvo = localStorage.getItem(`pge_colunas_ordem_${tabelaId}`)
      if (salvo) {
        const parsed = JSON.parse(salvo)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Garante que todas as colunas existem
          const idsAtuais = colunasPadrao.map((c) => c.id)
          const validos = parsed.filter((id) => idsAtuais.includes(id))
          // Insere as novas colunas respeitando o posicionamento relativo de colunasPadrao
          colunasPadrao.forEach((col, idxPadrao) => {
            if (!validos.includes(col.id)) {
              // Se tem coluna anterior no padrao já presente em validos, insere após ela
              const idAnterior = idxPadrao > 0 ? colunasPadrao[idxPadrao - 1]?.id : null
              const posAnterior = idAnterior ? validos.indexOf(idAnterior) : -1
              if (posAnterior !== -1) {
                validos.splice(posAnterior + 1, 0, col.id)
              } else {
                validos.push(col.id)
              }
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

  // Ordenação de dados
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Drag and drop state
  const [draggedColId, setDraggedColId] = useState<string | null>(null)

  const salvarNovaOrdem = (novaOrdem: string[]) => {
    setColunasOrdem(novaOrdem)
    try {
      localStorage.setItem(`pge_colunas_ordem_${tabelaId}`, JSON.stringify(novaOrdem))
    } catch {
      /* intentionally ignored */
    }
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

  // Lista ordenada das definições de coluna
  const colunasExibidas = colunasOrdem
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
              {acoes && (
                <th className="px-3 py-3 text-right font-semibold text-[10.5px] uppercase tracking-wider w-40">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[12.5px] text-gray-700">
            {dadosOrdenados.length === 0 ? (
              <tr>
                <td
                  colSpan={colunasExibidas.length + (acoes ? 1 : 0)}
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
                    {acoes && (
                      <td
                        className="px-3 py-2.5 text-right align-middle shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {acoes(item)}
                      </td>
                    )}
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
