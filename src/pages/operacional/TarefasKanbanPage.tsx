import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Kanban,
  Plus,
  Loader2,
  Calendar,
  AlertTriangle,
  X,
  MessageSquare,
  ListChecks,
  Mic,
  Share2,
  Mail,
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

// Fase 7 (prompt-mestre) — Tarefas & Agenda: kanban 4 colunas (A Fazer,
// Em Andamento, Bloqueado, Concluído), prioridade P1-P3, subtarefas,
// comentários, vínculo, calendário mensal com criação rápida e widget
// "Compromissos de hoje" + alertas de atraso.

const COLUNAS = [
  { key: 'a_fazer', label: 'A Fazer', cor: 'bg-gray-100 text-gray-700' },
  { key: 'em_andamento', label: 'Em Andamento', cor: 'bg-amber-50 text-amber-700' },
  { key: 'bloqueado', label: 'Bloqueado', cor: 'bg-red-50 text-red-700' },
  { key: 'concluido', label: 'Concluído', cor: 'bg-emerald-50 text-emerald-700' },
]

const PRIO_COR: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-amber-100 text-amber-700',
  P3: 'bg-gray-100 text-gray-600',
}

const fmtData = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}` : s
}

export default function TarefasKanbanPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [vista, setVista] = useState<'kanban' | 'calendario'>('kanban')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [novoComentario, setNovoComentario] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [mesRef, setMesRef] = useState(() => new Date().toISOString().slice(0, 7))

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('tarefas').getFullList({ sort: '-created' })
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

  const hoje = new Date().toISOString().slice(0, 10)
  const atrasadas = itens.filter(
    (t) => t.status_kanban !== 'concluido' && t.prazo && String(t.prazo).slice(0, 10) < hoje,
  )
  const deHoje = itens.filter((t) => t.prazo && String(t.prazo).slice(0, 10) === hoje)

  const mover = async (t: any, novo: string) => {
    try {
      await pb.collection('tarefas').update(t.id, {
        status_kanban: novo,
        status:
          novo === 'concluido'
            ? 'concluida'
            : novo === 'em_andamento'
              ? 'em_andamento'
              : 'pendente',
      })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const abrirNova = () => {
    setForm({
      titulo: '',
      responsavel: '',
      prazo: '',
      prioridade_p: 'P2',
      status_kanban: 'a_fazer',
      descricao: '',
      vinculo_tipo: '',
      vinculo_id: '',
      empresa: '',
      parceiro_ids: [],
    })
    setEditando(null)
    setDialog(true)
  }

  // T2a: abertura de chamado por ÁUDIO — Web Speech API (nativo do navegador)
  const [parceiros, setParceiros] = useState<any[]>([])
  const [ouvindo, setOuvindo] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [estruturando, setEstruturando] = useState(false)
  const recRef = useRef<any>(null)

  const carregarParceiros = async () => {
    try {
      const r = await pb
        .collection('parceiros')
        .getFullList({ sort: 'nome', filter: 'ativo = true' })
      setParceiros(r as any[])
    } catch (_) {
      setParceiros([])
    }
  }

  useEffect(() => {
    carregarParceiros()
  }, [])

  const toggleOuvir = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setErro('Reconhecimento de voz não suportado neste navegador (use Chrome ou Safari).')
      return
    }
    if (ouvindo) {
      recRef.current?.stop()
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
      setTranscricao((prev) => (prev + ' ' + t).trim())
    }
    rec.onerror = () => setOuvindo(false)
    rec.onend = () => setOuvindo(false)
    recRef.current = rec
    setTranscricao('')
    rec.start()
    setOuvindo(true)
  }

  const estruturarVoz = async () => {
    if (!transcricao.trim()) return
    setEstruturando(true)
    try {
      const r = (await pb.send('/backend/v1/ia/estruturar-voz', {
        method: 'POST',
        body: JSON.stringify({ alvo: 'tarefa', texto: transcricao }),
      })) as any
      const e = r.estrutura || {}
      setForm((f: any) => ({
        ...f,
        titulo: e.titulo || f.titulo,
        descricao: e.descricao || f.descricao,
        responsavel: e.responsavel || f.responsavel,
        prazo: e.prazo || f.prazo,
        prioridade_p: e.prioridade_p || f.prioridade_p,
        empresa: e.empresa || f.empresa,
      }))
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setEstruturando(false)
    }
  }

  // T2c: compartilhar tarefa com parceiro
  const [compartilhar, setCompartilhar] = useState<any | null>(null) // {tarefa, parceiros[]}
  const compartilharTarefa = async (tarefa: any, canal: string) => {
    const pid = compartilhar?.parceiroId
    if (!pid) return
    try {
      const r = (await pb.send('/backend/v1/tarefas/compartilhar', {
        method: 'POST',
        body: JSON.stringify({ canal, parceiro_id: pid, tarefa_id: tarefa.id }),
      })) as any
      if (r.canal === 'whatsapp' && r.link) {
        window.open(r.link, '_blank')
      } else if (r.ok) {
        setErro('')
        alert('Tarefa enviada por e-mail ao parceiro.')
      }
      setCompartilhar(null)
    } catch (e) {
      setErro(String(e))
    }
  }

  const abrirCompartilhar = (t: any) => {
    // parceiros vinculados à tarefa (ids em t.parceiros JSONB)
    let ids: string[] = []
    try {
      ids = Array.isArray(t.parceiros) ? t.parceiros : JSON.parse(t.parceiros || '[]')
    } catch (_) {
      ids = []
    }
    const vinc = parceiros.filter((p) => ids.includes(p.id))
    if (vinc.length === 0) {
      setErro('Tarefa sem parceiro vinculado — edite a tarefa e vincule um parceiro/contato.')
      return
    }
    setCompartilhar({ tarefa: t, parceiros: vinc, parceiroId: vinc[0]?.id })
  }

  const salvar = async () => {
    // T2b: parceiro(s) responsável(is) OBRIGATÓRIO(S)
    if (!form.parceiro_ids || form.parceiro_ids.length === 0) {
      setErro('Vincule pelo menos um parceiro/contato responsável antes de salvar.')
      return
    }
    setSalvando(true)
    try {
      const dados: any = {
        titulo: form.titulo,
        responsavel: form.responsavel,
        prazo: form.prazo ? form.prazo + ' 00:00:00.000Z' : '',
        prioridade_p: form.prioridade_p,
        status_kanban: form.status_kanban,
        descricao: form.descricao,
        vinculo_tipo: form.vinculo_tipo || '',
        vinculo_id: form.vinculo_id || '',
        empresa: form.empresa || '',
        parceiros: JSON.stringify(form.parceiro_ids || []),
        prioridade:
          form.prioridade_p === 'P1' ? 'alta' : form.prioridade_p === 'P2' ? 'media' : 'baixa',
        status:
          form.status_kanban === 'concluido'
            ? 'concluida'
            : form.status_kanban === 'em_andamento'
              ? 'em_andamento'
              : 'pendente',
      }
      if (editando) await pb.collection('tarefas').update(editando.id, dados)
      else {
        dados.criado_por = user?.email || ''
        await pb.collection('tarefas').create(dados)
      }
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  const addComentario = async () => {
    if (!detalhe || !novoComentario.trim()) return
    const lista = Array.isArray(detalhe.comentarios)
      ? detalhe.comentarios
      : JSON.parse(detalhe.comentarios || '[]')
    lista.push({ autor: user?.email || '', texto: novoComentario, when: hoje })
    try {
      await pb.collection('tarefas').update(detalhe.id, { comentarios: JSON.stringify(lista) })
      setNovoComentario('')
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      setDetalhe(upd)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const addSub = async () => {
    if (!detalhe || !novaSub.trim()) return
    const lista = Array.isArray(detalhe.subtarefas)
      ? detalhe.subtarefas
      : JSON.parse(detalhe.subtarefas || '[]')
    lista.push({ t: novaSub, ok: false })
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(lista) })
      setNovaSub('')
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      setDetalhe(upd)
    } catch (e) {
      setErro(String(e))
    }
  }

  const toggleSub = async (idx: number) => {
    if (!detalhe) return
    const lista = Array.isArray(detalhe.subtarefas)
      ? detalhe.subtarefas
      : JSON.parse(detalhe.subtarefas || '[]')
    lista[idx].ok = !lista[idx].ok
    try {
      await pb.collection('tarefas').update(detalhe.id, { subtarefas: JSON.stringify(lista) })
      const upd = await pb.collection('tarefas').getOne(detalhe.id)
      setDetalhe(upd)
    } catch (e) {
      setErro(String(e))
    }
  }

  // calendário do mês
  const diasMes = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number)
    const primeiro = new Date(y, m - 1, 1)
    const dias = new Date(y, m, 0).getDate()
    const offset = (primeiro.getDay() + 6) % 7 // semana começa segunda
    const cells: (string | null)[] = Array(offset).fill(null)
    for (let d = 1; d <= dias; d++) {
      cells.push(`${mesRef}-${String(d).padStart(2, '0')}`)
    }
    return cells
  }, [mesRef])

  const tarefasPorDia = (dia: string) =>
    itens.filter((t) => String(t.prazo || '').slice(0, 10) === dia)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Kanban className="h-6 w-6 text-[#1B5E20]" /> Tarefas & Agenda
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Kanban do time com prioridades, subtarefas e calendário
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setVista('kanban')}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-semibold',
                vista === 'kanban' ? 'bg-[#1B5E20] text-white' : 'text-gray-600',
              )}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setVista('calendario')}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-semibold',
                vista === 'calendario' ? 'bg-[#1B5E20] text-white' : 'text-gray-600',
              )}
            >
              Calendário
            </button>
          </div>
          <Button onClick={abrirNova} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
            <Plus className="h-4 w-4 mr-1" /> Nova tarefa
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* Widgets: compromissos de hoje + atrasos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Compromissos de hoje
          </div>
          {deHoje.length === 0 ? (
            <p className="text-[12px] text-gray-400">Nenhum compromisso para hoje.</p>
          ) : (
            <div className="space-y-1.5">
              {deHoje.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetalhe(t)}
                  className="block w-full text-left text-[13px] font-medium text-gray-800 hover:text-[#1B5E20] truncate"
                >
                  · {t.titulo} <span className="text-gray-400">({t.responsavel})</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            'bg-white rounded-xl border p-4 shadow-xs',
            atrasadas.length ? 'border-red-200' : 'border-[#E5E7EB]',
          )}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle
              className={cn('h-3.5 w-3.5', atrasadas.length ? 'text-red-500' : 'text-gray-300')}
            />
            Atrasadas ({atrasadas.length})
          </div>
          {atrasadas.length === 0 ? (
            <p className="text-[12px] text-gray-400">Nada atrasado. 👍</p>
          ) : (
            <div className="space-y-1.5">
              {atrasadas.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetalhe(t)}
                  className="block w-full text-left text-[13px] font-medium text-red-700 hover:underline truncate"
                >
                  · {t.titulo} <span className="text-red-400">{fmtData(t.prazo)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Kanban */}
      {vista === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUNAS.map((col) => {
            const cards = itens.filter((t) => (t.status_kanban || 'a_fazer') === col.key)
            return (
              <div
                key={col.key}
                className="bg-gray-50/60 rounded-xl border border-gray-100 p-3 min-h-[300px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', col.cor)}>
                    {col.label}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white rounded-lg border border-gray-100 p-3 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setDetalhe(t)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={cn(
                            'text-[9px] font-bold px-1.5 py-0.5 rounded',
                            PRIO_COR[t.prioridade_p || 'P3'],
                          )}
                        >
                          {t.prioridade_p || 'P3'}
                        </span>
                        {t.prazo &&
                          String(t.prazo).slice(0, 10) < hoje &&
                          t.status_kanban !== 'concluido' && (
                            <span className="text-[9px] font-bold text-red-600">ATRASADA</span>
                          )}
                      </div>
                      <div className="text-[13px] font-semibold text-gray-900 leading-snug">
                        {t.titulo}
                      </div>
                      {t.vinculo_tipo && (
                        <span className="inline-flex mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {t.vinculo_tipo === 'ata'
                            ? 'de Ata'
                            : t.vinculo_tipo === 'projeto'
                              ? 'de Projeto'
                              : t.vinculo_tipo}
                        </span>
                      )}
                      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                        <span>{t.responsavel || '—'}</span>
                        <span className="tabular-nums">{fmtData(t.prazo)}</span>
                      </div>
                      {(() => {
                        const subs = Array.isArray(t.subtarefas)
                          ? t.subtarefas
                          : (() => {
                              try {
                                return JSON.parse(t.subtarefas || '[]')
                              } catch (_) {
                                return []
                              }
                            })()
                        return subs.length ? (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
                            <ListChecks className="h-3 w-3" />
                            {subs.filter((s: any) => s.ok).length}/{subs.length} subtarefas
                          </div>
                        ) : null
                      })()}
                      {(() => {
                        const coms = Array.isArray(t.comentarios)
                          ? t.comentarios
                          : (() => {
                              try {
                                return JSON.parse(t.comentarios || '[]')
                              } catch (_) {
                                return []
                              }
                            })()
                        return coms.length ? (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                            <MessageSquare className="h-3 w-3" /> {coms.length}
                          </div>
                        ) : null
                      })()}
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <p className="text-[11px] text-gray-400 text-center py-4">Vazio</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Calendário */}
      {vista === 'calendario' && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1B5E20]" />
              <span className="text-sm font-bold text-gray-900">{mesRef}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  const [y, m] = mesRef.split('-').map(Number)
                  const d = new Date(y, m - 2, 1)
                  setMesRef(d.toISOString().slice(0, 7))
                }}
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  const [y, m] = mesRef.split('-').map(Number)
                  const d = new Date(y, m, 1)
                  setMesRef(d.toISOString().slice(0, 7))
                }}
              >
                →
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center py-1"
              >
                {d}
              </div>
            ))}
            {diasMes.map((dia, i) => (
              <div
                key={i}
                className={cn(
                  'min-h-[72px] rounded-lg border p-1.5',
                  dia ? 'border-gray-100 bg-white' : 'border-transparent bg-transparent',
                )}
              >
                {dia && (
                  <>
                    <div
                      className={cn(
                        'text-[10px] font-bold tabular-nums mb-1',
                        dia === hoje ? 'text-[#1B5E20]' : 'text-gray-400',
                      )}
                    >
                      {parseInt(dia.slice(8), 10)}
                    </div>
                    <div className="space-y-1">
                      {tarefasPorDia(dia)
                        .slice(0, 2)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setDetalhe(t)}
                            className={cn(
                              'block w-full text-left text-[9px] font-semibold px-1 py-0.5 rounded truncate',
                              t.status_kanban === 'concluido'
                                ? 'bg-gray-100 text-gray-500'
                                : String(t.prazo).slice(0, 10) < hoje
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-emerald-50 text-emerald-700',
                            )}
                          >
                            {t.titulo}
                          </button>
                        ))}
                      {tarefasPorDia(dia).length > 2 && (
                        <div className="text-[9px] text-gray-400">
                          +{tarefasPorDia(dia).length - 2} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog nova/editar */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Nova'} tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* T2a: abertura por áudio */}
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" /> Abrir por áudio
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
                  <Button
                    type="button"
                    size="sm"
                    onClick={estruturarVoz}
                    disabled={estruturando || !transcricao.trim()}
                    className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    {estruturando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                    Preencher com IA
                  </Button>
                </div>
              </div>
              {(transcricao || ouvindo) && (
                <p className="text-[11px] text-gray-600 italic">
                  {ouvindo && <span className="text-red-600 font-bold mr-1">● REC</span>}
                  {transcricao ||
                    'ouvindo... fale o chamado (ex.: "preciso que o João resolva a entrega da semana que vem, é urgente")'}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Responsável
                </Label>
                <Input
                  value={form.responsavel || ''}
                  onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prazo
                </Label>
                <Input
                  type="date"
                  value={form.prazo || ''}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prioridade
                </Label>
                <Select
                  value={form.prioridade_p || 'P2'}
                  onValueChange={(v) => setForm({ ...form, prioridade_p: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 — Crítica</SelectItem>
                    <SelectItem value="P2">P2 — Normal</SelectItem>
                    <SelectItem value="P3">P3 — Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Coluna
                </Label>
                <Select
                  value={form.status_kanban || 'a_fazer'}
                  onValueChange={(v) => setForm({ ...form, status_kanban: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUNAS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Descrição
              </Label>
              <Textarea
                value={form.descricao || ''}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={2}
              />
            </div>
            {/* T2b: parceiros/contatos responsáveis — OBRIGATÓRIO */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Parceiros/contatos responsáveis * (obrigatório)
              </Label>
              <div className="p-2.5 rounded-lg border border-gray-200 bg-gray-50 max-h-36 overflow-y-auto space-y-1">
                {parceiros.map((p) => {
                  const sel = (form.parceiro_ids || []).includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setForm((f: any) => {
                          const cur = f.parceiro_ids || []
                          return {
                            ...f,
                            parceiro_ids: sel
                              ? cur.filter((x: string) => x !== p.id)
                              : [...cur, p.id],
                          }
                        })
                      }
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] transition-colors',
                        sel
                          ? 'bg-emerald-100 text-[#1B5E20] font-semibold'
                          : 'text-gray-700 hover:bg-gray-100',
                      )}
                    >
                      <span className="truncate">
                        {p.nome} <span className="text-gray-400">· {p.tipo}</span>
                      </span>
                      {sel && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                  )
                })}
                {parceiros.length === 0 && (
                  <p className="text-[11px] text-gray-400 py-2 text-center">
                    Nenhum parceiro ativo cadastrado — cadastre na tela Parceiros & Contatos.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vínculo (origem)
                </Label>
                <Select
                  value={form.vinculo_tipo || ''}
                  onValueChange={(v) =>
                    setForm({ ...form, vinculo_tipo: v, vinculo_id: v ? form.vinculo_id : '' })
                  }
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Nenhum</SelectItem>
                    <SelectItem value="ata">Ata</SelectItem>
                    <SelectItem value="projeto">Projeto</SelectItem>
                    <SelectItem value="contrato">Contrato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa (escopo)
                </Label>
                <Input
                  value={form.empresa || ''}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  placeholder="Extrafruti / Casafruti / FoldBox"
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            {form.vinculo_tipo && form.vinculo_tipo !== ' ' && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  ID do vínculo (opcional)
                </Label>
                <Input
                  value={form.vinculo_id || ''}
                  onChange={(e) => setForm({ ...form, vinculo_id: e.target.value })}
                  placeholder="deixe vazio se não souber o id"
                  className="h-10 bg-gray-50"
                />
              </div>
            )}
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

      {/* Detalhe da tarefa */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detalhe?.titulo}</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirCompartilhar(detalhe)}
                  className="h-8"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Compartilhar
                </Button>
                <button
                  onClick={() => setDetalhe(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            <span
              className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded',
                PRIO_COR[detalhe?.prioridade_p || 'P3'],
              )}
            >
              {detalhe?.prioridade_p}
            </span>
            <span>{detalhe?.responsavel || '—'}</span>
            <span>· prazo {fmtData(detalhe?.prazo)}</span>
          </div>
          {detalhe?.descricao && <p className="text-[13px] text-gray-700">{detalhe.descricao}</p>}

          {/* mover coluna */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Mover para
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COLUNAS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => mover(detalhe, c.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold border',
                    (detalhe?.status_kanban || 'a_fazer') === c.key
                      ? 'bg-[#1B5E20] text-white border-[#1B5E20]'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* subtarefas */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Subtarefas
            </Label>
            {(() => {
              const subs = detalhe
                ? Array.isArray(detalhe.subtarefas)
                  ? detalhe.subtarefas
                  : JSON.parse(detalhe.subtarefas || '[]')
                : []
              return (
                <div className="space-y-1">
                  {subs.map((s: any, i: number) => (
                    <label
                      key={i}
                      className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!!s.ok}
                        onChange={() => toggleSub(i)}
                        className="h-3.5 w-3.5 accent-[#1B5E20]"
                      />
                      <span className={s.ok ? 'line-through text-gray-400' : ''}>{s.t}</span>
                    </label>
                  ))}
                  {subs.length === 0 && <p className="text-[12px] text-gray-400">Nenhuma.</p>}
                </div>
              )
            })()}
            <div className="flex gap-2">
              <Input
                value={novaSub}
                onChange={(e) => setNovaSub(e.target.value)}
                placeholder="Nova subtarefa..."
                className="h-9 text-xs bg-gray-50"
              />
              <Button variant="outline" size="sm" onClick={addSub} className="h-9">
                +
              </Button>
            </div>
          </div>

          {/* comentários */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comentários
            </Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {(() => {
                const coms = detalhe
                  ? Array.isArray(detalhe.comentarios)
                    ? detalhe.comentarios
                    : JSON.parse(detalhe.comentarios || '[]')
                  : []
                return coms.map((c: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-[10px] text-gray-400">
                      {c.autor} · {c.when}
                    </div>
                    <div className="text-[12px] text-gray-800">{c.texto}</div>
                  </div>
                ))
              })()}
            </div>
            <div className="flex gap-2">
              <Input
                value={novoComentario}
                onChange={(e) => setNovoComentario(e.target.value)}
                placeholder="Comentar..."
                className="h-9 text-xs bg-gray-50"
              />
              <Button variant="outline" size="sm" onClick={addComentario} className="h-9">
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* T2c: Compartilhar tarefa com parceiro (WhatsApp / e-mail) */}
      <Dialog open={!!compartilhar} onOpenChange={(o) => !o && setCompartilhar(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[#1B5E20]" /> Compartilhar tarefa
              </span>
              <button
                onClick={() => setCompartilhar(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {compartilhar && (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Parceiro/contato vinculado
                </Label>
                <Select
                  value={compartilhar.parceiroId}
                  onValueChange={(v) => setCompartilhar({ ...compartilhar, parceiroId: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {compartilhar.parceiros.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} {p.whatsapp ? '(WA)' : ''} {p.email ? '(e-mail)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => compartilharTarefa(compartilhar.tarefa, 'whatsapp')}
                  disabled={!compartilhar.parceiroId}
                >
                  <MessageSquare className="h-4 w-4 mr-1.5" /> WhatsApp
                </Button>
                <Button
                  className="h-11 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  onClick={() => compartilharTarefa(compartilhar.tarefa, 'email')}
                  disabled={!compartilhar.parceiroId}
                >
                  <Mail className="h-4 w-4 mr-1.5" /> E-mail
                </Button>
              </div>
              <p className="text-[11px] text-gray-400">
                WhatsApp abre o app com a tarefa preenchida; e-mail envia direto pelo relay do
                portal.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
