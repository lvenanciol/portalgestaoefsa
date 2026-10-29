import { useEffect, useState } from 'react'
import { FolderKanban, Plus, Loader2, X, Flag, AlertTriangle } from 'lucide-react'
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

// Fase 7 (prompt-mestre) — Projetos: cartões (dono, período, orçamento vs
// realizado, progresso, status), marcos, riscos (prob/impacto/mitigação),
// timeline em barras e RACI simplificado.

const STATUS_COR: Record<string, string> = {
  planejamento: 'bg-gray-100 text-gray-700',
  em_andamento: 'bg-amber-50 text-amber-700',
  pausado: 'bg-orange-50 text-orange-700',
  concluido: 'bg-emerald-50 text-emerald-700',
}

const fmtBRL = (v: any) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—'

const parse = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch (_) {
    return []
  }
}

export default function ProjetosBoardPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [analisandoRisco, setAnalisandoRisco] = useState(false)
  const [parecerRisco, setParecerRisco] = useState<any | null>(null)
  const [novoRisco, setNovoRisco] = useState({
    risco: '',
    prob: 'media',
    impacto: 'medio',
    mitigacao: '',
  })

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('projetos').getFullList({ sort: '-created' })
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

  const abrirNovo = () => {
    setForm({
      nome: '',
      empresa: '',
      status: 'planejamento',
      progresso: 0,
      responsavel: '',
      orcamento: '',
      descricao: '',
      prazo: '',
    })
    setDialog(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const dados: any = {
        nome: form.nome,
        empresa: form.empresa,
        status: form.status,
        progresso: Number(form.progresso) || 0,
        responsavel: form.responsavel,
        orcamento: Number(form.orcamento) || 0,
        descricao: form.descricao,
        prazo: form.prazo ? form.prazo + ' 00:00:00.000Z' : '',
      }
      await pb.collection('projetos').create(dados)
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  const addRisco = async () => {
    if (!detalhe || !novoRisco.risco.trim()) return
    const riscos = parse(detalhe.riscos)
    riscos.push(novoRisco)
    try {
      await pb.collection('projetos').update(detalhe.id, { riscos: JSON.stringify(riscos) })
      setNovoRisco({ risco: '', prob: 'media', impacto: 'medio', mitigacao: '' })
      const upd = await pb.collection('projetos').getOne(detalhe.id)
      setDetalhe(upd)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const analisarRiscoIA = async () => {
    if (!detalhe) return
    setAnalisandoRisco(true)
    try {
      const contexto =
        'Projeto: ' +
        detalhe.titulo +
        ' | Dono: ' +
        (detalhe.dono || '—') +
        ' | Status: ' +
        (detalhe.status || '—') +
        ' | Orçamento: ' +
        (detalhe.orcamento ?? '—') +
        ' | Realizado: ' +
        (detalhe.realizado ?? '—') +
        ' | Progresso: ' +
        (detalhe.progresso ?? 0) +
        '%' +
        ' | Marcos: ' +
        JSON.stringify(parse(detalhe.marcos)) +
        ' | Riscos: ' +
        JSON.stringify(parse(detalhe.riscos))
      const r = (await pb.send('/backend/v1/ia/estruturado', {
        method: 'POST',
        body: JSON.stringify({
          modulo: 'projetos',
          ref: detalhe.titulo,
          contexto,
          prompt:
            'Analise os riscos deste projeto: probabilidade x impacto, causas prováveis, exposição orçamentária e 3 mitigações priorizadas.',
        }),
      })) as any
      setParecerRisco(r.estrutura)
    } catch (e) {
      setErro(String(e))
    } finally {
      setAnalisandoRisco(false)
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
            <FolderKanban className="h-6 w-6 text-[#1B5E20]" /> Projetos
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Cartões com orçamento, marcos, riscos e RACI
          </p>
        </div>
        <Button onClick={abrirNovo} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
          <Plus className="h-4 w-4 mr-1" /> Novo projeto
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {itens.map((p) => {
          const marcos = parse(p.marcos)
          const riscos = parse(p.riscos)
          const orc = Number(p.orcamento) || 0
          const rea = Number(p.realizado) || 0
          const pctOrc = orc > 0 ? Math.min(100, Math.round((rea / orc) * 100)) : 0
          return (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setDetalhe(p)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-[15px] font-bold text-gray-900 leading-snug">{p.nome}</div>
                <span
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                    STATUS_COR[p.status || 'planejamento'],
                  )}
                >
                  {(p.status || '').replace('_', ' ')}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mb-3">
                {p.empresa || 'Grupo'} · {p.responsavel || '—'}
              </div>

              {/* progresso */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-500 font-semibold">Progresso</span>
                  <span className="font-bold text-gray-900 tabular-nums">{p.progresso || 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1B5E20]"
                    style={{ width: `${p.progresso || 0}%` }}
                  />
                </div>
              </div>

              {/* orçamento vs realizado */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-500 font-semibold">Orçamento vs realizado</span>
                  <span
                    className={cn(
                      'font-bold tabular-nums',
                      pctOrc > 100 ? 'text-red-600' : 'text-gray-900',
                    )}
                  >
                    {pctOrc}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      pctOrc > 100 ? 'bg-red-500' : 'bg-amber-500',
                    )}
                    style={{ width: `${Math.min(100, pctOrc)}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-1 tabular-nums">
                  {fmtBRL(rea)} de {fmtBRL(orc)}
                </div>
              </div>

              {/* timeline marcos */}
              {marcos.length > 0 && (
                <div className="flex items-center gap-1 mb-3">
                  {marcos.map((m: any, i: number) => (
                    <div key={i} className="flex-1">
                      <div
                        className={cn(
                          'h-1.5 rounded-full',
                          m.ok ? 'bg-emerald-500' : 'bg-gray-200',
                        )}
                      />
                      <div className="text-[9px] text-gray-400 mt-0.5 truncate">{m.nome}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* riscos */}
              {riscos.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {riscos.length} risco(s) mapeado(s)
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog novo */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome *
              </Label>
              <Input
                value={form.nome || ''}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Input
                  value={form.empresa || ''}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
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
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </Label>
                <Select
                  value={form.status || 'planejamento'}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planejamento">planejamento</SelectItem>
                    <SelectItem value="em_andamento">em andamento</SelectItem>
                    <SelectItem value="pausado">pausado</SelectItem>
                    <SelectItem value="concluido">concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Progresso %
                </Label>
                <Input
                  type="number"
                  value={form.progresso ?? ''}
                  onChange={(e) => setForm({ ...form, progresso: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Orçamento
                </Label>
                <Input
                  type="number"
                  value={form.orcamento ?? ''}
                  onChange={(e) => setForm({ ...form, orcamento: e.target.value })}
                  className="h-10 bg-gray-50"
                />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.nome}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe do projeto */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{detalhe?.nome}</span>
              <button
                onClick={() => setDetalhe(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {detalhe &&
            (() => {
              const marcos = parse(detalhe.marcos)
              const riscos = parse(detalhe.riscos)
              let raci: any = {}
              try {
                raci =
                  typeof detalhe.raci === 'string'
                    ? JSON.parse(detalhe.raci || '{}')
                    : detalhe.raci || {}
              } catch (_) {
                raci = {}
              }
              return (
                <div className="space-y-4">
                  <p className="text-[13px] text-gray-700">{detalhe.descricao}</p>

                  {/* Timeline */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Timeline — marcos
                    </div>
                    <div className="space-y-2">
                      {marcos.map((m: any, i: number) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'w-2.5 h-2.5 rounded-full shrink-0',
                              m.ok ? 'bg-emerald-500' : 'bg-gray-300',
                            )}
                          />
                          <span className="text-[13px] text-gray-800 flex-1">{m.nome}</span>
                          <span className="text-[11px] text-gray-400 tabular-nums">{m.data}</span>
                          <span
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded',
                              m.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                            )}
                          >
                            {m.ok ? 'OK' : 'pendente'}
                          </span>
                        </div>
                      ))}
                      {marcos.length === 0 && (
                        <p className="text-[12px] text-gray-400">Sem marcos.</p>
                      )}
                    </div>
                  </div>

                  {/* Riscos */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Riscos (probabilidade · impacto · mitigação)
                    </div>
                    <div className="space-y-2">
                      {riscos.map((r: any, i: number) => (
                        <div
                          key={i}
                          className="bg-amber-50/60 border border-amber-100 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Flag className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-[13px] font-semibold text-gray-900 flex-1">
                              {r.risco}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              {r.prob}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                              {r.impacto}
                            </span>
                          </div>
                          <p className="text-[12px] text-gray-600 pl-6">
                            Mitigação: {r.mitigacao || '—'}
                          </p>
                        </div>
                      ))}
                      {riscos.length === 0 && (
                        <p className="text-[12px] text-gray-400">Nenhum risco mapeado.</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                      <Input
                        value={novoRisco.risco}
                        onChange={(e) => setNovoRisco({ ...novoRisco, risco: e.target.value })}
                        placeholder="Novo risco..."
                        className="h-9 text-xs bg-gray-50 sm:col-span-2"
                      />
                      <Select
                        value={novoRisco.prob}
                        onValueChange={(v) => setNovoRisco({ ...novoRisco, prob: v })}
                      >
                        <SelectTrigger className="h-9 text-xs bg-gray-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">baixa</SelectItem>
                          <SelectItem value="media">média</SelectItem>
                          <SelectItem value="alta">alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={addRisco} className="h-9">
                        Adicionar
                      </Button>
                      <Input
                        value={novoRisco.mitigacao}
                        onChange={(e) => setNovoRisco({ ...novoRisco, mitigacao: e.target.value })}
                        placeholder="Mitigação..."
                        className="h-9 text-xs bg-gray-50 sm:col-span-3"
                      />
                    </div>
                  </div>

                  {/* RACI */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      RACI
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['R — Responsável', raci.R],
                        ['A — Aprova', raci.A],
                        ['C — Consultado', raci.C],
                        ['I — Informado', raci.I],
                      ].map(([k, v]) => (
                        <div key={k as string} className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {k}
                          </div>
                          <div className="text-[12px] font-semibold text-gray-800 mt-0.5">
                            {String(v || '—')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={analisarRiscoIA}
                    disabled={analisandoRisco}
                    className="h-8"
                  >
                    {analisandoRisco ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Flag className="h-3.5 w-3.5 mr-1" />
                    )}
                    Analisar risco com IA
                  </Button>
                </div>
              )
            })()}
        </DialogContent>
      </Dialog>

      {/* Dialog Parecer IA — riscos do projeto */}
      <Dialog open={!!parecerRisco} onOpenChange={(o) => !o && setParecerRisco(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-[#1B5E20]" /> Análise de riscos — {detalhe?.titulo}
              </span>
              <button
                onClick={() => setParecerRisco(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {parecerRisco && (
            <div className="space-y-3">
              {typeof parecerRisco.score_saude === 'number' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      parecerRisco.score_saude >= 7
                        ? 'bg-emerald-600'
                        : parecerRisco.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {parecerRisco.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score de saúde do projeto
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
                  {parecerRisco.sumario_executivo}
                </p>
              </div>
              {parecerRisco.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {parecerRisco.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerRisco.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Mitigações priorizadas
                  </div>
                  <ol className="space-y-1">
                    {parecerRisco.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {parecerRisco.disclaimer || 'Análise assistida — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
