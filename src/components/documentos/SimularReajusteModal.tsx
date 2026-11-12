/**
 * SimularReajusteModal.tsx
 * Modal de simulação de reajuste contratual
 * Permite selecionar índice (IGP-M, IPCA, INPC), percentual acumulado aplicável
 * e calcula automaticamente o novo valor mensal e anual projetado.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calculator, TrendingUp, CheckCircle2 } from 'lucide-react'
import { formatarBRL } from './documentos-moeda-utils'

export interface SimularReajusteModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  valorMensalAtual: number
  indiceAtual?: string
  tituloDocumento?: string
  onAplicarSimulacao?: (novoValor: number, indice: string, percentual: number) => void
}

export function SimularReajusteModal({
  aberto,
  onOpenChange,
  valorMensalAtual,
  indiceAtual = 'IGP-M',
  tituloDocumento = 'Contrato',
  onAplicarSimulacao,
}: SimularReajusteModalProps) {
  const [indice, setIndice] = useState(indiceAtual)
  const [percentual, setPercentual] = useState<number>(4.85)

  const valorBase = valorMensalAtual > 0 ? valorMensalAtual : 0
  const taxa = (Number(percentual) || 0) / 100
  const acrescimo = valorBase * taxa
  const novoValorMensal = valorBase + acrescimo
  const novoValorAnual = novoValorMensal * 12

  const formatarMoeda = (val: number) => formatarBRL(val)

  const handleConfirmar = () => {
    if (onAplicarSimulacao) {
      onAplicarSimulacao(novoValorMensal, indice, percentual)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mb-2">
            <Calculator className="h-5 w-5" />
          </div>
          <DialogTitle className="text-base font-bold text-gray-900">
            Simular Reajuste Contratual
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {tituloDocumento} · Projeção com base no índice acumulado
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card com valor atual */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Valor mensal atual</span>
            <span className="font-mono text-sm font-bold text-gray-900">
              {formatarMoeda(valorBase)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                Índice
              </Label>
              <select
                value={indice}
                onChange={(e) => setIndice(e.target.value)}
                className="mt-1 w-full h-9 rounded-[10px] border border-gray-300 bg-white px-3 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="IGP-M">IGP-M (FGV)</option>
                <option value="IPCA">IPCA (IBGE)</option>
                <option value="INPC">INPC (IBGE)</option>
                <option value="FIPE-ZAP">FIPE-ZAP</option>
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-500">
                Variação (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={percentual}
                onChange={(e) => setPercentual(parseFloat(e.target.value) || 0)}
                className="mt-1 h-9 rounded-[10px] text-xs font-mono font-medium"
              />
            </div>
          </div>

          {/* Resultado Projetado */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
            <div className="flex items-center gap-1.5 text-blue-900 text-xs font-bold uppercase tracking-wider">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Projeção calculada
            </div>

            <div className="flex items-baseline justify-between pt-1 border-t border-blue-200/60">
              <span className="text-xs text-blue-900">Novo valor mensal</span>
              <span className="font-mono text-lg font-black text-blue-950">
                {formatarMoeda(novoValorMensal)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-blue-800">
              <span>Projeção anual (12 meses)</span>
              <span className="font-mono font-semibold">{formatarMoeda(novoValorAnual)}</span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-blue-700 pt-1">
              <span>Acréscimo mensal projetado</span>
              <span className="font-mono font-medium">+{formatarMoeda(acrescimo)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9 rounded-full"
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmar}
            className="text-xs h-9 bg-blue-700 hover:bg-blue-800 text-white rounded-full font-semibold gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aplicar Projeção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
