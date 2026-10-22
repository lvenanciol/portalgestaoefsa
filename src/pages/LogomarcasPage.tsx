import { useEffect, useRef, useState } from 'react'
import { Palette, Loader2, Upload, Trash2, Check, X, FileText, Crop } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
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
// T4d: paleta com BRANCO e PRETO (swatch do branco tem borda p/ aparecer em fundo claro)
const PALETA = [
  '#1B5E20',
  '#0F3D13',
  '#2E7D32',
  '#388E3C',
  '#43A047',
  '#F59E0B',
  '#FFFFFF',
  '#000000',
]
// T4b: tipos aceitos na importação (PDF/PNG/JPG/SVG/WebP)
const ACCEPT_LOGO =
  'image/png,image/jpeg,image/svg+xml,image/webp,application/pdf,.pdf,.png,.jpg,.jpeg,.svg,.webp'
const isImagemEditavel = (f: File) =>
  /^image\/(png|jpeg|webp)$/i.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)

export default function LogomarcasPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({})
  // T4b: editor de imagem (zoom + arrastar + recorte) antes do upload
  const [editImg, setEditImg] = useState<{ file: File; campo: 'logo' | 'emblema' } | null>(null)
  const [imgSrc, setImgSrc] = useState('')
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [processando, setProcessando] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const pendentesRef = useRef<Record<string, File>>({})
  const [imgTick, setImgTick] = useState(0)
  // T4b: recorte quadrado/retangular proporcional — alterna pelo checkbox
  const [quadrado, setQuadrado] = useState(true)

  const abrirEditor = (file: File, campo: 'logo' | 'emblema') => {
    setEditImg({ file, campo })
    setZoom(1)
    setOff({ x: 0, y: 0 })
    setImgSrc(URL.createObjectURL(file))
    const im = new Image()
    im.onload = () => {
      imgRef.current = im
      setImgTick((t) => t + 1)
    }
    im.src = URL.createObjectURL(file)
  }

  // desenha o preview no canvas: imagem deslocada/escalada + máscara do recorte
  useEffect(() => {
    const cv = canvasRef.current
    const img = imgRef.current
    if (!editImg || !cv || !img || !img.complete) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width
    const H = cv.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    const base = Math.min(W / img.width, H / img.height)
    const dw = img.width * base * zoom
    const dh = img.height * base * zoom
    ctx.drawImage(img, (W - dw) / 2 + off.x, (H - dh) / 2 + off.y, dw, dh)
    // T4b: contorno da área que será recortada (quadrado ou proporcional à imagem)
    const ar = img.width / img.height
    const cw = quadrado ? Math.min(W, H) : Math.min(W, H * ar)
    const ch = quadrado ? Math.min(W, H) : cw / ar
    ctx.strokeStyle = '#1B5E20'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect((W - cw) / 2, (H - ch) / 2, cw, ch)
    ctx.setLineDash([])
  }, [editImg, imgSrc, zoom, off, imgTick, quadrado])

  const confirmarRecorte = () => {
    const cv = canvasRef.current
    const img = imgRef.current
    if (!cv || !img || !editImg) return
    setProcessando(true)
    const W = cv.width
    const H = cv.height
    // T4b: quadrado usa o menor lado; retangular mantém a proporção da imagem
    const ar = img.width / img.height
    const cw = Math.round(quadrado ? Math.min(W, H) : Math.min(W, H * ar))
    const ch = Math.round(quadrado ? Math.min(W, H) : cw / ar)
    const cx = (W - cw) / 2
    const cy = (H - ch) / 2
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    const octx = out.getContext('2d')
    if (!octx) {
      setProcessando(false)
      return
    }
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, cw, ch)
    octx.drawImage(cv, cx, cy, cw, ch, 0, 0, cw, ch)
    out.toBlob((blob) => {
      setProcessando(false)
      if (!blob || !editImg) return
      const f = new File([blob], editImg.file.name.replace(/\.[^.]+$/, '') + '.png', {
        type: 'image/png',
      })
      pendentesRef.current[editImg.campo] = f
      setEditImg(null)
      setImgSrc('')
    }, 'image/png')
  }

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
      // T4b: arquivos pendentes (editados no canvas) têm prioridade; senão,
      // o arquivo escolhido direto no input (PDF/SVG não passam pelo editor)
      const logoInput = document.getElementById('logo-file') as HTMLInputElement
      const embInput = document.getElementById('emblema-file') as HTMLInputElement
      if (pendentesRef.current['logo']) fd.append('logo', pendentesRef.current['logo'])
      else if (logoInput?.files?.[0]) fd.append('logo', logoInput.files[0])
      if (pendentesRef.current['emblema']) fd.append('emblema', pendentesRef.current['emblema'])
      else if (embInput?.files?.[0]) fd.append('emblema', embInput.files[0])
      await pb.collection('logomarcas').update(editando.id, fd)
      pendentesRef.current = {}
      if (logoInput) logoInput.value = ''
      if (embInput) embInput.value = ''
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
                  {url(l, 'logo') && String(url(l, 'logo')).toLowerCase().endsWith('.pdf') ? (
                    /* T4c: PDF EXIBIDO inline via <object> (fallback = link) */
                    <object
                      data={url(l, 'logo') + '#toolbar=0&view=FitH'}
                      type="application/pdf"
                      className="h-full w-full"
                      aria-label={emp + ' — PDF'}
                    >
                      <a
                        href={url(l, 'logo')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-white hover:underline"
                      >
                        Abrir PDF
                      </a>
                    </object>
                  ) : url(l, 'logo') ? (
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
                {/* T4a1: até 4 caracteres */}
                <Input
                  value={form.sigla || ''}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value.slice(0, 4) })}
                  maxLength={4}
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
                        // T4d: swatch BRANCO com borda p/ aparecer em fundo claro
                        c === '#FFFFFF'
                          ? 'border-gray-300'
                          : form.cor === c
                            ? 'border-gray-900'
                            : 'border-transparent',
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
                Logomarca (PDF/PNG/JPG/SVG até 5MB)
              </Label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-800 cursor-pointer">
                  <Upload className="h-4 w-4" /> Escolher arquivo
                  {/* T4a2: aceita PDF, PNG, JPG e SVG */}
                  <input
                    id="logo-file"
                    type="file"
                    accept={ACCEPT_LOGO}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      // T4b: imagem → editor de ajuste (zoom/arrastar/recorte); PDF/SVG → direto
                      if (f && isImagemEditavel(f)) abrirEditor(f, 'logo')
                    }}
                  />
                </label>
                {pendentesRef.current['logo'] && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                    Ajustada: {pendentesRef.current['logo'].name}
                  </span>
                )}
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
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-800 cursor-pointer w-fit">
                  <Upload className="h-4 w-4" /> Escolher emblema
                  <input
                    id="emblema-file"
                    type="file"
                    accept={ACCEPT_LOGO}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f && isImagemEditavel(f)) abrirEditor(f, 'emblema')
                    }}
                  />
                </label>
                {pendentesRef.current['emblema'] && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                    Ajustado: {pendentesRef.current['emblema'].name}
                  </span>
                )}
              </div>
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

      {/* T4b: editor de ajuste (zoom + arrastar + recorte quadrado/retangular) */}
      <Dialog open={!!editImg} onOpenChange={(o) => !o && setEditImg(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crop className="h-4 w-4 text-[#1B5E20]" /> Ajustar imagem —{' '}
              {editImg?.campo === 'logo' ? 'logomarca' : 'emblema'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-2">
              <canvas
                ref={canvasRef}
                width={280}
                height={280}
                className="cursor-move touch-none rounded"
                onPointerDown={(e) => {
                  ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
                  setDrag({ x: e.clientX, y: e.clientY })
                }}
                onPointerMove={(e) => {
                  if (!drag) return
                  setOff((o) => ({ x: o.x + (e.clientX - drag.x), y: o.y + (e.clientY - drag.y) }))
                  setDrag({ x: e.clientX, y: e.clientY })
                }}
                onPointerUp={() => setDrag(null)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Zoom
                </span>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <Slider
                value={[zoom]}
                min={1}
                max={4}
                step={0.05}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={quadrado}
                onChange={(e) => setQuadrado(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Recorte quadrado (desmarque para retangular proporcional)
            </label>
            <p className="text-[11px] text-gray-400">
              Arraste para reposicionar e ajuste o zoom; o recorte é aplicado ao salvar o ajuste.
              PDF e SVG não passam por este editor.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditImg(null)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={confirmarRecorte}
              disabled={processando}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {processando ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Crop className="h-4 w-4 mr-1" />
              )}
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
