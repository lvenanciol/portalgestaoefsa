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
  Handshake,
  ShieldCheck,
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
import { DocumentosIndicadores } from '@/components/documentos/DocumentosIndicadores'
import { DetalheAlvaraView } from '@/components/documentos/DetalheAlvaraView'
import { DetalheContratoView } from '@/components/documentos/DetalheContratoView'
import { DetalheLocacaoView } from '@/components/documentos/DetalheLocacaoView'
import { DetalheAtaView } from '@/components/documentos/DetalheAtaView'
import { DetalheConvencaoView } from '@/components/documentos/DetalheConvencaoView'
import { DetalheSeguroView } from '@/components/documentos/DetalheSeguroView'
import { DetalheJuridicoView } from '@/components/documentos/DetalheJuridicoView'

import { DocumentoDetalheModal } from '@/components/documentos/DocumentoDetalheModal'
import { JuridicosImportModal } from '@/components/documentos/JuridicosImportModal'
import { ProcessoHistoricoModal } from '@/components/documentos/ProcessoHistoricoModal'
import { AudienciasModal } from '@/components/documentos/AudienciasModal'
import { NovoDocumentoModal } from '@/components/documentos/NovoDocumentoModal'
import {
  normalizarParaBusca,
  normalizarDigitosParaBusca,
} from '@/components/documentos/documentos-filtros-utils'

const ROTULOS_ABAS: Record<TipoAbaDocumento, string> = {
  alvaras: 'Alvarás',
  contratos: 'Contratos',
  locacoes: 'Locações',
  atas: 'Atas',
  convencoes: 'Convenções',
  seguros: 'Seguros',
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
  const [convencoes, setConvencoes] = useState<any[]>([])
  const [seguros, setSeguros] = useState<any[]>([])
  const [juridicos, setJuridicos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([])
  const [carregando, setCarregando] = useState(false)

  // Documento selecionado para tela inteira dedicada de detalhe (especialmente Alvará padrão de referência)
  const [docDetalheDedicado, setDocDetalheDedicado] = useState<any | null>(null)

  // Modais auxiliares
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
    // CAUSA-RAIZ DOS "REGISTROS SUMIDOS" (11/11/2026):
    // era `Promise.all` — se UMA coleção falhasse (ex.: `convencoes` ainda não
    // existia no PocketBase após a criação da aba), a Promise.all REJEITAVA e
    // nenhum dos setState rodava. Resultado: TODAS as abas apareciam vazias, não
    // só a nova. Com `allSettled`, cada coleção carrega de forma independente e
    // a que falhar não derruba as outras.
    const seguro = async <T,>(p: Promise<T>, rotulo: string): Promise<T[]> => {
      try {
        const r = await p
        return Array.isArray(r) ? r : []
      } catch (e: any) {
        console.error(`[Documentos] Falha ao carregar '${rotulo}':`, e?.message || e)
        return []
      }
    }

    const [resAlv, resCont, resLoc, resAtas, resConv, resSeg, resJur] = await Promise.all([
      seguro(pb.collection('alvaras').getFullList({ sort: '-created' }), 'alvaras'),
      // CAUSA-RAIZ DOS "REGISTROS ANTIGOS SUMIDOS" (11/11/2026):
      // no PocketBase `campo != 'valor'` NÃO casa registros com o campo vazio/nulo.
      // Os contratos antigos foram gravados sem `tipo`, então sumiam da aba
      // Contratos E da aba Locações (nenhum dos dois filtros os pegava).
      // Agora: contratos = tudo que não é locação OU está sem tipo;
      // locações = tipo locacao (ou legado com 'locação' acentuado).
      seguro(
        pb.collection('contratos').getFullList({
          filter: "(tipo != 'locacao' && tipo != 'locação') || tipo = ''",
          sort: '-created',
        }),
        'contratos',
      ),
      seguro(
        pb.collection('contratos').getFullList({
          filter: "tipo = 'locacao' || tipo = 'locação'",
          sort: '-created',
        }),
        'locacoes',
      ),
      seguro(pb.collection('atas').getFullList({ sort: '-data' }), 'atas'),
      seguro(pb.collection('convencoes').getFullList({ sort: '-created' }), 'convencoes'),
      seguro(pb.collection('seguros').getFullList({ sort: '-created' }), 'seguros'),
      seguro(
        pb.collection('processos_juridicos').getFullList({ sort: '-created' }),
        'processos_juridicos',
      ),
    ])

    try {
      setAlvaras(resAlv)
      setContratos(resCont)
      setLocacoes(resLoc)
      setAtas(resAtas)
      setConvencoes(resConv)
      setSeguros(resSeg)
      setJuridicos(resJur)

      // Atualiza o documento aberto no detalhe caso esteja visualizando
      if (docDetalheDedicado) {
        const achado = resAlv.find((d) => d.id === docDetalheDedicado.id)
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
      case 'convencoes':
        return 'convencoes'
      case 'seguros':
        return 'seguros'
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
      case 'convencoes':
        return convencoes
      case 'seguros':
        return seguros
      case 'juridicos':
        return juridicos
      default:
        return []
    }
  }, [abaAtiva, alvaras, contratos, locacoes, atas, convencoes, seguros, juridicos])

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
          item.numero_cnj,
          item.processo_codigo,
          item.numeros_alternativos,
          item.titulo,
          item.tipo,
          item.acao,
          item.natureza,
          item.status,
          item.orgao,
          item.orgao_tribunal,
          item.vara_comarca,
          item.orgao_emissor,
          item.municipio,
          item.contraparte,
          item.locador,
          item.imovel,
          item.sindicato,
          item.data_base,
          item.percentual_reajuste,
          item.empresa,
          item.cliente_principal,
          item.contrario_principal,
          item.autor,
          item.reu,
          item.advogado,
          item.responsavel_principal,
          Array.isArray(item.responsaveis_lista)
            ? item.responsaveis_lista.join(' ')
            : item.responsaveis_lista,
          item.polo,
          item.risco,
          item.probabilidade,
          item.assunto_tipo,
          item.fase_instancia,
          item.proximo_prazo_descricao,
          item.observacoes,
          item.andamentos_futuros,
          // Valores formatados e numéricos para busca por cifra
          item.valor_causa !== undefined ? `R$ ${item.valor_causa} ${item.valor_causa}` : '',
          item.valor_provisao !== undefined
            ? `R$ ${item.valor_provisao} ${item.valor_provisao}`
            : '',
          item.valor_atualizado !== undefined
            ? `R$ ${item.valor_atualizado} ${item.valor_atualizado}`
            : '',
          item.valor_base !== undefined ? `R$ ${item.valor_base} ${item.valor_base}` : '',
          item.valor !== undefined ? `R$ ${item.valor} ${item.valor}` : '',
        ]
          .filter(Boolean)
          .join(' ')
        const textoNorm = normalizarParaBusca(camposTexto)

        // Verificação padrão de texto normalizado (case/acento-insensitive)
        let encontrou = textoNorm.includes(qNorm)

        // Se a busca contiver números (ex: "0000267"), checa também correspondência de dígitos contíguos
        if (!encontrou) {
          const qDigitos = normalizarDigitosParaBusca(filtros.busca)
          if (qDigitos && qDigitos.length >= 3) {
            const digitosAlvo = normalizarDigitosParaBusca(
              [
                item.numero_cnj,
                item.numero_processo,
                item.processo_codigo,
                item.numero,
                item.numeros_alternativos,
              ]
                .filter(Boolean)
                .join(' '),
            )
            if (digitosAlvo.includes(qDigitos)) {
              encontrou = true
            }
          }
        }

        if (!encontrou) return false
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

  // Abertura do Detalhe (Primária: Botão "Abrir" / Clique na linha)
  // Requisito: ao clicar na linha de qualquer registro das abas alvará, locações, contratos, atas e jurídicos
  // abre a tela de detalhe DEDICADA do mockup (view especializada por tipo) — nunca o formulário cru.
  const handleAbrirDetalhe = (item: any) => {
    setDocDetalheDedicado(item)
  }

  // Abertura de Edição
  // A edição acontece no modal genérico por cima da view dedicada (não troca a tela de fundo).
  const handleEditar = (item: any) => {
    setDocDetalheModal(item)
    setModalDetalheModalAberto(true)
  }

  // Abertura de Anexos (redireciona para o modal de detalhe com a seção de anexos)
  const handleAbrirAnexos = (item: any) => {
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

        {abaAtiva === 'convencoes' && (
          <DetalheConvencaoView
            documentoId={docDetalheDedicado.id}
            registroInicial={docDetalheDedicado}
            onVoltar={() => setDocDetalheDedicado(null)}
            onSalvo={carregarDados}
            onAbrirAnexoModal={(d) => handleAbrirAnexos(d)}
          />
        )}

        {abaAtiva === 'seguros' && (
          <DetalheSeguroView
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
      </div>
    )
  }

  // Lista de empresas cadastradas para o dropdown de filtros (LL5 incluída conforme especificação)
  const empresasListaNomes = ['FoldBox', 'Extrafruti', 'Casafruti', 'LL5']

  return (
    <div className="p-6 max-w-[1700px] mx-auto space-y-6 w-full min-w-0">
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
      {/* LARGURA DAS ABAS (11/11/2026): com 7 abas o rótulo "Convenções" era cortado.
          `no-scrollbar` escondia a barra de rolagem, então não havia como ver o resto —
          a aba parecia truncada. Agora a barra ROLA de verdade (scrollbar fina visível),
          os rótulos não quebram linha e há folga lateral para não encostar na borda. */}
      <div className="border-b border-gray-200/90 flex flex-wrap items-center gap-x-4 gap-y-1 pb-0 pt-1 px-1">
        {(
          [
            'alvaras',
            'contratos',
            'locacoes',
            'atas',
            'convencoes',
            'seguros',
            'juridicos',
          ] as TipoAbaDocumento[]
        ).map((chave) => {
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
            ) : chave === 'convencoes' ? (
              <Handshake className="h-4 w-4" />
            ) : chave === 'seguros' ? (
              <ShieldCheck className="h-4 w-4" />
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
                    : chave === 'convencoes'
                      ? convencoes.length
                      : chave === 'seguros'
                        ? seguros.length
                        : juridicos.length

          return (
            <button
              key={chave}
              type="button"
              onClick={() => handleMudarAba(chave)}
              className={`pb-3 inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap transition-all relative shrink-0 px-0.5 ${
                ativa
                  ? 'font-bold text-gray-900 border-b-3 border-emerald-800 -mb-[1px]'
                  : 'font-medium text-gray-600 hover:text-gray-900 border-b-3 border-transparent'
              }`}
              title={ROTULOS_ABAS[chave]}
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
        })}
      </div>

      {/* 3. LINHA HORIZONTAL DE INDICADORES (Cards sob as abas) */}
      <DocumentosIndicadores
        tipoAba={abaAtiva}
        dados={dadosAbaPura}
        totalGeral={dadosAbaPura.length}
        filtroAtivo={filtros.statusFiltro}
        onSelecionarFiltro={(alvo) => handleFiltrosChange({ statusFiltro: alvo })}
        onAbrirDocumento={handleAbrirDetalhe}
        onExportar={handleExportarAba}
      />

      {/* 4. FAIXA CONTEXTUAL SOB AS ABAS */}
      <DocumentosFaixaContextual
        labelTipo={ROTULOS_ABAS[abaAtiva]}
        onPersonalizarColunas={() => {
          toast({
            title: 'Personalização de colunas',
            description: `Você pode arrastar e reordenar as colunas da aba ${ROTULOS_ABAS[abaAtiva]} pelo cabeçalho.`,
          })
        }}
      />

      {/* 5. FILTROS EM UMA LINHA */}
      <DocumentosFiltrosBar
        filtros={filtros}
        onFiltrosChange={handleFiltrosChange}
        onLimparFiltros={handleLimparFiltros}
        empresasDisponiveis={empresasListaNomes}
      />

      {/* 6. TABELA PRINCIPAL COM LARGURA COMPLETA (SEM PAINEL LATERAL) */}
      <div className="w-full space-y-4">
        {dadosFiltrados.length === 0 && !carregando ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-gray-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              Nenhum documento encontrado em {ROTULOS_ABAS[abaAtiva]}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-5">
              Não foram encontrados registros para os filtros selecionados ou a aba ainda não possui
              cadastros.
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

      {/* 8. MODAL NOVO DOCUMENTO */}
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
