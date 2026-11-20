import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Bell,
  Download,
  Columns3,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  GripVertical,
  Search,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Package,
  Tag,
  Receipt,
  Ticket,
  Store,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ParceiroParecerDialog } from '@/components/varejo/ParceiroParecerDialog'
import { useBotoes } from '@/services/botoes-service'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

// ============================================================================
// DESEMPENHO POR UNIDADE — r14 (13/11/2026)
// Escopo: só apresentação. Contratos, rotas e KPIs preservados.
//
// a) último filtro memorizado por usuário
// b) Canal sem Carone/Extrabom (são Redes)
// c) Rede só habilita no Canal Varejo (Redes)
// d) Rede Carone   -> Bandeira: Todos | Carone | Sempre Tem
// e) Rede Coutinho -> Bandeira: Todos | Atacado Vem | Extrabom
// f) recolher mantém o nível superior visível com "+"
// f1) cada nível exibe valores E % (subtotais próprios)
// f2) NSS / SSS no lugar de Loja Nova / Existente
// f3) nível recolhido não mostra linhas abaixo dele
// g) Supervisor 30% mais estreito
// h) ícone de ocultar também reexibe
// i) hierarquia completa Rede -> Bandeira -> Loja
// ============================================================================

const T = {
  bg: '#f4f5f7',
  nav: '#14532d',
  card: '#ffffff',
  border: '#e5e7eb',
  input: '#f9fafb',
  text: '#111827',
  muted: '#6b7280',
  pos: '#15803d',
  neg: '#b91c1c',
  warn: '#b45309',
  tintGreen: '#f0fdf4',
  tintAmber: '#fffbeb',
  tintRed: '#fef2f2',
  alertFill: '#fcecec',
} as const

const LIMIAR = { meta: 100, atencao: 95 }
type Canal = 'varejo' | 'atacado' | 'distribuicao'

const CANAIS: { id: Canal; label: string }[] = [
  { id: 'varejo', label: 'Varejo (Redes)' },
  { id: 'atacado', label: 'Atacado' },
  { id: 'distribuicao', label: 'Distribuição' },
]

// Coutinho é o nome de negócio do Extrabom no ERP
const REDES = [
  { v: '', l: 'Todas' },
  { v: 'carone', l: 'Carone' },
  { v: 'extrabom', l: 'Coutinho' },
]
const GRUPOS_CARONE = [
  { v: '', l: 'Todos' },
  { v: 'carone', l: 'Carone' },
  { v: 'sempre_tem', l: 'Sempre Tem' },
]
const GRUPOS_COUTINHO = [
  { v: '', l: 'Todos' },
  { v: 'atacado', l: 'Atacado Vem' },
  { v: 'extrabom', l: 'Extrabom' },
]
const GRUPOS_TODOS = [
  { v: '', l: 'Todos' },
  { v: 'carone', l: 'Carone' },
  { v: 'sempre_tem', l: 'Sempre Tem' },
  { v: 'extrabom', l: 'Extrabom' },
  { v: 'atacado', l: 'Atacado Vem' },
]

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const MESES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Loja {
  codparc: number
  loja: string
  rede: string
  bandeira?: string
  cupons: number | null
  faturamento: number | null
  quantidade: number | null
  preco_medio: number | null
  ticket_medio: number | null
  supervisor_id: number | null
  tipoloja: string | null
  loja_nova: boolean
  limite_quebra: number | null
  participacao: number | null
  meta?: number | null
  ating_venda?: number | null
  cresc_aa?: number | null
  cupons_aa?: number | null
  preco_aa?: number | null
  ticket_aa?: number | null
  qtd_aa?: number | null
  cmv_orcado?: number | null
  cmv_parcial?: number | null
  cmv_mensal?: number | null
  quebra?: number | null
  funcionarios?: number | null
  // quebra vinda da query oficial do dashboard "Quebra TOP 50"
  quebra_qtd_pct?: number | null
  quebra_valor?: number | null
}

interface Resposta {
  schema_v: number
  ok: boolean
  periodo: string
  kpis: Record<string, number | null | undefined>
  origem: Record<string, string>
  serie: any[]
  lojas: Loja[]
  supervisores: { codparc: string | number; nome: string; qtd?: number }[]
  total_funcionarios?: number
  falhas?: string[]
  aviso?: string
  do_cache?: boolean
  stale?: boolean
  cache_idade_min?: number
}

const n = (v: any, d = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const brl = (v: any, d = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: d,
      })
const comp = (v: any) => {
  if (v === null || v === undefined) return '—'
  const x = Number(v)
  if (Math.abs(x) >= 1e6)
    return (x / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mi'
  if (Math.abs(x) >= 1e3)
    return (x / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mil'
  return n(x)
}
const pct = (v: any, d = 1) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(d).replace('.', ',') + '%'

// ---------------- preferências por usuário ----------------
const lerPrefs = (uid: string): Record<string, any> => {
  try {
    return JSON.parse(localStorage.getItem('pge_des:' + (uid || 'anon')) || '{}')
  } catch {
    return {}
  }
}
const gravarPref = (uid: string, k: string, v: any) => {
  try {
    const p = lerPrefs(uid)
    p[k] = v
    localStorage.setItem('pge_des:' + (uid || 'anon'), JSON.stringify(p))
  } catch {
    /* bloqueado */
  }
}

// ---------------- card ----------------
type Tom = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet'
const TONE: Record<Tom, { i: string; b: string }> = {
  green: { i: T.pos, b: T.tintGreen },
  amber: { i: T.warn, b: T.tintAmber },
  red: { i: T.neg, b: T.tintRed },
  gray: { i: T.muted, b: T.input },
  blue: { i: '#1d4ed8', b: '#eff6ff' },
  violet: { i: '#6d28d9', b: '#f5f3ff' },
}

interface VarItem {
  label: string
  valor: number | null
  inverso?: boolean
  comparado?: string | null
}

function Card({
  label,
  valor,
  contexto,
  Icone,
  tom,
  vars,
  arrastando,
  onDragStart,
  onDragOver,
  onDrop,
  onMover,
  onOcultar,
  onClick,
}: any) {
  const c = TONE[tom as Tom]
  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative h-full flex flex-col bg-white border p-3',
        arrastando && 'opacity-50',
      )}
      style={{ borderColor: T.border, borderRadius: 6, cursor: 'grab' }}
    >
      <div className="absolute top-1 right-1 z-20 flex gap-0.5 opacity-0 group-hover:opacity-100 bg-white border rounded shadow-sm px-0.5">
        <button
          type="button"
          onClick={() => onMover(-1)}
          title="Mover"
          className="p-0.5"
          style={{ color: T.muted }}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onMover(1)}
          title="Mover"
          className="p-0.5"
          style={{ color: T.muted }}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onOcultar}
          title="Ocultar card"
          className="p-0.5"
          style={{ color: T.muted }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-start gap-1.5 pr-12">
        <span
          className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded mt-0.5"
          style={{ background: c.b, color: c.i }}
        >
          <Icone className="h-3 w-3" />
        </span>
        <span className="text-[10px] font-bold uppercase leading-[1.15]" style={{ color: T.muted }}>
          {label}
        </span>
      </div>
      <div
        className="text-[21px] font-bold leading-none mt-1.5 tabular-nums"
        style={{ color: T.text }}
      >
        {valor}
      </div>
      {contexto && (
        <div className="text-[10px] mt-0.5 leading-tight" style={{ color: T.muted }}>
          {contexto}
        </div>
      )}
      <div className="mt-auto pt-2 flex items-start justify-center gap-3 flex-wrap text-[10px] leading-none">
        {((vars as VarItem[]) || []).length === 0 && <span style={{ color: T.muted }}>—</span>}
        {((vars as VarItem[]) || []).map((v, i) => {
          const x = v.valor
          if (x === null || x === undefined)
            return (
              <span
                key={i}
                className="inline-flex flex-col items-center"
                style={{ color: T.muted }}
              >
                <span>{v.label} —</span>
                <span className="text-[9px]">{v.comparado || '—'}</span>
              </span>
            )
          const ok = v.inverso ? x < 0 : x > 0
          const neu = Math.abs(x) < 0.05
          const cor = neu ? T.muted : ok ? T.pos : T.neg
          const Ico = neu ? Minus : x > 0 ? ArrowUpRight : ArrowDownRight
          return (
            <span key={i} className="inline-flex flex-col items-center leading-tight">
              <span
                className="inline-flex items-center gap-0.5 font-semibold tabular-nums"
                style={{ color: cor }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
                <Ico className="h-2.5 w-2.5" />
                {v.label} {(x > 0 ? '+' : '') + x.toFixed(1).replace('.', ',')}%
              </span>
              <span className="text-[9px] tabular-nums" style={{ color: T.muted }}>
                {v.comparado || '—'}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Sel({ label, value, onChange, options, largura, disabled }: any) {
  const maior = ((options as any[]) || []).reduce(
    (m, o) => Math.max(m, String(o.l).length),
    label.length,
  )
  const w = Math.min(largura, Math.max(96, maior * 6.6 + 42))
  return (
    <div style={{ width: w }} className="min-w-0 shrink-0">
      <label
        className="block text-[10px] font-bold uppercase mb-1 truncate"
        style={{ color: T.muted }}
      >
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-[34px] rounded border px-2 pr-7 text-[12px] appearance-none outline-none truncate disabled:opacity-50"
          style={{ background: T.input, borderColor: T.border, color: T.text, borderRadius: 6 }}
        >
          {((options as any[]) || []).map((o: any) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
        <ChevronDown
          className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: T.muted }}
        />
      </div>
    </div>
  )
}

// ---------------- colunas ----------------
interface Col {
  id: string
  label: string
  w: number
  al: 'left' | 'right'
  tipo: 'texto' | 'brl' | 'num' | 'pct' | 'delta'
}

const COLUNAS: Col[] = [
  { id: 'rede', label: 'Rede', w: 120, al: 'left', tipo: 'texto' },
  { id: 'loja', label: 'Loja', w: 190, al: 'left', tipo: 'texto' },
  { id: 'participacao', label: 'Part. %', w: 74, al: 'right', tipo: 'pct' },
  { id: 'meta', label: 'Venda Orçada', w: 122, al: 'right', tipo: 'brl' },
  { id: 'faturamento', label: 'Venda Realizada', w: 134, al: 'right', tipo: 'brl' },
  { id: 'ating', label: '% Atg', w: 92, al: 'right', tipo: 'pct' },
  { id: 'cresc_aa', label: '% Cresc A.A', w: 108, al: 'right', tipo: 'delta' },
  { id: 'quantidade', label: 'Qtde/Kg', w: 104, al: 'right', tipo: 'num' },
  { id: 'qtd_aa', label: '% Qtde/Kg A.A', w: 120, al: 'right', tipo: 'delta' },
  { id: 'preco_medio', label: 'Preço Médio', w: 110, al: 'right', tipo: 'brl' },
  { id: 'preco_aa', label: '% Pc Médio A.A', w: 126, al: 'right', tipo: 'delta' },
  { id: 'cupons', label: 'Cupom', w: 86, al: 'right', tipo: 'num' },
  { id: 'cupons_aa', label: '% Cupom A.A', w: 112, al: 'right', tipo: 'delta' },
  { id: 'ticket_medio', label: 'Ticket Médio', w: 112, al: 'right', tipo: 'brl' },
  { id: 'ticket_aa', label: '% T. Médio A.A', w: 122, al: 'right', tipo: 'delta' },
  { id: 'cmv_orcado', label: '% CMV Orçado', w: 116, al: 'right', tipo: 'pct' },
  { id: 'cmv_parcial', label: '% CMV Parcial', w: 118, al: 'right', tipo: 'pct' },
  { id: 'limite_quebra', label: '% Lim. Quebra', w: 116, al: 'right', tipo: 'pct' },
  { id: 'quebra', label: '% Quebra', w: 96, al: 'right', tipo: 'pct' },
  { id: 'funcionarios', label: 'Funcionários', w: 108, al: 'right', tipo: 'num' },
]

const CARDS = ['fat', 'qtd', 'preco', 'cupons', 'ticket', 'cmv', 'quebra', 'lojas'] as const
type CardId = (typeof CARDS)[number]
type Bloco = 'cards' | 'grade' | 'grafico'

// ============================================================================
export default function DesempenhoPage() {
  const { pode } = useBotoes()
  const { user } = useAuth() as { user?: { id?: string } }
  const uid = String((user as any)?.id || 'anon')
  const prefs = useMemo(() => lerPrefs(uid), [uid])

  const hj = new Date()
  const anoC = hj.getFullYear()
  const mesC = hj.getMonth() + 1

  // (a) último filtro aplicado
  const [f, setF] = useState(() => {
    const p = prefs.filtroApp || {}
    return {
      aba: (CANAIS.some((c) => c.id === p.aba) ? p.aba : 'varejo') as Canal,
      ano: Number(p.ano || anoC),
      mes: Number(p.mes || mesC),
      rede: p.rede || '',
      tipoLoja: p.tipoLoja || '',
      tipoGrupo: p.tipoGrupo || '',
      tipoVenda: p.tipoVenda || '',
      loja: p.loja || '',
      supervisor: p.supervisor || '',
    }
  })
  useEffect(() => {
    gravarPref(uid, 'filtroApp', f)
  }, [f, uid])

  const [dados, setDados] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => prefs.filtrosAbertos === true)
  // item 3: persistir a visibilidade do painel de filtros.
  // 20/11/2026 — ESTE useEffect ESTAVA ANTES DA DECLARAÇÃO do useState e
  // derrubava a tela inteira com "Cannot access 'filtrosAbertos' before
  // initialization" (TDZ). O build não pega: é erro de EXECUÇÃO.
  // Regra: efeito que lê um estado tem de vir DEPOIS do useState dele.
  useEffect(() => {
    gravarPref(uid, 'filtrosAbertos', filtrosAbertos)
  }, [filtrosAbertos, uid])

  const [colOcultas, setColOcultas] = useState<string[]>(() =>
    Array.isArray(prefs.colunasOcultas) ? prefs.colunasOcultas : [],
  )
  const [colLarg, setColLarg] = useState<Record<string, number>>(() =>
    prefs.colunasLarg && typeof prefs.colunasLarg === 'object' ? prefs.colunasLarg : {},
  )
  const [menuColunas, setMenuColunas] = useState(false)
  const [ordem, setOrdem] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const redim = useRef<{ id: string; ini: number; w: number } | null>(null)

  const [cards, setCards] = useState<{ ordem: CardId[]; ocultos: CardId[] }>(() => ({
    ordem: Array.isArray(prefs.cardsOrdem) ? (prefs.cardsOrdem as CardId[]) : [...CARDS],
    ocultos: Array.isArray(prefs.cardsOcultos) ? (prefs.cardsOcultos as CardId[]) : [],
  }))
  const [layout, setLayout] = useState<Record<Bloco, number>>(() =>
    prefs.layout && typeof prefs.layout === 'object'
      ? prefs.layout
      : { cards: 0, grade: 1, grafico: 2 },
  )
  const [blocosOcultos, setBlocosOcultos] = useState<Bloco[]>(() =>
    Array.isArray(prefs.blocosOcultos) ? prefs.blocosOcultos : [],
  )
  const [arrastandoCard, setArrastandoCard] = useState<CardId | null>(null)
  const [arrastandoBloco, setArrastandoBloco] = useState<Bloco | null>(null)

  // ==========================================================================
  // 20/11/2026 — ITEM 3 DO DONO: "ao sair do PGE para outra aba do navegador
  // ou outro sistema e voltar, o app deve manter a tela no status deixado".
  //
  // O que se perdia ao voltar: filtros abertos, ramos recolhidos da grade,
  // drilldown expandido, busca e lojas selecionadas — tudo vivia só em
  // memória, e qualquer remontagem do componente zerava.
  //
  // Agora cada um desses estados é gravado por usuário (localStorage) e
  // restaurado na montagem. O estado é o MESMO que a pessoa deixou.
  // ==========================================================================
  const [fechados, setFechados] = useState<string[]>(() =>
    Array.isArray(prefs.fechados) ? prefs.fechados : [],
  )
  const [telaCheia, setTelaCheia] = useState<'grafico' | 'grade' | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const bellRef = useRef<HTMLDivElement | null>(null)
  const [drillQuebra, setDrillQuebra] = useState(false)
  // item 3: os ramos expandidos do drilldown também sobrevivem à volta
  const [drillAberto, setDrillAberto] = useState<string[]>(() =>
    Array.isArray(prefs.drillAberto) ? prefs.drillAberto : ['rede:'],
  )
  const [itensCarregados, setItensCarregados] = useState<Record<string, any[]>>({})
  const [carregandoLoja, setCarregandoLoja] = useState<string | null>(null)
  const [erroComposicao, setErroComposicao] = useState<string>('')

  const [drillCanais, setDrillCanais] = useState<'faturamento' | 'cmv' | null>(null)
  const [dadosCanais, setDadosCanais] = useState<any | null>(null)
  const [carregandoCanais, setCarregandoCanais] = useState(false)
  // cache em memória por período+métrica (item 1a: reabrir é instantâneo)
  const memoCanais = useRef<Record<string, any>>({})

  useEffect(() => {
    if (!drillCanais) return
    let cancelado = false
    // item 1a: reabrir o mesmo período na sessão é instantâneo
    // item 1b: o modal abre com o MESMO recorte da tela
    const qsFiltro =
      '&rede=' +
      encodeURIComponent(f.rede || '') +
      '&tipogrupo=' +
      encodeURIComponent(f.tipoGrupo || '') +
      '&loja=' +
      encodeURIComponent(f.loja || '') +
      '&tipoloja=' +
      encodeURIComponent(f.tipoLoja || '')
    const chaveMemo = drillCanais + '|' + f.ano + '|' + f.mes + qsFiltro
    if (memoCanais.current[chaveMemo]) {
      setDadosCanais(memoCanais.current[chaveMemo])
      setCarregandoCanais(false)
      return
    }
    setCarregandoCanais(true)
    setDadosCanais(null)
    pb.send(
      '/backend/v1/varejo/canais?ano=' +
        f.ano +
        '&mes=' +
        f.mes +
        '&metrica=' +
        drillCanais +
        qsFiltro,
      { method: 'GET' },
    )
      .then((r: any) => {
        if (!cancelado) {
          if (r && r.ok) memoCanais.current[chaveMemo] = r
          setDadosCanais(r)
        }
      })
      .catch((err: any) => {
        if (!cancelado)
          setDadosCanais({ ok: false, erro: String(err?.message || err).slice(0, 140) })
      })
      .finally(() => {
        if (!cancelado) setCarregandoCanais(false)
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillCanais, f.ano, f.mes])

  const carregarComposicao = async (codparc: number | string) => {
    const chave = String(codparc)
    if (itensCarregados[chave] || carregandoLoja === chave) return
    setCarregandoLoja(chave)
    setErroComposicao('')
    try {
      const r: any = await pb.send(
        '/backend/v1/varejo/quebra?ano=' + f.ano + '&mes=' + f.mes + '&loja=' + chave,
        { method: 'GET' },
      )
      const itens =
        (r && r.quebra_produtos && r.quebra_produtos[chave]) ||
        (r && r.lojas && r.lojas[0] && r.lojas[0].produtos) ||
        []
      setItensCarregados((p) => ({ ...p, [chave]: itens }))
    } catch (err: any) {
      setErroComposicao(
        'Não foi possível carregar a composição desta loja: ' +
          String(err?.message || err).slice(0, 120),
      )
    } finally {
      setCarregandoLoja(null)
    }
  }
  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<Loja | null>(null)
  // item 3: a busca digitada continua ao voltar
  const [busca, setBusca] = useState(() => String(prefs.busca || ''))
  useEffect(() => {
    gravarPref(uid, 'busca', busca)
  }, [busca, uid])
  useEffect(() => {
    gravarPref(uid, 'fechados', fechados)
  }, [fechados, uid])
  useEffect(() => {
    gravarPref(uid, 'drillAberto', drillAberto)
  }, [drillAberto, uid])
  const [selecionadas, setSelecionadas] = useState<number[]>([])

  const METRICAS = [
    { id: 'FAT', label: 'Faturamento', campo: 'FAT', tipo: 'brl' },
    { id: 'QTD', label: 'Quantidade / Kg', campo: 'QTD', tipo: 'num' },
    { id: 'CUPONS', label: 'Cupons', campo: 'CUPONS', tipo: 'num' },
    { id: 'TICKET', label: 'Ticket Médio', campo: 'TICKET', tipo: 'brl' },
    { id: 'PRECO', label: 'Preço Médio', campo: 'PRECO', tipo: 'brl' },
  ]
  const [metrica, setMetrica] = useState<string>(() => prefs.metrica || 'FAT')
  useEffect(() => {
    gravarPref(uid, 'metrica', metrica)
  }, [metrica, uid])
  const defM = METRICAS.find((m) => m.id === metrica) || METRICAS[0]
  const [anosOcultos, setAnosOcultos] = useState<string[]>([])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const raw = q.get('aba') as Canal
    if (raw || q.get('ano')) {
      setF((p) => ({
        ...p,
        aba: CANAIS.some((c) => c.id === raw) ? raw : p.aba,
        ano: Number(q.get('ano') || p.ano),
        mes: Number(q.get('mes') || p.mes),
        rede: q.get('rede') || p.rede,
        tipoLoja: q.get('tipoloja') || p.tipoLoja,
        tipoGrupo: q.get('tipogrupo') || p.tipoGrupo,
        tipoVenda: q.get('tipovenda') || p.tipoVenda,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTelaCheia(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  const setCampo = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))

  const qs = useCallback(
    (forcar: boolean) => {
      const p = new URLSearchParams()
      p.set('aba', f.aba)
      p.set('ano', String(f.ano))
      p.set('mes', String(f.mes))
      if (f.tipoLoja) p.set('tipoloja', f.tipoLoja)
      if (f.tipoGrupo) p.set('tipogrupo', f.tipoGrupo)
      if (f.rede) p.set('rede', f.rede)
      if (f.tipoVenda) p.set('tipovenda', f.tipoVenda)
      if (f.loja) p.set('loja', f.loja)
      if (f.supervisor) p.set('supervisor', f.supervisor)
      if (forcar) p.set('forcar', '1')
      return p.toString()
    },
    [f],
  )

  const mem = useRef<Record<string, Resposta>>({})
  const carregar = useCallback(
    async (forcar = false) => {
      const kk = qs(false)
      if (!forcar && mem.current[kk]) {
        setDados(mem.current[kk])
        setLoading(false)
        return
      }
      setLoading(true)
      setErro('')
      try {
        const r = (await pb.send('/backend/v1/varejo/desempenho?' + qs(forcar), {
          method: 'GET',
        })) as Resposta

        let quebraLojas: any[] = []
        try {
          const qb = (await pb.send('/backend/v1/varejo/quebra?ano=' + f.ano + '&mes=' + f.mes, {
            method: 'GET',
          })) as { ok: boolean; lojas: any[] }
          quebraLojas = qb?.lojas || []
        } catch (_e) {
          quebraLojas = []
        }

        if (quebraLojas.length) {
          const mapa: Record<string, any> = {}
          const prods: Record<string, any[]> = {}
          for (const qq of quebraLojas) {
            mapa[String(qq.codparc)] = qq
            if (qq.produtos && qq.produtos.length) prods[String(qq.codparc)] = qq.produtos
          }
          ;(r as any).quebra_produtos = prods
          r.lojas = (r.lojas || []).map((l: Loja) => {
            const qq = mapa[String(l.codparc)]
            return qq
              ? {
                  ...l,
                  quebra: qq.perc_quebra_venda,
                  quebra_qtd_pct: qq.perc_quebra_qtd,
                  quebra_valor: qq.vlr_quebra,
                }
              : l
          })
        }

        setDados(r)
        mem.current[kk] = r
        setSelecionadas([])
      } catch (e) {
        setErro(String(e))
        setDados(null)
      } finally {
        setLoading(false)
      }
    },
    [qs],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

  const k = dados?.kpis || {}
  const ultimoFechado = f.ano === anoC ? Math.max(0, mesC - 1) : f.mes
  const filtrado = selecionadas.length > 0

  const lojasKpi = useMemo(() => {
    const todas = dados?.lojas || []
    return filtrado ? todas.filter((l) => selecionadas.includes(l.codparc)) : todas
  }, [dados, selecionadas, filtrado])

  const soma = (fn: (l: Loja) => any) => lojasKpi.reduce((a, l) => a + (Number(fn(l)) || 0), 0)
  const med = (fn: (l: Loja) => any) => {
    const vs = lojasKpi.map(fn).filter((x) => x !== null && x !== undefined) as number[]
    return vs.length ? vs.reduce((a, b) => a + Number(b), 0) / vs.length : null
  }

  const K: any = useMemo(() => {
    if (!filtrado)
      return {
        ...k,
        funcionarios: dados?.total_funcionarios ?? null,
        nLojas: dados?.lojas.length || 0,
      }
    const fat = soma((l) => l.faturamento),
      qtd = soma((l) => l.quantidade)
    const cup = soma((l) => l.cupons),
      meta = soma((l) => l.meta),
      fun = soma((l) => l.funcionarios)
    const mCmv = med((l) => l.cmv_parcial),
      mOrc = med((l) => l.cmv_orcado)
    const mQ = med((l) => l.quebra),
      mLim = med((l) => l.limite_quebra)
    return {
      faturamento: fat || null,
      meta_venda: meta || null,
      faturamento_ating: med((l) => l.ating_venda),
      faturamento_aa: med((l) => l.cresc_aa),
      quantidade_kg: qtd || null,
      quantidade_aa: med((l) => l.qtd_aa),
      preco_medio: fat && qtd ? fat / qtd : null,
      preco_aa: med((l) => l.preco_aa),
      cupons: cup || null,
      cupons_aa: med((l) => l.cupons_aa),
      ticket_medio: fat && cup ? fat / cup : null,
      ticket_aa: med((l) => l.ticket_aa),
      cmv_pct: mCmv,
      meta_cmv: mOrc,
      cmv_ating: mCmv && mOrc ? (mOrc / mCmv) * 100 : null,
      quebra_pct: mQ,
      limite_perda: mLim,
      quebra_ating: mQ && mLim ? (mQ / mLim) * 100 : null,
      funcionarios: fun || null,
      nLojas: lojasKpi.length,
    }
  }, [filtrado, k, lojasKpi, dados])

  const seriePivot = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    for (const s of dados?.serie || []) {
      const mm = String(s.MES || '').padStart(2, '0')
      if (!mapa[mm]) mapa[mm] = {}
      mapa[mm][String(s.ANO)] = Number((s as any)[defM.campo] ?? (s as any).FAT) || 0
    }
    const anos = Array.from(
      new Set((dados?.serie || []).map((s: any) => String(s.ANO || '')).filter(Boolean)),
    ).sort()
    const ult = anos[anos.length - 1]
    return Object.keys(mapa)
      .sort()
      .map((mm) => {
        const linha: any = { mes: MESES_C[Number(mm) - 1] || mm }
        for (const a of anos) linha[a] = mapa[mm][a] ?? null
        if (ult) {
          const v = mapa[mm][ult] ?? null
          linha[ult] = Number(mm) <= ultimoFechado ? v : null
          linha[ult + ' parcial'] = Number(mm) >= ultimoFechado ? v : null
        }
        return linha
      })
  }, [dados, ultimoFechado, defM])

  const anos = useMemo(
    () =>
      Array.from(
        new Set((dados?.serie || []).map((s: any) => String(s.ANO || '')).filter(Boolean)),
      ).sort(),
    [dados],
  )

  // ---------------- subtotais por nível ----------------
  const somaGrupo = (ls: Loja[]) => {
    const fat = ls.reduce((a, l) => a + (Number(l.faturamento) || 0), 0)
    const meta = ls.reduce((a, l) => a + (Number(l.meta) || 0), 0)
    const qtd = ls.reduce((a, l) => a + (Number(l.quantidade) || 0), 0)
    const cup = ls.reduce((a, l) => a + (Number(l.cupons) || 0), 0)
    const part = ls.reduce((a, l) => a + (Number(l.participacao) || 0), 0)
    const m = (fn: (l: Loja) => any) => {
      const vs = ls.map(fn).filter((x) => x !== null && x !== undefined) as number[]
      return vs.length ? vs.reduce((a, b) => a + Number(b), 0) / vs.length : null
    }
    return {
      ating: meta ? (fat / meta) * 100 : null,
      participacao: part || null,
      meta: meta || null,
      faturamento: fat || null,
      ating_venda: meta ? (fat / meta) * 100 : null,
      cresc_aa: m((l) => l.cresc_aa),
      quantidade: qtd || null,
      qtd_aa: m((l) => l.qtd_aa),
      preco_medio: fat && qtd ? fat / qtd : null,
      preco_aa: m((l) => l.preco_aa),
      cupons: cup || null,
      cupons_aa: m((l) => l.cupons_aa),
      ticket_medio: fat && cup ? fat / cup : null,
      ticket_aa: m((l) => l.ticket_aa),
      cmv_orcado: m((l) => l.cmv_orcado),
      cmv_parcial: m((l) => l.cmv_parcial),
      limite_quebra: m((l) => l.limite_quebra),
      quebra: m((l) => l.quebra),
      funcionarios: ls.reduce((a, l) => a + (Number(l.funcionarios) || 0), 0) || null,
    }
  }

  // ---------------- hierarquia Rede -> Bandeira -> Loja ----------------
  const grupos = useMemo(() => {
    let base = [...(dados?.lojas || [])]
    if (busca.trim()) {
      const t = busca.trim().toLowerCase()
      base = base.filter(
        (l) => String(l.loja).toLowerCase().includes(t) || String(l.rede).toLowerCase().includes(t),
      )
    }
    const porRede: Record<string, Loja[]> = {}
    for (const l of base) {
      const r = String(l.rede || 'Outros')
      if (!porRede[r]) porRede[r] = []
      porRede[r].push(l)
    }
    return Object.keys(porRede)
      .sort()
      .map((rede) => {
        const ls = porRede[rede]
        const porBand: Record<string, Loja[]> = {}
        for (const l of ls) {
          const b = String(l.bandeira || 'Outros')
          if (!porBand[b]) porBand[b] = []
          porBand[b].push(l)
        }
        const bandeiras = Object.keys(porBand)
          .sort()
          .map((band) => {
            const lb = porBand[band]
              .slice()
              .sort((a, b) => String(a.loja).localeCompare(String(b.loja)))
            return { chave: band, label: band, lojas: lb, total: somaGrupo(lb) }
          })
        return { rede, total: somaGrupo(ls), nLojas: ls.length, bandeiras }
      })
  }, [dados, busca])

  const lojasFiltradas = useMemo(() => {
    let arr = [...(dados?.lojas || [])]
    if (busca.trim()) {
      const t = busca.trim().toLowerCase()
      arr = arr.filter(
        (l) => String(l.loja).toLowerCase().includes(t) || String(l.rede).toLowerCase().includes(t),
      )
    }
    if (ordem) {
      const { id, dir } = ordem
      arr.sort((a, b) => {
        const va: any = id === 'ating' ? a.ating_venda : (a as any)[id]
        const vb: any = id === 'ating' ? b.ating_venda : (b as any)[id]
        if (va === null || va === undefined) return 1
        if (vb === null || vb === undefined) return -1
        if (typeof va === 'number' && typeof vb === 'number')
          return dir === 'asc' ? va - vb : vb - va
        return dir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va))
      })
    }
    return arr
  }, [dados, ordem, busca])

  const colVisiveis = useMemo(() => COLUNAS.filter((c) => !colOcultas.includes(c.id)), [colOcultas])

  // Mapeia o id da COLUNA para o campo REAL da loja.
  // A coluna '% Atg' tem id 'ating' mas o dado vem em 'ating_venda' — sem
  // este mapa a célula lia undefined e mostrava "—".
  const valorDaLoja = (c: Col, l: Loja): any => {
    if (c.id === 'ating') return l.ating_venda
    if (c.id === 'meta') return l.meta
    return (l as any)[c.id]
  }

  const celula = (c: Col, valor: any) => {
    if (c.id === 'ating') {
      if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
      const v = Number(valor)
      const ok = v >= LIMIAR.meta,
        at = v >= LIMIAR.atencao && v < LIMIAR.meta
      return (
        <span
          className="inline-flex items-center gap-1 justify-end w-full font-bold px-1 rounded"
          style={{
            background: ok ? T.tintGreen : at ? T.tintAmber : T.tintRed,
            color: ok ? T.pos : at ? T.warn : T.neg,
          }}
        >
          {ok ? '▲' : at ? '▬' : '▼'} {pct(v)}
        </span>
      )
    }
    if (c.tipo === 'delta') {
      if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
      const v = Number(valor)
      const cor = v > 0.05 ? T.pos : v < -0.05 ? T.neg : T.muted
      return (
        <span className="font-semibold" style={{ color: cor }}>
          {v > 0.05 ? '▲ ' : v < -0.05 ? '▼ ' : ''}
          {pct(v)}
        </span>
      )
    }
    if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
    if (c.tipo === 'brl') return brl(valor)
    if (c.tipo === 'pct') return pct(valor)
    if (c.tipo === 'num') return n(valor)
    return String(valor)
  }

  const alertas = useMemo(() => {
    const out: any[] = []
    for (const l of dados?.lojas || []) {
      if (l.ating_venda !== null && l.ating_venda !== undefined && l.ating_venda < LIMIAR.atencao)
        out.push({
          id: 'a' + l.codparc,
          loja: l.loja,
          d: 'Atingimento ' + pct(l.ating_venda),
          tom: 'red',
          codparc: l.codparc,
        })
      else if (l.meta === null || l.meta === undefined)
        out.push({
          id: 'm' + l.codparc,
          loja: l.loja,
          d: 'Venda orçada não configurada',
          tom: 'amber',
          codparc: l.codparc,
        })
    }
    return out
  }, [dados])

  const alternar = (ch: string) =>
    setFechados((p) => (p.includes(ch) ? p.filter((x) => x !== ch) : p.concat([ch])))
  const altLinha = (c: number) =>
    setSelecionadas((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.concat([c])))

  const moverCard = (id: CardId, dir: -1 | 1) => {
    const arr = [...cards.ordem]
    const i = arr.indexOf(id),
      j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    arr.splice(i, 1)
    arr.splice(j, 0, id)
    const nv = { ...cards, ordem: arr }
    setCards(nv)
    gravarPref(uid, 'cardsOrdem', nv.ordem)
  }
  const moverBloco = (b: Bloco, dir: -1 | 1) => {
    const ord = (Object.keys(layout) as Bloco[]).sort((x, y) => layout[x] - layout[y])
    const i = ord.indexOf(b),
      j = i + dir
    if (i < 0 || j < 0 || j >= ord.length) return
    const nv = { ...layout }
    const a = layout[b]
    nv[b] = layout[ord[j]]
    nv[ord[j]] = a
    setLayout(nv)
    gravarPref(uid, 'layout', nv)
  }

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      const r = redim.current
      if (!r) return
      setColLarg((p) => ({ ...p, [r.id]: Math.max(64, r.w + (e.clientX - r.ini)) }))
    }
    const up = () => {
      if (redim.current) {
        setColLarg((p) => {
          gravarPref(uid, 'colunasLarg', p)
          return p
        })
        redim.current = null
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
    }
  }, [uid])

  const ordenarPor = (id: string) =>
    setOrdem((p) =>
      !p || p.id !== id ? { id, dir: 'desc' } : p.dir === 'desc' ? { id, dir: 'asc' } : null,
    )

  const largura = (c: Col) => colLarg[c.id] || c.w

  if (loading && !dados) {
    return (
      <div className="flex items-center justify-center py-16" style={{ background: T.bg }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: T.nav }} />
        <span className="ml-2 text-sm" style={{ color: T.muted }}>
          Carregando indicadores…
        </span>
      </div>
    )
  }
  if (erro || !dados) {
    return (
      <div
        className="p-4 rounded-lg border flex items-center gap-2"
        style={{ background: T.tintRed, borderColor: '#fecaca', color: T.neg }}
      >
        <AlertTriangle className="h-4 w-4" /> Erro: {erro || 'sem dados'}
      </div>
    )
  }

  const cardsVisiveis = cards.ordem.filter((id) => !cards.ocultos.includes(id))
  const blocosOrdem = (Object.keys(layout) as Bloco[]).sort((a, b) => layout[a] - layout[b])

  const PainelCards = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
      {cardsVisiveis.map((id) => {
        const def: Record<
          CardId,
          { label: string; valor: string; ctx?: string; tom: Tom; ic: any; vars: VarItem[] }
        > = {
          fat: {
            label: 'Faturamento',
            valor: brl(K.faturamento),
            ctx: K.meta_venda ? 'Orçado ' + brl(K.meta_venda) : 'Sem orçamento',
            tom: (K.faturamento_ating ?? 0) >= 100 ? 'green' : 'red',
            ic: TrendingUp,
            vars: [
              {
                label: '% Meta',
                valor: K.faturamento_ating,
                comparado: K.meta_venda ? 'de ' + brl(K.meta_venda) : null,
              },
              { label: 'A.A', valor: K.faturamento_aa, comparado: 'ano anterior' },
            ],
          },
          qtd: {
            label: 'Qtde / Kg',
            valor: n(K.quantidade_kg),
            tom: 'blue',
            ic: Package,
            vars: [{ label: 'A.A', valor: K.quantidade_aa, comparado: 'ano anterior' }],
          },
          preco: {
            label: 'Preço Médio',
            valor: brl(K.preco_medio, 2),
            tom: 'violet',
            ic: Tag,
            vars: [{ label: 'A.A', valor: K.preco_aa, comparado: 'ano anterior' }],
          },
          cupons: {
            label: 'Cupons',
            valor: n(K.cupons),
            tom: 'gray',
            ic: Receipt,
            vars: [{ label: 'A.A', valor: K.cupons_aa, comparado: 'ano anterior' }],
          },
          ticket: {
            label: 'Ticket Médio',
            valor: brl(K.ticket_medio, 2),
            tom: 'gray',
            ic: Ticket,
            vars: [{ label: 'A.A', valor: K.ticket_aa, comparado: 'ano anterior' }],
          },
          cmv: {
            label: 'CMV Parcial',
            valor: pct(K.cmv_pct),
            ctx: K.meta_cmv ? 'Orçado ' + pct(K.meta_cmv) : undefined,
            tom: (K.cmv_ating ?? 0) <= 100 ? 'green' : 'red',
            ic: Percent,
            vars: [
              {
                label: '% Orç',
                valor: K.cmv_ating,
                inverso: true,
                comparado: K.meta_cmv ? 'de ' + pct(K.meta_cmv) : null,
              },
            ],
          },
          quebra: {
            label: 'Quebra',
            valor: pct(K.quebra_pct),
            ctx: K.limite_perda ? 'Limite ' + pct(K.limite_perda) : undefined,
            tom: (K.quebra_ating ?? 0) <= 100 ? 'green' : 'red',
            ic: AlertTriangle,
            vars: [
              {
                label: '% Lim',
                valor: K.quebra_ating,
                inverso: true,
                comparado: K.limite_perda ? 'de ' + pct(K.limite_perda) : null,
              },
            ],
          },
          lojas: {
            label: 'Lojas',
            valor: n(K.nLojas),
            tom: 'blue',
            ic: Store,
            vars: [],
          },
        }
        const d = def[id]
        return (
          <Card
            key={id}
            label={d.label}
            valor={d.valor}
            contexto={d.ctx}
            Icone={d.ic}
            tom={d.tom}
            vars={d.vars}
            arrastando={arrastandoCard === id}
            onDragStart={() => setArrastandoCard(id)}
            onDragOver={(e: any) => e.preventDefault()}
            onDrop={() => {
              if (arrastandoCard && arrastandoCard !== id) {
                const arr = [...cards.ordem]
                const a = arr.indexOf(arrastandoCard),
                  b = arr.indexOf(id)
                arr.splice(a, 1)
                arr.splice(b, 0, arrastandoCard)
                const nv = { ...cards, ordem: arr }
                setCards(nv)
                gravarPref(uid, 'cardsOrdem', nv.ordem)
              }
              setArrastandoCard(null)
            }}
            onMover={(dir: -1 | 1) => moverCard(id, dir)}
            onOcultar={() => {
              const nv = { ...cards, ocultos: cards.ocultos.concat([id]) }
              setCards(nv)
              gravarPref(uid, 'cardsOcultos', nv.ocultos)
            }}
          />
        )
      })}
    </div>
  )

  const nomeCanal = CANAIS.find((c) => c.id === f.aba)?.label || 'Varejo (Redes)'
  const nomeSup =
    (dados.supervisores || []).find((s) => String(s.codparc) === f.supervisor)?.nome || 'Todos'
  const carteiraBandeira =
    f.aba === 'varejo' && f.rede === 'carone'
      ? GRUPOS_CARONE
      : f.aba === 'varejo' && f.rede === 'extrabom'
        ? GRUPOS_COUTINHO
        : GRUPOS_TODOS
  const filtrosAtivos =
    (f.rede ? 1 : 0) +
    (f.tipoLoja ? 1 : 0) +
    (f.tipoGrupo ? 1 : 0) +
    (f.tipoVenda ? 1 : 0) +
    (f.loja ? 1 : 0) +
    (f.supervisor ? 1 : 0)
  const cheio = (t: 'grafico' | 'grade') => telaCheia === t

  const defs: Record<CardId, any> = {
    fat: {
      label: 'Faturamento',
      onClick: () => setDrillCanais('faturamento'),
      contexto: brl(K.faturamento) + ' · ver por canal',
      valor: comp(K.faturamento),
      Icone: TrendingUp,
      tom: (K.faturamento_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'Meta', valor: K.faturamento_ating ?? null, comparado: comp(K.meta_venda) },
        { label: 'A.A.', valor: K.faturamento_aa ?? null, comparado: comp(K.faturamento_aa_valor) },
      ],
    },
    qtd: {
      label: 'Qtde / Kg',
      // item 2: os cards de métrica abrem a MESMA composição por canal,
      // com os níveis Empresa→AD_SELECIONADO (distribuição) e
      // Bandeira→Loja (varejo).
      onClick: () => setDrillCanais('faturamento'),
      valor: comp(K.quantidade_kg),
      Icone: Package,
      tom: (K.quantidade_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [{ label: 'A.A.', valor: K.quantidade_aa ?? null, comparado: 'ano anterior' }],
    },
    preco: {
      label: 'Preço Médio',
      onClick: () => setDrillCanais('faturamento'),
      valor: brl(K.preco_medio, 2),
      Icone: Tag,
      tom: (K.preco_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [{ label: 'A.A.', valor: K.preco_aa ?? null, comparado: 'ano anterior' }],
    },
    cupons: {
      label: 'Cupons',
      onClick: () => setDrillCanais('faturamento'),
      valor: n(K.cupons),
      Icone: Receipt,
      tom: (K.cupons_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [{ label: 'A.A.', valor: K.cupons_aa ?? null, comparado: 'ano anterior' }],
    },
    ticket: {
      label: 'Ticket Médio',
      onClick: () => setDrillCanais('faturamento'),
      valor: brl(K.ticket_medio, 2),
      Icone: Ticket,
      tom: (K.ticket_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [{ label: 'A.A.', valor: K.ticket_aa ?? null, comparado: 'ano anterior' }],
    },
    cmv: {
      label: 'CMV Parcial',
      valor: pct(K.cmv_pct),
      Icone: Percent,
      tom: (K.cmv_ating ?? 0) <= 100 ? 'green' : 'red',
      vars: [
        { label: 'vs Orç', valor: K.cmv_ating ?? null, inverso: true, comparado: pct(K.meta_cmv) },
      ],
    },
    quebra: {
      label: 'Quebra',
      // 20/11/2026 — item 2d do dono: o card Quebra abre a composição
      // agrupada em níveis (Rede → Bandeira → Loja → Item), cada nível
      // abrindo só ao clique, com as colunas do próprio nível.
      onClick: () => {
        setDrillQuebra(true)
        setDrillAberto(['qr:canal', 'qr:Carone'])
      },
      valor: pct(K.quebra_pct),
      Icone: AlertTriangle,
      tom: (K.quebra_ating ?? 0) <= 100 ? 'green' : 'red',
      vars: [
        {
          label: 'vs Limite',
          valor: K.quebra_ating ?? null,
          inverso: true,
          comparado: pct(K.limite_perda),
        },
      ],
    },
    lojas: {
      label: 'Lojas',
      onClick: () => setDrillCanais('faturamento'),
      valor: n(K.nLojas),
      Icone: Store,
      tom: 'blue',
      vars: [],
    },
  }

  const cardsVis = cards.ordem.filter((id) => !cards.ocultos.includes(id))
  const ordemBlocos = (Object.keys(layout) as Bloco[]).sort((a, b) => layout[a] - layout[b])

  const barraBloco = (b: Bloco, idx: number) => (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[9px] uppercase tracking-wider" style={{ color: T.muted }}>
        {b === 'cards' ? 'indicadores' : b === 'grade' ? 'grade' : 'gráfico'}
      </span>
      <span className="flex-1 h-px" style={{ background: T.border }} />
      <button
        draggable
        onDragStart={() => setArrastandoBloco(b)}
        onDragEnd={() => setArrastandoBloco(null)}
        title="Arraste para reposicionar"
        className="px-1 rounded border text-[9px] inline-flex items-center gap-0.5 cursor-grab opacity-60 hover:opacity-100"
        style={{ borderColor: T.border, color: T.muted, background: T.card }}
      >
        <GripVertical className="h-2.5 w-2.5" /> mover
      </button>
      <button
        type="button"
        onClick={() => moverBloco(b, -1)}
        disabled={idx === 0}
        title="Mover para cima"
        className="px-1 py-0.5 rounded border disabled:opacity-30"
        style={{ borderColor: T.border, color: T.muted, background: T.card }}
      >
        <ArrowUp className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        onClick={() => moverBloco(b, 1)}
        disabled={idx === ordemBlocos.length - 1}
        title="Mover para baixo"
        className="px-1 py-0.5 rounded border disabled:opacity-30"
        style={{ borderColor: T.border, color: T.muted, background: T.card }}
      >
        <ArrowDown className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          const oc = blocosOcultos.includes(b)
          const nv = oc ? blocosOcultos.filter((x) => x !== b) : blocosOcultos.concat([b])
          setBlocosOcultos(nv)
          gravarPref(uid, 'blocosOcultos', nv)
        }}
        title={blocosOcultos.includes(b) ? 'Reexibir este bloco' : 'Ocultar este bloco'}
        className="px-1 py-0.5 rounded border inline-flex items-center"
        style={{
          borderColor: blocosOcultos.includes(b) ? T.nav : T.border,
          color: blocosOcultos.includes(b) ? T.nav : T.muted,
          background: T.card,
        }}
      >
        {blocosOcultos.includes(b) ? (
          <Eye className="h-2.5 w-2.5" />
        ) : (
          <EyeOff className="h-2.5 w-2.5" />
        )}
      </button>
    </div>
  )

  const blocoCards = (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 items-stretch">
      {cardsVis.map((id) => {
        const d = defs[id]
        return (
          <Card
            key={id}
            {...d}
            arrastando={arrastandoCard === id}
            onDragStart={() => setArrastandoCard(id)}
            onDragOver={(e: any) => e.preventDefault()}
            onDrop={() => setArrastandoCard(null)}
            onMover={(dir: number) => moverCard(id, dir as -1 | 1)}
            onOcultar={() => {
              const nv = { ...cards, ocultos: cards.ocultos.concat([id]) }
              setCards(nv)
              gravarPref(uid, 'cardsOcultos', nv.ocultos)
            }}
          />
        )
      })}
    </div>
  )

  const blocoGrafico = (
    <div
      className={cn(
        'bg-white border p-3.5 flex flex-col',
        cheio('grafico') && 'fixed inset-2 z-50 shadow-2xl',
      )}
      style={{ borderColor: T.border, borderRadius: 8 }}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value)}
              className="text-[14px] font-semibold bg-transparent border-none outline-none cursor-pointer pr-5 appearance-none"
              style={{ color: T.text }}
            >
              {METRICAS.map((m) => (
                <option key={m.id} value={m.id}>
                  Evolução {m.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="h-3.5 w-3.5 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: T.muted }}
            />
          </div>
          <span
            className="text-[10px] font-semibold rounded px-1.5 py-0.5 border"
            style={{ background: T.tintAmber, borderColor: '#fde68a', color: T.warn }}
          >
            parcial
          </span>
        </div>
        <button
          type="button"
          onClick={() => setTelaCheia(cheio('grafico') ? null : 'grafico')}
          className="inline-flex items-center justify-center h-7 w-7 rounded border"
          style={{ borderColor: T.border, color: T.text, background: T.card }}
        >
          {cheio('grafico') ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className={cn('w-full', cheio('grafico') ? 'flex-1 min-h-0' : 'h-[250px]')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={seriePivot} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="mes" tickLine={false} tick={{ fill: T.muted, fontSize: 10 }} />
            <YAxis
              tickLine={false}
              tick={{ fill: T.muted, fontSize: 10 }}
              tickFormatter={(v) => (defM.tipo === 'num' ? n(v) : comp(v))}
            />
            <Tooltip formatter={(v: any) => (defM.tipo === 'num' ? n(v) : brl(v, 2))} />
            <Legend
              onClick={(e: any) => {
                const nn = String(e?.dataKey ?? '')
                if (!nn) return
                setAnosOcultos((p) => (p.includes(nn) ? p.filter((x) => x !== nn) : p.concat([nn])))
              }}
              wrapperStyle={{ fontSize: 10, cursor: 'pointer' }}
            />
            {anos.map((a, i) => (
              <Line
                key={a}
                type="monotone"
                dataKey={a}
                name={a}
                hide={anosOcultos.includes(a)}
                stroke={i === anos.length - 1 ? T.pos : i === 0 ? '#2563eb' : '#94a3b8'}
                strokeWidth={i === anos.length - 1 ? 2.5 : 2}
                dot={{ r: 2 }}
                connectNulls={i !== anos.length - 1}
              />
            ))}
            {anos.length > 0 && (
              <Line
                type="monotone"
                dataKey={anos[anos.length - 1] + ' parcial'}
                name={anos[anos.length - 1] + ' parcial'}
                stroke="#ea580c"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 2 }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  const blocoGrade = (
    <div
      className={cn(
        'bg-white border flex flex-col',
        cheio('grade') && 'fixed inset-2 z-50 shadow-2xl',
      )}
      style={{
        borderColor: T.border,
        borderRadius: 8,
        maxHeight: cheio('grade') ? 'calc(100vh - 16px)' : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14px] font-semibold" style={{ color: T.text }}>
            Desempenho por loja
          </h2>
          <span className="text-[11px]" style={{ color: T.muted }}>
            {lojasFiltradas.length} unidades
          </span>
          {filtrado && (
            <button
              type="button"
              onClick={() => setSelecionadas([])}
              className="text-[10px] px-1.5 py-0.5 rounded border"
              style={{ borderColor: T.border, color: T.nav }}
            >
              {selecionadas.length} selecionada(s) · limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative hidden sm:block">
            <Search
              className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: T.muted }}
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar loja"
              className="h-7 w-32 rounded border pl-6 pr-2 text-[11px] outline-none"
              style={{ background: T.input, borderColor: T.border, color: T.text }}
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuColunas((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded border text-[11px] font-semibold"
              style={{ borderColor: T.border, color: T.text, background: T.card }}
            >
              <Columns3 className="h-3 w-3" /> Colunas{' '}
              <ChevronDown className="h-3 w-3" style={{ color: T.muted }} />
            </button>
            {menuColunas && (
              <div
                className="absolute right-0 top-full mt-1 z-50 bg-white border shadow-lg p-2 w-60 max-h-72 overflow-y-auto"
                style={{ borderColor: T.border, borderRadius: 8 }}
              >
                {COLUNAS.map((c) => {
                  const oc = colOcultas.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-1.5 py-1 rounded text-[11px] cursor-pointer hover:bg-gray-50"
                      style={{ color: T.text }}
                    >
                      <input
                        type="checkbox"
                        checked={!oc}
                        onChange={() => {
                          const nv = oc
                            ? colOcultas.filter((x) => x !== c.id)
                            : colOcultas.concat([c.id])
                          setColOcultas(nv)
                          gravarPref(uid, 'colunasOcultas', nv)
                        }}
                        className="h-3 w-3"
                      />
                      {oc ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" style={{ color: T.pos }} />
                      )}
                      <span className="truncate">{c.label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table
          className="w-full"
          style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}
        >
          <thead>
            <tr style={{ background: T.input }}>
              {colVisiveis.map((c) => (
                <th
                  key={c.id}
                  className="text-[9px] font-bold uppercase px-1.5 py-1.5 select-none relative"
                  style={{
                    color: T.muted,
                    width: largura(c),
                    minWidth: largura(c),
                    textAlign: c.al,
                    borderBottom: '1px solid ' + T.border,
                  }}
                >
                  <span
                    className="inline-flex items-center gap-0.5 cursor-pointer"
                    onClick={() => ordenarPor(c.id)}
                  >
                    {c.label}
                    {ordem?.id === c.id && <span>{ordem.dir === 'desc' ? '▼' : '▲'}</span>}
                  </span>
                  <span
                    onMouseDown={(e) => {
                      redim.current = { id: c.id, ini: e.clientX, w: largura(c) }
                      document.body.style.cursor = 'col-resize'
                    }}
                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize"
                    style={{ background: 'transparent' }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const chRede = 'r:' + g.rede
              const abertoRede = !fechados.includes(chRede)
              return (
                <Fragment key={chRede}>
                  <tr style={{ background: '#f8fafc', borderTop: '1px solid ' + T.border }}>
                    <td
                      colSpan={colVisiveis.length}
                      className="px-1.5 py-1 text-[11px] font-bold"
                      style={{ color: T.text }}
                    >
                      <button type="button" onClick={() => alternar(chRede)}>
                        {abertoRede ? '−' : '+'} {g.rede}
                      </button>
                      <span className="ml-2 font-normal" style={{ color: T.muted }}>
                        {g.nLojas} lojas · {brl(g.total.faturamento)} · {pct(g.total.ating)}
                      </span>
                    </td>
                  </tr>
                  {abertoRede &&
                    g.bandeiras.map((b) => {
                      const chBan = chRede + '|' + b.chave
                      const abertoBan = !fechados.includes(chBan)
                      return (
                        <Fragment key={chBan}>
                          <tr style={{ borderTop: '1px solid ' + T.border }}>
                            <td
                              colSpan={colVisiveis.length}
                              className="px-1.5 py-1 pl-4 text-[11px] font-semibold"
                              style={{ color: T.text }}
                            >
                              <button type="button" onClick={() => alternar(chBan)}>
                                {abertoBan ? '−' : '+'} {b.label}
                              </button>
                              <span className="ml-2 font-normal" style={{ color: T.muted }}>
                                {b.lojas.length} lojas · {brl(b.total.faturamento)}
                              </span>
                            </td>
                          </tr>
                          {abertoBan &&
                            b.lojas.map((l) => (
                              <tr
                                key={l.codparc}
                                style={{
                                  borderTop: '1px solid ' + T.border,
                                  background: selecionadas.includes(l.codparc)
                                    ? T.tintGreen
                                    : undefined,
                                }}
                              >
                                {colVisiveis.map((c) => (
                                  <td
                                    key={c.id}
                                    className="px-1.5 py-1 text-[11px] tabular-nums truncate"
                                    style={{
                                      color: T.text,
                                      textAlign: c.al,
                                      width: largura(c),
                                      minWidth: largura(c),
                                    }}
                                    onClick={() => c.id === 'loja' && altLinha(l.codparc)}
                                  >
                                    {c.id === 'loja' ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span
                                          className="text-[9px] px-1 rounded"
                                          style={{
                                            background: l.loja_nova ? T.tintAmber : T.tintGreen,
                                            color: l.loja_nova ? T.warn : T.pos,
                                          }}
                                        >
                                          {l.loja_nova ? 'NSS' : 'SSS'}
                                        </span>
                                        {l.loja}
                                      </span>
                                    ) : (
                                      celula(c, valorDaLoja(c, l))
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </Fragment>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  const temComposicao = Object.keys(itensPorLoja).length > 0
  const alternarDrill = (ch: string) =>
    setDrillAberto((p: string[]) => (p.includes(ch) ? p.filter((x) => x !== ch) : p.concat([ch])))

  // ==========================================================================
  // 20/11/2026 — ITEM 2d DO DONO: cada nível da quebra é uma LINHA DE TABELA
  // com as suas colunas, não um botão solto.
  //
  // PEDIDO LITERAL: "exibindo na linha do nível as colunas qtd de itens,
  // valor total, % quebra, o nível que exibe os itens deve exibir as colunas
  // qtd, valor uni, valor total, % quebra".
  //
  // REGRA DE HONESTIDADE DO CÁLCULO: o valor e a % de um nível só podem sair
  // dos ITENS já carregados daquele ramo. Enquanto as lojas não foram abertas,
  // o detalhe não existe no cliente — então a linha mostra o valor da GRADE
  // (que sempre vem) e a % da grade, e NUNCA um zero inventado. O rótulo diz
  // de onde veio.
  // ==========================================================================
  const resumoNivel = (lojasDoNivel: any[]) => {
    let itens = 0
    let valorItens = 0
    let qtdQuebra = 0
    let carga = 0
    let algumDetalhe = false
    let semInventario = 0
    for (const l of lojasDoNivel) {
      const det = itensCarregados[String(l.codparc)] || itensPorLoja[String(l.codparc)] || []
      if (det.length > 0) {
        algumDetalhe = true
        itens += det.length
        for (const x of det) {
          valorItens += Number(x.vlr_quebra) || 0
          qtdQuebra += Number(x.qtd_quebra) || 0
          carga += Number(x.ei || 0) + Number(x.recebido || 0) - Number(x.ef || 0) || 0
        }
      } else if (!l.quebra_valor && !l.quebra) {
        semInventario += 1
      }
    }
    // fallback: valor da GRADE quando o detalhe ainda não foi aberto
    const valorGrade = lojasDoNivel.reduce((a, l) => a + (Number(l.quebra_valor) || 0), 0)
    const valor = algumDetalhe ? valorItens : valorGrade
    // % do nível: usa a carga real quando há detalhe; senão a % da grade
    const pctNivel = algumDetalhe
      ? carga > 0
        ? Number(((qtdQuebra / carga) * 100).toFixed(2))
        : null
      : lojasDoNivel.length
        ? Number(
            (
              lojasDoNivel.reduce((a, l) => a + (Number(l.quebra) || 0), 0) / lojasDoNivel.length
            ).toFixed(2),
          )
        : null
    return {
      itens: algumDetalhe ? itens : null,
      valor,
      perc: pctNivel,
      algumDetalhe,
      semInventario,
      nLojas: lojasDoNivel.length,
    }
  }

  // MODAL: COMPOSIÇÃO DO FATURAMENTO / CMV POR CANAL
  const modalCanais = drillCanais ? (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={() => setDrillCanais(null)}
    >
      <div
        className="bg-white w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ borderRadius: 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: T.border }}
        >
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: T.text }}>
              {drillCanais === 'cmv' ? 'Composição do CMV' : 'Composição do Faturamento'} por canal
            </h3>
            <p className="text-[11px]" style={{ color: T.muted }}>
              {MESES[f.mes - 1]}/{f.ano} · Atacado (emp 1) · Distribuição (emp 4 e 10, sem Carone e
              Coutinho) · Varejo (redes)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrillCanais(null)}
            className="p-1"
            style={{ color: T.muted }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {carregandoCanais && (
            <p className="px-3 py-6 text-center text-[12px]" style={{ color: T.muted }}>
              carregando a composição por canal…
            </p>
          )}
          {!carregandoCanais && dadosCanais && dadosCanais.ok === false && (
            <p className="px-3 py-6 text-center text-[12px]" style={{ color: T.neg }}>
              Não foi possível carregar: {dadosCanais.erro || 'erro desconhecido'}
            </p>
          )}
          {!carregandoCanais && dadosCanais && dadosCanais.ok && (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: T.muted }}>
                  <th className="text-left font-semibold py-1.5">Canal</th>
                  <th
                    className="text-right font-semibold cursor-help"
                    title="Meta do canal, quando parametrizada no Sankhya."
                  >
                    Meta [R$]
                  </th>
                  <th className="text-right font-semibold">Realizado [R$]</th>
                  <th className="text-right font-semibold cursor-help" title="Realizado ÷ Meta">
                    % Meta
                  </th>
                  <th
                    className="text-right font-semibold cursor-help"
                    title="Variação contra o mesmo mês do ano anterior"
                  >
                    % A.A
                  </th>
                </tr>
              </thead>
              <tbody>
                {(dadosCanais.canais || []).map((c: any) => {
                  // Varejo -> Bandeira -> Loja | Distribuição -> Empresa -> AD_SELECIONADO
                  const ehVarejo = c.canal === 'Varejo'
                  const ehDistrib = c.canal === 'Distribuição'
                  const chaveC = 'can:' + c.canal
                  const abertoC = drillAberto.includes(chaveC)
                  const niveis1: any[] = ehVarejo
                    ? dadosCanais.hierarquia?.varejo_bandeiras || []
                    : ehDistrib
                      ? dadosCanais.hierarquia?.distrib_empresas || []
                      : []
                  const itensNivel2: any[] = ehVarejo
                    ? dadosCanais.hierarquia?.varejo || []
                    : ehDistrib
                      ? dadosCanais.hierarquia?.distribuicao || []
                      : []

                  const celulas = (linha: any) => {
                    const m = linha.meta
                    const pm = linha.perc_meta
                    return (
                      <>
                        <td
                          className="text-right tabular-nums"
                          style={{ color: m ? T.text : T.muted }}
                          title={m ? undefined : 'Sem meta para este nível'}
                        >
                          {m ? brl(m) : '—'}
                        </td>
                        <td
                          className="text-right tabular-nums font-semibold"
                          style={{ color: T.text }}
                        >
                          {brl(linha.realizado)}
                        </td>
                        <td
                          className="text-right tabular-nums"
                          style={{ color: pm ? T.text : T.muted }}
                        >
                          {pm === null || pm === undefined ? '—' : pct(pm)}
                        </td>
                        <td className="text-right tabular-nums" style={{ color: T.muted }}>
                          —
                        </td>
                      </>
                    )
                  }

                  return (
                    <Fragment key={c.canal}>
                      <tr className="border-t" style={{ borderColor: T.border }}>
                        <td className="py-1.5 font-semibold" style={{ color: T.text }}>
                          {niveis1.length > 0 && (
                            <button
                              type="button"
                              onClick={() => alternarDrill(chaveC)}
                              className="inline-flex items-center justify-center h-3.5 w-3.5 mr-1 rounded border text-[9px] font-bold align-middle"
                              style={{ borderColor: T.border, color: T.muted }}
                              title={
                                ehVarejo
                                  ? 'Expandir Bandeira → Loja'
                                  : 'Expandir Empresa → AD_SELECIONADO'
                              }
                            >
                              {abertoC ? '−' : '+'}
                            </button>
                          )}
                          {c.canal}
                        </td>
                        <td
                          className="text-right tabular-nums"
                          style={{ color: c.meta ? T.text : T.muted }}
                          title={c.meta_fonte || 'Sem meta parametrizada'}
                        >
                          {c.meta ? brl(c.meta) : '—'}
                        </td>
                        <td
                          className="text-right tabular-nums font-semibold"
                          style={{ color: c.sem_fonte ? T.muted : T.text }}
                          title={c.sem_fonte ? c.obs || 'Sem fonte no Sankhya' : undefined}
                        >
                          {c.sem_fonte ? '—' : brl(c.realizado)}
                        </td>
                        <td
                          className="text-right tabular-nums"
                          style={{ color: c.perc_meta ? T.text : T.muted }}
                        >
                          {c.perc_meta === null || c.perc_meta === undefined
                            ? '—'
                            : pct(c.perc_meta)}
                        </td>
                        <td
                          className="text-right tabular-nums font-semibold"
                          style={{ color: (c.variacao_aa ?? 0) >= 0 ? T.pos : T.neg }}
                        >
                          {c.variacao_aa === null || c.variacao_aa === undefined
                            ? '—'
                            : (c.variacao_aa >= 0 ? '+' : '') + pct(c.variacao_aa)}
                        </td>
                      </tr>

                      {abertoC &&
                        niveis1.map((n1: any) => {
                          const chaveN1 = chaveC + '|n1|' + n1.nome
                          const abertoN1 = drillAberto.includes(chaveN1)
                          const filhos = ehVarejo
                            ? itensNivel2.filter((x: any) => x.bandeira === n1.nome)
                            : itensNivel2.filter((x: any) => x.rede === n1.nome)
                          return (
                            <Fragment key={chaveN1}>
                              <tr className="border-t bg-gray-50" style={{ borderColor: T.border }}>
                                <td
                                  className="py-1 pl-5 text-[11px] font-medium"
                                  style={{ color: T.text }}
                                >
                                  {filhos.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => alternarDrill(chaveN1)}
                                      className="inline-flex items-center justify-center h-3 w-3 mr-1 rounded border text-[8px] font-bold align-middle"
                                      style={{ borderColor: T.border, color: T.muted }}
                                    >
                                      {abertoN1 ? '−' : '+'}
                                    </button>
                                  )}
                                  <span style={{ color: T.muted }}>└ </span>
                                  {n1.nome}
                                  <span className="text-[9px] ml-1" style={{ color: T.muted }}>
                                    ({n1.itens} {ehVarejo ? 'lojas' : 'redes'})
                                  </span>
                                </td>
                                {celulas(n1)}
                              </tr>
                              {abertoN1 &&
                                filhos
                                  .slice()
                                  .sort(
                                    (a: any, b: any) =>
                                      (Number(b.realizado) || 0) - (Number(a.realizado) || 0),
                                  )
                                  .map((f: any) => (
                                    <tr key={chaveN1 + '|' + (f.codparc || f.ad_selecionado)}>
                                      <td
                                        className="py-0.5 pl-10 text-[10px]"
                                        style={{ color: T.text }}
                                      >
                                        <span style={{ color: T.muted }}>· </span>
                                        {ehVarejo
                                          ? f.loja
                                          : (f.empresa || '') +
                                            ' / ' +
                                            (f.ad_selecionado === 0 || f.ad_selecionado === null
                                              ? 'Sem seleção'
                                              : 'AD_SEL ' + f.ad_selecionado)}
                                      </td>
                                      {celulas(f)}
                                    </tr>
                                  ))}
                            </Fragment>
                          )
                        })}
                    </Fragment>
                  )
                })}
                <tr className="border-t font-bold" style={{ borderColor: T.border, color: T.text }}>
                  <td className="py-1.5">Total</td>
                  <td className="text-right tabular-nums" style={{ color: T.muted }}>
                    —
                  </td>
                  <td className="text-right tabular-nums">{brl(dadosCanais.total?.realizado)}</td>
                  <td className="text-right tabular-nums" style={{ color: T.muted }}>
                    —
                  </td>
                  <td className="text-right tabular-nums">
                    {dadosCanais.total?.anterior > 0
                      ? (dadosCanais.total.realizado >= dadosCanais.total.anterior ? '+' : '') +
                        pct(
                          ((dadosCanais.total.realizado - dadosCanais.total.anterior) /
                            dadosCanais.total.anterior) *
                            100,
                        )
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div
          className="px-4 py-2 border-t text-[10px]"
          style={{ borderColor: T.border, color: T.muted }}
        >
          Meta: Atacado de AD_ITEMETASATACADO e Varejo de EF_VIEW_METAS_LOJAS. Distribuição não tem
          meta parametrizada no Sankhya — exibida como — em vez de estimada.
        </div>
      </div>
    </div>
  ) : null

  const modalQuebra = drillQuebra ? (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={() => setDrillQuebra(false)}
    >
      <div
        className="bg-white w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ borderRadius: 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: T.border }}
        >
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: T.text }}>
              Composição da Quebra
            </h3>
            <p className="text-[11px]" style={{ color: T.muted }}>
              {nomeCanal} · {MESES[f.mes - 1]}/{f.ano} · Rede → Bandeira → Loja → Produto
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrillQuebra(false)}
            className="p-1"
            style={{ color: T.muted }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {grupos.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px]" style={{ color: T.muted }}>
              Nenhuma loja com quebra apurada no período e filtros selecionados. A composição por
              produto depende da contagem de inventário (AD_ITEINVENTARIO) — nada é estimado.
            </div>
          )}
          {(() => {
            const chCanal = 'qr:canal'
            const abCanal = drillAberto.includes(chCanal)
            const totItens = grupos.reduce(
              (a, g) =>
                a +
                g.bandeiras.reduce(
                  (b, bd) =>
                    b +
                    bd.lojas.reduce(
                      (c, l) => c + (itensCarregados[String(l.codparc)] || []).length,
                      0,
                    ),
                  0,
                ),
              0,
            )
            const totValor = grupos.reduce(
              (a, g) =>
                a +
                g.bandeiras.reduce(
                  (b, bd) =>
                    b +
                    bd.lojas.reduce((c, l) => {
                      const det = itensCarregados[String(l.codparc)] || []
                      const v =
                        det.length > 0
                          ? det.reduce((d2, x: any) => d2 + (Number(x.valor) || 0), 0)
                          : Number(l.quebra_valor) || 0
                      return c + v
                    }, 0),
                  0,
                ),
              0,
            )
            return (
              <div className="mb-1">
                <button
                  type="button"
                  onClick={() => alternarDrill(chCanal)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left"
                  style={{ background: '#dbe7ee' }}
                >
                  <span
                    className="inline-flex items-center justify-center h-4 w-4 rounded border text-[11px] font-bold"
                    style={{ borderColor: T.border, color: T.muted }}
                  >
                    {abCanal ? '−' : '+'}
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: T.text }}>
                    Varejo (Redes)
                  </span>
                  <span className="text-[10px] ml-auto tabular-nums" style={{ color: T.muted }}>
                    {totItens > 0 ? totItens + ' itens · ' : ''}
                    {brl(totValor)}
                  </span>
                </button>
                {abCanal && (
                  <p className="ml-6 px-2 py-1 text-[10px]" style={{ color: T.muted }}>
                    Quebra por inventário existe apenas para o varejo (contagem por loja). Atacado e
                    distribuição não têm inventário por loja no Sankhya.
                  </p>
                )}
              </div>
            )
          })()}
          {grupos.map((g) => {
            const chR = 'qr:' + g.rede
            const abR = drillAberto.includes(chR)
            const itensRede = g.bandeiras.flatMap((b) =>
              b.lojas.flatMap(
                (l) => itensCarregados[String(l.codparc)] || itensPorLoja[String(l.codparc)] || [],
              ),
            )
            const valorRede = g.bandeiras.reduce(
              (a, b) => a + b.lojas.reduce((c, l) => c + (Number(l.quebra_valor) || 0), 0),
              0,
            )
            void itensRede
            void totRede
            void valorRede
            const rR = resumoNivel(g.bandeiras.flatMap((b) => b.lojas))
            return (
              <div key={chR} className="mb-1">
                {/* item 2d: linha do nível REDE com colunas próprias */}
                <table className="w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
                  <tbody>
                    <tr style={{ background: '#eef2f5' }}>
                      <td className="px-1 py-1" style={{ width: '36%' }}>
                        <button
                          type="button"
                          onClick={() => alternarDrill(chR)}
                          className="flex items-center gap-1.5 text-left w-full"
                        >
                          <span
                            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded border text-[9px] font-bold shrink-0"
                            style={{ borderColor: T.border, color: T.muted }}
                          >
                            {abR ? '−' : '+'}
                          </span>
                          <span className="font-bold truncate" style={{ color: T.text }}>
                            {g.rede}
                          </span>
                          <span className="text-[9px] shrink-0" style={{ color: T.muted }}>
                            ({rR.nLojas} lojas)
                          </span>
                        </button>
                      </td>
                      <td
                        className="px-1 py-1 text-right tabular-nums"
                        style={{ color: rR.itens === null ? T.muted : T.text }}
                        title="Qtd de itens com quebra neste nível (só conta o que já foi carregado)"
                      >
                        {rR.itens === null ? '—' : n(rR.itens)}
                      </td>
                      <td
                        className="px-1 py-1 text-right tabular-nums font-semibold"
                        style={{ color: T.text }}
                        title={
                          rR.algumDetalhe
                            ? 'Soma de Valor Quebra dos itens carregados'
                            : 'Valor da grade (abra a loja para o detalhe por item)'
                        }
                      >
                        {brl(rR.valor)}
                      </td>
                      <td
                        className="px-1 py-1 text-right tabular-nums font-semibold"
                        style={{ color: T.neg }}
                        title="% Quebra do nível = Qtd Quebra ÷ (EI + Recebido − EF)"
                      >
                        {rR.perc === null ? '—' : pct(rR.perc)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {abR &&
                  g.bandeiras.map((b) => {
                    const chB = chR + '|' + b.chave
                    const abB = drillAberto.includes(chB)
                    const itensB = b.lojas.flatMap(
                      (l) =>
                        itensCarregados[String(l.codparc)] || itensPorLoja[String(l.codparc)] || [],
                    )
                    void itensB
                    const rB = resumoNivel(b.lojas)
                    return (
                      <div key={chB} className="ml-3">
                        {/* item 2d: linha do nível BANDEIRA com as mesmas colunas */}
                        <table className="w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
                          <tbody>
                            <tr style={{ background: T.input }}>
                              <td className="px-1 py-1" style={{ width: '36%' }}>
                                <button
                                  type="button"
                                  onClick={() => alternarDrill(chB)}
                                  className="flex items-center gap-1.5 text-left w-full"
                                >
                                  <span
                                    className="inline-flex items-center justify-center h-3 w-3 rounded border text-[8px] font-bold shrink-0"
                                    style={{ borderColor: T.border, color: T.muted }}
                                  >
                                    {abB ? '−' : '+'}
                                  </span>
                                  <span
                                    className="font-semibold truncate"
                                    style={{ color: T.text }}
                                  >
                                    {b.label}
                                  </span>
                                  <span className="text-[9px] shrink-0" style={{ color: T.muted }}>
                                    ({rB.nLojas} lojas)
                                  </span>
                                </button>
                              </td>
                              <td
                                className="px-1 py-1 text-right tabular-nums"
                                style={{ color: rB.itens === null ? T.muted : T.text }}
                              >
                                {rB.itens === null ? '—' : n(rB.itens)}
                              </td>
                              <td
                                className="px-1 py-1 text-right tabular-nums font-semibold"
                                style={{ color: T.text }}
                              >
                                {brl(rB.valor)}
                              </td>
                              <td
                                className="px-1 py-1 text-right tabular-nums font-semibold"
                                style={{ color: T.neg }}
                              >
                                {rB.perc === null ? '—' : pct(rB.perc)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {abB &&
                          b.lojas.map((l) => {
                            const chL = chB + '|' + l.codparc
                            const abL = drillAberto.includes(chL)
                            const itens =
                              itensCarregados[String(l.codparc)] ||
                              itensPorLoja[String(l.codparc)] ||
                              []
                            const tot = itens.reduce((a, x) => a + (Number(x.valor) || 0), 0)
                            return (
                              <div key={chL} className="ml-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!abL) void carregarComposicao(l.codparc)
                                    alternarDrill(chL)
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-gray-50"
                                >
                                  <span
                                    className="inline-flex items-center justify-center h-3 w-3 rounded border text-[8px] font-bold"
                                    style={{ borderColor: T.border, color: T.muted }}
                                  >
                                    {abL ? '−' : '+'}
                                  </span>
                                  <span className="text-[11px]" style={{ color: T.text }}>
                                    {l.loja}
                                  </span>
                                </button>
                                {/* item 2d: colunas do nível LOJA */}
                                <div className="ml-4 flex items-center gap-2 px-1 pb-0.5 text-[10px]">
                                  <span
                                    className="tabular-nums"
                                    style={{ color: itens.length ? T.text : T.muted }}
                                    title="Qtd de itens com quebra nesta loja"
                                  >
                                    {itens.length > 0 ? n(itens.length) + ' itens' : '— itens'}
                                  </span>
                                  <span
                                    className="ml-auto tabular-nums font-semibold"
                                    style={{ color: T.text }}
                                  >
                                    {brl(itens.length > 0 ? tot : l.quebra_valor || 0)}
                                  </span>
                                  <span
                                    className="tabular-nums font-semibold w-14 text-right"
                                    style={{ color: T.neg }}
                                  >
                                    {pct(l.quebra)}
                                  </span>
                                </div>

                                {abL && carregandoLoja === String(l.codparc) && (
                                  <div
                                    className="ml-6 px-2 py-1.5 text-[10px] flex items-center gap-1.5"
                                    style={{ color: T.muted }}
                                  >
                                    <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                    carregando a composição da loja…
                                  </div>
                                )}
                                {abL &&
                                  carregandoLoja !== String(l.codparc) &&
                                  itens.length === 0 && (
                                    <div
                                      className="ml-6 px-2 py-1 text-[10px]"
                                      style={{ color: T.muted }}
                                    >
                                      {erroComposicao || 'sem inventário lançado nesse mês'}
                                    </div>
                                  )}
                                {abL && itens.length > 0 && (
                                  <table className="ml-6 my-1 w-[calc(100%-1.5rem)] text-[11px]">
                                    <thead>
                                      <tr style={{ color: T.muted }}>
                                        <th className="text-left font-semibold py-0.5">Produto</th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Estoque Inicial — AD_CABINVENTARIO + AD_ITEINVENTARIO, último inventário fechado do produto ANTES do mês. Produto não contado = 0."
                                        >
                                          EI
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Recebido — TGFCAB + TGFITE + TGFTOP (TIPMOV V/D), notas liberadas no mês."
                                        >
                                          Recebido
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Estoque Final — último inventário fechado do produto DENTRO do mês. Produto não contado = 0."
                                        >
                                          EF
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Vendas — AD_VENDASPLV (SUM(QTDNEG) por loja e produto) no mês. Mesma base do BI Acompanhamento Varejo."
                                        >
                                          Vendas
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Consumo — AD_CABCONSUMO + AD_ITECONSUMO no mês."
                                        >
                                          Consumo
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Qtd Quebra = (EI + Recebido − EF) − Vendas − Consumo."
                                        >
                                          Qtd Quebra
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="% Quebra = Qtd Quebra ÷ (EI + Recebido − EF). Vazio quando a base é zero."
                                        >
                                          % Quebra
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Custo Unit — AD_ITEINVENTARIO.CUSTO do último inventário."
                                        >
                                          Custo Unit
                                        </th>
                                        <th
                                          className="text-right font-semibold cursor-help"
                                          title="Valor Quebra = Qtd Quebra × Custo Unit."
                                        >
                                          Valor Quebra
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {itens
                                        .slice()
                                        .sort(
                                          (a: any, b: any) =>
                                            (Number(b.vlr_quebra) || 0) -
                                            (Number(a.vlr_quebra) || 0),
                                        )
                                        .slice(0, 40)
                                        .map((it: any) => (
                                          <tr
                                            key={it.codprod}
                                            className="border-t"
                                            style={{ borderColor: T.border }}
                                          >
                                            <td
                                              className="py-0.5 truncate max-w-[280px]"
                                              style={{ color: T.text }}
                                              title={it.produto}
                                            >
                                              {it.produto}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {n(it.ei, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {n(it.recebido, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {n(it.ef, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {n(it.vendas, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {n(it.consumo, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums font-semibold"
                                              style={{ color: T.neg }}
                                            >
                                              {n(it.qtd_quebra, 0)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.text }}
                                            >
                                              {it.perc_quebra_estoque === null ||
                                              it.perc_quebra_estoque === undefined
                                                ? '—'
                                                : pct(it.perc_quebra_estoque)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums"
                                              style={{ color: T.muted }}
                                            >
                                              {brl(it.custo_unit, 2)}
                                            </td>
                                            <td
                                              className="text-right tabular-nums font-semibold"
                                              style={{ color: T.text }}
                                            >
                                              {brl(it.vlr_quebra)}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
        <div
          className="px-4 py-2 border-t text-[10px] flex items-center justify-between"
          style={{ borderColor: T.border, color: T.muted }}
        >
          <span>
            Fontes: AD_CABINVENTARIO + AD_ITEINVENTARIO (EI/EF e custo) · TGFCAB + TGFITE + TGFTOP
            (recebido) · AD_VENDASPLV (vendas) · AD_CABCONSUMO + AD_ITECONSUMO (consumo).
          </span>
          <button type="button" onClick={() => setDrillQuebra(false)} className="underline">
            fechar
          </button>
        </div>
      </div>
    </div>
  ) : null

  const mapBlocos: Record<Bloco, any> = {
    cards: blocoCards,
    grade: blocoGrade,
    grafico: blocoGrafico,
  }

  return (
    <div className="space-y-3 pb-8" style={{ background: T.bg }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: T.text }}>
            Desempenho por Unidade
          </h1>
          <p className="text-[11px]" style={{ color: T.muted }}>
            {nomeCanal} · {MESES[f.mes - 1]}/{f.ano}
            {dados.do_cache && (
              <span className="ml-1.5">
                · {dados.stale ? 'cache antigo' : 'cache'} {dados.cache_idade_min ?? 0} min
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={() => {
              setParecerLoja(null)
              setParecerAberto(true)
            }}
            className="h-8 text-[11px] text-white"
            style={{ background: T.nav, borderRadius: 6 }}
          >
            <Sparkles className="h-3 w-3 mr-1" /> Parecer
          </Button>
          {pode('desempenho', 'atualizar') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregar(true)}
              disabled={loading}
              className={cn('h-8 text-[11px]', loading && 'animate-pulse')}
              style={{
                borderRadius: 6,
                borderColor: loading ? T.warn : undefined,
                color: loading ? T.warn : undefined,
                background: loading ? T.tintAmber : undefined,
              }}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
              {loading ? 'Atualizando' : 'Atualizar'}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border" style={{ borderColor: T.border, borderRadius: 8 }}>
        <div className="flex items-center gap-2 px-3 h-[50px] overflow-x-auto">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold shrink-0"
            style={{ color: T.text }}
          >
            <Filter className="h-3.5 w-3.5" style={{ color: T.nav }} /> Filtros
            {filtrosAbertos ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFiltrosAbertos((v) => !v)}
              className="px-2 py-1 rounded border text-[11px] font-semibold"
              style={{ borderColor: T.border, color: T.text, background: T.card }}
            >
              Mais filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
            </button>
            <button
              type="button"
              onClick={() =>
                setF({
                  aba: 'varejo',
                  ano: anoC,
                  mes: mesC,
                  rede: '',
                  tipoLoja: '',
                  tipoGrupo: '',
                  tipoVenda: '',
                  loja: '',
                  supervisor: '',
                })
              }
              className="text-[11px] hover:underline"
              style={{ color: T.muted }}
            >
              Limpar
            </button>
          </div>
        </div>
        {filtrosAbertos && (
          <>
            <div className="border-t" style={{ borderColor: T.border }} />
            <div className="px-3 py-2.5 flex flex-wrap gap-3 items-end">
              <Sel
                label="Canal"
                largura={230}
                value={f.aba}
                onChange={(v: any) => setCampo('aba', v)}
                options={CANAIS.map((c) => ({ v: c.id, l: c.label }))}
              />
              <Sel
                label="Ano"
                largura={90}
                value={String(f.ano)}
                onChange={(v: any) => setCampo('ano', Number(v))}
                options={[anoC - 2, anoC - 1, anoC, anoC + 1].map((a) => ({
                  v: String(a),
                  l: String(a),
                }))}
              />
              <Sel
                label="Mês"
                largura={110}
                value={String(f.mes)}
                onChange={(v: any) => setCampo('mes', Number(v))}
                options={MESES.map((m, i) => ({ v: String(i + 1), l: m.slice(0, 3) }))}
              />
              <Sel
                label="Rede"
                largura={130}
                value={f.aba === 'varejo' ? f.rede : ''}
                onChange={(v: any) => setCampo('rede', v)}
                options={f.aba === 'varejo' ? REDES : [{ v: '', l: '—' }]}
                disabled={f.aba !== 'varejo'}
              />
              <Sel
                label="Tipo Loja"
                largura={130}
                value={f.tipoLoja}
                onChange={(v: any) => setCampo('tipoLoja', v)}
                options={[
                  { v: '', l: 'Todas' },
                  { v: 'nova', l: 'NSS' },
                  { v: 'existente', l: 'SSS' },
                ]}
              />
              <Sel
                label="Bandeira"
                largura={150}
                value={f.tipoGrupo}
                onChange={(v: any) => setCampo('tipoGrupo', v)}
                options={carteiraBandeira}
                disabled={f.aba !== 'varejo'}
              />
              <Sel
                label="Tipo Venda"
                largura={135}
                value={f.tipoVenda}
                onChange={(v: any) => setCampo('tipoVenda', v)}
                options={[
                  { v: '', l: 'Todos' },
                  { v: 'loja', l: 'Stores' },
                  { v: 'ecommerce', l: 'Ecommerce' },
                ]}
              />
              <Sel
                label="Loja"
                largura={210}
                value={f.loja}
                onChange={(v: any) => setCampo('loja', v)}
                options={[
                  { v: '', l: 'Todas' },
                  ...(dados.lojas || []).map((l) => ({ v: String(l.codparc), l: l.loja })),
                ]}
              />
              <Sel
                label="Supervisor"
                largura={182}
                value={f.supervisor}
                onChange={(v: any) => setCampo('supervisor', v)}
                options={[
                  { v: '', l: 'Todos' },
                  ...(dados.supervisores || []).map((s) => ({
                    v: String(s.codparc),
                    l: s.qtd ? `${s.nome} (${s.qtd})` : s.nome,
                  })),
                ]}
              />
            </div>
          </>
        )}
      </div>

      {dados.aviso && (
        <div
          className="px-3 py-2 rounded-lg border text-[11px]"
          style={{ background: T.tintAmber, borderColor: '#fde68a', color: T.warn }}
        >
          {dados.aviso}
        </div>
      )}
      {filtrado && (
        <div
          className="px-3 py-1.5 rounded border text-[11px] flex items-center gap-2"
          style={{ background: T.tintGreen, borderColor: '#bbf7d0', color: T.pos }}
        >
          <span className="font-semibold">{selecionadas.length} loja(s) selecionada(s)</span>
          <button
            type="button"
            onClick={() => setSelecionadas([])}
            className="ml-auto text-[10px] underline"
            style={{ color: T.muted }}
          >
            limpar
          </button>
        </div>
      )}

      {ordemBlocos.map((b, idx) => (
        <div
          key={b}
          onDragOver={(e) => {
            if (arrastandoBloco) e.preventDefault()
          }}
          onDrop={(e) => {
            if (arrastandoBloco) {
              e.preventDefault()
              const nv = { ...layout } as any
              const a = layout[arrastandoBloco]
              nv[arrastandoBloco] = idx
              const outro = (Object.keys(layout) as Bloco[]).find(
                (x) => x !== arrastandoBloco && layout[x] === idx,
              )
              if (outro) nv[outro] = a
              setLayout(nv)
              gravarPref(uid, 'layout', nv)
              setArrastandoBloco(null)
            }
          }}
        >
          {barraBloco(b, idx)}
          {!blocosOcultos.includes(b) && <div>{mapBlocos[b]}</div>}
        </div>
      ))}

      {modalCanais}
      {modalQuebra}

      <ParceiroParecerDialog
        aberto={parecerAberto}
        onFechar={() => setParecerAberto(false)}
        abaLabel={nomeCanal}
        contexto={
          nomeCanal +
          ', ' +
          dados.periodo +
          '. Faturamento ' +
          brl(K.faturamento) +
          ', venda orçada ' +
          brl(K.meta_venda) +
          ' (atingimento ' +
          pct(K.faturamento_ating) +
          ')' +
          ', quantidade ' +
          n(K.quantidade_kg) +
          ', preço médio ' +
          brl(K.preco_medio, 2) +
          ', ticket médio ' +
          brl(K.ticket_medio, 2) +
          ', cupons ' +
          n(K.cupons) +
          ', lojas ' +
          n(K.nLojas) +
          ', funcionários ' +
          n(K.funcionarios) +
          '.'
        }
        loja={parecerLoja}
        contextoLoja={
          parecerLoja
            ? 'Loja ' +
              parecerLoja.loja +
              ' (rede ' +
              parecerLoja.rede +
              ', bandeira ' +
              (parecerLoja.bandeira || '—') +
              '). Faturamento ' +
              brl(parecerLoja.faturamento) +
              ', orçado ' +
              brl(parecerLoja.meta) +
              ' (atingimento ' +
              pct(parecerLoja.ating_venda) +
              '), A.A. ' +
              pct(parecerLoja.cresc_aa) +
              '.'
            : ''
        }
      />
    </div>
  )
}
