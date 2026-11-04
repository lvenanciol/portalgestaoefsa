import React, { useState, useEffect } from 'react'
import {
  X,
  FileText,
  Calendar,
  Building2,
  Paperclip,
  Eye,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Layers,
  Save,
  Loader2,
  FileEdit,
  Building,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { DocumentoParecerButton } from './DocumentoParecerButton'
import { PdfViewer } from './PdfViewer'
import pb from '@/lib/pocketbase/client'

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  empresas?: { id: string; nome: string }[]
  onAtualizado?: () => void
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
  onOpenChange,
  tipoAba,
  documento,
  empresas = [],
  onAtualizado,
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)
  const [blobUrlPdf, setBlobUrlPdf] = useState<string | null>(null)
  const [carregandoPdf, setCarregandoPdf] = useState(false)

  // Estado dos campos editáveis do documento
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [salvando, setSalvando] = useState(false)
  const [feedbackSalvo, setFeedbackSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  // Ao receber/mudar documento, inicializa o formulário
  useEffect(() => {
    if (documento) {
      setFormData({ ...documento })
      setFeedbackSalvo(false)
      setErroSalvar(null)
    }
  }, [documento])

  // Limpa Blob URL ao fechar modal
  useEffect(() => {
    if (!aberto) {
      setVisualizandoAnexo(false)
      if (blobUrlPdf && blobUrlPdf.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlPdf)
        setBlobUrlPdf(null)
      }
    }
  }, [aberto, blobUrlPdf])

  if (!documento) return null

  const nomeArquivoAnexo = documento.anexo || ''
  const urlAnexo = nomeArquivoAnexo ? pb.files.getURL(documento, nomeArquivoAnexo) : ''
  const isPdf = nomeArquivoAnexo.toLowerCase().endsWith('.pdf')

  const setCampo = (campo: string, valor: any) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }))
  }

  // Alterna visualização do PDF no detalhe com PdfViewer
  const toggleVisualizarPdf = async () => {
    if (visualizandoAnexo) {
      setVisualizandoAnexo(false)
      if (blobUrlPdf && blobUrlPdf.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlPdf)
        setBlobUrlPdf(null)
      }
      return
    }

    if (!urlAnexo || !isPdf) return

    setVisualizandoAnexo(true)
    setCarregandoPdf(true)
    try {
      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token
      }
      const resp = await fetch(urlAnexo, { headers })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const rawBlob = await resp.blob()
      const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' })
      const objectUrl = URL.createObjectURL(pdfBlob)
      setBlobUrlPdf(objectUrl)
    } catch (e) {
      console.warn('Erro ao carregar PDF como blob no detalhe, usando url direta:', e)
      setBlobUrlPdf(urlAnexo)
    } finally {
      setCarregandoPdf(false)
    }
  }

  // Salvar alterações diretamente no PocketBase
  const handleSalvarEdicao = async () => {
    setSalvando(true)
    setErroSalvar(null)
    setFeedbackSalvo(false)

    try {
      let colecao = ''
      const payload: Record<string, any> = {}

      if (tipoAba === 'alvaras') {
        colecao = 'alvaras'
        payload.empresa = formData.empresa
        payload.numero = formData.numero
        payload.tipo = formData.tipo
        payload.orgao_emissor = formData.orgao_emissor
        payload.municipio = formData.municipio
        payload.status = formData.status
        payload.observacoes = formData.observacoes || ''
        if (formData.validade) {
          payload.validade = formData.validade.includes('T')
            ? formData.validade
            : `${formData.validade} 00:00:00.000Z`
        }
      } else if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
        colecao = 'contratos'
        payload.empresa = formData.empresa
        payload.titulo = formData.titulo
        payload.parte = formData.parte
        payload.status = formData.status
        payload.objeto = formData.objeto || ''
        payload.indexador = formData.indexador || ''
        payload.forma_pagamento = formData.forma_pagamento || ''
        payload.garantia = formData.garantia || ''
        payload.vistoria = formData.vistoria || ''
        payload.observacao = formData.observacao || ''

        const valNum =
          typeof formData.valor_mensal === 'number'
            ? formData.valor_mensal
            : parseFloat(
                String(formData.valor_mensal || '')
                  .replace(/[R$\s.]/g, '')
                  .replace(',', '.'),
              )
        if (!isNaN(valNum)) payload.valor_mensal = valNum

        if (formData.inicio) {
          payload.inicio = formData.inicio.includes('T')
            ? formData.inicio
            : `${formData.inicio} 00:00:00.000Z`
        }
        if (formData.fim) {
          payload.fim = formData.fim.includes('T') ? formData.fim : `${formData.fim} 00:00:00.000Z`
        }
      } else if (tipoAba === 'atas') {
        colecao = 'atas'
        payload.empresa = formData.empresa
        payload.titulo = formData.titulo
        payload.tipo_ata = formData.tipo_ata
        payload.mesa_diretora = formData.mesa_diretora || ''
        payload.participantes = formData.participantes || ''
        payload.pauta = formData.pauta || ''
        payload.deliberacoes = formData.deliberacoes || ''
        payload.assinatura_eletronica = formData.assinatura_eletronica || ''
        payload.resumo = formData.resumo || ''
        if (formData.data) {
          payload.data = formData.data.includes('T')
            ? formData.data
            : `${formData.data} 10:00:00.000Z`
        }
      } else if (tipoAba === 'juridicos') {
        colecao = 'processos_juridicos'
        payload.empresa = formData.empresa
        payload.numero_processo = formData.numero_processo
        payload.vara_comarca = formData.vara_comarca || ''
        payload.autor = formData.autor || ''
        payload.reu = formData.reu || ''
        payload.fase_instancia = formData.fase_instancia || ''
        payload.assunto_tipo = formData.assunto_tipo || ''
        payload.advogado = formData.advogado || ''
        payload.status = formData.status || 'ativo'
        payload.risco = formData.risco || 'possivel'
        payload.observacoes = formData.observacoes || ''

        const valCausa =
          typeof formData.valor_causa === 'number'
            ? formData.valor_causa
            : parseFloat(
                String(formData.valor_causa || '')
                  .replace(/[R$\s.]/g, '')
                  .replace(',', '.'),
              )
        if (!isNaN(valCausa)) payload.valor_causa = valCausa

        if (formData.data_distribuicao) {
          payload.data_distribuicao = formData.data_distribuicao.includes('T')
            ? formData.data_distribuicao
            : `${formData.data_distribuicao} 00:00:00.000Z`
        }
        if (formData.proxima_audiencia) {
          payload.proxima_audiencia = formData.proxima_audiencia.includes('T')
            ? formData.proxima_audiencia
            : `${formData.proxima_audiencia} 00:00:00.000Z`
        }
      }

      await pb.collection(colecao).update(documento.id, payload)
      setFeedbackSalvo(true)
      if (onAtualizado) {
        onAtualizado()
      }
      setTimeout(() => setFeedbackSalvo(false), 3000)
    } catch (err: any) {
      console.error('Erro ao salvar documento:', err)
      setErroSalvar(err?.message || 'Falha ao salvar alterações do documento.')
    } finally {
      setSalvando(false)
    }
  }

  const formatarDataInput = (d?: string) => {
    if (!d) return ''
    return d.split('T')[0].split(' ')[0]
  }

  const titulosAba: Record<string, string> = {
    alvaras: 'Alvará / Licença',
    contratos: 'Contrato Comercial',
    locacoes: 'Contrato de Locação',
    atas: 'Ata de Reunião / Assembleia',
    juridicos: 'Processo Jurídico',
  }

  const tituloPrincipal =
    formData.titulo || formData.numero || formData.numero_processo || 'Documento'

  const renderBadgeStatus = (status: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'regular' || s === 'ativo' || s === 'vigente') {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-emerald-600" />
          {status || 'Ativo'}
        </Badge>
      )
    }
    if (s === 'vencendo' || s === 'em_renovacao' || s === 'alerta') {
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-600" />
          {status || 'Vencendo'}
        </Badge>
      )
    }
    return (
      <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
        <XCircle className="h-3 w-3 text-rose-600" />
        {status || 'Vencido'}
      </Badge>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 rounded-2xl bg-gray-50/95 border-gray-200">
        {/* Cabeçalho superior */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center">
              <FileEdit className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900 leading-tight">
                {titulosAba[tipoAba] || 'Detalhes do Documento'}
              </DialogTitle>
              <div className="flex items-center gap-2 text-xs text-emerald-800 font-medium">
                <span>Modo de visualização e edição direta</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DocumentoParecerButton tipoAba={tipoAba} documento={formData} promptPadrao="" />

            <Button
              type="button"
              size="sm"
              disabled={salvando}
              onClick={handleSalvarEdicao}
              className={`h-8 px-3 text-xs font-semibold shadow-sm transition-all ${
                feedbackSalvo
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#1B5E20] hover:bg-[#0F3D13] text-white'
              }`}
            >
              {salvando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando...
                </>
              ) : feedbackSalvo ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Salvo com sucesso!
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar alterações
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {erroSalvar && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
              {erroSalvar}
            </div>
          )}

          {/* Cartão principal do documento */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  {tipoAba === 'alvaras'
                    ? 'Identificação / Alvará'
                    : tipoAba === 'juridicos'
                      ? 'Processo'
                      : 'Título do Documento'}
                </label>
                <Input
                  value={
                    tipoAba === 'alvaras'
                      ? formData.numero || ''
                      : tipoAba === 'juridicos'
                        ? formData.numero_processo || ''
                        : formData.titulo || ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    if (tipoAba === 'alvaras') setCampo('numero', val)
                    else if (tipoAba === 'juridicos') setCampo('numero_processo', val)
                    else setCampo('titulo', val)
                  }}
                  className="font-bold text-gray-900 text-sm h-9 bg-gray-50/50"
                  placeholder="Título ou identificador do documento"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Empresa Vinculada
                </label>
                {empresas.length > 0 ? (
                  <select
                    value={formData.empresa || ''}
                    onChange={(e) => setCampo('empresa', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.nome}>
                        {emp.nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={formData.empresa || ''}
                    onChange={(e) => setCampo('empresa', e.target.value)}
                    className="text-xs font-semibold text-gray-800 h-9"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Seção de Arquivo Anexo */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-emerald-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Arquivo Anexo do Documento
                </h3>
              </div>
              {onAbrirAnexos && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAbrirAnexos(documento)}
                  className="h-7 text-xs font-medium text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                >
                  Gerenciar anexo
                </Button>
              )}
            </div>

            {nomeArquivoAnexo ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                    {isPdf ? 'PDF' : 'DOC'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate max-w-sm">
                      {nomeArquivoAnexo}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Disponível para visualização e download
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isPdf && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleVisualizarPdf}
                      className="h-8 text-xs font-medium border-gray-200 text-gray-700 hover:bg-white"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1 text-gray-600" />
                      {visualizandoAnexo ? 'Ocultar' : 'Visualizar'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      try {
                        const headers: Record<string, string> = {}
                        if (pb.authStore.token) headers['Authorization'] = pb.authStore.token
                        const resp = await fetch(urlAnexo, { headers })
                        if (resp.ok) {
                          const blob = await resp.blob()
                          const dUrl = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = dUrl
                          a.download = nomeArquivoAnexo || 'documento'
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          setTimeout(() => URL.revokeObjectURL(dUrl), 1000)
                          return
                        }
                      } catch {
                        /* fallback */
                      }
                      const a = document.createElement('a')
                      a.href = urlAnexo
                      a.download = nomeArquivoAnexo || 'documento'
                      a.target = '_blank'
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    }}
                    className="h-8 px-3 text-xs font-semibold text-white bg-[#1B5E20] hover:bg-[#1B5E20]/90 rounded-md shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Baixar arquivo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center border border-dashed border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50/50">
                Nenhum arquivo anexado a este documento ainda.
                {onAbrirAnexos && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => onAbrirAnexos(documento)}
                    className="h-auto p-0 text-xs text-emerald-700 font-semibold ml-1.5"
                  >
                    Anexar agora (PDF, DOCX, XLSX)
                  </Button>
                )}
              </div>
            )}

            {/* Visualizador de PDF embutido seguro via PdfViewer */}
            {visualizandoAnexo && isPdf && (
              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-gray-900 shadow-inner relative">
                {carregandoPdf ? (
                  <div className="h-[480px] flex items-center justify-center bg-gray-900/90 text-xs text-gray-300">
                    Preparando arquivo PDF...
                  </div>
                ) : blobUrlPdf ? (
                  <PdfViewer
                    url={blobUrlPdf}
                    fileName={nomeArquivoAnexo || 'documento.pdf'}
                    minHeight={520}
                    className="w-full"
                  />
                ) : null}
              </div>
            )}
          </div>

          {/* GRID DE CAMPOS EDITÁVEIS POR ABA */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-700" />
                Campos Editáveis do Documento
              </h3>
              <span className="text-[11px] text-gray-400">
                Edite os valores abaixo e clique em &quot;Salvar alterações&quot;
              </span>
            </div>

            {/* 1. ABA ALVARÁS */}
            {tipoAba === 'alvaras' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Número do Alvará
                  </label>
                  <Input
                    value={formData.numero || ''}
                    onChange={(e) => setCampo('numero', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Tipo de Alvará
                  </label>
                  <Input
                    value={formData.tipo || ''}
                    onChange={(e) => setCampo('tipo', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Órgão Emissor
                  </label>
                  <Input
                    value={formData.orgao_emissor || ''}
                    onChange={(e) => setCampo('orgao_emissor', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Município / UF
                  </label>
                  <Input
                    value={formData.municipio || ''}
                    onChange={(e) => setCampo('municipio', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Data de Validade
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.validade)}
                    onChange={(e) => setCampo('validade', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Situação Cadastral
                  </label>
                  <select
                    value={formData.status || 'regular'}
                    onChange={(e) => setCampo('status', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="regular">Regular</option>
                    <option value="vencendo">Vencendo</option>
                    <option value="vencido">Vencido</option>
                    <option value="em_renovacao">Em Renovação</option>
                  </select>
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Observações e Condicionantes
                  </label>
                  <Textarea
                    rows={3}
                    value={formData.observacoes || ''}
                    onChange={(e) => setCampo('observacoes', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 2 & 3. CONTRATOS & LOCAÇÕES */}
            {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    {tipoAba === 'locacoes' ? 'Locador / Proprietário' : 'Contraparte / Fornecedor'}
                  </label>
                  <Input
                    value={formData.parte || ''}
                    onChange={(e) => setCampo('parte', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor Mensal (R$)
                  </label>
                  <Input
                    value={formData.valor_mensal ?? ''}
                    onChange={(e) => setCampo('valor_mensal', e.target.value)}
                    className="h-9 text-xs font-semibold text-emerald-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Índice de Reajuste
                  </label>
                  <Input
                    value={formData.indexador || ''}
                    onChange={(e) => setCampo('indexador', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Início da Vigência
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.inicio)}
                    onChange={(e) => setCampo('inicio', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Término da Vigência
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.fim)}
                    onChange={(e) => setCampo('fim', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Situação Contratual
                  </label>
                  <select
                    value={formData.status || 'ativo'}
                    onChange={(e) => setCampo('status', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="em_renovacao">Em Renovação</option>
                    <option value="encerrado">Encerrado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Garantia Locatícia / Contratual
                  </label>
                  <Input
                    value={formData.garantia || ''}
                    onChange={(e) => setCampo('garantia', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Laudo de Vistoria
                  </label>
                  <Input
                    value={formData.vistoria || ''}
                    onChange={(e) => setCampo('vistoria', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Forma de Pagamento
                  </label>
                  <Input
                    value={formData.forma_pagamento || ''}
                    onChange={(e) => setCampo('forma_pagamento', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Objeto do Contrato
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.objeto || ''}
                    onChange={(e) => setCampo('objeto', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Observações Adicionais
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.observacao || ''}
                    onChange={(e) => setCampo('observacao', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 4. ABA ATAS */}
            {tipoAba === 'atas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Tipo de Assembleia / Reunião
                  </label>
                  <select
                    value={formData.tipo_ata || 'AGE'}
                    onChange={(e) => setCampo('tipo_ata', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="AGO">AGO (Ordinária)</option>
                    <option value="AGE">AGE (Extraordinária)</option>
                    <option value="Reunião de Diretoria">Reunião de Diretoria</option>
                    <option value="Conselho">Conselho de Administração</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Data da Realização
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.data)}
                    onChange={(e) => setCampo('data', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Assinatura Eletrônica
                  </label>
                  <Input
                    value={formData.assinatura_eletronica || ''}
                    onChange={(e) => setCampo('assinatura_eletronica', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Mesa Diretora (Presidente e Secretário)
                  </label>
                  <Input
                    value={formData.mesa_diretora || ''}
                    onChange={(e) => setCampo('mesa_diretora', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Participantes / Acionistas Presentes
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.participantes || ''}
                    onChange={(e) => setCampo('participantes', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Ordem do Dia / Pauta
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.pauta || ''}
                    onChange={(e) => setCampo('pauta', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Deliberações e Resoluções Aprovadas
                  </label>
                  <Textarea
                    rows={3}
                    value={formData.deliberacoes || ''}
                    onChange={(e) => setCampo('deliberacoes', e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Resumo Executivo
                  </label>
                  <Textarea
                    rows={2}
                    value={formData.resumo || ''}
                    onChange={(e) => setCampo('resumo', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* 5. PROCESSOS JURÍDICOS */}
            {tipoAba === 'juridicos' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Número do Processo
                  </label>
                  <Input
                    value={formData.numero_processo || ''}
                    onChange={(e) => setCampo('numero_processo', e.target.value)}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Vara / Comarca
                  </label>
                  <Input
                    value={formData.vara_comarca || ''}
                    onChange={(e) => setCampo('vara_comarca', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Valor da Causa (R$)
                  </label>
                  <Input
                    value={formData.valor_causa ?? ''}
                    onChange={(e) => setCampo('valor_causa', e.target.value)}
                    className="h-9 text-xs font-bold text-emerald-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Polo Ativo (Autor)
                  </label>
                  <Input
                    value={formData.autor || ''}
                    onChange={(e) => setCampo('autor', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Polo Passivo (Réu)
                  </label>
                  <Input
                    value={formData.reu || ''}
                    onChange={(e) => setCampo('reu', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Classificação de Risco
                  </label>
                  <select
                    value={formData.risco || 'possivel'}
                    onChange={(e) => setCampo('risco', e.target.value)}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-800"
                  >
                    <option value="provavel">Provável</option>
                    <option value="possivel">Possível</option>
                    <option value="remoto">Remoto</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Fase / Instância
                  </label>
                  <Input
                    value={formData.fase_instancia || ''}
                    onChange={(e) => setCampo('fase_instancia', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Advogado Responsável
                  </label>
                  <Input
                    value={formData.advogado || ''}
                    onChange={(e) => setCampo('advogado', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Próxima Audiência / Prazo
                  </label>
                  <Input
                    type="date"
                    value={formatarDataInput(formData.proxima_audiencia)}
                    onChange={(e) => setCampo('proxima_audiencia', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-full space-y-1">
                  <label className="text-[10px] font-bold uppercase text-gray-500">
                    Resumo dos Fatos / Andamento Processual
                  </label>
                  <Textarea
                    rows={3}
                    value={formData.observacoes || ''}
                    onChange={(e) => setCampo('observacoes', e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
