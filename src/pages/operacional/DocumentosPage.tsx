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
  Trash2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { DocumentosDataTable, ColunaConfig } from '@/components/documentos/DocumentosDataTable'
import { DocumentosEmpresaPopover } from '@/components/documentos/DocumentosEmpresaPopover'
import { DocumentoParecerButton } from '@/components/documentos/DocumentoParecerButton'
import { DocumentoAnexoModal } from '@/components/documentos/DocumentoAnexoModal'
import { DocumentoDetalheModal } from '@/components/documentos/DocumentoDetalheModal'
import { JuridicosImportModal } from '@/components/documentos/JuridicosImportModal'
import { ProcessoHistoricoModal } from '@/components/documentos/ProcessoHistoricoModal'
import { AudienciasModal } from '@/components/documentos/AudienciasModal'
import { NovoDocumentoModal } from '@/components/documentos/NovoDocumentoModal'
import { CalendarDays, Upload } from 'lucide-react'

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
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false)
  const [docDetalheSelecionado, setDocDetalheSelecionado] = useState<any | null>(null)
  const [docAnexoSelecionado, setDocAnexoSelecionado] = useState<{
    id: string
    colecao: string
    titulo: string
    anexoNome?: string
  } | null>(null)

  // Diálogo de confirmação de exclusão
  const [docParaExcluir, setDocParaExcluir] = useState<{
    id: string
    titulo: string
    colecao: string
  } | null>(null)
  const [excluindoDoc, setExcluindoDoc] = useState(false)
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalImportJuridicosAberto, setModalImportJuridicosAberto] = useState(false)
  const [modalAudienciasAberto, setModalAudienciasAberto] = useState(false)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [processoHistoricoSelecionado, setProcessoHistoricoSelecionado] = useState<any>(null)

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

  // Executa a exclusão de um documento com confirmação amigável
  const handleConfirmarExclusao = async () => {
    if (!docParaExcluir) return
    setExcluindoDoc(true)
    try {
      await pb.collection(docParaExcluir.colecao).delete(docParaExcluir.id)
      toast({
        title: 'Documento excluído',
        description: `"${docParaExcluir.titulo}" foi removido com sucesso.`,
      })
      // Remove localmente do estado da aba
      if (docParaExcluir.colecao === 'alvaras') {
        setAlvaras((prev) => prev.filter((d) => d.id !== docParaExcluir.id))
      } else if (docParaExcluir.colecao === 'atas') {
        setAtas((prev) => prev.filter((d) => d.id !== docParaExcluir.id))
      } else if (docParaExcluir.colecao === 'processos_juridicos') {
        setJuridicos((prev) => prev.filter((d) => d.id !== docParaExcluir.id))
      } else if (docParaExcluir.colecao === 'contratos') {
        setContratos((prev) => prev.filter((d) => d.id !== docParaExcluir.id))
        setLocacoes((prev) => prev.filter((d) => d.id !== docParaExcluir.id))
      }
      setDocParaExcluir(null)
    } catch (err: any) {
      console.error('Erro ao excluir documento:', err)
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Não foi possível excluir o documento.',
        variant: 'destructive',
      })
    } finally {
      setExcluindoDoc(false)
    }
  }

  // Obter o nome da coleção PocketBase com base na aba atual
  const obterColecaoPorAba = (aba: string) => {
    switch (aba) {
      case 'alvaras':
        return 'alvaras'
      case 'atas':
        return 'atas'
      case 'juridicos':
        return 'processos_juridicos'
      case 'contratos':
      case 'locacoes':
      default:
        return 'contratos'
    }
  }

  // Título amigável de exibição do documento para exclusão
  const obterTituloExibicao = (item: any) => {
    return (
      item.titulo ||
      item.tipo ||
      item.numero ||
      item.numero_processo ||
      item.assunto_tipo ||
      'Documento'
    )
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

  // Helper para renderizar célula de Empresa com ícone nativo
  const renderCelulaEmpresa = (nomeEmpresa?: string) => {
    if (!nomeEmpresa) return <span className="text-gray-400">—</span>
    return (
      <EmpresaIcon
        nome={nomeEmpresa}
        mostrarNome
        className="h-4 w-4 shrink-0 rounded-xs"
        nomeClassName="font-medium text-gray-800"
      />
    )
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
      {
        id: 'empresa',
        label: 'Empresa',
        sortable: true,
        render: (item) => renderCelulaEmpresa(item.empresa),
      },
      {
        id: 'titulo_documento',
        label: 'Título do documento',
        sortable: true,
        sortValue: (i) => i.titulo || i.tipo || i.numero || '',
        render: (item) => {
          const tit =
            item.titulo ||
            (item.tipo ? `${item.tipo} - ${item.empresa || ''}` : `Alvará ${item.numero}`)
          return <span className="font-medium text-gray-900">{tit}</span>
        },
      },
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
            onClick={() => abrirModalAnexo(item, 'alvaras', item.titulo || `Alvará ${item.numero}`)}
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
      { id: 'parte', label: 'Contraparte / Locador', sortable: true },
      {
        id: 'empresa',
        label: 'Empresa',
        sortable: true,
        render: (item) => renderCelulaEmpresa(item.empresa),
      },
      {
        id: 'titulo_documento',
        label: 'Título do documento',
        sortable: true,
        sortValue: (i) => i.titulo || '',
        render: (item) => (
          <div>
            <div className="font-semibold text-gray-900">{item.titulo}</div>
            {item.objeto && (
              <div className="text-[11px] text-gray-500 truncate max-w-xs">{item.objeto}</div>
            )}
          </div>
        ),
      },
      {
        id: 'valor_mensal',
        label: 'Valor Mensal',
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
        id: 'tipo_ata',
        label: 'Tipo',
        sortable: true,
        render: (item) => (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            {item.tipo_ata || 'AGE'}
          </Badge>
        ),
      },
      {
        id: 'empresa',
        label: 'Empresa',
        sortable: true,
        render: (item) => renderCelulaEmpresa(item.empresa),
      },
      {
        id: 'titulo_documento',
        label: 'Título do documento',
        sortable: true,
        sortValue: (i) => i.titulo || '',
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
        id: 'data',
        label: 'Data',
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
  // Requisito b3: Empresa (ícone à esquerda do nome), Título, Órgão, Status, Natureza, Contrário, Responsável, Probabilidade, Valor base, Valor corrigido, Juros, Multa e Valor atualizado.
  const colunasJuridicos: ColunaConfig<any>[] = useMemo(
    () => [
      {
        id: 'empresa',
        label: 'Empresa',
        sortable: true,
        render: (item) => renderCelulaEmpresa(item.empresa || item.cliente_principal),
      },
      {
        id: 'titulo',
        label: 'Título',
        sortable: true,
        sortValue: (i) => i.titulo || i.assunto_tipo || i.numero_processo || '',
        render: (item) => {
          const tit =
            item.titulo ||
            (item.assunto_tipo
              ? `${item.assunto_tipo} (${item.numero_processo || 'Proc.'})`
              : `Processo ${item.numero_processo || ''}`)
          return (
            <div className="space-y-0.5">
              <span className="font-medium text-gray-900 line-clamp-1" title={tit}>
                {tit}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono">
                <span>{item.numero_cnj || item.numero_processo}</span>
                {item.versao_atual && item.versao_atual > 1 && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            setProcessoHistoricoSelecionado(item)
                            setModalHistoricoAberto(true)
                          }}
                        >
                          v{item.versao_atual}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[11px]">
                        Ver histórico de alterações (v{item.versao_atual})
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )
        },
      },
      {
        id: 'orgao',
        label: 'Órgão',
        sortable: true,
        render: (item) => {
          const org = item.orgao || item.orgao_tribunal || item.vara_comarca || '—'
          return (
            <span className="text-xs text-gray-700 line-clamp-1 max-w-[180px]" title={org}>
              {org}
            </span>
          )
        },
      },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: (item) => {
          const st = String(item.status || 'Ativo')
          const isAtivo = st.toLowerCase().includes('ativo')
          return (
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 ${
                isAtivo
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {st}
            </Badge>
          )
        },
      },
      {
        id: 'natureza',
        label: 'Natureza',
        sortable: true,
        render: (item) => (
          <span className="text-xs text-gray-700">{item.natureza || 'Trabalhista'}</span>
        ),
      },
      {
        id: 'contrario',
        label: 'Contrário',
        sortable: true,
        render: (item) => {
          const cont =
            item.contrario_principal || (item.autor === item.empresa ? item.reu : item.autor) || '—'
          return (
            <span className="text-xs text-gray-800 line-clamp-1 max-w-[180px]" title={cont}>
              {cont}
            </span>
          )
        },
      },
      {
        id: 'responsavel',
        label: 'Responsável',
        sortable: true,
        render: (item) => {
          const resp = item.responsavel_principal || item.advogado || '—'
          return (
            <span className="text-xs text-gray-700 line-clamp-1 max-w-[160px]" title={resp}>
              {resp}
            </span>
          )
        },
      },
      {
        id: 'probabilidade',
        label: 'Probabilidade',
        sortable: true,
        render: (item) => {
          const texto = item.probabilidade || item.risco || 'Perda Possível'
          const l = String(texto).toLowerCase()
          let classe = 'bg-gray-100 text-gray-600'
          if (l.includes('prov')) classe = 'bg-rose-50 text-rose-700 border-rose-200'
          else if (l.includes('poss')) classe = 'bg-amber-50 text-amber-700 border-amber-200'
          else if (l.includes('remot') || l.includes('êxito') || l.includes('exito'))
            classe = 'bg-emerald-50 text-emerald-700 border-emerald-200'

          return (
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${classe}`}>
              {texto}
            </Badge>
          )
        },
      },
      {
        id: 'valor_base',
        label: 'Valor base',
        sortable: true,
        sortValue: (i) => i.valor_base ?? i.valor_causa ?? 0,
        render: (item) => formatarMoeda(item.valor_base ?? item.valor_causa),
      },
      {
        id: 'valor_corrigido',
        label: 'Valor corrigido',
        sortable: true,
        sortValue: (i) => i.valor_corrigido ?? 0,
        render: (item) => formatarMoeda(item.valor_corrigido),
      },
      {
        id: 'juros',
        label: 'Juros',
        sortable: true,
        sortValue: (i) => i.juros ?? 0,
        render: (item) => formatarMoeda(item.juros),
      },
      {
        id: 'multa',
        label: 'Multa',
        sortable: true,
        sortValue: (i) => i.multa ?? 0,
        render: (item) => formatarMoeda(item.multa),
      },
      {
        id: 'valor_atualizado',
        label: 'Valor atualizado',
        sortable: true,
        sortValue: (i) => i.valor_atualizado ?? i.valor_causa ?? 0,
        render: (item) => (
          <span className="font-semibold text-emerald-900">
            {formatarMoeda(item.valor_atualizado ?? item.valor_causa)}
          </span>
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
              <Upload className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
              Importar
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

          {abaAtiva === 'juridicos' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalAudienciasAberto(true)}
              className="h-8 text-xs font-semibold text-blue-800 border-blue-300 hover:bg-blue-50"
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-blue-700" />
              Audiências
            </Button>
          )}

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

      {/* Tabela de Dados com DnD de Colunas, Ordenação por Clique, Botão Parecer e Clique na Linha */}
      <DocumentosDataTable
        tabelaId={`docs_${abaAtiva}`}
        colunasPadrao={colunasAtuais}
        dados={dadosAtuais}
        keyExtractor={(item) => item.id}
        emptyMessage={`Nenhum registro encontrado para a aba ${abaAtiva}.`}
        onLinhaClick={(item) => {
          setDocDetalheSelecionado(item)
          setModalDetalheAberto(true)
        }}
        acoes={(item) => (
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <DocumentoParecerButton documento={item} tipoAba={abaAtiva} promptPadrao="" />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir documento"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDocParaExcluir({
                        id: item.id,
                        titulo: String(obterTituloExibicao(item)),
                        colecao: obterColecaoPorAba(abaAtiva),
                      })
                    }}
                    className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px]">
                  Excluir documento
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      />

      {/* Diálogo Amigável de Confirmação de Exclusão */}
      <AlertDialog
        open={!!docParaExcluir}
        onOpenChange={(aberto) => {
          if (!aberto && !excluindoDoc) setDocParaExcluir(null)
        }}
      >
        <AlertDialogContent className="bg-white max-w-md rounded-2xl shadow-xl border border-gray-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-gray-900">
              Excluir este documento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600 pt-1">
              Você está prestes a excluir o documento{' '}
              <span className="font-semibold text-gray-900">"{docParaExcluir?.titulo}"</span>. Esta
              ação não pode ser desfeita e removerá os dados e arquivos anexos vinculados a ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel disabled={excluindoDoc} className="text-xs h-8">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmarExclusao()
              }}
              disabled={excluindoDoc}
              className="text-xs h-8 bg-rose-600 hover:bg-rose-700 text-white font-medium"
            >
              {excluindoDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Sim, excluir documento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Modal de Detalhe Completo do Documento (d1) */}
      {modalDetalheAberto && docDetalheSelecionado && (
        <DocumentoDetalheModal
          aberto={modalDetalheAberto}
          onOpenChange={setModalDetalheAberto}
          tipoAba={abaAtiva}
          documento={docDetalheSelecionado}
          empresas={empresas}
          onAtualizado={() => {
            carregarDados()
          }}
          onAbrirAnexos={(doc) => {
            const colecaoNome =
              abaAtiva === 'alvaras'
                ? 'alvaras'
                : abaAtiva === 'atas'
                  ? 'atas'
                  : abaAtiva === 'juridicos'
                    ? 'processos_juridicos'
                    : 'contratos'
            const tit = doc.titulo || doc.numero || doc.numero_processo || 'Documento'
            abrirModalAnexo(doc, colecaoNome, tit)
          }}
        />
      )}

      {/* Modal de Anexo: Upload de PDF / DOCX / XLSX, Visualizar e Baixar para todas as abas */}
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
            // Se o documento aberto no modal de detalhe for o mesmo, atualiza-o
            if (docDetalheSelecionado && docDetalheSelecionado.id === docAnexoSelecionado.id) {
              pb.collection(docAnexoSelecionado.colecao)
                .getOne(docAnexoSelecionado.id)
                .then((atualizado) => setDocDetalheSelecionado(atualizado))
                .catch(() => {})
            }
          }}
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
          ''
        }
        tituloProcesso={processoHistoricoSelecionado?.titulo}
      />
    </div>
  )
}

export default DocumentosPage
