import React from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  FileBarChart,
  Boxes,
  ShoppingCart,
  Truck,
  Users2,
  Building2,
  UserCheck,
  Settings,
  Puzzle,
  Headphones,
  LogOut,
  X,
  Leaf,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

interface NavSection {
  title: string
  items: {
    label: string
    icon: React.ComponentType<{ className?: string }>
    active?: boolean
  }[]
}

const navSections: NavSection[] = [
  {
    title: 'GESTÃO',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, active: true },
      { label: 'Planejamento', icon: CalendarDays },
      { label: 'Relatórios', icon: FileBarChart },
    ],
  },
  {
    title: 'OPERAÇÃO',
    items: [
      { label: 'Estoque', icon: Boxes },
      { label: 'Compras', icon: ShoppingCart },
      { label: 'Logística', icon: Truck },
    ],
  },
  {
    title: 'RELACIONAMENTO',
    items: [
      { label: 'Clientes', icon: Users2 },
      { label: 'Fornecedores', icon: Building2 },
      { label: 'Equipes', icon: UserCheck },
    ],
  },
  {
    title: 'PLATAFORMA',
    items: [
      { label: 'Configurações', icon: Settings },
      { label: 'Integrações', icon: Puzzle },
      { label: 'Suporte', icon: Headphones },
    ],
  },
]

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <div className="flex flex-col h-full text-white">
      {/* Brand block no topo */}
      <div className="p-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-sm">
            <Leaf className="h-5 w-5 fill-emerald-400/20" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[15px] leading-tight tracking-tight text-white truncate">
              Portal de Gestão
            </span>
            <span className="text-[12px] font-medium text-emerald-200/80 tracking-tight">
              Executivo
            </span>
          </div>
        </div>

        {/* Versão v1.0.0 ACIMA da seção GESTÃO */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-[10px] font-semibold tracking-wider text-emerald-200/60 uppercase">
            Versão v1.0.0
          </span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>

      {/* Navegação com scroll suave se necessário */}
      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto scrollbar-none">
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-3 text-[11px] font-bold tracking-wider text-emerald-200/60 uppercase">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
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
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-emerald-100/75 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {/* Barra de acento à esquerda para item ativo (slide 150ms) */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-amber-400 rounded-r transition-all duration-150" />
                    )}

                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive ? 'text-amber-400' : 'text-emerald-200/70 group-hover:text-white',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé da sidebar: divisor + bloco de usuário + Sair */}
      <div className="p-3 border-t border-white/10 mt-auto bg-[#164e1b]/40">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5 mb-2">
          <div className="h-9 w-9 rounded-full bg-emerald-700 border border-emerald-400/40 flex items-center justify-center font-semibold text-xs text-white shrink-0 shadow-inner">
            LV
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight truncate">
              L. Venancio
            </div>
            <div className="text-[11px] text-emerald-200/70 leading-tight truncate">
              Administrador
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onItemClick) onItemClick()
          }}
          className="flex items-center w-full h-[36px] px-3 gap-3 rounded-lg text-[13px] font-medium text-emerald-100/75 hover:text-white hover:bg-white/10 transition-colors text-left"
        >
          <LogOut className="h-4 w-4 text-emerald-200/70" />
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
          {/* Overlay com fade */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer com slide */}
          <div className="relative flex flex-col w-[270px] max-w-[85vw] h-full bg-[#1B5E20] z-50 shadow-2xl animate-in slide-in-from-left duration-250">
            {/* Botão X para fechar */}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 p-1 rounded-md text-emerald-200 hover:text-white hover:bg-white/10 focus:outline-none"
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
