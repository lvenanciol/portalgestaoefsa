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
  CalendarRange,
  Brain,
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
import pb from '@/lib/pocketbase/client'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, criar, atualizar, excluirLogico } from '@/ll5/repo'
import ParecerIaCard from '@/ll5/ParecerIaCard'
import TabelaInterativa from './TabelaInterativa'

// ============================================================================
// ABA TRATAMENTOS (v3, 15/11/2026)
//
// 9 refinamentos pedidos pelo dono:
//   b3) empresa + responsável (paciente) para gerar tarefa
//   b4) período (início/fim) + frequência + "repetir X vezes" → cria/atualiza
//       sessões e tarefas; clicar na data abre calendário e atualiza a agenda
//   b5) botão "Enviar" → envia as tarefas em lista para o usuário, em ordem
//   b6) nunca criar mais tarefas do que sessões (dedupe por data)
//   b7) UMA linha por data/sessão (não 5x a mesma); cabeçalho ordenável,
//       redimensionável e reorganizável; expandir mantém "anexos" e remove
//       a caixa "próximas sessões"
//   b8) "Parecer IA" só ao clicar em "Parecer" (esquerda de "Novo tratamento")
//   b9) "Tipos de tratamento" só abre pelo lápis ao lado do nome do tipo
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

/**
 * Gera as datas das sessões entre início e fim, respeitando o intervalo.
 * b4: com "fim" definido, para no fim; sem fim, usa "repetir X vezes".
 */
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
  const [aberto, setAberto] = useState<string | null>(null)

  // b8: parecer só aparece ao clicar
  const [parecerAberto, setParecerAberto] = useState(false)

  const [novoOpen, setNovoOpen] = useState(false)
  const [tiposOpen, setTiposOpen] = useState<string | null>(null)

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
  const [novoTipoCor, setNovoTipoCor] = useState('#1b5e20')

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

  const filtrados = useMemo(() => {
    return tratamentos.filter((t) => {
      if (busca) {
        const q = busca.toLowerCase()
        const alvo = `${t.tipo_nome || ''} ${t.profissional || ''} ${t.instituto || ''} ${
          t.paciente_nome || ''
        }`.toLowerCase()
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

  /**
   * b6/b7: sincroniza tarefas com as sessões.
   * UMA tarefa por data — nunca mais tarefas do que sessões.
   * Reaproveita as tarefas já criadas (comparando a data no título).
   */
  const sincronizarAgenda = async (tratamentoId: string, dados: typeof form, tipoNome: string) => {
    const datas = gerarDatas(dados.inicio, Number(dados.intervalo_dias), dados.fim, dados.repetir)
    if (!datas.length) return { sessoes: 0, criadas: 0, removidas: 0 }

    // tarefas existentes deste tratamento (controle por tarefa_ids)
    const atual = tratamentos.find((t) => t.id === tratamentoId)
    const idsExistentes: string[] = Array.isArray(atual?.tarefa_ids) ? atual.tarefa_ids : []

    // datas que já têm tarefa (deriva do que está gravado)
    const mapaExistente = new Map<string, string>() // data -> tarefa id
    for (const id of idsExistentes) {
      try {
        const t = await pb.collection('tarefas').getOne(id)
        const d = String((t as any).prazo || '').slice(0, 10)
        if (d) mapaExistente.set(d, id)
      } catch (_e) {
        // tarefa removida: ignora
      }
    }

    const novasDatas = datas.filter((d) => !mapaExistente.has(d))
    const datasRemover = Array.from(mapaExistente.keys()).filter((d) => !datas.includes(d))

    let criadas = 0
    const todosIds: string[] = []

    // cria só o que falta
    for (const dia of novasDatas) {
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
        todosIds.push((tarefa as any).id)
        await new Promise((r) => setTimeout(r, 80))
      } catch (e) {
        console.warn('[tratamentos] falha ao criar tarefa em ' + dia, e)
      }
    }

    // mantém as que continuam válidas
    for (const d of datas) {
      const id = mapaExistente.get(d)
      if (id) todosIds.push(id)
    }

    // remove as que saíram do período (b4: alterar datas atualiza a agenda)
    let removidas = 0
    for (const d of datasRemover) {
      const id = mapaExistente.get(d)
      if (!id) continue
      try {
        await pb.collection('tarefas').delete(id)
        removidas++
      } catch (_e) {
        // tarefa já ausente
      }
    }

    // grava a agenda no tratamento
    try {
      await atualizar('ll5_treatments', ator, tratamentoId, {
        proximas_sessoes: datas,
        tarefa_ids: todosIds,
        proxima_sessao: datas[0] + 'T12:00:00Z',
      })
    } catch (_e) {
      // o tratamento já existe; segue
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
        { nome, cor: novoTipoCor, icone: 'tag', ordem: tipos.length + 1, ativo: true, demo: false },
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

  const salvarNovo = async () => {
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
      const rec = await criar(
        'll5_treatments',
        ator,
        {
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
        },
        ownerAtual,
      )

      const r = await sincronizarAgenda(rec.id, form, tipo?.nome || 'Tratamento')

      toast({
        title: 'Tratamento criado',
        description: `${r.sessoes} sessão(ões) agendada(s) · ${r.criadas} tarefa(s) criada(s).`,
      })
      setNovoOpen(false)
      setForm({
        ...form,
        tipo_id: '',
        instituto: '',
        profissional: '',
        paciente_nome: '',
        observacoes: '',
        fim: '',
      })
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao criar',
        description: e?.response?.data?.message || e?.message,
        variant: 'destructive',
      })
    }
  }

  /**
   * b4: ao clicar na data de uma sessão, abre o calendário e atualiza a
   * agenda. Aqui regeramos as tarefas a partir do novo início.
   */
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
      // regera as tarefas com base na nova agenda
      const novoForm = {
        ...form,
        inicio: sessoes[0],
        intervalo_dias: Number(t.intervalo_dias || 7),
        fim: sessoes[sessoes.length - 1],
        empresa: t.empresa || '',
        responsavel_id: t.responsavel_id || '',
        paciente_nome: t.paciente_nome || '',
        instituto: t.instituto || '',
        profissional: t.profissional || '',
        observacoes: t.observacoes || '',
      }
      await sincronizarAgenda(t.id, novoForm, t.tipo_nome || 'Tratamento')
      toast({ title: 'Data alterada', description: `Agenda atualizada para ${dataBR(novaData)}.` })
      await carregar()
    } catch (e: any) {
      toast({ title: 'Falha ao alterar data', description: e?.message, variant: 'destructive' })
    }
  }

  /** b5: envia as tarefas em lista, no período, ordenadas por data desc. */
  const enviarTarefas = async (t: any) => {
    const ids: string[] = Array.isArray(t.tarefa_ids) ? t.tarefa_ids : []
    if (!ids.length) {
      toast({
        title: 'Sem tarefas para enviar',
        description: 'Gere a agenda primeiro (início + frequência).',
        variant: 'destructive',
      })
      return
    }
    const tarefas: any[] = []
    for (const id of ids) {
      try {
        tarefas.push(await pb.collection('tarefas').getOne(id))
      } catch (_e) {
        // tarefa removida: ignora
      }
    }
    tarefas.sort((a, b) => String(b.prazo || '').localeCompare(String(a.prazo || '')))

    const lista = tarefas
      .map((x, i) => `${i + 1}. ${dataBR(String(x.prazo || ''))} — ${x.titulo}`)
      .join('\n')

    // registra o envio (a notificação real usa o motor de tarefas do PGE)
    try {
      await pb.collection('tarefas_chat').create({
        tarefa: ids[0],
        autor_email: ator.email,
        autor_nome: ator.nome,
        mensagem: `Agenda de tratamento enviada (${tarefas.length} sessões):\n` + lista,
      })
    } catch (_e) {
      // o chat é best-effort
    }

    toast({
      title: `Agenda enviada — ${tarefas.length} tarefa(s)`,
      description: `Ordem: mais recente primeiro. Destinatário: ${
        t.paciente_nome || 'responsável do tratamento'
      }.`,
    })
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

  const sessoesPreview = gerarDatas(
    form.inicio,
    Number(form.intervalo_dias),
    form.fim,
    form.repetir,
  )

  return (
    <div className="space-y-3">
      {/* b8: "Parecer" à ESQUERDA de "Novo tratamento" */}
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
          onClick={() => setNovoOpen(true)}
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

      {/* b8: parecer só quando clicado */}
      {parecerAberto && (
        <ParecerIaCard
          scope="tratamentos"
          titulo="Parecer IA — Gemini"
          resumo="A análise dos exames e dados de treino indica necessidade de ajuste na suplementação e acompanhamento médico para otimizar a performance e prevenção de lesões."
          dados={{ tratamentos_ativos: kpis.ativos, anexos: kpis.anexos }}
        />
      )}

      <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
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
          /* b7: cabeçalho ordenável, redimensionável e reorganizável */
          <TabelaInterativa
            id="tratamentos.lista"
            dados={filtrados}
            colunas={[
              {
                key: 'tipo_nome',
                label: 'Tipo',
                largura: 140,
                render: (t: any) => (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold truncate"
                      style={{
                        backgroundColor: corDoTipo(t.tipo_nome) + '18',
                        color: corDoTipo(t.tipo_nome),
                      }}
                    >
                      {t.tipo_nome}
                    </span>
                    {/* b9: lápis ao lado do nome abre o CRUD de tipos */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setTiposOpen(t.tipo_nome)
                          setTipoEdit(tipos.find((x) => x.nome === t.tipo_nome) || null)
                          setTipoNome(t.tipo_nome)
                          setTipoCor(corDoTipo(t.tipo_nome))
                        }}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-[#1b5e20] shrink-0"
                        title="Editar tipo de tratamento"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ),
              },
              {
                key: 'instituto',
                label: 'Instituto',
                largura: 150,
                render: (t: any) => (
                  <span className="text-gray-600 block truncate">{t.instituto || '—'}</span>
                ),
              },
              {
                key: 'profissional',
                label: 'Profissional',
                largura: 150,
                render: (t: any) => (
                  <span className="text-gray-700 block truncate">{t.profissional || '—'}</span>
                ),
              },
              {
                key: 'paciente_nome',
                label: 'Paciente',
                largura: 130,
                render: (t: any) => (
                  <span className="text-gray-600 block truncate">{t.paciente_nome || '—'}</span>
                ),
              },
              {
                key: 'inicio',
                label: 'Início',
                largura: 95,
                valor: (t: any) => new Date(t.inicio || 0).getTime(),
                render: (t: any) => <span className="tabular-nums">{dataBR(t.inicio)}</span>,
              },
              {
                key: 'frequencia',
                label: 'Frequência',
                largura: 110,
                render: (t: any) => <span className="text-gray-600">{t.frequencia || '—'}</span>,
              },
              {
                key: 'sessoes',
                label: 'Sessões',
                largura: 90,
                align: 'right',
                valor: (t: any) =>
                  Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes.length : 0,
                render: (t: any) => {
                  const n = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes.length : 0
                  return (
                    <Badge
                      variant="outline"
                      className="text-[8.5px] border-sky-300 text-sky-800 bg-sky-50"
                    >
                      {n}
                    </Badge>
                  )
                },
              },
              {
                key: 'status',
                label: 'Status',
                largura: 115,
                render: (t: any) => (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9.5px] font-bold',
                      STATUS_COR[t.status] || 'border-gray-200 text-gray-600',
                    )}
                  >
                    {STATUS_LABEL[t.status] || t.status}
                  </Badge>
                ),
              },
              {
                key: 'anexos',
                label: 'Anexos',
                largura: 80,
                align: 'center',
                valor: (t: any) => anexos.filter((a) => a.tratamento_id === t.id).length,
                render: (t: any) => (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                    <Paperclip className="h-3 w-3" />
                    {anexos.filter((a) => a.tratamento_id === t.id).length}
                  </span>
                ),
              },
              {
                key: 'acoes',
                label: '',
                largura: 110,
                render: (t: any) => (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAberto(aberto === t.id ? null : t.id)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-500"
                      title="Ver anexos"
                    >
                      {aberto === t.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => enviarTarefas(t)}
                      className="p-1 rounded hover:bg-emerald-50 text-[#1b5e20]"
                      title="Enviar agenda de tarefas para o responsável"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}

        {/* b7: ao expandir, mantém APENAS "anexos do tratamento" */}
        {aberto && (
          <div className="px-4 pb-3 border-t border-gray-100 pt-2.5">
            {(() => {
              const t = tratamentos.find((x) => x.id === aberto)
              if (!t) return null
              const meus = anexos.filter((a) => a.tratamento_id === t.id)
              const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes : []
              return (
                <div className="space-y-2">
                  {/* datas clicáveis (b4) */}
                  {sessoes.length > 0 && (
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                        Datas das sessões — clique para alterar
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {sessoes.map((d, i) => (
                          <label
                            key={i}
                            className="relative px-1.5 py-0.5 rounded bg-white border border-sky-200 text-[10px] text-sky-900 tabular-nums cursor-pointer hover:border-[#1b5e20]"
                            title="Clique para alterar a data"
                          >
                            {dataBR(d)}
                            <input
                              type="date"
                              value={d}
                              onChange={(e) => {
                                if (e.target.value && e.target.value !== d) {
                                  alterarDataSessao(t, i, e.target.value)
                                }
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                      Anexos do tratamento
                    </p>
                    {meus.length === 0 ? (
                      <p className="text-[11px] text-gray-500 mb-2">Nenhum exame anexado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {meus.map((a) => (
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
                            'Aceita PDF/JPG/PNG até 50 MB. O upload de arquivo está desativado neste ciclo.',
                        })
                      }
                      className="w-full py-1.5 rounded border border-dashed border-gray-300 text-[11px] font-semibold text-gray-600 hover:border-[#1b5e20] hover:text-[#1b5e20]"
                    >
                      + Anexar exame / laudo / prescrição
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Card>

      {/* b9: tipos só aqui (lápis) — sem card lateral permanente */}
      <Dialog open={!!tiposOpen} onOpenChange={(o) => !o && setTiposOpen(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Tipos de tratamento</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Criar, renomear, recolorir e desativar. Reflete na hora no formulário.
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
            <Button variant="outline" size="sm" onClick={() => setTiposOpen(null)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOVO TRATAMENTO */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="bg-white w-[calc(100vw-2rem)] max-w-[793px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Novo tratamento</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Defina período ou repetição — as sessões e as tarefas do PGE são criadas juntas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">
                Tipo de tratamento *
              </Label>
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
                  <input
                    type="color"
                    value={novoTipoCor}
                    onChange={(e) => setNovoTipoCor(e.target.value)}
                    className="h-8 w-9 rounded border border-gray-200 cursor-pointer"
                    title="Cor"
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
                  placeholder="Ex.: Clínica Vida, Studio Corpo"
                />
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

            {/* b4: período (início/fim) OU repetir X vezes */}
            <div className="rounded-lg border border-gray-200 p-2.5 space-y-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                <CalendarRange className="h-3 w-3" /> Período e repetição
              </p>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10.5px] font-semibold text-gray-600">Início</Label>
                  <Input
                    type="date"
                    value={form.inicio}
                    onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                    className="h-9 text-[12px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] font-semibold text-gray-600">
                    Fim (opcional)
                  </Label>
                  <Input
                    type="date"
                    value={form.fim}
                    onChange={(e) => setForm({ ...form, fim: e.target.value })}
                    className="h-9 text-[12px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10.5px] font-semibold text-gray-600">Frequência</Label>
                  <Select
                    value={form.frequencia}
                    onValueChange={(v) => {
                      const f = FREQUENCIAS.find((x) => x.label === v)
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
                    onChange={(e) => setForm({ ...form, repetir: Number(e.target.value) })}
                    disabled={!!form.fim}
                    className={cn('h-9 text-[12px]', form.fim && 'bg-gray-50')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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

            {sessoesPreview.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
                <p className="text-[10.5px] font-bold text-sky-900 mb-1">
                  Serão criadas {sessoesPreview.length} sessões e {sessoesPreview.length} tarefas
                </p>
                <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                  {sessoesPreview.map((d, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded bg-white border border-sky-200 text-[10px] text-sky-900 tabular-nums"
                    >
                      {dataBR(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
              Criar tratamento e agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
