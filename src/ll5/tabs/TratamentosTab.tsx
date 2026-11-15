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
  Building2,
  Send,
  Repeat,
  Brain,
  Trash2,
  CalendarRange,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, criar, atualizar, excluirLogico } from '@/ll5/repo'
import ParecerIaCard from '@/ll5/ParecerIaCard'
import TabelaInterativa from './TabelaInterativa'
import RangeCalendario from './RangeCalendario'

// ============================================================================
// ABA TRATAMENTOS (v4, 15/11/2026)
//
// b4) calendário ÚNICO de início/fim com arrasto. As datas das sessões ficam no
//     RODAPÉ do formulário e são clicáveis (abrem calendário; alterar uma data
//     atualiza o período e a agenda de tarefas).
// b6) NUNCA mais tarefas do que sessões: dedupe por data e limpeza das órfãs.
// b7) a lista mostra UMA LINHA POR SESSÃO, com CRUD na própria linha.
// b7.1) a coluna de data exibe a data da SESSÃO, não o início do tratamento.
// b9) "Tipos de tratamento" só aparece ao EDITAR o registro.
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

const FREQUENCIAS: Array<{ label: string; dias: number }> = [
  { label: 'Diária', dias: 1 },
  { label: '2x por semana', dias: 3 },
  { label: 'Semanal', dias: 7 },
  { label: 'Quinzenal', dias: 15 },
  { label: 'Mensal', dias: 30 },
  { label: 'Bimestral', dias: 60 },
  { label: 'Trimestral', dias: 90 },
]

function dataBR(iso?: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

/** Datas entre início e fim no intervalo; sem fim, usa "repetir". */
function gerarDatas(
  inicio: string,
  intervaloDias: number,
  fim?: string,
  repetir?: number,
): string[] {
  if (!inicio || !intervaloDias) return []
  const out: string[] = []
  const base = new Date(inicio + 'T12:00:00')
  const limite = fim ? new Date(fim + 'T12:00:00') : null

  if (limite) {
    for (let i = 0; i < 500; i++) {
      const d = new Date(base)
      d.setDate(d.getDate() + intervaloDias * i)
      if (d > limite) break
      out.push(d.toISOString().slice(0, 10))
    }
    return out
  }

  const n = Math.min(Math.max(Number(repetir) || 8, 1), 200)
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + intervaloDias * i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export default function TratamentosTab({ aba }: { aba: any }) {
  const { ator, isAdmin, ownerAtual } = useLl5()
  const [tratamentos, setTratamentos] = useState<any[]>([])
  const [tipos, setTipos] = useState<any[]>([])
  const [anexos, setAnexos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fStatus, setFStatus] = useState('todos')

  const [parecerAberto, setParecerAberto] = useState(false)
  const [novoOpen, setNovoOpen] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [excluir, setExcluir] = useState<any | null>(null)
  const [tiposOpen, setTiposOpen] = useState(false)

  const [form, setForm] = useState({
    tipo_id: '',
    instituto: '',
    profissional: '',
    empresa: '',
    responsavel_id: '',
    paciente_nome: '',
    inicio: new Date().toISOString().slice(0, 10),
    fim: '',
    frequencia: 'Semanal',
    intervalo_dias: 7,
    repetir: 8,
    status: 'em_andamento',
    observacoes: '',
  })

  const [novoTipoAberto, setNovoTipoAberto] = useState(false)
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [tipoEdit, setTipoEdit] = useState<any | null>(null)
  const [tipoNome, setTipoNome] = useState('')
  const [tipoCor, setTipoCor] = useState('#1b5e20')

  // sessões editáveis antes de salvar (b4 rodapé)
  const [sessoesManuais, setSessoesManuais] = useState<string[] | null>(null)

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
    ;(async () => {
      try {
        setEmpresas((await pb.collection('empresas').getFullList({ sort: 'nome' })) as any[])
      } catch (_e) {
        setEmpresas([])
      }
      try {
        setUsuarios((await pb.collection('users').getFullList({ sort: 'name' })) as any[])
      } catch (_e) {
        setUsuarios([])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerAtual])

  /**
   * b7/b7.1: UMA LINHA POR SESSÃO.
   * Cada tratamento se expande em N linhas, uma por data agendada.
   * Tratamento sem sessões aparece com uma linha (data = início).
   */
  const linhas = useMemo(() => {
    const out: any[] = []
    for (const t of tratamentos) {
      if (busca) {
        const q = busca.toLowerCase()
        const alvo = `${t.tipo_nome || ''} ${t.profissional || ''} ${t.instituto || ''} ${
          t.paciente_nome || ''
        }`.toLowerCase()
        if (!alvo.includes(q)) continue
      }
      if (fTipo !== 'todos' && t.tipo_id !== fTipo) continue
      if (fStatus !== 'todos' && t.status !== fStatus) continue

      const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes : []
      if (sessoes.length === 0) {
        out.push({ ...t, _sessao: null, _idx: -1, _dataSessao: t.inicio, _id: t.id + '-0' })
      } else {
        sessoes.forEach((d, i) => {
          out.push({ ...t, _sessao: d, _idx: i, _dataSessao: d, _id: t.id + '-' + i })
        })
      }
    }
    // mais recente primeiro
    out.sort((a, b) => String(b._dataSessao || '').localeCompare(String(a._dataSessao || '')))
    return out
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
      sessoes: linhas.filter((l) => l._sessao).length,
    }
  }, [tratamentos, anexos, linhas])

  /**
   * b6: sincroniza as tarefas SEMPRE 1-para-1 com as sessões.
   * Antes acumulava (criava 8 a cada salvamento). Agora:
   *   · apaga TODAS as tarefas antigas deste tratamento;
   *   · cria exatamente uma por sessão;
   *   · grava os ids no tratamento.
   * Assim nunca há mais tarefas que sessões.
   */
  const sincronizarAgenda = async (
    tratamentoId: string,
    dados: typeof form,
    tipoNome: string,
    datasForcadas?: string[],
  ) => {
    const datas =
      datasForcadas ||
      gerarDatas(dados.inicio, Number(dados.intervalo_dias), dados.fim, dados.repetir)
    if (!datas.length) return { sessoes: 0, criadas: 0, removidas: 0 }

    const atual = tratamentos.find((t) => t.id === tratamentoId)
    const antigos: string[] = Array.isArray(atual?.tarefa_ids) ? atual.tarefa_ids : []

    // remove as tarefas antigas do tratamento (evita acúmulo — b6)
    let removidas = 0
    for (const id of antigos) {
      try {
        await pb.collection('tarefas').delete(id)
        removidas++
      } catch (_e) {
        // já não existe
      }
    }

    // cria exatamente uma por data
    const ids: string[] = []
    let criadas = 0
    for (const dia of datas) {
      try {
        const tarefa = await pb.collection('tarefas').create({
          titulo: `${tipoNome} — ${dados.paciente_nome || 'paciente'} · ${dataBR(dia)}`,
          descricao:
            (dados.instituto ? dados.instituto + ' · ' : '') +
            (dados.profissional || '') +
            (dados.observacoes ? ' · ' + dados.observacoes : ''),
          prazo: dia + 'T12:00:00Z',
          status: 'pendente',
          prioridade: 'media',
          empresa: dados.empresa || '',
          responsaveis_ids: dados.responsavel_id ? [dados.responsavel_id] : [],
          criado_por: ator.email,
        })
        criadas++
        ids.push((tarefa as any).id)
        await new Promise((r) => setTimeout(r, 80))
      } catch (e) {
        console.warn('[tratamentos] falha ao criar tarefa em ' + dia, e)
      }
    }

    try {
      await atualizar('ll5_treatments', ator, tratamentoId, {
        proximas_sessoes: datas,
        tarefa_ids: ids,
        proxima_sessao: datas[0] + 'T12:00:00Z',
      })
    } catch (_e) {
      // tratamento já existe
    }

    return { sessoes: datas.length, criadas, removidas }
  }

  const criarTipoInline = async () => {
    const nome = novoTipoNome.trim()
    if (!nome) {
      toast({ title: 'Informe o nome do tipo', variant: 'destructive' })
      return
    }
    try {
      const rec = await criar(
        'll5_treatment_types',
        ator,
        { nome, cor: '#1b5e20', icone: 'tag', ordem: tipos.length + 1, ativo: true, demo: false },
        ownerAtual,
      )
      const tp = await listar('ll5_treatment_types', ator, {
        ownerEscolhido: ownerAtual,
        sort: 'ordem',
      })
      setTipos(tp.filter((x) => x.ativo && !x.deletado_em))
      setForm((f) => ({ ...f, tipo_id: rec.id }))
      setNovoTipoAberto(false)
      setNovoTipoNome('')
      toast({ title: 'Tipo criado', description: `"${nome}" já está selecionado.` })
    } catch (e: any) {
      toast({ title: 'Falha ao criar tipo', description: e?.message, variant: 'destructive' })
    }
  }

  const abrirNovo = () => {
    setEditando(null)
    setSessoesManuais(null)
    setForm({
      tipo_id: '',
      instituto: '',
      profissional: '',
      empresa: '',
      responsavel_id: '',
      paciente_nome: '',
      inicio: new Date().toISOString().slice(0, 10),
      fim: '',
      frequencia: 'Semanal',
      intervalo_dias: 7,
      repetir: 8,
      status: 'em_andamento',
      observacoes: '',
    })
    setNovoOpen(true)
  }

  const abrirEdicao = (t: any) => {
    setEditando(t)
    const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes : []
    setSessoesManuais(sessoes.length ? [...sessoes] : null)
    const f = FREQUENCIAS.find((x) => x.label === t.frequencia)
    setForm({
      tipo_id: t.tipo_id || '',
      instituto: t.instituto || '',
      profissional: t.profissional || '',
      empresa: t.empresa || '',
      responsavel_id: t.responsavel_id || '',
      paciente_nome: t.paciente_nome || '',
      inicio: String(t.inicio || '').slice(0, 10),
      fim: sessoes.length ? sessoes[sessoes.length - 1] : '',
      frequencia: t.frequencia || 'Semanal',
      intervalo_dias: Number(t.intervalo_dias) || f?.dias || 7,
      repetir: sessoes.length || 8,
      status: t.status || 'em_andamento',
      observacoes: t.observacoes || '',
    })
    setNovoOpen(true)
  }

  const salvar = async () => {
    if (!form.tipo_id) {
      toast({ title: 'Selecione ou crie o tipo de tratamento', variant: 'destructive' })
      return
    }
    if (!form.profissional.trim()) {
      toast({ title: 'Informe o profissional', variant: 'destructive' })
      return
    }
    try {
      const tipo = tipos.find((t) => t.id === form.tipo_id)
      const dados: any = {
        tipo_id: form.tipo_id,
        tipo_nome: tipo?.nome || '',
        instituto: form.instituto.trim(),
        profissional: form.profissional.trim(),
        empresa: form.empresa,
        responsavel_id: form.responsavel_id,
        paciente_nome: form.paciente_nome.trim(),
        inicio: form.inicio + 'T12:00:00Z',
        frequencia: form.frequencia,
        intervalo_dias: Number(form.intervalo_dias),
        status: form.status,
        observacoes: form.observacoes,
        demo: false,
      }

      let id = editando?.id
      if (editando) {
        await atualizar('ll5_treatments', ator, editando.id, dados)
      } else {
        const rec = await criar('ll5_treatments', ator, dados, ownerAtual)
        id = rec.id
      }

      const r = await sincronizarAgenda(
        id,
        form,
        tipo?.nome || 'Tratamento',
        sessoesManuais || undefined,
      )

      toast({
        title: editando ? 'Tratamento atualizado' : 'Tratamento criado',
        description: `${r.sessoes} sessão(ões) · ${r.criadas} tarefa(s) criada(s) · ${r.removidas} removida(s).`,
      })
      setNovoOpen(false)
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.response?.data?.message || e?.message,
        variant: 'destructive',
      })
    }
  }

  /** b4: alterar a data de uma sessão pelo rodapé da tela. */
  const alterarDataSessao = async (t: any, indice: number, novaData: string) => {
    const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? [...t.proximas_sessoes] : []
    if (!sessoes.length) return
    sessoes[indice] = novaData
    sessoes.sort()

    try {
      await atualizar('ll5_treatments', ator, t.id, {
        proximas_sessoes: sessoes,
        inicio: sessoes[0] + 'T12:00:00Z',
        proxima_sessao: sessoes[0] + 'T12:00:00Z',
      })
      const novoForm = {
        ...form,
        inicio: sessoes[0],
        fim: sessoes[sessoes.length - 1],
        empresa: t.empresa || '',
        responsavel_id: t.responsavel_id || '',
        paciente_nome: t.paciente_nome || '',
        instituto: t.instituto || '',
        profissional: t.profissional || '',
        observacoes: t.observacoes || '',
      }
      await sincronizarAgenda(t.id, novoForm, t.tipo_nome || 'Tratamento', sessoes)
      toast({ title: 'Data alterada', description: `Agenda atualizada para ${dataBR(novaData)}.` })
      await carregar()
    } catch (e: any) {
      toast({ title: 'Falha ao alterar data', description: e?.message, variant: 'destructive' })
    }
  }

  /** b5: envia as tarefas em lista, ordem decrescente de data. */
  const enviarTarefas = async (t: any) => {
    const ids: string[] = Array.isArray(t.tarefa_ids) ? t.tarefa_ids : []
    if (!ids.length) {
      toast({
        title: 'Sem tarefas para enviar',
        description: 'Gere a agenda primeiro (período + frequência).',
        variant: 'destructive',
      })
      return
    }
    const tarefas: any[] = []
    for (const id of ids) {
      try {
        tarefas.push(await pb.collection('tarefas').getOne(id))
      } catch (_e) {
        // removida
      }
    }
    tarefas.sort((a, b) => String(b.prazo || '').localeCompare(String(a.prazo || '')))
    const lista = tarefas
      .map((x, i) => `${i + 1}. ${dataBR(String(x.prazo || ''))} — ${x.titulo}`)
      .join('\n')

    try {
      await pb.collection('tarefas_chat').create({
        tarefa: ids[0],
        autor_email: ator.email,
        autor_nome: ator.nome,
        mensagem: `Agenda de tratamento enviada (${tarefas.length} sessões):\n` + lista,
      })
    } catch (_e) {
      // best-effort
    }

    toast({
      title: `Agenda enviada — ${tarefas.length} tarefa(s)`,
      description: `Ordem: mais recente primeiro · destinatário: ${
        t.paciente_nome || 'responsável'
      }.`,
    })
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    try {
      // remove as tarefas vinculadas
      const ids: string[] = Array.isArray(excluir.tarefa_ids) ? excluir.tarefa_ids : []
      for (const id of ids) {
        try {
          await pb.collection('tarefas').delete(id)
        } catch (_e) {
          // já removida
        }
      }
      await excluirLogico('ll5_treatments', ator, excluir.id)
      toast({ title: 'Tratamento excluído', description: 'As tarefas vinculadas foram removidas.' })
      setExcluir(null)
      await carregar()
    } catch (e: any) {
      toast({ title: 'Falha ao excluir', description: e?.message, variant: 'destructive' })
    }
  }

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
            demo: false,
          },
          ownerAtual,
        )
      }
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
        description: `${vinculados.length} tratamento(s) usam "${t.nome}".`,
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

  const sessoesPreview =
    sessoesManuais && sessoesManuais.length
      ? sessoesManuais
      : gerarDatas(form.inicio, Number(form.intervalo_dias), form.fim, form.repetir)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant={parecerAberto ? 'default' : 'outline'}
          onClick={() => setParecerAberto((v) => !v)}
          className={cn(
            'h-9 text-xs',
            parecerAberto && 'bg-[#1b5e20] hover:bg-[#0F3D13] text-white',
          )}
        >
          <Brain className="h-3.5 w-3.5 mr-1.5" /> Parecer
        </Button>
        <Button
          size="sm"
          onClick={abrirNovo}
          className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo tratamento
        </Button>
      </div>

      <Card className="p-2.5 rounded-xl border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por tipo, instituto, profissional ou paciente..."
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="h-8 w-[170px] text-[12px]">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Tratamentos ativos', v: String(kpis.ativos), ico: Activity },
          { l: 'Sessões agendadas', v: String(kpis.sessoes), ico: CalendarRange },
          { l: 'Anexos', v: String(kpis.anexos), ico: Paperclip },
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

      {parecerAberto && (
        <ParecerIaCard
          scope="tratamentos"
          titulo="Parecer IA — Gemini"
          resumo="A análise dos exames e dados de treino indica necessidade de ajuste na suplementação e acompanhamento médico."
          dados={{ tratamentos_ativos: kpis.ativos, anexos: kpis.anexos }}
        />
      )}

      <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-gray-900">Tratamentos e sessões</h3>
          <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-500">
            {linhas.length} linha(s) · {tratamentos.length} tratamento(s)
          </Badge>
        </div>

        {linhas.length === 0 ? (
          <div className="py-12 text-center px-6">
            <Activity className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-[12px] font-semibold text-gray-700">
              {tratamentos.length === 0 ? 'Nenhum tratamento cadastrado' : 'Nenhum resultado'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {tratamentos.length === 0
                ? 'Comece cadastrando um tratamento.'
                : 'Ajuste os filtros.'}
            </p>
          </div>
        ) : (
          <TabelaInterativa
            id="tratamentos.sessoes"
            dados={linhas}
            colunas={[
              {
                key: '_dataSessao',
                label: 'Data / Sessão',
                largura: 110,
                valor: (r: any) => new Date(r._dataSessao || 0).getTime(),
                render: (r: any) => (
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {dataBR(r._dataSessao)}
                  </span>
                ),
              },
              {
                key: 'tipo_nome',
                label: 'Tipo',
                largura: 130,
                render: (r: any) => (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold truncate"
                    style={{
                      backgroundColor: corDoTipo(r.tipo_nome) + '18',
                      color: corDoTipo(r.tipo_nome),
                    }}
                  >
                    {r.tipo_nome}
                  </span>
                ),
              },
              {
                key: 'instituto',
                label: 'Instituto',
                largura: 140,
                render: (r: any) => (
                  <span className="text-gray-600 block truncate">{r.instituto || '—'}</span>
                ),
              },
              {
                key: 'profissional',
                label: 'Profissional',
                largura: 140,
                render: (r: any) => (
                  <span className="text-gray-700 block truncate">{r.profissional || '—'}</span>
                ),
              },
              {
                key: 'paciente_nome',
                label: 'Paciente',
                largura: 130,
                render: (r: any) => (
                  <span className="text-gray-600 block truncate">{r.paciente_nome || '—'}</span>
                ),
              },
              {
                key: 'frequencia',
                label: 'Frequência',
                largura: 105,
                render: (r: any) => <span className="text-gray-600">{r.frequencia || '—'}</span>,
              },
              {
                key: 'status',
                label: 'Status',
                largura: 110,
                render: (r: any) => (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9.5px] font-bold',
                      STATUS_COR[r.status] || 'border-gray-200 text-gray-600',
                    )}
                  >
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                ),
              },
              {
                key: 'anexos',
                label: 'Anexos',
                largura: 75,
                align: 'center',
                valor: (r: any) => anexos.filter((a) => a.tratamento_id === r.id).length,
                render: (r: any) => (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                    <Paperclip className="h-3 w-3" />
                    {anexos.filter((a) => a.tratamento_id === r.id).length}
                  </span>
                ),
              },
              {
                key: 'acoes',
                label: 'Ações',
                largura: 120,
                align: 'center',
                render: (r: any) => (
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(r)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-[#1b5e20]"
                      title="Editar tratamento"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => enviarTarefas(r)}
                      className="p-1 rounded hover:bg-emerald-50 text-[#1b5e20]"
                      title="Enviar agenda ao responsável"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluir(r)}
                      className="p-1 rounded hover:bg-red-50 text-red-500"
                      title="Excluir tratamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* EXCLUIR */}
      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold">
              Excluir este tratamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">
              Remove o tratamento e <strong>todas as tarefas vinculadas</strong> no PGE. Não é
              possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault()
                confirmarExclusao()
              }}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TIPOS — b9: só ao editar (botão dentro do diálogo de edição) */}
      <Dialog open={tiposOpen} onOpenChange={setTiposOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Tipos de tratamento</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Criar, renomear, recolorir e desativar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-[280px] overflow-y-auto">
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
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => excluirTipo(t)}
                  className="p-1 rounded hover:bg-red-50 text-red-500"
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

      {/* NOVO / EDITAR */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="bg-white w-[calc(100vw-2rem)] max-w-[793px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {editando ? 'Editar tratamento' : 'Novo tratamento'}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Arraste no calendário para definir o período — as sessões e as tarefas são criadas
              juntas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-gray-600">
                  Tipo de tratamento *
                </Label>
                {/* b9: gerenciar tipos só na edição */}
                {editando && isAdmin && (
                  <button
                    type="button"
                    onClick={() => setTiposOpen(true)}
                    className="text-[10px] font-semibold text-[#1b5e20] hover:underline flex items-center gap-1"
                  >
                    <Tag className="h-2.5 w-2.5" /> Gerenciar tipos
                  </button>
                )}
              </div>
              <Select
                value={form.tipo_id}
                onValueChange={(v) => {
                  if (v === '__novo__') {
                    setNovoTipoNome('')
                    setNovoTipoAberto(true)
                    return
                  }
                  setForm({ ...form, tipo_id: v })
                }}
              >
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue placeholder="Selecione ou crie um tipo..." />
                </SelectTrigger>
                <SelectContent className="bg-white z-[130]">
                  <SelectItem
                    value="__novo__"
                    className="text-[12px] font-semibold text-[#1b5e20] border-b border-gray-100"
                  >
                    ＋ Criar novo tipo
                  </SelectItem>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-[12px]">
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {novoTipoAberto && (
                <div className="mt-1 p-2 rounded-lg border border-emerald-200 bg-emerald-50/50 flex items-center gap-2">
                  <Input
                    value={novoTipoNome}
                    onChange={(e) => setNovoTipoNome(e.target.value)}
                    placeholder="Nome do novo tipo"
                    className="h-8 text-[12px] flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={criarTipoInline}
                    className="h-8 text-[11px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
                  >
                    <Check className="h-3 w-3 mr-1" /> Criar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNovoTipoAberto(false)}
                    className="h-8 text-[11px]"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Instituto / Clínica
                </Label>
                <Input
                  value={form.instituto}
                  onChange={(e) => setForm({ ...form, instituto: e.target.value })}
                  className="h-9 text-[12px]"
                  placeholder="Ex.: Clínica Vida"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">Profissional *</Label>
                <Input
                  value={form.profissional}
                  onChange={(e) => setForm({ ...form, profissional: e.target.value })}
                  className="h-9 text-[12px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">
                  Empresa (da tarefa)
                </Label>
                <Select
                  value={form.empresa}
                  onValueChange={(v) => setForm({ ...form, empresa: v })}
                >
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-[130]">
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.nome} className="text-[12px]">
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">
                  Responsável (paciente)
                </Label>
                <Select
                  value={form.responsavel_id}
                  onValueChange={(v) => {
                    const u = usuarios.find((x) => x.id === v)
                    setForm({
                      ...form,
                      responsavel_id: v,
                      paciente_nome: u?.name || u?.email || form.paciente_nome,
                    })
                  }}
                >
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue placeholder="Quem recebe as tarefas" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-[130] max-h-[240px]">
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-[12px]">
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* b4: calendário ÚNICO com arrasto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" /> Período (arraste no calendário)
                </Label>
                <RangeCalendario
                  inicio={form.inicio}
                  fim={form.fim}
                  onChange={(i, f) => {
                    setSessoesManuais(null)
                    setForm({ ...form, inicio: i || form.inicio, fim: f })
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-semibold text-gray-600">Frequência</Label>
                    <Select
                      value={form.frequencia}
                      onValueChange={(v) => {
                        const f = FREQUENCIAS.find((x) => x.label === v)
                        setSessoesManuais(null)
                        setForm({ ...form, frequencia: v, intervalo_dias: f?.dias || 7 })
                      }}
                    >
                      <SelectTrigger className="h-9 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-[130]">
                        {FREQUENCIAS.map((f) => (
                          <SelectItem key={f.label} value={f.label} className="text-[12px]">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-semibold text-gray-600 flex items-center gap-1">
                      <Repeat className="h-2.5 w-2.5" /> Repetir
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={form.repetir}
                      onChange={(e) => {
                        setSessoesManuais(null)
                        setForm({ ...form, repetir: Number(e.target.value) })
                      }}
                      disabled={!!form.fim}
                      className={cn('h-9 text-[12px]', form.fim && 'bg-gray-50')}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10.5px] font-semibold text-gray-600">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
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
                  <Label className="text-[10.5px] font-semibold text-gray-600">Observações</Label>
                  <Input
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    className="h-9 text-[12px]"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* b4 RODAPÉ: datas das sessões, clicáveis */}
          <div className="border-t border-gray-100 pt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
                Próximas sessões ({sessoesPreview.length}) — clique na data para alterar
              </p>
              {sessoesManuais && (
                <button
                  type="button"
                  onClick={() => setSessoesManuais(null)}
                  className="text-[10px] font-semibold text-[#1b5e20] hover:underline"
                >
                  recalcular pelo período
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 max-h-[86px] overflow-y-auto">
              {sessoesPreview.map((d, i) => (
                <label
                  key={i}
                  className="relative px-1.5 py-0.5 rounded bg-white border border-sky-200 text-[10px] text-sky-900 tabular-nums cursor-pointer hover:border-[#1b5e20]"
                  title="Clique para alterar esta data"
                >
                  {dataBR(d)}
                  <input
                    type="date"
                    value={d}
                    onChange={(e) => {
                      const nova = e.target.value
                      if (!nova) return
                      const lista = [...sessoesPreview]
                      lista[i] = nova
                      lista.sort()
                      setSessoesManuais(lista)
                      setForm((f) => ({
                        ...f,
                        inicio: lista[0],
                        fim: lista[lista.length - 1],
                      }))
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={salvar}
              className="bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
            >
              {editando ? 'Salvar e atualizar agenda' : 'Criar tratamento e agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
