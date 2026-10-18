import React, { useState } from 'react'
import {
  Menu,
  ChevronDown,
  Search,
  Bell,
  Check,
  AlertCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { CompanyId, COMPANIES } from '@/data/mockData'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function Topbar() {
  const { selectedCompany, setSelectedCompany, toggleSidebar, criticalAlerts } = useApp()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const activeCompany = COMPANIES.find((c) => c.id === selectedCompany) || COMPANIES[0]

  return (
    <header className="sticky top-0 z-30 h-16 w-full bg-white border-b border-[#E5E7EB] px-4 md:px-6 flex items-center justify-between shadow-xs">
      {/* Esquerda: Botão hambúrguer (mobile) + Seletor de empresas */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Botão hambúrguer apenas mobile */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg focus:outline-none"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Seletor de empresas com dropdown estilizado */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-gray-50/70 hover:bg-gray-100 text-[13.5px] font-semibold text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: activeCompany.color }}
              />
              <span className="tracking-tight">{activeCompany.name}</span>
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
                  {isSelected && <Check className="h-4 w-4 text-[#1B5E20]" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Direita: Chip de bandeira BRASIL + Busca decorativa + Sino com popover de alertas */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Chip de bandeira "BRASIL" (pequeno ícone 3x2 com label BR, não usar globo) */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 shadow-2xs select-none">
          {/* Bandeira estilizada do Brasil em proporção 3x2 */}
          <span
            className="relative inline-flex items-center justify-center w-[18px] h-[12px] rounded-[1.5px] overflow-hidden bg-[#009B3A] shrink-0 shadow-2xs"
            title="Brasil"
            aria-hidden="true"
          >
            {/* Losango amarelo */}
            <span
              className="absolute w-[13px] h-[8px] bg-[#FEDF00]"
              style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
            />
            {/* Círculo azul */}
            <span className="absolute w-[4.5px] h-[4.5px] rounded-full bg-[#002776]" />
          </span>
          <span className="tracking-wide text-[11px] font-bold text-gray-800">BR</span>
        </div>

        {/* Input de busca arredondado com ícone e placeholder "Buscar..." (decorativo) */}
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Buscar..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-gray-50 border border-gray-200 rounded-full text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]/40 transition-all"
          />
        </div>

        {/* Ícone de sino com badge vermelho contando os alertas críticos (hover/click abre lista) */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none"
              aria-label="Ver alertas"
            >
              <Bell className="h-5 w-5" />
              {criticalAlerts.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white leading-none shadow-xs animate-pulse">
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
              <span className="text-[10px] text-gray-500 font-medium">tempo real</span>
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
                        <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {alert.timeAgo}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5">
                        {alert.description}
                      </p>
                      {alert.company && (
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          {alert.company}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2 border-t border-gray-100 text-center bg-gray-50/50 rounded-b-xl">
              <span className="text-[11px] text-[#1B5E20] font-semibold cursor-pointer hover:underline">
                Visualizar todos os alertas no painel
              </span>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
