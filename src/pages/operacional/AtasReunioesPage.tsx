import { useEffect, useRef, useState } from 'react'
import {
  Users,
  Plus,
  Loader2,
  X,
  CalendarClock,
  ListTodo,
  Sparkles,
  Mic,
  Upload,
  Square,
  Pencil,
  Trash2,
  FileAudio,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtDataBRT } from '@/lib/brt'

// Fase 7 (prompt-mestre) — Atas & Reuniões: data/hora, modalidade (Presencial,
// Teams, Meet + link), participantes, pauta, discussões, decisões e action
// items com dono/prazo. Botão "Gerar tarefas" cria itens no kanban.
// TX-h (22/10): data/hora da ÚLTIMA ALTERAÇÃO abaixo dos botões editar/excluir.
// TX-a (22/10): botões "Gerar com IA"/"Gravar áudio"/"Upload de áudio" AO LADO
// DO TÍTULO da tela (operam no dialog aberto; sem dialog, avisam p/ abrir).
// TX-b (22/10): "Gerar com IA" envia a TRANSCRIÇÃO do áudio e preenche
// resumo + decisões + action items (hook ia_resumo_ata v2, payload direto).
// TX-f (22/10): campo TRANSCRIÇÃO visível de volta no dialog.

const parse = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch (_e) {
    return []
  }
}

export default function AtasReunioesPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editandoAta, setEditandoAta] = useState<any | null>(null)
  const [excluindoAta, setExcluindoAta] = useState<any | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    titulo: '',
    data: '',
    modalidade: '',
    link_reuniao: '',
    participantes: '',
    pauta: '',
    resumo: '',
    decisoes: '',
  })
  // T-X (22/10): gravação de áudio (MediaRecorder) + upload múltiplo
  const [gravando, setGravando] = useState(false)
  const [arquivosAudio, setArquivosAudio] = useState<File[]>([])
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileAudioRef = useRef<HTMLInputElement | null>(null)
  const [transcricao, setTranscricao] = useState('')
  const [transcrevendo, setTranscrevendo] = useState(false)
  // IA
  const [iaCarregando, setIaCarregando] = useState<'resumo' | 'parecer' | ''>('')
  const [parecer, setParecer] = useState('')

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('atas').getFullList({ sort: '-data' })
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

  const abrirNova = () => {
    setEditandoAta(null)
    setForm({
      titulo: '',
      data: new Date().toISOString().slice(0, 10),
      modalidade: '',
      link_reuniao: '',
      participantes: '',
      pauta: '',
      resumo: '',
      decisoes: '',
    })
    setArquivosAudio([])
    setTranscricao('')
    setParecer('')
    setErro('')
    setDialog(true)
  }

  const abrirEditarAta = (a: any) => {
    setEditandoAta(a)
    setForm({
      titulo: a.titulo || '',
      data: String(a.data || '').slice(0, 10),
      modalidade: a.modalidade || '',
      link_reuniao: a.link_reuniao || '',
      participantes: a.participantes || '',
      pauta: a.pauta || '',
      resumo: a.resumo || '',
      decisoes: a.decisoes || '',
    })
    setArquivosAudio([])
    setTranscricao('')
    setParecer('')
    setErro('')
    setDialog(true)
  }

  // T-X (22/10): gravação de áudio no browser (MediaRecorder)
  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        const ext = (mr.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm'
        const f = new File([blob], 'gravacao-' + Date.now() + '.' + ext, { type: blob.type })
        setArquivosAudio((p) => [...p, f])
        // T-Xb: transcreve automaticamente o áudio gravado
        await transcrever(f)
      }
      mr.start()
      mediaRef.current = mr
      setGravando(true)
    } catch (e) {
      setErro('Não foi possível acessar o microfone: ' + String(e).slice(0, 120))
    }
  }

  const pararGravacao = () => {
    try {
      mediaRef.current?.stop()
    } catch (_e) {
      /* recorder já parado — segue */
    }
    setGravando(false)
  }

  // T-Xb: transcrição via IA (hook ia_transcrever)
  const transcrever = async (f: File) => {
    setTranscrevendo(true)
    try {
      const fd = new FormData()
      fd.append('audio', f)
      const r = (await pb.send('/backend/v1/ia/transcrever', { method: 'POST', body: fd })) as any
      const texto = r.texto || r.transcricao || ''
      if (texto) {
        setTranscricao(texto)
        setForm((p) => ({ ...p, pauta: (p.pauta ? p.pauta + '\n\n' : '') + texto }))
      } else {
        setErro('IA não retornou transcrição — verifique o áudio.')
      }
    } catch (e) {
      setErro('Falha na transcrição: ' + String(e).slice(0, 150))
    } finally {
      setTranscrevendo(false)
    }
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      // T5b/Xb: salva via FormData quando há áudios — TODOS os arquivos da lista
      // são anexados (campo audio multi, migr 0026); o 1º áudio já foi transcrito.
      const audios = arquivosAudio.filter((f) => /\.(mp3|m4a|wav|webm|ogg|mp4)$/i.test(f.name))
      if (editandoAta) {
        // T-Xf: edição — campos + transcrição ACRESCENTADA + novos áudios
        const fd = new FormData()
        fd.append('titulo', form.titulo || '')
        fd.append('data', form.data ? form.data + ' 00:00:00.000Z' : '')
        fd.append('modalidade', form.modalidade || '')
        fd.append('link_reuniao', form.link_reuniao || '')
        fd.append('participantes', form.participantes || '')
        fd.append('pauta', form.pauta || '')
        fd.append('resumo', form.resumo || '')
        fd.append('decisoes', form.decisoes || '')
        for (const a of audios) fd.append('audio', a)
        await pb.collection('atas').update(editandoAta.id, fd)
        setEditandoAta(null)
      } else if (audios.length > 0) {
        const fd = new FormData()
        fd.append('titulo', form.titulo || '')
        fd.append('data', form.data ? form.data + ' 00:00:00.000Z' : '')
        fd.append('modalidade', form.modalidade || '')
        fd.append('link_reuniao', form.link_reuniao || '')
        fd.append('participantes', form.participantes || '')
        fd.append('pauta', form.pauta || '') // transcrição literal
        fd.append('resumo', form.resumo || '')
        fd.append('decisoes', form.decisoes || '')
        fd.append('action_items', JSON.stringify([]))
        fd.append('criado_por', user?.email || '')
        for (const a of audios) fd.append('audio', a)
        await pb.collection('atas').create(fd)
      } else {
        await pb.collection('atas').create({
          titulo: form.titulo,
          data: form.data ? form.data + ' 00:00:00.000Z' : '',
          modalidade: form.modalidade,
          link_reuniao: form.link_reuniao,
          participantes: form.participantes,
          pauta: form.pauta,
          resumo: form.resumo,
          decisoes: form.decisoes,
          action_items: JSON.stringify([]),
          criado_por: user?.email || '',
        })
      }
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  // T-Xf: excluir ata com confirmação (dialog próprio)
  const confirmarExcluir = async () => {
    if (!excluindoAta) return
    try {
      await pb.collection('atas').delete(excluindoAta.id)
      setExcluindoAta(null)
      await carregar()
    } catch (e) {
      setErro('Falha ao excluir: ' + String(e))
    }
  }

  // IA: resumo estruturado (hook ia_resumo_ata v2 — payload direto)
  const gerarResumo = async () => {
    // TX-b (22/10): envia a TRANSCRIÇÃO do áudio (fonte principal) + campos
    // preenchidos; a IA devolve resumo + decisões + action items e o front
    // preenche os campos do dialog.
    setIaCarregando('resumo')
    try {
      const r = (await pb.send('/backend/v1/ia/resumo-ata', {
        method: 'POST',
        body: JSON.stringify({
          transcricao: transcricao,
          pauta: form.pauta,
          resumo: form.resumo,
          decisoes: form.decisoes,
          participantes: form.participantes,
        }),
      })) as any
      if (r.resumo) setForm((p) => ({ ...p, resumo: r.resumo }))
      if (r.decisoes) setForm((p) => ({ ...p, decisoes: r.decisoes }))
      if (r.action_items && r.action_items.length > 0) {
        // action items sugeridos entram na pauta (visual) — ata salva via salvar()
        const linhas = r.action_items
          .map(
            (it: any) =>
              '• ' +
              (it.acao || '') +
              (it.dono ? ' — ' + it.dono : '') +
              (it.prazo ? ' (até ' + it.prazo + ')' : ''),
          )
          .join('\n')
        setForm((p) => ({
          ...p,
          pauta: (p.pauta ? p.pauta + '\n\n' : '') + 'Action items sugeridos:\n' + linhas,
        }))
      }
      if (!r.resumo && !r.decisoes)
        setErro('IA não retornou conteúdo — grave/suba um áudio primeiro (transcrição vazia).')
    } catch (e) {
      setErro('Falha na IA: ' + String(e).slice(0, 150))
    } finally {
      setIaCarregando('')
    }
  }

  // IA: parecer (hook ia_parecer)
  const gerarParecer = async () => {
    setIaCarregando('parecer')
    try {
      const r = (await pb.send('/backend/v1/ia/parecer', {
        method: 'POST',
        body: JSON.stringify({
          prompt:
            'Analise esta ata de reunião e gere um parecer executivo curto: ' +
            (form.resumo || form.pauta || ''),
        }),
      })) as any
      setParecer(r.texto || '')
    } catch (e) {
      setErro('Falha na IA: ' + String(e).slice(0, 150))
    } finally {
      setIaCarregando('')
    }
  }

  // T-Xg: gerar tarefas no kanban a partir dos action items
  const gerarTarefas = async (a: any) => {
    try {
      const items = parse(a.action_items)
      let criadas = 0
      for (const it of items) {
        if (!it?.acao) continue
        await pb.collection('tarefas').create({
          titulo: it.acao,
          descricao: 'Action item da ata: ' + (a.titulo || ''),
          dono: it.dono || '',
          prazo: it.prazo || '',
          status: 'todo',
        })
        criadas++
      }
      setMsg(criadas + ' tarefa(s) criada(s) no kanban.')
      setTimeout(() => setMsg(''), 6000)
    } catch (e) {
      setErro('Falha ao gerar tarefas: ' + String(e).slice(0, 150))
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
            <Users className="h-6 w-6 text-[#1B5E20]" /> Atas & Reuniões
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Pauta, decisões e action items com dono e prazo
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* TX-a v2 (22/10): botões IA/áudio moraram p/ o TÍTULO do dialog —
              header da tela fica só com Parecer + Nova ata */}
          <Button variant="outline" className="h-9" onClick={() => gerarParecer()}>
            {iaCarregando === 'parecer' ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            Parecer
          </Button>
          <Button onClick={abrirNova} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
            <Plus className="h-4 w-4 mr-1.5" /> + Nova ata
          </Button>
        </div>
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
      {parecer && (
        <div className="p-4 rounded-lg bg-sky-50 border border-sky-200 text-[13px] text-sky-900">
          <div className="font-bold mb-1 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Parecer IA
          </div>
          {parecer}
        </div>
      )}

      {/* Grade de atas */}
      <div className="space-y-3">
        {itens.map((a) => {
          const items = parse(a.action_items)
          const audios = parse(a.audio)
          return (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-bold text-gray-900">{a.titulo}</h3>
                    {a.modalidade && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                        {a.modalidade}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                    <CalendarClock className="h-3 w-3" /> {fmtDataBRT(a.data)}
                    {a.link_reuniao && (
                      <a
                        href={a.link_reuniao}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1B5E20] hover:underline font-semibold"
                      >
                        {a.link_reuniao}
                      </a>
                    )}
                  </div>
                  {(a.resumo || a.pauta || a.decisoes) && (
                    <p className="text-[12px] text-gray-600 mt-1.5 line-clamp-3 leading-relaxed">
                      {[a.resumo, a.decisoes].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {audios.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {(parse(a.audio) as string[]).map((fn: string) => (
                        <audio
                          key={fn}
                          controls
                          preload="none"
                          src={pb.files.getURL(a, fn)}
                          className="h-8 max-w-[220px]"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right space-y-2">
                  <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1B5E20] bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                    <ListTodo className="h-3 w-3" /> {items.length} action item(s)
                  </div>
                  {/* T-Xf: Editar e Excluir (não propagam o clique do card) */}
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        abrirEditarAta(a)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-[#1B5E20] hover:bg-emerald-50"
                      aria-label="Editar ata"
                      title="Editar ata"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExcluindoAta(a)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Excluir ata"
                      title="Excluir ata"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* TX-h (22/10): data/hora da ÚLTIMA ALTERAÇÃO abaixo dos botões */}
                  <div className="text-[10px] text-gray-400 tabular-nums">
                    alt. {fmtDataBRT(a.updated)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {itens.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">
            Nenhuma ata registrada — clique em "+ Nova ata" para criar a primeira.
          </p>
        )}
      </div>

      {/* Dialog nova/editar ata */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            {/* TX-a v2 (22/10): botões IA/áudio/upload AO LADO DO TÍTULO da
                tela "Nova ata" — removidos dos outros locais */}
            <DialogTitle className="flex items-center gap-2 flex-wrap pr-6">
              <Users className="h-4 w-4 text-[#1B5E20] shrink-0" />{' '}
              {editandoAta ? 'Editar ata' : 'Nova ata de reunião'}
              <span className="flex items-center gap-1.5 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] text-[#1B5E20]"
                  onClick={gerarResumo}
                  disabled={iaCarregando === 'resumo'}
                >
                  {iaCarregando === 'resumo' ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  Gerar com IA
                </Button>
                <Button
                  type="button"
                  variant={gravando ? 'destructive' : 'outline'}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={gravando ? pararGravacao : iniciarGravacao}
                >
                  {gravando ? (
                    <>
                      <Square className="h-3 w-3 mr-1" /> Parar
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3 mr-1" /> Gravar áudio
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => fileAudioRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" /> Upload
                </Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Título *
              </Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="h-10 bg-gray-50"
                placeholder="Ex.: Reunião de Resultados — Outubro"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Data *
                </Label>
                <Input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Modalidade
                </Label>
                <Select
                  value={form.modalidade}
                  onValueChange={(v) => setForm({ ...form, modalidade: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Presencial">Presencial</SelectItem>
                    <SelectItem value="Microsoft Teams">Microsoft Teams</SelectItem>
                    <SelectItem value="Google Meet">Google Meet</SelectItem>
                    <SelectItem value="Zoom">Zoom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Link da reunião
              </Label>
              <Input
                value={form.link_reuniao}
                onChange={(e) => setForm({ ...form, link_reuniao: e.target.value })}
                className="h-10 bg-gray-50"
                placeholder="https://teams.microsoft.com/..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Participantes
              </Label>
              <Input
                value={form.participantes}
                onChange={(e) => setForm({ ...form, participantes: e.target.value })}
                className="h-10 bg-gray-50"
                placeholder="Nomes separados por vírgula"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Pauta
              </Label>
              <Textarea
                value={form.pauta}
                onChange={(e) => setForm({ ...form, pauta: e.target.value })}
                rows={3}
              />
            </div>

            {/* T-X: gravação + upload de áudio (também acessíveis pelo header) */}
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
              <div className="flex items-center gap-2">
                {/* TX-a v3 (22/10): botões SÓ no título do dialog — aqui fica só
                    o input hidden (ref do título), status e transcrição */}
                <input
                  ref={fileAudioRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files || [])
                    setArquivosAudio((p) => [...p, ...fs])
                    e.target.value = ''
                  }}
                />
                {transcrevendo && (
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo…
                  </span>
                )}
                {gravando && (
                  <span className="text-[11px] text-red-600 inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> gravando…
                  </span>
                )}
              </div>
              {arquivosAudio.length > 0 && (
                <div className="text-[11px] text-gray-600">
                  {arquivosAudio.length} arquivo(s) de áudio pronto(s) p/ anexar.
                </div>
              )}
              {/* TX-f v2 (22/10): campo TRANSCRIÇÃO SEMPRE visível no dialog */}
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <FileAudio className="h-3 w-3" /> Transcrição do áudio (IA)
                  {transcrevendo && (
                    <span className="inline-flex items-center gap-1 text-gray-400 normal-case font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" /> transcrevendo…
                    </span>
                  )}
                </Label>
                <Textarea
                  value={transcricao}
                  onChange={(e) => setTranscricao(e.target.value)}
                  rows={4}
                  placeholder="Grave ou suba um áudio — a transcrição aparece aqui (editável)."
                  className="bg-white text-[12px]"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Resumo / discussões
              </Label>
              <Textarea
                value={form.resumo}
                onChange={(e) => setForm({ ...form, resumo: e.target.value })}
                rows={4}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Decisões
              </Label>
              <Textarea
                value={form.decisoes}
                onChange={(e) => setForm({ ...form, decisoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.titulo.trim()}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              {editandoAta ? 'Salvar alterações' : 'Criar ata'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog excluir ata */}
      <Dialog open={!!excluindoAta} onOpenChange={(o) => !o && setExcluindoAta(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Excluir ata</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600">
            Excluir "{excluindoAta?.titulo}"? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoAta(null)} className="h-9">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExcluir} className="h-9">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
