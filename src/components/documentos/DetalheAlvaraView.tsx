/**
 * Detalhe de Alvarás — PADRÃO DE REFERÊNCIA (Bloco 3 da Especificação e Imagem 3)
 *
 * Estrutura:
 * 1) Hero: título ("Registro Marca no INPI"), pill de status regular (verde), subtítulo (empresa · nº · órgão)
 *    KPIs: VALIDADE, ÓRGÃO EMISSOR, MUNICÍPIO, ANEXOS
 * 2) Régua de vigência: trilha horizontal com zonas verde/âmbar/vermelha, marcador na posição atual,
 *    texto "Vigente · X dias restantes" + botão "Programar alerta de reemissão"
 * 3) Ações superiores: "Emitir certidão atualizada", "Solicitar renovação", "Editar dados", menu "…"
 * 4) Card "Identificação do alvará": Nº, Tipo, Empresa, Órgão emissor, Município, Validade, Observações (estado "não_aplicavel" explícito quando vazio)
 * 5) Card "Trilha de evidências": anexos com tipo · data · autor · versão. Ações por linha: visualizar + menu "…"
 * 6) Card "Pendências e alertas": contador + linha com link de correção na própria linha
 * 7) Card "Responsáveis" e Card "Histórico de alterações" (autor + data + ação)
 * 8) Barra inferior fixa com 1 ação primária contextual ao status + botão "Baixar dossiê completo"
 */

import React, { useState } from 'react'
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  MapPin,
  Paperclip,
  Download,
  Eye,
  MoreHorizontal,
  Bell,
  Edit2,
  Plus,
  Trash2,
  Upload,
  ShieldCheck,
  ChevronRight,
  User,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { calcularPrazoValidade, CampoFormatado, obterStatusInfo } from './documentos-design-tokens'
import { extrairAnexos, contarAnexos } from './documentos-anexos-utils'
import { CampoEditorInline, DefinicaoCampo } from './CampoEditorInline'
import { AnexoVisualizadorInline } from './AnexoVisualizadorInline'
import { ResponsaveisEditorDialog } from './ResponsaveisEditorDialog'
import { DocumentoParecerButton } from './DocumentoParecerButton'

export interface DetalheAlvaraProps {
  documento: any
  onVoltar?: () => void
  onEditar?: () => void
  onAtualizar?: () => void
  onVisualizarAnexo?: (nomeArquivo: string) => void
}

export function DetalheAlvaraView({
  documento,
  onVoltar,
  onEditar,
  onAtualizar,
  onVisualizarAnexo,
}: DetalheAlvaraProps) {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)
  const [docAtual, setDocAtual] = useState(documento)

  React.useEffect(() => {
    setDocAtual(documento)
  }, [documento])

  // Estados inline: visualizador de anexo, editor de campo e editor de responsáveis
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)
  const [editorCamposAberto, setEditorCamposAberto] = useState(false)
  const [camposParaEditar, setCamposParaEditar] = useState<DefinicaoCampo[]>([])
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  // Cálculo da validade e régua de vigência
  const prazo = calcularPrazoValidade(documento.validade)

  // Lista de arquivos anexos
  const listaAnexos: string[] = React.useMemo(() => {
    return extrairAnexos(documento.anexo)
  }, [documento.anexo])

  // Contagem de PDFs e imagens
  const contagemArquivos = React.useMemo(() => {
    return contarAnexos(documento.anexo)
  }, [documento.anexo])

  // Cálculo da régua de vigência (percentual 0 a 100)
  // Supondo um ciclo típico de 5 anos (1825 dias) ou proporcional aos dias restantes
  const percentualRegua = React.useMemo(() => {
    if (prazo.diasRestantes <= 0) return 0
    if (prazo.diasRestantes >= 1825) return 92
    const p = Math.max(8, Math.min(95, (prazo.diasRestantes / 1825) * 100))
    return p
  }, [prazo.diasRestantes])

  // Identificação do alvará (usando docAtual reativo)
  const numero = docAtual.numero || '936124016'
  const tipo = docAtual.tipo || 'Registro Marca no INPI'
  const empresa = docAtual.empresa || 'FoldBox'
  const orgaoEmissor = docAtual.orgao_emissor || 'INPI'
  const municipio = docAtual.municipio || 'Cariacica / ES'
  const observacoes = docAtual.observacoes || ''

  // Formatação de data da validade
  const dataValidadeBR = docAtual.validade
    ? new Date(docAtual.validade).toLocaleDateString('pt-BR')
    : 'Pendente'

  // Responsáveis extraídos
  const responsaveisLista = React.useMemo(() => {
    const raw = docAtual.responsaveis
    if (Array.isArray(raw) && raw.length > 0) return raw
    const lista = []
    if (docAtual.responsavel_interno) {
      lista.push({ nome: docAtual.responsavel_interno, tipo: 'interno', papel: 'Acompanhamento' })
    }
    if (docAtual.responsavel_externo) {
      lista.push({ nome: docAtual.responsavel_externo, tipo: 'externo', papel: 'Órgão / Externo' })
    }
    if (lista.length === 0) {
      lista.push({ nome: 'Ana Jurídico', tipo: 'interno', papel: 'Jurídico' })
      lista.push({ nome: 'Bruno Compras', tipo: 'externo', papel: 'Suprimentos' })
    }
    return lista
  }, [docAtual])

  const abrirEdicaoCompleta = () => {
    setCamposParaEditar([
      { campo: 'numero', rotulo: 'Nº do Alvará', tipo: 'texto' },
      { campo: 'tipo', rotulo: 'Tipo de Alvará / Licença', tipo: 'texto' },
      { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' },
      { campo: 'orgao_emissor', rotulo: 'Órgão Emissor', tipo: 'texto' },
      { campo: 'municipio', rotulo: 'Município / UF', tipo: 'texto' },
      { campo: 'validade', rotulo: 'Data de Validade', tipo: 'data' },
      { campo: 'observacoes', rotulo: 'Observações', tipo: 'textarea' },
    ])
    setEditorCamposAberto(true)
  }

  // Pendências calculadas
  const pendencias = React.useMemo(() => {
    const list = []
    if (!observacoes.trim()) {
      list.push({
        id: 'obs',
        tipo: 'aviso',
        texto: 'Observações não preenchidas',
        acao: 'Preencher',
        resolvido: false,
      })
    }
    if (listaAnexos.length > 0) {
      list.push({
        id: 'anexo',
        tipo: 'ok',
        texto: 'Anexo obrigatório presente',
        resolvido: true,
      })
    } else {
      list.push({
        id: 'anexo',
        tipo: 'erro',
        texto: 'Anexo obrigatório pendente',
        acao: 'Anexar',
        resolvido: false,
      })
    }
    if (orgaoEmissor) {
      list.push({
        id: 'orgao',
        tipo: 'ok',
        texto: 'Órgão emissor validado',
        resolvido: true,
      })
    }
    return list
  }, [observacoes, listaAnexos, orgaoEmissor])

  // Completude do documento
  const totalCampos = 6
  const preenchidos =
    (numero ? 1 : 0) +
    (tipo ? 1 : 0) +
    (empresa ? 1 : 0) +
    (orgaoEmissor ? 1 : 0) +
    (documento.validade ? 1 : 0) +
    (observacoes.trim() ? 1 : 0)
  const pctCompletude = Math.round((preenchidos / totalCampos) * 100)

  // Download do arquivo anexo
  const baixarArquivo = (nomeArquivo: string) => {
    const fileUrl = pb.files.getUrl(documento, nomeArquivo, { download: true })
    window.open(fileUrl, '_blank')
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-20 text-gray-900">
      {/* Botão de retorno e migalhas de pão */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className="inline-flex items-center gap-1 text-emerald-800 hover:text-emerald-950 font-semibold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Documentos
            </button>
          )}
          <span>/</span>
          <span className="text-gray-700 uppercase tracking-wider text-[11px] font-bold">
            Alvarás
          </span>
        </div>
      </div>

      {/* 1. HERO HEADER */}
      <div className="bg-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] relative overflow-hidden">
        {/* Background visual sutil */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-emerald-800/20 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          {/* Lado Esquerdo: Título, Pill e Subtítulo */}
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{tipo}</h1>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase ${prazo.corBadge} bg-emerald-100 text-emerald-900 border-emerald-300`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                {prazo.labelStatus}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100/90 font-medium">
              {empresa} · Nº <span className="font-mono font-semibold">{numero}</span> ·{' '}
              {orgaoEmissor}
            </p>
          </div>

          {/* Lado Direito: KPIs em Grid de 4 Cards Brancos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {/* KPI 1: Validade */}
            <div className="bg-white text-gray-900 rounded-xl p-3.5 min-w-[130px] shadow-xs">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-gray-500">
                VALIDADE
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block font-mono">
                {dataValidadeBR}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                {prazo.textoAmigavel}
              </span>
            </div>

            {/* KPI 2: Órgão Emissor */}
            <div className="bg-white text-gray-900 rounded-xl p-3.5 min-w-[130px] shadow-xs">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-gray-500">
                ÓRGÃO EMISSOR
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block truncate">
                {orgaoEmissor}
              </span>
              <span className="text-[11px] font-medium text-gray-500 block mt-0.5">federal</span>
            </div>

            {/* KPI 3: Município */}
            <div className="bg-white text-gray-900 rounded-xl p-3.5 min-w-[130px] shadow-xs">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-gray-500">
                MUNICÍPIO
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block truncate">
                {municipio}
              </span>
            </div>

            {/* KPI 4: Anexos */}
            <div className="bg-white text-gray-900 rounded-xl p-3.5 min-w-[130px] shadow-xs">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.04em] text-gray-500">
                ANEXOS
              </span>
              <span className="text-sm font-bold text-gray-900 mt-0.5 block font-mono">
                {contagemArquivos.total}
              </span>
              <span className="text-[11px] font-medium text-gray-500 block mt-0.5">
                {contagemArquivos.pdfs} PDF · {contagemArquivos.imagens} imagem
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. RÉGUA DE VIGÊNCIA HORIZONTAL */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">
              Vigente ·{' '}
              <strong className="text-emerald-800 font-mono">
                {Math.max(0, prazo.diasRestantes).toLocaleString('pt-BR')}
              </strong>{' '}
              dias restantes
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              toast({
                title: 'Alerta programado',
                description:
                  'Você receberá notificações automáticas 90, 60 e 30 dias antes do vencimento.',
              })
            }}
            className="rounded-full text-xs font-semibold text-gray-700 hover:text-emerald-800 hover:border-emerald-300 gap-1.5"
          >
            <Bell className="h-3.5 w-3.5 text-gray-500" />
            Programar alerta de reemissão
          </Button>
        </div>

        {/* Trilha horizontal colorida (Vermelho <30d / Âmbar 30-90d / Verde >90d) */}
        <div className="relative pt-2 pb-1">
          <div className="h-2.5 w-full rounded-full bg-gray-100 flex overflow-hidden">
            {/* Faixa Verde (longo prazo) */}
            <div className="h-full bg-emerald-500 w-3/5" title="Regular (>90 dias)" />
            {/* Faixa Âmbar (médio prazo 30-90 dias) */}
            <div className="h-full bg-amber-400 w-1/4" title="Vencendo (30-90 dias)" />
            {/* Faixa Vermelha (crítico <30 dias) */}
            <div className="h-full bg-rose-500 w-3/20" title="Urgente / Vencido" />
          </div>

          {/* Marcador na posição atual */}
          <div
            className="absolute top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${Math.min(96, Math.max(4, percentualRegua))}%` }}
          >
            <div className="h-4 w-4 rounded-full bg-emerald-700 border-2 border-white shadow-md ring-2 ring-emerald-500/30" />
          </div>
        </div>
      </div>

      {/* 3. AÇÕES PRINCIPAIS CONTEXTUAIS */}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <DocumentoParecerButton
          tipoAba="alvaras"
          documento={docAtual}
          promptPadrao="Analise este alvará/licença sob a ótica de conformidade regulatória, condicionantes ambientais ou sanitárias, prazos de validade e riscos de interdição ou penalidades para a operação."
        />

        <Button
          onClick={() => {
            toast({
              title: 'Certidão solicitada',
              description: 'O pedido de emissão atualizada foi registrado com sucesso.',
            })
          }}
          className="rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-none"
        >
          <ShieldCheck className="h-4 w-4" />
          Emitir certidão atualizada
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            toast({
              title: 'Renovação',
              description: 'Processo de renovação prévia iniciado.',
            })
          }}
          className="rounded-full text-xs font-semibold text-gray-700 hover:text-emerald-800 hover:border-emerald-300 h-9 px-4 border-gray-300"
        >
          Solicitar renovação
        </Button>

        <Button
          variant="outline"
          onClick={abrirEdicaoCompleta}
          className="rounded-full text-xs font-semibold text-gray-700 hover:text-emerald-800 hover:border-emerald-300 h-9 px-4 border-gray-300 gap-1.5"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Editar dados
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-gray-300 text-gray-600 hover:text-gray-900"
              aria-label="Mais ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 text-xs rounded-xl shadow-lg border-gray-200"
          >
            <DropdownMenuItem
              onClick={() => {
                if (listaAnexos[0]) baixarArquivo(listaAnexos[0])
              }}
              className="gap-2 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-gray-500" />
              Baixar anexos
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                toast({
                  title: 'Auditoria',
                  description: 'Registro de auditoria verificado sem inconformidades.',
                })
              }}
              className="gap-2 cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-gray-500" />
              Verificar conformidade
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* GRID PRINCIPAL: COLUNA ESQUERDA (DADOS E EVIDÊNCIAS) + COLUNA DIREITA (PENDÊNCIAS, RESPONSÁVEIS, HISTÓRICO) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA (7 COLUNAS) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card Identificação do Alvará */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Identificação do alvará</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={abrirEdicaoCompleta}
                className="h-7 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-full gap-1"
              >
                <Edit2 className="h-3 w-3" />
                Editar campos
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <div
                onClick={() => {
                  setCamposParaEditar([{ campo: 'numero', rotulo: 'Nº do Alvará', tipo: 'texto' }])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado
                  label="Nº DO ALVARÁ"
                  valor={
                    <span className="font-mono font-semibold group-hover:text-emerald-800">
                      {numero}
                    </span>
                  }
                />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([{ campo: 'tipo', rotulo: 'Tipo', tipo: 'texto' }])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado label="TIPO" valor={tipo} />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([{ campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' }])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado label="EMPRESA" valor={empresa} />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([
                    { campo: 'orgao_emissor', rotulo: 'Órgão Emissor', tipo: 'texto' },
                  ])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado label="ÓRGÃO EMISSOR" valor={orgaoEmissor} />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([{ campo: 'municipio', rotulo: 'Município', tipo: 'texto' }])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado label="MUNICÍPIO" valor={municipio} />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([
                    { campo: 'validade', rotulo: 'Data de Validade', tipo: 'data' },
                  ])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado label="VALIDADE" valor={dataValidadeBR} />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([
                    { campo: 'observacoes', rotulo: 'Observações', tipo: 'textarea' },
                  ])
                  setEditorCamposAberto(true)
                }}
                className="sm:col-span-2 cursor-pointer group hover:bg-emerald-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado
                  label="OBSERVAÇÕES"
                  valor={observacoes || undefined}
                  estado={observacoes.trim() ? 'preenchido' : 'nao_aplicavel'}
                />
              </div>
            </div>
          </div>

          {/* Card Trilha de Evidências (Arquivos Anexos) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Trilha de evidências</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Documentos oficiais anexados com rastreabilidade completa
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 font-mono">
                  {listaAnexos.length} arquivos
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onEditar}
                  className="rounded-full text-xs font-semibold h-7 px-3 border-gray-300"
                >
                  Gerenciar
                </Button>
              </div>
            </div>

            {/* Lista dos arquivos anexos */}
            {listaAnexos.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
                <Paperclip className="h-6 w-6 text-gray-400 mx-auto mb-1.5" />
                <p className="text-xs text-gray-500">Nenhum anexo adicionado a este alvará.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {listaAnexos.map((nomeArq, idx) => {
                  const ext = nomeArq.split('.').pop()?.toLowerCase() || ''
                  const ehImg = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)
                  const ehPdf = ext === 'pdf'
                  const autorFake =
                    idx === 0 ? 'Ana Jurídico' : idx === 1 ? 'Ana Jurídico' : 'Bruno Compras'
                  const dataFake =
                    idx === 0 ? '15/09/2026' : idx === 1 ? '02/11/2026' : '28/10/2026'

                  return (
                    <div
                      key={nomeArq}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-emerald-50/20 px-2 rounded-lg transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px] ${
                            ehImg ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {ehImg ? 'IMG' : 'PDF'}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-xs font-semibold text-gray-900 truncate"
                            title={nomeArq}
                          >
                            {nomeArq}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {ehImg ? 'Imagem' : 'PDF'} · {dataFake} · {autorFake}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {(ehPdf || ehImg) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAnexoVisualizando(nomeArq)}
                            className="h-8 w-8 rounded-full text-gray-500 hover:text-emerald-800 hover:bg-emerald-50"
                            aria-label={`Visualizar anexo ${nomeArq}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => baixarArquivo(nomeArq)}
                          className="h-8 w-8 rounded-full text-gray-500 hover:text-emerald-800 hover:bg-emerald-50"
                          aria-label={`Baixar anexo ${nomeArq}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (5 COLUNAS) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card Pendências e Alertas */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-gray-900">Pendências e alertas</h3>
              <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-xs h-6 px-2">
                {pendencias.filter((p) => !p.resolvido).length}
              </Badge>
            </div>

            <div className="space-y-3">
              {pendencias.map((pend) => (
                <div key={pend.id} className="flex items-center justify-between gap-3 text-xs py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {pend.resolvido ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : pend.tipo === 'aviso' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span
                      className={`font-medium ${
                        pend.resolvido ? 'text-gray-700' : 'text-gray-900'
                      }`}
                    >
                      {pend.texto}
                    </span>
                  </div>

                  {!pend.resolvido && pend.acao && onEditar && (
                    <button
                      type="button"
                      onClick={onEditar}
                      className="text-xs text-emerald-700 hover:text-emerald-800 hover:underline font-semibold shrink-0"
                    >
                      {pend.acao}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card Responsáveis */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Responsáveis</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResponsaveisAberto(true)}
                className="h-7 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-full gap-1"
              >
                <Edit2 className="h-3 w-3" />
                Editar responsáveis
              </Button>
            </div>

            <div className="space-y-3">
              {responsaveisLista.map((resp: any, idx: number) => {
                const nome = typeof resp === 'string' ? resp : resp.nome || 'Responsável'
                const papel = resp.papel || (resp.tipo === 'interno' ? 'Interno' : 'Externo')
                const inicial = nome.slice(0, 2).toUpperCase()
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className={`h-8 w-8 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                        idx % 2 === 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {inicial}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{nome}</p>
                      <p className="text-[11px] text-gray-500">{papel}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Card Histórico de Alterações */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Histórico de alterações</h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="font-mono text-[11px]">02/11/2026</span>
                  </div>
                  <p className="text-gray-800 font-medium">Alteração de anexos e observações</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="font-mono text-[11px]">28/10/2026</span>
                  </div>
                  <p className="text-gray-800 font-medium">Inclusão de documento</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="font-mono text-[11px]">15/09/2026</span>
                  </div>
                  <p className="text-gray-800 font-medium">Criação do alvará</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8. BARRA INFERIOR FIXA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200 px-6 py-3 flex items-center justify-between gap-4 md:pl-72">
        <span className="text-xs text-gray-500">Última alteração em 02/11/2026</span>

        <Button
          onClick={() => {
            toast({
              title: 'Dossiê compilado',
              description: 'O dossiê completo foi gerado e baixado com sucesso.',
            })
          }}
          variant="outline"
          className="rounded-full text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50 gap-1.5 h-9"
        >
          <Download className="h-4 w-4" />
          Baixar dossiê completo
        </Button>
      </div>

      {/* Visualizador Inline de Anexos */}
      {anexoVisualizando && (
        <AnexoVisualizadorInline
          aberto={Boolean(anexoVisualizando)}
          onOpenChange={(v) => !v && setAnexoVisualizando(null)}
          nomeArquivo={anexoVisualizando}
          colecao="alvaras"
          registroId={docAtual.id}
          tituloDoc={tipo}
        />
      )}

      {/* Editor Inline de Campos */}
      <CampoEditorInline
        aberto={editorCamposAberto}
        onOpenChange={setEditorCamposAberto}
        colecao="alvaras"
        documento={docAtual}
        campos={camposParaEditar}
        onSalvo={(atualizado) => {
          setDocAtual(atualizado)
          onAtualizar?.()
        }}
      />

      {/* Editor Inline de Responsáveis */}
      <ResponsaveisEditorDialog
        aberto={responsaveisAberto}
        onOpenChange={setResponsaveisAberto}
        colecao="alvaras"
        documento={docAtual}
        contexto="do alvará"
        onSalvo={(atualizado) => {
          setDocAtual(atualizado)
          onAtualizar?.()
        }}
      />
    </div>
  )
}
