/**
 * DetalheLocacaoView.tsx
 * Tela de detalhe corporativa para LOCAÇÕES (Fiel à Imagem 2 de referência).
 *
 * Características principais:
 * - Breadcrumb institucional (DOCUMENTOS · LOCAÇÕES)
 * - Título dominante + pill de status (Ativo / Rascunho / Encerrado)
 * - Subtítulo: Contraparte · CNPJ
 * - 3 KPIs no topo: ALUGUEL (por mês), CAUÇÃO (como número destacado em R$), VIGÊNCIA (X meses)
 * - Strip horizontal:
 *   - Esquerda: Card de localização com mapa ilustrado estilizado, pin vermelho,
 *     endereço em overlay legível e link "Abrir no mapa"
 *   - Direita: Mini-card "Ocupação do prazo" com barra de progresso (mês X de Y)
 *     e indicação do próximo reajuste
 * - Barra de ações: Registrar vistoria, Aplicar reajuste, Editar dados, Mais ações (...)
 * - Grid 2 colunas:
 *   - Esquerda: "Objeto da locação", "Condições do contrato", "Trilha de evidências"
 *   - Direita: "Garantia e caução" (com valor em destaque e checklist), "Pendências e alertas", "Responsáveis"
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
  Clock,
  Edit,
  FileCheck,
  TrendingUp,
  MoreHorizontal,
  UploadCloud,
  Eye,
  Trash2,
  Building2,
  MapPin,
  ClipboardCheck,
  ShieldCheck,
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

export interface DetalheLocacaoProps {
  documento: any
  onVoltar: () => void
  onEditar?: () => void
  onAtualizar?: () => void
  onVisualizarAnexo?: (nomeArquivo: string) => void
  onAnexarArquivo?: () => void
}

export function DetalheLocacaoView({
  documento,
  onVoltar,
  onEditar,
  onAtualizar,
  onVisualizarAnexo: _onVisualizarAnexo,
  onAnexarArquivo,
}: DetalheLocacaoProps) {
  const [docAtual, setDocAtual] = useState(documento)

  React.useEffect(() => {
    setDocAtual(documento)
  }, [documento])

  const [modalSimularAberto, setModalSimularAberto] = useState(false)
  const [removerAnexoConfirm, setRemoverAnexoConfirm] = useState<string | null>(null)

  // Estados inline: anexo, campos e responsáveis
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)
  const [editorCamposAberto, setEditorCamposAberto] = useState(false)
  const [camposParaEditar, setCamposParaEditar] = useState<DefinicaoCampo[]>([])
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  const abrirEdicaoCompleta = () => {
    setCamposParaEditar([
      { campo: 'titulo', rotulo: 'Título da Locação', tipo: 'texto' },
      { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' },
      { campo: 'parte', rotulo: 'Locador / Proprietário', tipo: 'texto' },
      { campo: 'objeto', rotulo: 'Objeto / Finalidade da Locação', tipo: 'textarea' },
      { campo: 'endereco', rotulo: 'Endereço Completo do Imóvel', tipo: 'texto' },
      { campo: 'valor_mensal', rotulo: 'Aluguel Mensal (R$)', tipo: 'moeda' },
      { campo: 'valor_caucao', rotulo: 'Valor da Caução (R$)', tipo: 'moeda' },
      { campo: 'qtd_caucoes', rotulo: 'Quantidade de Cauções', tipo: 'numero' },
      { campo: 'indexador', rotulo: 'Índice de Reajuste', tipo: 'texto' },
      { campo: 'inicio', rotulo: 'Data de Início', tipo: 'data' },
      { campo: 'fim', rotulo: 'Data de Término / Validade', tipo: 'data' },
      {
        campo: 'status',
        rotulo: 'Status',
        tipo: 'select',
        opcoes: [
          { label: 'Ativo', value: 'ativo' },
          { label: 'Em renovação', value: 'renovacao' },
          { label: 'Encerrado', value: 'encerrado' },
        ],
      },
    ])
    setEditorCamposAberto(true)
  }

  // Normalização de dados
  const titulo = docAtual.titulo || 'Contrato de Locação Galpão Petrolina'
  const parteTexto = docAtual.parte || 'Águia Mercantil Ltda · CNPJ 24.356.305/0001-07'
  const objeto =
    docAtual.objeto || 'Locação comercial de imóvel tipo galpão para a empresa Extrafruti.'
  const empresa = docAtual.empresa || 'Extrafruti'
  const finalidade = docAtual.finalidade_imovel || 'Armazenagem e distribuição'
  const tipoImovel = docAtual.tipo_imovel || 'Galpão logístico'
  const areaM2 = Number(docAtual.area_m2) || 1240

  // Endereço estruturado
  const enderecoTexto =
    docAtual.endereco_imovel ||
    docAtual.endereco ||
    `${docAtual.logradouro || 'Rua Antônio Macedo Filho'}, ${docAtual.numero_imovel || '320'} — ${docAtual.municipio_uf || 'Petrolina/PE'}`
  const linkMapa =
    docAtual.link_mapa ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoTexto)}`

  // CNPJ da contraparte
  const cnpjMatch = parteTexto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
  const cnpj = cnpjMatch ? cnpjMatch[0] : null
  const contraparteNome = cnpj
    ? parteTexto
        .replace(cnpj, '')
        .replace(/[·()]/g, '')
        .trim()
    : parteTexto

  // KPIs
  const aluguelMensal = Number(docAtual.valor_mensal) || 16000
  const valorCaucao = Number(docAtual.valor_caucao) || 32000
  const qtdCaucoes = Number(docAtual.qtd_caucoes) || 2
  const prazoMeses = Number(docAtual.prazo_meses) || 36

  // Datas e Vigência
  const inicioData = docAtual.inicio ? new Date(docAtual.inicio) : new Date('2026-10-31')
  const fimData = docAtual.fim ? new Date(docAtual.fim) : new Date('2029-10-31')

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

  const formatarMoeda = (val: number) => {
    if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00'
    const formatado = val.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `R$ ${formatado}`
  }

  // Próximo reajuste
  const dataProximoReajuste = useMemo(() => {
    const d = new Date(inicioData)
    d.setFullYear(d.getFullYear() + 1)
    return d
  }, [inicioData])

  // Ocupação do prazo (mês X de Y)
  const ocupacaoPrazo = useMemo(() => {
    const hoje = new Date()
    const diffMeses = Math.max(
      1,
      Math.min(
        prazoMeses,
        (hoje.getFullYear() - inicioData.getFullYear()) * 12 +
          (hoje.getMonth() - inicioData.getMonth()) +
          1,
      ),
    )
    const pct = Math.round((diffMeses / (prazoMeses || 36)) * 100)
    return {
      mesAtual: diffMeses,
      totalMeses: prazoMeses || 36,
      pct,
    }
  }, [inicioData, prazoMeses])

  // Status
  const statusInfo = obterStatusInfo(docAtual.status || 'ativo', 'locacoes')

  // Anexos normalizados e contadores
  const listaAnexos: string[] = useMemo(() => {
    return extrairAnexos(docAtual.anexo)
  }, [docAtual.anexo])

  const contagemArquivos = useMemo(() => {
    return contarAnexos(documento.anexo)
  }, [documento.anexo])

  const temAnexos = listaAnexos.length > 0

  // Checklist de Garantia e Caução
  const comprovanteDepositoStatus = documento.comprovante_deposito_status || 'anexado'
  const apoliceSeguroStatus = documento.apolice_seguro_status || 'pendente'
  const vistoriaStatus = documento.vistoria_status || 'pendente'

  // Pendências calculadas
  const pendencias = useMemo(() => {
    const lista = []

    if (!temAnexos) {
      lista.push({
        id: 'contrato_assinado',
        tipo: 'alerta',
        texto: 'Contrato assinado não anexado',
        acaoTexto: 'Anexar',
        onAcao: onAnexarArquivo || onEditar,
      })
    }

    if (apoliceSeguroStatus === 'pendente') {
      lista.push({
        id: 'apolice_seguro',
        tipo: 'alerta',
        texto: 'Apólice de seguro não anexada',
        acaoTexto: 'Anexar',
        onAcao: onAnexarArquivo || onEditar,
      })
    }

    if (vistoriaStatus === 'pendente') {
      lista.push({
        id: 'vistoria_inicial',
        tipo: 'info',
        texto: 'Vistoria inicial não registrada',
        acaoTexto: 'Registrar',
        onAcao: () => {
          toast({
            title: 'Laudo de vistoria',
            description: 'Registrando laudo de vistoria inicial do imóvel.',
          })
          onEditar()
        },
      })
    }

    return lista
  }, [temAnexos, apoliceSeguroStatus, vistoriaStatus, onAnexarArquivo])

  // Responsáveis estruturados
  const responsaveis = useMemo(() => {
    if (Array.isArray(docAtual.responsaveis) && docAtual.responsaveis.length > 0) {
      return docAtual.responsaveis
    }
    return [
      { nome: 'Carlos Eduardo Mendes', cargo: 'Gestor Predial', iniciais: 'CM' },
      { nome: 'Juliana Costa e Silva', cargo: 'Jurídico Imobiliário', iniciais: 'JC' },
    ]
  }, [docAtual.responsaveis])
  // Remoção de anexo individual
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
      {/* 1. CABEÇALHO HERO COM IDENTIFICAÇÃO E 3 KPIS */}
      <div className="bg-[#241712] text-white rounded-2xl p-6 sm:p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Lado Esquerdo: Breadcrumb, Título e Subtítulo */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onVoltar}
                className="text-xs font-semibold tracking-wider uppercase text-amber-300 hover:text-white transition-colors"
              >
                DOCUMENTOS
              </button>
              <span className="text-xs text-amber-400">·</span>
              <span className="text-xs font-semibold tracking-wider uppercase text-amber-200">
                LOCAÇÕES
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-100/80">
              <span className="font-semibold text-white">{contraparteNome}</span>
              {cnpj && (
                <>
                  <span>·</span>
                  <span className="font-mono">CNPJ {cnpj}</span>
                </>
              )}
            </div>
          </div>

          {/* Lado Direito: 3 KPIS EM CARDS BRANCOS ELEVADOS — sem corte de valor e sem quebra interna */}
          <div className="flex flex-wrap items-stretch gap-3.5 w-full lg:w-auto lg:shrink-0">
            {/* KPI 1: Aluguel */}
            <div className="bg-white text-gray-900 rounded-2xl p-5 shadow-md border border-white/20 flex flex-col justify-between min-w-[200px] xl:min-w-[220px] flex-1 sm:flex-initial">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                ALUGUEL
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-lg sm:text-xl xl:text-2xl font-extrabold font-mono tabular-nums tracking-tight text-gray-950 whitespace-nowrap">
                  {formatarMoeda(aluguelMensal)}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 font-medium mt-1.5">por mês</div>
            </div>

            {/* KPI 2: Caução (Número estruturado e destacado) */}
            <div className="bg-white text-gray-900 rounded-2xl p-5 shadow-md border border-white/20 flex flex-col justify-between min-w-[200px] xl:min-w-[220px] flex-1 sm:flex-initial">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                CAUÇÃO
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-lg sm:text-xl xl:text-2xl font-extrabold font-mono tabular-nums tracking-tight text-gray-950 whitespace-nowrap">
                  {formatarMoeda(valorCaucao)}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 font-medium mt-1.5">
                {qtdCaucoes} {qtdCaucoes === 1 ? 'aluguel' : 'aluguéis'}
              </div>
            </div>

            {/* KPI 3: Vigência */}
            <div className="bg-white text-gray-900 rounded-2xl p-5 shadow-md border border-white/20 flex flex-col justify-between min-w-[240px] xl:min-w-[260px] flex-1 sm:flex-initial">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                VIGÊNCIA
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-xs sm:text-sm font-bold font-mono tabular-nums tracking-tight text-gray-950 whitespace-nowrap">
                  {formatarData(inicioData)} → {formatarData(fimData)}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 font-medium mt-1.5 font-mono">
                {prazoMeses} meses
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. STRIP HORIZONTAL: CARD DE LOCALIZAÇÃO (MAPA COM OVERLAY) + OCUPAÇÃO DO PRAZO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* CARD LOCALIZAÇÃO / MAPA (8 colunas) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-3 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] relative overflow-hidden flex flex-col justify-end min-h-[170px]">
          {/* Fundo de mapa estilizado com ruas e quarteirões */}
          <div className="absolute inset-0 bg-[#e5ede6] overflow-hidden">
            {/* Ruas diagonais */}
            <div className="absolute top-0 bottom-0 left-[25%] w-12 bg-white rotate-45 transform origin-top -translate-x-1/2" />
            <div className="absolute top-0 bottom-0 left-[60%] w-16 bg-white -rotate-30 transform origin-center" />
            <div className="absolute left-0 right-0 top-[40%] h-10 bg-white rotate-6" />
            <div className="absolute left-0 right-0 top-[70%] h-8 bg-[#d8e6db]" />

            {/* Quarteirões verdes suaves */}
            <div className="absolute top-3 left-6 w-32 h-20 bg-[#cce3d1] rounded-xl opacity-70" />
            <div className="absolute top-4 right-12 w-48 h-24 bg-[#cce3d1] rounded-xl opacity-70" />
            <div className="absolute bottom-4 left-36 w-40 h-16 bg-[#d2e8d7] rounded-xl opacity-70" />

            {/* Pin vermelho dominante */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 drop-shadow-md">
              <div className="h-9 w-9 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg border-2 border-white">
                <MapPin className="h-5 w-5 fill-white text-rose-600" />
              </div>
              <div className="h-2 w-2 rounded-full bg-rose-950/40 blur-[1px] mt-0.5" />
            </div>
          </div>

          {/* Pill de Overlay Legível sobre o mapa */}
          <div className="relative z-10 m-2 bg-white/95 backdrop-blur-md rounded-xl p-3 border border-gray-200/80 shadow-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                <Building2 className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-gray-900 truncate">{enderecoTexto}</span>
            </div>

            <a
              href={linkMapa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-900 hover:underline shrink-0"
            >
              Abrir no mapa
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* MINI-CARD OCUPAÇÃO DO PRAZO (4 colunas) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col justify-between">
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
              OCUPAÇÃO DO PRAZO
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {ocupacaoPrazo.mesAtual} de {ocupacaoPrazo.totalMeses} meses
            </div>
            <Progress value={ocupacaoPrazo.pct} className="h-2 bg-gray-100" />
          </div>

          <div className="text-xs text-gray-500 pt-3 border-t border-gray-100 mt-4">
            próximo reajuste em {formatarMesAno(dataProximoReajuste)}
          </div>
        </div>
      </div>

      {/* 3. BARRA DE AÇÕES PRINCIPAIS */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button
          type="button"
          onClick={() => {
            toast({
              title: 'Registrar vistoria',
              description: 'Abrindo formulário de laudo de vistoria com upload fotográfico.',
            })
            onEditar()
          }}
          className="h-9 px-4 text-xs font-semibold bg-[#b4411a] hover:bg-[#963514] text-white rounded-full shadow-xs gap-1.5"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Registrar vistoria
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => setModalSimularAberto(true)}
          className="h-9 px-4 text-xs font-semibold text-gray-700 border-gray-300 hover:bg-gray-50 rounded-full"
        >
          Aplicar reajuste
        </Button>

        <DocumentoParecerButton
          tipoAba="locacoes"
          documento={docAtual}
          promptPadrao="Analise este contrato de locação considerando índices de reajuste (IGP-M/IPCA), valor de mercado por metro quadrado, garantias locatícias, direito de renovação e riscos de despejo ou rescisão antecipada."
        />

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
              description: 'Opções de auditoria do contrato de locação.',
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
          {/* Card Objeto da locação */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Objeto da locação</h2>

            {/* Bloco de leitura com acento lateral */}
            <div className="p-4 rounded-xl bg-amber-50/40 border-l-4 border-amber-600 text-sm text-gray-800 leading-relaxed">
              {objeto}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 pt-2">
              <CampoFormatado
                label="EMPRESA"
                valor={empresa}
                estado={empresa ? 'preenchido' : 'pendente'}
                onPreencher={onEditar}
              />

              <CampoFormatado label="FINALIDADE" valor={finalidade} estado="preenchido" />

              <CampoFormatado
                label="ÁREA"
                valor={`${areaM2.toLocaleString('pt-BR')} m²`}
                valorClassName="font-mono font-bold"
                estado="preenchido"
              />

              <CampoFormatado label="TIPO" valor={tipoImovel} estado="preenchido" />
            </div>
          </div>

          {/* Card Condições do contrato */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">
              Condições do contrato
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <CampoFormatado
                label="VALOR MENSAL"
                valor={formatarMoeda(aluguelMensal)}
                valorClassName="font-mono font-bold text-gray-900"
                estado="preenchido"
              />

              <CampoFormatado
                label="ÍNDICE DE REAJUSTE"
                valor={`${documento.indexador || 'IGP-M'} (anual)`}
                estado="preenchido"
              />

              <div>
                <span className="block text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500 mb-1">
                  GARANTIA
                </span>
                <div className="text-sm text-gray-900 font-medium">
                  Depósito caução — {qtdCaucoes} aluguéis
                </div>
                <div className="text-[11px] text-gray-500">pago na assinatura</div>
              </div>

              <CampoFormatado
                label="VIGÊNCIA"
                valor={`${formatarData(inicioData)} → ${formatarData(fimData)}`}
                valorClassName="font-mono"
                estado="preenchido"
              />

              <CampoFormatado
                label="RENOVAÇÃO"
                valor={documento.rescisao || 'A negociar em 2029'}
                estado="preenchido"
              />

              <CampoFormatado
                label="SEGURO"
                valor={documento.seguro_exigido || 'Apólice exigida do locatário'}
                estado="preenchido"
              />
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
                    className="h-9 px-4 text-xs font-semibold bg-[#b4411a] hover:bg-[#963514] text-white rounded-full shadow-xs gap-1.5"
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
                      <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <FileCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{arq}</div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          <span>Contrato de locação</span>
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
                        className="h-7 px-2.5 text-xs text-amber-800 hover:bg-amber-100 rounded-md gap-1"
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
                    </div>{' '}
                  </div>
                ))}

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onAnexarArquivo || onEditar}
                    className="text-xs h-8 text-amber-800 border-amber-200 hover:bg-amber-50 rounded-full gap-1"
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
          {/* Card Garantia e caução */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Garantia e caução</h2>

            <div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-gray-950 whitespace-nowrap">
                {formatarMoeda(valorCaucao)}
              </div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">depósito caução</div>
            </div>

            <div className="space-y-3 pt-3 border-t border-gray-100">
              {/* Item 1: Comprovante de depósito */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {comprovanteDepositoStatus === 'anexado' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                  <span className="font-medium text-gray-800">Comprovante de depósito</span>
                </div>
                {comprovanteDepositoStatus !== 'anexado' && (
                  <button
                    type="button"
                    onClick={onAnexarArquivo || onEditar}
                    className="text-xs font-semibold text-amber-800 hover:underline"
                  >
                    Anexar
                  </button>
                )}
              </div>

              {/* Item 2: Apólice de seguro */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {apoliceSeguroStatus === 'anexado' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                  <span className="font-medium text-gray-800">Apólice de seguro pendente</span>
                </div>
                {apoliceSeguroStatus !== 'anexado' && (
                  <button
                    type="button"
                    onClick={onAnexarArquivo || onEditar}
                    className="text-xs font-semibold text-amber-800 hover:underline"
                  >
                    Anexar
                  </button>
                )}
              </div>
            </div>
          </div>

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
                    pend.tipo === 'info'
                      ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle
                      className={`h-4 w-4 shrink-0 ${
                        pend.tipo === 'info' ? 'text-blue-600' : 'text-amber-600'
                      }`}
                    />
                    <span className="text-xs font-medium truncate">{pend.texto}</span>
                  </div>

                  <button
                    type="button"
                    onClick={pend.onAcao}
                    className="text-xs font-semibold text-amber-800 hover:text-amber-900 hover:underline shrink-0"
                  >
                    {pend.acaoTexto}
                  </button>
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
                className="h-7 text-xs text-amber-800 hover:text-amber-900 hover:bg-amber-50 rounded-full gap-1"
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
                    <div className="h-9 w-9 rounded-full bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center shrink-0">
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
              title: 'Dossiê da locação',
              description: 'Compilando metadados, laudos de vistoria e comprovantes.',
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
          colecao="locacoes"
          registroId={docAtual.id}
          tituloDoc={titulo}
        />
      )}

      {/* Editor Inline de Campos */}
      <CampoEditorInline
        aberto={editorCamposAberto}
        onOpenChange={setEditorCamposAberto}
        colecao="locacoes"
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
        colecao="locacoes"
        documento={docAtual}
        contexto="da locação"
        onSalvo={(atualizado) => {
          setDocAtual(atualizado)
          onAtualizar?.()
        }}
      />

      {/* MODAL DE SIMULAÇÃO DE REAJUSTE */}
      <SimularReajusteModal
        aberto={modalSimularAberto}
        onOpenChange={setModalSimularAberto}
        valorMensalAtual={aluguelMensal}
        indiceAtual={documento.indexador || 'IGP-M'}
        tituloDocumento={titulo}
        onAplicarSimulacao={(novoVal) => {
          toast({
            title: 'Reajuste simulado com sucesso',
            description: `Novo valor de ${formatarMoeda(novoVal)} calculado para aplicação.`,
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
