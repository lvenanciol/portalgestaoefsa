/**
 * Tabela Dinâmica e Genérica para Listagem de Documentos
 * Atende aos requisitos do Bloco 2:
 * - Colunas dinâmicas configuráveis por tipo
 * - 5 colunas fixas: Documento, Empresa, Status, Anexos, Ações
 * - Checkbox de seleção em lote por linha
 * - Botão primário 'Abrir' + menu dropdown '…' (Editar dados, Anexar arquivo, Ver histórico, Ver no chat, Excluir seguro)
 * - Nenhuma ação destrutiva acessível em 1 clique
 * - Th com scope="col" (Acessibilidade)
 * - Paginação e contagem de registros
 */

import React, { useState } from 'react'
import {
  MoreHorizontal,
  ExternalLink,
  Edit2,
  Paperclip,
  History,
  MessageSquare,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ColunaTipoConfig } from './documentos-colunas-config'

export interface DocumentosTabelaGenericaProps<T = any> {
  dados: T[]
  colunas: ColunaTipoConfig<T>[]
  totalRegistros: number
  loading?: boolean
  paginaAtual: number
  porPagina: number
  onPaginaChange: (pagina: number) => void
  onAbrirDetalhe: (item: T) => void
  onEditar?: (item: T) => void
  onAnexar?: (item: T) => void
  onVerHistorico?: (item: T) => void
  onVerNoChat?: (item: T) => void
  onExcluirSeguro: (item: T) => Promise<void> | void
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
  onSelectAll?: () => void
}

export function DocumentosTabelaGenerica<T extends Record<string, any>>({
  dados,
  colunas,
  totalRegistros,
  loading = false,
  paginaAtual,
  porPagina,
  onPaginaChange,
  onAbrirDetalhe,
  onEditar,
  onAnexar,
  onVerHistorico,
  onVerNoChat,
  onExcluirSeguro,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
}: DocumentosTabelaGenericaProps<T>) {
  // Ordenação local da tabela
  const [sortColId, setSortColId] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Modal de Exclusão Segura (exige digitar o número do documento)
  const [itemParaExcluir, setItemParaExcluir] = useState<T | null>(null)
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  const handleSort = (colId: string) => {
    if (sortColId === colId) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else {
        setSortColId(null)
        setSortDirection('asc')
      }
    } else {
      setSortColId(colId)
      setSortDirection('asc')
    }
  }

  // Ordena os itens caso haja coluna selecionada
  const itensProcessados = React.useMemo(() => {
    if (!sortColId) return dados
    const col = colunas.find((c) => c.id === sortColId)
    if (!col || !col.sortValue) return dados

    return [...dados].sort((a, b) => {
      const valA = col.sortValue!(a)
      const valB = col.sortValue!(b)

      if (valA === valB) return 0
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1

      let comp = 0
      if (typeof valA === 'number' && typeof valB === 'number') {
        comp = valA - valB
      } else {
        comp = String(valA).localeCompare(String(valB), 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        })
      }
      return sortDirection === 'asc' ? comp : -comp
    })
  }, [dados, sortColId, sortDirection, colunas])

  const totalPaginas = Math.ceil(totalRegistros / porPagina) || 1
  const todosSelecionados = dados.length > 0 && dados.every((d) => selectedIds.includes(d.id))

  const abrirModalExclusao = (item: T) => {
    setItemParaExcluir(item)
    setConfirmacaoTexto('')
  }

  const fecharModalExclusao = () => {
    setItemParaExcluir(null)
    setConfirmacaoTexto('')
    setExcluindo(false)
  }

  const numeroEsperado = itemParaExcluir
    ? String(
        itemParaExcluir.numero ||
          itemParaExcluir.numero_processo ||
          itemParaExcluir.titulo ||
          itemParaExcluir.id,
      )
    : ''

  const textoConfere = confirmacaoTexto.trim().toLowerCase() === numeroEsperado.trim().toLowerCase()

  const confirmarExclusao = async () => {
    if (!itemParaExcluir || !textoConfere) return
    try {
      setExcluindo(true)
      await onExcluirSeguro(itemParaExcluir)
      fecharModalExclusao()
    } catch {
      setExcluindo(false)
    }
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
      {/* Container de rolagem horizontal da tabela */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/70 text-gray-500 font-bold uppercase tracking-[0.04em] text-[11px]">
              {/* Checkbox em lote */}
              <th scope="col" className="w-[44px] px-3.5 py-3 text-center">
                {onSelectAll && (
                  <Checkbox
                    checked={todosSelecionados}
                    onCheckedChange={onSelectAll}
                    aria-label="Selecionar todos os registros"
                  />
                )}
              </th>

              {/* Colunas dinâmicas */}
              {colunas.map((col) => {
                const isSorting = sortColId === col.id
                return (
                  <th
                    key={col.id}
                    scope="col"
                    style={{ width: col.width, minWidth: col.width }}
                    className={`px-3 py-3 text-gray-600 select-none whitespace-nowrap ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                          ? 'text-right'
                          : 'text-left'
                    } ${col.sortable ? 'cursor-pointer hover:text-gray-900 transition-colors' : ''}`}
                    onClick={() => col.sortable && handleSort(col.id)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center'
                          ? 'justify-center'
                          : col.align === 'right'
                            ? 'justify-end'
                            : 'justify-start'
                      }`}
                    >
                      <span>{col.label}</span>
                      {col.sortable && (
                        <span className="text-gray-400">
                          {isSorting ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-emerald-700" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-emerald-700" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}

              {/* Coluna Fixa: AÇÕES */}
              <th
                scope="col"
                className="w-[120px] px-3 py-3 text-center whitespace-nowrap text-gray-600"
              >
                AÇÕES
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              // Skeletons de carregamento
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={`skel-${idx}`} className="animate-pulse">
                  <td className="px-3.5 py-3.5 text-center">
                    <div className="h-4 w-4 bg-gray-200 rounded mx-auto" />
                  </td>
                  {colunas.map((col) => (
                    <td key={`skel-col-${col.id}`} className="px-3 py-3.5">
                      <div className="h-4 bg-gray-100 rounded w-4/5" />
                    </td>
                  ))}
                  <td className="px-3 py-3.5 text-center">
                    <div className="h-7 w-16 bg-gray-100 rounded-full mx-auto" />
                  </td>
                </tr>
              ))
            ) : itensProcessados.length === 0 ? (
              <tr>
                <td colSpan={colunas.length + 2} className="py-12 text-center text-gray-400">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              itensProcessados.map((item) => {
                const isSelected = selectedIds.includes(item.id)
                return (
                  <tr
                    key={item.id}
                    onClick={() => {
                      // Ao clicar na linha, abre SEMPRE a tela de detalhe dedicada (mockup)
                      onAbrirDetalhe(item)
                    }}
                    className={`hover:bg-emerald-50/20 transition-colors group cursor-pointer ${
                      isSelected ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    {/* Checkbox individual */}
                    <td className="px-3.5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect && onToggleSelect(item.id)}
                        aria-label={`Selecionar documento ${item.numero || item.titulo || item.id}`}
                      />
                    </td>

                    {/* Células dinâmicas */}
                    {colunas.map((col) => (
                      <td
                        key={col.id}
                        className={`px-3 py-3 align-middle ${
                          col.align === 'center'
                            ? 'text-center'
                            : col.align === 'right'
                              ? 'text-right'
                              : 'text-left'
                        }`}
                      >
                        {col.render(item)}
                      </td>
                    ))}

                    {/* Coluna Ações: Botão 'Abrir' + Menu '…' */}
                    <td
                      className="px-3 py-3 text-center whitespace-nowrap align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onAbrirDetalhe(item)}
                          className="h-7 px-3 rounded-full text-xs font-semibold text-gray-700 hover:text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 shadow-none border-gray-200"
                        >
                          Abrir
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                              aria-label="Mais opções do documento"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 text-xs rounded-xl shadow-lg border-gray-200"
                          >
                            <DropdownMenuItem
                              onClick={() => onAbrirDetalhe(item)}
                              className="gap-2 cursor-pointer font-medium"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
                              Visualizar detalhe
                            </DropdownMenuItem>
                            {onEditar && (
                              <DropdownMenuItem
                                onClick={() => onAbrirDetalhe(item)}
                                className="gap-2 cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                                Editar dados
                              </DropdownMenuItem>
                            )}
                            {onAnexar && (
                              <DropdownMenuItem
                                onClick={() => onAnexar(item)}
                                className="gap-2 cursor-pointer"
                              >
                                <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                                Anexar arquivo
                              </DropdownMenuItem>
                            )}
                            {onVerHistorico && (
                              <DropdownMenuItem
                                onClick={() => onVerHistorico(item)}
                                className="gap-2 cursor-pointer"
                              >
                                <History className="h-3.5 w-3.5 text-gray-500" />
                                Ver histórico
                              </DropdownMenuItem>
                            )}
                            {onVerNoChat && (
                              <DropdownMenuItem
                                onClick={() => onVerNoChat(item)}
                                className="gap-2 cursor-pointer"
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                                Ver no chat
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => abrirModalExclusao(item)}
                              className="gap-2 cursor-pointer text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold focus:text-rose-700 focus:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              Excluir documento
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé com paginação e contagem */}
      <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <div>
          Exibindo{' '}
          <span className="font-semibold text-gray-800">
            {dados.length} de {totalRegistros}
          </span>{' '}
          registros
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={paginaAtual <= 1}
            onClick={() => onPaginaChange(paginaAtual - 1)}
            className="h-7 w-7 p-0 rounded-lg text-xs"
            aria-label="Página anterior"
          >
            ‹
          </Button>

          {Array.from({ length: totalPaginas }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 1)
            .map((p, idx, arr) => {
              const precisaEllipsis = idx > 0 && p - arr[idx - 1] > 1
              return (
                <React.Fragment key={p}>
                  {precisaEllipsis && <span className="px-1 text-gray-400">…</span>}
                  <Button
                    size="sm"
                    variant={paginaAtual === p ? 'default' : 'outline'}
                    onClick={() => onPaginaChange(p)}
                    className={`h-7 w-7 p-0 rounded-lg text-xs font-semibold ${
                      paginaAtual === p
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                        : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {p}
                  </Button>
                </React.Fragment>
              )
            })}

          <Button
            size="sm"
            variant="outline"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => onPaginaChange(paginaAtual + 1)}
            className="h-7 w-7 p-0 rounded-lg text-xs"
            aria-label="Próxima página"
          >
            ›
          </Button>
        </div>
      </div>

      {/* Modal de Exclusão Segura — Exige digitar o número do documento */}
      <Dialog open={!!itemParaExcluir} onOpenChange={(open) => !open && fecharModalExclusao()}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600" />
              Confirmar exclusão de documento
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 pt-2 leading-relaxed">
              Esta ação removerá o documento definitivamente do banco de dados e desvinculará todos
              os anexos associados. Nenhuma exclusão é feita em apenas um clique.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3 bg-rose-50/40 p-3.5 rounded-xl border border-rose-200/80">
            <p className="text-xs text-gray-800">
              Para prosseguir, digite exatamente o identificador do documento:{' '}
              <span className="font-mono font-bold text-rose-700 select-all bg-white px-1.5 py-0.5 rounded border border-rose-200">
                {numeroEsperado}
              </span>
            </p>
            <Input
              value={confirmacaoTexto}
              onChange={(e) => setConfirmacaoTexto(e.target.value)}
              placeholder="Digite o identificador aqui..."
              className="text-xs h-9 bg-white border-rose-300 focus-visible:ring-rose-500 rounded-[10px]"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fecharModalExclusao}
              disabled={excluindo}
              className="rounded-full text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmarExclusao}
              disabled={!textoConfere || excluindo}
              className="rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-700"
            >
              {excluindo ? 'Excluindo...' : 'Confirmar e Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
