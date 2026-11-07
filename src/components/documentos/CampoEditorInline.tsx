/**
 * CampoEditorInline — edição de um campo único na própria tela de detalhe.
 *
 * Diálogo pontual (não é o modal genérico antigo): abre a partir do clique
 * "editar" num campo da tela dedicada, salva via PocketBase e devolve o
 * registro atualizado. Usado por DetalheAlvaraView, DetalheContratoView,
 * DetalheLocacaoView, DetalheAtaView e DetalheJuridicoView.
 */

import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'

export type TipoCampoEditor =
  | 'texto'
  | 'numero'
  | 'data'
  | 'textarea'
  | 'select'
  | 'moeda'
  | 'boolean'

export interface DefinicaoCampo {
  /** Nome do campo no PocketBase */
  campo?: string
  /** Alias para campo */
  chave?: string
  /** Rótulo exibido no diálogo */
  rotulo: string
  tipo?: TipoCampoEditor
  /** Opções para tipo select (value/label ou valor/rotulo) */
  opcoes?: Array<{ value?: string; label?: string; valor?: string; rotulo?: string }>
  /** Placeholder/instrução curta */
  placeholder?: string
  /** Descrição de ajuda exibida sob o rótulo */
  descricao?: string
  /** Campo obrigatório */
  obrigatorio?: boolean
}

interface CampoEditorInlineProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  /** Coleção PocketBase (alvaras, contratos, atas, processos_juridicos) */
  colecao: string
  /** Registro original (precisa ter .id) */
  documento: any
  /** Campo(s) a editar — um único campo ou vários em um diálogo */
  campos: DefinicaoCampo[]
  /** Chamado com o registro atualizado após salvar */
  onSalvo?: (registro: any) => void
}

export function CampoEditorInline({
  aberto,
  onOpenChange,
  colecao,
  documento,
  campos,
  onSalvo,
}: CampoEditorInlineProps) {
  const [valores, setValores] = useState<Record<string, any>>({})
  const [salvando, setSalvando] = useState(false)

  // Popula os valores quando o diálogo abre
  useEffect(() => {
    if (aberto && documento) {
      const iniciais: Record<string, any> = {}
      campos.forEach((c) => {
        const chave = c.campo || c.chave || ''
        if (!chave) return
        const bruto = documento[chave]
        if (c.tipo === 'boolean') iniciais[chave] = Boolean(bruto)
        else if (c.tipo === 'numero' || c.tipo === 'moeda') iniciais[chave] = bruto ?? ''
        else iniciais[chave] = bruto ?? ''
      })
      setValores(iniciais)
    }
  }, [aberto, documento, campos])

  const salvar = async () => {
    if (!documento?.id) return
    setSalvando(true)
    try {
      const payload: Record<string, any> = {}
      campos.forEach((c) => {
        const chave = c.campo || c.chave || ''
        if (!chave) return
        let v = valores[chave]
        if (c.tipo === 'numero' || c.tipo === 'moeda') {
          v = v === '' || v === null || v === undefined ? null : Number(v)
          if (Number.isNaN(v)) v = null
        } else if (c.tipo === 'data') {
          v = v === '' || v === null || v === undefined ? null : String(v).slice(0, 10)
        } else if (c.tipo === 'texto' || c.tipo === 'textarea' || c.tipo === 'select') {
          v = typeof v === 'string' ? v.trim() : v
          if (v === '') v = null
        } else if (c.tipo === 'boolean') {
          v = Boolean(v)
        }
        payload[chave] = v
      })

      const atualizado = await pb.collection(colecao).update(documento.id, payload)
      toast({
        title: 'Dados atualizados',
        description: 'Alteração salva no documento.',
      })
      onSalvo?.(atualizado)
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar a alteração.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const unico = campos.length === 1 ? campos[0] : null

  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="bg-white max-w-lg rounded-2xl border border-gray-200 shadow-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            {unico ? `Editar ${unico.rotulo.toLowerCase()}` : 'Editar dados do documento'}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            A alteração é salva direto na tela de detalhe, sem sair dela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {campos.map((c, idx) => {
            const chave = c.campo || c.chave || `campo_${idx}`
            return (
              <div key={chave} className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-600">
                  {c.rotulo}
                </Label>
                {c.descricao && <p className="text-[11px] text-gray-500">{c.descricao}</p>}

                {(!c.tipo || c.tipo === 'texto') && (
                  <Input
                    value={valores[chave] ?? ''}
                    onChange={(e) => setValores((p) => ({ ...p, [chave]: e.target.value }))}
                    placeholder={c.placeholder}
                    className="rounded-[10px] h-9 text-xs"
                  />
                )}

                {c.tipo === 'textarea' && (
                  <Textarea
                    value={valores[chave] ?? ''}
                    onChange={(e) => setValores((p) => ({ ...p, [chave]: e.target.value }))}
                    placeholder={c.placeholder}
                    className="rounded-[10px] min-h-[90px] text-xs"
                  />
                )}

                {c.tipo === 'numero' && (
                  <Input
                    type="number"
                    value={valores[chave] ?? ''}
                    onChange={(e) => setValores((p) => ({ ...p, [chave]: e.target.value }))}
                    placeholder={c.placeholder}
                    className="rounded-[10px] h-9 text-xs"
                  />
                )}

                {c.tipo === 'moeda' && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">
                      R$
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      value={valores[chave] ?? ''}
                      onChange={(e) => setValores((p) => ({ ...p, [chave]: e.target.value }))}
                      placeholder={c.placeholder || '0,00'}
                      className="rounded-[10px] h-9 text-xs pl-9"
                    />
                  </div>
                )}

                {c.tipo === 'data' && (
                  <Input
                    type="date"
                    value={String(valores[chave] ?? '').slice(0, 10)}
                    onChange={(e) => setValores((p) => ({ ...p, [chave]: e.target.value }))}
                    className="rounded-[10px] h-9 text-xs"
                  />
                )}

                {c.tipo === 'select' && (
                  <Select
                    value={valores[chave] ?? undefined}
                    onValueChange={(v) => setValores((p) => ({ ...p, [chave]: v }))}
                  >
                    <SelectTrigger className="rounded-[10px] h-9 text-xs w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(c.opcoes || []).map((op, oIdx) => {
                        const val = op.value ?? op.valor ?? ''
                        const lab = op.label ?? op.rotulo ?? val
                        return (
                          <SelectItem key={`${val}-${oIdx}`} value={val} className="text-xs">
                            {lab}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}

                {c.tipo === 'boolean' && (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={Boolean(valores[chave])}
                      onCheckedChange={(v) => setValores((p) => ({ ...p, [chave]: v }))}
                    />
                    <span className="text-xs text-gray-700">{valores[chave] ? 'Sim' : 'Não'}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-full text-xs font-semibold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="h-9 rounded-full text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white gap-1.5"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
