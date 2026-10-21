import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Briefcase,
  BarChart3,
  LineChart,
  FileText,
  CalendarDays,
  FolderKanban,
  Users,
  Mail,
  FileCheck2,
  ChartColumnBig,
  Sparkles,
  ListTree,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  Leaf,
  ChevronDown,
  Plug,
  Database,
  MessageCircle,
  FileText,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/hooks/use-auth'
import { carregarPermissoes, menuVisivel, Permissoes } from '@/services/permissoes-service'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { idiomaSalvo, traduzir } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface NavSection {
  title: string
  items: {
    label: string
    rota: string
    icon: React.ComponentType<{ className?: string }>
    active?: boolean
  }[]
}

// SPEC mockup: menu seccionado completo — rota casa com MENU_MODULOS
const navSections: NavSection[] = [
  {
    title: 'GESTÃO',
    items: [
      { label: 'Dashboard Executivo', rota: '/', icon: LayoutDashboard, active: true },
      { label: 'Financeiro & Contábil', rota: '/financeiro', icon: Briefcase },
      { label: 'Desempenho por Unidade', rota: '/desempenho', icon: BarChart3 },
      { label: 'Indicadores', rota: '/indicadores', icon: LineChart },
    ],
  },
  {
    title: 'OPERAÇÃO',
    items: [
      { label: 'Documentos & Importações', rota: '/documentos', icon: FileText },
      { label: 'Tarefas & Agenda', rota: '/tarefas', icon: CalendarDays },
      { label: 'Projetos', rota: '/projetos', icon: FolderKanban },
      { label: 'Atas & Reuniões', rota: '/atas', icon: Users },
    ],
  },
  {
    title: 'RELACIONAMENTO',
    items: [
      { label: 'E-mails', rota: '/emails', icon: Mail },
      { label: 'Contratos', rota: '/contratos', icon: FileCheck2 },
    ],
  },
  {
    title: 'PLATAFORMA',
    items: [
      { label: 'Power BI', rota: '/power-bi', icon: ChartColumnBig },
      { label: 'IA Gemini Flash', rota: '/ia', icon: Sparkles },
      { label: 'Árvore de Menus', rota: '/menus', icon: ListTree },
      { label: 'Controle de Acessos', rota: '/acessos', icon: ShieldCheck },
      { label: 'Configurações', rota: '/configuracoes', icon: Settings },
    ],
  },
  {
    title: 'INTEGRAÇÕES',
    items: [
      { label: 'Status Integrações', rota: '/integracoes', icon: Plug },
      { label: 'Sankhya', rota: '/integracoes/sankhya', icon: Database },
      { label: 'WhatsApp', rota: '/integracoes/whatsapp', icon: MessageCircle },
    ],
  },
]

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const { user, signOut } = useAuth()
  const { selectedCompany, setSelectedCompany, empresas } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)
  const [menusDb, setMenusDb] = useState<any[] | null>(null)
  const [idiomaTick, setIdiomaTick] = useState(0)
  const [seletorEmpresas, setSeletorEmpresas] = useState(false)
  // T4d (21/10): logos REAIS da coleção logomarcas (upload na tela Logomarcas)
  const [logos, setLogos] = useState<any[]>([])

  useEffect(() => {
    carregarPermissoes().then(setPermissoes)
    ;(async () => {
      try {
        const r = await pb.collection('logomarcas').getFullList()
        setLogos(r as any[])
      } catch (_e) {
        setLogos([])
      }
    })()
  }, [user])

  // i18n: re-renderiza quando o idioma muda (evento global disparado pelas Configurações)
  useEffect(() => {
    const h = () => setIdiomaTick((t) => t + 1)
    window.addEventListener('pge_idioma_change', h)
    return () => window.removeEventListener('pge_idioma_change', h)
  }, [])

  // Fase 10 — sidebar DINÂMICA: lê a árvore de menus do banco (CRUD reflete
  // em tempo real via realtime) e mescla com o fallback estático por rota.
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

  // seções: do banco (se houver) mescladas com o estático (ícone/rota)
  const secoesDinamicas: NavSection[] = (() => {
    if (!menusDb || menusDb.length === 0) return navSections
    const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
      dashboard: LayoutDashboard,
      briefcase: Briefcase,
      'bar-chart': BarChart3,
      'line-chart': LineChart,
      'file-text': FileText,
      calendar: CalendarDays,
      folder: FolderKanban,
      users: Users,
      mail: Mail,
      'file-check': FileCheck2,
      chart: ChartColumnBig,
      sparkles: Sparkles,
      'list-tree': ListTree,
      shield: ShieldCheck,
      settings: Settings,
      plug: Plug,
      database: Database,
      message: MessageCircle,
    }
    const ordemSecoes = ['GESTÃO', 'OPERAÇÃO', 'RELACIONAMENTO', 'PLATAFORMA', 'INTEGRAÇÕES']
    const out: NavSection[] = []
    for (const sec of ordemSecoes) {
      const itens = menusDb
        .filter((m) => m.secao === sec && m.ativo)
        .sort((a, b) => (a.ordem || 99) - (b.ordem || 99))
        .map((m) => ({
          label: m.titulo,
          rota: m.rota || '',
          icon: ICONES[m.icone] || FolderKanban,
        }))
        .filter((i) => i.rota)
      if (itens.length) out.push({ title: sec, items: itens })
    }
    return out.length ? out : navSections
  })()

  return (
    <div className="flex flex-col h-full text-white">
      {/* Brand block: logo CLICÁVEL — abre seletor de empresas (T1) */}
      <div className="p-5 pb-3 relative">
        <button
          type="button"
          onClick={() => setSeletorEmpresas((o) => !o)}
          className="w-full flex items-center gap-2.5 rounded-lg hover:bg-white/10 transition-colors p-1.5 -m-1.5 focus:outline-none"
          title="Trocar empresa"
        >
          <div className="h-9 w-9 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center text-white shadow-sm overflow-hidden">
            {(() => {
              const emp = empresas.find((e) => e.id === selectedCompany)
              // T4d: logo REAL da coleção logomarcas (por nome da empresa)
              const logoRec = emp ? logos.find((l) => l.empresa === emp.nome) : null
              const logoUrl = logoRec && logoRec.logo ? pb.files.getURL(logoRec, logoRec.logo) : ''
              if (logoUrl && !logoUrl.toLowerCase().endsWith('.pdf')) {
                return (
                  <img
                    src={logoUrl}
                    alt={emp?.nome || 'logo'}
                    className="h-full w-full object-contain p-1"
                  />
                )
              }
              if (logoUrl && logoUrl.toLowerCase().endsWith('.pdf')) {
                return <FileText className="h-5 w-5 text-white" />
              }
              if (emp) {
                return (
                  <span
                    className="h-full w-full flex items-center justify-center font-bold text-[11px]"
                    style={{ backgroundColor: emp.cor }}
                  >
                    {emp.nome.slice(0, 2).toUpperCase()}
                  </span>
                )
              }
              const logoEx = logos.find((l) => l.empresa === 'Extrafruti')
              const urlEx = logoEx && logoEx.logo ? pb.files.getURL(logoEx, logoEx.logo) : ''
              if (urlEx && !urlEx.toLowerCase().endsWith('.pdf')) {
                return (
                  <img src={urlEx} alt="Extrafruti" className="h-full w-full object-contain p-1" />
                )
              }
              return <Leaf className="h-5 w-5" />
            })()}
          </div>
          <div className="flex flex-col min-w-0 text-left">
            <span className="font-bold text-[15px] leading-tight tracking-tight text-white truncate">
              {(() => {
                const emp = empresas.find((e) => e.id === selectedCompany)
                return emp ? emp.nome : 'extrafruti'
              })()}
            </span>
            <span className="text-[11px] font-medium text-emerald-100/80 tracking-tight truncate">
              Portal de Gestão Executivo
            </span>
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 ml-auto text-emerald-100/60 transition-transform',
              seletorEmpresas && 'rotate-180',
            )}
          />
        </button>

        {/* Seletor de empresas (popover ancorado ao bloco de marca) */}
        {seletorEmpresas && (
          <div className="absolute left-5 right-5 top-[76px] z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-1.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Empresas do Grupo
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCompany('')
                setSeletorEmpresas(false)
                if (onItemClick) onItemClick()
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors',
                !selectedCompany
                  ? 'bg-emerald-50 text-[#1B5E20]'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
              Consolidado (todas)
            </button>
            {empresas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSelectedCompany(e.id)
                  setSeletorEmpresas(false)
                  if (onItemClick) onItemClick()
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors',
                  selectedCompany === e.id
                    ? 'bg-emerald-50 text-[#1B5E20]'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: e.cor }}
                />
                {e.nome}
              </button>
            ))}
          </div>
        )}

        {/* v1.0.0 acima da seção GESTÃO */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-[10px] font-semibold tracking-wider text-emerald-100/60 uppercase">
            v1.0.0
          </span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
        </div>
      </div>

      {/* Navegação — item SEM permissão fica OCULTO (Fase 3) */}
      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto scrollbar-none">
        {secoesDinamicas.map((section) => {
          const visiveis = section.items.filter((item) => menuVisivel(permissoes, item.rota))
          if (visiveis.length === 0) return null
          return (
            <div key={section.title} className="space-y-1">
              <div className="px-3 text-[11px] font-bold tracking-wider text-emerald-100/60 uppercase">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {visiveis.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.rota === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.rota)
                  // i18n: rótulo do dicionário pela rota (fallback = label do banco/estático)
                  const CHAVES_I18N: Record<string, string> = {
                    '/': 'dashboard',
                    '/financeiro': 'financeiro',
                    '/desempenho': 'desempenho',
                    '/indicadores': 'indicadores',
                    '/documentos': 'documentos',
                    '/tarefas': 'tarefas',
                    '/projetos': 'projetos',
                    '/atas': 'atas',
                    '/emails': 'emails',
                    '/contratos': 'contratos',
                    '/power-bi': 'powerbi',
                    '/ia': 'ia',
                    '/menus': 'menus',
                    '/acessos': 'acessos',
                    '/configuracoes': 'configuracoes',
                  }
                  const chave = CHAVES_I18N[item.rota]
                  const rotulo = chave ? traduzir(idiomaSalvo(), chave) : item.label

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        navigate(item.rota)
                        if (onItemClick) onItemClick()
                      }}
                      className={cn(
                        'group relative flex items-center w-full h-[36px] px-3 gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150 text-left',
                        isActive
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'text-emerald-50/80 hover:text-white hover:bg-white/5',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-300 rounded-r transition-all duration-150" />
                      )}

                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive
                            ? 'text-emerald-300'
                            : 'text-emerald-100/70 group-hover:text-white',
                        )}
                      />
                      <span className="truncate">{rotulo}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Rodapé: usuário logado + Sair */}
      <div className="p-3 border-t border-white/10 mt-auto bg-black/10">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5 mb-2">
          <div className="h-9 w-9 rounded-full bg-emerald-700 border border-emerald-300/40 flex items-center justify-center font-semibold text-xs text-white shrink-0 shadow-inner">
            {user?.name
              ? user.name
                  .split(' ')
                  .map((p: string) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight truncate">
              {user?.name || 'Usuário'}
            </div>
            <div className="text-[11px] text-emerald-100/70 leading-tight truncate">
              {user?.cargo || 'Usuário'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            signOut('manual')
            if (onItemClick) onItemClick()
          }}
          className="flex items-center w-full h-[36px] px-3 gap-3 rounded-lg text-[13px] font-medium text-emerald-50/80 hover:text-white hover:bg-white/10 transition-colors text-left"
        >
          <LogOut className="h-4 w-4 text-emerald-100/70" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useApp()

  return (
    <>
      {/* Desktop Sidebar (fixa, 260px, #1B5E20) */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 w-[260px] bg-[#1B5E20] z-40 border-r border-emerald-950/30 select-none shadow-lg">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          <div className="relative flex flex-col w-[270px] max-w-[85vw] h-full bg-[#1B5E20] z-50 shadow-2xl animate-in slide-in-from-left duration-250">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 p-1 rounded-md text-emerald-100 hover:text-white hover:bg-white/10 focus:outline-none"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>

            <SidebarContent onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
