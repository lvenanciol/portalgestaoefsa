import { useEffect, useRef, useState } from 'react'
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
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  Loader2,
  Zap,
  LayoutDashboard,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/hooks/use-auth'
import { aplicarIdiomaNoDOM, type Idioma } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { cn } from '@/lib/utils'

// Ajustes PGE — T9: bandeiras SEM legenda (BR/EUA/UE), troca de idioma real.
// T10→SDB-c (22/10): busca virou AUTOCOMPLETE INLINE no topbar (debounce 250ms,
// resultados abaixo da caixa: telas do banco (menus) + ações conhecidas; Enter
// ou clique navega — NUNCA navega automaticamente ao digitar).
// SDB-b (22/10): item "Perfil" no menu do usuário — dialog com dados da conta
// (nome/e-mail read-only, telefone/cargo editáveis) e TROCAR SENHA.
// SDB-d (22/10): botão de ocultar/exibir a sidebar (persistido, animado).
// T1: dropdown de empresas REMOVIDO do topbar — a troca é pela logo na sidebar.

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

// SDB-c — índice de busca: telas (fallback estático) + AÇÕES conhecidas.
// Telas reais vêm da coleção menus (banco); este fallback cobre banco vazio.
type BuscaItem = { label: string; rota: string; tipo: 'tela' | 'acao'; chaves: string }

const BUSCA_TELAS_FALLBACK: BuscaItem[] = [
  { label: 'Dashboard Executivo', rota: '/', tipo: 'tela', chaves: 'dashboard home início' },
  {
    label: 'Financeiro & Contábil',
    rota: '/financeiro',
    tipo: 'tela',
    chaves: 'financeiro contabil dre balancete fluxo',
  },
  {
    label: 'Desempenho por Unidade',
    rota: '/desempenho',
    tipo: 'tela',
    chaves: 'desempenho unidade ranking',
  },
  {
    label: 'Indicadores',
    rota: '/indicadores',
    tipo: 'tela',
    chaves: 'indicadores kpi meta semaforo',
  },
  {
    label: 'Documentos & Importações',
    rota: '/documentos',
    tipo: 'tela',
    chaves: 'documentos importacao balancete arquivo',
  },
  {
    label: 'Tarefas & Agenda',
    rota: '/tarefas',
    tipo: 'tela',
    chaves: 'tarefas agenda kanban chamado',
  },
  { label: 'Projetos', rota: '/projetos', tipo: 'tela', chaves: 'projetos marcos riscos raci' },
  { label: 'Atas & Reuniões', rota: '/atas', tipo: 'tela', chaves: 'atas reunioes pauta' },
  {
    label: 'Parceiros & Contatos',
    rota: '/parceiros',
    tipo: 'tela',
    chaves: 'parceiros contatos fornecedor cliente',
  },
  {
    label: 'Logomarcas',
    rota: '/logomarcas',
    tipo: 'tela',
    chaves: 'logomarcas marca identidade logo',
  },
  { label: 'E-mails', rota: '/emails', tipo: 'tela', chaves: 'emails mensagem compositor' },
  { label: 'Contratos', rota: '/contratos', tipo: 'tela', chaves: 'contratos locacao servico' },
  { label: 'Power BI', rota: '/power-bi', tipo: 'tela', chaves: 'power bi relatorio embed' },
  { label: 'IA Gemini Flash', rota: '/ia', tipo: 'tela', chaves: 'ia gemini inteligencia parecer' },
  { label: 'Árvore de Menus', rota: '/menus', tipo: 'tela', chaves: 'menus arvore sidebar' },
  {
    label: 'Controle de Acessos',
    rota: '/acessos',
    tipo: 'tela',
    chaves: 'acessos usuarios grupos permissoes',
  },
  {
    label: 'Configurações',
    rota: '/configuracoes',
    tipo: 'tela',
    chaves: 'configuracoes integracoes backup',
  },
]

const BUSCA_ACOES: BuscaItem[] = [
  {
    label: 'Sincronizar Sankhya agora',
    rota: '/integracoes/sankhya',
    tipo: 'acao',
    chaves: 'sankhya sync sincronizar erp atualizar',
  },
  {
    label: 'Testar conexões das integrações',
    rota: '/configuracoes',
    tipo: 'acao',
    chaves: 'testar conexao integracoes sankhya power bi gemini email',
  },
  {
    label: 'Importar demonstrativos (balancete/DRE)',
    rota: '/documentos',
    tipo: 'acao',
    chaves: 'importar demonstrativos balancete dre pdf xlsx planilha',
  },
  {
    label: 'Listar relatórios do Power BI',
    rota: '/power-bi',
    tipo: 'acao',
    chaves: 'power bi listar relatorios embed token',
  },
  {
    label: 'Gerenciar usuários e permissões',
    rota: '/acessos',
    tipo: 'acao',
    chaves: 'usuarios permissoes grupos acessos admin',
  },
  {
    label: 'Editar árvore de menus da sidebar',
    rota: '/menus',
    tipo: 'acao',
    chaves: 'menus editar arvore navegacao sidebar',
  },
]

export function Topbar() {
  const { toggleSidebar, sidebarCollapsed, toggleSidebarCollapsed, criticalAlerts } = useApp()
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
  const [perfilOpen, setPerfilOpen] = useState(false)
  const [idioma, setIdioma] = useState(() => {
    try {
      return localStorage.getItem(LS_IDIOMA) || 'pt-BR'
    } catch (_) {
      return 'pt-BR'
    }
  })

  // SDB-c: telas do banco (coleção menus) com realtime — CRUD reflete na busca
  const [menusDb, setMenusDb] = useState<any[] | null>(null)
  const carregarMenus = async () => {
    try {
      const r = await pb.collection('menus').getFullList({ sort: 'secao,ordem' })
      setMenusDb(r as any[])
    } catch (_) {
      setMenusDb(null)
    }
  }
  useEffect(() => {
    carregarMenus()
  }, [])
  useRealtime('menus', () => {
    carregarMenus()
  })

  // SDB-c: busca inline
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaDeb, setBuscaDeb] = useState('')
  const [buscaIdx, setBuscaIdx] = useState(0)
  const buscaInputRef = useRef<HTMLInputElement>(null)

  // debounce ~250ms — filtra só depois de a digitação parar
  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca), 250)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => {
    setBuscaIdx(0)
  }, [buscaDeb])

  const indiceBusca: BuscaItem[] = (() => {
    const telasDb: BuscaItem[] = (menusDb || [])
      .filter((m) => m.ativo !== false && m.rota)
      .map((m) => ({
        label: m.titulo,
        rota: m.rota,
        tipo: 'tela' as const,
        chaves: (m.secao || '') + ' ' + (m.titulo || ''),
      }))
    const telas = telasDb.length ? telasDb : BUSCA_TELAS_FALLBACK
    return [...telas, ...BUSCA_ACOES]
  })()

  const resultados = (() => {
    const q = buscaDeb.trim().toLowerCase()
    if (!q) return []
    return indiceBusca
      .filter((i) => (i.label + ' ' + i.chaves).toLowerCase().includes(q))
      .slice(0, 10)
  })()

  const irPara = (rota: string) => {
    setBuscaAberta(false)
    setBusca('')
    setBuscaDeb('')
    navigate(rota)
  }

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault()
        buscaInputRef.current?.focus()
        setBuscaAberta(true)
      }
      if (ev.key === 'Escape') setBuscaAberta(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

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

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white border-b border-[#E5E7EB] px-4 md:px-6 flex items-center justify-between shadow-xs">
      {/* Esquerda: colapso sidebar (desktop) + hambúrguer (mobile) + período */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* SDB-d: ocultar/exibir sidebar no desktop (estado persistido) */}
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          className="hidden lg:inline-flex p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg focus:outline-none"
          aria-label={sidebarCollapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
          title={sidebarCollapsed ? 'Exibir menu lateral' : 'Ocultar menu lateral'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg focus:outline-none"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* T1 (20/10): caixa "empresa" REMOVIDA — identidade segue na logo da sidebar */}

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

      {/* Direita: bandeiras (T9) + busca inline (SDB-c) + sino + avatar */}
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

        {/* SDB-c: AUTOCOMPLETE INLINE — digita aqui, resultados ABAIXO da caixa.
            Enter/clique navegam; nunca navega automaticamente ao digitar. */}
        <div className="relative hidden md:block">
          <div
            className={cn(
              'flex items-center gap-2 w-56 lg:w-72 h-9 pl-3 pr-2 bg-gray-50 border rounded-full text-xs transition-colors focus-within:ring-2 focus-within:ring-[#1B5E20]/20',
              buscaAberta ? 'border-[#1B5E20]/40 bg-white' : 'border-gray-200',
            )}
          >
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              ref={buscaInputRef}
              value={busca}
              onFocus={() => setBuscaAberta(true)}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setBuscaAberta(true)
                  setBuscaIdx((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)))
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setBuscaIdx((i) => Math.max(i - 1, 0))
                }
                if (e.key === 'Enter') {
                  const alvo = resultados[buscaIdx] || resultados[0]
                  if (alvo) irPara(alvo.rota)
                }
                if (e.key === 'Escape') setBuscaAberta(false)
              }}
              placeholder="Buscar telas e ações..."
              className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400"
              aria-label="Buscar telas e ações"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => {
                  setBusca('')
                  buscaInputRef.current?.focus()
                }}
                className="p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5 shadow-2xs">
                Ctrl+K
              </kbd>
            )}
          </div>

          {/* Dropdown de resultados (abaixo da caixa) */}
          {buscaAberta && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setBuscaAberta(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-11 z-50 w-80 lg:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="max-h-80 overflow-y-auto py-1.5">
                  {resultados.map((r, i) => (
                    <button
                      key={r.tipo + r.rota + r.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => irPara(r.rota)}
                      className={cn(
                        'flex items-center gap-2.5 w-full text-left px-3.5 py-2.5 text-[13px] font-medium',
                        i === buscaIdx
                          ? 'bg-emerald-50 text-[#1B5E20]'
                          : 'text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      {r.tipo === 'acao' ? (
                        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      )}
                      <span className="flex-1 truncate">{r.label}</span>
                      <span
                        className={cn(
                          'text-[9px] font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded',
                          r.tipo === 'acao'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-gray-100 text-gray-400',
                        )}
                      >
                        {r.tipo === 'acao' ? 'Ação' : 'Tela'}
                      </span>
                    </button>
                  ))}
                  {buscaDeb.trim() && resultados.length === 0 && (
                    <p className="px-4 py-6 text-center text-[13px] text-gray-400">
                      Nenhum resultado
                    </p>
                  )}
                  {!buscaDeb.trim() && (
                    <p className="px-4 py-4 text-[12px] text-gray-400">
                      Digite para buscar telas e ações do portal. Enter abre o resultado destacado.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none"
              aria-label="Ver alertas"
            >
              <Bell className="h-5 w-5" />
              {alertasVisiveis.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {alertasVisiveis.length}
                </span>
              )}
            </button>
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

        {/* Avatar com menu: nome, cargo, Perfil (SDB-b), timeout, logout */}
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
            <DropdownMenuItem
              onClick={() => {
                setAvatarOpen(false)
                setPerfilOpen(true)
              }}
              className="px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-semibold text-gray-800 hover:bg-gray-50 focus:bg-gray-50"
            >
              <User className="h-4 w-4 mr-2 text-gray-500" /> Perfil
            </DropdownMenuItem>
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

      {/* SDB-b: dialog Perfil — dados da conta + trocar senha */}
      <PerfilDialog open={perfilOpen} onOpenChange={setPerfilOpen} />
    </header>
  )
}

// SDB-b — Perfil: nome/e-mail read-only; telefone/cargo editáveis (se existirem
// no registro); TROCAR SENHA (senha atual + nova + confirmar). Toasts de
// sucesso/erro. Self-update permitido (updateRule id = @request.auth.id).
function PerfilDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { user } = useAuth()
  const { empresas } = useApp()
  const [telefone, setTelefone] = useState('')
  const [cargo, setCargo] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  useEffect(() => {
    if (open && user) {
      setTelefone(user.telefone || '')
      setCargo(user.cargo || '')
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmar('')
    }
  }, [open, user])

  const empresaNome = empresas.find((e) => e.id === user?.empresa_id)?.nome || ''

  const salvarPerfil = async () => {
    if (!user) return
    setSalvandoPerfil(true)
    try {
      await pb.collection('users').update(user.id, { telefone, cargo })
      toast({ title: 'Perfil salvo', description: 'Dados atualizados com sucesso.' })
      onOpenChange(false)
    } catch (e) {
      toast({
        title: 'Erro ao salvar perfil',
        description: getErrorMessage(e),
        variant: 'destructive',
      })
    } finally {
      setSalvandoPerfil(false)
    }
  }

  const trocarSenha = async () => {
    if (!user) return
    if (!senhaAtual || !novaSenha || !confirmar) {
      toast({
        title: 'Preencha os 3 campos de senha',
        description: 'Senha atual, nova senha e confirmação são obrigatórios.',
        variant: 'destructive',
      })
      return
    }
    if (novaSenha.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve ter pelo menos 8 caracteres.',
        variant: 'destructive',
      })
      return
    }
    if (novaSenha !== confirmar) {
      toast({
        title: 'Senhas não conferem',
        description: 'A confirmação deve ser igual à nova senha.',
        variant: 'destructive',
      })
      return
    }
    setTrocandoSenha(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword: senhaAtual,
        password: novaSenha,
        passwordConfirm: confirmar,
      })
      toast({ title: 'Senha alterada', description: 'Use a nova senha no próximo login.' })
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmar('')
    } catch (e) {
      toast({
        title: 'Erro ao trocar senha',
        description: getErrorMessage(e) || 'Verifique a senha atual e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setTrocandoSenha(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>Dados da sua conta e segurança de acesso.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Nome
              </Label>
              <Input value={user?.name || ''} readOnly className="h-10 bg-gray-100 text-gray-600" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                E-mail
              </Label>
              <Input
                value={user?.email || ''}
                readOnly
                className="h-10 bg-gray-100 text-gray-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Telefone
              </Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(27) 99999-9999"
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Cargo
              </Label>
              <Input
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex.: Diretor"
                className="h-10 bg-gray-50"
              />
            </div>
          </div>

          {empresaNome && (
            <div className="grid gap-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Empresa
              </Label>
              <Input value={empresaNome} readOnly className="h-10 bg-gray-100 text-gray-600" />
            </div>
          )}

          <Button
            onClick={salvarPerfil}
            disabled={salvandoPerfil}
            className="h-9 w-full bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
          >
            {salvandoPerfil && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Salvar dados
          </Button>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              <span className="text-[12px] font-bold text-gray-800 uppercase tracking-wider">
                Trocar senha
              </span>
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                placeholder="Senha atual"
                className="h-10 bg-gray-50"
                autoComplete="current-password"
              />
              <Input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Nova senha (mín. 8 caracteres)"
                className="h-10 bg-gray-50"
                autoComplete="new-password"
              />
              <Input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Confirmar nova senha"
                className="h-10 bg-gray-50"
                autoComplete="new-password"
              />
              <Button
                variant="outline"
                onClick={trocarSenha}
                disabled={trocandoSenha}
                className="h-9 w-full"
              >
                {trocandoSenha && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Alterar senha
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="sr-only" />
      </DialogContent>
    </Dialog>
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
