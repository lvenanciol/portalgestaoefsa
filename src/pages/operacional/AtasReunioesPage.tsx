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

// Fase 7 (prompt-mestre) — Atas & Reuniões: data/hora, modalidade (Presencial,
// Teams, Meet + link), participantes, pauta, discussões, decisões e action
// items com dono/prazo. Botão "Gerar tarefas" cria itens no kanban.

const parse = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch (_) {
    return []
  }
}

const MOD_COR: Record<string, string> = {
  Presencial: 'bg-emerald-50 text-emerald-700',
  'Microsoft Teams': 'bg-indigo-50 text-indigo-700',
  'Google Meet': 'bg-sky-50 text-sky-700',
}

export default function AtasReunioesPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [novoItem, setNovoItem] = useState({ acao: '', dono: '', prazo: '' })
  const [gerandoTarefas, setGerandoTarefas] = useState(false)
  const [resumindo, setResumindo] = useState(false)
  const [parecerIA, setParecerIA] = useState<any | null>(null)

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
      data: '',
      hora: '',
      modalidade: 'Presencial',
      link_reuniao: '',
      participantes: '',
      pauta: '',
      resumo: '',
      decisoes: '',
    })
    setTranscricao('')
    setInterpretacao('')
    setArquivosAudio([])
    setDialog(true)
  }

  // T-Xf: editar ata existente (dialog com todos os campos; áudios novos são
  // ACRESCENTADOS aos existentes — update via FormData não apaga os antigos)
  const abrirEditarAta = (a: any) => {
    setEditandoAta(a)
    setForm({
      titulo: a.titulo || '',
      data: String(a.data || '').slice(0, 10),
      modalidade: a.modalidade || 'Presencial',
      link_reuniao: a.link_reuniao || '',
      participantes: a.participantes || '',
      pauta: a.pauta || '',
      resumo: a.resumo || '',
      decisoes: a.decisoes || '',
    })
    setTranscricao('')
    setInterpretacao('')
    setArquivosAudio([])
    setDialog(true)
  }

  // T-X (22/10): "Ouvir" GRAVA áudio (MediaRecorder) + transcreve ao vivo via
  // SpeechRecognition; gravação só para no clique de "Parar" (sem timeout).
  const [ouvindo, setOuvindo] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [interpretacao, setInterpretacao] = useState('')
  const [organizando, setOrganizando] = useState(false)
  const [arquivoAudio, setArquivoAudio] = useState<File | null>(null)
  // T-Xb (21/10): MÚLTIPLOS arquivos de áudio/txt — todos anexados à ata; o 1º
  // .txt/.md alimenta a transcrição; áudios vão para a coleção (upload em lote).
  const [arquivosAudio, setArquivosAudio] = useState<File[]>([])
  const recRef = useRef<any>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // T5a: ref espelho do estado ouvindo (onend/onerror não veem o state fresco)
  const ouvindoRef = useRef(false)
  // T-Xf: edição e exclusão de atas
  const [editandoAta, setEditandoAta] = useState<any | null>(null)
  const [excluindoAta, setExcluindoAta] = useState<any | null>(null)

  // T-Xa/b/c: inicia MediaRecorder (áudio gravável) + SpeechRecognition em
  // paralelo. Sem timeout: a gravação SÓ para no clique de "Parar" (onsilence
  // ignorado; onend reinicia enquanto ouvindoRef=true). Ao parar, o áudio vira
  // um File na lista de gravações (uma ata tem gravações ilimitadas).
  const toggleOuvir = () => {
    if (ouvindo) {
      // para MediaRecorder + SpeechRecognition SOMENTE no clique
      ouvindoRef.current = false
      try {
        mediaRef.current?.stop()
      } catch (_e) {
        /* já encerrado */
      }
      try {
        recRef.current?.stop()
      } catch (_e2) {
        /* sessão já encerrada */
      }
      setOuvindo(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setErro('Reconhecimento de voz não suportado neste navegador (use Chrome ou Safari).')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream
        chunksRef.current = []
        try {
          const mr = new MediaRecorder(stream)
          mediaRef.current = mr
          mr.ondataavailable = (ev: any) => {
            if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
          }
          mr.onstop = () => {
            try {
              const blob = new Blob(chunksRef.current, {
                type: mr.mimeType || 'audio/webm',
              })
              if (blob.size > 0) {
                const ext = (mr.mimeType || 'audio/webm').includes('ogg')
                  ? 'ogg'
                  : (mr.mimeType || 'audio/webm').includes('mp4')
                    ? 'm4a'
                    : 'webm'
                const f = new File([blob], 'gravacao-' + Date.now() + '.' + ext, {
                  type: blob.type,
                })
                setArquivosAudio((prev) => [...prev, f])
              }
            } catch (_e) {
              /* blob indisponível — segue só com a transcrição */
            }
            streamRef.current?.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
          mr.start()
        } catch (_e3) {
          streamRef.current?.getTracks().forEach((t) => t.stop())
          streamRef.current = null
          setErro('Não foi possível iniciar a gravação de áudio.')
          return
        }
        // transcrição ao vivo em paralelo (não para a gravação)
        const rec = new SR()
        rec.lang = 'pt-BR'
        rec.continuous = true
        rec.interimResults = false
        rec.onresult = (ev: any) => {
          let t = ''
          for (let i = ev.resultIndex; i < ev.results.length; i++)
            t += ev.results[i][0].transcript + ' '
          setTranscricao((prev: string) => (prev + ' ' + t).trim())
        }
        rec.onerror = (ev: any) => {
          const cod = ev?.error || 'desconhecido'
          if (cod === 'not-allowed' || cod === 'service-not-allowed') {
            setErro(
              'Transcrição bloqueada: permita o microfone para este site no navegador (a gravação continua).',
            )
            return
          }
          if (cod === 'no-speech' || cod === 'aborted') return
          if (cod === 'network') {
            setErro('Falha de rede no serviço de voz — a gravação de áudio continua.')
            return
          }
          if (cod === 'audio-capture') {
            setErro('Nenhum microfone encontrado para a transcrição.')
            return
          }
          setErro('Erro no reconhecimento de voz: ' + cod + '.')
        }
        rec.onend = () => {
          // T-Xc: reinicia enquanto o usuário não clicou em Parar (sem timeout)
          if (recRef.current === rec && ouvindoRef.current) {
            try {
              rec.start()
            } catch (_e5) {
              /* reinício falhou — transcrição segue do próximo ciclo */
            }
          }
        }
        recRef.current = rec
        ouvindoRef.current = true
        try {
          rec.start()
        } catch (_e6) {
          setErro(
            'Não foi possível iniciar a transcrição (' +
              String((_e6 as any)?.message || _e6) +
              '). A gravação de áudio continua.',
          )
        }
        setOuvindo(true)
        setErro('')
      })
      .catch(() => {
        setErro(
          'Microfone bloqueado: permita o microfone na barra de endereço e clique em Ouvir novamente.',
        )
      })
  }

  const organizarComIA = async () => {
    const texto = transcricao.trim()
    if (!texto) {
      setErro('Grave ou transcreva o áudio da reunião primeiro.')
      return
    }
    setOrganizando(true)
    try {
      const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
        method: 'POST',
        body: JSON.stringify({ alvo: 'ata', texto }),
      })) as any
      const e = r.estrutura || {}
      setForm((f: any) => ({
        ...f,
        titulo: e.titulo || f.titulo,
        data: e.data || f.data,
        modalidade: e.modalidade || f.modalidade,
        participantes: Array.isArray(e.participantes)
          ? e.participantes.join(', ')
          : f.participantes,
        // T5b: pauta = transcrição LITERAL (visão principal); IA complementa em decisões/resumo
        pauta: f.pauta ? f.pauta : texto,
        decisoes: e.decisoes || f.decisoes,
        resumo: e.resumo || f.resumo,
      }))
      setInterpretacao(
        'Resumo IA: ' +
          (e.resumo || '') +
          (Array.isArray(e.action_items) && e.action_items.length
            ? '\nAction items: ' +
              e.action_items
                .map((a: any) => a.acao + (a.dono ? ' (' + a.dono + ')' : ''))
                .join('; ')
            : ''),
      )
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setOrganizando(false)
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
  const excluirAta = async () => {
    if (!excluindoAta) return
    try {
      await pb.collection('atas').delete(excluindoAta.id)
      setExcluindoAta(null)
      if (detalhe?.id === excluindoAta.id) setDetalhe(null)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const addActionItem = async () => {
    if (!detalhe || !novoItem.acao.trim()) return
    const lista = parse(detalhe.action_items)
    lista.push(novoItem)
    try {
      await pb.collection('atas').update(detalhe.id, { action_items: JSON.stringify(lista) })
      setNovoItem({ acao: '', dono: '', prazo: '' })
      const upd = await pb.collection('atas').getOne(detalhe.id)
      setDetalhe(upd)
    } catch (e) {
      setErro(String(e))
    }
  }

  const gerarTarefas = async () => {
    if (!detalhe) return
    setGerandoTarefas(true)
    try {
      const items = parse(detalhe.action_items)
      for (const it of items) {
        await pb.collection('tarefas').create({
          titulo: it.acao,
          responsavel: it.dono || '',
          prazo: it.prazo ? it.prazo + ' 00:00:00.000Z' : '',
          prioridade_p: 'P2',
          prioridade: 'media',
          status_kanban: 'a_fazer',
          status: 'pendente',
          vinculo_tipo: 'ata',
          vinculo_id: detalhe.id,
          criado_por: user?.email || '',
        })
      }
      setErro('')
      alert(items.length + ' tarefa(s) criada(s) no kanban (A Fazer), vinculadas a esta ata.')
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerandoTarefas(false)
    }
  }

  // T5c: prompt do parecer editável/restaurável (localStorage)
  const PROMPT_PARECER_PADRAO =
    'Resuma em 5 linhas executivas: decisões, responsáveis, prazos e pendências críticas.'
  const [promptParecer, setPromptParecer] = useState(
    () => localStorage.getItem('pge_prompt_parecer_ata') || PROMPT_PARECER_PADRAO,
  )
  const [dialogPrompt, setDialogPrompt] = useState(false)
  const [promptEdit, setPromptEdit] = useState('')

  const resumirComIA = async () => {
    // usa a ata do detalhe se aberto; senão, a mais recente
    let alvo = detalhe
    if (!alvo) {
      try {
        const lista = await pb.collection('atas').getList(1, 1, { sort: '-created' })
        alvo = lista.items[0] as any
      } catch (_) {
        return
      }
    }
    if (!alvo) return
    setResumindo(true)
    try {
      const r = (await pb.send('/backend/v1/ia/resumo-ata', {
        method: 'POST',
        body: JSON.stringify({ ata_id: alvo.id, prompt_extra: promptParecer }),
      })) as any
      setParecerIA(r.estrutura)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setResumindo(false)
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPromptEdit(promptParecer)
              setDialogPrompt(true)
            }}
            className="h-9"
            title="Editar o prompt usado no botão Parecer"
          >
            Prompt
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resumirComIA}
            disabled={resumindo}
            className="h-9"
          >
            {resumindo ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            Parecer
          </Button>
          <Button onClick={abrirNova} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
            <Plus className="h-4 w-4 mr-1" /> Nova ata
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="space-y-3">
        {itens.map((a) => {
          const items = parse(a.action_items)
          return (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetalhe(a)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-gray-900">{a.titulo}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {String(a.data || '')
                      .slice(0, 10)
                      .split('-')
                      .reverse()
                      .join('/')}
                    <span
                      className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded',
                        MOD_COR[a.modalidade] || 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {a.modalidade || '—'}
                    </span>
                  </div>
                  <div className="text-[12px] text-gray-600 mt-1.5 line-clamp-2">
                    {a.resumo || a.pauta}
                  </div>
                  {/* T-Xe: gravações da ata — cada áudio tocável individualmente */}
                  {(a.audio || []).length > 0 && (
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
                </div>
              </div>
            </div>
          )
        })}
        {itens.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">Nenhuma ata registrada.</p>
        )}
      </div>

      {/* Dialog nova */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoAta ? 'Editar ata' : 'Nova ata'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* T5: áudio da reunião — gravação + upload + IA organiza */}
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" /> Áudio da reunião
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleOuvir}
                    className={cn(
                      'h-8',
                      ouvindo && 'bg-red-50 text-red-700 border-red-300 animate-pulse',
                    )}
                  >
                    {ouvindo ? (
                      <Square className="h-3.5 w-3.5 mr-1 fill-red-600 text-red-600" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 mr-1" />
                    )}
                    {ouvindo ? 'Parar' : 'Ouvir'}
                  </Button>
                  <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[12px] font-semibold text-gray-800 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" /> Upload
                    <input
                      type="file"
                      multiple
                      accept="audio/*,.txt,.md"
                      className="hidden"
                      onChange={async (e) => {
                        // T-Xb: MÚLTIPLOS arquivos — todos ficam na lista p/ anexar
                        const fs = Array.from(e.target.files || [])
                        if (fs.length === 0) return
                        setArquivosAudio((prev) => [...prev, ...fs])
                        const f = fs[0]
                        // T5b: .txt/.md → transcrição literal direto (visão principal da ata)
                        if (/\.(txt|md)$/i.test(f.name)) {
                          const rd = new FileReader()
                          rd.onload = () => setTranscricao(String(rd.result || '').trim())
                          rd.readAsText(f)
                          return
                        }
                        // T5d: áudio (mp3/m4a/wav/webm/ogg) → transcreve via Gemini
                        if (/\.(mp3|m4a|wav|webm|ogg|mp4)$/i.test(f.name)) {
                          setErro('')
                          try {
                            const rd = new FileReader()
                            rd.onload = async () => {
                              try {
                                const b64 = String(rd.result || '').split(',')[1] || ''
                                const r = (await pb.send('/backend/v1/ia/transcrever', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    audio_base64: b64,
                                    mime: f.type || 'audio/webm',
                                  }),
                                })) as any
                                if (!r.ok) throw new Error(r.erro || 'falha na transcrição')
                                setTranscricao(String(r.texto || '').trim())
                              } catch (er: any) {
                                setErro(
                                  'Transcrição: ' +
                                    (er?.response?.data?.erro || er?.message || String(er)),
                                )
                              }
                            }
                            rd.readAsDataURL(f)
                          } catch (er) {
                            setErro('Transcrição: ' + String(er))
                          }
                        }
                      }}
                    />
                  </label>{' '}
                  <Button
                    type="button"
                    size="sm"
                    onClick={organizarComIA}
                    disabled={organizando || !transcricao.trim()}
                    className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    {organizando ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                    )}
                    Organizar com IA
                  </Button>
                </div>
              </div>
              {transcricao && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                    Transcrição literal (editável — gravações novas ACRESCENTAM ao texto)
                  </div>
                  <Textarea
                    value={transcricao}
                    onChange={(e) => setTranscricao(e.target.value)}
                    rows={4}
                    className="text-[11px] italic bg-white"
                  />
                </div>
              )}
              {interpretacao && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                    Interpretação (IA)
                  </div>
                  <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{interpretacao}</p>
                </div>
              )}
              {arquivoAudio && (
                <p className="text-[11px] text-gray-500">
                  Arquivo: {arquivoAudio.name} — a transcrição usa o reconhecimento do navegador;
                  grave ao vivo para preencher automático.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Título *
              </Label>
              <Input
                value={form.titulo || ''}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Data
                </Label>
                <Input
                  type="date"
                  value={form.data || ''}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Modalidade
                </Label>
                <Select
                  value={form.modalidade || 'Presencial'}
                  onValueChange={(v) => setForm({ ...form, modalidade: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Presencial">Presencial</SelectItem>
                    <SelectItem value="Microsoft Teams">Microsoft Teams</SelectItem>
                    <SelectItem value="Google Meet">Google Meet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Link (se online)
                </Label>
                <Input
                  value={form.link_reuniao || ''}
                  onChange={(e) => setForm({ ...form, link_reuniao: e.target.value })}
                  className="h-10 bg-gray-50"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Participantes
              </Label>
              {/* T-Xc (21/10): dropdown MULTI — lista parceiros/contatos COM centro de
                  resultado preenchido; seleção grava nomes separados por vírgula. */}
              <ParticipantesSelector
                value={form.participantes || ''}
                onChange={(v: string) => setForm((f: any) => ({ ...f, participantes: v }))}
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Pauta
                </Label>
                {transcricao.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f: any) => ({
                        ...f,
                        pauta: (f.pauta ? f.pauta + '\n\n' : '') + transcricao.trim(),
                      }))
                    }
                    className="text-[11px] font-semibold text-[#1B5E20] hover:underline"
                  >
                    + Acrescentar transcrição
                  </button>
                )}
              </div>
              <Textarea
                value={form.pauta || ''}
                onChange={(e) => setForm({ ...form, pauta: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Discussões
              </Label>
              <Textarea
                value={form.resumo || ''}
                onChange={(e) => setForm({ ...form, resumo: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Decisões
              </Label>
              <Textarea
                value={form.decisoes || ''}
                onChange={(e) => setForm({ ...form, decisoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.titulo}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detalhe?.titulo}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                {String(detalhe.data || '')
                  .slice(0, 10)
                  .split('-')
                  .reverse()
                  .join('/')}{' '}
                · {detalhe.modalidade}
                {detalhe.link_reuniao && (
                  <a
                    href={detalhe.link_reuniao}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#1B5E20] font-semibold hover:underline"
                  >
                    entrar na reunião
                  </a>
                )}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Participantes
                </div>
                <p className="text-[13px] text-gray-700">{detalhe.participantes || '—'}</p>
              </div>
              {/* T-Xe: gravações da ata — cada uma tocável individualmente */}
              {(detalhe.audio || []).length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                    <FileAudio className="h-3.5 w-3.5" /> Gravações (
                    {(parse(detalhe.audio) as string[]).length})
                  </div>
                  <div className="space-y-2">
                    {(parse(detalhe.audio) as string[]).map((fn: string) => (
                      <audio
                        key={fn}
                        controls
                        preload="none"
                        src={pb.files.getURL(detalhe, fn)}
                        className="w-full h-10"
                      />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Pauta
                </div>
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap">
                  {detalhe.pauta || '—'}
                </p>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Discussões
                </div>
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap">
                  {detalhe.resumo || '—'}
                </p>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Decisões
                </div>
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap">
                  {detalhe.decisoes || '—'}
                </p>
              </div>
              {/* Action items */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Action items
                </div>
                <div className="space-y-2">
                  {parse(detalhe.action_items).map((it: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                      <span className="text-[13px] text-gray-800 flex-1">{it.acao}</span>
                      <span className="text-[11px] font-semibold text-gray-600">{it.dono}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{it.prazo}</span>
                    </div>
                  ))}
                  {parse(detalhe.action_items).length === 0 && (
                    <p className="text-[12px] text-gray-400">Nenhum.</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                  <Input
                    value={novoItem.acao}
                    onChange={(e) => setNovoItem({ ...novoItem, acao: e.target.value })}
                    placeholder="Ação..."
                    className="h-9 text-xs bg-gray-50 sm:col-span-2"
                  />
                  <Input
                    value={novoItem.dono}
                    onChange={(e) => setNovoItem({ ...novoItem, dono: e.target.value })}
                    placeholder="Dono"
                    className="h-9 text-xs bg-gray-50"
                  />
                  <Input
                    type="date"
                    value={novoItem.prazo}
                    onChange={(e) => setNovoItem({ ...novoItem, prazo: e.target.value })}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={addActionItem} className="h-9">
                    + Action item
                  </Button>
                  <Button
                    size="sm"
                    onClick={gerarTarefas}
                    disabled={gerandoTarefas}
                    className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    {gerandoTarefas ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <ListTodo className="h-3.5 w-3.5 mr-1" />
                    )}
                    Gerar tarefas no kanban
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Resumo IA */}
      {/* T5c: dialog editar prompt do parecer */}
      <Dialog open={dialogPrompt} onOpenChange={setDialogPrompt}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Prompt do parecer (IA)</DialogTitle>
          </DialogHeader>
          <Textarea
            value={promptEdit}
            onChange={(e) => setPromptEdit(e.target.value)}
            rows={6}
            className="text-[13px]"
          />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPromptEdit(PROMPT_PARECER_PADRAO)
                localStorage.removeItem('pge_prompt_parecer_ata')
                setPromptParecer(PROMPT_PARECER_PADRAO)
              }}
              className="h-9 text-gray-500"
            >
              Restaurar padrão
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setDialogPrompt(false)} className="h-9">
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  const v = promptEdit.trim() || PROMPT_PARECER_PADRAO
                  localStorage.setItem('pge_prompt_parecer_ata', v)
                  setPromptParecer(v)
                  setDialogPrompt(false)
                }}
                className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                Salvar prompt
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Este texto é enviado à IA junto do conteúdo da ata quando você clica em "Parecer".
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!parecerIA} onOpenChange={(o) => !o && setParecerIA(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#1B5E20]" /> Resumo IA da ata
            </DialogTitle>
          </DialogHeader>
          {parecerIA && (
            <div className="space-y-3">
              {typeof parecerIA.score_saude === 'number' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      parecerIA.score_saude >= 7
                        ? 'bg-emerald-600'
                        : parecerIA.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {parecerIA.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score
                    </div>
                    <div className="text-[13px] text-gray-700">0-10</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Sumário executivo
                </div>
                <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {parecerIA.sumario_executivo}
                </p>
              </div>
              {parecerIA.principais_achados?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Principais achados
                  </div>
                  <ul className="space-y-1">
                    {parecerIA.principais_achados.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerIA.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {parecerIA.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerIA.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Recomendações
                  </div>
                  <ol className="space-y-1">
                    {parecerIA.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {parecerIA.disclaimer || 'Análise assistida — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* T-Xf: confirmar exclusão da ata */}
      <Dialog open={!!excluindoAta} onOpenChange={(o) => !o && setExcluindoAta(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ata</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600">
            Confirma excluir <strong>{excluindoAta?.titulo || 'esta ata'}</strong>? A ação não pode
            ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoAta(null)} className="h-9">
              Cancelar
            </Button>
            <Button onClick={excluirAta} className="h-9 bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// T-Xc (2026-10-21) — seletor MULTI de participantes: dropdown com checkbox
// listando parceiros/contatos COM centro de resultado preenchido (tela
// Parceiros & Contatos). Grava nomes separados por vírgula (compatível com o
// campo texto existente).
function ParticipantesSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [parceiros, setParceiros] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto || parceiros.length > 0) return
    setLoading(true)
    pb.collection('parceiros')
      .getFullList({ sort: 'nome' })
      .then((r: any[]) => {
        // SOMENTE parceiros/contatos com centro de resultado preenchido
        setParceiros(r.filter((p) => (p.centro_resultado || '').trim() !== ''))
      })
      .catch(() => setParceiros([]))
      .finally(() => setLoading(false))
  }, [aberto])

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const nomes = (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const toggle = (nome: string) => {
    if (nomes.includes(nome)) onChange(nomes.filter((n) => n !== nome).join(', '))
    else onChange([...nomes, nome].join(', '))
  }

  return (
    <div className="relative" ref={ref}>
      <div
        className="min-h-10 h-auto py-2 px-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer flex flex-wrap items-center gap-1.5"
        onClick={() => setAberto((v) => !v)}
      >
        {nomes.length === 0 && (
          <span className="text-[13px] text-gray-400">selecione um ou mais participantes…</span>
        )}
        {nomes.map((n) => (
          <span
            key={n}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-semibold"
          >
            {n}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggle(n)
              }}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {aberto && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <p className="text-center text-[12px] text-gray-400 py-4">Carregando…</p>}
          {!loading && parceiros.length === 0 && (
            <p className="text-center text-[12px] text-gray-400 py-4">
              Nenhum parceiro/contato com centro de resultado preenchido.
            </p>
          )}
          {!loading &&
            parceiros.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.nome)}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-[12px]"
              >
                <input
                  type="checkbox"
                  checked={nomes.includes(p.nome)}
                  readOnly
                  className="h-3.5 w-3.5"
                />
                <span className="font-semibold text-gray-800">{p.nome}</span>
                <span className="text-gray-400">{p.empresa || ''}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
