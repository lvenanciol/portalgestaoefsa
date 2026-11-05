import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  MessageSquare,
  History,
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import pb from '@/lib/pocketbase/client'

export interface ObservacaoItem {
  id: string
  dataTexto: string // Ex: "09/10/2026", "09/10/2026 14:30"
  dataObj?: Date
  autorTag?: string // Ex: "(CJ)", "(MGP)"
  texto: string
  origem: 'processo' | 'historico' | 'manual'
  versao?: number
}

interface ProcessoObservacoesTimelineProps {
  processoId?: string
  numeroProcesso?: string
  observacoesTexto: string
  dataUltimaAtualizacao?: string
  versaoAtual?: number
  onSalvarTexto?: (novoTexto: string) => void
}

/**
 * Função utilitária para fazer o parser inteligente de texto de observações livres.
 * Detecta blocos com data (ex: "09/10/2026 (CJ): Trata-se de...", "03/06/2026: ...")
 * Se não houver datas embutidas, retorna uma única entrada com a data da última atualização.
 */
export function extrairEntradasDeObservacoes(
  texto: string,
  dataFallback?: string,
): ObservacaoItem[] {
  if (!texto || !texto.trim()) return []

  const trimmed = texto.trim()

  // Regex para identificar inícios de entrada datada:
  // Ex: "09/10/2026 (CJ):", "09/10/2026 -", "09/10/2026 às 14:00:", "09/10/2026:"
  const dataRegex =
    /(?:^|\n|\r\n)(\d{2}\/\d{2}\/\d{4})(?:\s+(?:às\s+)?\d{2}:\d{2})?(?:\s*\(([A-Za-z0-9_\- ]+)\))?\s*[:\-—]?\s*/g

  const matches = [...trimmed.matchAll(dataRegex)]

  if (matches.length === 0) {
    // Bloco único sem datas embutidas
    let dataTexto = 'Atualização'
    let dataObj: Date | undefined
    if (dataFallback) {
      try {
        const d = new Date(dataFallback)
        if (!isNaN(d.getTime())) {
          dataTexto =
            d.toLocaleDateString('pt-BR') +
            ' às ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          dataObj = d
        }
      } catch {
        dataTexto = dataFallback
      }
    }

    return [
      {
        id: 'bloco-unico',
        dataTexto,
        dataObj,
        texto: trimmed,
        origem: 'processo',
      },
    ]
  }

  const itens: ObservacaoItem[] = []

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const dataDetectada = match[1]
    const autorTag = match[2] ? `(${match[2]})` : undefined
    const startIndex = match.index! + match[0].length
    const nextMatch = matches[i + 1]
    const endIndex = nextMatch ? nextMatch.index! : trimmed.length

    const textoEntrada = trimmed.substring(startIndex, endIndex).trim()

    // Parse da data DD/MM/AAAA para ordenação
    let dataObj: Date | undefined
    try {
      const partes = dataDetectada.split('/')
      if (partes.length === 3) {
        dataObj = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]))
      }
    } catch {
      /* ignore */
    }

    itens.push({
      id: `entrada-${i}-${dataDetectada}`,
      dataTexto: dataDetectada,
      dataObj,
      autorTag,
      texto: textoEntrada,
      origem: 'processo',
    })
  }

  // Ordena da mais recente para a mais antiga
  return itens.sort((a, b) => {
    if (!a.dataObj || !b.dataObj) return 0
    return b.dataObj.getTime() - a.dataObj.getTime()
  })
}

export function ProcessoObservacoesTimeline({
  processoId,
  numeroProcesso,
  observacoesTexto,
  dataUltimaAtualizacao,
  versaoAtual,
  onSalvarTexto,
}: ProcessoObservacoesTimelineProps) {
  const [itensHistorico, setItensHistorico] = useState<ObservacaoItem[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [modoEdicao, setModoEdicao] = useState(false)
  const [textoRascunho, setTextoRascunho] = useState(observacoesTexto)
  const [novaNota, setNovaNota] = useState('')
  const [mostrandoNovaNota, setMostrandoNovaNota] = useState(false)

  useEffect(() => {
    setTextoRascunho(observacoesTexto)
  }, [observacoesTexto])

  // Busca observações arquivadas em juridicos_historico se houver
  useEffect(() => {
    if (!processoId && !numeroProcesso) return

    let ativo = true
    const buscarHistorico = async () => {
      try {
        setCarregandoHistorico(true)
        let filtro = ''
        if (processoId) filtro = `processo_id = "${processoId}"`
        if (numeroProcesso) {
          filtro = filtro
            ? `(${filtro} || numero_processo = "${numeroProcesso}")`
            : `numero_processo = "${numeroProcesso}"`
        }

        const res = await pb.collection('juridicos_historico').getList(1, 30, {
          filter: filtro,
          sort: '-versao',
        })

        if (!ativo) return

        const itensHist: ObservacaoItem[] = []
        for (const item of res.items || []) {
          const obs = item.valores_anteriores?.observacoes || item.alteracoes?.observacoes
          if (obs && String(obs).trim()) {
            const dataIso = item.data_importacao || item.created
            let dTexto = 'Histórico'
            let dObj: Date | undefined
            try {
              const d = new Date(dataIso)
              dTexto =
                d.toLocaleDateString('pt-BR') +
                ' às ' +
                d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              dObj = d
            } catch {
              /* ignore */
            }

            itensHist.push({
              id: `hist-${item.id}`,
              dataTexto: dTexto,
              dataObj: dObj,
              texto: String(obs).trim(),
              origem: 'historico',
              versao: item.versao,
              autorTag: item.importado_por ? `(${item.importado_por})` : undefined,
            })
          }
        }

        setItensHistorico(itensHist)
      } catch {
        /* silencia falha de histórico secundário */
      } finally {
        if (ativo) setCarregandoHistorico(false)
      }
    }

    buscarHistorico()
    return () => {
      ativo = false
    }
  }, [processoId, numeroProcesso])

  // Entradas extraídas do texto atual do processo
  const entradasDoTexto = extrairEntradasDeObservacoes(observacoesTexto, dataUltimaAtualizacao)

  // Junta todas as observações, evitando duplicatas com texto idêntico
  const todasEntradas: ObservacaoItem[] = [...entradasDoTexto]
  for (const hist of itensHistorico) {
    const jaExiste = todasEntradas.some(
      (e) => e.texto.trim() === hist.texto.trim() || hist.texto.includes(e.texto),
    )
    if (!jaExiste) {
      todasEntradas.push(hist)
    }
  }

  // Ordenação final
  todasEntradas.sort((a, b) => {
    if (a.dataObj && b.dataObj) {
      return b.dataObj.getTime() - a.dataObj.getTime()
    }
    return 0
  })

  const handleSalvarTextoManual = () => {
    if (onSalvarTexto) {
      onSalvarTexto(textoRascunho)
    }
    setModoEdicao(false)
  }

  const handleAdicionarNovaNota = () => {
    if (!novaNota.trim()) return
    const hoje = new Date()
    const dataStr = hoje.toLocaleDateString('pt-BR')
    const usuarioEmail = pb.authStore.model?.email?.split('@')[0]?.toUpperCase() || 'USUÁRIO'
    const novaEntradaFormatada = `${dataStr} (${usuarioEmail}): ${novaNota.trim()}`

    const novoTextoCompleto = observacoesTexto
      ? `${novaEntradaFormatada}\n\n${observacoesTexto}`
      : novaEntradaFormatada

    if (onSalvarTexto) {
      onSalvarTexto(novoTextoCompleto)
    }
    setTextoRascunho(novoTextoCompleto)
    setNovaNota('')
    setMostrandoNovaNota(false)
  }

  return (
    <div className="bg-gray-50/70 border border-gray-200/90 rounded-xl p-4 space-y-3.5">
      {/* Cabeçalho do Bloco de Observações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-gray-200/80">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 flex items-center gap-2">
              <span>Observações e Andamento Processual</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-white text-gray-600 font-medium"
              >
                {todasEntradas.length} {todasEntradas.length === 1 ? 'registro' : 'registros'}
              </Badge>
              {versaoAtual && versaoAtual > 1 && (
                <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-800 border-0 font-bold">
                  v{versaoAtual}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              Linha do tempo organizada cronologicamente da mais recente para a mais antiga.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMostrandoNovaNota(!mostrandoNovaNota)}
            className="h-7 text-xs bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50 px-2.5 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova anotação
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setModoEdicao(!modoEdicao)}
            className="h-7 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 px-2"
          >
            {modoEdicao ? 'Ver Linha do Tempo' : 'Editar Texto Completo'}
          </Button>
        </div>
      </div>

      {/* Caixa para adicionar nova nota rápida datada */}
      {mostrandoNovaNota && (
        <div className="bg-white border border-emerald-200 rounded-xl p-3 shadow-xs space-y-2 animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-emerald-900 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-700" />
            Adicionar nova entrada na data de hoje ({new Date().toLocaleDateString('pt-BR')}):
          </div>
          <Textarea
            rows={2}
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            placeholder="Digite aqui o andamento, despacho ou observação..."
            className="text-xs bg-gray-50/50"
            autoFocus
          />
          <div className="flex justify-end gap-1.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNovaNota('')
                setMostrandoNovaNota(false)
              }}
              className="h-7 text-xs text-gray-500"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdicionarNovaNota}
              disabled={!novaNota.trim()}
              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              Inserir no topo
            </Button>
          </div>
        </div>
      )}

      {/* Modo de Edição Livre */}
      {modoEdicao ? (
        <div className="space-y-2 bg-white p-3 rounded-xl border border-gray-200">
          <div className="text-[11px] text-gray-500">
            Edite o texto livre preservando ou adicionando linhas no formato{' '}
            <code className="bg-gray-100 text-emerald-900 px-1 py-0.5 rounded text-[10px]">
              DD/MM/AAAA (AUTOR): texto
            </code>
            :
          </div>
          <Textarea
            rows={8}
            value={textoRascunho}
            onChange={(e) => setTextoRascunho(e.target.value)}
            className="text-xs font-mono whitespace-pre-wrap leading-relaxed"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTextoRascunho(observacoesTexto)
                setModoEdicao(false)
              }}
              className="h-7 text-xs text-gray-500"
            >
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarTextoManual}
              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Aplicar alterações
            </Button>
          </div>
        </div>
      ) : (
        /* Linha do Tempo Estilizada / Cards Agrupados por Data */
        <div className="space-y-3">
          {todasEntradas.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-400">
              Nenhuma observação ou andamento cadastrado para este processo.
            </div>
          ) : (
            <div className="relative pl-5 sm:pl-6 space-y-3 before:absolute before:left-2 sm:before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-200">
              {todasEntradas.map((item, idx) => {
                return (
                  <div key={item.id || idx} className="relative group">
                    {/* Marcador na linha vertical */}
                    <div className="absolute -left-[19px] sm:-left-[21px] top-2.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-600 shadow-xs ring-2 ring-emerald-100" />

                    {/* Card da entrada */}
                    <div className="bg-white rounded-xl border border-gray-200/90 shadow-2xs p-3.5 hover:border-emerald-200 hover:shadow-xs transition-all">
                      {/* Topo do card: Data em destaque + Tags */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-900 bg-gray-100/90 px-2 py-0.5 rounded-md">
                            <Calendar className="h-3 w-3 text-emerald-700" />
                            {item.dataTexto}
                          </span>
                          {item.autorTag && (
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {item.autorTag}
                            </span>
                          )}
                          {item.origem === 'historico' && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200"
                            >
                              Importação v{item.versao || 1}
                            </Badge>
                          )}
                        </div>

                        {idx === 0 && (
                          <Badge className="text-[9.5px] px-1.5 py-0 bg-emerald-100 text-emerald-800 border-0 font-medium">
                            Mais recente
                          </Badge>
                        )}
                      </div>

                      {/* Conteúdo textual da observação com formatação e whitespace preservado */}
                      <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words font-sans">
                        {item.texto}
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
}
