import { useState } from 'react'
import { Check, ChevronDown, Search, X, Tag, AlertCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DocumentosFiltroSelectPopoverProps {
  label: string // Ex: "Natureza", "Probabilidade"
  opcoes: string[] // Ex: ["Administrativa", "Cível", "Trabalhista"]
  valorSelecionado: string // "" para Todos
  onSelect: (valor: string) => void
  disabled?: boolean
  icone?: 'tag' | 'alerta'
  larguraTrigger?: string
}

export function DocumentosFiltroSelectPopover({
  label,
  opcoes,
  valorSelecionado,
  onSelect,
  disabled = false,
  icone = 'tag',
  larguraTrigger = 'max-w-[200px]',
}: DocumentosFiltroSelectPopoverProps) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const opcoesFiltradas = opcoes.filter((op) =>
    op.toLowerCase().includes(busca.trim().toLowerCase()),
  )

  const IconeComponente = icone === 'alerta' ? AlertCircle : Tag

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-8 px-2.5 text-xs bg-white border border-gray-200 hover:border-gray-300 font-medium text-gray-700 shadow-2xs flex items-center gap-1.5 justify-between',
            larguraTrigger,
            valorSelecionado && 'border-blue-400 bg-blue-50/50 text-blue-900 font-semibold',
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            <IconeComponente className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              {valorSelecionado ? `${label}: ${valorSelecionado}` : `${label}: Todos`}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 text-gray-400 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-2 bg-white rounded-xl shadow-xl border border-gray-200 z-50 space-y-1.5"
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Filtrar ${label.toLowerCase()}...`}
            className="h-7 pl-8 text-xs bg-gray-50 border-gray-200"
            autoFocus
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="max-h-52 overflow-y-auto space-y-0.5 pt-1">
          {/* Opção Todos */}
          <button
            type="button"
            onClick={() => {
              onSelect('')
              setAberto(false)
            }}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
              !valorSelecionado
                ? 'bg-blue-50 text-blue-900 font-semibold'
                : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            <span>Todos</span>
            {!valorSelecionado && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
          </button>

          {opcoesFiltradas.map((opcao) => {
            const isSelecionado =
              valorSelecionado.trim().toLowerCase() === opcao.trim().toLowerCase()
            return (
              <button
                key={opcao}
                type="button"
                onClick={() => {
                  onSelect(opcao)
                  setAberto(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
                  isSelecionado
                    ? 'bg-blue-50 text-blue-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span className="truncate">{opcao}</span>
                {isSelecionado && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
              </button>
            )
          })}

          {opcoesFiltradas.length === 0 && (
            <div className="p-2 text-[11px] text-gray-400 text-center">
              Nenhuma opção encontrada
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
