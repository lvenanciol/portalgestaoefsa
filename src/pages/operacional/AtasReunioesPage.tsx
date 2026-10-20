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
    setDialog(true)
  }

  // T5: áudio da reunião — gravação ("Ouvir") via SpeechRecognition + upload de arquivo
  const [ouvindo, setOuvindo] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [interpretacao, setInterpretacao] = useState('')
  const [organizando, setOrganizando] = useState(false)
  const [arquivoAudio, setArquivoAudio] = useState<File | null>(null)
  const recRef = useRef<any>(null)
  // T5a: ref espelho do estado ouvindo (onend/onerror não veem o state fresco)
  const ouvindoRef = useRef(false)

  const toggleOuvir = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setErro('Reconhecimento de voz não suportado neste navegador (use Chrome ou Safari).')
      return
    }
    if (ouvindo) {
      // T5a: para SOMENTE no clique do botão (reinicia se o serviço cair)
      try {
        recRef.current?.stop()
      } catch (_e) {
        /* sessão já encerrada */
      }
      setOuvindo(false)
      return
    }
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
      // T5a: informa o motivo — sem permissão o usuário ficava sem saber
      if (cod === 'not-allowed' || cod === 'service-not-allowed') {
        ouvindoRef.current = false
        setOuvindo(false)
        setErro(
          'Microfone bloqueado: clique no ícone de cadeado/microfone na barra de endereço e permita o microfone para este site, depois clique em Ouvir novamente.',
        )
        return
      }
      if (cod === 'no-speech' || cod === 'aborted') {
        try {
          rec.start()
        } catch (_e2) {
          /* reinício imediato falhou — onend cuidará */
        }
        return
      }
      if (cod === 'network') {
        ouvindoRef.current = false
        setOuvindo(false)
        setErro(
          'Falha de rede no serviço de voz — verifique a conexão e clique em Ouvir novamente.',
        )
        return
      }
      if (cod === 'audio-capture') {
        ouvindoRef.current = false
        setOuvindo(false)
        setErro('Nenhum microfone encontrado — conecte um microfone e tente novamente.')
        return
      }
      setErro('Erro no reconhecimento de voz: ' + cod + '.')
      setOuvindo(false)
    }
    rec.onend = () => {
      // T5a: enquanto o usuário não clicou em Parar, reinicia a sessão
      if (recRef.current === rec && ouvindoRef.current) {
        try {
          rec.start()
        } catch (_e3) {
          /* reinício falhou — encerra a gravação */
        }
      } else {
        setOuvindo(false)
      }
    }
    recRef.current = rec
    ouvindoRef.current = true
    rec.start()
    setOuvindo(true)
    setErro('')
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
      // T5b: com arquivo de áudio, salva via FormData (anexa o áudio à ata)
      if (arquivoAudio && /\.(mp3|m4a|wav|webm|ogg|mp4)$/i.test(arquivoAudio.name)) {
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
        fd.append('audio', arquivoAudio)
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
                </div>
                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1B5E20] bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                    <ListTodo className="h-3 w-3" /> {items.length} action item(s)
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
            <DialogTitle>Nova ata</DialogTitle>
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
                    className={cn('h-8', ouvindo && 'bg-red-50 text-red-700 border-red-200')}
                  >
                    {ouvindo ? (
                      <X className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 mr-1" />
                    )}
                    {ouvindo ? 'Parar' : 'Ouvir'}
                  </Button>
                  <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[12px] font-semibold text-gray-800 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" /> Upload
                    <input
                      type="file"
                      accept="audio/*,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        setArquivoAudio(f)
                        // T5b: .txt/.md → transcrição literal direto (visão principal da ata)
                        if (/\.(txt|md)$/i.test(f.name)) {
                          const rd = new FileReader()
                          rd.onload = () => setTranscricao(String(rd.result || '').trim())
                          rd.readAsText(f)
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
                    Transcrição literal
                  </div>
                  <p className="text-[11px] text-gray-600 italic max-h-20 overflow-y-auto">
                    {transcricao}
                  </p>
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
              <Input
                value={form.participantes || ''}
                onChange={(e) => setForm({ ...form, participantes: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Pauta
              </Label>
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
            <DialogTitle className="flex items-center justify-between">
              <span>{detalhe?.titulo}</span>
              <button
                onClick={() => setDetalhe(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
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
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#1B5E20]" /> Resumo IA da ata
              </span>
              <button
                onClick={() => setParecerIA(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
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
    </div>
  )
}
