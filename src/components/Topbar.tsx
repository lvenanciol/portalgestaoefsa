import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronDown, Search, Bell, AlertCircle, Clock, User, Menu } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/hooks/use-auth'
import { CompanyId, COMPANIES } from '@/data/mockData'
import { marcaAtiva } from '@/pages/ConfiguracoesCompletaPage'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function Topbar() {
  const { selectedCompany, setSelectedCompany, toggleSidebar, criticalAlerts } = useApp()
  const { user, signOut } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)

  const activeCompany = COMPANIES.find((c) => c.id === selectedCompany) || COMPANIES[0]

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white border-b border-[#E5E7EB] px-4 md:px-6 flex items-center justify-between shadow-xs">
      {/* Esquerda: hambúrguer (mobile) + seletor de empresas com mini-logo + período */}
      <div className="flex items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg focus:outline-none"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-gray-50/70 hover:bg-gray-100 text-[13.5px] font-semibold text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
            >
              {(() => {
                const marca = marcaAtiva()
                return (
                  <>
                    <span
                      className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-white font-bold text-[10px]"
                      style={{ backgroundColor: marca.cor }}
                    >
                      {marca.sigla}
                    </span>
                    <span className="tracking-tight">{marca.nome}</span>
                  </>
                )
              })()}
              <span className="tracking-tight text-gray-500">{activeCompany.name}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-gray-500 transition-transform duration-200',
                  dropdownOpen && 'rotate-180',
                )}
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="w-52 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200 animate-in fade-in-80 zoom-in-95 duration-150"
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Empresas do Grupo
            </div>
            {COMPANIES.map((company) => {
              const isSelected = company.id === selectedCompany
              return (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => setSelectedCompany(company.id as CompanyId)}
                  className={cn(
                    'flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors',
                    isSelected ? 'bg-emerald-50 text-[#1B5E20]' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: company.color }}
                    />
                    <span>{company.name}</span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

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

      {/* Direita: bandeira BRASIL ▾ + busca Ctrl+K + sino + avatar com logout */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-bold text-gray-800 tracking-wide select-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
            >
              <span
                className="relative inline-flex items-center justify-center w-[18px] h-[12px] rounded-[1.5px] overflow-hidden bg-[#009B3A] shrink-0 shadow-2xs"
                title="Brasil"
                aria-hidden="true"
              >
                <span
                  className="absolute w-[13px] h-[8px] bg-[#FEDF00]"
                  style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
                />
                <span className="absolute w-[4.5px] h-[4.5px] rounded-full bg-[#002776]" />
              </span>
              <span>BRASIL</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-36 p-1.5 bg-white rounded-xl shadow-lg border border-gray-200"
          >
            <DropdownMenuItem className="px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium bg-emerald-50 text-[#1B5E20]">
              Brasil
            </DropdownMenuItem>
            <DropdownMenuItem className="px-2.5 py-2 rounded-lg cursor-pointer text-[13px] font-medium text-gray-700">
              English
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
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
              {criticalAlerts.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white leading-none shadow-xs">
                  {criticalAlerts.length}
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
                  Alertas Críticos ({criticalAlerts.length})
                </span>
              </div>
            </div>

            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {criticalAlerts.map((alert) => (
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
