/**
 * Faixa Contextual sob as Abas de Documentos
 * Comunica visualmente que as colunas da tabela foram adaptadas especificamente ao tipo ativo.
 * Conforme Imagem 2 e Bloco 2 item 10.
 */

import React from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DocumentosFaixaContextualProps {
  labelTipo: string
  onPersonalizarColunas?: () => void
}

export function DocumentosFaixaContextual({
  labelTipo,
  onPersonalizarColunas,
}: DocumentosFaixaContextualProps) {
  return (
    <div className="w-full bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-900 transition-colors">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-emerald-700 shrink-0" />
        <span className="font-medium">
          Colunas adaptadas ao tipo <strong className="font-semibold">{labelTipo}</strong>
        </span>
      </div>

      {onPersonalizarColunas && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onPersonalizarColunas}
          className="h-7 px-2.5 text-xs text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/60 font-semibold"
        >
          Personalizar colunas
        </Button>
      )}
    </div>
  )
}
