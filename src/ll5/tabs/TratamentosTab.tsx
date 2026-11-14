import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Paperclip,
  Sparkles,
  CalendarDays,
  Activity,
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, criar, atualizar, excluirLogico } from '@/ll5/repo'
import ParecerIaCard from '@/ll5/ParecerIaCard'

// ============================================================================
// ABA TRATAMENTOS (mockup 2)
//
// O CRUD de tipos precisa refletir no dropdown IMEDIATAMENTE, sem reload —
// por isso os tipos vivem em estado local e cada alteração atualiza a lista.
// ============================================================================

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

const STATUS_COR: Record<string, string> = {
  em_andamento: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  concluido: 'border-gray-300 text-gray-600 bg-gray-50',
  suspenso: 'border-amber-300 text-amber-700 bg-amber-50',
  cancelado: 'border-red-300 text-red-700 bg-red-50',
}

function dataBR(iso?: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

export default function TratamentosTab({ aba }: { aba: any }) {
  const { ator, isAdmin, ownerAtual } = useLl5()
  const [tratamentos, setTratamentos] = useState<any[]>([])
  const [tipos, setTipos] = useState<any[]>([])
  const [anexos, setAnexos] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  // filtros
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fStatus, setFStatus] = useState('todos')

  // painel expandido
  const [aberto, setAberto] = useState<string | null>(null)

  // dialogs
  const [novoOpen, setNovoOpen] = useState(false)
  const [tiposOpen, setTiposOpen] = useState(false)
  const [form, setForm] = useState({
    tipo_id: '',
    profissional: '',
    inicio: new Date().toISOString().slice(0, 10),
    frequencia: 'mensal',
    status: 'em_andamento',
    proxima_sessao: '',
    observacoes: '',
  })

  // editor de tipo
  const [tipoEdit, setTipoEdit] = useState<any | null>(null)
  const [tipoNome, setTipoNome] = useState('')
  const [tipoCor, setTipoCor] = useState('#1b5e20')

  const carregar = async () => {
    setCarregando(true)
    try {
      const [t, tp, at] = await Promise.all([
        listar('ll5_treatments', ator, { ownerEscolhido: ownerAtual, sort: '-inicio' }),
        listar('ll5_treatment_types', ator, { ownerEscolhido: ownerAtual, sort: 'ordem' }),
        listar('ll5_attachments', ator, { ownerEscolhido: ownerAtual }),
      ])
      setTratamentos(t.filter((x) => !x.deletado_em))
      setTipos(tp.filter((x) => x.ativo && !x.deletado_em))
      setAnexos(at)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerAtual])

  const filtrados = useMemo(() => {
    return tratamentos.filter((t) => {
      if (busca) {
        const q = busca.toLowerCase()
        const alvo = `${t.tipo_nome} ${t.profissional}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      if (fTipo !== 'todos' && t.tipo_id !== fTipo) return false
      if (fStatus !== 'todos' && t.status !== fStatus) return false
      return true
    })
  }, [tratamentos, busca, fTipo, fStatus])

  const kpis = useMemo(() => {
    const ativos = tratamentos.filter((t) => t.status === 'em_andamento').length
    const proxima = tratamentos
      .map((t) => t.proxima_sessao)
      .filter(Boolean)
      .sort()[0]
    return {
      ativos,
      anexos: anexos.length,
      pareceres: 12,
      proxima: proxima ? dataBR(proxima) : '—',
    }
  }, [tratamentos, anexos])

  const salvarNovo = async () => {
    if (!form.tipo_id) {
      toast({ title: 'Selecione o tipo de tratamento', variant: 'destructive' })
      return
    }
    if (!form.profissional.trim()) {
      toast({ title: 'Informe o profissional', variant: 'destructive' })
      return
    }
    try {
      const tipo = tipos.find((t) => t.id === form.tipo_id)
      await criar(
        'll5_treatments',
        ator,
        {
          tipo_id: form.tipo_id,
          tipo_nome: tipo?.nome || '',
          profissional: form.profissional.trim(),
          inicio: form.inicio + 'T12:00:00Z',
          frequencia: form.frequencia,
          status: form.status,
          proxima_sessao: form.proxima_sessao ? form.proxima_sessao + 'T12:00:00Z' : null,
          observacoes: form.observacoes,
          demo: true,
        },
        ownerAtual,
      )
      toast({ title: 'Tratamento criado' })
      setNovoOpen(false)
      setForm({ ...form, tipo_id: '', profissional: '', observacoes: '', proxima_sessao: '' })
      await carregar()
    } catch (e: any) {
      toast({ title: 'Falha ao criar', description: e?.message, variant: 'destructive' })
    }
  }

  // ---------------- CRUD de tipos (reflete sem reload) ----------------
  const salvarTipo = async () => {
    if (!tipoNome.trim()) {
      toast({ title: 'Informe o nome do tipo', variant: 'destructive' })
      return
    }
    try {
      if (tipoEdit) {
        await atualizar('ll5_treatment_types', ator, tipoEdit.id, {
          nome: tipoNome.trim(),
          cor: tipoCor,
        })
      } else {
        await criar(
          'll5_treatment_types',
          ator,
          {
            nome: tipoNome.trim(),
            cor: tipoCor,
            icone: 'tag',
            ordem: tipos.length + 1,
            ativo: true,
            demo: true,
          },
          ownerAtual,
        )
      }
      // recarrega SÓ a lista de tipos — o dropdown atualiza na hora
      const tp = await listar('ll5_treatment_types', ator, {
        ownerEscolhido: ownerAtual,
        sort: 'ordem',
      })
      setTipos(tp.filter((x) => x.ativo && !x.deletado_em))
      setTipoEdit(null)
      setTipoNome('')
      toast({ title: tipoEdit ? 'Tipo atualizado' : 'Tipo criado' })
    } catch (e: any) {
      toast({ title: 'Falha ao salvar tipo', description: e?.message, variant: 'destructive' })
    }
  }

  const excluirTipo = async (t: any) => {
    const vinculados = tratamentos.filter((x) => x.tipo_id === t.id)
    if (vinculados.length > 0) {
      toast({
        title: 'Tipo em uso',
        description: `${vinculados.length} tratamento(s) usam "${t.nome}". Reassocie antes de excluir.`,
        variant: 'destructive',
      })
      return
    }
    try {
      await excluirLogico('ll5_treatment_types', ator, t.id)
      const tp = await listar('ll5_treatment_types', ator, {
        ownerEscolhido: ownerAtual,
        sort: 'ordem',
      })
      setTipos(tp.filter((x) => x.ativo && !x.deletado_em))
      toast({ title: 'Tipo desativado' })
    } catch (e: any) {
      toast({ title: 'Falha ao excluir', description: e?.message, variant: 'destructive' })
    }
  }

  const corDoTipo = (nome: string) => tipos.find((t) => t.nome === nome)?.cor || '#6b7280'

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={() => setNovoOpen(true)}
          className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo tratamento
        </Button>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTiposOpen(true)}
            className="h-9 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Tipo de tratamento
          </Button>
        )}
      </div>

      {/* filtros */}
      <Card className="p-2.5 rounded-xl border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar tratamento..."
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="h-8 w-[160px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white z-[120]">
              <SelectItem value="todos" className="text-[12px]">
                Tipo: Todos
              </SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-[12px]">
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-8 w-[160px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white z-[120]">
              <SelectItem value="todos" className="text-[12px]">
                Status: Todos
              </SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k} className="text-[12px]">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Tratamentos ativos', v: String(kpis.ativos), ico: Activity },
          { l: 'Anexos', v: String(kpis.anexos), ico: Paperclip },
          { l: 'Pareceres IA', v: String(kpis.pareceres), ico: Sparkles },
          { l: 'Próxima sessão', v: kpis.proxima, ico: CalendarDays },
        ].map((k) => (
          <Card key={k.l} className="p-4 rounded-xl border-gray-200 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {k.l}
              </span>
              <k.ico className="h-4 w-4 text-[#1b5e20]" />
            </div>
            <div className="text-[22px] font-extrabold text-gray-900 mt-1.5 tabular-nums leading-none">
              {k.v}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Tratamentos</h3>
            <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-500">
              {tratamentos.length} ativo(s)
            </Badge>
          </div>

          {filtrados.length === 0 ? (
            <div className="py-12 text-center px-6">
              <Activity className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] font-semibold text-gray-700">
                {tratamentos.length === 0
                  ? 'Nenhum tratamento cadastrado'
                  : 'Nenhum resultado para os filtros'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {tratamentos.length === 0
                  ? 'Comece cadastrando um tratamento e anexando exames.'
                  : 'Ajuste a busca, o tipo ou o status.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtrados.map((t) => {
                const meusAnexos = anexos.filter((a) => a.tratamento_id === t.id)
                const expandido = aberto === t.id
                return (
                  <div key={t.id}>
                    <button
                      type="button"
                      onClick={() => setAberto(expandido ? null : t.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50/60"
                    >
                      {expandido ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      )}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0"
                        style={{
                          backgroundColor: corDoTipo(t.tipo_nome) + '18',
                          color: corDoTipo(t.tipo_nome),
                        }}
                      >
                        {t.tipo_nome}
                      </span>
                      <span className="text-[12px] text-gray-700 min-w-0 truncate flex-1">
                        {t.profissional}
                      </span>
                      <span className="text-[11.5px] text-gray-500 tabular-nums shrink-0">
                        {dataBR(t.inicio)}
                      </span>
                      <span className="text-[11px] text-gray-500 shrink-0 hidden sm:inline">
                        {t.frequencia}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9.5px] font-bold shrink-0',
                          STATUS_COR[t.status] || 'border-gray-200 text-gray-600',
                        )}
                      >
                        {STATUS_LABEL[t.status] || t.status}
                      </Badge>
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 shrink-0">
                        <Paperclip className="h-3 w-3" />
                        {meusAnexos.length}
                      </span>
                      <Sparkles className="h-3.5 w-3.5 text-[#1b5e20] shrink-0" />
                    </button>

                    {expandido && (
                      <div className="px-4 pb-3 pl-10">
                        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5">
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                            Anexos do tratamento
                          </p>
                          {meusAnexos.length === 0 ? (
                            <p className="text-[11px] text-gray-500 mb-2">
                              Nenhum exame anexado ainda.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {meusAnexos.map((a) => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-[10.5px] text-gray-700"
                                >
                                  <span className="text-red-600 font-bold">PDF</span>
                                  {a.nome_arquivo}
                                </span>
                              ))}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              toast({
                                title: 'Anexar arquivo',
                                description:
                                  'Aceita PDF/JPG/PNG até 50 MB. Neste ciclo o upload real está desativado — os anexos do seed são metadados de demonstração.',
                              })
                            }
                            className="w-full py-1.5 rounded border border-dashed border-gray-300 text-[11px] font-semibold text-gray-600 hover:border-[#1b5e20] hover:text-[#1b5e20]"
                          >
                            + Anexar exame / laudo / prescrição
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <ParecerIaCard
            scope="tratamentos"
            titulo="Parecer IA — Gemini"
            resumo="A análise dos exames e dados de treino indica necessidade de ajuste na suplementação e acompanhamento médico para otimizar a performance e prevenção de lesões."
            dados={{ tratamentos_ativos: kpis.ativos, anexos: kpis.anexos }}
          />

          <Card className="rounded-xl border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-[#1b5e20]" />
              <h3 className="text-[13px] font-bold text-gray-900">Tipos de tratamento</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tipos.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center px-2 py-1 rounded-full text-[10.5px] font-semibold"
                  style={{ backgroundColor: t.cor + '18', color: t.cor }}
                >
                  {t.nome}
                </span>
              ))}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setTiposOpen(true)}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-[#1b5e20] hover:text-[#1b5e20]"
                  title="Novo tipo"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setTiposOpen(true)}
                className="mt-2 text-[11px] font-semibold text-[#1b5e20] hover:underline"
              >
                Editar tipos
              </button>
            )}
          </Card>
        </div>
      </div>

      {/* ---------------- dialog novo tratamento ---------------- */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Novo tratamento</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              O dropdown de tipos reflete o cadastro em tempo real.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-1">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">Tipo *</Label>
              <Select value={form.tipo_id} onValueChange={(v) => setForm({ ...form, tipo_id: v })}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-white z-[130]">
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-[12px]">
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">Profissional *</Label>
              <Input
                value={form.profissional}
                onChange={(e) => setForm({ ...form, profissional: e.target.value })}
                className="h-9 text-[12px]"
                placeholder="Nome do profissional"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">Início</Label>
                <Input
                  type="date"
                  value={form.inicio}
                  onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                  className="h-9 text-[12px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">Frequência</Label>
                <Input
                  value={form.frequencia}
                  onChange={(e) => setForm({ ...form, frequencia: e.target.value })}
                  className="h-9 text-[12px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-[130]">
                    {Object.entries(STATUS_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k} className="text-[12px]">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">Próxima sessão</Label>
                <Input
                  type="date"
                  value={form.proxima_sessao}
                  onChange={(e) => setForm({ ...form, proxima_sessao: e.target.value })}
                  className="h-9 text-[12px]"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={salvarNovo}
              className="bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- dialog CRUD de tipos ---------------- */}
      <Dialog open={tiposOpen} onOpenChange={setTiposOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Tipos de tratamento</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Criar, renomear, recolorir e desativar. As mudanças aparecem na hora no dropdown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1 max-h-[300px] overflow-y-auto">
            {tipos.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200"
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: t.cor }}
                />
                <span className="text-[12px] font-semibold text-gray-800 flex-1 truncate">
                  {t.nome}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTipoEdit(t)
                    setTipoNome(t.nome)
                    setTipoCor(t.cor || '#1b5e20')
                  }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  title="Renomear"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => excluirTipo(t)}
                  className="p-1 rounded hover:bg-red-50 text-red-500"
                  title="Desativar"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-2">
            <p className="text-[11px] font-bold text-gray-700">
              {tipoEdit ? 'Editar: ' + tipoEdit.nome : 'Novo tipo'}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={tipoNome}
                onChange={(e) => setTipoNome(e.target.value)}
                placeholder="Nome do tipo"
                className="h-8 text-[12px] flex-1"
              />
              <input
                type="color"
                value={tipoCor}
                onChange={(e) => setTipoCor(e.target.value)}
                className="h-8 w-10 rounded border border-gray-200 cursor-pointer"
                title="Cor"
              />
              <Button
                size="sm"
                onClick={salvarTipo}
                className="h-8 text-[11px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
              >
                <Check className="h-3 w-3 mr-1" /> Salvar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTiposOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
