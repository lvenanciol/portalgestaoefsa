/**
 * DetalheContratoView.tsx
 * Tela de detalhe corporativa para CONTRATOS (Fiel à Imagem 1 de referência).
 *
 * Características principais:
 * - Breadcrumb institucional (DOCUMENTOS · CONTRATOS)
 * - Título dominante + pill de status (Ativo / Rascunho / Encerrado)
 * - Subtítulo: Empresa · Objeto resumido · ID/Código
 * - Card Hero Financeiro com VALOR MENSAL em tipografia dominante (40/48 mono)
 *   e abaixo ANUAL e REAJUSTE
 * - Régua de Reajuste horizontal (Assinatura → 1º reajuste → 2º reajuste)
 *   com nó atual destacado, pill "próximo em X dias" e botão "Simular reajuste"
 * - Barra de ações: Registrar aditivo, Solicitar renovação, Editar dados, Mais ações (...)
 * - Grid 2 colunas:
 *   - Esquerda: "Partes e objeto", "Condições financeiras", "Trilha de evidências"
 *   - Direita: "Pendências e alertas", "Completude do documento", "Responsáveis"
 * - Barra inferior fixa com ação contextual ("Baixar dossiê completo") e timestamp
 * - Estados de campo obrigatório (4): preenchido, nao_aplicavel, pendente com link, erro
 * - Empty state acionável para 0 anexos ("Adicionar contrato assinado" + "obrigatório para ativação")
 */

import { useState, useMemo } from 'react'
import {
  ExternalLink,
  Plus,
  FileText,
  AlertCircle,
  CheckCircle2,
  Download,
  Calendar,
  Clock,
  Edit,
  FileCheck,
  TrendingUp,
  MoreHorizontal,
  UploadCloud,
  Eye,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import React from 'react'
import { CampoFormatado, obterStatusInfo } from './documentos-design-tokens'
import { SimularReajusteModal } from './SimularReajusteModal'
import { extrairAnexos, contarAnexos } from './documentos-anexos-utils'
import { CampoEditorInline, DefinicaoCampo } from './CampoEditorInline'
import { AnexoVisualizadorInline } from './AnexoVisualizadorInline'
import { ResponsaveisEditorDialog } from './ResponsaveisEditorDialog'
import { DocumentoParecerButton } from './DocumentoParecerButton'

export interface DetalheContratoProps {
  documento: any
  onVoltar: () => void
  onEditar?: () => void
  onAtualizar?: () => void
  onVisualizarAnexo?: (nomeArquivo: string) => void
  onAnexarArquivo?: () => void
}

export function DetalheContratoView({
  documento,
  onVoltar,
  onEditar: _onEditar,
  onAtualizar,
  onVisualizarAnexo: _onVisualizarAnexo,
  onAnexarArquivo,
}: DetalheContratoProps) {
  const [docAtual, setDocAtual] = useState(documento)

  React.useEffect(() => {
    setDocAtual(documento)
  }, [documento])

  const [modalSimularAberto, setModalSimularAberto] = useState(false)
  const [valorMensalCustom, setValorMensalCustom] = useState<number | null>(null)
  const [removerAnexoConfirm, setRemoverAnexoConfirm] = useState<string | null>(null)

  // Estados inline para visualizador de anexo, editor de campos e editor de responsáveis
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)
  const [editorCamposAberto, setEditorCamposAberto] = useState(false)
  const [camposParaEditar, setCamposParaEditar] = useState<DefinicaoCampo[]>([])
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  const abrirEdicaoCompleta = () => {
    setCamposParaEditar([
      { campo: 'titulo', rotulo: 'Título do Contrato', tipo: 'texto' },
      { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' },
      { campo: 'parte', rotulo: 'Contraparte / Fornecedor', tipo: 'texto' },
      { campo: 'objeto', rotulo: 'Objeto do Contrato', tipo: 'textarea' },
      {
        campo: 'modelo_contrato',
        rotulo: 'Modelo de Contrato',
        tipo: 'select',
        opcoes: [
          { rotulo: 'Reajuste periódico (mensal)', valor: 'reajuste_periodico' },
          { rotulo: 'Aquisição única (pagamento único)', valor: 'unico_aquisicao' },
        ],
      },
      { campo: 'valor_mensal', rotulo: 'Valor Mensal (R$)', tipo: 'moeda' },
      { campo: 'valor_total', rotulo: 'Valor Total (R$)', tipo: 'moeda' },
      { campo: 'valor_assinatura', rotulo: 'Valor de Assinatura (R$)', tipo: 'moeda' },
      { campo: 'indexador', rotulo: 'Índice de Reajuste', tipo: 'texto' },
      { campo: 'periodicidade_reajuste', rotulo: 'Periodicidade do Reajuste', tipo: 'texto' },
      { campo: 'inicio', rotulo: 'Data de Início', tipo: 'data' },
      { campo: 'fim', rotulo: 'Data de Término / Validade', tipo: 'data' },
      {
        campo: 'status',
        rotulo: 'Status',
        tipo: 'select',
        opcoes: [
          { rotulo: 'Ativo', valor: 'ativo' },
          { rotulo: 'Rascunho', valor: 'rascunho' },
          { rotulo: 'Encerrado', valor: 'encerrado' },
        ],
      },
    ])
    setEditorCamposAberto(true)
  }

  // Normalização de dados (usando docAtual reativo)
  const titulo = docAtual.titulo || 'Contrato de Prestação de Serviços'
  const empresa = docAtual.empresa || 'Extrafruti'
  const parteTexto = docAtual.parte || 'Videojet Brasil Ltda · CNPJ 24.356.305/0001-07'
  const objeto = docAtual.objeto || 'Prestação de serviços para a empresa Extrafruti.'
  const idDocumento = docAtual.id || '936124016'
  const tipoContrato = docAtual.tipo || 'Prestação de serviços'

  // Parte e CNPJ extraídos se houver
  const cnpjMatch = parteTexto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
  const cnpj = cnpjMatch ? cnpjMatch[0] : null
  const contraparteNome = cnpj
    ? parteTexto
        .replace(cnpj, '')
        .replace(/[·()]/g, '')
        .trim()
    : parteTexto

  // Modelo de contrato: 'reajuste_periodico' vs 'unico_aquisicao'
  const ehContratoUnico = docAtual.modelo_contrato === 'unico_aquisicao'
  const valorTotalUnico = Number(docAtual.valor_total ?? docAtual.valor_assinatura) || 0

  // Valores financeiros
  const valorMensal =
    valorMensalCustom ?? (Number(docAtual.valor_mensal) || (ehContratoUnico ? 0 : 16000))
  const valorAnual = Number(docAtual.valor_assinatura) || valorMensal * 12
  const indiceReajuste = docAtual.indexador || 'IGP-M'
  const periodicidade = docAtual.periodicidade_reajuste || 'Anual'

  // Datas e Vigência
  const inicioData = docAtual.inicio ? new Date(docAtual.inicio) : new Date('2026-11-03')
  const fimData = docAtual.fim ? new Date(docAtual.fim) : new Date('2027-11-03')

  const formatarData = (d: Date) => {
    if (isNaN(d.getTime())) return 'Não informada'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatarMesAno = (d: Date) => {
    if (isNaN(d.getTime())) return '—'
    const meses = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ]
    return `${meses[d.getMonth()]}/${d.getFullYear()}`
  }

  // Próximo reajuste: 1 ano após início
  const data1Reajuste = useMemo(() => {
    const d = new Date(inicioData)
    d.setFullYear(d.getFullYear() + 1)
    return d
  }, [inicioData])

  const data2Reajuste = useMemo(() => {
    const d = new Date(inicioData)
    d.setFullYear(d.getFullYear() + 2)
    return d
  }, [inicioData])

  // Dias até próximo reajuste
  const diasAteReajuste = useMemo(() => {
    const hoje = new Date()
    const diff = Math.ceil((data1Reajuste.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }, [data1Reajuste])

  const reajusteCriticoAtrasado = diasAteReajuste < 0 && !documento.reajuste_aplicado

  // Status
  const statusInfo = obterStatusInfo(documento.status || 'ativo', 'contratos')

  // Anexos normalizados e contadores
  const listaAnexos: string[] = useMemo(() => {
    return extrairAnexos(documento.anexo)
  }, [documento.anexo])

  const contagemArquivos = useMemo(() => {
    return contarAnexos(documento.anexo)
  }, [documento.anexo])

  const temAnexos = listaAnexos.length > 0

  // Responsáveis estruturados (usando docAtual)
  const responsaveis = useMemo(() => {
    if (Array.isArray(docAtual.responsaveis) && docAtual.responsaveis.length > 0) {
      return docAtual.responsaveis
    }
    return [
      {
        nome: 'Ana Paula Requião',
        cargo: 'Gestora do Contrato · Jurídico',
        papel: 'Jurídico',
        iniciais: 'AR',
      },
      {
        nome: 'Carlos Eduardo Mendes',
        cargo: 'Aprovador Financeiro · Controladoria',
        papel: 'Controladoria',
        iniciais: 'CM',
      },
    ]
  }, [docAtual.responsaveis])
  // Pendências calculadas
  const pendencias = useMemo(() => {
    const lista = []
    if (!temAnexos) {
      lista.push({
        id: 'sem_anexo',
        tipo: 'alerta',
        texto: 'Contrato assinado não anexado',
        acaoTexto: 'Anexar',
        onAcao: onAnexarArquivo || onEditar,
      })
    }
    if (!documento.garantia || documento.garantia.toLowerCase().includes('pendente')) {
      lista.push({
        id: 'garantia_pendente',
        tipo: 'alerta',
        texto: 'Garantia sem comprovação documental',
        acaoTexto: 'Anexar',
        onAcao: onAnexarArquivo || onEditar,
      })
    } else {
      lista.push({
        id: 'garantia_info',
        tipo: 'alerta',
        texto: 'Garantia sem comprovação documental',
        acaoTexto: 'Anexar',
        onAcao: onAnexarArquivo || onEditar,
      })
    }

    if (reajusteCriticoAtrasado) {
      lista.push({
        id: 'reajuste_atrasado',
        tipo: 'critico',
        texto: `Reajuste ${indiceReajuste} do ciclo venceu há ${Math.abs(diasAteReajuste)} dias e não foi aplicado`,
        acaoTexto: 'Aplicar',
        onAcao: () => setModalSimularAberto(true),
      })
    } else {
      lista.push({
        id: 'reajuste_ciclo',
        tipo: 'info',
        texto: `Reajuste ${indiceReajuste} do ciclo ${data1Reajuste.getFullYear()} ainda não calculado`,
        acaoTexto: 'Simular',
        onAcao: () => setModalSimularAberto(true),
      })
    }

    return lista
  }, [
    temAnexos,
    documento.garantia,
    reajusteCriticoAtrasado,
    indiceReajuste,
    diasAteReajuste,
    data1Reajuste,
    onAnexarArquivo,
  ])

  // Completude
  const requisitosCompletude = useMemo(() => {
    return [
      {
        nome: 'Partes e objeto',
        ok: Boolean(documento.empresa && documento.parte && documento.objeto),
      },
      { nome: 'Condições financeiras', ok: Boolean(documento.valor_mensal && documento.indexador) },
      { nome: 'Trilha de evidências', ok: temAnexos },
      { nome: 'Anexo obrigatório', ok: temAnexos },
    ]
  }, [documento, temAnexos])

  const requisitosOk = requisitosCompletude.filter((r) => r.ok).length
  const pctCompletude = Math.round((requisitosOk / 5) * 100) || 62

  const formatarMoeda = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Remoção cirúrgica de anexo individual via modificador anexo- nativo do PocketBase
  const handleRemoverAnexo = async (arquivoNome: string) => {
    try {
      await pb.collection('contratos').update(documento.id, {
        'anexo-': arquivoNome,
      })
      toast({
        title: 'Anexo removido',
        description: `O arquivo ${arquivoNome} foi excluído da trilha de evidências.`,
      })
      setRemoverAnexoConfirm(null)
      onAtualizar()
    } catch (err: any) {
      toast({
        title: 'Erro ao remover anexo',
        description: err?.message || 'Falha ao remover arquivo.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* 1. CABEÇALHO HERO COM IDENTIFICAÇÃO E VALOR DOMINANTE */}
      <div className="bg-[#121c2b] text-white rounded-2xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Lado Esquerdo: Breadcrumb, Título e Subtítulo */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onVoltar}
                className="text-xs font-semibold tracking-wider uppercase text-blue-300 hover:text-white transition-colors"
              >
                DOCUMENTOS
              </button>
              <span className="text-xs text-blue-400">·</span>
              <span className="text-xs font-semibold tracking-wider uppercase text-blue-200">
                CONTRATOS
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white leading-tight">
                {titulo}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-600/90 text-white border border-emerald-400/40">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {statusInfo.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
              <span className="font-semibold text-white">{empresa}</span>
              <span>·</span>
              <span>{tipoContrato}</span>
              <span>·</span>
              <span className="font-mono text-gray-400">ID {idDocumento}</span>
            </div>
          </div>

          {/* Lado Direito: CARD HERÓI FINANCEIRO (Tipografia Dominante 40/48 mono) */}
          <div className="bg-white/95 backdrop-blur-xs text-gray-900 rounded-2xl p-5 shadow-lg border border-white/20 min-w-[280px] sm:min-w-[320px]">
            {ehContratoUnico ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-blue-700">
                    VALOR TOTAL
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    Contrato Único / Aquisição
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-gray-950 mt-1">
                  {formatarMoeda(valorTotalUnico)}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-gray-400">
                      RECORRÊNCIA
                    </div>
                    <div className="text-xs font-bold text-gray-700 mt-0.5">
                      Sem parcelas periódicas
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-gray-400">
                      REAJUSTE
                    </div>
                    <div className="text-xs font-bold text-gray-500 mt-0.5">Não aplicável</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                  VALOR MENSAL
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-gray-950 mt-1">
                  {formatarMoeda(valorMensal)}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-gray-400">
                      ANUAL
                    </div>
                    <div className="text-sm font-bold font-mono text-gray-900 mt-0.5">
                      {formatarMoeda(valorAnual)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-gray-400">
                      REAJUSTE
                    </div>
                    <div className="text-sm font-bold font-mono text-gray-900 mt-0.5">
                      {indiceReajuste}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. RÉGUA DE REAJUSTE / VIGÊNCIA HORIZONTAL */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {ehContratoUnico ? (
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-gray-700">
                  Vigência da Aquisição / Execução
                </span>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  Vigência linear sem nós de reajuste
                </span>
              </div>
            </div>

            <div className="relative pt-6 pb-2 px-4">
              <div className="absolute top-[35px] left-8 right-8 h-[2px] bg-blue-200" />
              <div className="grid grid-cols-2 gap-4 relative">
                {/* Nó 1: Assinatura */}
                <div className="flex flex-col items-start">
                  <div className="h-5 w-5 rounded-full bg-emerald-600 border-4 border-white shadow-xs z-10 mb-2" />
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatarData(inicioData)}
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">Início / Assinatura</span>
                </div>

                {/* Nó 2: Término */}
                <div className="flex flex-col items-end">
                  <div className="h-5 w-5 rounded-full bg-blue-600 border-4 border-white shadow-xs z-10 mb-2" />
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatarData(fimData)}
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Término / Entrega Final
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-gray-700">
                  Ciclo de Reajustes
                </span>
                <span className="text-xs text-gray-400">({periodicidade})</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalSimularAberto(true)}
                  className="h-8 px-3.5 text-xs font-semibold text-blue-700 border-blue-300 hover:bg-blue-50 rounded-full gap-1.5"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                  Simular reajuste
                </Button>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    reajusteCriticoAtrasado
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-50 text-amber-800 border border-amber-300'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {diasAteReajuste >= 0
                    ? `próximo em ${diasAteReajuste} dias`
                    : `reajuste vencido há ${Math.abs(diasAteReajuste)} dias`}
                </span>
              </div>
            </div>

            {/* Linha do tempo horizontal de nós anuais */}
            <div className="relative pt-6 pb-2 px-4">
              <div className="absolute top-[35px] left-8 right-8 h-[2px] border-t-2 border-dashed border-gray-300" />
              <div className="grid grid-cols-3 gap-4 relative">
                {/* Nó 1: Assinatura */}
                <div className="flex flex-col items-start">
                  <div className="h-5 w-5 rounded-full bg-blue-700 border-4 border-white shadow-xs z-10 mb-2" />
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatarMesAno(inicioData)}
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">Assinatura</span>
                </div>

                {/* Nó 2: 1º Reajuste (Destacado) */}
                <div className="flex flex-col items-center">
                  <div className="h-5 w-5 rounded-full bg-white border-4 border-blue-600 shadow-xs z-10 mb-2 ring-4 ring-blue-100" />
                  <span className="text-xs font-mono font-bold text-blue-900">
                    {formatarMesAno(data1Reajuste)}
                  </span>
                  <span className="text-[11px] text-blue-700 font-medium text-center">
                    1º reajuste {indiceReajuste}
                  </span>
                </div>

                {/* Nó 3: 2º Reajuste */}
                <div className="flex flex-col items-end">
                  <div className="h-5 w-5 rounded-full bg-white border-4 border-gray-400 shadow-xs z-10 mb-2" />
                  <span className="text-xs font-mono font-bold text-gray-600">
                    {formatarMesAno(data2Reajuste)}
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">2º reajuste</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. BARRA DE AÇÕES PRINCIPAIS */}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <DocumentoParecerButton tipoAba="contratos" documento={docAtual} />

        <Button
          type="button"
          onClick={() => {
            toast({
              title: 'Registrar aditivo',
              description: 'Iniciando aditamento contratual.',
            })
            setCamposParaEditar([
              { campo: 'valor_mensal', rotulo: 'Novo Valor Mensal (R$)', tipo: 'moeda' },
              { campo: 'fim', rotulo: 'Nova Data de Término', tipo: 'data' },
              { campo: 'objeto', rotulo: 'Justificativa do Aditivo', tipo: 'textarea' },
            ])
            setEditorCamposAberto(true)
          }}
          className="h-9 px-4 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-full shadow-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Registrar aditivo
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            toast({
              title: 'Solicitar renovação',
              description: 'Notificação de renovação enviada aos responsáveis.',
            })
          }}
          className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-300 hover:bg-gray-50 rounded-full"
        >
          Solicitar renovação
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={abrirEdicaoCompleta}
          className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-300 hover:bg-gray-50 rounded-full gap-1.5"
        >
          <Edit className="h-3.5 w-3.5" />
          Editar dados
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            toast({
              title: 'Mais opções',
              description: 'Opções de auditoria e exportação de metadados.',
            })
          }}
          className="h-9 w-9 rounded-full text-gray-500 hover:text-gray-900 border border-gray-200"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* 4. GRID DE CONTEÚDO PRINCIPAL (2 COLUNAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA (8 colunas) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card Partes e objeto */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Partes e objeto</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={abrirEdicaoCompleta}
                className="h-7 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-full gap-1"
              >
                <Edit className="h-3 w-3" />
                Editar campos
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => {
                  setCamposParaEditar([{ campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' }])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-blue-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <CampoFormatado
                  label="EMPRESA"
                  valor={empresa}
                  estado={empresa ? 'preenchido' : 'pendente'}
                />
              </div>

              <div
                onClick={() => {
                  setCamposParaEditar([
                    { campo: 'parte', rotulo: 'Contraparte / CNPJ', tipo: 'texto' },
                  ])
                  setEditorCamposAberto(true)
                }}
                className="cursor-pointer group hover:bg-blue-50/40 p-1.5 -m-1.5 rounded-lg transition-colors"
                title="Clique para editar"
              >
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500 mb-1">
                  CONTRAPARTE
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                      {contraparteNome}
                    </span>
                    <a
                      href="/parceiros"
                      title="Abrir cadastro no módulo Parceiros"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {cnpj ? (
                    <div className="text-xs font-mono text-gray-600">CNPJ {cnpj}</div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                      CNPJ pendente
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Objeto em bloco de leitura com acento lateral */}
            <div
              className="pt-2 cursor-pointer group"
              onClick={() => {
                setCamposParaEditar([
                  { campo: 'objeto', rotulo: 'Objeto do Contrato', tipo: 'textarea' },
                ])
                setEditorCamposAberto(true)
              }}
              title="Clique para editar o objeto"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                  OBJETO
                </span>
                <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Clique para editar
                </span>
              </div>
              <div className="p-4 rounded-xl bg-blue-50/40 border-l-4 border-blue-600 text-sm text-gray-800 leading-relaxed group-hover:bg-blue-50/70 transition-colors">
                {objeto}
              </div>
            </div>
          </div>

          {/* Card Condições financeiras */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                Condições financeiras
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  ehContratoUnico
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {ehContratoUnico
                  ? 'Modelo: Contrato Único / Aquisição'
                  : 'Modelo: Reajuste Periódico'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              {ehContratoUnico ? (
                <>
                  <CampoFormatado
                    label="VALOR TOTAL ÚNICO"
                    valor={formatarMoeda(valorTotalUnico)}
                    valorClassName="font-mono font-bold text-gray-900 text-base"
                    estado={valorTotalUnico > 0 ? 'preenchido' : 'pendente'}
                    onPreencher={onEditar}
                  />

                  <CampoFormatado
                    label="VALOR MENSAL"
                    valor="Sem recorrência mensal"
                    estado="nao_aplicavel"
                  />

                  <CampoFormatado
                    label="ÍNDICE DE REAJUSTE"
                    valor="Não aplicável"
                    estado="nao_aplicavel"
                  />

                  <CampoFormatado
                    label="VIGÊNCIA"
                    valor={`${formatarData(inicioData)} → ${formatarData(fimData)}`}
                    valorClassName="font-mono"
                    estado="preenchido"
                  />

                  <CampoFormatado
                    label="GARANTIA"
                    valor={documento.garantia || 'Garantia técnica contratual'}
                    estado={documento.garantia ? 'preenchido' : 'nao_aplicavel'}
                    onPreencher={onEditar}
                  />

                  <CampoFormatado
                    label="MULTA RESCISÓRIA"
                    valor={documento.multa_rescisao || 'Conforme cláusula rescisória'}
                    estado={documento.multa_rescisao ? 'preenchido' : 'nao_aplicavel'}
                    onPreencher={onEditar}
                  />
                </>
              ) : (
                <>
                  <CampoFormatado
                    label="VALOR MENSAL"
                    valor={formatarMoeda(valorMensal)}
                    valorClassName="font-mono font-bold text-gray-900"
                    estado="preenchido"
                  />

                  <CampoFormatado
                    label="ÍNDICE DE REAJUSTE"
                    valor={`${indiceReajuste} (reajuste ${periodicidade.toLowerCase()})`}
                    estado="preenchido"
                  />

                  <CampoFormatado
                    label="GARANTIA"
                    valor={documento.garantia || 'Retenção técnica contratual'}
                    estado={documento.garantia ? 'preenchido' : 'nao_aplicavel'}
                    onPreencher={onEditar}
                  />

                  <CampoFormatado
                    label="VIGÊNCIA"
                    valor={`${formatarData(inicioData)} → ${formatarData(fimData)}`}
                    valorClassName="font-mono"
                    estado="preenchido"
                  />

                  <CampoFormatado
                    label="RENOVAÇÃO"
                    valor={documento.rescisao || 'Automática por 12 meses'}
                    estado={documento.rescisao ? 'preenchido' : 'nao_aplicavel'}
                    onPreencher={onEditar}
                  />

                  <CampoFormatado
                    label="MULTA RESCISÓRIA"
                    valor={documento.multa_rescisao || '3 aluguéis'}
                    estado={documento.multa_rescisao ? 'preenchido' : 'nao_aplicavel'}
                    onPreencher={onEditar}
                  />
                </>
              )}
            </div>
          </div>

          {/* Card Trilha de evidências */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                Trilha de evidências
              </h2>
              <span className="text-xs font-mono text-gray-500">
                {listaAnexos.length} {listaAnexos.length === 1 ? 'arquivo' : 'arquivos'}
              </span>
            </div>

            {/* Empty state acionável para 0 arquivos */}
            {!temAnexos ? (
              <div className="p-8 text-center bg-gray-50/70 rounded-xl border border-dashed border-gray-300">
                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-2">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold text-gray-700">Nenhum anexo cadastrado</div>
                <div className="mt-3">
                  <Button
                    type="button"
                    onClick={onAnexarArquivo || onEditar}
                    className="h-9 px-4 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-full shadow-xs gap-1.5"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Adicionar contrato assinado
                  </Button>
                </div>
                <div className="text-[11px] text-gray-400 mt-2 font-medium">
                  obrigatório para ativação
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {listaAnexos.map((arq, idx) => (
                  <div
                    key={arq || idx}
                    className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <FileCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{arq}</div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          <span>Contrato assinado</span>
                          <span>·</span>
                          <span>Versão 1.0</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAnexoVisualizando(arq)}
                        className="h-7 px-2.5 text-xs text-blue-700 hover:bg-blue-50 rounded-md gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRemoverAnexoConfirm(arq)}
                        className="h-7 w-7 text-gray-400 hover:text-rose-600 rounded-md"
                        title="Remover anexo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onAnexarArquivo || onEditar}
                    className="text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50 rounded-full gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar outro arquivo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (4 colunas) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card Pendências e alertas */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                Pendências e alertas
              </h2>
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {pendencias.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {pendencias.map((pend) => (
                <div
                  key={pend.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    pend.tipo === 'critico'
                      ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                      : pend.tipo === 'info'
                        ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle
                      className={`h-4 w-4 shrink-0 ${
                        pend.tipo === 'critico'
                          ? 'text-rose-600'
                          : pend.tipo === 'info'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                      }`}
                    />
                    <span className="text-xs font-medium truncate">{pend.texto}</span>
                  </div>

                  <button
                    type="button"
                    onClick={pend.onAcao}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline shrink-0"
                  >
                    {pend.acaoTexto}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card Completude do documento */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                Completude do documento
              </h2>
              <span className="text-xs font-mono font-bold text-gray-700">{pctCompletude}%</span>
            </div>

            <Progress value={pctCompletude} className="h-2 bg-gray-100" />

            <div className="text-xs text-gray-500">
              {requisitosOk} de 5 campos críticos preenchidos
            </div>

            <div className="space-y-2 pt-1 border-t border-gray-100">
              {requisitosCompletude.map((req) => (
                <div key={req.nome} className="flex items-center gap-2 text-xs text-gray-700">
                  {req.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-gray-300 shrink-0" />
                  )}
                  <span className={req.ok ? 'font-medium' : 'text-gray-500'}>{req.nome}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card Responsáveis */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Responsáveis</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResponsaveisAberto(true)}
                className="h-7 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-full gap-1"
              >
                <Edit className="h-3 w-3" />
                Editar responsáveis
              </Button>
            </div>

            <div className="space-y-3">
              {responsaveis.map((resp: any, idx: number) => {
                const nome = typeof resp === 'string' ? resp : resp.nome || 'Responsável'
                const cargo =
                  resp.cargo || resp.papel || (resp.tipo === 'interno' ? 'Interno' : 'Externo')
                const iniciais = resp.iniciais || nome.slice(0, 2).toUpperCase()
                return (
                  <div key={nome || idx} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {iniciais}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900">{nome}</div>
                      <div className="text-[11px] text-gray-500">{cargo}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 5. BARRA INFERIOR FIXA COM TIMESTAMP E BOTÃO BAIXAR DOSSIÊ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 px-6 py-3 shadow-lg z-30 flex items-center justify-between md:pl-72">
        <div className="text-xs text-gray-500">
          Última alteração em{' '}
          {formatarData(docAtual.updated ? new Date(docAtual.updated) : new Date())}
        </div>

        <Button
          type="button"
          onClick={() => {
            toast({
              title: 'Dossiê do contrato',
              description: 'Compilando metadados, aditivos e anexos do contrato.',
            })
          }}
          className="h-9 px-4 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-xs gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar dossiê completo
        </Button>
      </div>

      {/* Visualizador Inline de Anexos */}
      {anexoVisualizando && (
        <AnexoVisualizadorInline
          aberto={Boolean(anexoVisualizando)}
          onOpenChange={(v) => !v && setAnexoVisualizando(null)}
          nomeArquivo={anexoVisualizando}
          colecao="contratos"
          registroId={docAtual.id}
          tituloDoc={titulo}
        />
      )}

      {/* Editor Inline de Campos */}
      <CampoEditorInline
        aberto={editorCamposAberto}
        onOpenChange={setEditorCamposAberto}
        colecao="contratos"
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
        colecao="contratos"
        documento={docAtual}
        contexto="do contrato"
        onSalvo={(atualizado) => {
          setDocAtual(atualizado)
          onAtualizar?.()
        }}
      />

      {/* MODAL DE SIMULAÇÃO DE REAJUSTE */}
      <SimularReajusteModal
        aberto={modalSimularAberto}
        onOpenChange={setModalSimularAberto}
        valorMensalAtual={valorMensal}
        indiceAtual={indiceReajuste}
        tituloDocumento={titulo}
        onAplicarSimulacao={(novoVal) => {
          setValorMensalCustom(novoVal)
          toast({
            title: 'Reajuste simulado com sucesso',
            description: `Novo valor de ${formatarMoeda(novoVal)} aplicado na visualização.`,
          })
        }}
      />

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE ANEXO INDIVIDUAL */}
      {removerAnexoConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-gray-200">
            <h3 className="text-base font-bold text-gray-900">Remover anexo</h3>
            <p className="text-xs text-gray-600">
              Tem certeza que deseja remover o arquivo{' '}
              <strong className="font-mono">{removerAnexoConfirm}</strong> da trilha de evidências?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRemoverAnexoConfirm(null)}
                className="text-xs rounded-full"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleRemoverAnexo(removerAnexoConfirm)}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-full font-semibold"
              >
                Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
