import React, { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtDataBR } from '@/components/operacional/aditivos-utils'
import { limparTextoResponsavel } from '@/lib/responsavel-utils'
import { MarcoRegistro, vincularTarefaAoProjeto } from '@/services/tarefas-projetos-service'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

export interface TarefaAbaItem {
  id: string
  titulo: string
  prioridade: string
  prioridade_p?: string
  prazo: string
  concluida: boolean
  responsavel: string
  status_kanban: string
  marco_id?: string
  marco_nome?: string
  origem?: string
  projeto_id?: string
  expand?: any
}

interface ProjetoTarefasAbaProps {
  projetoId: string
  projetoNome: string
  marcos: MarcoRegistro[]
  tarefas: TarefaAbaItem[]
  temInconsistenciaDiagnostico: boolean
  tarefasConcluidasMap: Record<string, boolean>
  onToggleTarefa: (tarefaId: string) => Promise<void>
  onAbrirNovaTarefa: () => void
  onRecarregar: () => Promise<void>
}

export function ProjetoTarefasAba({
  projetoId,
  projetoNome,
  marcos,
  tarefas,
  temInconsistenciaDiagnostico,
  tarefasConcluidasMap,
  onToggleTarefa,
  onAbrirNovaTarefa,
  onRecarregar,
}: ProjetoTarefasAbaProps) {
  const { toast } = useToast()

  // Seções colapsáveis por marco: por padrão todas abertas
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({})

  // Estado para mover inline
  const [movendoTarefaId, setMovendoTarefaId] = useState<string | null>(null)

  // Diálogo para exclusão de marco que possui tarefas
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [marcoParaExcluir, setMarcoParaExcluir] = useState<MarcoRegistro | null>(null)
  const [marcoDestinoId, setMarcoDestinoId] = useState<string>('')
  const [executandoExclusao, setExecutandoExclusao] = useState(false)
  const [erroExclusao, setErroExclusao] = useState('')

  const toggleSecao = (marcoId: string) => {
    setSecoesAbertas((prev) => ({
      ...prev,
      [marcoId]: prev[marcoId] !== undefined ? !prev[marcoId] : false, // se era aberto (default), fecha
    }))
  }

  const isSecaoAberta = (marcoId: string) => {
    return secoesAbertas[marcoId] !== undefined ? secoesAbertas[marcoId] : true
  }

  // Agrupamento estrito por marco REAL do projeto
  // REMOVIDO "Sem marco vinculado": tarefas com marco_id inexistente ou solto se o diagnóstico sinalizar vão para aviso
  const tarefasPorMarco = useMemo(() => {
    const mapa: Record<string, TarefaAbaItem[]> = {}
    marcos.forEach((m) => {
      mapa[m.id] = []
    })

    const semMarcoOuInvalido: TarefaAbaItem[] = []

    tarefas.forEach((t) => {
      const mid = t.marco_id || t.expand?.marco_id?.id
      if (mid && mapa[mid]) {
        mapa[mid].push(t)
      } else {
        semMarcoOuInvalido.push(t)
      }
    })

    return { mapa, semMarcoOuInvalido }
  }, [marcos, tarefas])

  // Cálculo de progresso por marco para barra com transição suave
  const progressoPorMarco = useMemo(() => {
    const mapa: Record<string, { total: number; concluidas: number; pct: number }> = {}
    marcos.forEach((m) => {
      const lista = tarefasPorMarco.mapa[m.id] || []
      const total = lista.length
      const concluidas = lista.filter((t) => {
        return tarefasConcluidasMap[t.id] !== undefined ? tarefasConcluidasMap[t.id] : t.concluida
      }).length
      const pct = total > 0 ? Math.round((concluidas / total) * 100) : m.concluido ? 100 : 0
      mapa[m.id] = { total, concluidas, pct }
    })
    return mapa
  }, [marcos, tarefasPorMarco, tarefasConcluidasMap])

  // Mover tarefa entre marcos do mesmo projeto
  const handleMoverMarco = async (tarefaId: string, novoMarcoId: string) => {
    if (!tarefaId || !novoMarcoId) return
    setMovendoTarefaId(tarefaId)
    try {
      const res = await vincularTarefaAoProjeto({
        tarefaId,
        projetoId,
        marcoId: novoMarcoId,
      })

      if (!res.success) {
        toast({
          title: 'Não foi possível mover a tarefa',
          description: res.error || 'Erro ao atualizar marco da tarefa.',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Marco atualizado',
        description: 'A tarefa foi movida e o progresso recalculado.',
      })

      await onRecarregar()
    } catch (err: any) {
      toast({
        title: 'Erro ao mover tarefa',
        description: String(err?.message || err || 'Falha de comunicação.'),
        variant: 'destructive',
      })
    } finally {
      setMovendoTarefaId(null)
    }
  }

  // Abertura do diálogo de exclusão de marco
  const abrirExclusaoMarco = (m: MarcoRegistro) => {
    const tarefasDoMarco = tarefasPorMarco.mapa[m.id] || []
    setMarcoParaExcluir(m)
    setErroExclusao('')

    // Outros marcos disponíveis
    const outros = marcos.filter((x) => x.id !== m.id)
    setMarcoDestinoId(outros[0]?.id || '')

    if (tarefasDoMarco.length === 0) {
      // Se não tem tarefas, exclui direto com confirmação simples
      executarExclusaoSemTarefas(m.id)
    } else {
      setModalExcluirAberto(true)
    }
  }

  // Exclusão direta caso não tenha tarefas
  const executarExclusaoSemTarefas = async (marcoId: string) => {
    try {
      await pb.collection('marcos').delete(marcoId)
      toast({
        title: 'Marco removido',
        description: 'O marco foi excluído com sucesso.',
      })
      await onRecarregar()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir marco',
        description: String(err?.message || err),
        variant: 'destructive',
      })
    }
  }

  // Exclusão atômica com realocação prévia de tarefas para outro marco
  const handleConfirmarExclusaoComMover = async () => {
    if (!marcoParaExcluir) return
    if (!marcoDestinoId) {
      setErroExclusao('Selecione o marco de destino para onde as tarefas serão movidas.')
      return
    }

    const tarefasDoMarco = tarefasPorMarco.mapa[marcoParaExcluir.id] || []
    setExecutandoExclusao(true)
    setErroExclusao('')

    try {
      // 1. Move todas as tarefas do marco para o destino chamando o serviço atômico
      for (const t of tarefasDoMarco) {
        const res = await vincularTarefaAoProjeto({
          tarefaId: t.id,
          projetoId,
          marcoId: marcoDestinoId,
        })
        if (!res.success) {
          throw new Error(
            `Falha ao mover tarefa "${t.titulo}": ${res.error || 'Erro no serviço de vínculo'}`,
          )
        }
      }

      // 2. Agora que o marco está sem tarefas, exclui o marco no PocketBase (respeitando ON DELETE RESTRICT)
      await pb.collection('marcos').delete(marcoParaExcluir.id)

      toast({
        title: 'Marco excluído e tarefas migradas',
        description: `${tarefasDoMarco.length} tarefa(s) foram movidas com sucesso.`,
      })

      setModalExcluirAberto(false)
      setMarcoParaExcluir(null)
      await onRecarregar()
    } catch (err: any) {
      setErroExclusao(String(err?.message || err || 'Falha ao processar exclusão do marco.'))
    } finally {
      setExecutandoExclusao(false)
    }
  }

  // ESTADO VAZIO: Quando o projeto ainda não tem marcos cadastrados
  if (marcos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/90 p-8 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center mx-auto">
          <FolderKanban className="h-6 w-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-sm font-bold text-gray-900">Nenhum marco cadastrado</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Este projeto ainda não tem marcos. Cadastre o primeiro para liberar o lançamento de
            tarefas.
          </p>
        </div>
      </div>
    )
  }

  const outrosMarcosParaMover = marcoParaExcluir
    ? marcos.filter((m) => m.id !== marcoParaExcluir.id)
    : []

  const totalTarefasGeral = tarefas.length
  const tarefasPendentesGeral = tarefas.filter((t) => {
    const marcada =
      tarefasConcluidasMap[t.id] !== undefined ? tarefasConcluidasMap[t.id] : t.concluida
    return !marcada
  }).length

  return (
    <div className="bg-white rounded-xl border border-gray-200/90 p-6 shadow-xs space-y-6">
      {/* CABEÇALHO DA ABA TAREFAS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Tarefas do Projeto</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {tarefasPendentesGeral} pendente(s) de um total de {totalTarefasGeral} tarefas agrupadas
            por marco
          </p>
        </div>
        <Button
          onClick={onAbrirNovaTarefa}
          className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs font-semibold shadow-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova tarefa
        </Button>
      </div>

      {/* FAIXA ÂMBAR DISCRETA SE HOUVER INCONSISTÊNCIA DE INTEGRIDADE */}
      {(temInconsistenciaDiagnostico || tarefasPorMarco.semMarcoOuInvalido.length > 0) && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Aviso de integridade:</span> Encontramos tarefas com
            vínculo incompleto (falha de dados). Revise para corrigir.
          </div>
        </div>
      )}

      {/* SEÇÕES COLAPSÁVEIS POR MARCO */}
      <div className="space-y-4">
        {marcos.map((marco, idx) => {
          const tarefasDoMarco = tarefasPorMarco.mapa[marco.id] || []
          const count = tarefasDoMarco.length
          const aberta = isSecaoAberta(marco.id)
          const prog = progressoPorMarco[marco.id] || { total: 0, concluidas: 0, pct: 0 }

          return (
            <div
              key={marco.id}
              className="rounded-xl border border-gray-200/90 bg-white overflow-hidden shadow-2xs transition-all"
            >
              {/* CABEÇALHO DO MARCO */}
              <div className="p-3.5 bg-gray-50/80 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
                <button
                  type="button"
                  onClick={() => toggleSecao(marco.id)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0 group"
                >
                  <div className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center text-gray-500 group-hover:text-gray-900 shrink-0">
                    {aberta ? (
                      <ChevronDown className="h-3.5 w-3.5 transition-transform" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 transition-transform" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 group-hover:text-[#1B5E20] transition-colors truncate">
                        Fase {marco.ordem || idx + 1}: {marco.nome}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-semibold px-2 py-0 bg-gray-200/70 text-gray-700"
                      >
                        {count} {count === 1 ? 'tarefa' : 'tarefas'}
                      </Badge>
                      {marco.concluido && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Concluído
                        </span>
                      )}
                    </div>
                    {marco.data && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Previsão: {fmtDataBR(marco.data)}
                      </div>
                    )}
                  </div>
                </button>

                {/* Barra de progresso com transição suave + Botão de exclusão */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <div className="w-28 sm:w-36 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
                      <span>Progresso</span>
                      <span className="text-gray-900 font-bold">{prog.pct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#1B5E20] h-1.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, prog.pct))}%` }}
                      />
                    </div>
                  </div>

                  {/* Ação de excluir marco (somente se houver mais de 1 marco) */}
                  {marcos.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        abrirExclusaoMarco(marco)
                      }}
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                      title="Excluir marco"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* CONTEÚDO: LISTA DE TAREFAS DESTE MARCO */}
              {aberta && (
                <div className="p-3 space-y-2">
                  {count === 0 ? (
                    <div className="text-center py-6 px-4 bg-gray-50/50 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                      Nenhuma tarefa vinculada a este marco. Use o botão &quot;Nova tarefa&quot;
                      para adicionar.
                    </div>
                  ) : (
                    tarefasDoMarco.map((t) => {
                      const marcada =
                        tarefasConcluidasMap[t.id] !== undefined
                          ? tarefasConcluidasMap[t.id]
                          : t.concluida

                      const movendoEsta = movendoTarefaId === t.id

                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50/80 transition-colors"
                        >
                          {/* Checkbox + Título + Responsável */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={marcada}
                              onChange={() => onToggleTarefa(t.id)}
                              className="h-4 w-4 rounded border-gray-300 text-[#1B5E20] focus:ring-[#1B5E20] cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  'text-xs font-bold block truncate',
                                  marcada ? 'line-through text-gray-400' : 'text-gray-900',
                                )}
                              >
                                {t.titulo}
                              </span>
                              <span className="text-[11px] text-gray-400 truncate block">
                                Responsável: {limparTextoResponsavel(t.responsavel) || 'Equipe'}
                              </span>
                            </div>
                          </div>

                          {/* Seletor inline de marco + Prazo + Prioridade */}
                          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center flex-wrap">
                            {/* SELETOR INLINE DE MARCO */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-gray-400 hidden md:inline">
                                Marco:
                              </span>
                              <Select
                                value={marco.id}
                                onValueChange={(novoMid) => {
                                  if (novoMid && novoMid !== marco.id) {
                                    handleMoverMarco(t.id, novoMid)
                                  }
                                }}
                                disabled={movendoEsta}
                              >
                                <SelectTrigger className="h-7 text-[11px] font-semibold min-w-[130px] max-w-[190px] border-gray-200 bg-white">
                                  {movendoEsta ? (
                                    <span className="flex items-center gap-1 text-gray-400">
                                      <Loader2 className="h-3 w-3 animate-spin" /> Movendo...
                                    </span>
                                  ) : (
                                    <SelectValue placeholder="Mover marco" />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {marcos.map((mOpt) => (
                                    <SelectItem key={mOpt.id} value={mOpt.id} className="text-xs">
                                      {mOpt.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {t.prazo && (
                              <span className="text-[11px] font-semibold text-gray-500">
                                {t.prazo}
                              </span>
                            )}

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-gray-100 text-gray-700">
                              {t.prioridade || 'Média'}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODAL: EXCLUIR MARCO COM TAREFAS */}
      <Dialog open={modalExcluirAberto} onOpenChange={setModalExcluirAberto}>
        <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-amber-600" />
              Excluir marco com tarefas
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600 pt-1 leading-relaxed">
              O marco <strong>&quot;{marcoParaExcluir?.nome}&quot;</strong> possui{' '}
              <strong>
                {marcoParaExcluir ? tarefasPorMarco.mapa[marcoParaExcluir.id]?.length || 0 : 0}
              </strong>{' '}
              tarefa(s) vinculada(s). Por regra de integridade, nenhuma tarefa pode ficar sem marco.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-bold text-gray-700 block">
              Mover tarefas para outro marco: <span className="text-red-500">*</span>
            </label>
            <Select value={marcoDestinoId} onValueChange={setMarcoDestinoId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o marco de destino" />
              </SelectTrigger>
              <SelectContent>
                {outrosMarcosParaMover.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {erroExclusao && (
              <p role="alert" className="text-xs text-red-600 font-medium">
                {erroExclusao}
              </p>
            )}
          </div>

          <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalExcluirAberto(false)}
              disabled={executandoExclusao}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarExclusaoComMover}
              disabled={executandoExclusao || !marcoDestinoId}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              {executandoExclusao ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Movendo e excluindo...
                </>
              ) : (
                'Mover tarefas e excluir marco'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
