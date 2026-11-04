import React, { useState, useEffect, useMemo } from 'react'
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  Paperclip,
  Download,
  Eye,
  FileSpreadsheet,
  Building2,
  Calendar,
  AlertCircle,
  FileCheck,
  Shield,
  Briefcase,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import pb from '@/lib/pocketbase/client'
import { DocumentosDataTable, ColunaConfig } from '@/components/documentos/DocumentosDataTable'
import { DocumentosEmpresaPopover } from '@/components/documentos/DocumentosEmpresaPopover'
import { DocumentoParecerButton } from '@/components/documentos/DocumentoParecerButton'
import { DocumentoAnexoModal } from '@/components/documentos/DocumentoAnexoModal'
import { JuridicosImportModal } from '@/components/documentos/JuridicosImportModal'
import { NovoDocumentoModal } from '@/components/documentos/NovoDocumentoModal'

type TipoAba = 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'

export function DocumentosPage() {
  const [abaAtiva, setAbaAtiva] = useState<TipoAba>('alvaras')
  const [busca, setBusca] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  // Dados carregados do PocketBase
  const [alvaras, setAlvaras] = useState<any[]>([])
  const [contratos, setContratos] = useState<any[]>([])
  const [locacoes, setLocacoes] = useState<any[]>([])
  const [atas, setAtas] = useState<any[]>([])
  const [juridicos, setJuridicos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([])

  // Modais
  const [modalAnexoAberto, setModalAnexoAberto] = useState(false)
  const [docAnexoSelecionado, setDocAnexoSelecionado] = useState<{
    id: string
    titulo: string
    colecao: string
    anexoNome?: string
  } | null>(null)

  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalImportJuridicosAberto, setModalImportJuridicosAberto] = useState(false)

  // Carrega empresas cadastradas
  useEffect(() => {
    async function carregarEmpresas() {
      try {
        const res = await pb.collection('empresas').getFullList({ sort: 'nome' })
        if (res && res.length > 0) {
          setEmpresas(res.map((r: any) => ({ id: r.id, nome: r.nome })))
        } else {
          setEmpresas([
            { id: '1', nome: 'Extrafruti' },
            { id: '2', nome: 'Casafruti' },
            { id: '3', nome: 'Agrofruti' },
          ])
        }
      } catch (_) {
        setEmpresas([
          { id: '1', nome: 'Extrafruti' },
          { id: '2', nome: 'Casafruti' },
          { id: '3', nome: 'Agrofruti' },
        ])
      }
    }
    carregarEmpresas()
  }, [])

  // Carrega dados da aba ativa
  const carregarDados = async () => {
    setCarregando(true)
    try {
      if (abaAtiva === 'alvaras') {
        const res = await pb.collection('alvaras').getFullList({ sort: '-created' })
        setAlvaras(res)
      } else if (abaAtiva === 'contratos') {
        const res = await pb.collection('contratos').getFullList({
          filter: "tipo != 'locacao'",
          sort: '-created',
        })
        setContratos(res)
      } else if (abaAtiva === 'locacoes') {
        const res = await pb.collection('contratos').getFullList({
          filter: "tipo = 'locacao'",
          sort: '-created',
        })
        setLocacoes(res)
      } else if (abaAtiva === 'atas') {
        const res = await pb.collection('atas').getFullList({ sort: '-data' })
        setAtas(res)
      } else if (abaAtiva === 'juridicos') {
        const res = await pb.collection('processos_juridicos').getFullList({ sort: '-created' })
        setJuridicos(res)
      }
    } catch (err) {
      console.error('Erro ao carregar documentos:', err)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [abaAtiva])

  const abrirModalAnexo = (doc: any, colecao: string, titulo: string) => {
    setDocAnexoSelecionado({
      id: doc.id,
      titulo,
      colecao,
      anexoNome: doc.anexo || doc.arquivo,
    })
    setModalAnexoAberto(true)
  }

  const formatarMoeda = (val: number) => {
    if (!val && val !== 0) return '—'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  }

  const formatarData = (dt: string) => {
    if (!dt) return '—'
    try {
      const d = new Date(dt)
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    } catch (_) {
      return dt
    }
  }

  // --- COLUNAS: ALVARÁS ---
  const colunasAlvaras: ColunaConfig<any>[] = useMemo(
    () => [
      {
        id: 'numero',
        label: 'Nº Alvará',
        sortable: true,
        render: (item) => <span className="font-semibold text-gray-900">{item.numero}</span>,
      },
      { id: 'tipo', label: 'Tipo', sortable: true },
      { id: 'empresa', label: 'Empresa', sortable: true },
      { id: 'orgao_emissor', label: 'Órgão Emissor', sortable: true },
      { id: 'municipio', label: 'Município', sortable: true },
      {
        id: 'validade',
        label: 'Validade',
        sortable: true,
        render: (item) => {
          const dt = formatarData(item.validade)
          const isVencido = item.validade && new Date(item.validade) < new Date()
          return (
            <span className={isVencido ? 'text-rose-600 font-semibold' : 'text-gray-700'}>
              {dt}
            </span>
          )
        },
      },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: (item) => {
          const st = item.status || 'regular'
          const mapa: Record<string, { label: string; classe: string }> = {
            regular: {
              label: 'Regular',
              classe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            },
            vencendo: { label: 'Vencendo', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
            vencido: { label: 'Vencido', classe: 'bg-rose-50 text-rose-700 border-rose-200' },
            em_renovacao: {
              label: 'Em Renovação',
              classe: 'bg-blue-50 text-blue-700 border-blue-200',
            },
          }
          const info = mapa[st] || { label: st, classe: 'bg-gray-100 text-gray-600' }
          return (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${info.classe}`}>
              {info.label}
            </Badge>
          )
        },
      },
      {
        id: 'anexo',
        label: 'Anexo',
        sortable: false,
        render: (item) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => abrirModalAnexo(item, 'alvaras', `Alvará ${item.numero}`)}
            className="h-7 px-2 text-xs text-gray-600 hover:text-emerald-700"
          >
            <Paperclip
              className={`h-3.5 w-3.5 mr-1 ${item.anexo ? 'text-emerald-600' : 'text-gray-400'}`}
            />
            {item.anexo ? 'Ver anexo' : 'Anexar'}
          </Button>
        ),
      },
    ],
    [],
  )

  // --- COLUNAS: CONTRATOS & LOCAÇÕES ---
  const colunasContratosLocacoes: ColunaConfig<any>[] = useMemo(
    () => [
      {
        id: 'titulo',
        label: 'Título / Objeto',
        sortable: true,
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900">{item.titulo}</div>
            {item.objeto && (
              <div className="text-[11px] text-gray-500 truncate max-w-xs">{item.objeto}</div>
            )}
          </div>
        ),
      },
      { id: 'parte', label: 'Contraparte / Locador', sortable: true },
      { id: 'empresa', label: 'Empresa', sortable: true },
      {
        id: 'valor_mensal',
        label: 'Valor',
        sortable: true,
        sortValue: (i) => i.valor_mensal || 0,
        render: (item) => <span className="font-medium">{formatarMoeda(item.valor_mensal)}</span>,
      },
      {
        id: 'vigencia',
        label: 'Vigência',
        sortable: true,
        render: (item) => (
          <div className="text-[11px] text-gray-600">
            {formatarData(item.inicio)} → {formatarData(item.fim)}
          </div>
        ),
      },
      {
        id: 'indexador',
        label: 'Reajuste',
        sortable: true,
        render: (item) => (
          <span className="text-[11px] text-gray-600">{item.indexador || 'IGP-M'}</span>
        ),
      },
      {
        id: 'garantia',
        label: 'Garantia',
        sortable: true,
        render: (item) => (
          <span className="text-[11px] text-gray-600 truncate max-w-[120px] inline-block">
            {item.garantia || '—'}
          </span>
        ),
      },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: (item) => (
          <Badge
            variant="outline"
            className={`text-[10px] px-2 py-0.5 ${
              item.status === 'ativo'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {item.status || 'ativo'}
          </Badge>
        ),
      },
      {
        id: 'anexo',
        label: 'Anexo',
        sortable: false,
        render: (item) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => abrirModalAnexo(item, 'contratos', item.titulo)}
            className="h-7 px-2 text-xs text-gray-600 hover:text-emerald-700"
          >
            <Paperclip
              className={`h-3.5 w-3.5 mr-1 ${item.anexo ? 'text-emerald-600' : 'text-gray-400'}`}
            />
            {item.anexo ? 'Ver anexo' : 'Anexar'}
          </Button>
        ),
      },
    ],
    [],
  )

  // --- COLUNAS: ATAS ---
  const colunasAtas: ColunaConfig<any>[] = useMemo(
    () => [
      {
        id: 'titulo',
        label: 'Título da Ata',
        sortable: true,
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900">{item.titulo}</div>
            {item.pauta && (
              <div className="text-[11px] text-gray-500 truncate max-w-sm">{item.pauta}</div>
            )}
          </div>
        ),
      },
      {
        id: 'tipo_ata',
        label: 'Tipo',
        sortable: true,
        render: (item) => (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            {item.tipo_ata || 'AGE'}
          </Badge>
        ),
      },
      { id: 'empresa', label: 'Empresa', sortable: true },
      {
        id: 'data',
        label: 'Data da Reunião',
        sortable: true,
        render: (item) => formatarData(item.data),
      },
      {
        id: 'mesa_diretora',
        label: 'Mesa Diretora',
        sortable: true,
        render: (item) => (
          <span className="text-[11px] text-gray-600">{item.mesa_diretora || '—'}</span>
        ),
      },
      {
        id: 'deliberacoes',
        label: 'Deliberações',
        sortable: true,
        render: (item) => (
          <span className="text-[11px] text-gray-600 truncate max-w-xs inline-block">
            {item.deliberacoes || '—'}
          </span>
        ),
      },
      {
        id: 'assinatura_eletronica',
        label: 'Assinatura',
        sortable: true,
        render: (item) => (
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            {item.assinatura_eletronica || 'Assinado'}
          </Badge>
        ),
      },
      {
        id: 'anexo',
        label: 'Anexo',
        sortable: false,
        render: (item) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => abrirModalAnexo(item, 'atas', item.titulo)}
            className="h-7 px-2 text-xs text-gray-600 hover:text-emerald-700"
          >
            <Paperclip
              className={`h-3.5 w-3.5 mr-1 ${item.anexo ? 'text-emerald-600' : 'text-gray-400'}`}
            />
            {item.anexo ? 'Ver anexo' : 'Anexar'}
          </Button>
        ),
      },
    ],
    [],
  )

  // --- COLUNAS: JURÍDICOS ---
  const colunasJuridicos: ColunaConfig<any>[] = useMemo(
    () => [
      {
        id: 'numero_processo',
        label: 'Nº do Processo',
        sortable: true,
        render: (item) => (
          <span className="font-semibold text-gray-900">{item.numero_processo}</span>
        ),
      },
      { id: 'vara_comarca', label: 'Vara / Comarca', sortable: true },
      { id: 'autor', label: 'Autor', sortable: true },
      { id: 'reu', label: 'Réu', sortable: true },
      { id: 'empresa', label: 'Empresa', sortable: true },
      { id: 'fase_instancia', label: 'Fase', sortable: true },
      { id: 'assunto_tipo', label: 'Assunto / Tipo', sortable: true },
      {
        id: 'valor_causa',
        label: 'Valor da Causa',
        sortable: true,
        sortValue: (i) => i.valor_causa || 0,
        render: (item) => formatarMoeda(item.valor_causa),
      },
      {
        id: 'risco',
        label: 'Risco',
        sortable: true,
        render: (item) => {
          const mapa: Record<string, { label: string; classe: string }> = {
            provavel: { label: 'Provável', classe: 'bg-rose-50 text-rose-700 border-rose-200' },
            possivel: { label: 'Possível', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
            remoto: {
              label: 'Remoto',
              classe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            },
          }
          const info = mapa[item.risco] || {
            label: item.risco || 'possível',
            classe: 'bg-gray-100 text-gray-600',
          }
          return (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${info.classe}`}>
              {info.label}
            </Badge>
          )
        },
      },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: (item) => (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200"
          >
            {item.status || 'ativo'}
          </Badge>
        ),
      },
      {
        id: 'proxima_audiencia',
        label: 'Próx. Audiência',
        sortable: true,
        render: (item) => formatarData(item.proxima_audiencia),
      },
      {
        id: 'anexo',
        label: 'Anexo',
        sortable: false,
        render: (item) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              abrirModalAnexo(item, 'processos_juridicos', `Processo ${item.numero_processo}`)
            }
            className="h-7 px-2 text-xs text-gray-600 hover:text-emerald-700"
          >
            <Paperclip
              className={`h-3.5 w-3.5 mr-1 ${item.anexo ? 'text-emerald-600' : 'text-gray-400'}`}
            />
            {item.anexo ? 'Ver anexo' : 'Anexar'}
          </Button>
        ),
      },
    ],
    [],
  )

  // Filtragem unificada por busca de texto e empresa selecionada
  const filtrarLista = (lista: any[]) => {
    return lista.filter((item) => {
      if (
        empresaFiltro &&
        item.empresa &&
        !item.empresa.toLowerCase().includes(empresaFiltro.toLowerCase())
      ) {
        return false
      }
      if (!busca.trim()) return true
      const b = busca.toLowerCase()
      const camposConcat = [
        item.numero,
        item.numero_processo,
        item.titulo,
        item.parte,
        item.orgao_emissor,
        item.municipio,
        item.objeto,
        item.empresa,
        item.pauta,
        item.deliberacoes,
        item.autor,
        item.reu,
        item.assunto_tipo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return camposConcat.includes(b)
    })
  }

  const dadosAtuais = useMemo(() => {
    if (abaAtiva === 'alvaras') return filtrarLista(alvaras)
    if (abaAtiva === 'contratos') return filtrarLista(contratos)
    if (abaAtiva === 'locacoes') return filtrarLista(locacoes)
    if (abaAtiva === 'atas') return filtrarLista(atas)
    if (abaAtiva === 'juridicos') return filtrarLista(juridicos)
    return []
  }, [abaAtiva, alvaras, contratos, locacoes, atas, juridicos, busca, empresaFiltro])

  const colunasAtuais = useMemo(() => {
    if (abaAtiva === 'alvaras') return colunasAlvaras
    if (abaAtiva === 'contratos' || abaAtiva === 'locacoes') return colunasContratosLocacoes
    if (abaAtiva === 'atas') return colunasAtas
    if (abaAtiva === 'juridicos') return colunasJuridicos
    return []
  }, [abaAtiva, colunasAlvaras, colunasContratosLocacoes, colunasAtas, colunasJuridicos])

  const getNomeDocumento = (item: any) => {
    return (
      item.titulo ||
      (item.numero ? `Alvará ${item.numero}` : '') ||
      (item.numero_processo ? `Processo ${item.numero_processo}` : 'Documento')
    )
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      {/* Cabeçalho da Tela */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Documentos</h1>
            <Badge
              variant="outline"
              className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border-emerald-200"
            >
              Gestão Corporativa
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gestão organizada de alvarás, contratos, locações, atas societárias e relatórios
            jurídicos com análise inteligente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {abaAtiva === 'juridicos' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalImportJuridicosAberto(true)}
              className="h-8 text-xs font-semibold text-emerald-800 border-emerald-300 hover:bg-emerald-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
              Importar XLSX
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => setModalNovoAberto(true)}
            className="h-8 text-xs font-semibold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Novo Documento
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={carregarDados}
            title="Atualizar dados"
            className="h-8 w-8 text-gray-500 hover:text-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Abas Superiores Requisitadas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <Tabs
          value={abaAtiva}
          onValueChange={(v) => setAbaAtiva(v as TipoAba)}
          className="w-full lg:w-auto"
        >
          <TabsList className="bg-gray-100/90 p-1 rounded-xl h-10 border border-gray-200/80">
            <TabsTrigger
              value="alvaras"
              className="text-xs font-semibold rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-xs"
            >
              <Shield className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
              Alvarás ({alvaras.length})
            </TabsTrigger>
            <TabsTrigger
              value="contratos"
              className="text-xs font-semibold rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-xs"
            >
              <Briefcase className="h-3.5 w-3.5 mr-1.5 text-blue-700" />
              Contratos ({contratos.length})
            </TabsTrigger>
            <TabsTrigger
              value="locacoes"
              className="text-xs font-semibold rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-amber-700" />
              Locações ({locacoes.length})
            </TabsTrigger>
            <TabsTrigger
              value="atas"
              className="text-xs font-semibold rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-xs"
            >
              <FileCheck className="h-3.5 w-3.5 mr-1.5 text-purple-700" />
              Atas ({atas.length})
            </TabsTrigger>
            <TabsTrigger
              value="juridicos"
              className="text-xs font-semibold rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-rose-700" />
              Jurídicos ({juridicos.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Linha de Filtros: Busca + Filtro de Empresa com Popover & Ícone */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar em todos os campos..."
              className="pl-8 h-8 text-xs bg-white border-gray-200 shadow-2xs rounded-lg"
            />
          </div>

          <DocumentosEmpresaPopover
            empresas={empresas}
            valorSelecionado={empresaFiltro || ''}
            onSelect={(emp) => setEmpresaFiltro(emp || null)}
          />
        </div>
      </div>

      {/* Tabela de Dados com DnD de Colunas, Ordenação por Clique e Botão Parecer */}
      <DocumentosDataTable
        tabelaId={`docs_${abaAtiva}`}
        colunasPadrao={colunasAtuais}
        dados={dadosAtuais}
        keyExtractor={(item) => item.id}
        emptyMessage={`Nenhum registro encontrado para a aba ${abaAtiva}.`}
        acoes={(item) => (
          <div className="flex items-center justify-end gap-1.5">
            <DocumentoParecerButton documento={item} tipoAba={abaAtiva} promptPadrao="" />
          </div>
        )}
      />

      {/* Rodapé Informativo */}
      <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
        <span>
          Exibindo {dadosAtuais.length} registro(s){' '}
          {empresaFiltro ? `• Filtrado por "${empresaFiltro}"` : ''}
        </span>
        <span className="hidden sm:inline">
          Dica: Arraste o cabeçalho das colunas para reorganizar a ordem de exibição.
        </span>
      </div>

      {/* Modal de Anexo: Upload de PDF / DOCX / XLSX, Visualizar e Baixar */}
      {modalAnexoAberto && docAnexoSelecionado && (
        <DocumentoAnexoModal
          aberto={modalAnexoAberto}
          onOpenChange={setModalAnexoAberto}
          collectionName={docAnexoSelecionado.colecao as any}
          recordId={docAnexoSelecionado.id}
          tituloDocumento={docAnexoSelecionado.titulo}
          anexoAtual={docAnexoSelecionado.anexoNome}
          onAnexoAtualizado={() => carregarDados()}
        />
      )}

      {/* Modal Novo Documento */}
      <NovoDocumentoModal
        aberto={modalNovoAberto}
        onOpenChange={setModalNovoAberto}
        tipoAba={abaAtiva}
        empresas={empresas}
        empresaPreSelecionada={empresaFiltro || undefined}
        onCriadoSucesso={carregarDados}
      />

      {/* Modal Importação de Jurídicos XLSX */}
      <JuridicosImportModal
        aberto={modalImportJuridicosAberto}
        onOpenChange={setModalImportJuridicosAberto}
        onImportadoSucesso={carregarDados}
      />
    </div>
  )
}

export default DocumentosPage
