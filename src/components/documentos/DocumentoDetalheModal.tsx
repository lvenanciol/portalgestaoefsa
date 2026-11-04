import React, { useState } from 'react'
import {
  FileText,
  Calendar,
  Building2,
  DollarSign,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Download,
  Eye,
  Paperclip,
  ExternalLink,
  ChevronRight,
  Layers,
  MapPin,
  User,
  Users,
  Scale,
  Sparkles,
  ArrowLeft,
  X,
  FileCheck,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { DocumentoParecerButton } from './DocumentoParecerButton'
import pb from '@/lib/pocketbase/client'

export interface DocumentoDetalheModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  documento: any | null
  onAbrirAnexos?: (doc: any) => void
}

export function DocumentoDetalheModal({
  aberto,
  onOpenChange,
  tipoAba,
  documento,
  onAbrirAnexos,
}: DocumentoDetalheModalProps) {
  const [visualizandoAnexo, setVisualizandoAnexo] = useState(false)

  if (!documento) return null

  const colecaoMap: Record<string, string> = {
    alvaras: 'alvaras',
    contratos: 'contratos',
    locacoes: 'contratos',
    atas: 'atas',
    juridicos: 'processos_juridicos',
  }
  const colecao = colecaoMap[tipoAba] || 'contratos'

  const nomeArquivoAnexo = documento.anexo || ''
  const urlAnexo = nomeArquivoAnexo ? pb.files.getURL(documento, nomeArquivoAnexo) : ''
  const isPdf = nomeArquivoAnexo.toLowerCase().endsWith('.pdf')

  const formatarData = (d?: string) => {
    if (!d) return '—'
    const clean = d.split('T')[0].split(' ')[0]
    const [ano, mes, dia] = clean.split('-')
    if (ano && mes && dia) return `${dia}/${mes}/${ano}`
    return d
  }

  const formatarMoeda = (val: any) => {
    if (val === null || val === undefined || val === '') return '—'
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
    if (isNaN(num)) return String(val)
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Título e identificadores
  const titulosAba: Record<string, string> = {
    alvaras: 'Alvará / Licença',
    contratos: 'Contrato Comercial',
    locacoes: 'Contrato de Locação',
    atas: 'Ata de Reunião / Assembleia',
    juridicos: 'Processo Jurídico',
  }

  const tituloPrincipal =
    documento.titulo || documento.numero || documento.numero_processo || 'Documento'

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
    if (s === 'vencido' || s === 'encerrado') {
      return (
        <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs px-2.5 py-0.5 font-medium flex items-center gap-1">
          <XCircle className="h-3 w-3 text-rose-600" />
          {status || 'Vencido'}
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-gray-700 text-xs">
        {status || '—'}
      </Badge>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#f8fafc] max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl shadow-2xl border border-gray-200/80">
        {/* Topbar / Breadcrumb elegante */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-900">Documentos</span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-gray-600 font-medium">{titulosAba[tipoAba]}</span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-emerald-700 font-semibold truncate max-w-[260px]">
              {tituloPrincipal}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Parecer integrado no detalhe (h) */}
            <DocumentoParecerButton documento={documento} tipoAba={tipoAba} promptPadrao="" />{' '}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-gray-600 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Card com Identificação Principal */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-wider uppercase text-emerald-800 flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Registro de {titulosAba[tipoAba]}
                </div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                  {tituloPrincipal}
                </h2>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Empresa com ícone */}
                {documento.empresa && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800">
                    <EmpresaIcon nome={documento.empresa} className="h-4 w-4 rounded shrink-0" />
                    <span>{documento.empresa}</span>
                  </div>
                )}
                {renderBadgeStatus(documento.status)}
              </div>
            </div>

            {/* Subtítulo ou Objeto rápido */}
            {(documento.objeto || documento.resumo || documento.tipo) && (
              <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                {documento.objeto || documento.resumo || `Tipo: ${documento.tipo}`}
              </p>
            )}
          </div>

          {/* Seção de Arquivo Anexo (d - Visualizar / Baixar para todas as abas) */}
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
                      onClick={() => setVisualizandoAnexo(!visualizandoAnexo)}
                      className="h-8 text-xs font-medium border-gray-200 text-gray-700 hover:bg-white"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1 text-gray-600" />
                      {visualizandoAnexo ? 'Ocultar' : 'Visualizar'}
                    </Button>
                  )}
                  <a
                    href={urlAnexo}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center justify-center h-8 px-3 text-xs font-semibold text-white bg-[#1B5E20] hover:bg-[#1B5E20]/90 rounded-md shadow-sm transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Baixar arquivo
                  </a>
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

            {/* Visualizador de PDF embutido */}
            {visualizandoAnexo && urlAnexo && isPdf && (
              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-gray-100 shadow-inner">
                <iframe
                  src={urlAnexo}
                  title="Visualizador de Documento"
                  className="w-full h-[480px] border-0"
                />
              </div>
            )}
          </div>

          {/* GRID DE CAMPOS ESTRUTURADOS POR ABA (d1) */}
          <div className="bg-white rounded-xl p-5 border border-gray-200/80 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-700" />
              Informações Detalhadas
            </h3>

            {/* 1. ABA ALVARÁS */}
            {tipoAba === 'alvaras' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Número do Alvará
                  </div>
                  <div className="text-xs font-bold text-gray-900">{documento.numero || '—'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Tipo de Alvará
                  </div>
                  <div className="text-xs font-semibold text-gray-800">{documento.tipo || '—'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">Órgão Emissor</div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.orgao_emissor || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Município / UF
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.municipio || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Data de Validade
                  </div>
                  <div className="text-xs font-semibold text-emerald-800">
                    {formatarData(documento.validade)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Situação Cadastral
                  </div>
                  <div className="text-xs font-semibold capitalize text-gray-800">
                    {documento.status || '—'}
                  </div>
                </div>
                {documento.observacoes && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Observações e Condicionantes
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.observacoes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2 & 3. CONTRATOS & LOCAÇÕES (Baseado em Contrato Petrolina Revisado) */}
            {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Contraparte / Locador
                  </div>
                  <div className="text-xs font-bold text-gray-900">{documento.parte || '—'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Valor Mensal (R$)
                  </div>
                  <div className="text-xs font-bold text-emerald-800">
                    {formatarMoeda(documento.valor_mensal)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Índice de Reajuste
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.indexador || 'IGP-M'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Início da Vigência
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {formatarData(documento.inicio)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Término da Vigência
                  </div>
                  <div className="text-xs font-bold text-gray-900">
                    {formatarData(documento.fim)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Forma de Pagamento
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.forma_pagamento || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Garantia / Fiança
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.garantia || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Laudo de Vistoria
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.vistoria || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Tipo de Instrumento
                  </div>
                  <div className="text-xs font-medium capitalize text-gray-800">
                    {documento.tipo || '—'}
                  </div>
                </div>

                {documento.objeto && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Objeto Detalhado
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.objeto}
                    </div>
                  </div>
                )}
                {documento.observacao && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Observações Gerais
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.observacao}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. ATAS (Baseado em Ata de AGE Casafruti Conde de Bonfim) */}
            {tipoAba === 'atas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">Tipo de Ata</div>
                  <div className="text-xs font-bold text-gray-900">
                    {documento.tipo_ata || 'AGE'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Data da Reunião
                  </div>
                  <div className="text-xs font-semibold text-emerald-800">
                    {formatarData(documento.data)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Assinatura Eletrônica
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.assinatura_eletronica || 'Sim'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Mesa Diretora (Presidente e Secretário)
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.mesa_diretora || '—'}
                  </div>
                </div>
                {documento.participantes && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Quórum / Participantes Presentes
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.participantes}
                    </div>
                  </div>
                )}
                {documento.pauta && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Ordem do Dia / Pauta Pautada
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.pauta}
                    </div>
                  </div>
                )}
                {documento.deliberacoes && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Deliberações e Resoluções Aprovadas
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.deliberacoes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. PROCESSOS JURÍDICOS (Baseado no Relatório de processos em Excel) */}
            {tipoAba === 'juridicos' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Número do Processo
                  </div>
                  <div className="text-xs font-bold text-gray-900 font-mono">
                    {documento.numero_processo || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Vara / Comarca
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.vara_comarca || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Valor da Causa (R$)
                  </div>
                  <div className="text-xs font-bold text-emerald-800">
                    {formatarMoeda(documento.valor_causa)}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Polo Ativo (Autor)
                  </div>
                  <div className="text-xs font-medium text-gray-800">{documento.autor || '—'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Polo Passivo (Réu)
                  </div>
                  <div className="text-xs font-medium text-gray-800">{documento.reu || '—'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Classificação de Risco
                  </div>
                  <div className="text-xs font-semibold capitalize text-gray-800">
                    {documento.risco || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Fase / Instância
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.fase_instancia || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Advogado Responsável
                  </div>
                  <div className="text-xs font-medium text-gray-800">
                    {documento.advogado || '—'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase text-gray-400">
                    Próxima Audiência / Prazo
                  </div>
                  <div className="text-xs font-semibold text-emerald-800">
                    {formatarData(documento.proxima_audiencia)}
                  </div>
                </div>
                {documento.observacoes && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-full space-y-0.5">
                    <div className="text-[10px] font-bold uppercase text-gray-400">
                      Resumo dos Fatos / Andamento
                    </div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">
                      {documento.observacoes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
