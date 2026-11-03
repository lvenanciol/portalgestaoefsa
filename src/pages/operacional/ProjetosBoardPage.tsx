import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  Plus,
  Loader2,
  X,
  Flag,
  AlertTriangle,
  Search,
  LayoutGrid,
  List,
  Building2,
  Calendar,
  ChevronDown,
  Check,
  User,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProjetoFormDialog } from '@/components/operacional/ProjetoFormDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmpresaIcon, useEmpresaLogos } from '@/components/common/EmpresaIcon'
import { limparTextoResponsavel, obterIniciaisResponsavel } from '@/lib/responsavel-utils'
import { cn } from '@/lib/utils'
import { ProjetosListaView } from '@/components/operacional/ProjetosListaView'

// DELTA — Tela de Projetos / evolução v1
// A. Faixa de contadores (Ativos, Em risco, Planejamento, Concluído)
// B. Toolbar de filtros (Busca por título, chips de status, selects Empresa e Responsável, Limpar filtros)
// C. Seletor de visão ("Cartões | Lista") com tabela completa
// D. Rótulos das barras ("Progresso físico" e "Execução orçamentária" com % à direita; "Não orçado" se orc=0)
// E. Rodapé do card (fases, chip de riscos com triângulo, chip de prazo dd/mm, card clicável)
// F. Estados vazios (sem projetos cadastrados vs sem resultado de filtros)
// Responsividade (grid 3 colunas -> 2 <1400px -> 1 <900px, toolbar quebra <1100px)

const STATUS_COR: Record<string, string> = {
  planejamento: 'bg-gray-100 text-gray-700',
  em_andamento: 'bg-amber-50 text-amber-700',
  pausado: 'bg-orange-50 text-orange-700',
  concluido: 'bg-emerald-50 text-emerald-700',
  em_risco: 'bg-red-50 text-red-700',
}

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'planejamento',
  em_andamento: 'em andamento',
  pausado: 'pausado',
  concluido: 'concluído',
  em_risco: 'em risco',
}

const fmtBRL = (v: any) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—'

const fmtPrazoCard = (s?: string) => {
  if (!s) return null
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : null
}

const fmtPrazoTabela = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

const parse = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch (_) {
    return []
  }
}

type ChipFiltro = 'todos' | 'em_andamento' | 'planejamento' | 'em_risco' | 'concluido'

export default function ProjetosBoardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [dialog, setDialog] = useState(false)
  const [analisandoRisco, setAnalisandoRisco] = useState(false)
  const [parecerRisco, setParecerRisco] = useState<any | null>(null)
  const [novoRisco, setNovoRisco] = useState({
    risco: '',
    prob: 'media',
    impacto: 'medio',
    mitigacao: '',
  })

  // DELTA: Controles de visualização e filtros
  // Restrição: Persistir a escolha Cartões/Lista em localStorage
  const [modoVisao, setModoVisao] = useState<'cartoes' | 'lista'>(() => {
    try {
      const salvo = localStorage.getItem('projetos_modo_visao')
      if (salvo === 'cartoes' || salvo === 'lista') return salvo
    } catch {
      // fallback
    }
    return 'cartoes'
  })

  const trocarModoVisao = (novoModo: 'cartoes' | 'lista') => {
    setModoVisao(novoModo)
    try {
      localStorage.setItem('projetos_modo_visao', novoModo)
    } catch {
      // ignore
    }
  }

  const [buscaTexto, setBuscaTexto] = useState('')
  const [chipAtivo, setChipAtivo] = useState<ChipFiltro>('todos')
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas')
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>('todos')

  // Estados dos Popovers de filtro da toolbar
  const [popoverEmpresaAberto, setPopoverEmpresaAberto] = useState(false)
  const [buscaEmpresaFiltro, setBuscaEmpresaFiltro] = useState('')
  const [popoverResponsavelAberto, setPopoverResponsavelAberto] = useState(false)
  const [buscaResponsavelFiltro, setBuscaResponsavelFiltro] = useState('')

  // Lista de empresas cadastradas no banco (para exibir no filtro com dot de cor)
  const [empresasBanco, setEmpresasBanco] = useState<{ id: string; nome: string; cor?: string }[]>(
    [],
  )
  const [parceirosBanco, setParceirosBanco] = useState<any[]>([])

  const { obterSiglaCor } = useEmpresaLogos()

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('projetos').getFullList({ sort: '-created' })
      setItens(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()

    // Carregar empresas e parceiros do banco para enriquecer os filtros
    pb.collection('empresas')
      .getFullList({ sort: 'nome' })
      .then((records) => {
        setEmpresasBanco(records as any[])
      })
      .catch(() => {})

    pb.collection('parceiros')
      .getFullList({ sort: 'nome' })
      .then((records) => {
        setParceirosBanco(records as any[])
      })
      .catch(() => {})
  }, [])

  // Lista única de empresas e responsáveis para os popovers
  const opcoesEmpresas = useMemo(() => {
    const set = new Set<string>()
    itens.forEach((p) => {
      const emp = (p.empresa || '').trim()
      if (emp) set.add(emp)
    })
    empresasBanco.forEach((e) => {
      if (e.nome) set.add(e.nome)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [itens, empresasBanco])

  const empresasFiltradas = useMemo(() => {
    if (!buscaEmpresaFiltro.trim()) return opcoesEmpresas
    const q = buscaEmpresaFiltro.trim().toLowerCase()
    return opcoesEmpresas.filter((emp) => emp.toLowerCase().includes(q))
  }, [opcoesEmpresas, buscaEmpresaFiltro])

  const opcoesResponsaveis = useMemo(() => {
    const set = new Set<string>()
    itens.forEach((p) => {
      const resp = (p.responsavel || '').trim()
      if (resp) set.add(resp)
    })
    parceirosBanco.forEach((p) => {
      const nomeLimpo = limparTextoResponsavel(p.nome) || p.nome
      if (nomeLimpo) set.add(nomeLimpo)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [itens, parceirosBanco])

  const responsaveisFiltrados = useMemo(() => {
    if (!buscaResponsavelFiltro.trim()) return opcoesResponsaveis
    const q = buscaResponsavelFiltro.trim().toLowerCase()
    return opcoesResponsaveis.filter((resp) => {
      if (resp.toLowerCase().includes(q)) return true
      const pMatch = parceirosBanco.find((p) => (limparTextoResponsavel(p.nome) || p.nome) === resp)
      const emp =
        pMatch?.empresa || (Array.isArray(pMatch?.empresas) ? pMatch.empresas.join(' ') : '')
      return emp.toLowerCase().includes(q)
    })
  }, [opcoesResponsaveis, buscaResponsavelFiltro, parceirosBanco])

  // Filtragem dos projetos (B)
  const itensFiltrados = useMemo(() => {
    const q = buscaTexto.trim().toLowerCase()

    return itens.filter((p) => {
      // 1. Busca por título (case-insensitive)
      if (q) {
        const nome = String(p.nome || '').toLowerCase()
        if (!nome.includes(q)) return false
      }

      // 2. Chip de status:
      // "todos" | "em_andamento" | "planejamento" | "em_risco" | "concluido"
      // "em_risco": status === 'em_risco' OU possui riscos mapeados na lista
      if (chipAtivo !== 'todos') {
        const statusNorm = String(p.status || '').toLowerCase()
        const riscosArr = parse(p.riscos)
        if (chipAtivo === 'em_risco') {
          const ehRisco = statusNorm === 'em_risco' || riscosArr.length > 0
          if (!ehRisco) return false
        } else if (chipAtivo === 'em_andamento') {
          if (statusNorm !== 'em_andamento') return false
        } else if (chipAtivo === 'planejamento') {
          if (statusNorm !== 'planejamento') return false
        } else if (chipAtivo === 'concluido') {
          if (statusNorm !== 'concluido') return false
        }
      }

      // 3. Select Empresa
      if (filtroEmpresa !== 'todas') {
        if (String(p.empresa || '').trim() !== filtroEmpresa) return false
      }

      // 4. Select Responsável
      if (filtroResponsavel !== 'todos') {
        if (String(p.responsavel || '').trim() !== filtroResponsavel) return false
      }

      return true
    })
  }, [itens, buscaTexto, chipAtivo, filtroEmpresa, filtroResponsavel])

  // A. FAIXA DE CONTADORES: calculados dinamicamente a partir de itensFiltrados
  // "Toda filtragem recalcula os contadores da faixa A"
  const contadores = useMemo(() => {
    let emRisco = 0
    let planejamento = 0
    let concluido = 0

    itensFiltrados.forEach((p) => {
      const st = String(p.status || '').toLowerCase()
      const riscosArr = parse(p.riscos)
      if (st === 'em_risco' || riscosArr.length > 0) {
        emRisco += 1
      }
      if (st === 'planejamento') {
        planejamento += 1
      } else if (st === 'concluido') {
        concluido += 1
      }
    })

    return {
      ativos: itensFiltrados.length,
      emRisco,
      planejamento,
      concluido,
    }
  }, [itensFiltrados])

  const temFiltroAtivo =
    buscaTexto.trim() !== '' ||
    chipAtivo !== 'todos' ||
    filtroEmpresa !== 'todas' ||
    filtroResponsavel !== 'todos'

  const limparFiltros = () => {
    setBuscaTexto('')
    setChipAtivo('todos')
    setFiltroEmpresa('todas')
    setFiltroResponsavel('todos')
  }

  const abrirNovo = () => {
    setDialog(true)
  }

  const mudarStatusProjeto = async (projeto: any, novoStatus: string) => {
    // Atualização otimista na mesma fonte de dados
    const statusAntigo = projeto.status
    setItens((prev) =>
      prev.map((item) => (item.id === projeto.id ? { ...item, status: novoStatus } : item)),
    )

    try {
      await pb.collection('projetos').update(projeto.id, { status: novoStatus })
    } catch (e) {
      // Reverte se der erro
      setItens((prev) =>
        prev.map((item) => (item.id === projeto.id ? { ...item, status: statusAntigo } : item)),
      )
      setErro(String(e))
    }
  }

  const excluirProjeto = async (projeto: any) => {
    if (!window.confirm(`Deseja realmente excluir o projeto "${projeto.nome}"?`)) return
    try {
      await pb.collection('projetos').delete(projeto.id)
      setItens((prev) => prev.filter((item) => item.id !== projeto.id))
      if (detalhe?.id === projeto.id) {
        setDetalhe(null)
      }
    } catch (e) {
      setErro(String(e))
    }
  }

  const addRisco = async () => {
    if (!detalhe || !novoRisco.risco.trim()) return
    const riscos = parse(detalhe.riscos)
    riscos.push(novoRisco)
    try {
      await pb.collection('projetos').update(detalhe.id, { riscos: JSON.stringify(riscos) })
      setNovoRisco({ risco: '', prob: 'media', impacto: 'medio', mitigacao: '' })
      const upd = await pb.collection('projetos').getOne(detalhe.id)
      setDetalhe(upd)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const analisarRiscoIA = async () => {
    if (!detalhe) return
    setAnalisandoRisco(true)
    try {
      const contexto =
        'Projeto: ' +
        detalhe.nome +
        ' | Responsável: ' +
        (detalhe.responsavel || '—') +
        ' | Status: ' +
        (detalhe.status || '—') +
        ' | Orçamento: ' +
        (detalhe.orcamento ?? '—') +
        ' | Realizado: ' +
        (detalhe.realizado ?? '—') +
        ' | Progresso: ' +
        (detalhe.progresso ?? 0) +
        '%' +
        ' | Marcos: ' +
        JSON.stringify(parse(detalhe.marcos)) +
        ' | Riscos: ' +
        JSON.stringify(parse(detalhe.riscos))
      const r = (await pb.send('/backend/v1/ia/estruturado', {
        method: 'POST',
        body: JSON.stringify({
          modulo: 'projetos',
          ref: detalhe.nome,
          contexto,
          prompt:
            'Analise os riscos deste projeto: probabilidade x impacto, causas prováveis, exposição orçamentária e 3 mitigações priorizadas.',
        }),
      })) as any
      setParecerRisco(r.estrutura)
    } catch (e) {
      setErro(String(e))
    } finally {
      setAnalisandoRisco(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Cabeçalho da página com Seletor de Visão (C) e botão + Novo projeto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <FolderKanban className="h-6 w-6 text-[#1B5E20]" /> Projetos
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Portfólio com orçamento, marcos, riscos e RACI
          </p>
        </div>

        {/* C. SELETOR DE VISÃO (Cartões | Lista) + Botão + Novo projeto à direita */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => trocarModoVisao('cartoes')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer',
                modoVisao === 'cartoes'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cartões</span>
            </button>
            <button
              type="button"
              onClick={() => trocarModoVisao('lista')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer',
                modoVisao === 'lista'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span>Lista</span>
            </button>
          </div>

          <Button
            onClick={abrirNovo}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs rounded-lg cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1" /> Novo projeto
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* A. FAIXA DE CONTADORES: 4 cards compactos em linha */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Ativos */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Ativos
          </div>
          <div className="text-2xl lg:text-[28px] font-bold text-gray-900 mt-1 tabular-nums">
            {contadores.ativos}
          </div>
        </div>

        {/* Em risco (vermelho se > 0) */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Em risco
          </div>
          <div
            className={cn(
              'text-2xl lg:text-[28px] font-bold mt-1 tabular-nums',
              contadores.emRisco > 0 ? 'text-red-600' : 'text-gray-900',
            )}
          >
            {contadores.emRisco}
          </div>
        </div>

        {/* Planejamento */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Planejamento
          </div>
          <div className="text-2xl lg:text-[28px] font-bold text-gray-900 mt-1 tabular-nums">
            {contadores.planejamento}
          </div>
        </div>

        {/* Concluído */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-4 shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Concluído
          </div>
          <div className="text-2xl lg:text-[28px] font-bold text-emerald-700 mt-1 tabular-nums">
            {contadores.concluido}
          </div>
        </div>
      </div>

      {/* B. TOOLBAR DE FILTROS */}
      {/* Quebra em 2 linhas abaixo de 1100px (classe max-[1100px]:flex-col) */}
      <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-xs flex flex-col min-[1100px]:flex-row min-[1100px]:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Busca por título */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Buscar projeto..."
              className="pl-9 h-9 text-xs bg-gray-50/70 border-gray-200 focus-visible:ring-[#1B5E20]"
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Chips: Todos | Em andamento | Planejamento | Em risco | Concluído */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { key: 'todos', label: 'Todos' },
                { key: 'em_andamento', label: 'Em andamento' },
                { key: 'planejamento', label: 'Planejamento' },
                { key: 'em_risco', label: 'Em risco' },
                { key: 'concluido', label: 'Concluído' },
              ] as const
            ).map((chip) => {
              const ativo = chipAtivo === chip.key
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setChipAtivo(chip.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer',
                    ativo
                      ? 'bg-[#1B5E20] text-white shadow-xs'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300',
                  )}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Popovers: Empresa e Responsável + Limpar filtros */}
        <div className="flex items-center gap-2 flex-wrap min-[1100px]:justify-end">
          {/* Popover Empresa no padrão de Tarefas & Agenda (busca interna, dot de cor, limpar seleção) */}
          <Popover open={popoverEmpresaAberto} onOpenChange={setPopoverEmpresaAberto}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-800 shadow-2xs inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 cursor-pointer min-w-[140px] max-w-[200px]',
                  filtroEmpresa !== 'todas' &&
                    'border-[#1B5E20] text-[#1B5E20] bg-emerald-50/50 font-semibold',
                )}
                title="Filtro de Empresa"
              >
                {filtroEmpresa !== 'todas' ? (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: obterSiglaCor(filtroEmpresa).cor }}
                  />
                ) : (
                  <Building2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                )}
                <span className="truncate flex-1 text-left">
                  {filtroEmpresa === 'todas' ? 'Empresa' : filtroEmpresa}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400 shrink-0 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[240px] p-2 bg-white">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <Input
                    value={buscaEmpresaFiltro}
                    onChange={(e) => setBuscaEmpresaFiltro(e.target.value)}
                    placeholder="Buscar empresa..."
                    className="h-8 pl-8 text-xs bg-gray-50"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1">
                  {/* Opção Todas as empresas */}
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroEmpresa('todas')
                      setPopoverEmpresaAberto(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                      filtroEmpresa === 'todas'
                        ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                        : 'hover:bg-gray-50 text-gray-700',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      <span>Todas as empresas</span>
                    </div>
                    {filtroEmpresa === 'todas' && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                  </button>

                  {empresasFiltradas.length === 0 ? (
                    <p className="text-[11px] text-gray-400 text-center py-2">
                      Nenhuma empresa encontrada.
                    </p>
                  ) : (
                    empresasFiltradas.map((emp) => {
                      const sel = filtroEmpresa === emp
                      const { cor } = obterSiglaCor(emp)
                      return (
                        <button
                          key={emp}
                          type="button"
                          onClick={() => {
                            setFiltroEmpresa(emp)
                            setPopoverEmpresaAberto(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                            sel
                              ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                              : 'hover:bg-gray-50 text-gray-800',
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: cor }}
                            />
                            <span className="truncate">{emp}</span>
                          </div>
                          {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20] shrink-0 ml-1" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Popover Responsável no padrão de Tarefas & Agenda (busca interna, avatar de iniciais, limpar seleção) */}
          <Popover open={popoverResponsavelAberto} onOpenChange={setPopoverResponsavelAberto}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-800 shadow-2xs inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 cursor-pointer min-w-[140px] max-w-[200px]',
                  filtroResponsavel !== 'todos' &&
                    'border-[#1B5E20] text-[#1B5E20] bg-emerald-50/50 font-semibold',
                )}
                title="Filtro de Responsável"
              >
                {filtroResponsavel !== 'todos' ? (
                  <span className="w-4 h-4 rounded-full bg-[#1B5E20] text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                    {obterIniciaisResponsavel(filtroResponsavel)}
                  </span>
                ) : (
                  <User className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                )}
                <span className="truncate flex-1 text-left">
                  {filtroResponsavel === 'todos' ? 'Responsável' : filtroResponsavel}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400 shrink-0 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] p-2 bg-white">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <Input
                    value={buscaResponsavelFiltro}
                    onChange={(e) => setBuscaResponsavelFiltro(e.target.value)}
                    placeholder="Buscar parceiro por nome ou empresa..."
                    className="h-8 pl-8 text-xs bg-gray-50"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1">
                  {/* Opção Todos os responsáveis */}
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroResponsavel('todos')
                      setPopoverResponsavelAberto(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                      filtroResponsavel === 'todos'
                        ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                        : 'hover:bg-gray-50 text-gray-700',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[9px] font-bold">
                        *
                      </span>
                      <span>Todos os responsáveis</span>
                    </div>
                    {filtroResponsavel === 'todos' && (
                      <Check className="h-3.5 w-3.5 text-[#1B5E20]" />
                    )}
                  </button>

                  {responsaveisFiltrados.length === 0 ? (
                    <p className="text-[11px] text-gray-400 text-center py-2">
                      Nenhum responsável encontrado.
                    </p>
                  ) : (
                    responsaveisFiltrados.map((resp) => {
                      const sel = filtroResponsavel === resp
                      const pMatch = parceirosBanco.find(
                        (p) => (limparTextoResponsavel(p.nome) || p.nome) === resp,
                      )
                      const emp =
                        pMatch?.empresa ||
                        (Array.isArray(pMatch?.empresas) ? pMatch.empresas[0] : '')
                      return (
                        <button
                          key={resp}
                          type="button"
                          onClick={() => {
                            setFiltroResponsavel(resp)
                            setPopoverResponsavelAberto(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors',
                            sel
                              ? 'bg-emerald-50 text-[#1B5E20] font-bold'
                              : 'hover:bg-gray-50 text-gray-800',
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-[#1B5E20] border border-emerald-200 flex items-center justify-center text-[9px] font-bold shrink-0">
                              {obterIniciaisResponsavel(resp)}
                            </span>
                            <span className="truncate">{resp}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {emp && <span className="text-[10px] text-gray-400">({emp})</span>}
                            {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Link "Limpar filtros" */}
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-xs text-gray-500 hover:text-red-600 font-medium inline-flex items-center gap-1 px-1 cursor-pointer transition-colors"
            >
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* F. ESTADOS VAZIOS */}
      {itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/90 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#1B5E20] flex items-center justify-center mx-auto mb-3">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Nenhum projeto cadastrado</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Comece criando o primeiro projeto do portfólio executivo.
          </p>
          <Button
            onClick={abrirNovo}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs rounded-lg cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1" /> Novo projeto
          </Button>
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/90 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Nenhum projeto encontrado</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Não há projetos correspondentes aos filtros aplicados.
          </p>
          <button
            type="button"
            onClick={limparFiltros}
            className="text-xs text-[#1B5E20] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            Limpar filtros
          </button>
        </div>
      ) : modoVisao === 'cartoes' ? (
        /* C & D & E. VISÃO CARTÕES */
        /* Responsividade: 3 colunas -> 2 colunas < 1400px -> 1 coluna < 900px */
        <div className="grid grid-cols-1 md:max-[1400px]:grid-cols-2 min-[1400px]:grid-cols-3 gap-4">
          {itensFiltrados.map((p) => {
            const marcos = parse(p.marcos)
            const riscos = parse(p.riscos)
            const orc = Number(p.orcamento) || 0
            const rea = Number(p.realizado) || 0
            const progressoFisico = Number(p.progresso) || 0
            const pctOrc = orc > 0 ? Math.min(100, Math.round((rea / orc) * 100)) : 0
            const prazoFmt = fmtPrazoCard(p.prazo)

            // Status visual
            const statusKey = p.status || 'planejamento'

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
                onClick={() => navigate(`/projetos/${p.id}`)}
              >
                <div>
                  {/* Topo do card */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-[15px] font-bold text-gray-900 leading-snug">{p.nome}</div>
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                        STATUS_COR[statusKey] || 'bg-gray-100 text-gray-700',
                      )}
                    >
                      {STATUS_LABEL[statusKey] || statusKey.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-[11px] text-gray-500 mb-3">
                    {p.empresa || 'Grupo'} · {p.responsavel || '—'}
                  </div>

                  {/* D. 1ª BARRA: Progresso físico com percentual à direita */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-500 font-semibold">Progresso físico</span>
                      <span className="font-bold text-gray-900 tabular-nums">
                        {progressoFisico}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1B5E20]"
                        style={{ width: `${Math.min(100, progressoFisico)}%` }}
                      />
                    </div>
                  </div>

                  {/* D. 2ª BARRA: Execução orçamentária com percentual à direita / "Não orçado" */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-500 font-semibold">Execução orçamentária</span>
                      {orc > 0 ? (
                        <span
                          className={cn(
                            'font-bold tabular-nums',
                            pctOrc > 100 ? 'text-red-600' : 'text-gray-900',
                          )}
                        >
                          {pctOrc}%
                        </span>
                      ) : (
                        <span className="font-semibold text-gray-400 text-[11px]">Não orçado</span>
                      )}
                    </div>
                    {orc > 0 ? (
                      <>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              pctOrc > 100 ? 'bg-red-500' : 'bg-amber-500',
                            )}
                            style={{ width: `${Math.min(100, pctOrc)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 tabular-nums">
                          {fmtBRL(rea)} de {fmtBRL(orc)}
                        </div>
                      </>
                    ) : (
                      <div className="h-2 rounded-full bg-gray-100" />
                    )}
                  </div>

                  {/* Linha de fases (marcos) mantida */}
                  {marcos.length > 0 && (
                    <div className="flex items-center gap-1 mb-3">
                      {marcos.map((m: any, i: number) => (
                        <div key={i} className="flex-1">
                          <div
                            className={cn(
                              'h-1.5 rounded-full',
                              m.ok ? 'bg-emerald-500' : 'bg-gray-200',
                            )}
                          />
                          <div className="text-[9px] text-gray-400 mt-0.5 truncate">{m.nome}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* E. RODAPÉ DO CARD: chips de riscos e prazo */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 mt-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {riscos.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span>
                          {riscos.length} {riscos.length === 1 ? 'risco' : 'riscos'}
                        </span>
                      </span>
                    )}

                    {prazoFmt && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200/80 px-2 py-0.5 rounded-md">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span>Prazo {prazoFmt}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* C. VISÃO LISTA AGRUPADA (PROMPT 2) */
        /* Tabela agrupada por status (EM ANDAMENTO / EM RISCO / PLANEJAMENTO / CONCLUÍDO) */
        /* 8 colunas: PROJETO | STATUS | RESPONSÁVEL | EMPRESA | PROGRESSO | ORÇAMENTO | PRAZO | AÇÕES */
        /* Ordenação nos headers PROJETO, PRAZO, PROGRESSO */
        /* Linhas em risco/vencidas com borda-esquerda vermelha de 3px */
        /* Rodapé com link "+ Adicionar projeto" que abre o modal existente */
        <ProjetosListaView
          itens={itensFiltrados}
          onAbrirDetalhe={(p) => navigate(`/projetos/${p.id}`)}
          onAbrirNovo={abrirNovo}
          onMudarStatus={mudarStatusProjeto}
          onExcluir={excluirProjeto}
        />
      )}

      {/* Modal Novo Projeto refatorado com retrocompatibilidade */}
      <ProjetoFormDialog
        open={dialog}
        onOpenChange={setDialog}
        editando={null}
        onSalvo={carregar}
      />

      {/* Detalhe do projeto */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detalhe?.nome}</span>
              <button
                onClick={() => setDetalhe(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {detalhe &&
            (() => {
              const marcos = parse(detalhe.marcos)
              const riscos = parse(detalhe.riscos)
              let raci: any = {}
              try {
                raci =
                  typeof detalhe.raci === 'string'
                    ? JSON.parse(detalhe.raci || '{}')
                    : detalhe.raci || {}
              } catch (_) {
                raci = {}
              }
              return (
                <div className="space-y-4">
                  <p className="text-[13px] text-gray-700">{detalhe.descricao}</p>

                  {/* Timeline */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Timeline — marcos
                    </div>
                    <div className="space-y-2">
                      {marcos.map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'w-2.5 h-2.5 rounded-full shrink-0',
                              m.ok ? 'bg-emerald-500' : 'bg-gray-300',
                            )}
                          />
                          <span className="text-[13px] text-gray-800 flex-1">{m.nome}</span>
                          <span className="text-[11px] text-gray-400 tabular-nums">{m.data}</span>
                          <span
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded',
                              m.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                            )}
                          >
                            {m.ok ? 'OK' : 'pendente'}
                          </span>
                        </div>
                      ))}
                      {marcos.length === 0 && (
                        <p className="text-[12px] text-gray-400">Sem marcos.</p>
                      )}
                    </div>
                  </div>

                  {/* Riscos */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Riscos (probabilidade · impacto · mitigação)
                    </div>
                    <div className="space-y-2">
                      {riscos.map((r: any, i: number) => (
                        <div
                          key={i}
                          className="bg-amber-50/60 border border-amber-100 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Flag className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-[13px] font-semibold text-gray-900 flex-1">
                              {r.risco}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              {r.prob}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                              {r.impacto}
                            </span>
                          </div>
                          <p className="text-[12px] text-gray-600 pl-6">
                            Mitigação: {r.mitigacao || '—'}
                          </p>
                        </div>
                      ))}
                      {riscos.length === 0 && (
                        <p className="text-[12px] text-gray-400">Nenhum risco mapeado.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                      <Input
                        value={novoRisco.risco}
                        onChange={(e) => setNovoRisco({ ...novoRisco, risco: e.target.value })}
                        placeholder="Novo risco..."
                        className="h-9 text-xs bg-gray-50 sm:col-span-2"
                      />
                      <Select
                        value={novoRisco.prob}
                        onValueChange={(v) => setNovoRisco({ ...novoRisco, prob: v })}
                      >
                        <SelectTrigger className="h-9 text-xs bg-gray-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">baixa</SelectItem>
                          <SelectItem value="media">média</SelectItem>
                          <SelectItem value="alta">alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={addRisco} className="h-9">
                        Adicionar
                      </Button>
                      <Input
                        value={novoRisco.mitigacao}
                        onChange={(e) => setNovoRisco({ ...novoRisco, mitigacao: e.target.value })}
                        placeholder="Mitigação..."
                        className="h-9 text-xs bg-gray-50 sm:col-span-3"
                      />
                    </div>
                  </div>

                  {/* RACI */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      RACI
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['R — Responsável', raci.R],
                        ['A — Aprova', raci.A],
                        ['C — Consultado', raci.C],
                        ['I — Informado', raci.I],
                      ].map(([k, v]) => (
                        <div key={k as string} className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {k}
                          </div>
                          <div className="text-[12px] font-semibold text-gray-800 mt-0.5">
                            {String(v || '—')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={analisarRiscoIA}
                    disabled={analisandoRisco}
                    className="h-8"
                  >
                    {analisandoRisco ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Flag className="h-3.5 w-3.5 mr-1" />
                    )}
                    Analisar risco com IA
                  </Button>
                </div>
              )
            })()}
        </DialogContent>
      </Dialog>

      {/* Dialog Parecer IA — riscos do projeto */}
      <Dialog open={!!parecerRisco} onOpenChange={(o) => !o && setParecerRisco(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-[#1B5E20]" /> Análise de riscos — {detalhe?.nome}
              </span>
              <button
                onClick={() => setParecerRisco(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {parecerRisco && (
            <div className="space-y-3">
              {typeof parecerRisco.score_saude === 'number' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      parecerRisco.score_saude >= 7
                        ? 'bg-emerald-600'
                        : parecerRisco.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {parecerRisco.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score de saúde do projeto
                    </div>
                    <div className="text-[13px] text-gray-700">0-10</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Sumário executivo
                </div>
                <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {parecerRisco.sumario_executivo}
                </p>
              </div>
              {parecerRisco.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {parecerRisco.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerRisco.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Mitigações priorizadas
                  </div>
                  <ol className="space-y-1">
                    {parecerRisco.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {parecerRisco.disclaimer || 'Análise assistida — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
