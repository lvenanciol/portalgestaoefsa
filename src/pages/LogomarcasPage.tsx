import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  Plus,
  Loader2,
  Save,
  Upload,
  Image as ImageIcon,
  Palette,
  Crop,
  Check,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const isImagemEditavel = (f: File) => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type)

export default function LogomarcasPage() {
  const { user } = useAuth()
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [editandoId, setEditandoId] = useState('')
  const [form, setForm] = useState<{ empresa: string; sigla: string; cor: string; ativo: boolean }>(
    {
      empresa: '',
      sigla: '',
      cor: '#1B5E20',
      ativo: true,
    },
  )
  const pendentesRef = useRef<Record<string, File>>({})
  const [editImg, setEditImg] = useState<{
    file: File
    campo: 'logo' | 'emblema'
    nomeOrig: string
  } | null>(null)
  const [imgSrc, setImgSrc] = useState('')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain')
  const [salvando, setSalvando] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

  const toggleAtivo = async (l: any, novoAtivo: boolean) => {
    setTogglingId(l.id)
    setErro('')
    setMsg('')
    try {
      // 1. Atualizar registro em logomarcas
      await pb.collection('logomarcas').update(l.id, { ativo: novoAtivo })

      // 2. Se houver empresa correspondente em 'empresas', manter sincronizada
      try {
        const emp = await pb
          .collection('empresas')
          .getFirstListItem(`nome = "${l.empresa.replace(/"/g, '')}"`)
        if (emp && emp.ativa !== novoAtivo) {
          await pb.collection('empresas').update(emp.id, { ativa: novoAtivo })
        }
      } catch {
        /* intentionally ignored */
      }

      setMsg(`Logomarca de ${l.empresa} ${novoAtivo ? 'ativada' : 'desativada'} com sucesso.`)
      setRegs((prev) =>
        prev.map((item) => (item.id === l.id ? { ...item, ativo: novoAtivo } : item)),
      )
    } catch (e) {
      setErro('Falha ao alternar estado: ' + String(e).slice(0, 160))
    } finally {
      setTogglingId(null)
      setTimeout(() => setMsg(''), 5000)
    }
  }

  const abrirEditor = (file: File, campo: 'logo' | 'emblema') => {
    setEditImg({ file, campo, nomeOrig: file.name })
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setFitMode('contain')
    setImgSrc(URL.createObjectURL(file))
  }

  const abrirEditorDeUrl = async (imgUrl: string, campo: 'logo' | 'emblema', nome = 'logo.png') => {
    try {
      const res = await fetch(imgUrl)
      const blob = await res.blob()
      const f = new File([blob], nome, { type: blob.type || 'image/png' })
      abrirEditor(f, campo)
    } catch (e) {
      setErro('Não foi possível carregar a imagem para ajuste: ' + String(e))
    }
  }

  // Crop / resize com PRESERVAÇÃO DE PROPORÇÃO (contain por padrão ou cover opcional)
  const aplicarCrop = async () => {
    if (!editImg) return
    const img = new Image()
    img.src = imgSrc
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
    })
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)

    // 'contain' ajusta para caber 100% dentro de 512x512 com margem de segurança de respiro
    // 'cover' preenche tudo
    const baseEscala =
      fitMode === 'contain'
        ? 480 / Math.max(img.width, img.height)
        : 512 / Math.min(img.width, img.height)

    const escala = baseEscala * zoom
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
      const empNome = (form.empresa || rec?.empresa || '').trim()
      const empSigla = (form.sigla || rec?.sigla || '').trim().slice(0, 4)
      const empCor = form.cor || rec?.cor || '#1B5E20'
      const empAtivo = form.ativo !== false

      fd.append('empresa', empNome)
      fd.append('sigla', empSigla)
      fd.append('cor', empCor)
      fd.append('ativo', empAtivo ? 'true' : 'false')

      // uploads pendentes
      const logoInput = document.getElementById('logo-file') as HTMLInputElement
      const embInput = document.getElementById('emblema-file') as HTMLInputElement

      if (pendentesRef.current['logo']) {
        fd.append('logo', pendentesRef.current['logo'])
      } else if (logoInput?.files?.[0]) {
        fd.append('logo', logoInput.files[0])
      }

      if (pendentesRef.current['emblema']) {
        fd.append('emblema', pendentesRef.current['emblema'])
      } else if (embInput?.files?.[0]) {
        fd.append('emblema', embInput.files[0])
      }

      if (rec && rec.id) {
        await pb.collection('logomarcas').update(rec.id, fd)
        // Mantém sincronizada na tabela empresas se existir
        try {
          const emp = await pb
            .collection('empresas')
            .getFirstListItem(`nome = "${empNome.replace(/"/g, '')}"`)
          if (emp) {
            await pb.collection('empresas').update(emp.id, { ativa: empAtivo, cor: empCor })
          }
        } catch {
          /* intentionally ignored */
        }
        setMsg('Logomarca de ' + empNome + ' atualizada com sucesso.')
      } else {
        await pb.collection('logomarcas').create(fd)
        // Se nova empresa não existir na coleção empresas, cria ou ativa
        try {
          const emp = await pb
            .collection('empresas')
            .getFirstListItem(`nome = "${empNome.replace(/"/g, '')}"`)
          if (emp) {
            await pb.collection('empresas').update(emp.id, { ativa: empAtivo, cor: empCor })
          } else {
            await pb.collection('empresas').create({ nome: empNome, ativa: empAtivo, cor: empCor })
          }
        } catch (_) {
          try {
            await pb.collection('empresas').create({ nome: empNome, ativa: empAtivo, cor: empCor })
          } catch {
            /* intentionally ignored */
          }
        }
        setMsg('Logomarca de ' + empNome + ' criada com sucesso.')
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

  const iniciarEdicao = (l: any) => {
    setEditandoId(l.id)
    setForm({
      empresa: l.empresa || '',
      sigla: l.sigla || '',
      cor: l.cor || '#1B5E20',
      ativo: l.ativo !== false,
    })
    pendentesRef.current = {}
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
            Identidade por empresa — logo e ícone aplicados na sidebar, topbar e carrossel do login
            (paleta Extrafruti)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditandoId('novo')
            setForm({ empresa: '', sigla: '', cor: '#1B5E20', ativo: true })
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
            className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs p-4 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-3">
              {/* Topo do card com imagem, dados, toggle on/off e badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-14 w-14 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {url(l, 'logo') ? (
                      <img
                        src={url(l, 'logo')}
                        alt={l.empresa}
                        className="h-full w-full object-contain p-1.5"
                      />
                    ) : url(l, 'emblema') ? (
                      <img
                        src={url(l, 'emblema')}
                        alt={l.empresa}
                        className="h-full w-full object-contain p-1.5"
                      />
                    ) : (
                      <span
                        className="h-full w-full flex items-center justify-center font-bold text-[13px] text-white"
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

                {/* Botão ON/OFF e Badge de status */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] uppercase font-semibold tracking-wider transition-colors',
                      l.ativo !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200',
                    )}
                  >
                    {l.ativo !== false ? 'ativa' : 'inativa'}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 font-medium">
                      {l.ativo !== false ? 'On' : 'Off'}
                    </span>
                    <Switch
                      checked={l.ativo !== false}
                      disabled={togglingId === l.id}
                      onCheckedChange={(val) => toggleAtivo(l, val)}
                      aria-label={`Ativar ou desativar ${l.empresa}`}
                    />
                  </div>
                </div>
              </div>

              {/* Modo de edição inline ou exibição */}
              {editandoId === l.id ? (
                <div className="space-y-3 pt-2 border-t border-gray-100">
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
                        className="h-9 bg-gray-50 flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Estado Ativo/Inativo no formulário */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <div>
                      <div className="text-[12px] font-semibold text-gray-800">
                        Status no sistema
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Empresas ativas aparecem no carrossel de login e na sidebar
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-600">
                        {form.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                      <Switch
                        checked={form.ativo}
                        onCheckedChange={(val) => setForm({ ...form, ativo: val })}
                      />
                    </div>
                  </div>

                  {/* Upload e ajuste de Logomarca */}
                  <div className="grid gap-2 p-2.5 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                        Logomarca principal
                      </Label>
                      {url(l, 'logo') && (
                        <button
                          type="button"
                          onClick={() =>
                            abrirEditorDeUrl(url(l, 'logo'), 'logo', `${l.empresa}-logo.png`)
                          }
                          className="text-[11px] font-medium text-[#1B5E20] hover:underline flex items-center gap-1"
                        >
                          <Crop className="h-3 w-3" /> Redimensionar atual
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {url(l, 'logo') && (
                        <div className="h-10 w-10 rounded border border-gray-200 bg-white flex items-center justify-center p-1 shrink-0 overflow-hidden">
                          <img
                            src={url(l, 'logo')}
                            alt="logo atual"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer">
                        <Upload className="h-3.5 w-3.5" /> Substituir arquivo
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
                    {pendentesRef.current['logo'] && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ajustada: {pendentesRef.current['logo'].name}
                      </span>
                    )}
                  </div>

                  {/* Upload e ajuste de Ícone / Emblema */}
                  <div className="grid gap-2 p-2.5 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                        Ícone / Emblema
                      </Label>
                      {url(l, 'emblema') && (
                        <button
                          type="button"
                          onClick={() =>
                            abrirEditorDeUrl(url(l, 'emblema'), 'emblema', `${l.empresa}-icone.png`)
                          }
                          className="text-[11px] font-medium text-[#1B5E20] hover:underline flex items-center gap-1"
                        >
                          <Crop className="h-3 w-3" /> Redimensionar atual
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {url(l, 'emblema') && (
                        <div className="h-10 w-10 rounded border border-gray-200 bg-white flex items-center justify-center p-1 shrink-0 overflow-hidden">
                          <img
                            src={url(l, 'emblema')}
                            alt="ícone atual"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-[12px] font-semibold text-gray-700 cursor-pointer">
                        <Upload className="h-3.5 w-3.5" /> Substituir arquivo
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
                    {pendentesRef.current['emblema'] && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ajustado:{' '}
                        {pendentesRef.current['emblema'].name}
                      </span>
                    )}
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
                      Salvar alterações
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Rodapé do cartão quando não está editando */}
            {editandoId !== l.id && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="text-[11px] text-gray-400">
                  {url(l, 'logo') ? 'logo ✓' : 'logo —'} ·{' '}
                  {url(l, 'emblema') ? 'ícone ✓' : 'ícone —'}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#1B5E20]/30 text-[#1B5E20] hover:bg-emerald-50"
                  onClick={() => iniciarEdicao(l)}
                >
                  Editar
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Card para Nova empresa */}
        {editandoId === 'novo' && (
          <div className="bg-white rounded-xl border-2 border-[#1B5E20]/40 shadow-sm p-4 space-y-3">
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
                  placeholder="EX"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Cor
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                    className="h-9 w-10 rounded border border-gray-200 cursor-pointer"
                  />
                  <Input
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                    className="h-9 bg-gray-50 flex-1 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-[12px] font-medium text-gray-700">Ativa no sistema</span>
              <Switch
                checked={form.ativo}
                onCheckedChange={(val) => setForm({ ...form, ativo: val })}
              />
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
              {pendentesRef.current['logo'] && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit flex items-center gap-1">
                  <Check className="h-3 w-3" /> Ajustada: {pendentesRef.current['logo'].name}
                </span>
              )}
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
              {pendentesRef.current['emblema'] && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded w-fit flex items-center gap-1">
                  <Check className="h-3 w-3" /> Ajustado: {pendentesRef.current['emblema'].name}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
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

      {/* Dialog crop/zoom da imagem com preservação de proporção */}
      <DialogCrop
        open={!!editImg}
        imgSrc={imgSrc}
        campo={editImg?.campo || 'logo'}
        zoom={zoom}
        setZoom={setZoom}
        offset={offset}
        setOffset={setOffset}
        fitMode={fitMode}
        setFitMode={setFitMode}
        onAplicar={aplicarCrop}
        onFechar={() => setEditImg(null)}
      />
    </div>
  )
}

// Dialog de ajuste/redimensionamento avançado com PRESERVAÇÃO DE PROPORÇÃO
function DialogCrop({
  open,
  imgSrc,
  campo,
  zoom,
  setZoom,
  offset,
  setOffset,
  fitMode,
  setFitMode,
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
  fitMode: 'contain' | 'cover'
  setFitMode: (m: 'contain' | 'cover') => void
  onAplicar: () => void
  onFechar: () => void
}) {
  if (!open) return null

  const resetar = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setFitMode('contain')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in fade-in duration-200">
        <div className="flex items-center justify-between border-b pb-2.5">
          <div className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
            <Crop className="h-4 w-4 text-[#1B5E20]" /> Redimensionar e Ajustar{' '}
            {campo === 'logo' ? 'Logomarca' : 'Ícone'}
          </div>
          <button
            type="button"
            onClick={resetar}
            className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1"
            title="Resetar ajuste"
          >
            <RotateCcw className="h-3 w-3" /> Resetar
          </button>
        </div>

        <p className="text-[12px] text-gray-500">
          Ajuste o tamanho e a posição para garantir que a imagem apareça completa, sem cortes, no
          espaço quadrado do sistema. Arraste para mover e use o controle de zoom.
        </p>

        {/* Área de visualização/preview com canvas quadrado */}
        <div className="flex flex-col items-center">
          <div className="relative h-64 w-64 rounded-xl overflow-hidden bg-white border-2 border-dashed border-[#1B5E20]/40 shadow-inner flex items-center justify-center">
            {/* Grade de fundo para perceber limites */}
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-60" />

            {/* Imagem móvel */}
            <img
              src={imgSrc}
              alt="ajuste"
              draggable={false}
              className="absolute m-auto max-h-none max-w-none cursor-move select-none transition-transform duration-75"
              style={{
                width: fitMode === 'contain' ? '85%' : '100%',
                height: fitMode === 'contain' ? '85%' : '100%',
                objectFit: fitMode,
                transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)`,
              }}
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
          <span className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
            <Maximize2 className="h-3 w-3" /> Área quadrada final (512×512)
          </span>
        </div>

        {/* Modos de encaixe */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFitMode('contain')
              setZoom(1)
            }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              fitMode === 'contain'
                ? 'bg-emerald-50 text-[#1B5E20] border-emerald-300 shadow-xs'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
            )}
          >
            Encaixar Completa (sem corte)
          </button>
          <button
            type="button"
            onClick={() => setFitMode('cover')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              fitMode === 'cover'
                ? 'bg-emerald-50 text-[#1B5E20] border-emerald-300 shadow-xs'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
            )}
          >
            Preencher Espaço
          </button>
        </div>

        {/* Controles de Zoom */}
        <div className="space-y-1.5 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between text-[11px] text-gray-600 font-medium">
            <span className="flex items-center gap-1">
              <ZoomOut className="h-3.5 w-3.5" /> Escala / Zoom
            </span>
            <span className="font-mono">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(Math.max(0.2, Number((zoom - 0.1).toFixed(2))))}
              className="h-7 w-7 rounded bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100"
            >
              -
            </button>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[#1B5E20]"
            />
            <button
              type="button"
              onClick={() => setZoom(Math.min(3, Number((zoom + 0.1).toFixed(2))))}
              className="h-7 w-7 rounded bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t">
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
