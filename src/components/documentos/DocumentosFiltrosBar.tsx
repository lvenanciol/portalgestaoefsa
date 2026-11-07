/**
 * Barra de Filtros em Linha Única para a tela /documentos
 * Conforme Imagem 2 e Bloco 2 da Especificação:
 * - Campo de busca ("Buscar por número, título, empresa ou órgão…")
 * - Segmented control de status (Todos | Regulares | Vencendo | Vencidos)
 * - Dropdown Empresa (Todas | FoldBox | Extrafruti | Casafruti)
 * - Dropdown Validade (Qualquer | 30 dias | 90 dias | Vencidos)
 * - Botão "Limpar filtros"
 */

import React from 'react'
import { Search, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'

export interface FiltrosDocumentosState {
  busca: string
  statusFiltro: 'todos' | 'regulares' | 'vencendo' | 'vencidos'
  empresa: string
  validade: 'qualquer' | '30' | '90' | 'vencidos'
}

export interface DocumentosFiltrosBarProps {
  filtros: FiltrosDocumentosState
  onFiltrosChange: (novos: Partial<FiltrosDocumentosState>) => void
  onLimparFiltros: () => void
  empresasDisponiveis?: string[]
}

export function DocumentosFiltrosBar({
  filtros,
  onFiltrosChange,
  onLimparFiltros,
  empresasDisponiveis = ['FoldBox', 'Extrafruti', 'Casafruti'],
}: DocumentosFiltrosBarProps) {
  const temFiltroAtivo =
    !!filtros.busca.trim() ||
    filtros.statusFiltro !== 'todos' ||
    (filtros.empresa !== '' && filtros.empresa !== 'todas') ||
    filtros.validade !== 'qualquer'

  return (
    <div className="w-full flex flex-wrap items-center gap-3">
      {/* 1. Campo de Busca */}
      <div className="relative flex-1 min-w-[280px]">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          value={filtros.busca}
          onChange={(e) => onFiltrosChange({ busca: e.target.value })}
          placeholder="Buscar por número, título, empresa ou órgão…"
          className="pl-9 pr-3 h-10 text-xs bg-white rounded-[10px] border-gray-200 focus-visible:ring-emerald-700 shadow-none placeholder:text-gray-400"
        />
      </div>

      {/* 2. Segmented Control de Status */}
      <div className="inline-flex items-center p-1 bg-gray-100/90 rounded-full border border-gray-200/80 text-xs shrink-0">
        <button
          type="button"
          onClick={() => onFiltrosChange({ statusFiltro: 'todos' })}
          className={`px-3 py-1.5 rounded-full font-semibold transition-all ${
            filtros.statusFiltro === 'todos'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => onFiltrosChange({ statusFiltro: 'regulares' })}
          className={`px-3 py-1.5 rounded-full font-semibold transition-all ${
            filtros.statusFiltro === 'regulares'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Regulares
        </button>
        <button
          type="button"
          onClick={() => onFiltrosChange({ statusFiltro: 'vencendo' })}
          className={`px-3 py-1.5 rounded-full font-semibold transition-all ${
            filtros.statusFiltro === 'vencendo'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Vencendo
        </button>
        <button
          type="button"
          onClick={() => onFiltrosChange({ statusFiltro: 'vencidos' })}
          className={`px-3 py-1.5 rounded-full font-semibold transition-all ${
            filtros.statusFiltro === 'vencidos'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Vencidos
        </button>
      </div>

      {/* 3. Dropdown Empresa */}
      <div className="w-[190px] shrink-0">
        <Select
          value={filtros.empresa || 'todas'}
          onValueChange={(val) => onFiltrosChange({ empresa: val === 'todas' ? '' : val })}
        >
          <SelectTrigger className="h-10 text-xs bg-white rounded-[10px] border-gray-200">
            {filtros.empresa ? (
              <div className="flex items-center gap-1.5 truncate">
                <EmpresaIcon
                  nome={filtros.empresa}
                  empresa={filtros.empresa}
                  size="xs"
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{filtros.empresa}</span>
              </div>
            ) : (
              <SelectValue placeholder="Empresa: Todas" />
            )}
          </SelectTrigger>
          <SelectContent className="text-xs rounded-xl">
            <SelectItem value="todas">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                <span>Empresa: Todas</span>
              </div>
            </SelectItem>
            {empresasDisponiveis.map((emp) => (
              <SelectItem key={emp} value={emp}>
                <div className="flex items-center gap-2">
                  <EmpresaIcon nome={emp} empresa={emp} size="xs" className="h-3.5 w-3.5" />
                  <span>{emp}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 4. Dropdown Validade */}
      <div className="w-[180px] shrink-0">
        <Select
          value={filtros.validade}
          onValueChange={(val: any) => onFiltrosChange({ validade: val })}
        >
          <SelectTrigger className="h-10 text-xs bg-white rounded-[10px] border-gray-200">
            <SelectValue placeholder="Validade: qualquer" />
          </SelectTrigger>
          <SelectContent className="text-xs rounded-xl">
            <SelectItem value="qualquer">Validade: qualquer</SelectItem>
            <SelectItem value="30">Próximos 30 dias</SelectItem>
            <SelectItem value="90">Próximos 90 dias</SelectItem>
            <SelectItem value="vencidos">Já vencidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 5. Botão Limpar Filtros */}
      {temFiltroAtivo && (
        <Button
          type="button"
          variant="outline"
          onClick={onLimparFiltros}
          className="h-10 px-3.5 rounded-[10px] text-xs font-semibold text-gray-700 hover:text-emerald-800 hover:border-emerald-300 gap-1.5 shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpar filtros
        </Button>
      )}
    </div>
  )
}
