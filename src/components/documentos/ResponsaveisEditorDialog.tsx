/**
 * ResponsaveisEditorDialog — edição de responsáveis (interno + externo) direto
 * da tela de detalhe, sem o modal genérico antigo. Salva em
 * responsavel_interno / responsavel_externo na coleção do documento.
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
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'

interface ResponsaveisEditorDialogProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  colecao: string
  documento: any
  /** Rótulo específico (ex.: "do alvará", "do contrato") */
  contexto?: string
  /** Nome do campo interno (default responsavel_interno) */
  campoInterno?: string
  /** Nome do campo externo (default responsavel_externo) */
  campoExterno?: string
  onSalvo?: (registro: any) => void
}

export function ResponsaveisEditorDialog({
  aberto,
  onOpenChange,
  colecao,
  documento,
  contexto,
  campoInterno = 'responsavel_interno',
  campoExterno = 'responsavel_externo',
  onSalvo,
}: ResponsaveisEditorDialogProps) {
  const [interno, setInterno] = useState('')
  const [externo, setExterno] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (aberto && documento) {
      // Extrair de campos planos ou de campo json (responsaveis / responsaveis_lista)
      let intVal = documento[campoInterno]
      let extVal = documento[campoExterno]

      if (!intVal && !extVal) {
        const jsonResp = documento.responsaveis || documento.responsaveis_lista
        if (Array.isArray(jsonResp) && jsonResp.length > 0) {
          intVal = jsonResp[0]?.nome || jsonResp[0]
          if (jsonResp.length > 1) {
            extVal = jsonResp[1]?.nome || jsonResp[1]
          }
        } else if (typeof jsonResp === 'object' && jsonResp !== null) {
          intVal = jsonResp.interno || jsonResp.responsavel_interno
          extVal = jsonResp.externo || jsonResp.responsavel_externo
        }
      }

      setInterno(String(intVal ?? '').trim())
      setExterno(String(extVal ?? '').trim())
    }
  }, [aberto, documento, campoInterno, campoExterno])

  const salvar = async () => {
    if (!documento?.id) return
    setSalvando(true)
    try {
      const payload: Record<string, any> = {
        [campoInterno]: interno.trim() || null,
        [campoExterno]: externo.trim() || null,
      }

      // Se a coleção tiver campo JSON 'responsaveis' ou 'responsaveis_lista', sincronizamos também
      const listaArray = []
      if (interno.trim()) {
        listaArray.push({ nome: interno.trim(), tipo: 'interno', papel: 'Acompanhamento' })
      }
      if (externo.trim()) {
        listaArray.push({ nome: externo.trim(), tipo: 'externo', papel: 'Externo' })
      }

      if (colecao === 'processos_juridicos') {
        payload.responsaveis_lista = listaArray
        payload.responsavel_principal = interno.trim() || externo.trim() || null
      } else if (colecao === 'alvaras' || colecao === 'contratos') {
        payload.responsaveis = listaArray
      }

      const atualizado = await pb.collection(colecao).update(documento.id, payload)
      toast({
        title: 'Responsáveis atualizados',
        description: 'Os responsáveis do documento foram salvos.',
      })
      onSalvo?.(atualizado)
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar responsáveis',
        description: err?.message || 'Não foi possível salvar.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="bg-white max-w-md rounded-2xl border border-gray-200 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-gray-900">
            Editar responsáveis {contexto ? contexto : 'do documento'}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600">
            Informe o nome de cada responsável. Deixe em branco quando não houver.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-600">
              Responsável interno
            </Label>
            <Input
              value={interno}
              onChange={(e) => setInterno(e.target.value)}
              placeholder="Ex.: Ana Jurídico"
              className="rounded-[10px] h-9 text-xs"
            />
            <p className="text-[11px] text-gray-500">
              Colaborador da empresa responsável pelo acompanhamento.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-600">
              Responsável externo
            </Label>
            <Input
              value={externo}
              onChange={(e) => setExterno(e.target.value)}
              placeholder="Ex.: Dra. Renata Lima (Ribeiro & Lima)"
              className="rounded-[10px] h-9 text-xs"
            />
            <p className="text-[11px] text-gray-500">
              Contato externo (advogado, contador, fornecedor).
            </p>
          </div>
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
