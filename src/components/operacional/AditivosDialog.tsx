import { useEffect, useState } from 'react'
import { Plus, Loader2, FileText, Trash2, X } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useBotoes } from '@/services/botoes-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn, fmtDataBR } from '@/components/operacional/aditivos-utils'

// COR-3 F8 — Aditivos em contratos: histórico + cadastro com vínculo ao
// contrato-pai (contrato_id). Campos: número, data, valor, novo indexador,
// nova vigência (fim), anexo (file), aprovador. O alerta de vencimento
// 90/60/30 (Dashboard) recalcula a partir da vigência do ÚLTIMO aditivo.

export interface ContratoPai {
  id: string
  titulo: string
  parte: string
  fim?: string | null
}

interface Aditivo {
  id: string
  numero: string
  data: string
  valor: number | null
  indexador: string
  nova_vigencia: string
  aprovador: string
  anexo: string
  contrato_id: string
  created: string
}

const vazio = {
  numero: '',
  data: '',
  valor: '',
  indexador: '',
  nova_vigencia: '',
  aprovador: '',
}

export default function AditivosDialog({
  contrato,
  open,
  onClose,
  onChange,
}: {
  contrato: ContratoPai
  open: boolean
  onClose: () => void
  onChange?: () => void
}) {
  const { pode } = useBotoes()
  const [itens, setItens] = useState<Aditivo[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({ ...vazio })
  const [anexo, setAnexo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await pb.collection('contratos_aditivos').getFullList({
        filter: 'contrato_id = "' + contrato.id + '"',
        sort: '-data',
      })
      setItens(r as any[])
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && contrato?.id) carregar()
  }, [open, contrato?.id])

  const salvar = async () => {
    if (!form.numero || !form.data) {
      setErro('Número e data são obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const fd = new FormData()
      fd.append('numero', form.numero)
      fd.append('data', form.data ? form.data + ' 00:00:00.000Z' : '')
      fd.append('valor', form.valor === '' ? '' : String(Number(form.valor)))
      fd.append('indexador', form.indexador)
      fd.append('nova_vigencia', form.nova_vigencia ? form.nova_vigencia + ' 00:00:00.000Z' : '')
      fd.append('aprovador', form.aprovador)
      fd.append('contrato_id', contrato.id)
      if (anexo) fd.append('anexo', anexo)
      await pb.collection('contratos_aditivos').create(fd)
      // auditoria (best-effort)
      try {
        await pb.send('/backend/v1/auditoria', {
          method: 'POST',
          body: JSON.stringify({
            acao: 'criar_registro',
            modulo: 'contratos_aditivos',
            detalhe: 'Aditivo ' + form.numero + ' — ' + contrato.titulo,
          }),
        })
      } catch (_) {
        /* best-effort */
      }
      setForm({ ...vazio })
      setAnexo(null)
      await carregar()
      onChange?.()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (id: string) => {
    try {
      await pb.collection('contratos_aditivos').delete(id)
      await carregar()
      onChange?.()
    } catch (e) {
      setErro(String(e))
    }
  }

  // vigência efetiva = última nova_vigencia OU fim do contrato-pai
  const ultimaVigencia = itens[0]?.nova_vigencia || contrato.fim || null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1B5E20]" />
              Aditivos — {contrato.titulo}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </DialogTitle>
        </DialogHeader>

        {/* Vigência efetiva */}
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800 flex items-center justify-between">
          <span>
            <strong>Vigência efetiva</strong> (último aditivo ou fim do contrato)
          </span>
          <strong className="tabular-nums">
            {ultimaVigencia ? fmtDataBR(ultimaVigencia) : '—'}
          </strong>
        </div>

        {/* Histórico */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
            Histórico ({itens.length})
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-[#1B5E20]" />
            </div>
          ) : itens.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">Nenhum aditivo registrado.</p>
          ) : (
            <div className="space-y-2">
              {itens.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 bg-gray-50/60"
                >
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#1B5E20]/10 text-[#1B5E20] border border-[#1B5E20]/20 shrink-0">
                    {a.numero}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-gray-800">
                      {fmtDataBR(a.data)}
                      {a.nova_vigencia && (
                        <span className="text-gray-500 font-normal">
                          {' '}
                          → vigência {fmtDataBR(a.nova_vigencia)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {a.valor != null && a.valor !== 0
                        ? 'R$ ' + Number(a.valor).toLocaleString('pt-BR')
                        : ''}
                      {a.indexador ? ' · ' + a.indexador : ''}
                      {a.aprovador ? ' · aprovado por ' + a.aprovador : ''}
                    </div>
                  </div>
                  {a.anexo && (
                    <a
                      href={pb.files.getURL(pb.collection('contratos_aditivos'), a as any, a.anexo)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-700 hover:underline shrink-0"
                    >
                      anexo
                    </a>
                  )}
                  {pode('contratos', 'excluir') && (
                    <button
                      type="button"
                      onClick={() => excluir(a.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      aria-label="Excluir aditivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Novo aditivo */}
        {pode('contratos', 'editar') && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Novo aditivo
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Número *</Label>
                <Input
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  placeholder="ex.: 01/2026"
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Data *</Label>
                <Input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Valor (R$)</Label>
                <Input
                  type="number"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Novo indexador</Label>
                <Input
                  value={form.indexador}
                  onChange={(e) => setForm({ ...form, indexador: e.target.value })}
                  placeholder="ex.: IPCA + 2%"
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Nova vigência (fim)</Label>
                <Input
                  type="date"
                  value={form.nova_vigencia}
                  onChange={(e) => setForm({ ...form, nova_vigencia: e.target.value })}
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500">Aprovador</Label>
                <Input
                  value={form.aprovador}
                  onChange={(e) => setForm({ ...form, aprovador: e.target.value })}
                  className="h-9 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-gray-500">Anexo (PDF/DOCX/IMG)</Label>
              <Input
                type="file"
                accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                onChange={(e) => setAnexo(e.target.files?.[0] || null)}
                className="h-9 bg-gray-50 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={salvar}
                disabled={salvando}
                className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Registrar aditivo
              </Button>
            </div>
          </div>
        )}

        {erro && (
          <div
            className={cn(
              'p-2.5 rounded-lg text-[12px] font-medium bg-red-50 border border-red-200 text-red-700',
            )}
          >
            {erro}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
