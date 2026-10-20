import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  Search,
  Bell,
  AlertCircle,
  Clock,
  User,
  Menu,
  X,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/hooks/use-auth'
import { marcaAtiva } from '@/pages/ConfiguracoesCompletaPage'
import { aplicarIdiomaNoDOM, type Idioma } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Ajustes PGE — T9: bandeiras SEM legenda (BR/EUA/UE), troca de idioma real.
// T10: busca inteligente funcional (navega para módulos por texto, Ctrl+K).
// T1: dropdown de empresas REMOVIDO do topbar — a troca é pela logo na sidebar;
// o topbar exibe a empresa selecionada (somente leitura).

const BANDEIRAS: { key: string; label: string; node: React.ReactNode }[] = [
  {
    key: 'pt-BR',
    label: 'Português (BR)',
    node: (
      <span
        className="relative inline-flex items-center justify-center w-[18px] h-[12px] rounded-[1.5px] overflow-hidden bg-[#009B3A] shrink-0 shadow-2xs"
        aria-hidden="true"
      >
        <span
          className="absolute w-[13px] h-[8px] bg-[#FEDF00]"
          style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
        />
        <span className="absolute w-[4.5px] h-[4.5px] rounded-full bg-[#002776]" />
      </span>
    ),
  },
  {
    key: 'en-US',
    label: 'English (US)',
    node: (
      <span
        className="relative inline-flex items-center justify-center w-[18px] h-[12px] rounded-[1.5px] overflow-hidden bg-[#B22234] shrink-0 shadow-2xs"
        aria-hidden="true"
      >
        <span
          className="absolute inset-0"
          style={{ background: 'repeating-linear-gradient(#B22234 0 2px, #fff 2px 4px)' }}
        />
        <span className="absolute top-0 left-0 w-[8px] h-[6px] bg-[#3C3B6E]" />
      </span>
    ),
  },
  {
    key: 'en-EU',
    label: 'English (EU)',
    node: (
      <span
        className="relative inline-flex items-center justify-center w-[18px] h-[12px] rounded-[1.5px] overflow-hidden bg-[#003399] shrink-0 shadow-2xs"
        aria-hidden="true"
      >
        <span
          className="absolute w-[7px] h-[7px] text-[#FFCC00] text-[9px] leading-none"
          style={{ color: '#FFCC00' }}
        >
          ★
        </span>
      </span>
    ),
  },
]

const LS_IDIOMA = 'pge_idioma'

// T10 — índice de busca: módulos navegáveis
const BUSCA_ITENS = [
  { label: 'Dashboard Executivo', rota: '/', chaves: 'dashboard home início' },
  {
    label: 'Financeiro & Contábil',
    rota: '/financeiro',
    chaves: 'financeiro contabil dre balancete fluxo',
  },
  { label: 'Desempenho por Unidade', rota: '/desempenho', chaves: 'desempenho unidade ranking' },
  { label: 'Indicadores', rota: '/indicadores', chaves: 'indicadores kpi meta semaforo' },
  {
    label: 'Documentos & Importações',
    rota: '/documentos',
    chaves: 'documentos importacao balancete arquivo',
  },
  { label: 'Tarefas & Agenda', rota: '/tarefas', chaves: 'tarefas agenda kanban chamado' },
  { label: 'Projetos', rota: '/projetos', chaves: 'projetos marcos riscos raci' },
  { label: 'Atas & Reuniões', rota: '/atas', chaves: 'atas reunioes pauta' },
  {
    label: 'Parceiros & Contatos',
    rota: '/parceiros',
    chaves: 'parceiros contatos fornecedor cliente',
  },
  { label: 'Logomarcas', rota: '/logomarcas', chaves: 'logomarcas marca identidade logo' },
  { label: 'E-mails', rota: '/emails', chaves: 'emails mensagem compositor' },
  { label: 'Contratos', rota: '/contratos', chaves: 'contratos locacao servico' },
  { label: 'Power BI', rota: '/power-bi', chaves: 'power bi relatorio embed' },
  { label: 'IA Gemini Flash', rota: '/ia', chaves: 'ia gemini inteligencia parecer' },
  { label: 'Árvore de Menus', rota: '/menus', chaves: 'menus arvore sidebar' },
  { label: 'Controle de Acessos', rota: '/acessos', chaves: 'acessos usuarios grupos permissoes' },
  { label: 'Configurações', rota: '/configuracoes', chaves: 'configuracoes integracoes backup' },
]

export function Topbar() {
  const { selectedCompany, empresas, toggleSidebar, criticalAlerts } = useApp()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  // T2: alertas ocultados pelo usuário (persistido em localStorage)
  const [ocultados, setOcultados] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pge_alertas_ocultados') || '[]')
    } catch (_) {
      return []
    }
  })
  const ocultarAlerta = (id: string) => {
    const nova = [...new Set([...ocultados, id])]
    setOcultados(nova)
    try {
      localStorage.setItem('pge_alertas_ocultados', JSON.stringify(nova))
    } catch (_e) {
      /* localStorage indisponível — oculto só nesta sessão */
    }
  }
  const alertasVisiveis = criticalAlerts.filter((a) => !ocultados.includes(a.id))
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [idioma, setIdioma] = useState(() => {
    try {
      return localStorage.getItem(LS_IDIOMA) || 'pt-BR'
    } catch (_) {
      return 'pt-BR'
    }
  })
  // T10 busca
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaIdx, setBuscaIdx] = useState(0)

  const marca = marcaAtiva()
  const empresaSel = empresas.find((e) => e.id === selectedCompany)

  const trocarIdioma = (k: string) => {
    setIdioma(k)
    try {
      localStorage.setItem(LS_IDIOMA, k)
    } catch (_) {
      /* localStorage indisponível — segue sem persistir */
    }
    // COR-2: tradutor de DOM em runtime — cobre TODA a página sem reload
    aplicarIdiomaNoDOM(k as Idioma)
    window.dispatchEvent(new Event('pge_idioma_change'))
  }

  // T10 — resultados da busca
  const resultados = (() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return BUSCA_ITENS.filter((i) => (i.label + ' ' + i.chaves).toLowerCase().includes(q)).slice(
      0,
      8,
    )
  })()

  const irPara = (rota: string) => {
    setBuscaAberta(false)
    setBusca('')
    navigate(rota)
  }

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault()
        setBuscaAberta((o) => !o)
      }
      if (ev.key === 'Escape') setBuscaAberta(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white border-b border-[#E5E7EB] px-4 md:px-6 flex items-center justify-between shadow-xs">
      {/* Esquerda: hambúrguer (mobile) + empresa selecionada (leitura; troca pela sidebar) + período */}
      <div className="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg focus:outline-none"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* T1: empresa selecionada — SEM dropdown; troca pela logomarca da sidebar */}
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-gray-50/70 text-[13.5px] font-semibold text-gray-800">
          <span
            className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-white font-bold text-[10px]"
            style={{ backgroundColor: empresaSel?.cor || marca.cor }}
          >
            {empresaSel ? empresaSel.nome.slice(0, 2).toUpperCase() : marca.sigla}
          </span>
          <span className="tracking-tight">{empresaSel?.nome || marca.nome}</span>
        </div>

        {/* Filtro de período */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
            >
              <Calendar className="h-3.5 w-3.5 text-gray-500" />
              <span>Out/2026</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-40 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200"
          >
            <DropdownMenuLabel className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Período
            </DropdownMenuLabel>
            {['Ago/2026', 'Set/2026', 'Out/2026'].map((p) => (
              <DropdownMenuItem
                key={p}
                className={cn(
                  'px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium',
                  p === 'Out/2026' ? 'bg-emerald-50 text-[#1B5E20]' : 'text-gray-700',
                )}
              >
                {p}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Direita: bandeiras (T9) + busca (T10) + sino + avatar */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* T9: bandeiras sem legenda */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
              aria-label="Idioma"
            >
              {BANDEIRAS.find((b) => b.key === idioma)?.node || BANDEIRAS[0].node}
              <ChevronDown className="h-3 w-3 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-16 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200"
          >
            {BANDEIRAS.map((b) => (
              <DropdownMenuItem
                key={b.key}
                onClick={() => trocarIdioma(b.key)}
                className={cn(
                  'px-2.5 py-2 rounded-lg cursor-pointer justify-center',
                  b.key === idioma ? 'bg-emerald-50' : '',
                )}
              >
                {b.node}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* T10: busca inteligente */}
        <button
          type="button"
          onClick={() => setBuscaAberta(true)}
          className="hidden md:flex items-center gap-2 w-48 lg:w-64 h-9 pl-3 pr-2 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-400 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
        >
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5 shadow-2xs">
            Ctrl+K
          </kbd>
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none"
              aria-label="Ver alertas"
            >
              <Bell className="h-5 w-5" />
              {alertasVisiveis.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red
                  {alertasVisiveis.length}
                </span>
              )}            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-80 md:w-96 p-0 bg-white rounded-xl shadow-xl border border-gray-200"
          >
            <div className="p-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60 rounded-t-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="font-semibold text-xs text-gray-900">
                  Alertas Críticos ({alertasVisiveis.length})
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {alertasVisiveis.map((alert) => (
                <div key={alert.id} className="p-3 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1 w-2 h-2 rounded-full shrink-0',
                        alert.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {alert.title}
                        </span>
                        {alert.detail && (
                          <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {alert.detail}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">
                        {alert.description}
                      </p>
                      {/* T2: Acessar (abre a tela de origem) + Ocultar (remove do sino) */}
                      <div className="flex items-center gap-3 mt-1.5">
                        {alert.rota && (
                          <button
                            type="button"
                            onClick={() => {
                              navigate(alert.rota!)
                            }}
                            className="text-[11px] font-semibold text-[#1B5E20] hover:underline"
                          >
                            Acessar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => ocultarAlerta(alert.id)}
                          className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
                        >
                          Ocultar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {alertasVisiveis.length === 0 && (
                <p className="text-center text-[12px] text-gray-400 py-8">
                  Nenhum alerta ativo — os ocultados podem voltar ao serem reavaliados.
                </p>
              )}
            </div>{' '}
          </PopoverContent>
        </Popover>

        {/* Avatar com menu: nome, cargo, timeout de inatividade, logout */}
        <DropdownMenu open={avatarOpen} onOpenChange={setAvatarOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-9 w-9 rounded-full bg-[#1B5E20] border border-emerald-800 flex items-center justify-center text-white shrink-0 hover:ring-2 hover:ring-[#1B5E20]/30 transition-all focus:outline-none"
              aria-label="Menu do usuário"
            >
              {user?.name ? (
                user.name
                  .split(' ')
                  .map((p: string) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              ) : (
                <User className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200"
          >
            <div className="px-2.5 py-2 border-b border-gray-100 mb-1">
              <div className="text-[13px] font-bold text-gray-900 truncate">{user?.name}</div>
              <div className="text-[11px] text-gray-500 truncate">{user?.email}</div>
            </div>
            <TimeoutMenuItem />
            <DropdownMenuItem
              onClick={() => signOut('manual')}
              className="px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-semibold text-red-600 hover:bg-red-50 focus:bg-red-50"
            >
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* T10 — overlay de busca */}
      {buscaAberta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
          onClick={() => setBuscaAberta(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 border-b border-gray-100">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setBuscaIdx(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown')
                    setBuscaIdx((i) => Math.min(i + 1, resultados.length - 1))
                  if (e.key === 'ArrowUp') setBuscaIdx((i) => Math.max(i - 1, 0))
                  if (e.key === 'Enter' && resultados[buscaIdx]) irPara(resultados[buscaIdx].rota)
                }}
                placeholder="Buscar módulos, tarefas, relatórios..."
                className="flex-1 h-12 text-[14px] outline-none bg-transparent"
              />
              <button
                onClick={() => setBuscaAberta(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1.5">
              {resultados.map((r, i) => (
                <button
                  key={r.rota}
                  type="button"
                  onClick={() => irPara(r.rota)}
                  className={cn(
                    'block w-full text-left px-4 py-2.5 text-[13px] font-medium',
                    i === buscaIdx
                      ? 'bg-emerald-50 text-[#1B5E20]'
                      : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {r.label}
                </button>
              ))}
              {busca.trim() && resultados.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-gray-400">
                  Nada encontrado para "{busca}".
                </p>
              )}
              {!busca.trim() && (
                <p className="px-4 py-6 text-[12px] text-gray-400">
                  Digite para buscar módulos do portal. Enter abre o resultado destacado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// Item de timeout de inatividade configurável (Fase 3)
function TimeoutMenuItem() {
  const { timeoutMin, setTimeoutMin } = useAuth()
  const [valor, setValor] = useState(String(timeoutMin))

  return (
    <div className="px-2.5 py-2 border-b border-gray-100 mb-1">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        Sair por inatividade
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={5}
          max={240}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-16 h-8 px-2 text-[13px] bg-gray-50 border border-gray-200 rounded-md text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
        />
        <span className="text-[12px] text-gray-500">min</span>
        <button
          type="button"
          onClick={() => setTimeoutMin(Math.max(5, Math.min(240, parseInt(valor, 10) || 30)))}
          className="ml-auto text-[12px] font-bold text-[#1B5E20] hover:underline"
        >
          Aplicar
        </button>
      </div>
    </div>
  )
}
