import { useEffect, useState } from 'react'
import { Palette, Loader2, Upload, Trash2, Check, X } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Ajustes PGE — T4: gestão de logomarcas por empresa. Layout igual à tela
// LogomarcasAdmin do Foldbox (grade de empresas, upload de logo + emblema,
// sigla e cor) SEMPRE na paleta Extrafruti (#1B5E20). A logo salva aqui
// alimenta a sidebar/topbar (marcaAtiva) e a tela Identidade Visual (T7).

const EMPRESAS = ['Extrafruti', 'Casafruti', 'FoldBox']
const PALETA = ['#1B5E20', '#0F3D13', '#2E7D32', '#388E3C', '#43A047', '#F59E0B', '#0F3D13']

export default function LogomarcasPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({})

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('logomarcas').getFullList({ sort: 'empresa' })
      setItens(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const abrirEditar = (l: any) => {
    setForm({ ...l })
    setEditando(l)
    setDialog(true)
  }

  const salvar = async () => {
    if (!editando) return
    setSalvando(editando.id)
    try {
      const fd = new FormData()
      fd.append('empresa', form.empresa || editando.empresa)
      fd.append('sigla', form.sigla || '')
      fd.append('cor', form.cor || '#1B5E20')
      fd.append('ativo', form.ativo === false ? 'false' : 'true')
      const logoInput = document.getElementById('logo-file') as HTMLInputElement
      const embInput = document.getElementById('emblema-file') as HTMLInputElement
      if (logoInput?.files?.[0]) fd.append('logo', logoInput.files[0])
      if (embInput?.files?.[0]) fd.append('emblema', embInput.files[0])
      await pb.collection('logomarcas').update(editando.id, fd)
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando('')
    }
  }

  // T4 fix: l pode ser null (empresa sem registro) — proteger antes de ler campo
  const url = (l: any, field: string) => (l && l[field] ? pb.files.getURL(l, l[field]) : '')

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Palette className="h-6 w-6 text-[#1B5E20]" /> Logomarcas
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Identidade por empresa — logo e emblema aplicados na sidebar e no topbar (paleta
            Extrafruti)
          </p>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {EMPRESAS.map((emp) => {
          const l = itens.find((i) => i.empresa === emp)
          return (
            <div key={emp} className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-900">{emp}</span>
                {l?.ativo && <Check className="h-4 w-4 text-emerald-600" />}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="h-14 w-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden"
                  style={{ backgroundColor: l?.cor || '#1B5E20' }}
                >
                  {url(l, 'logo') ? (
                    <img
                      src={url(l, 'logo')}
                      alt={emp}
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    l?.sigla || emp.slice(0, 2).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-gray-800">{l?.sigla || '—'}</div>
                  <div className="text-[11px] text-gray-500">{l?.cor || '#1B5E20'}</div>
                  {url(l, 'emblema') && (
                    <img
                      src={url(l, 'emblema')}
                      alt="emblema"
                      className="h-6 mt-1 object-contain"
                    />
                  )}
                </div>
              </div>
              {l ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirEditar(l)}
                  className="w-full h-9"
                >
                  Editar identidade
                </Button>
              ) : (
                <p className="text-[11px] text-gray-400 text-center py-2">
                  Sem registro — usar seed via migração.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog editar */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Identidade — {editando?.empresa}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Sigla
                </Label>
                <Input
                  value={form.sigla || ''}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value })}
                  maxLength={3}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cor
                </Label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-gray-200 bg-gray-50">
                  {PALETA.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, cor: c })}
                      className={cn(
                        'h-7 w-7 rounded-md border-2',
                        form.cor === c ? 'border-gray-900' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Logomarca (PNG/JPG/SVG até 5MB)
              </Label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-800 cursor-pointer">
                  <Upload className="h-4 w-4" /> Escolher arquivo
                  {/* T4b: aceita PDF além de imagens */}
                  <input
                    id="logo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
                    className="hidden"
                  />
                </label>
                {url(editando, 'logo') &&
                  (String(url(editando, 'logo')).toLowerCase().endsWith('.pdf') ? (
                    <a
                      href={url(editando, 'logo')}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-semibold text-[#1B5E20] hover:underline"
                    >
                      Abrir PDF atual
                    </a>
                  ) : (
                    <img src={url(editando, 'logo')} alt="atual" className="h-8 object-contain" />
                  ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Emblema (opcional, até 2MB)
              </Label>
              <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-800 cursor-pointer w-fit">
                <Upload className="h-4 w-4" /> Escolher emblema
                <input
                  id="emblema-file"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-gray-400">
              A logomarca é aplicada na sidebar (bloco de marca) e no topbar (seletor de empresa)
              após salvar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={!!salvando}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
