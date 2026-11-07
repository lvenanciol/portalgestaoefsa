/**
 * DocumentosPage — Tela de Listagem e Gestão de Documentos
 * Redesenhada conforme Imagem 1 -> Imagem 2 e Blocos 1 e 2 da especificação:
 * - Colunas dinâmicas por tipo (Alvarás, Contratos, Locações, Atas, Jurídicos)
 * - 5 colunas fixas nas mesmas posições: Documento, Empresa, Status, Anexos, Ações
 * - Colunas específicas entram entre "Documento" e "Empresa"
 * - Faixa contextual sob as abas ("Colunas adaptadas ao tipo...")
 * - Barra de filtros em 1 linha com busca, segmented de status, dropdown Empresa, dropdown Validade e Limpar
 * - Persistência de filtros e aba ativa em Query Params da URL
 * - Painel lateral "Resumo da aba" com contadores por status, próximos vencimentos e exportar
 * - Ações hierarquizadas: botão "Abrir" primário + menu "…" (Editar, Anexar, Histórico, Ver no chat, Excluir com digitação de confirmação)
 * - Navegação transparente para a visão de detalhe dedicada (ex: DetalheAlvaraView para alvarás)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Shield,
  Briefcase,
  Building2,
  FileCheck,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Upload,
  CalendarDays,
  FileText,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'

import {
  CONFIG_COLUNAS_POR_TIPO,
  TipoAbaDocumento,
  DocumentoGenericoItem,
} from '@/components/documentos/documentos-colunas-config'
import { DocumentosTabelaGenerica } from '@/components/documentos/DocumentosTabelaGenerica'
import { DocumentosFaixaContextual } from '@/components/documentos/DocumentosFaixaContextual'
import {
  DocumentosFiltrosBar,
  FiltrosDocumentosState,
} from '@/components/documentos/DocumentosFiltrosBar'
import { DocumentosResumoLateral } from '@/components/documentos/DocumentosResumoLateral'
import { DetalheAlvaraView } from '@/components/documentos/DetalheAlvaraView'
import { DetalheContratoView } from '@/components/documentos/DetalheContratoView'
import { DetalheLocacaoView } from '@/components/documentos/DetalheLocacaoView'
import { DetalheAtaView } from '@/components/documentos/DetalheAtaView'
import { DetalheJuridicoView } from '@/components/documentos/DetalheJuridicoView'

import { DocumentoAnexoModal } from '@/components/documentos/DocumentoAnexoModal'
import { DocumentoDetalheModal } from '@/components/documentos/DocumentoDetalheModal'
import { JuridicosImportModal } from '@/components/documentos/JuridicosImportModal'
import { ProcessoHistoricoModal } from '@/components/documentos/ProcessoHistoricoModal'
import { AudienciasModal } from '@/components/documentos/AudienciasModal'
import { NovoDocumentoModal } from '@/components/documentos/NovoDocumentoModal'
import { normalizarParaBusca } from '@/components/documentos/documentos-filtros-utils'

const ROTULOS_ABAS: Record<TipoAbaDocumento, string> = {
  alvaras: 'Alvarás',
  contratos: 'Contratos',
  locacoes: 'Locações',
  atas: 'Atas',
  juridicos: 'Jurídicos',
}

export function DocumentosPage() {
  // Leitura inicial de Query Params
  const getParam = (key: string) => {
    if (typeof window === 'undefined') return null
    const url = new URL(window.location.href)
    return url.searchParams.get(key)
  }

  const abaInicial = (getParam('aba') as TipoAbaDocumento) || 'alvaras'
  const buscaInicial = getParam('q') || ''
  const statusInicial = (getParam('status') as FiltrosDocumentosState['statusFiltro']) || 'todos'
  const empresaInicial = getParam('empresa') || ''
  const validadeInicial = (getParam('validade') as FiltrosDocumentosState['validade']) || 'qualquer'

  // Estados principais
  const [abaAtiva, setAbaAtiva] = useState<TipoAbaDocumento>(abaInicial)
  const [filtros, setFiltros] = useState<FiltrosDocumentosState>({
    busca: buscaInicial,
    statusFiltro: statusInicial,
    empresa: empresaInicial,
    validade: validadeInicial,
  })

  // Sincronizar estados com Query Params na URL
  const atualizarUrl = useCallback(
    (novaAba: TipoAbaDocumento, novosFiltros: FiltrosDocumentosState) => {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      if (novaAba !== 'alvaras') url.searchParams.set('aba', novaAba)
      else url.searchParams.delete('aba')

      if (novosFiltros.busca.trim()) url.searchParams.set('q', novosFiltros.busca.trim())
      else url.searchParams.delete('q')

      if (novosFiltros.statusFiltro !== 'todos')
        url.searchParams.set('status', novosFiltros.statusFiltro)
      else url.searchParams.delete('status')

      if (novosFiltros.empresa) url.searchParams.set('empresa', novosFiltros.empresa)
      else url.searchParams.delete('empresa')

      if (novosFiltros.validade !== 'qualquer')
        url.searchParams.set('validade', novosFiltros.validade)
      else url.searchParams.delete('validade')

      window.history.replaceState({}, '', url.toString())
    },
    [],
  )

  const handleMudarAba = (nova: TipoAbaDocumento) => {
    setAbaAtiva(nova)
    atualizarUrl(nova, filtros)
  }

  const handleFiltrosChange = (novos: Partial<FiltrosDocumentosState>) => {
    setFiltros((prev) => {
      const atualizados = { ...prev, ...novos }
      atualizarUrl(abaAtiva, atualizados)
      return atualizados
    })
  }

  const handleLimparFiltros = () => {
    const limpos: FiltrosDocumentosState = {
      busca: '',
      statusFiltro: 'todos',
      empresa: '',
      validade: 'qualquer',
    }
    setFiltros(limpos)
    atualizarUrl(abaAtiva, limpos)
  }

  // Dados carregados do PocketBase
  const [alvaras, setAlvaras] = useState<any[]>([])
  const [contratos, setContratos] = useState<any[]>([])
  const [locacoes, setLocacoes] = useState<any[]>([])
  const [atas, setAtas] = useState<any[]>([])
  const [juridicos, setJuridicos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([])
  const [carregando, setCarregando] = useState(false)

  // Documento selecionado para tela inteira dedicada de detalhe (especialmente Alvará padrão de referência)
  const [docDetalheDedicado, setDocDetalheDedicado] = useState<any | null>(null)

  // Modais auxiliares
  const [modalAnexoAberto, setModalAnexoAberto] = useState(false)
  const [docAnexoSelecionado, setDocAnexoSelecionado] = useState<{
    id: string
    colecao: string
    titulo: string
    anexoNome?: string
  } | null>(null)

  const [modalDetalheModalAberto, setModalDetalheModalAberto] = useState(false)
  const [docDetalheModal, setDocDetalheModal] = useState<any | null>(null)

  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalImportJuridicosAberto, setModalImportJuridicosAberto] = useState(false)
  const [modalAudienciasAberto, setModalAudienciasAberto] = useState(false)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [processoHistoricoSelecionado, setProcessoHistoricoSelecionado] = useState<any>(null)

  // Paginação e Seleção em Lote
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina] = useState(10)
  const [idsSelecionados, setIdsSelecionados] = useState<string[]>([])

  // Modal seguro de exclusão (exige digitação do número/título)
  const [docParaExcluir, setDocParaExcluir] = useState<{
    item: any
    colecao: string
    numeroEsperado: string
  } | null>(null)
  const [textoConfirmacaoExclusao, setTextoConfirmacaoExclusao] = useState('')
  const [excluindoDoc, setExcluindoDoc] = useState(false)

  // Ações de seleção em lote e exportação da aba
  const handleToggleSelecionarId = (id: string) => {
    setIdsSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleToggleSelecionarTodos = () => {
    if (idsSelecionados.length === dadosFiltrados.length) {
      setIdsSelecionados([])
    } else {
      setIdsSelecionados(dadosFiltrados.map((d) => d.id))
    }
  }

  const handleExportarAba = () => {
    try {
      const colunasConfig = CONFIG_COLUNAS_POR_TIPO[abaAtiva] || []
      const titulos = colunasConfig.map((c) => c.label).join(';')
      const linhas = dadosFiltrados.map((item) =>
        colunasConfig
          .map((c) => {
            const val = (item as any)[c.id] ?? (item as any)[c.id.replace('coluna_', '')] ?? ''
            return `"${String(val).replace(/"/g, '""')}"`
          })
          .join(';'),
      )
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [titulos, ...linhas].join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute(
        'download',
        `documentos_${abaAtiva}_${new Date().toISOString().slice(0, 10)}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast({
        title: 'Exportação concluída',
        description: `Arquivo CSV da aba ${ROTULOS_ABAS[abaAtiva]} baixado com sucesso.`,
      })
    } catch {
      toast({
        title: 'Erro na exportação',
        description: 'Não foi possível gerar a planilha no momento.',
        variant: 'destructive',
      })
    }
  }

  // Carrega lista de empresas
  useEffect(() => {
    async function carregarEmpresas() {
      try {
        const res = await pb.collection('empresas').getFullList({ sort: 'nome' })
        if (res && res.length > 0) {
          setEmpresas(res.map((r: any) => ({ id: r.id, nome: r.nome })))
        } else {
          setEmpresas([
            { id: '1', nome: 'FoldBox' },
            { id: '2', nome: 'Extrafruti' },
            { id: '3', nome: 'Casafruti' },
          ])
        }
      } catch (_) {
        setEmpresas([
          { id: '1', nome: 'FoldBox' },
          { id: '2', nome: 'Extrafruti' },
          { id: '3', nome: 'Casafruti' },
        ])
      }
    }
    carregarEmpresas()
  }, [])

  // Carrega dados de todas as coleções ou da aba ativa
  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const [resAlv, resCont, resLoc, resAtas, resJur] = await Promise.all([
        pb.collection('alvaras').getFullList({ sort: '-created' }),
        pb.collection('contratos').getFullList({
          filter: "tipo != 'locacao'",
          sort: '-created',
        }),
        pb.collection('contratos').getFullList({
          filter: "tipo = 'locacao'",
          sort: '-created',
        }),
        pb.collection('atas').getFullList({ sort: '-data' }),
        pb.collection('processos_juridicos').getFullList({ sort: '-created' }),
      ])

      setAlvaras(resAlv || [])
      setContratos(resCont || [])
      setLocacoes(resLoc || [])
      setAtas(resAtas || [])
      setJuridicos(resJur || [])

      // Atualiza o documento aberto no detalhe caso esteja visualizando
      if (docDetalheDedicado) {
        const achado = (resAlv || []).find((d) => d.id === docDetalheDedicado.id)
        if (achado) setDocDetalheDedicado(achado)
      }
    } catch (err) {
      console.error('Erro ao carregar documentos:', err)
    } finally {
      setCarregando(false)
    }
  }, [docDetalheDedicado])

  useEffect(() => {
    carregarDados()
  }, [])

  // Coleção PocketBase da aba
  const obterColecaoPorAba = (aba: TipoAbaDocumento): string => {
    switch (aba) {
      case 'alvaras':
        return 'alvaras'
      case 'atas':
        return 'atas'
      case 'juridicos':
        return 'processos_juridicos'
      default:
        return 'contratos'
    }
  }

  // Lista pura da aba ativa
  const dadosAbaPura = useMemo(() => {
    switch (abaAtiva) {
      case 'alvaras':
        return alvaras
      case 'contratos':
        return contratos
      case 'locacoes':
        return locacoes
      case 'atas':
        return atas
      case 'juridicos':
        return juridicos
      default:
        return []
    }
  }, [abaAtiva, alvaras, contratos, locacoes, atas, juridicos])

  // Filtragem dos dados da aba ativa
  const dadosFiltrados = useMemo(() => {
    const qNorm = normalizarParaBusca(filtros.busca)
    const empNorm = normalizarParaBusca(filtros.empresa)

    return dadosAbaPura.filter((item) => {
      // 1. Filtro de Empresa
      if (empNorm) {
        const itemEmp = normalizarParaBusca(item.empresa || item.cliente_principal || '')
        if (!itemEmp.includes(empNorm)) return false
      }

      // 2. Filtro de Busca de texto ampla
      if (qNorm) {
        const camposTexto = [
          item.numero,
          item.numero_processo,
          item.titulo,
          item.tipo,
          item.orgao_emissor,
          item.municipio,
          item.contraparte,
          item.locador,
          item.imovel,
          item.empresa,
          item.cliente_principal,
        ]
          .filter(Boolean)
          .join(' ')
        const textoNorm = normalizarParaBusca(camposTexto)
        if (!textoNorm.includes(qNorm)) return false
      }

      // 3. Filtro por status
      if (filtros.statusFiltro !== 'todos') {
        const st = String(item.status || '').toLowerCase()
        if (filtros.statusFiltro === 'regulares') {
          if (st.includes('venc') || st.includes('susp') || st.includes('encerr')) return false
        } else if (filtros.statusFiltro === 'vencendo') {
          if (!st.includes('vencendo')) {
            // checar data de validade se houver
            if (item.validade) {
              const diffDias = Math.ceil(
                (new Date(item.validade).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              )
              if (diffDias < 0 || diffDias > 90) return false
            } else {
              return false
            }
          }
        } else if (filtros.statusFiltro === 'vencidos') {
          if (!st.includes('vencid')) {
            if (item.validade) {
              const diffDias = Math.ceil(
                (new Date(item.validade).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              )
              if (diffDias >= 0) return false
            } else {
              return false
            }
          }
        }
      }

      // 4. Filtro por Validade
      if (filtros.validade !== 'qualquer' && item.validade) {
        const diffDias = Math.ceil(
          (new Date(item.validade).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
        if (filtros.validade === '30' && (diffDias < 0 || diffDias > 30)) return false
        if (filtros.validade === '90' && (diffDias < 0 || diffDias > 90)) return false
        if (filtros.validade === 'vencidos' && diffDias >= 0) return false
      }

      return true
    })
  }, [dadosAbaPura, filtros])

  // Abertura do Detalhe (Primária: Botão "Abrir")
  const handleAbrirDetalhe = (item: any) => {
    // Todas as 5 abas agora têm telas de detalhe dedicadas profissionais
    if (
      abaAtiva === 'alvaras' ||
      abaAtiva === 'contratos' ||
      abaAtiva === 'locacoes' ||
      abaAtiva === 'atas' ||
      abaAtiva === 'juridicos'
    ) {
      setDocDetalheDedicado(item)
    } else {
      setDocDetalheModal(item)
      setModalDetalheModalAberto(true)
    }
  }

  // Abertura de Anexos
  const handleAbrirAnexos = (item: any) => {
    const colecao = obterColecaoPorAba(abaAtiva)
    const tit = item.titulo || item.tipo || item.numero || 'Documento'
    setDocAnexoSelecionado({
      id: item.id,
      colecao,
      titulo: tit,
      anexoNome: item.anexo || item.arquivo,
    })
    setModalAnexoAberto(true)
  }

  // Abertura de Edição
  const handleEditar = (item: any) => {
    setDocDetalheModal(item)
    setModalDetalheModalAberto(true)
  }

  // Abertura do Histórico
  const handleVerHistorico = (item: any) => {
    setProcessoHistoricoSelecionado(item)
    setModalHistoricoAberto(true)
  }

  // Iniciar Exclusão Segura
  const handleSolicitarExclusao = (item: any) => {
    const num = item.numero || item.numero_processo || item.titulo || item.id
    setDocParaExcluir({
      item,
      colecao: obterColecaoPorAba(abaAtiva),
      numeroEsperado: String(num).trim(),
    })
    setTextoConfirmacaoExclusao('')
  }

  // Confirmar Exclusão com Digitação Obrigatória
  const handleConfirmarExclusao = async () => {
    if (!docParaExcluir) return
    if (textoConfirmacaoExclusao.trim() !== docParaExcluir.numeroEsperado) {
      toast({
        title: 'Número incorreto',
        description: 'Digite exatamente o número do documento para confirmar a exclusão.',
        variant: 'destructive',
      })
      return
    }

    setExcluindoDoc(true)
    try {
      await pb.collection(docParaExcluir.colecao).delete(docParaExcluir.item.id)
      toast({
        title: 'Documento excluído',
        description: 'O documento foi removido do sistema.',
      })
      if (docDetalheDedicado && docDetalheDedicado.id === docParaExcluir.item.id) {
        setDocDetalheDedicado(null)
      }
      setDocParaExcluir(null)
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Não foi possível excluir o documento.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoDoc(false)
    }
  }

  // Se o usuário estiver na tela de Detalhe Dedicada (Alvarás, Contratos, Locações, Atas ou Jurídicos)
  if (docDetalheDedicado) {
    return (
      <div className="w-full">
        {abaAtiva === 'atas' && (
          <DetalheAtaView
            documentoId={docDetalheDedicado.id}
            registroInicial={docDetalheDedicado}
            onVoltar={() => setDocDetalheDedicado(null)}
            onSalvo={carregarDados}
            onAbrirAnexoModal={(d) => handleAbrirAnexos(d)}
          />
        )}

        {abaAtiva === 'juridicos' && (
          <DetalheJuridicoView
            documentoId={docDetalheDedicado.id}
            registroInicial={docDetalheDedicado}
            onVoltar={() => setDocDetalheDedicado(null)}
            onSalvo={carregarDados}
            onAbrirAnexoModal={(d) => handleAbrirAnexos(d)}
          />
        )}

        {abaAtiva === 'alvaras' && (
          <div className="p-6 max-w-7xl mx-auto">
            <DetalheAlvaraView
              documento={docDetalheDedicado}
              onVoltar={() => setDocDetalheDedicado(null)}
              onEditar={() => {
                setDocDetalheModal(docDetalheDedicado)
                setModalDetalheModalAberto(true)
              }}
              onAtualizar={carregarDados}
              onVisualizarAnexo={(_nomeArquivo) => {
                handleAbrirAnexos(docDetalheDedicado)
              }}
            />
          </div>
        )}

        {abaAtiva === 'contratos' && (
          <div className="p-6 max-w-7xl mx-auto">
            <DetalheContratoView
              documento={docDetalheDedicado}
              onVoltar={() => setDocDetalheDedicado(null)}
              onEditar={() => {
                setDocDetalheModal(docDetalheDedicado)
                setModalDetalheModalAberto(true)
              }}
              onAtualizar={carregarDados}
              onVisualizarAnexo={(_nomeArquivo) => {
                handleAbrirAnexos(docDetalheDedicado)
              }}
              onAnexarArquivo={() => {
                handleAbrirAnexos(docDetalheDedicado)
              }}
            />
          </div>
        )}

        {abaAtiva === 'locacoes' && (
          <div className="p-6 max-w-7xl mx-auto">
            <DetalheLocacaoView
              documento={docDetalheDedicado}
              onVoltar={() => setDocDetalheDedicado(null)}
              onEditar={() => {
                setDocDetalheModal(docDetalheDedicado)
                setModalDetalheModalAberto(true)
              }}
              onAtualizar={carregarDados}
              onVisualizarAnexo={(_nomeArquivo) => {
                handleAbrirAnexos(docDetalheDedicado)
              }}
              onAnexarArquivo={() => {
                handleAbrirAnexos(docDetalheDedicado)
              }}
            />
          </div>
        )}

        {/* Modal de Detalhe Edição */}
        {modalDetalheModalAberto && docDetalheModal && (
          <DocumentoDetalheModal
            aberto={modalDetalheModalAberto}
            onOpenChange={setModalDetalheModalAberto}
            tipoAba={abaAtiva}
            documento={docDetalheModal}
            empresas={empresas}
            onAtualizado={() => {
              carregarDados()
            }}
            onAbrirAnexos={(doc) => handleAbrirAnexos(doc)}
          />
        )}

        {/* Modal de Anexos */}
        {modalAnexoAberto && docAnexoSelecionado && (
          <DocumentoAnexoModal
            aberto={modalAnexoAberto}
            onOpenChange={setModalAnexoAberto}
            collectionName={docAnexoSelecionado.colecao as any}
            recordId={docAnexoSelecionado.id}
            tituloDocumento={docAnexoSelecionado.titulo}
            anexoAtual={docAnexoSelecionado.anexoNome}
            onAnexoAtualizado={() => {
              carregarDados()
            }}
          />
        )}
      </div>
    )
  }

  // Lista de empresas cadastradas para o dropdown de filtros
  const empresasListaNomes = ['FoldBox', 'Extrafruti', 'Casafruti']

  return (
    <div className="p-6 max-w-[1700px] mx-auto space-y-6">
      {/* 1. CABEÇALHO DA TELA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Documentos</h1>
            <Badge
              variant="outline"
              className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border-emerald-200"
            >
              Gestão Corporativa
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Governança documental com análise inteligente e rastreabilidade completa.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {abaAtiva === 'juridicos' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalImportJuridicosAberto(true)}
                className="h-9 px-3.5 text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50 rounded-full"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
                Importar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalAudienciasAberto(true)}
                className="h-9 px-3.5 text-xs font-semibold text-blue-800 border-blue-300 hover:bg-blue-50 rounded-full"
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-blue-700" />
                Audiências
              </Button>
            </>
          )}

          <Button
            type="button"
            onClick={() => setModalNovoAberto(true)}
            className="h-9 px-4 text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white rounded-full shadow-xs gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Novo Documento
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={carregarDados}
            title="Atualizar dados"
            className="h-9 w-9 rounded-full text-gray-500 hover:text-gray-800"
            aria-label="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 2. ABAS COM RÓTULO EM NEGRITO, UNDERLINE 3PX E BADGE CIRCULAR */}
      <div className="border-b border-gray-200/90 flex items-center gap-6 overflow-x-auto no-scrollbar pt-1">
        {(['alvaras', 'contratos', 'locacoes', 'atas', 'juridicos'] as TipoAbaDocumento[]).map(
          (chave) => {
            const ativa = abaAtiva === chave
            const icone =
              chave === 'alvaras' ? (
                <Shield className="h-4 w-4" />
              ) : chave === 'contratos' ? (
                <Briefcase className="h-4 w-4" />
              ) : chave === 'locacoes' ? (
                <Building2 className="h-4 w-4" />
              ) : chave === 'atas' ? (
                <FileCheck className="h-4 w-4" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )

            const total =
              chave === 'alvaras'
                ? alvaras.length
                : chave === 'contratos'
                  ? contratos.length
                  : chave === 'locacoes'
                    ? locacoes.length
                    : chave === 'atas'
                      ? atas.length
                      : juridicos.length

            return (
              <button
                key={chave}
                type="button"
                onClick={() => handleMudarAba(chave)}
                className={`pb-3 inline-flex items-center gap-2 text-sm transition-all relative shrink-0 ${
                  ativa
                    ? 'font-bold text-gray-900 border-b-3 border-emerald-800 -mb-[1px]'
                    : 'font-medium text-gray-600 hover:text-gray-900 border-b-3 border-transparent'
                }`}
              >
                <span className={ativa ? 'text-emerald-800' : 'text-gray-400'}>{icone}</span>
                <span>{ROTULOS_ABAS[chave]}</span>

                {/* Badge Circular com contagem real */}
                <span
                  className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-bold ${
                    ativa ? 'bg-emerald-800 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {total}
                </span>
              </button>
            )
          },
        )}
      </div>

      {/* 3. FAIXA CONTEXTUAL SOB AS ABAS */}
      <DocumentosFaixaContextual
        labelTipo={ROTULOS_ABAS[abaAtiva]}
        onPersonalizarColunas={() => {
          toast({
            title: 'Personalização de colunas',
            description: `Você pode arrastar e reordenar as colunas da aba ${ROTULOS_ABAS[abaAtiva]} pelo cabeçalho.`,
          })
        }}
      />

      {/* 4. FILTROS EM UMA LINHA */}
      <DocumentosFiltrosBar
        filtros={filtros}
        onFiltrosChange={handleFiltrosChange}
        onLimparFiltros={handleLimparFiltros}
        empresasDisponiveis={empresasListaNomes}
      />

      {/* 5. ÁREA PRINCIPAL: TABELA COM COLUNAS DINÂMICAS + RESUMO LATERAL DA ABA */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* TABELA PRINCIPAL (9 ou 12 colunas) */}
        <div className="xl:col-span-9 space-y-4">
          {dadosFiltrados.length === 0 && !carregando ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-3">
                <FileText className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Nenhum documento encontrado em {ROTULOS_ABAS[abaAtiva]}
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-5">
                Não foram encontrados registros para os filtros selecionados ou a aba ainda não
                possui cadastros.
              </p>
              <Button
                type="button"
                onClick={() => setModalNovoAberto(true)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-full text-xs font-semibold px-5 h-9"
              >
                Criar primeiro {ROTULOS_ABAS[abaAtiva].toLowerCase().replace(/s$/, '')}
              </Button>
            </div>
          ) : (
            <DocumentosTabelaGenerica
              dados={dadosFiltrados}
              colunas={CONFIG_COLUNAS_POR_TIPO[abaAtiva]}
              totalRegistros={dadosFiltrados.length}
              loading={carregando}
              paginaAtual={paginaAtual}
              porPagina={itensPorPagina}
              onPaginaChange={(p) => setPaginaAtual(p)}
              onAbrirDetalhe={handleAbrirDetalhe}
              onEditar={handleEditar}
              onAnexar={handleAbrirAnexos}
              onVerHistorico={handleVerHistorico}
              onVerNoChat={(item) =>
                toast({
                  title: 'Chat',
                  description: `Chat para o documento ${item.numero || item.titulo}`,
                })
              }
              onExcluirSeguro={handleSolicitarExclusao}
              selectedIds={idsSelecionados}
              onToggleSelect={handleToggleSelecionarId}
              onSelectAll={handleToggleSelecionarTodos}
            />
          )}
        </div>

        {/* PAINEL LATERAL "RESUMO DA ABA" */}
        <div className="xl:col-span-3">
          <DocumentosResumoLateral
            tipoAba={abaAtiva}
            dados={dadosAbaPura}
            totalGeral={dadosAbaPura.length}
            onAbrirDocumento={handleAbrirDetalhe}
            onExportar={handleExportarAba}
          />
        </div>
      </div>

      {/* 6. MODAL SEGURO DE EXCLUSÃO (Exige digitação do número do documento) */}
      <Dialog
        open={!!docParaExcluir}
        onOpenChange={(aberto) => {
          if (!aberto && !excluindoDoc) {
            setDocParaExcluir(null)
            setTextoConfirmacaoExclusao('')
          }
        }}
      >
        <DialogContent className="bg-white max-w-md rounded-2xl shadow-xl border border-gray-200">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 mb-2">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base font-bold text-gray-900">
              Confirmar exclusão de documento
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600 pt-1 space-y-2">
              <p>
                Esta ação é irreversível. Para confirmar que deseja remover permanentemente este
                documento e seus anexos, digite o número{' '}
                <strong className="font-mono text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                  {docParaExcluir?.numeroEsperado}
                </strong>{' '}
                abaixo:
              </p>
              <Input
                value={textoConfirmacaoExclusao}
                onChange={(e) => setTextoConfirmacaoExclusao(e.target.value)}
                placeholder={`Digite ${docParaExcluir?.numeroEsperado || ''}`}
                className="mt-3 text-xs h-9 rounded-lg"
                autoFocus
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={excluindoDoc}
              onClick={() => {
                setDocParaExcluir(null)
                setTextoConfirmacaoExclusao('')
              }}
              className="text-xs h-9 rounded-full"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                excluindoDoc || textoConfirmacaoExclusao.trim() !== docParaExcluir?.numeroEsperado
              }
              onClick={handleConfirmarExclusao}
              className="text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white rounded-full font-semibold gap-1.5"
            >
              {excluindoDoc ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. MODAL DE DETALHE COMPLETO / EDIÇÃO */}
      {modalDetalheModalAberto && docDetalheModal && (
        <DocumentoDetalheModal
          aberto={modalDetalheModalAberto}
          onOpenChange={setModalDetalheModalAberto}
          tipoAba={abaAtiva}
          documento={docDetalheModal}
          empresas={empresas}
          onAtualizado={() => {
            carregarDados()
          }}
          onAbrirAnexos={(doc) => handleAbrirAnexos(doc)}
        />
      )}

      {/* 8. MODAL DE GESTÃO DE ANEXOS */}
      {modalAnexoAberto && docAnexoSelecionado && (
        <DocumentoAnexoModal
          aberto={modalAnexoAberto}
          onOpenChange={setModalAnexoAberto}
          collectionName={docAnexoSelecionado.colecao as any}
          recordId={docAnexoSelecionado.id}
          tituloDocumento={docAnexoSelecionado.titulo}
          anexoAtual={docAnexoSelecionado.anexoNome}
          onAnexoAtualizado={() => {
            carregarDados()
          }}
        />
      )}

      {/* 9. MODAL NOVO DOCUMENTO */}
      <NovoDocumentoModal
        aberto={modalNovoAberto}
        onOpenChange={setModalNovoAberto}
        tipoAba={abaAtiva}
        empresas={empresas}
        empresaPreSelecionada={filtros.empresa || undefined}
        onCriadoSucesso={carregarDados}
      />

      {/* 10. MODAIS JURÍDICOS (IMPORTAÇÃO, AUDIÊNCIAS E HISTÓRICO) */}
      <JuridicosImportModal
        aberto={modalImportJuridicosAberto}
        onOpenChange={setModalImportJuridicosAberto}
        onImportadoSucesso={carregarDados}
      />

      <AudienciasModal
        aberto={modalAudienciasAberto}
        onOpenChange={setModalAudienciasAberto}
        onAudienciasAlteradas={carregarDados}
      />

      <ProcessoHistoricoModal
        aberto={modalHistoricoAberto}
        onOpenChange={setModalHistoricoAberto}
        processoId={processoHistoricoSelecionado?.id || null}
        numeroProcesso={
          processoHistoricoSelecionado?.numero_cnj ||
          processoHistoricoSelecionado?.numero_processo ||
          processoHistoricoSelecionado?.numero ||
          ''
        }
        tituloProcesso={processoHistoricoSelecionado?.titulo}
      />
    </div>
  )
}

export default DocumentosPage
