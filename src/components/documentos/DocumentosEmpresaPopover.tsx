import { useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DocumentosEmpresaPopoverProps {
  empresas: Array<{ id: string; nome: string; cor?: string }>
  valorSelecionado: string // "" para todos, ou nome da empresa
  onSelect: (empresaNome: string) => void
  disabled?: boolean
}

export function DocumentosEmpresaPopover({
  empresas,
  valorSelecionado,
  onSelect,
  disabled = false,
}: DocumentosEmpresaPopoverProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const empresasFiltradas = empresas.filter((e) =>
    (e.nome || '').toLowerCase().includes(busca.trim().toLowerCase()),
  )

  const empresaAtiva = empresas.find(
    (e) => (e.nome || '').trim().toLowerCase() === (valorSelecionado || '').trim().toLowerCase(),
  )

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 px-3 text-xs bg-white border border-gray-200 hover:border-gray-300 font-medium text-gray-700 shadow-2xs flex items-center gap-2 max-w-[210px] justify-between',
            valorSelecionado && 'border-emerald-500/60 bg-emerald-50/40 text-emerald-950',
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {valorSelecionado ? (
              <>
                <EmpresaIcon nome={valorSelecionado} className="h-4 w-4 shrink-0 rounded" />
                <span className="truncate">{valorSelecionado}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                <span className="text-gray-600">Empresa: Todas</span>
              </>
            )}
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2 bg-white rounded-xl shadow-xl border border-gray-200 z-50 space-y-1.5"
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa..."
            className="h-8 pl-8 text-xs bg-gray-50 border-gray-200"
            autoFocus
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1">
          {/* Opção Todas as Empresas */}
          <button
            type="button"
            onClick={() => {
              onSelect('')
              setAberto(false)
            }}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
              !valorSelecionado
                ? 'bg-emerald-50 text-emerald-900 font-semibold'
                : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
              <span>Todas as empresas</span>
            </div>
            {!valorSelecionado && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          </button>

          {empresasFiltradas.map((emp) => {
            const selecionada =
              (valorSelecionado || '').trim().toLowerCase() ===
              (emp.nome || '').trim().toLowerCase()
            return (
              <button
                key={emp.id || emp.nome}
                type="button"
                onClick={() => {
                  onSelect(emp.nome)
                  setAberto(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
                  selecionada
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  <EmpresaIcon nome={emp.nome} className="h-3.5 w-3.5" />{' '}
                  <span className="truncate">{emp.nome}</span>
                </div>
                {selecionada && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
              </button>
            )
          })}

          {empresasFiltradas.length === 0 && (
            <div className="py-3 text-center text-xs text-gray-400">Nenhuma empresa encontrada</div>
          )}
        </div>

        {valorSelecionado && (
          <div className="pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                onSelect('')
                setAberto(false)
              }}
              className="w-full text-center text-[11px] text-gray-500 hover:text-gray-800 py-1"
            >
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
