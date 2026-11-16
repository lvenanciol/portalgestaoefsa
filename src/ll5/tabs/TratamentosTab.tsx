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

// b0 (15/11/2026) — "agendado" e "não agendado" no dropdown de status.
const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  nao_agendado: 'Não agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

const STATUS_COR: Record<string, string> = {
  agendado: 'border-sky-300 text-sky-700 bg-sky-50',
  nao_agendado: 'border-gray-300 text-gray-500 bg-gray-50',
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
 * Data LOCAL no formato AAAA-MM-DD.
 *
 * 16/11/2026 — BUG a: "selecionei 15/10 e salvou 14/10".
 *
 * A versão anterior montava cada data com `d.toISOString().slice(0,10)`.
 * `toISOString()` SEMPRE converte para UTC. Com o horário ao meio-dia e fuso
 * negativo (Brasil, UTC-3) o dia se mantém; mas com fuso POSITIVO (UTC+13)
 * 12:00 local vira 23:00 UTC do DIA ANTERIOR — e o recorte devolvia 14/10.
 * Qualquer variação de fuso do navegador podia deslocar a data.
 *
 * Aqui a string é montada com os componentes LOCAIS, como o calendário já faz.
 * Isso elimina a classe inteira do problema: não existe conversão de fuso.
 */
function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + dia
}

/** Hoje no formato local (nunca UTC). */
function hojeLocal(): string {
  return isoLocal(new Date())
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
  // T12:00 evita virada de dia por horário de verão e mantém o dia intacto
  const base = new Date(inicio + 'T12:00:00')

  // 16/11/2026 — `fim` SÓ vale como intervalo quando é realmente POSTERIOR
  // ao início. Um clique no calendário devolve inicio === fim; nesse caso o
  // intervalo tem 1 dia e quem manda é o campo "Repetir".
  const fimStr = String(fim || '').slice(0, 10)
  const inicioStr = String(inicio || '').slice(0, 10)
  const temIntervalo = fimStr && fimStr > inicioStr
  const limite = temIntervalo ? new Date(fimStr + 'T12:00:00') : null

  if (limite) {
    for (let i = 0; i < 500; i++) {
      const d = new Date(base)
      d.setDate(d.getDate() + intervaloDias * i)
      if (d > limite) break
      out.push(isoLocal(d))
    }
    return out
  }

  const n = Math.min(Math.max(Number(repetir) || 8, 1), 200)
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + intervaloDias * i)
    out.push(isoLocal(d))
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
    // 16/11/2026 — dia local, não UTC (toISOString dava o dia anterior em
    // fusos positivos e à noite no Brasil após 21h).
    inicio: hojeLocal(),
    hora: '09:00',
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

  // 16/11/2026 — CONTROLE DE ALTERAÇÃO EXPLÍCITA.
  //
  // Antes eu travava o calendário inteiro na edição (pointer-events-none) para
  // impedir o loop de recriação de tarefas. Efeito colateral: o dono não
  // conseguia alterar a data de uma sessão.
  //
  // Agora o calendário está ATIVO e este sinalizador diz se o usuário MEXEU
  // no período. A agenda só é sincronizada quando ele mexeu — assim a edição
  // de campos comuns não toca em tarefa nenhuma.
  const [periodoAlterado, setPeriodoAlterado] = useState(false)

  // b) sessão aberta na edição — o status exibido no diálogo é o DELA,
  // o mesmo que a lista mostra na linha.
  const [sessaoEmEdicao, setSessaoEmEdicao] = useState<string | null>(null)

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
      const concluidas: string[] = Array.isArray(t.sessoes_concluidas)
        ? t.sessoes_concluidas.map((x: any) => String(x).slice(0, 10))
        : []

      // b) mapa de status por data (escolha do usuário)
      const mapaStatus: Record<string, string> = (() => {
        const m = t.sessoes_status
        if (m && typeof m === 'object' && !Array.isArray(m)) return m
        return {}
      })()

      if (sessoes.length === 0) {
        out.push({
          ...t,
          _sessao: null,
          _idx: -1,
          _dataSessao: t.inicio,
          _id: t.id + '-0',
          _concluida: t.status === 'concluido',
          _statusSessao: t.status || 'em_andamento',
        })
      } else {
        sessoes.forEach((d, i) => {
          const dia = String(d).slice(0, 10)
          const concluida = concluidas.includes(dia)
          out.push({
            ...t,
            _sessao: d,
            _idx: i,
            _dataSessao: d,
            _id: t.id + '-' + i,
            _concluida: concluida,
            // concluída manda; senão o que o usuário escolheu; senão agendado
            _statusSessao: concluida ? 'concluido' : mapaStatus[dia] || 'agendado',
          })
        })
      }
    }
    // mais recente primeiro
    out.sort((a, b) => String(b._dataSessao || '').localeCompare(String(a._dataSessao || '')))
    return out
  }, [tratamentos, busca, fTipo, fStatus])

  const kpis = useMemo(() => {
    const ativos = tratamentos.filter((t) => t.status === 'em_andamento').length

    // b) (15/11/2026) — BUG: `.sort()[0]` devolve a data MAIS ANTIGA, então o
    // card "Próxima sessão" mostrava sessão do PASSADO. O correto é a menor
    // data que ainda não passou E que não esteja concluída.
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const futuras: string[] = []
    for (const t of tratamentos) {
      const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes : []
      const concluidas: string[] = Array.isArray(t.sessoes_concluidas)
        ? t.sessoes_concluidas.map((x: any) => String(x).slice(0, 10))
        : []
      for (const s of sessoes) {
        const dia = String(s).slice(0, 10)
        if (!dia) continue
        if (concluidas.indexOf(dia) >= 0) continue
        const d = new Date(dia + 'T12:00:00')
        if (isNaN(d.getTime())) continue
        if (d < hoje) continue
        futuras.push(dia)
      }
    }
    futuras.sort()
    const proxima = futuras[0] || null

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
  /**
   * SINCRONIZA A AGENDA — INCREMENTAL (16/11/2026)
   *
   * ─────────────────────────────────────────────────────────────────────
   * BUG a/b: o status de uma sessão se replicava para TODAS.
   *
   * A versão anterior APAGAVA todas as tarefas do tratamento e recriava do
   * zero a cada salvamento, sempre com status='pendente'. Consequência:
   *   1. concluir uma sessão e salvar destruía o status de todas as outras;
   *   2. o campo `sessoes_concluidas` ficava apontando para datas cujas
   *      tarefas já não existiam no mesmo estado;
   *   3. qualquer status escolhido voltava para 'pendente'.
   *
   * BUG c: lentidão. Cada tarefa tinha `await setTimeout(80)` e o ciclo
   * apagava+recriava tudo: 8 sessões = ~16 requisições + ~640 ms parados.
   *
   * BUG d: editar um tratamento REGENERAVA a agenda a partir de
   * inicio+frequência+repetir, sobrescrevendo datas já ajustadas à mão.
   *
   * ─────────────────────────────────────────────────────────────────────
   * COMO FUNCIONA AGORA
   *   · `modoEdicao = true` (editar tratamento existente): NÃO toca em
   *     datas nem em tarefas. Só atualiza os campos de cadastro.
   *   · `datasForcadas` (veio do rodapé/calendário): aplica exatamente
   *     aquelas datas, criando SÓ as que faltam e removendo SÓ as que
   *     saíram — preservando o status das que continuam.
   *   · criação nova: gera as datas e cria todas.
   * ─────────────────────────────────────────────────────────────────────
   */
  const sincronizarAgenda = async (
    tratamentoId: string,
    dados: typeof form,
    tipoNome: string,
    datasForcadas?: string[],
    modoEdicao?: boolean,
  ) => {
    const atual = tratamentos.find((t) => t.id === tratamentoId)

    // ---------- (d) EDIÇÃO SEM MEXER NA AGENDA ----------
    if (modoEdicao && !datasForcadas) {
      return { sessoes: 0, criadas: 0, removidas: 0, ignorado: true }
    }

    const datas =
      datasForcadas && datasForcadas.length
        ? datasForcadas
        : gerarDatas(dados.inicio, Number(dados.intervalo_dias), dados.fim, dados.repetir)

    // 16/11/2026 — se não há datas, isso é ERRO na criação (não silêncio).
    if (!datas.length) {
      console.warn('[tratamentos] sincronizarAgenda sem datas', {
        inicio: dados.inicio,
        intervalo: dados.intervalo_dias,
        repetir: dados.repetir,
        fim: dados.fim,
      })
      return { sessoes: 0, criadas: 0, removidas: 0 }
    }

    // ---------- mapa data → tarefa já existente ----------
    const existentes: Record<string, string> = (() => {
      const m = atual?.tarefa_por_data
      if (m && typeof m === 'object' && !Array.isArray(m)) return { ...m }
      return {}
    })()
    // fallback: reconstrói o mapa a partir de tarefa_ids quando vazio
    if (!Object.keys(existentes).length) {
      const ids: string[] = Array.isArray(atual?.tarefa_ids) ? atual.tarefa_ids : []
      for (const id of ids) {
        try {
          const t: any = await pb.collection('tarefas').getOne(id)
          const d = String(t?.prazo || '').slice(0, 10)
          if (d) existentes[d] = id
        } catch (_e) {
          // tarefa já removida
        }
      }
    }

    const mapaFinal: Record<string, string> = {}
    let criadas = 0
    let removidas = 0

    // ---------- cria APENAS as datas que faltam ----------
    const novas = datas.filter((d) => !existentes[d])
    for (const dia of novas) {
      try {
        const tarefa: any = await pb.collection('tarefas').create({
          titulo: `${tipoNome} · ${dataBR(dia)}`,
          descricao:
            (dados.instituto ? dados.instituto + ' · ' : '') +
            (dados.profissional || '') +
            (dados.observacoes ? ' · ' + dados.observacoes : ''),
          // (c) hora da agenda escolhida pelo usuário; 12:00 é o padrão seguro
          prazo: dia + 'T' + (dados.hora || '09:00') + ':00Z',
          status: 'pendente',
          // 16/11/2026 — sem isto o PocketBase aplicava o default 'triagem'
          // e cada nova sessão nascia na triagem do kanban.
          status_kanban: 'a_fazer',
          prioridade: 'media',
          empresa: dados.empresa || '',
          responsaveis_ids: dados.responsavel_id ? [dados.responsavel_id] : [],
          responsavel: dados.paciente_nome || '',
          criado_por: ator.email,
          // (f) 16/11/2026 — vínculo explícito com o tratamento. Sem isto a
          // tarefa aparecia como "avulsa" no kanban e não podia ser rastreada.
          vinculo_tipo: 'tratamento',
          vinculo_id: tratamentoId,
          origem: 'projeto',
        })
        mapaFinal[dia] = tarefa.id
        criadas++
        // pausa curta SÓ entre criações novas (evita rate limit sem travar a UI)
        await new Promise((r) => setTimeout(r, 40))
      } catch (e) {
        console.warn('[tratamentos] falha ao criar tarefa em ' + dia, e)
      }
    }

    // ---------- mantém as que continuam válidas ----------
    for (const d of datas) {
      if (mapaFinal[d]) continue
      const id = existentes[d]
      if (id) mapaFinal[d] = id
    }

    // ---------- remove SÓ as datas que saíram da agenda ----------
    for (const d of Object.keys(existentes)) {
      if (datas.indexOf(d) >= 0) continue
      try {
        await pb.collection('tarefas').delete(existentes[d])
        removidas++
      } catch (_e) {
        // já removida
      }
    }

    const idsFinal = datas.map((d) => mapaFinal[d]).filter(Boolean) as string[]

    // 16/11/2026 — o catch vazio escondia a falha de gravação da agenda: as
    // tarefas eram criadas mas o tratamento NUNCA recebia `proximas_sessoes`,
    // então a lista mostrava o tratamento sem sessão nenhuma.
    try {
      await atualizar('ll5_treatments', ator, tratamentoId, {
        proximas_sessoes: datas,
        tarefa_ids: idsFinal,
        tarefa_por_data: mapaFinal,
        proxima_sessao: datas[0] + 'T12:00:00Z',
      })
      console.log('[tratamentos] agenda gravada: ' + datas.length + ' sessão(ões)')
    } catch (errAg) {
      console.error('[tratamentos] FALHA ao gravar a agenda', errAg)
      toast({
        title: 'Agenda não foi gravada',
        description:
          'As sessões foram calculadas, mas o tratamento não aceitou o registro. ' +
          String((errAg as any)?.response?.data?.message || (errAg as any)?.message || '').slice(
            0,
            160,
          ),
        variant: 'destructive',
      })
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
    setPeriodoAlterado(false)
    setForm({
      tipo_id: '',
      instituto: '',
      profissional: '',
      empresa: '',
      responsavel_id: '',
      paciente_nome: '',
      inicio: hojeLocal(),
      // c) hora da agenda: cada sessão é criada neste horário
      hora: '09:00',
      fim: '',
      frequencia: 'Semanal',
      intervalo_dias: 7,
      repetir: 8,
      status: 'em_andamento',
      observacoes: '',
    })
    setNovoOpen(true)
  }

  const abrirEdicao = (linha: any) => {
    // 15/11/2026 — a tabela passa uma LINHA (tratamento + _sessao). O diálogo
    // precisa do TRATAMENTO: resolve pelo id.
    const t = tratamentos.find((x) => x.id === linha.id) || linha
    setEditando(t)
    // zera o sinalizador: nada foi alterado ainda
    setPeriodoAlterado(false)

    // b) — o status exibido no diálogo é o da SESSÃO clicada, exatamente o
    // mesmo que a coluna Status da lista mostra.
    const sessao = linha._sessao || null
    setSessaoEmEdicao(sessao)

    // b) — o status vem de `sessoes_status[data]`, que guarda a ESCOLHA do
    // usuário. `sessoes_concluidas` continua mandando quando a data está nele.
    const concluidas: string[] = Array.isArray(t.sessoes_concluidas)
      ? t.sessoes_concluidas.map((x: any) => String(x).slice(0, 10))
      : []
    const mapaStatus: Record<string, string> = (() => {
      const m = t.sessoes_status
      if (m && typeof m === 'object' && !Array.isArray(m)) return m
      return {}
    })()

    // agenda existente do tratamento (mesma fonte das linhas da lista)
    const sessoes: string[] = Array.isArray(t.proximas_sessoes) ? t.proximas_sessoes : []

    const diaSessao = sessao ? String(sessao).slice(0, 10) : null
    const statusDaSessao = diaSessao
      ? concluidas.indexOf(diaSessao) >= 0
        ? 'concluido'
        : mapaStatus[diaSessao] || 'agendado'
      : t.status || 'em_andamento'

    // 16/11/2026 — CAUSA DO LOOP DE TAREFAS.
    // Eu preenchia `sessoesManuais` com as sessões já existentes. Em `salvar`,
    // esse array era passado como `datasForcadas` e a guarda
    // `if (modoEdicao && !datasForcadas) return` NUNCA disparava — então cada
    // clique em "Salvar" recriava todas as tarefas (e cada nova nascia em
    // triagem). 40 tarefas = várias salvadas.
    //
    // Agora começa NULO: só recebe valor se o usuário mexer nas datas.
    setSessoesManuais(null)
    const f = FREQUENCIAS.find((x) => x.label === t.frequencia)
    setForm({
      tipo_id: t.tipo_id || '',
      instituto: t.instituto || '',
      profissional: t.profissional || '',
      empresa: t.empresa || '',
      responsavel_id: t.responsavel_id || '',
      paciente_nome: t.paciente_nome || '',
      inicio: String(t.inicio || '').slice(0, 10),
      // (c) recupera a hora das sessões existentes
      hora: (() => {
        const pr = String(t.proxima_sessao || '')
        const m = /T(\d{2}):(\d{2})/.exec(pr)
        return m ? m[1] + ':' + m[2] : '09:00'
      })(),
      // 16/11/2026 — `fim` começa VAZIO na edição.
      // Antes eu preenchia com a última sessão da agenda; o `gerarDatas` então
      // criava um intervalo de `inicio` até `fim`, ignorando a data clicada.
      // Vazio = "não há intervalo"; o clique define a data da sessão.
      fim: '',
      frequencia: t.frequencia || 'Semanal',
      intervalo_dias: Number(t.intervalo_dias) || f?.dias || 7,
      repetir: sessoes.length || 8,
      status: statusDaSessao,
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
    // (d) 16/11/2026 — HORA É OBRIGATÓRIA para qualquer agenda/sessão.
    //
    // 16/11 — o campo `type="time"` do navegador devolve "HH:MM" ou "HH:MM:SS"
    // (Safari inclui segundos). Aceito os dois formatos; se vier vazio, uso
    // 09:00 em vez de BLOQUEAR o salvamento sem o usuário entender.
    const horaNorm = (() => {
      const raw = String(form.hora || '').trim()
      const m = /^(\d{1,2}):(\d{2})/.exec(raw)
      if (!m) return ''
      const h = String(Math.min(23, Number(m[1]))).padStart(2, '0')
      return h + ':' + m[2]
    })()

    if (!horaNorm) {
      toast({
        title: 'Defina a hora da agenda',
        description: 'O campo Hora é obrigatório. Preencha um horário (ex.: 09:00).',
        variant: 'destructive',
      })
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
        inicio: String(form.inicio || hojeLocal()).slice(0, 10) + 'T12:00:00Z',
        frequencia: form.frequencia,
        intervalo_dias: Number(form.intervalo_dias),
        status: form.status,
        observacoes: form.observacoes,
        demo: false,
      }

      // usa a hora normalizada em todo o fluxo (inclusive no gerarDatas)
      const formEfetivo = { ...form, hora: horaNorm }

      let id = editando?.id
      if (editando) {
        // b) — o status salvo vale para a SESSÃO em edição, não para o
        // tratamento inteiro. O status do tratamento é derivado das sessões.
        if (sessaoEmEdicao) {
          // não grava o status no tratamento quando editamos uma sessão
          delete dados.status
        }
        await atualizar('ll5_treatments', ator, editando.id, dados)

        // b) aplica o status escolhido à SESSÃO em edição.
        // Precisa gravar em `sessoes_status[data]` — senão "não agendado"
        // era perdido e a lista voltava a mostrar "agendada".
        if (sessaoEmEdicao) {
          const dia = String(sessaoEmEdicao).slice(0, 10)
          const concluidas: string[] = Array.isArray(editando.sessoes_concluidas)
            ? [...editando.sessoes_concluidas]
            : []

          // concluído entra/sai do array de concluídas
          if (form.status === 'concluido' && concluidas.indexOf(dia) < 0) {
            concluidas.push(dia)
          } else if (form.status !== 'concluido') {
            const idx = concluidas.indexOf(dia)
            if (idx >= 0) concluidas.splice(idx, 1)
          }

          // o status textual fica no mapa por data
          const mapa: Record<string, string> = (() => {
            const m = editando.sessoes_status
            if (m && typeof m === 'object' && !Array.isArray(m)) return { ...m }
            return {}
          })()
          mapa[dia] = form.status

          await atualizar('ll5_treatments', ator, editando.id, {
            sessoes_concluidas: concluidas,
            sessoes_status: mapa,
          })
        }
      } else {
        const rec = await criar('ll5_treatments', ator, dados, ownerAtual)
        id = rec.id
      }

      // ------------------------------------------------------------------
      // (16/11/2026) — A DATA CLICADA MANDA. NÃO RECALCULAR.
      //
      // PROBLEMA RELATADO: "cliquei 15/10 e gravou data diferente"; "salvar e
      // atualizar agenda não funciona".
      //
      // CAUSA: eu chamava `sincronizarAgenda` sem `datasForcadas`, e ela
      // REGENERAVA a agenda inteira com `gerarDatas(inicio, intervalo, fim,
      // repetir)`. Como `abrirEdicao` preenche `fim` com a última sessão
      // existente, o gerador criava datas de 15/10 até aquela última —
      // ignorando a data que o usuário clicou.
      //
      // REGRA NOVA, em ordem:
      //   1. criação                         → monta a agenda do período
      //   2. edição SEM mexer em data        → não toca em nada
      //   3. edição de UMA SESSÃO + clique   → move APENAS aquela sessão,
      //                                        mantendo as demais intactas
      //   4. edição SEM sessão + período     → respeita o intervalo exato
      //                                        escolhido no calendário
      // ------------------------------------------------------------------
      let r = { sessoes: 0, criadas: 0, removidas: 0, ignorado: true } as any

      if (!editando) {
        // ------------------------------------------------------------------
        // (a) 16/11/2026 — CRIAÇÃO: SEMPRE considera início + frequência +
        // repetir.
        //
        // Antes eu passava `formEfetivo` e o `sincronizarAgenda` recalculava
        // por dentro. Se `form.fim` tivesse qualquer resíduo (de uma edição
        // anterior no mesmo diálogo), o gerador entendia "intervalo" e
        // ignorava o `repetir` — a agenda saía vazia ou com 1 data.
        //
        // Aqui as datas são calculadas AQUI, explicitamente, com `fim` vazio.
        // Assim a criação nunca depende de estado residual do formulário.
        // ------------------------------------------------------------------
        const datasCriacao = gerarDatas(
          String(formEfetivo.inicio || hojeLocal()).slice(0, 10),
          Number(formEfetivo.intervalo_dias) || 7,
          '', // criação NUNCA usa intervalo
          Number(formEfetivo.repetir) || 8,
        )

        console.log('[tratamentos] criando agenda', {
          inicio: formEfetivo.inicio,
          hora: formEfetivo.hora,
          intervalo: formEfetivo.intervalo_dias,
          repetir: formEfetivo.repetir,
          datas: datasCriacao,
        })

        if (!datasCriacao.length) {
          toast({
            title: 'Não foi possível gerar as sessões',
            description: 'Confira a data inicial, a frequência e o campo Repetir.',
            variant: 'destructive',
          })
          return
        }

        r = await sincronizarAgenda(
          id,
          formEfetivo,
          tipo?.nome || 'Tratamento',
          datasCriacao,
          false,
        )
        console.log('[tratamentos] agenda criada', r, datasCriacao)
      } else if (periodoAlterado) {
        const diaSessao = sessaoEmEdicao ? String(sessaoEmEdicao).slice(0, 10) : null
        const novaData = String(form.inicio || '').slice(0, 10)

        // ------------------------------------------------------------------
        // (b) 16/11/2026 — PERGUNTAR ANTES DE REPROGRAMAR.
        //
        // Se a data alterada é a PRIMEIRA sessão da agenda, o sistema deve
        // oferecer reprogramar as demais (usando frequência e repetir).
        // Se é uma sessão do meio, move só ela — sem perguntar nada.
        // ------------------------------------------------------------------
        const atualT2 = tratamentos.find((x) => x.id === editando.id)
        const listaAtual: string[] = Array.isArray(atualT2?.proximas_sessoes)
          ? [...atualT2.proximas_sessoes].map((d) => String(d).slice(0, 10))
          : []
        const primeira = listaAtual.length ? listaAtual.slice().sort()[0] : null
        const ehPrimeira = primeira && diaSessao === primeira && novaData !== primeira

        if (ehPrimeira) {
          const reprogramar = window.confirm(
            'Você alterou a data da PRIMEIRA sessão.\n\n' +
              'Deseja reprogramar as demais sessões usando a frequência "' +
              (form.frequencia || '—') +
              '"?\n\n' +
              'OK = reprograma todas a partir de ' +
              dataBR(novaData) +
              '\n' +
              'Cancelar = altera somente esta sessão',
          )

          if (reprogramar) {
            // regenera a agenda a partir da nova primeira data
            const geradas = gerarDatas(
              novaData,
              Number(form.intervalo_dias),
              '',
              Number(form.repetir) || listaAtual.length || 8,
            )
            r = await sincronizarAgenda(id, form, tipo?.nome || 'Tratamento', geradas, false)
          } else {
            // só a primeira muda
            const idxP = listaAtual.indexOf(primeira)
            if (idxP >= 0) listaAtual[idxP] = novaData
            listaAtual.sort()
            await atualizar('ll5_treatments', ator, editando.id, {
              proximas_sessoes: listaAtual,
              inicio: listaAtual[0] + 'T12:00:00Z',
              proxima_sessao: listaAtual[0] + 'T12:00:00Z',
            })
            r = await sincronizarAgenda(id, form, tipo?.nome || 'Tratamento', listaAtual, false)
          }
        } else if (diaSessao && novaData && novaData !== diaSessao) {
          // (3) move SOMENTE a sessão em edição para a data clicada
          const atualT = tratamentos.find((x) => x.id === editando.id)
          const lista: string[] = Array.isArray(atualT?.proximas_sessoes)
            ? [...atualT.proximas_sessoes].map((d) => String(d).slice(0, 10))
            : []

          const idx = lista.indexOf(diaSessao)
          if (idx >= 0) {
            lista[idx] = novaData
          } else {
            lista.push(novaData)
          }
          lista.sort()

          try {
            await atualizar('ll5_treatments', ator, editando.id, {
              proximas_sessoes: lista,
              inicio: lista[0] + 'T12:00:00Z',
              proxima_sessao: lista[0] + 'T12:00:00Z',
            })
          } catch (_e) {
            // segue: a agenda abaixo reconcilia
          }

          // reconcilia as tarefas com a lista EXATA (nada é recalculado)
          r = await sincronizarAgenda(id, form, tipo?.nome || 'Tratamento', lista, false)
        } else {
          // (4) sem sessão específica em edição: usa o período do calendário.
          //
          // Clique simples devolve inicio === fim (uma data só) → respeitamos
          // exatamente ela. Arrasto devolve inicio < fim → geramos o intervalo
          // pela frequência escolhida.
          const fimStr = String(form.fim || '').slice(0, 10)
          let lista: string[] = []

          if (fimStr && fimStr > novaData) {
            // intervalo real (arrasto) → respeita frequência e repetir
            lista = gerarDatas(novaData, Number(form.intervalo_dias), fimStr, form.repetir)
          } else {
            // uma data só → é ela, sem calcular nada
            lista = [novaData]
          }

          r = await sincronizarAgenda(id, form, tipo?.nome || 'Tratamento', lista, false)
        }
      }

      const descricao = r.ignorado
        ? 'Cadastro atualizado. As datas e tarefas agendadas foram preservadas.'
        : `${r.sessoes} sessão(ões) · ${r.criadas} criada(s) · ${r.removidas} removida(s).`

      toast({
        title: editando ? 'Tratamento atualizado' : 'Tratamento criado',
        description: descricao,
      })
      setNovoOpen(false)
      await carregar()
    } catch (e: any) {
      // 16/11/2026 — o toast mostrava só "Falha ao salvar". Agora o erro real
      // vai para o console E para a descrição, com o campo que o PocketBase
      // recusou (a API devolve `data` por campo).
      console.error('[tratamentos] falha ao salvar', e)

      let detalhe = e?.response?.data?.message || e?.message || String(e)
      try {
        const campos = e?.response?.data?.data
        if (campos && typeof campos === 'object') {
          const partes = Object.keys(campos).map(
            (k) => k + ': ' + (campos[k]?.message || String(campos[k])),
          )
          if (partes.length) detalhe = partes.join(' | ')
        }
      } catch (_e2) {
        // mantém o detalhe simples
      }

      toast({
        title: 'Falha ao salvar',
        description: String(detalhe).slice(0, 240),
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

  /**
   * b) CONCLUIR TRATAMENTO.
   * Marca o tratamento como concluído E conclui a tarefa correspondente
   * na tela Tarefas (status='concluida'). Uma tarefa por sessão executada.
   */
  /**
   * b / b2 — CONCLUIR.
   *
   * BUG b1 CORRIGIDO: `atualizar()` recebia o objeto `r` que vinha de uma
   * LINHA da tabela. Como a tabela expande um tratamento em N linhas, o
   * spread carregava `_sessao`, `_idx` e outros campos internos; o update
   * acabava sem o `id` certo e o PocketBase aplicava no registro errado —
   * dando a impressão de que "todos mudavam de status".
   *
   * Agora usamos SEMPRE `t.id` do tratamento, e gravamos o status:
   *   · sessão específica → `sessoes_concluidas[]` + a tarefa daquela data
   *   · sem sessão        → status='concluido' do tratamento inteiro
   */
  const concluirTratamento = async (t: any, sessaoData?: string | null) => {
    try {
      // id do TRATAMENTO (não da linha da tabela)
      const tratamentoId = String(t.id || '').split('-')[0]
      if (!tratamentoId) throw new Error('Tratamento sem id')

      const registro = tratamentos.find((x) => x.id === tratamentoId) || t
      const ids: string[] = Array.isArray(registro.tarefa_ids) ? registro.tarefa_ids : []
      const mapaData: Record<string, string> = (() => {
        const m = registro.tarefa_por_data
        if (m && typeof m === 'object' && !Array.isArray(m)) return m
        return {}
      })()

      let concluidas = 0

      if (!sessaoData) {
        // 16/11/2026 — sem sessão definida, isto conclui TUDO. Confirmo com
        // o usuário: antes o clique concluía o tratamento inteiro em silêncio.
        const ok = window.confirm(
          'Concluir o tratamento INTEIRO?\n\nTodas as ' +
            (Array.isArray(registro.proximas_sessoes) ? registro.proximas_sessoes.length : 0) +
            ' sessões serão marcadas como realizadas.\n\nPara concluir apenas uma data, feche este diálogo e clique na linha da sessão desejada.',
        )
        if (!ok) return
      }

      if (sessaoData) {
        // ---------- b2: conclui SOMENTE a sessão clicada ----------
        //
        // 15/11/2026 — BUSCA POR DATA, não por tarefa_ids.
        // O array `tarefa_ids` pode estar vazio/desatualizado (tarefas criadas
        // antes do controle). Consultamos as tarefas do PGE cujo título contém
        // o tratamento e cujo prazo é a data alvo. Assim a tarefa de
        // 13/09, 15/10 e 13/11 é encontrada e concluída de fato.
        const alvo = sessaoData.slice(0, 10)
        const idMapeado = mapaData[alvo]

        const candidatos: string[] = []
        if (idMapeado) candidatos.push(String(idMapeado))
        for (const id of ids) if (!candidatos.includes(String(id))) candidatos.push(String(id))

        // ------------------------------------------------------------------
        // 16/11/2026 — BUG b: o status se replicava para TODAS as sessões.
        //
        // Este fallback buscava no PGE INTEIRO as tarefas do dia e aceitava
        // qualquer uma cujo título contivesse o TIPO do tratamento. Como dois
        // tratamentos podem ter o mesmo tipo (ex.: "Liberação Miofascial"),
        // ele capturava tarefas de OUTROS tratamentos da mesma data e as
        // marcava como concluídas.
        //
        // Correção: só aceita tarefa que NÃO pertença a outro tratamento.
        // Construímos o conjunto de ids/títulos de todos os OUTROS tratamentos
        // e descartamos qualquer candidato que caia neles.
        // ------------------------------------------------------------------
        const idsDeOutros = new Set<string>()
        const titulosDeOutros: string[] = []
        for (const outro of tratamentos) {
          if (outro.id === tratamentoId) continue
          const oIds: string[] = Array.isArray(outro.tarefa_ids) ? outro.tarefa_ids : []
          for (const oi of oIds) idsDeOutros.add(String(oi))
          if (outro.tipo_nome) titulosDeOutros.push(String(outro.tipo_nome))
        }

        try {
          const busca = await pb.collection('tarefas').getFullList({
            filter: `prazo >= "${alvo} 00:00:00" && prazo <= "${alvo} 23:59:59"`,
          })
          for (const tr of busca as any[]) {
            // nunca tocar em tarefa de outro tratamento
            if (idsDeOutros.has(String(tr.id))) continue
            if (candidatos.includes(tr.id)) continue

            const titulo = String(tr.titulo || '')
            // o título do reconciliar/agenda é "<tipo> · dd/mm/aaaa".
            // Só aceita quando o tipo é DESTE tratamento e não de outro.
            const casaEsteTipo =
              registro.tipo_nome && titulo.indexOf(String(registro.tipo_nome)) === 0
            const casaOutroTipo = titulosDeOutros.some(
              (tp) => tp && tp !== registro.tipo_nome && titulo.indexOf(tp) === 0,
            )
            if (casaEsteTipo && !casaOutroTipo) {
              candidatos.push(tr.id)
            }
          }
        } catch (_e) {
          // sem permissão de busca ampla: segue com os candidatos conhecidos
        }

        for (const id of candidatos) {
          try {
            const tarefa: any = await pb.collection('tarefas').getOne(id)
            const prazo = String(tarefa?.prazo || '').slice(0, 10)
            if (prazo && prazo !== alvo) continue
            await pb.collection('tarefas').update(id, {
              status: 'concluida',
              concluida_em: new Date().toISOString(),
            })
            concluidas++
          } catch (_e) {
            // tarefa ausente
          }
        }

        // registra a sessão concluída no tratamento (sem tocar no status dele)
        const jaConcluidas: string[] = Array.isArray(registro.sessoes_concluidas)
          ? [...registro.sessoes_concluidas]
          : []
        if (!jaConcluidas.includes(alvo)) jaConcluidas.push(alvo)

        // se TODAS as sessões estão concluídas, o tratamento fecha
        const todas: string[] = Array.isArray(registro.proximas_sessoes)
          ? registro.proximas_sessoes
          : []
        const fechou =
          todas.length > 0 && todas.every((d) => jaConcluidas.includes(String(d).slice(0, 10)))

        // 16/11/2026 — grava TAMBÉM o status textual no mapa por data, para a
        // coluna Status da lista refletir a conclusão sem depender só do array
        // `sessoes_concluidas` (que pode estar defasado).
        const mapaSt: Record<string, string> = (() => {
          const m = registro.sessoes_status
          if (m && typeof m === 'object' && !Array.isArray(m)) return { ...m }
          return {}
        })()
        mapaSt[alvo] = 'concluido'

        await atualizar('ll5_treatments', ator, tratamentoId, {
          sessoes_concluidas: jaConcluidas,
          sessoes_status: mapaSt,
          ...(fechou ? { status: 'concluido' } : {}),
        })

        toast({
          title: 'Sessão concluída',
          description: `${dataBR(alvo)} · ${concluidas} tarefa(s) concluída(s).`,
        })
      } else {
        // ---------- b: conclui o tratamento INTEIRO ----------
        for (const id of ids) {
          try {
            await pb.collection('tarefas').update(id, {
              status: 'concluida',
              concluida_em: new Date().toISOString(),
            })
            concluidas++
          } catch (_e) {
            // tarefa ausente
          }
        }

        await atualizar('ll5_treatments', ator, tratamentoId, {
          status: 'concluido',
          // marca todas as sessões como concluídas
          sessoes_concluidas: Array.isArray(registro.proximas_sessoes)
            ? [...registro.proximas_sessoes]
            : [],
        })

        toast({
          title: 'Tratamento concluído',
          description: `${concluidas} tarefa(s) concluída(s) em Tarefas.`,
        })
      }

      await carregar()
    } catch (e: any) {
      toast({ title: 'Falha ao concluir', description: e?.message, variant: 'destructive' })
    }
  }

  /**
   * b7) ANEXAR ARQUIVO pela coluna Anexos da linha.
   * Cria o registro em ll5_attachments com os metadados do arquivo.
   */
  const anexarArquivo = async (t: any, file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Arquivo acima de 50 MB', variant: 'destructive' })
      return
    }
    try {
      const rec = await criar(
        'll5_attachments',
        ator,
        {
          tratamento_id: t.id,
          tipo: 'exame',
          nome_arquivo: file.name,
          mime: file.type || 'application/pdf',
          tamanho: file.size,
          storage_key: 'll5/' + t.id + '/' + file.name,
          confianca_extracao: null,
          enviado_por: ator.email,
          demo: false,
        },
        ownerAtual,
      )
      // tenta subir o binário no campo File (se o storage permitir)
      try {
        const fd = new FormData()
        fd.append('arquivo', file)
        await pb.collection('ll5_attachments').update(rec.id, fd)
      } catch (_e) {
        // sem storage: o metadado já registra o anexo
      }
      toast({ title: 'Anexo registrado', description: file.name })
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao anexar',
        description: e?.response?.data?.message || e?.message,
        variant: 'destructive',
      })
    }
  }

  const [reconciliando, setReconciliando] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false)

  /** Corrige as tarefas JÁ existentes (título e responsável). */
  const corrigirTarefas = async () => {
    setCorrigindo(true)
    try {
      const r: any = await pb.send('/backend/v1/ll5/corrigir-tarefas', {
        method: 'POST',
        body: '{}',
      })
      toast({
        title: 'Tarefas corrigidas',
        description:
          `${r.tarefas_corrigidas || 0} tarefa(s): título sem o paciente e responsável preenchido.` +
          (r.tratamentos_sem_paciente
            ? ` · ${r.tratamentos_sem_paciente} tratamento(s) sem paciente cadastrado.`
            : ''),
      })
      await carregar()
    } catch (e: any) {
      const detalhe = e?.response?.data?.erro || e?.message || String(e)
      toast({ title: 'Falha ao corrigir', description: detalhe, variant: 'destructive' })
    } finally {
      setCorrigindo(false)
    }
  }

  /** b6: chama o endpoint que remove tarefas órfãs e duplicadas. */
  const reconciliar = async () => {
    setReconciliando(true)
    try {
      const r: any = await pb.send('/backend/v1/tratamentos/reconciliar-tarefas', {
        method: 'POST',
        body: '{}',
      })
      toast({
        title: 'Tarefas reconciliadas',
        description:
          `${r.tarefas_orfas_removidas || 0} órfã(s) removida(s) · ` +
          `${r.tarefas_duplicadas_removidas || 0} duplicada(s) · ` +
          `${r.tarefas_validas || 0} válida(s).`,
      })
      await carregar()
    } catch (e: any) {
      const detalhe = e?.response?.data?.erro || e?.message || String(e)
      toast({ title: 'Falha ao reconciliar', description: detalhe, variant: 'destructive' })
    } finally {
      setReconciliando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    try {
      // ------------------------------------------------------------------
      // 16/11/2026 — antes eu apagava SÓ `tarefa_ids`, e toda tarefa criada
      // por outro caminho (ou cujo id saiu do array numa sincronização)
      // ficava órfã no kanban para sempre.
      //
      // Agora reúno os ids de TODAS as fontes e, como reforço, apago também
      // as tarefas cujo título seja "<tipo> · dd/mm" deste tratamento.
      // ------------------------------------------------------------------
      const alvos = new Set<string>()

      // a) array de ids
      const ids: string[] = Array.isArray(excluir.tarefa_ids) ? excluir.tarefa_ids : []
      for (const id of ids) alvos.add(String(id))

      // b) mapa data → tarefa
      try {
        const m = excluir.tarefa_por_data
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          for (const k of Object.keys(m)) alvos.add(String(m[k]))
        }
      } catch (_e) {
        // mapa ausente ou malformado: as outras duas fontes cobrem
      }

      // c) varredura por título (pega o que escapou das duas listas)
      const tipoTrat = String(excluir.tipo_nome || '').trim()
      if (tipoTrat) {
        try {
          const todas = await pb.collection('tarefas').getFullList({
            filter: `titulo ~ "${tipoTrat.replace(/"/g, '\\"')}"`,
          })
          for (const tr of todas as any[]) {
            const t = String(tr.titulo || '')
            // só o padrão da agenda: "<tipo> · dd/mm/aaaa"
            const casa = /^(.+?)\s*·\s*\d{2}\/\d{2}\/\d{4}\s*$/.exec(t)
            if (casa && casa[1].trim() === tipoTrat) alvos.add(String(tr.id))
          }
        } catch (_e) {
          // sem permissão de busca ampla: segue com as listas
          console.warn('[tratamentos] varredura por título indisponível')
        }
      }

      let removidas = 0
      for (const id of Array.from(alvos)) {
        try {
          await pb.collection('tarefas').delete(id)
          removidas++
        } catch (_e) {
          // já removida
        }
      }

      await excluirLogico('ll5_treatments', ator, excluir.id)

      toast({
        title: 'Tratamento excluído',
        description: `${removidas} tarefa(s) vinculada(s) removida(s).`,
      })
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
        {/* b6: reconcilia tarefas órfãs/duplicadas */}
        <Button
          size="sm"
          variant="outline"
          onClick={reconciliar}
          disabled={reconciliando}
          className="h-9 text-xs"
          title="Remove tarefas órfãs e duplicadas, garantindo 1 tarefa por sessão"
        >
          {reconciliando ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Repeat className="h-3.5 w-3.5 mr-1.5" />
          )}
          Reconciliar tarefas
        </Button>

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
            onLinhaClique={(r) => abrirEdicao(r)}
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
                largura: 125,
                // b) — EXATAMENTE o mesmo valor que o diálogo mostra e grava
                valor: (r: any) => r._statusSessao,
                render: (r: any) => {
                  const st = String(r._statusSessao || 'agendado')
                  const rotulo =
                    st === 'concluido'
                      ? 'Concluída'
                      : st === 'nao_agendado'
                        ? 'Não agendada'
                        : st === 'agendado'
                          ? 'Agendada'
                          : st === 'suspenso'
                            ? 'Suspensa'
                            : st === 'cancelado'
                              ? 'Cancelada'
                              : 'Em andamento'
                  return (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9.5px] font-bold whitespace-nowrap',
                        STATUS_COR[st] || 'border-gray-200 text-gray-600',
                      )}
                    >
                      {rotulo}
                    </Badge>
                  )
                },
              },
              {
                key: 'anexos',
                label: 'Anexos',
                largura: 80,
                align: 'center',
                valor: (r: any) => anexos.filter((a) => a.tratamento_id === r.id).length,
                // b7) clicar na coluna abre o seletor de arquivo
                render: (r: any) => {
                  const n = anexos.filter((a) => a.tratamento_id === r.id).length
                  return (
                    <label
                      className="inline-flex items-center gap-0.5 text-[11px] text-gray-600 cursor-pointer hover:text-[#1b5e20] px-1.5 py-0.5 rounded hover:bg-emerald-50"
                      title="Clique para anexar um arquivo"
                    >
                      <Paperclip className="h-3 w-3" />
                      {n}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0]
                          if (f) anexarArquivo(r, f)
                          ev.target.value = ''
                        }}
                      />
                    </label>
                  )
                },
              },
              {
                key: 'acoes',
                label: 'Ações',
                largura: 150,
                align: 'center',
                render: (r: any) => (
                  <div className="flex items-center justify-center gap-0.5">
                    {/* b) concluir a sessão desta linha (ou o tratamento todo) */}
                    <button
                      type="button"
                      onClick={() => concluirTratamento(r, r._sessao)}
                      className="p-1 rounded hover:bg-emerald-50 text-[#1b5e20]"
                      title={
                        r._sessao
                          ? 'Marcar esta sessão como realizada (conclui a tarefa)'
                          : 'Concluir tratamento'
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
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
                <SelectTrigger className="h-9 !text-[12px] [&>span]:!text-[12px] [&>span]:!font-normal">
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

            {/* 16/11/2026 — o calendário está ATIVO também na edição.
                A agenda só é recalculada se o usuário alterar o período. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" /> Período
                  {editando && periodoAlterado && (
                    <span className="text-[9.5px] font-normal text-amber-700">
                      (alterado — a agenda será recalculada ao salvar)
                    </span>
                  )}
                </Label>
                <RangeCalendario
                  inicio={form.inicio}
                  fim={form.fim}
                  onChange={(i, f) => {
                    // 16/11/2026 — clique simples escolhe UMA data:
                    // `f` vem vazio nesse caso e não deve apagar `inicio`.
                    setSessoesManuais(null)
                    setPeriodoAlterado(true)
                    setForm({ ...form, inicio: i || form.inicio, fim: f || '' })
                  }}
                />
                {editando && periodoAlterado && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = tratamentos.find((x) => x.id === editando.id)
                      const sessoes: string[] = Array.isArray(t?.proximas_sessoes)
                        ? t.proximas_sessoes
                        : []
                      setPeriodoAlterado(false)
                      setSessoesManuais(null)
                      setForm((f) => ({
                        ...f,
                        inicio: String(t?.inicio || '').slice(0, 10),
                        fim: sessoes.length ? sessoes[sessoes.length - 1] : '',
                      }))
                    }}
                    className="text-[10px] font-semibold text-[#1b5e20] hover:underline"
                  >
                    desfazer alteração de período
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {/* 16/11/2026 — grid de 3 colunas: Frequência, Repetir e Hora
                    na MESMA linha, alinhados. Antes eram 2 colunas e a Hora
                    caía sozinha na linha de baixo, desalinhada. */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-semibold text-gray-600">Frequência</Label>
                    <Select
                      value={form.frequencia}
                      onValueChange={(v) => {
                        const f = FREQUENCIAS.find((x) => x.label === v)
                        setSessoesManuais(null)
                        if (editando) setPeriodoAlterado(true)
                        setForm({ ...form, frequencia: v, intervalo_dias: f?.dias || 7 })
                      }}
                    >
                      <SelectTrigger className="h-9 !text-[12px] [&>span]:!text-[12px] [&>span]:!font-normal">
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
                        if (editando) setPeriodoAlterado(true)
                        setForm({ ...form, repetir: Number(e.target.value) })
                      }}
                      // 16/11/2026 — NÃO desabilitar por `form.fim`.
                      // Um clique simples no calendário devolve inicio = fim
                      // (uma data só), e o campo ficava travado já na criação.
                      // "Repetir" só faz sentido sem intervalo — e o próprio
                      // gerarDatas decide: com fim, usa o intervalo; sem fim,
                      // usa o repetir.
                      className="h-9 !text-[12px]"
                      title="Quantas sessões criar a partir do início"
                    />
                  </div>
                  {/* (c) HORA DA AGENDA — obrigatória */}
                  <div className="space-y-1">
                    <Label className="text-[10.5px] font-semibold text-gray-600">
                      Hora <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="time"
                      value={form.hora || '09:00'}
                      onChange={(e) => setForm({ ...form, hora: e.target.value })}
                      className="h-9 !text-[12px]"
                      title="Horário de cada sessão na agenda (obrigatório)"
                    />
                  </div>
                </div>
                {/* a) fonte e tamanho iguais ao campo "Profissional" (h-9 text-[12px]) */}
                {/* b) status da SESSÃO em edição, igual ao da linha na lista */}
                <div className="space-y-1">
                  <Label className="text-[10.5px] font-semibold text-gray-600">
                    Status{sessaoEmEdicao ? ' da sessão ' + dataBR(sessaoEmEdicao) : ''}
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger className="h-9 !text-[12px] [&>span]:!text-[12px] [&>span]:!font-normal">
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
                </div>{' '}
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

          {/* b1 (15/11/2026) — CAIXA "PRÓXIMAS SESSÕES" REMOVIDA do rodapé.
              As datas são gerenciadas pelo calendário de período, acima. */}

          <DialogFooter className="flex-wrap gap-2">
            {/* b) (16/11/2026) — BUG: este botão chamava concluirTratamento
                SEM a sessão, então concluía o TRATAMENTO INTEIRO e o status se
                replicava para todas as sessões (o print do dono comprova).
                Agora passa `sessaoEmEdicao`: se há uma sessão aberta, só ela
                é concluída; sem sessão, conclui o tratamento — com aviso. */}
            {editando && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNovoOpen(false)
                  concluirTratamento(editando, sessaoEmEdicao)
                }}
                className="h-9 text-[12px] text-[#1b5e20] border-emerald-300 hover:bg-emerald-50 mr-auto"
                title={
                  sessaoEmEdicao
                    ? 'Concluir somente a sessão de ' + dataBR(sessaoEmEdicao)
                    : 'Concluir o tratamento inteiro (todas as sessões)'
                }
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                {sessaoEmEdicao
                  ? 'Marcar esta sessão como realizada'
                  : 'Marcar tratamento como realizado'}
              </Button>
            )}
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
