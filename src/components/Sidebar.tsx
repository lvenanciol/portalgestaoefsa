import React, { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/hooks/use-auth'
import { carregarPermissoes, menuVisivel, Permissoes } from '@/services/permissoes-service'
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
]

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const { user, signOut } = useAuth()
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)

  useEffect(() => {
    carregarPermissoes().then(setPermissoes)
  }, [user])

  return (
    <div className="flex flex-col h-full text-white">
      {/* Brand block: logo Extrafruti versão clara + subtítulo */}
      <div className="p-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center text-white shadow-sm">
            <Leaf className="h-5 w-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[15px] leading-tight tracking-tight text-white truncate">
              extrafruti
            </span>
            <span className="text-[11px] font-medium text-emerald-100/80 tracking-tight truncate">
              Portal de Gestão Executivo
            </span>
          </div>
        </div>

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
        {navSections.map((section) => {
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
                  const isActive = item.active

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
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
                      <span className="truncate">{item.label}</span>
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
