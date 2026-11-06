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
import {
  ehRodapePagina,
  removerRodapesDePagina,
  truncarCorpoEmBlocoEstruturado,
} from './juridicos-texto-utils'
import pb from '@/lib/pocketbase/client'

export interface ObservacaoItem {
  id: string
  dataTexto: string // Ex: "09/10/2026", "09/10/2026 14:30"
  dataObj?: Date
  autorTag?: string // Ex: "(CJ)", "(MGP)"
  texto: string
  origem: 'processo' | 'historico' | 'manual'
  versao?: number
  ehAbertura?: boolean // Entrada de abertura/relatório do processo
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
 * Separa o texto de um evento em RESUMO (primeira frase / título antes do separador)
 * e CORPO (resto, com quebras de linha preservadas). Usado pelos cards da timeline.
 */
export function separarResumoEvento(texto: string): { resumo: string; corpo: string } {
  const t = (texto || '').trim()
  if (!t) return { resumo: '', corpo: '' }

  // Títulos padronizados do relatório: "Publicada intimação - ...", "Protocolada petição - ..."
  const mTitulo = t.match(
    /^((?:Publicad[oa]|Protocolad[oa]|Realizad[oa]|Designad[oa]|Juntad[oa]|Elaborad[oa])[^.!?\n]{0,90}?)\s*[-–—]\s+/i,
  )
  if (mTitulo) {
    return { resumo: mTitulo[1].trim(), corpo: t.slice(mTitulo[0].length).trim() }
  }

  // Primeira frase (até o primeiro ponto final), quando razoavelmente curta
  const fimFrase = t.search(/[.!?](\s|$)/)
  if (fimFrase > 0 && fimFrase <= 400) {
    return { resumo: t.slice(0, fimFrase + 1).trim(), corpo: t.slice(fimFrase + 1).trim() }
  }

  if (t.length <= 220) return { resumo: t, corpo: '' }
  return { resumo: t.slice(0, 200).trim() + '…', corpo: t.slice(200).trim() }
}
export function extrairEntradasDeObservacoes(
  texto: string,
  dataFallback?: string,
): ObservacaoItem[] {
  if (!texto || !texto.trim()) return []

  // Remove qualquer rodapé/marcador de página remanescente antes de segmentar
  const textoSemRodapes = removerRodapesDePagina(texto)
  // A cronologia exibida contém SOMENTE os eventos datados do PDF:
  // todo texto após o último evento (blocos estruturados "Valores / Valor base /
  // Garantias / Providências / Data da última atualização", ficha do processo)
  // é descartado aqui, junto com marcadores "--- PAGINA_N ---".
  let trimmed = textoSemRodapes.trim()
  if (!trimmed) return []

  // Regex flexível para identificar inícios de entrada datada:
  // Aceita:
  // - "09/10/2026 (CJ):", "09/10/2026 -", "09/10/2026 às 14:00:", "09/10/2026:"
  // - Dias e meses sem zero à esquerda: "9/10/2026", "03/6/2026", "3/6/2026"
  // - Anos de 2 ou 4 dígitos: "09/10/26" ou "09/10/2026"
  // - Espaços flexíveis entre barras: "09 / 10 / 2026"
  // - Delimitadores com hífen, ponto ou barra: "09-10-2026", "09.10.2026"
  // - Tags com ou sem parênteses, inclusive coladas à data: "(CJ):", "10/05/2026(BM):"
  // A data NÃO precisa estar no começo da linha — o corte acontece em qualquer posição
  // do texto corrido, desde que venha seguida de ":" (com tag opcional entre parênteses).
  const dataRegex =
    /(\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*(?:\d{4}|\d{2}))(?:\s*,?\s*(?:[aàá]s\s+)?\d{1,2}:\d{2}(?::\d{2})?)?\s*(?:\(([^()]{1,15})\))?\s*:\s*/gi

  const ultimosMatches = [...trimmed.matchAll(dataRegex)]
  if (ultimosMatches.length > 0) {
    const ultimo = ultimosMatches[ultimosMatches.length - 1]
    const corpoUltimo = trimmed.substring(ultimo.index! + ultimo[0].length)
    const corpoLimpo = truncarCorpoEmBlocoEstruturado(corpoUltimo)
    if (corpoLimpo !== corpoUltimo.trim()) {
      // Houve conteúdo estruturado/ruído após o último evento: corta o texto
      // no fim do último andamento preservado.
      const fimPreservado = ultimo.index! + ultimo[0].length + corpoLimpo.length
      trimmed = trimmed.substring(0, fimPreservado)
    }
  }
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

  // Se houver texto anterior ao primeiro match (ex: introdução ou observação preliminar sem data), não descarta
  const primeiroMatch = matches[0]
  if (primeiroMatch && primeiroMatch.index! > 0) {
    const textoPreliminar = trimmed.substring(0, primeiroMatch.index!).trim()
    if (textoPreliminar && !ehRodapePagina(textoPreliminar)) {
      itens.push({
        id: 'entrada-preliminar',
        dataTexto: 'Abertura/Relatório',
        texto: textoPreliminar,
        origem: 'processo',
        ehAbertura: true,
      })
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]

    // Ignora match cujo próprio cabeçalho é rodapé de página
    // (ex.: "01/11/2026 00:44Pagina 50 de 71") — nunca vira evento
    const trechoCabecalho = trimmed.substring(
      match.index!,
      Math.min(trimmed.length, match.index! + 60),
    )
    if (ehRodapePagina(trechoCabecalho)) {
      continue
    }

    // Normaliza a data para formato DD/MM/AAAA limpo
    const dataCrua = match[1].replace(/\s+/g, '')
    const partesSeparadas = dataCrua.split(/[/.-]/)
    let dataFormatada = dataCrua
    let dataObj: Date | undefined

    if (partesSeparadas.length === 3) {
      const dia = partesSeparadas[0].padStart(2, '0')
      const mes = partesSeparadas[1].padStart(2, '0')
      let ano = partesSeparadas[2]
      if (ano.length === 2) {
        ano = Number(ano) < 70 ? `20${ano}` : `19${ano}`
      }
      dataFormatada = `${dia}/${mes}/${ano}`

      try {
        const d = new Date(Number(ano), Number(mes) - 1, Number(dia))
        if (!isNaN(d.getTime())) {
          dataObj = d
        }
      } catch {
        /* ignore */
      }
    }

    const autorRaw = (match[2] || '').trim()
    const autorTag = autorRaw ? `(${autorRaw.toUpperCase()})` : undefined
    const startIndex = match.index! + match[0].length
    const nextMatch = matches[i + 1]
    const endIndex = nextMatch ? nextMatch.index! : trimmed.length

    // Rodapés remanescentes DENTRO do corpo são limpos — o evento nunca é descartado por isso
    // Blocos estruturados do PDF (Valores / Valor base / Garantias / Providências /
    // Data da última atualização) NÃO pertencem ao andamento: o corpo termina neles.
    const textoEntrada = truncarCorpoEmBlocoEstruturado(
      removerRodapesDePagina(trimmed.substring(startIndex, endIndex)),
    )
    if (!textoEntrada) continue

    itens.push({
      id: `entrada-${i}-${dataFormatada}`,
      dataTexto: dataFormatada,
      dataObj,
      autorTag,
      texto: textoEntrada,
      origem: 'processo',
      ehAbertura: /(^|\n)\s*(Trata-se\b|Relat[oó]rio\b)/i.test(textoEntrada),
    })
  }

  // Ordena da mais recente para a mais antiga; entradas sem data (abertura) vão para o fim
  return itens.sort((a, b) => {
    if (a.dataObj && b.dataObj) return b.dataObj.getTime() - a.dataObj.getTime()
    if (a.dataObj) return -1
    if (b.dataObj) return 1
    return 0
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

  // Ordenação final: mais recente primeiro; abertura/relatório sem data vai para o fim
  todasEntradas.sort((a, b) => {
    if (a.dataObj && b.dataObj) {
      return b.dataObj.getTime() - a.dataObj.getTime()
    }
    if (a.dataObj) return -1
    if (b.dataObj) return 1
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
                          {item.ehAbertura && (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                              Abertura/Relatório
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

                        {idx === 0 && !item.ehAbertura && item.origem !== 'historico' && (
                          <Badge className="text-[9.5px] px-1.5 py-0 bg-emerald-100 text-emerald-800 border-0 font-medium">
                            Mais recente
                          </Badge>
                        )}
                      </div>

                      {/* Resumo destacado + texto completo, quebras de linha preservadas */}
                      {(() => {
                        const { resumo, corpo } = separarResumoEvento(item.texto)
                        return (
                          <>
                            {resumo && (
                              <div className="text-xs font-semibold text-gray-900 leading-relaxed whitespace-pre-wrap break-words mb-1">
                                {resumo}
                              </div>
                            )}
                            {corpo && (
                              <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words font-sans">
                                {corpo}
                              </div>
                            )}
                          </>
                        )
                      })()}
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
