import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  Plus,
  Loader2,
  Save,
  Upload,
  Image as ImageIcon,
  Palette,
  Type,
  Trash2,
  Crop,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// TAREFA 4 — Logomarcas (espelho do LogomarcasAdmin do Foldbox): grade de
// empresas, upload de logo + ícone (T4-f: era "emblema"), sigla e cor, SEMPRE
// na paleta Extrafruti (#1B5E20). A logo alimenta sidebar/topbar/login (T4d).
// T4-f (22/10): rótulos de UI "Emblema" → "Ícone" (campo de API segue 'emblema').

const isImagemEditavel = (f: File) => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type)

export default function LogomarcasPage() {
  const { user } = useAuth()
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [editandoId, setEditandoId] = useState('')
  const [form, setForm] = useState<{ empresa: string; sigla: string; cor: string }>({
    empresa: '',
    sigla: '',
    cor: '#1B5E20',
  })
  const pendentesRef = useRef<Record<string, File>>({})
  const [editImg, setEditImg] = useState<{ file: File; campo: 'logo' | 'emblema' } | null>(null)
  const [imgSrc, setImgSrc] = useState('')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('logomarcas').getFullList({ sort: 'empresa' })
      setRegs(r as any[])
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

  const url = (rec: any, campo: string) => {
    if (!rec || !rec[campo]) return ''
    return pb.files.getURL(rec, rec[campo])
  }

  const abrirEditor = (file: File, campo: 'logo' | 'emblema') => {
    setEditImg({ file, campo })
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setImgSrc(URL.createObjectURL(file))
  }

  // T4d: crop/resize no canvas (512×512, cover) e devolve o File ajustado
  const aplicarCrop = async () => {
    if (!editImg) return
    const img = new Image()
    img.src = imgSrc
    await new Promise((res) => (img.onload = res))
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    const escala = (512 / Math.min(img.width, img.height)) * zoom
    const w = img.width * escala
    const h = img.height * escala
    ctx.drawImage(img, (512 - w) / 2 + offset.x, (512 - h) / 2 + offset.y, w, h)
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    const ajustado = new File([blob], editImg.file.name.replace(/\.[^.]+$/, '') + '-ajustado.png', {
      type: 'image/png',
    })
    pendentesRef.current[editImg.campo] = ajustado
    setEditImg(null)
  }

  const salvarRegistro = async (rec: any) => {
    setSalvando(true)
    setMsg('')
    setErro('')
    try {
      const fd = new FormData()
      fd.append('empresa', form.empresa || rec.empresa || '')
      fd.append('sigla', (form.sigla || rec.sigla || '').slice(0, 4))
      fd.append('cor', form.cor || rec.cor || '#1B5E20')
      // uploads pendentes (crop aplicado OU arquivo cru se não editável)
      const logoInput = document.getElementById('logo-file') as HTMLInputElement
      const embInput = document.getElementById('emblema-file') as HTMLInputElement
      if (pendentesRef.current['logo']) fd.append('logo', pendentesRef.current['logo'])
      else if (logoInput?.files?.[0]) fd.append('logo', logoInput.files[0])
      if (pendentesRef.current['emblema']) fd.append('emblema', pendentesRef.current['emblema'])
      else if (embInput?.files?.[0]) fd.append('emblema', embInput.files[0])
      if (rec && rec.id) {
        await pb.collection('logomarcas').update(rec.id, fd)
        setMsg('Logomarca de ' + (form.empresa || rec.empresa) + ' salva.')
      } else {
        await pb.collection('logomarcas').create(fd)
        setMsg('Logomarca de ' + (form.empresa || '') + ' criada.')
      }
      pendentesRef.current = {}
      if (logoInput) logoInput.value = ''
      if (embInput) embInput.value = ''
      setEditandoId('')
      await carregar()
    } catch (e) {
      setErro('Falha ao salvar: ' + String(e).slice(0, 200))
    } finally {
      setSalvando(false)
      setTimeout(() => setMsg(''), 8000)
    }
  }

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
            <ImageIcon className="h-6 w-6 text-[#1B5E20]" /> Logomarcas
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Identidade por empresa — logo e ícone aplicados na sidebar e no topbar (paleta
            Extrafruti)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditandoId('novo')
            setForm({ empresa: '', sigla: '', cor: '#1B5E20' })
            pendentesRef.current = {}
          }}
          className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Nova empresa
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}
      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700">
          {msg}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {regs.map((l) => (
          <div
            key={l.id}
            className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-12 w-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                  {url(l, 'logo') ? (
                    <img
                      src={url(l, 'logo')}
                      alt={l.empresa}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : url(l, 'emblema') ? (
                    <img
                      src={url(l, 'emblema')}
                      alt={l.empresa}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span
                      className="h-full w-full flex items-center justify-center font-bold text-[12px] text-white"
                      style={{ backgroundColor: l.cor || '#1B5E20' }}
                    >
                      {l.sigla || l.empresa.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-gray-900 truncate">{l.empresa}</div>
                  <div className="text-[11px] text-gray-500">
                    Sigla: {l.sigla || '—'} · Cor: {l.cor || '#1B5E20'}
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px]',
                  l.ativo !== false
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-100 text-gray-500 border-gray-200',
                )}
              >
                {l.ativo !== false ? 'ativa' : 'inativa'}
              </Badge>
            </div>

            {editandoId === l.id ? (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Empresa
                    </Label>
                    <Input
                      value={form.empresa}
                      onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                      className="h-9 bg-gray-50"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Sigla (até 4)
                    </Label>
                    <Input
                      value={form.sigla}
                      onChange={(e) =>
                        setForm({ ...form, sigla: e.target.value.toUpperCase().slice(0, 4) })
                      }
                      className="h-9 bg-gray-50"
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Palette className="h-3 w-3" /> Cor
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.cor}
                      onChange={(e) => setForm({ ...form, cor: e.target.value })}
                      className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
                    />
                    <Input
                      value={form.cor}
                      onChange={(e) => setForm({ ...form, cor: e.target.value })}
                      className="h-9 bg-gray-50 flex-1"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Logomarca (png/jpg/webp, até 2MB)
                    </Label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer w-fit">
                      <Upload className="h-3.5 w-3.5" /> Escolher logomarca
                      <input
                        id="logo-file"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f && isImagemEditavel(f)) abrirEditor(f, 'logo')
                        }}
                      />
                    </label>
                    {pendentesRef.current['logo'] && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit">
                        Ajustado: {pendentesRef.current['logo'].name}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Ícone (opcional, até 2MB)
                    </Label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer w-fit">
                      <Upload className="h-3.5 w-3.5" /> Escolher ícone
                      <input
                        id="emblema-file"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f && isImagemEditavel(f)) abrirEditor(f, 'emblema')
                        }}
                      />
                    </label>
                    {pendentesRef.current['emblema'] && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit">
                        Ajustado: {pendentesRef.current['emblema'].name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setEditandoId('')}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                    onClick={() => salvarRegistro(l)}
                    disabled={salvando}
                  >
                    {salvando ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <div className="text-[11px] text-gray-400">
                  {url(l, 'logo') ? 'logo ✓' : 'logo —'} ·{' '}
                  {url(l, 'emblema') ? 'ícone ✓' : 'ícone —'}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setEditandoId(l.id)
                    setForm({
                      empresa: l.empresa || '',
                      sigla: l.sigla || '',
                      cor: l.cor || '#1B5E20',
                    })
                    pendentesRef.current = {}
                  }}
                >
                  Editar
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Nova empresa */}
        {editandoId === 'novo' && (
          <div className="bg-white rounded-xl border border-[#1B5E20]/30 shadow-xs p-4 space-y-3">
            <div className="text-[14px] font-bold text-gray-900 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-[#1B5E20]" /> Nova empresa
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Empresa *
              </Label>
              <Input
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                className="h-9 bg-gray-50"
                placeholder="Nome da empresa"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Sigla (até 4)
                </Label>
                <Input
                  value={form.sigla}
                  onChange={(e) =>
                    setForm({ ...form, sigla: e.target.value.toUpperCase().slice(0, 4) })
                  }
                  className="h-9 bg-gray-50"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Cor
                </Label>
                <Input
                  type="color"
                  value={form.cor}
                  onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  className="h-9 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Logomarca
              </Label>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer w-fit">
                <Upload className="h-3.5 w-3.5" /> Escolher logomarca
                <input
                  id="logo-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && isImagemEditavel(f)) abrirEditor(f, 'logo')
                  }}
                />
              </label>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Ícone (opcional)
              </Label>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer w-fit">
                <Upload className="h-3.5 w-3.5" /> Escolher ícone
                <input
                  id="emblema-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && isImagemEditavel(f)) abrirEditor(f, 'emblema')
                  }}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setEditandoId('')}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                onClick={() => salvarRegistro(null)}
                disabled={salvando || !form.empresa.trim()}
              >
                {salvando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                Criar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog crop/zoom da imagem */}
      <DialogCrop
        open={!!editImg}
        imgSrc={imgSrc}
        campo={editImg?.campo || 'logo'}
        zoom={zoom}
        setZoom={setZoom}
        offset={offset}
        setOffset={setOffset}
        onAplicar={aplicarCrop}
        onFechar={() => setEditImg(null)}
      />
    </div>
  )
}

// Dialog de crop simples (zoom + arrastar) — T4d
function DialogCrop({
  open,
  imgSrc,
  campo,
  zoom,
  setZoom,
  offset,
  setOffset,
  onAplicar,
  onFechar,
}: {
  open: boolean
  imgSrc: string
  campo: string
  zoom: number
  setZoom: (z: number) => void
  offset: { x: number; y: number }
  setOffset: (o: { x: number; y: number }) => void
  onAplicar: () => void
  onFechar: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3">
        <div className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
          <Crop className="h-4 w-4 text-[#1B5E20]" /> Ajustar{' '}
          {campo === 'logo' ? 'logomarca' : 'ícone'}
        </div>
        <div className="relative h-64 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          <img
            src={imgSrc}
            alt="ajuste"
            draggable={false}
            className="absolute inset-0 m-auto max-h-full max-w-full cursor-move select-none"
            style={{ transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)` }}
            onMouseDown={(e) => {
              e.preventDefault()
              const startX = e.clientX
              const startY = e.clientY
              const mover = (mv: MouseEvent) => {
                setOffset({
                  x: offset.x + (mv.clientX - startX),
                  y: offset.y + (mv.clientY - startY),
                })
              }
              const soltar = () => {
                window.removeEventListener('mousemove', mover)
                window.removeEventListener('mouseup', soltar)
              }
              window.addEventListener('mousemove', mover)
              window.addEventListener('mouseup', soltar)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 w-10">Zoom</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            onClick={onAplicar}
          >
            Aplicar ajuste
          </Button>
        </div>
      </div>
    </div>
  )
}
