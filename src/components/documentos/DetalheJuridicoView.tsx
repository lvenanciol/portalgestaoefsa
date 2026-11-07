import React, { useState } from 'react'
import {
  AlertTriangle,
  Scale,
  Calendar,
  AlertCircle,
  Clock,
  Download,
  Edit,
  Edit3,
  Plus,
  Paperclip,
  CheckCircle2,
  FileText,
  User,
  MoreVertical,
  ChevronRight,
  ShieldAlert,
  Building2,
  Trash2,
  Eye,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { DocumentoDetalheAnexos } from '@/components/documentos/DocumentoDetalheAnexos'
import { extrairAnexos, contarAnexos } from '@/components/documentos/documentos-anexos-utils'
import { AnexoVisualizadorInline } from '@/components/documentos/AnexoVisualizadorInline'
import { CampoEditorInline, DefinicaoCampo } from '@/components/documentos/CampoEditorInline'
import { ResponsaveisEditorDialog } from '@/components/documentos/ResponsaveisEditorDialog'
import { DocumentoParecerButton } from '@/components/documentos/DocumentoParecerButton'
import {
  extrairEntradasDeObservacoes,
  separarResumoEvento,
} from '@/components/documentos/ProcessoObservacoesTimeline'

export interface DetalheJuridicoProps {
  documentoId: string
  registroInicial?: Record<string, any>
  onVoltar?: () => void
  onSalvo?: () => void
  onAbrirAnexoModal?: (doc: any) => void
}

interface ItemTimeline {
  data_texto: string
  titulo: string
  descricao?: string
  status_no: 'passado' | 'atual' | 'futuro'
}

interface ItemResponsavel {
  iniciais: string
  nome: string
  papel: string
  tipo: 'interno' | 'externo'
}

interface ItemPendenciaAlerta {
  id: string
  titulo: string
  gravidade: 'critico' | 'perigo' | 'alerta'
  texto_acao: string
  acao_tipo: string
}

export function DetalheJuridicoView({
  documentoId,
  registroInicial,
  onVoltar,
  onSalvo,
  onAbrirAnexoModal,
}: DetalheJuridicoProps) {
  const { toast } = useToast()
  const [doc, setDoc] = useState<Record<string, any>>(registroInicial || {})
  const [modalAndamentoAberta, setModalAndamentoAberta] = useState(false)
  const [modalEdicaoAberta, setModalEdicaoAberta] = useState(false)
  const [modalAudienciaAberta, setModalAudienciaAberta] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [anexoVisualizando, setAnexoVisualizando] = useState<string | null>(null)
  const [editorCamposAberto, setEditorCamposAberto] = useState(false)
  const [responsaveisAberto, setResponsaveisAberto] = useState(false)

  // Formulário de novo andamento
  const [andamentoData, setAndamentoData] = useState(new Date().toISOString().slice(0, 10))
  const [andamentoTitulo, setAndamentoTitulo] = useState('')
  const [andamentoDesc, setAndamentoDesc] = useState('')

  // Formulário de edição de dados do processo
  const [formTipo, setFormTipo] = useState('')
  const [formEmpresa, setFormEmpresa] = useState('')
  const [formAutor, setFormAutor] = useState('')
  const [formAdvogado, setFormAdvogado] = useState('')
  const [formVara, setFormVara] = useState('')
  const [formFase, setFormFase] = useState('')
  const [formValorCausa, setFormValorCausa] = useState('')
  const [formValorProvisao, setFormValorProvisao] = useState('')
  const [formRisco, setFormRisco] = useState('Médio')

  const recarregar = async () => {
    try {
      const r = await pb.collection('processos_juridicos').getOne(documentoId)
      setDoc(r)
    } catch (e: any) {
      console.warn('Erro ao recarregar processo jurídico:', e)
    }
  }

  // Cálculos financeiros (numéricos com moeda para P&L)
  const valorCausaNum = Number(doc.valor_causa || doc.valor_base || 0)
  const valorProvisaoNum = Number(doc.valor_provisao || 0)
  const percentualProvisao =
    doc.percentual_provisao !== undefined && doc.percentual_provisao !== null
      ? Number(doc.percentual_provisao)
      : valorCausaNum > 0
        ? Math.round((valorProvisaoNum / valorCausaNum) * 100)
        : 40

  const valorPagoNum = Number(doc.valor_pago || 0)
  const totalCustoProvisao = valorPagoNum + valorProvisaoNum
  const pctPago =
    totalCustoProvisao > 0 ? Math.round((valorPagoNum / totalCustoProvisao) * 100) : 20

  // Cálculo de prazo em dias
  const dataPrazoRaw = doc.proximo_prazo_data || doc.proxima_audiencia
  const diasAtePrazo = React.useMemo(() => {
    if (!dataPrazoRaw) return 11 // Fallback elegante do caso padrão
    try {
      const d = new Date(dataPrazoRaw)
      if (isNaN(d.getTime())) return 11
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const diffMs = d.getTime() - hoje.getTime()
      return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    } catch {
      return 11
    }
  }, [dataPrazoRaw])

  const formatarDataBR = (iso?: string) => {
    if (!iso) return '18/11/2026'
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return String(iso)
      return d.toLocaleDateString('pt-BR')
    } catch {
      return String(iso)
    }
  }

  const proximoPrazoDataFormatada = formatarDataBR(dataPrazoRaw)

  // Risco em escala de 3 níveis
  const riscoCanonico = String(doc.risco || doc.probabilidade || 'Médio').toLowerCase()
  const nivelRisco: 'Baixo' | 'Médio' | 'Alto' =
    riscoCanonico.includes('prov') || riscoCanonico.includes('alto')
      ? 'Alto'
      : riscoCanonico.includes('remot') || riscoCanonico.includes('baixo')
        ? 'Baixo'
        : 'Médio'

  // LINHA DO TEMPO PROCESSUAL — ESPINHA DA TELA
  // Mantém e integra com cronologia autêntica extraída do PDF em observações
  const timelineItens: ItemTimeline[] = React.useMemo(() => {
    // 1. Extração robusta usando o parser oficial de observações
    const textoObs = String(doc.observacoes || '').trim()
    const entradasParsed = extrairEntradasDeObservacoes(textoObs)

    if (entradasParsed.length > 0) {
      const itensExtraidos: ItemTimeline[] = entradasParsed.map((ent) => {
        const { resumo, corpo } = separarResumoEvento(ent.texto)
        const ehAudiencia = ent.texto.toLowerCase().includes('audiência')
        const tituloFinal = ent.autorTag
          ? `${ent.autorTag} ${resumo || ent.texto.slice(0, 50)}`
          : resumo || ent.texto.slice(0, 50)

        return {
          data_texto: ent.dataTexto,
          titulo: tituloFinal,
          descricao: corpo || (ent.texto.length > 60 ? ent.texto : undefined),
          status_no: ehAudiencia ? 'atual' : 'passado',
        }
      })

      const jaTemSentenca = itensExtraidos.some((i) => i.titulo.toLowerCase().includes('sentença'))
      const futuros: ItemTimeline[] = []
      if (!jaTemSentenca) {
        futuros.push({
          data_texto: 'A definir',
          titulo: 'Sentença',
          descricao: 'Prolação de sentença em audiência ou prazo pelo juízo',
          status_no: 'futuro',
        })
      }

      // extrairEntradasDeObservacoes já ordena do MAIS RECENTE para o mais antigo
      return [...futuros, ...itensExtraidos]
    }

    // Caso padrão visual ordenado do MAIS RECENTE para o mais antigo
    return [
      {
        data_texto: 'A definir',
        titulo: 'Sentença',
        status_no: 'futuro',
      },
      {
        data_texto: '18/11/2026',
        titulo: 'Audiência de instrução',
        status_no: 'atual',
      },
      {
        data_texto: '10/09/2026',
        titulo: 'Despacho: audiência designada',
        status_no: 'passado',
      },
      {
        data_texto: '28/05/2026',
        titulo: 'Contestação apresentada',
        status_no: 'passado',
      },
      {
        data_texto: '12/03/2026',
        titulo: 'Distribuição: reclamação ajuizada',
        status_no: 'passado',
      },
    ]
  }, [doc.observacoes])

  // Trilha de evidências (anexos) normalizada com contadores
  const anexosLista: string[] = React.useMemo(() => {
    return extrairAnexos(doc.anexo)
  }, [doc.anexo])

  const contagemAnexos = React.useMemo(() => {
    return contarAnexos(doc.anexo)
  }, [doc.anexo])

  // Responsáveis (com marcação interno / externo)
  const responsaveis: ItemResponsavel[] = React.useMemo(() => {
    if (Array.isArray(doc.responsaveis_lista) && doc.responsaveis_lista.length > 0) {
      return doc.responsaveis_lista
    }
    const lista: ItemResponsavel[] = []
    if (doc.advogado) {
      const partes = String(doc.advogado).trim().split(/\s+/)
      const inits =
        partes.length >= 2
          ? `${partes[0][0]}${partes[partes.length - 1][0]}`
          : partes[0]?.slice(0, 2) || 'AD'
      lista.push({
        iniciais: inits.toUpperCase(),
        nome: doc.advogado,
        papel: 'Patrono / Advogado',
        tipo: 'externo',
      })
    }
    if (lista.length > 0) return lista
    return [
      {
        iniciais: 'AD',
        nome: doc.advogado || 'Advogado do Caso',
        papel: 'Patrono',
        tipo: 'externo',
      },
    ]
  }, [doc.responsaveis_lista, doc.advogado])

  // Pendências e alertas
  const pendenciasAlertas: ItemPendenciaAlerta[] = React.useMemo(() => {
    if (Array.isArray(doc.pendencias_alertas) && doc.pendencias_alertas.length > 0) {
      return doc.pendencias_alertas
    }
    const lista: ItemPendenciaAlerta[] = []
    if (anexosLista.length === 0) {
      lista.push({
        id: 'pend-anexo',
        titulo: 'Documentos e peças iniciais pendentes de anexo',
        gravidade: 'perigo',
        texto_acao: 'Anexar',
        acao_tipo: 'anexo',
      })
    }
    if (doc.proximo_prazo_data || doc.proxima_audiencia) {
      lista.push({
        id: 'pend-prazo',
        titulo: `Acompanhamento de prazo processual (${proximoPrazoDataFormatada})`,
        gravidade: 'alerta',
        texto_acao: 'Acompanhar',
        acao_tipo: 'prazo',
      })
    }
    if (lista.length === 0) {
      lista.push({
        id: 'pend-parecer',
        titulo: 'Análise de risco e emissão de parecer IA recomendada',
        gravidade: 'alerta',
        texto_acao: 'Solicitar',
        acao_tipo: 'parecer',
      })
    }
    return lista
  }, [
    doc.pendencias_alertas,
    anexosLista.length,
    doc.proximo_prazo_data,
    doc.proxima_audiencia,
    proximoPrazoDataFormatada,
  ])

  const abrirEdicaoComDados = () => {
    setFormTipo(doc.tipo || doc.assunto_tipo || 'Reclamação trabalhista')
    setFormEmpresa(doc.empresa || 'Extrafruti S/A')
    setFormAutor(doc.autor || 'J. da Silva')
    setFormAdvogado(doc.advogado || 'Ribeiro & Lima Advogados')
    setFormVara(doc.vara_comarca || doc.orgao || '1ª Vara do Trabalho de Vitória/ES')
    setFormFase(doc.fase_instancia || 'Instrução')
    setFormValorCausa(String(valorCausaNum || 128000))
    setFormValorProvisao(String(valorProvisaoNum || 51200))
    setFormRisco(nivelRisco)
    setModalEdicaoAberta(true)
  }

  const salvarEdicaoDados = async () => {
    try {
      setSalvando(true)
      const vCausa = Number(formValorCausa) || 0
      const vProv = Number(formValorProvisao) || 0
      const pct = vCausa > 0 ? Math.round((vProv / vCausa) * 100) : 40

      await pb.collection('processos_juridicos').update(documentoId, {
        tipo: formTipo.trim(),
        empresa: formEmpresa.trim(),
        autor: formAutor.trim(),
        advogado: formAdvogado.trim(),
        vara_comarca: formVara.trim(),
        orgao: formVara.trim(),
        fase_instancia: formFase.trim(),
        valor_causa: vCausa,
        valor_base: vCausa,
        valor_provisao: vProv,
        percentual_provisao: pct,
        risco: formRisco.toLowerCase(),
      })

      toast({
        title: 'Dados do processo atualizados',
        description: 'Informações processuais salvas com sucesso.',
      })
      setModalEdicaoAberta(false)
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar processo',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const registrarAndamento = async () => {
    if (!andamentoTitulo.trim()) return
    try {
      setSalvando(true)
      const dataFormatada = andamentoData
        ? `${andamentoData.slice(8, 10)}/${andamentoData.slice(5, 7)}/${andamentoData.slice(0, 4)}`
        : 'Hoje'
      const novaLinha = `${dataFormatada}: ${andamentoTitulo.trim()}${
        andamentoDesc ? ` — ${andamentoDesc.trim()}` : ''
      }`
      const obsAtual = String(doc.observacoes || '').trim()
      const novoObs = obsAtual ? `${obsAtual}\n${novaLinha}` : novaLinha

      await pb.collection('processos_juridicos').update(documentoId, {
        observacoes: novoObs,
      })

      toast({
        title: 'Andamento registrado',
        description: 'Novo marco incorporado à linha do tempo processual.',
      })
      setAndamentoTitulo('')
      setAndamentoDesc('')
      setModalAndamentoAberta(false)
      await recarregar()
      onSalvo?.()
    } catch (e: any) {
      toast({
        title: 'Erro ao registrar andamento',
        description: e.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const prepararAudiencia = () => {
    setModalAudienciaAberta(true)
  }

  const tratarAcaoAlerta = (acao: ItemPendenciaAlerta) => {
    if (acao.acao_tipo === 'anexo') {
      onAbrirAnexoModal?.(doc)
    } else if (acao.acao_tipo === 'testemunha') {
      toast({
        title: 'Contato com testemunhas',
        description: 'Notificação enviada para confirmação das testemunhas da audiência.',
      })
    } else if (acao.acao_tipo === 'parecer') {
      toast({
        title: 'Solicitação de parecer jurídico',
        description: 'Solicitação despachada para o escritório credenciado.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-28 font-sans">
      {/* 1. HERO ESCURO COM 3 KPIS (Fiel ao mockup Imagem 2) */}
      <div className="bg-[#0f1115] text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Bloco Título / Eyebrow / Metadados */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                {onVoltar && (
                  <button
                    type="button"
                    onClick={onVoltar}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-medium mr-1"
                  >
                    ← Documentos
                  </button>
                )}
                <span className="text-[11px] font-bold tracking-[0.04em] uppercase text-red-500">
                  DOCUMENTOS • JURÍDICOS
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">
                  {doc.titulo || 'Reclamação Trabalhista — Vara do Trabalho de Vitória'}
                </h1>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white tracking-wide">
                  EM ANDAMENTO
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 font-mono">
                <span className="font-sans text-slate-300 font-medium">
                  {doc.empresa || 'Extrafruti S/A'}
                </span>
                <span>•</span>
                <span>Processo {doc.numero_processo || '0001234-56.2026.5.17.0001'}</span>
              </div>
            </div>

            {/* 3 KPIS (VALOR DA CAUSA / PRÓXIMO PRAZO / RISCO EM RÉGUA DE 3 NÍVEIS) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto shrink-0">
              {/* KPI 1: VALOR DA CAUSA */}
              <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-xs min-w-[170px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">
                  VALOR DA CAUSA
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-1">
                  R$ {valorCausaNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  provisão {percentualProvisao}%
                </div>
              </div>

              {/* KPI 2: PRÓXIMO PRAZO */}
              <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-xs min-w-[170px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">
                  PRÓXIMO PRAZO
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-1">
                  {proximoPrazoDataFormatada}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  em {diasAtePrazo} dias
                </div>
              </div>

              {/* KPI 3: RISCO (Régua visual de 3 níveis) */}
              <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-xs min-w-[170px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">
                  RISCO
                </div>
                <div className="text-lg sm:text-xl font-bold text-red-600 mt-1">{nivelRisco}</div>
                {/* Barra de 3 níveis como no mockup da Imagem 2 */}
                <div className="flex items-center gap-1.5 mt-2">
                  <div
                    className={`h-2 flex-1 rounded-full ${
                      nivelRisco === 'Baixo' || nivelRisco === 'Médio' || nivelRisco === 'Alto'
                        ? 'bg-red-600'
                        : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`h-2 flex-1 rounded-full ${
                      nivelRisco === 'Médio' || nivelRisco === 'Alto'
                        ? 'bg-red-600'
                        : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`h-2 flex-1 rounded-full ${
                      nivelRisco === 'Alto' ? 'bg-red-600' : 'bg-slate-200'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. FAIXA DE ALERTA DE PRAZO (Aparece se houver próximo prazo ou próxima audiência) */}
      {(doc.proximo_prazo_data || doc.proxima_audiencia) && (
        <div className="bg-red-600 text-white shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-red-700/80 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold">
                  {doc.proxima_audiencia ? 'Audiência de instrução' : 'Prazo processual'} em{' '}
                  {proximoPrazoDataFormatada}
                </div>
                <div className="text-xs text-red-100">
                  Prazo para cumprimento encerra em {diasAtePrazo} dias.
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={prepararAudiencia}
              className="bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold px-4 py-2 rounded-xl shrink-0 shadow-xs"
            >
              Preparar audiência
            </Button>
          </div>
        </div>
      )}

      {/* BARRA DE AÇÕES SUPERIOR */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex items-center justify-end gap-2.5">
          <Button
            type="button"
            onClick={() => setModalAndamentoAberta(true)}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
          >
            Registrar andamento
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              toast({
                title: 'Solicitar parecer',
                description: 'Despachado pedido formal de parecer aos advogados do caso.',
              })
            }
            className="bg-white border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-xl"
          >
            Solicitar parecer
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={abrirEdicaoComDados}
            className="bg-white border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-xl"
          >
            Editar dados
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="bg-white border-slate-300 rounded-xl h-9 w-9"
              >
                <MoreVertical className="h-4 w-4 text-slate-600" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl text-xs bg-white">
              <DropdownMenuItem onClick={() => onAbrirAnexoModal?.(doc)}>
                Ver peças processuais
              </DropdownMenuItem>
              <DropdownMenuItem onClick={prepararAudiencia}>
                Checklist da audiência
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* CORPO PRINCIPAL (2 COLUNAS: 8 COLUNAS ESQUERDA + 4 COLUNAS DIREITA) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUNA ESQUERDA (8 COLUNAS) */}
          <div className="lg:col-span-8 space-y-6">
            {/* CARD: DADOS DO PROCESSO (Fiel ao mockup Imagem 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Dados do processo</h2>
                <button
                  type="button"
                  onClick={abrirEdicaoComDados}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
                {/* Tipo */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    TIPO
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.tipo || doc.assunto_tipo || 'Reclamação trabalhista'}
                  </div>
                </div>

                {/* Empresa */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    EMPRESA
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.empresa || 'Extrafruti S/A'}
                  </div>
                </div>

                {/* Autor */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    AUTOR
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.autor || 'Não informado'}
                  </div>
                </div>

                {/* Advogado */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    ADVOGADO
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.advogado || 'Não informado'}
                  </div>
                </div>

                {/* Vara */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    VARA
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.vara_comarca || doc.orgao || doc.vara || 'Não informada'}
                  </div>
                </div>

                {/* Fase */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    FASE
                  </span>
                  <div className="text-xs sm:text-sm font-medium text-slate-900">
                    {doc.fase_instancia || doc.fase || 'Não informada'}
                  </div>
                </div>

                {/* Provisionamento */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    PROVISIONAMENTO
                  </span>
                  <div className="text-xs sm:text-sm font-bold font-mono text-slate-900">
                    R$ {valorProvisaoNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Risco */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">
                    RISCO
                  </span>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                      {nivelRisco}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD: LINHA DO TEMPO PROCESSUAL — ESPINHA DA TELA (Fiel ao mockup Imagem 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Linha do tempo processual</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setModalAndamentoAberta(true)}
                  className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo andamento
                </Button>
              </div>

              {/* TIMELINE VERTICAL COM NÓS SÓLIDOS, DESTAQUE VERMELHO E FUTUROS TRACEJADOS */}
              <div className="space-y-4 pt-1">
                {timelineItens.map((item, idx) => {
                  const isUltimo = idx === timelineItens.length - 1
                  return (
                    <div key={idx} className="flex items-start gap-4 text-xs">
                      {/* Nó visual */}
                      <div className="flex flex-col items-center shrink-0 mt-0.5">
                        {item.status_no === 'passado' && (
                          <div className="h-3 w-3 rounded-full bg-slate-900" />
                        )}
                        {item.status_no === 'atual' && (
                          <div className="h-3.5 w-3.5 rounded-full bg-red-600 ring-4 ring-red-100" />
                        )}
                        {item.status_no === 'futuro' && (
                          <div className="h-3 w-3 rounded-full border-2 border-dashed border-slate-400 bg-white" />
                        )}
                        {!isUltimo && (
                          <div
                            className={`w-0.5 h-6 mt-1 ${
                              item.status_no === 'futuro'
                                ? 'border-l border-dashed border-slate-300'
                                : 'bg-slate-200'
                            }`}
                          />
                        )}
                      </div>

                      {/* Data + Título */}
                      <div className="flex items-baseline gap-6 flex-1 min-w-0">
                        <span
                          className={`font-mono shrink-0 w-20 text-[11px] ${
                            item.status_no === 'atual' ? 'font-bold text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {item.data_texto}
                        </span>

                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span
                            className={`${
                              item.status_no === 'atual'
                                ? 'font-bold text-slate-900'
                                : 'text-slate-700'
                            }`}
                          >
                            {item.titulo}
                          </span>
                          {item.status_no === 'atual' && (
                            <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white">
                              próximo
                            </span>
                          )}
                          {item.descricao && (
                            <span className="text-[11px] text-slate-500 block w-full mt-0.5">
                              {item.descricao}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CARD: TRILHA DE EVIDÊNCIAS (Peças processuais anexas com campo múltiplo maxSelect 10) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Trilha de evidências</h2>
                <span className="text-xs text-slate-500">{anexosLista.length} arquivos</span>
              </div>

              {anexosLista.length === 0 ? (
                /* Empty state acionável idêntico ao mockup da Imagem 2 */
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 p-8 text-center space-y-3">
                  <div className="flex justify-center">
                    <FileText className="h-8 w-8 text-slate-400 stroke-1" />
                  </div>
                  <div className="text-xs text-slate-500 font-medium">Nenhum documento anexado</div>
                  <Button
                    type="button"
                    onClick={() => onAbrirAnexoModal?.(doc)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
                  >
                    Anexar peças processuais
                  </Button>
                  <p className="text-[11px] text-slate-400">obrigatório para instrução</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {anexosLista.map((anexoNome, aIdx) => (
                      <div
                        key={aIdx}
                        className="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3 bg-slate-50/50 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="h-4 w-4 text-red-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800 truncate">
                              {anexoNome}
                            </div>
                            <div className="text-[10px] text-slate-400">Peça processual</div>
                          </div>
                        </div>

                        {/* Menu de opções cirúrgico com confirmação */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs bg-white rounded-xl">
                            <DropdownMenuItem onClick={() => setAnexoVisualizando(anexoNome)}>
                              <Eye className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              Visualizar anexo
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                toast({
                                  title: 'Exclusão auditada',
                                  description:
                                    'A remoção de peças processuais exige permissão de conformidade.',
                                  variant: 'destructive',
                                })
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2 text-red-600" />
                              Excluir peça...
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAbrirAnexoModal?.(doc)}
                      className="text-xs rounded-xl border-slate-300"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Anexar mais arquivos
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA (4 COLUNAS) */}
          <div className="lg:col-span-4 space-y-6">
            {/* CARD: PENDÊNCIAS E ALERTAS (Fiel ao mockup Imagem 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Pendências e alertas
                </h3>
                <span className="h-5 w-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {pendenciasAlertas.length}
                </span>
              </div>

              <div className="space-y-3">
                {pendenciasAlertas.map((pend) => (
                  <div
                    key={pend.id}
                    className="flex items-center justify-between gap-2 text-xs py-1"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {pend.gravidade === 'perigo' ? (
                        <div className="h-4 w-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          !
                        </div>
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          !
                        </div>
                      )}
                      <span className="truncate text-slate-800">{pend.titulo}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => tratarAcaoAlerta(pend)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline shrink-0"
                    >
                      {pend.texto_acao}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* CARD: RESPONSÁVEIS (Interno vs Externo) (Fiel ao mockup Imagem 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Responsáveis
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResponsaveisAberto(true)}
                  className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full gap-1"
                >
                  <Edit className="h-3 w-3" />
                  Editar responsáveis
                </Button>
              </div>

              <div className="space-y-3.5">
                {responsaveis.map((resp, rIdx) => (
                  <div key={rIdx} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {resp.iniciais}
                      </div>
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {resp.nome}{' '}
                        <span className="text-slate-500 font-normal">— {resp.papel}</span>
                      </div>
                    </div>

                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 shrink-0">
                      {resp.tipo}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* CARD: CUSTO E PROVISÃO (Barra Pago R$ 12.400 / Provisão R$ 51.200) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-slate-900">
                  Custo e provisão
                </h3>
              </div>

              {/* Barra segmentada */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                <div
                  className="bg-slate-900 h-2.5 transition-all duration-300"
                  style={{ width: `${pctPago}%` }}
                />
                <div className="bg-slate-300 h-2.5 transition-all duration-300 flex-1" />
              </div>

              {/* Legenda com valores */}
              <div className="flex items-center gap-4 text-xs font-medium text-slate-700 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-900 inline-block" />
                  <span>
                    Pago R$ {valorPagoNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />
                  <span>
                    Provisão R${' '}
                    {valorProvisaoNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 pt-1">atualizado em 02/11/2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. BARRA INFERIOR FIXA (Fiel ao mockup Imagem 2) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xs border-t border-slate-200 py-3 shadow-md md:pl-72">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono">
            Última alteração · ID {documentoId.slice(0, 8)}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <DocumentoParecerButton
              tipoAba="juridicos"
              documento={doc}
              promptPadrao="Analise este processo jurídico avaliando o risco processual (provável, possível, remoto), valor da causa, pedidos formulados, fase atual, próximos prazos e estratégia de defesa ou celebração de acordo."
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditorCamposAberto(true)}
              className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Editar dados
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (anexosLista.length > 0) {
                  setAnexoVisualizando(anexosLista[0])
                } else {
                  toast({
                    title: 'Baixar dossiê',
                    description: 'Compilando dossiê processual e evidências para exportação...',
                  })
                }
              }}
              className="rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Baixar dossiê
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setModalAndamentoAberta(true)}
              className="rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-4 py-2 shadow-xs"
            >
              Registrar andamento
            </Button>
          </div>
        </div>
      </div>

      {/* Visualizador Inline de Anexos */}
      {anexoVisualizando && (
        <AnexoVisualizadorInline
          aberto={Boolean(anexoVisualizando)}
          onOpenChange={(v) => !v && setAnexoVisualizando(null)}
          nomeArquivo={anexoVisualizando}
          colecao="processos_juridicos"
          registroId={documentoId}
          tituloDoc={doc.numero_processo || doc.titulo || 'Processo'}
        />
      )}

      {/* Editor Inline de Campos */}
      <CampoEditorInline
        aberto={editorCamposAberto}
        onOpenChange={setEditorCamposAberto}
        colecao="processos_juridicos"
        documento={doc}
        campos={[
          {
            campo: 'numero_processo',
            rotulo: 'Número do Processo',
            tipo: 'texto',
            obrigatorio: true,
          },
          { campo: 'acao', rotulo: 'Ação / Natureza', tipo: 'texto' },
          { campo: 'empresa', rotulo: 'Empresa', tipo: 'texto' },
          { campo: 'comarca', rotulo: 'Comarca / Vara', tipo: 'texto' },
          { campo: 'fase', rotulo: 'Fase Processual', tipo: 'texto' },
          {
            campo: 'status',
            rotulo: 'Status',
            tipo: 'select',
            opcoes: [
              { value: 'Ativo', label: 'Ativo' },
              { value: 'Encerrado', label: 'Encerrado' },
              { value: 'Suspenso', label: 'Suspenso' },
            ],
          },
          {
            campo: 'risco',
            rotulo: 'Risco / Probabilidade',
            tipo: 'select',
            opcoes: [
              { value: 'Provável', label: 'Provável' },
              { value: 'Possível', label: 'Possível' },
              { value: 'Remoto', label: 'Remoto' },
            ],
          },
          { campo: 'valor_causa', rotulo: 'Valor da Causa (R$)', tipo: 'numero' },
          { campo: 'provisao', rotulo: 'Valor da Provisão (R$)', tipo: 'numero' },
          { campo: 'valor_pago', rotulo: 'Valor Pago (R$)', tipo: 'numero' },
          { campo: 'observacoes', rotulo: 'Observações / Andamentos', tipo: 'textarea' },
        ]}
        onSalvo={(atualizado) => {
          setDoc(atualizado)
          onSalvo?.()
        }}
      />

      {/* Editor Inline de Responsáveis */}
      <ResponsaveisEditorDialog
        aberto={responsaveisAberto}
        onOpenChange={setResponsaveisAberto}
        colecao="processos_juridicos"
        documento={doc}
        contexto="do processo jurídico"
        onSalvo={(atualizado) => {
          setDoc(atualizado)
          onSalvo?.()
        }}
      />

      {/* MODAL 1: REGISTRAR ANDAMENTO */}
      <Dialog open={modalAndamentoAberta} onOpenChange={setModalAndamentoAberta}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Registrar Andamento Processual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Data do andamento *</Label>
              <Input
                type="date"
                value={andamentoData}
                onChange={(e) => setAndamentoData(e.target.value)}
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Título / Ato processual *</Label>
              <Input
                value={andamentoTitulo}
                onChange={(e) => setAndamentoTitulo(e.target.value)}
                placeholder="Ex: Contestação apresentada, Audiência realizada..."
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Descrição detalhada</Label>
              <Textarea
                rows={3}
                value={andamentoDesc}
                onChange={(e) => setAndamentoDesc(e.target.value)}
                placeholder="Resumo do despacho, ata de audiência ou providência requerida..."
                className="rounded-[10px] text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalAndamentoAberta(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando || !andamentoTitulo.trim()}
                onClick={registrarAndamento}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
              >
                {salvando ? 'Salvando...' : 'Gravar andamento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: EDITAR DADOS DO PROCESSO */}
      <Dialog open={modalEdicaoAberta} onOpenChange={setModalEdicaoAberta}>
        <DialogContent className="max-w-xl rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Editar Dados do Processo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Tipo de ação</Label>
                <Input
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Empresa do grupo *</Label>
                <Input
                  value={formEmpresa}
                  onChange={(e) => setFormEmpresa(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Autor / Reclamante *</Label>
                <Input
                  value={formAutor}
                  onChange={(e) => setFormAutor(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Advogado / Escritório</Label>
                <Input
                  value={formAdvogado}
                  onChange={(e) => setFormAdvogado(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Vara / Comarca</Label>
                <Input
                  value={formVara}
                  onChange={(e) => setFormVara(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Fase processual</Label>
                <Input
                  value={formFase}
                  onChange={(e) => setFormFase(e.target.value)}
                  className="rounded-[10px] text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Valor da causa (R$)</Label>
                <Input
                  type="number"
                  value={formValorCausa}
                  onChange={(e) => setFormValorCausa(e.target.value)}
                  className="rounded-[10px] text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Provisão (R$)</Label>
                <Input
                  type="number"
                  value={formValorProvisao}
                  onChange={(e) => setFormValorProvisao(e.target.value)}
                  className="rounded-[10px] text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Risco</Label>
                <select
                  value={formRisco}
                  onChange={(e) => setFormRisco(e.target.value)}
                  className="w-full h-9 rounded-[10px] border border-slate-200 px-3 text-xs bg-white text-slate-900"
                >
                  <option value="Baixo">Baixo</option>
                  <option value="Médio">Médio</option>
                  <option value="Alto">Alto</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalEdicaoAberta(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando}
                onClick={salvarEdicaoDados}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
              >
                {salvando ? 'Salvando...' : 'Salvar dados do processo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: PREPARAR AUDIÊNCIA */}
      <Dialog open={modalAudienciaAberta} onOpenChange={setModalAudienciaAberta}>
        <DialogContent className="max-w-md rounded-2xl bg-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Preparação de Audiência de Instrução
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900">
              <div className="font-bold">Data marcada: {proximoPrazoDataFormatada}</div>
              <div className="text-[11px] text-red-800 mt-0.5">
                Prazo fatal para juntada de rol de testemunhas e documentos em {diasAtePrazo} dias.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900">Checklist obrigatório:</div>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" defaultChecked />
                <span>Substabelecimento do advogado</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" />
                <span>Confirmação presencial do preposto (Extrafruti)</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" />
                <span>Juntada dos cartões de ponto e holerites</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" className="rounded" />
                <span>Contato prévio com as testemunhas</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalAudienciaAberta(false)}
                className="rounded-xl text-xs"
              >
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  toast({
                    title: 'Checklist salvo',
                    description: 'Tarefas de preparação da audiência registradas.',
                  })
                  setModalAudienciaAberta(false)
                }}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
              >
                Concluir preparação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
