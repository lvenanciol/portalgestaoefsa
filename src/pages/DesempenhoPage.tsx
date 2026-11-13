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
  variacoes,
  arrastando,
  onDragStart,
  onDragOver,
  onDrop,
  onMover,
  onOcultar,
}: any) {
  const c = TONE[tom as Tom]
  return (
    <div
      draggable
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
        {(variacoes as VarItem[]).length === 0 && <span style={{ color: T.muted }}>—</span>}
        {(variacoes as VarItem[]).map((v, i) => {
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
  const maior = (options as any[]).reduce((m, o) => Math.max(m, String(o.l).length), label.length)
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
          {options.map((o: any) => (
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const [colOcultas, setColOcultas] = useState<string[]>(() => prefs.colunasOcultas || [])
  const [colLarg, setColLarg] = useState<Record<string, number>>(() => prefs.colunasLarg || {})
  const [menuColunas, setMenuColunas] = useState(false)
  const [ordem, setOrdem] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const redim = useRef<{ id: string; ini: number; w: number } | null>(null)

  const [cards, setCards] = useState<{ ordem: CardId[]; ocultos: CardId[] }>(() => ({
    ordem: (prefs.cardsOrdem as CardId[]) || [...CARDS],
    ocultos: (prefs.cardsOcultos as CardId[]) || [],
  }))
  const [layout, setLayout] = useState<Record<Bloco, number>>(
    () => prefs.layout || { cards: 0, grade: 1, grafico: 2 },
  )
  const [blocosOcultos, setBlocosOcultos] = useState<Bloco[]>(() => prefs.blocosOcultos || [])
  const [arrastandoCard, setArrastandoCard] = useState<CardId | null>(null)
  const [arrastandoBloco, setArrastandoBloco] = useState<Bloco | null>(null)

  const [fechados, setFechados] = useState<string[]>([])
  const [telaCheia, setTelaCheia] = useState<'grafico' | 'grade' | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const bellRef = useRef<HTMLDivElement | null>(null)
  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<Loja | null>(null)
  const [busca, setBusca] = useState('')
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
      const k = qs(false)
      if (!forcar && mem.current[k]) {
        setDados(mem.current[k])
        setLoading(false)
        return
      }
      setLoading(true)
      setErro('')
      try {
        const r = (await pb.send('/backend/v1/varejo/desempenho?' + qs(forcar), {
          method: 'GET',
        })) as Resposta
        setDados(r)
        mem.current[k] = r
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
      const m = String(s.MES || '').padStart(2, '0')
      if (!mapa[m]) mapa[m] = {}
      mapa[m][String(s.ANO)] = Number((s as any)[defM.campo] ?? (s as any).FAT) || 0
    }
    const anos = Array.from(
      new Set((dados?.serie || []).map((s: any) => String(s.ANO || '')).filter(Boolean)),
    ).sort()
    const ult = anos[anos.length - 1]
    return Object.keys(mapa)
      .sort()
      .map((m) => {
        const linha: any = { mes: MESES_C[Number(m) - 1] || m }
        for (const a of anos) linha[a] = mapa[m][a] ?? null
        if (ult) {
          const v = mapa[m][ult] ?? null
          linha[ult] = Number(m) <= ultimoFechado ? v : null
          linha[ult + ' parcial'] = Number(m) >= ultimoFechado ? v : null
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
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => carregar(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    )
  }

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
      valor: comp(K.faturamento),
      contexto: brl(K.faturamento),
      Icone: TrendingUp,
      tom: (K.faturamento_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'Meta', valor: K.faturamento_ating ?? null, comparado: comp(K.meta_venda) },
        { label: 'A.A.', valor: K.faturamento_aa ?? null, comparado: comp(K.faturamento_aa_valor) },
      ],
    },
    qtd: {
      label: 'Qtde / Kg',
      valor: comp(K.quantidade_kg),
      Icone: Package,
      tom: (K.quantidade_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: K.quantidade_ma ?? null, comparado: comp(K.quantidade_ma_valor) },
        { label: 'A.A.', valor: K.quantidade_aa ?? null, comparado: comp(K.quantidade_aa_valor) },
      ],
    },
    preco: {
      label: 'Preço Médio',
      valor: brl(K.preco_medio, 2),
      Icone: Tag,
      tom: (K.preco_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: K.preco_ma ?? null, comparado: brl(K.preco_ma_valor, 2) },
        { label: 'A.A.', valor: K.preco_aa ?? null, comparado: brl(K.preco_aa_valor, 2) },
      ],
    },
    cupons: {
      label: 'Cupons',
      valor: n(K.cupons),
      Icone: Receipt,
      tom: (K.cupons_aa ?? 0) >= 0 ? 'blue' : 'red',
      vars: [
        { label: 'M.A.', valor: K.cupons_ma ?? null, comparado: n(K.cupons_ma_valor) },
        { label: 'A.A.', valor: K.cupons_aa ?? null, comparado: n(K.cupons_aa_valor) },
      ],
    },
    ticket: {
      label: 'Ticket Médio',
      valor: brl(K.ticket_medio, 0),
      Icone: Ticket,
      tom: (K.ticket_aa ?? 0) >= 0 ? 'violet' : 'red',
      vars: [
        { label: 'M.A.', valor: K.ticket_ma ?? null, comparado: brl(K.ticket_ma_valor) },
        { label: 'A.A.', valor: K.ticket_aa ?? null, comparado: brl(K.ticket_aa_valor) },
      ],
    },
    cmv: {
      label: 'CMV Parcial',
      valor: pct(K.cmv_pct, 2),
      contexto: 'meta ' + pct(K.meta_cmv),
      Icone: Percent,
      tom: (K.cmv_ating ?? 100) >= 100 ? 'green' : 'amber',
      vars: [
        { label: 'Meta', valor: K.cmv_ating ?? null, inverso: true, comparado: pct(K.meta_cmv) },
      ],
    },
    quebra: {
      label: 'Quebra',
      valor: pct(K.quebra_pct, 2),
      contexto: 'limite ' + pct(K.limite_perda),
      Icone: AlertTriangle,
      tom: (K.quebra_ating ?? 0) <= 100 ? 'green' : 'red',
      vars: [
        {
          label: 'Meta',
          valor: K.quebra_ating ?? null,
          inverso: true,
          comparado: pct(K.limite_perda),
        },
      ],
    },
    lojas: {
      label: 'Lojas',
      valor: n(K.nLojas),
      contexto: n(K.funcionarios) + ' funcionários',
      Icone: Store,
      tom: 'gray',
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
      {/* (h) ocultar / reexibir */}
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
              const nv = cards.ocultos.concat([id])
              setCards({ ...cards, ocultos: nv })
              gravarPref(uid, 'cardsOcultos', nv)
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
          {alertas.length > 0 && (
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setDrawerAberto((v) => !v)}
                aria-expanded={drawerAberto}
                className="relative inline-flex items-center justify-center h-7 w-7 rounded border"
                style={{ borderColor: T.border, background: T.card }}
              >
                <Bell className="h-3.5 w-3.5" />
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: T.alertFill, color: T.neg }}
                >
                  {alertas.length}
                </span>
              </button>
              {drawerAberto && (
                <div
                  className="absolute right-0 top-full mt-2 z-50 w-[300px] bg-white border shadow-xl"
                  style={{ borderColor: T.border, borderRadius: 8 }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 border-b"
                    style={{ borderColor: T.border }}
                  >
                    <span className="text-[13px] font-semibold" style={{ color: T.neg }}>
                      Atenção
                    </span>
                    <button type="button" onClick={() => setDrawerAberto(false)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {alertas.map((a) => (
                      <div
                        key={a.id}
                        className="px-3 py-2 border-b flex items-start gap-2"
                        style={{ borderColor: T.border }}
                      >
                        <span
                          className="mt-1 h-1.5 w-1.5 rounded-full"
                          style={{ background: a.tom === 'red' ? T.neg : T.warn }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-bold truncate" style={{ color: T.text }}>
                            {a.loja}
                          </div>
                          <div className="text-[11px]" style={{ color: T.muted }}>
                            {a.d}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
                <button
                  type="button"
                  onClick={() => {
                    setColOcultas([])
                    gravarPref(uid, 'colunasOcultas', [])
                  }}
                  className="mt-1 w-full text-[10px] font-semibold py-1 rounded hover:bg-gray-50"
                  style={{ color: T.muted }}
                >
                  Mostrar todas
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTelaCheia(cheio('grade') ? null : 'grade')}
            className="inline-flex items-center justify-center h-7 w-7 rounded border"
            style={{ borderColor: T.border, color: T.text, background: T.card }}
          >
            {cheio('grade') ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: T.border }} />
      <div className={cn('overflow-auto', cheio('grade') && 'flex-1')}>
        <table
          className="text-[12px]"
          style={{ minWidth: colVisiveis.reduce((a, c) => a + largura(c), 0), width: '100%' }}
        >
          <colgroup>
            {colVisiveis.map((c) => (
              <col key={c.id} style={{ width: largura(c) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ background: T.card }}>
            <tr className="border-b" style={{ borderColor: T.border }}>
              {colVisiveis.map((c) => (
                <th
                  key={c.id}
                  onClick={() =>
                    setOrdem((o) =>
                      o?.id === c.id
                        ? { id: c.id, dir: o.dir === 'asc' ? 'desc' : 'asc' }
                        : { id: c.id, dir: 'desc' },
                    )
                  }
                  aria-sort={
                    ordem?.id === c.id ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={cn(
                    'relative py-2 px-2 text-[10px] font-bold uppercase cursor-pointer select-none',
                    c.al === 'right' ? 'text-right' : 'text-left',
                  )}
                  style={{ color: T.muted }}
                >
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      c.al === 'right' && 'justify-end w-full',
                    )}
                  >
                    {c.label}
                    {ordem?.id === c.id &&
                      (ordem.dir === 'asc' ? (
                        <ArrowUp className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowDown className="h-2.5 w-2.5" />
                      ))}
                  </span>
                  <span
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      redim.current = { id: c.id, ini: e.clientX, w: largura(c) }
                      document.body.style.cursor = 'col-resize'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-0 right-0 h-full w-1.5 hover:bg-[#14532d]/30"
                    style={{ cursor: 'col-resize' }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* (f,i) Rede -> Bandeira -> Loja. Recolher esconde só os níveis
                abaixo; a linha recolhida mantém "+" e os subtotais de TODAS as
                colunas, inclusive os % (f1 e f3). */}
            {grupos.map((g) => {
              const chR = 'r:' + g.rede
              const fechR = fechados.includes(chR)
              return (
                <Fragment key={chR}>
                  <tr style={{ background: '#eef2f5', borderTop: '1px solid ' + T.border }}>
                    {colVisiveis.map((c) => {
                      if (c.id === 'rede')
                        return (
                          <td key={c.id} className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => alternar(chR)}
                              aria-expanded={!fechR}
                              className="inline-flex items-center gap-1.5 text-[12px] font-bold"
                              style={{ color: T.text }}
                            >
                              <span
                                className="inline-flex items-center justify-center h-4 w-4 rounded border text-[11px] font-bold"
                                style={{
                                  borderColor: T.border,
                                  color: T.muted,
                                  background: T.card,
                                }}
                              >
                                {fechR ? '+' : '−'}
                              </span>
                              {g.rede}
                            </button>
                          </td>
                        )
                      if (c.id === 'loja')
                        return (
                          <td key={c.id} className="px-2 text-[11px]" style={{ color: T.muted }}>
                            {g.nLojas} lojas
                          </td>
                        )
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            'px-2 py-1.5 tabular-nums font-bold',
                            c.al === 'right' ? 'text-right' : 'text-left',
                          )}
                          style={{ color: T.text }}
                        >
                          {celula(c, (g.total as any)[c.id])}
                        </td>
                      )
                    })}
                  </tr>
                  {!fechR &&
                    g.bandeiras.map((b) => {
                      const chB = chR + '|' + b.chave
                      const fechB = fechados.includes(chB)
                      return (
                        <Fragment key={chB}>
                          <tr style={{ background: T.input }}>
                            {colVisiveis.map((c) => {
                              if (c.id === 'rede')
                                return (
                                  <td key={c.id} className="px-2 py-1">
                                    <button
                                      type="button"
                                      onClick={() => alternar(chB)}
                                      aria-expanded={!fechB}
                                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold pl-3"
                                      style={{ color: T.text }}
                                    >
                                      <span
                                        className="inline-flex items-center justify-center h-3.5 w-3.5 rounded border text-[9px] font-bold"
                                        style={{
                                          borderColor: T.border,
                                          color: T.muted,
                                          background: T.card,
                                        }}
                                      >
                                        {fechB ? '+' : '−'}
                                      </span>
                                      {b.label}
                                    </button>
                                  </td>
                                )
                              if (c.id === 'loja')
                                return (
                                  <td
                                    key={c.id}
                                    className="px-2 text-[10px]"
                                    style={{ color: T.muted }}
                                  >
                                    {b.lojas.length} lojas
                                  </td>
                                )
                              return (
                                <td
                                  key={c.id}
                                  className={cn(
                                    'px-2 py-1 tabular-nums font-semibold',
                                    c.al === 'right' ? 'text-right' : 'text-left',
                                  )}
                                  style={{ color: T.text }}
                                >
                                  {celula(c, (b.total as any)[c.id])}
                                </td>
                              )
                            })}
                          </tr>
                          {!fechB &&
                            b.lojas.map((l) => {
                              const sel = selecionadas.includes(l.codparc)
                              return (
                                <tr
                                  key={l.codparc}
                                  onClick={() => altLinha(l.codparc)}
                                  className="border-b hover:bg-[#f9fafb] cursor-pointer"
                                  style={{
                                    borderColor: T.border,
                                    height: 34,
                                    background: sel ? T.tintGreen : undefined,
                                  }}
                                >
                                  {colVisiveis.map((c) => {
                                    if (c.id === 'rede')
                                      return <td key={c.id} className="px-2 pl-8" />
                                    if (c.id === 'loja')
                                      return (
                                        <td
                                          key={c.id}
                                          className="px-2 text-[11px] font-medium truncate pl-6"
                                          style={{ color: T.text }}
                                          title={l.loja}
                                        >
                                          <span className="inline-flex items-center gap-1 max-w-full">
                                            <span className="truncate">{l.loja}</span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setParecerLoja(l)
                                                setParecerAberto(true)
                                              }}
                                              className="shrink-0 opacity-0 hover:opacity-100"
                                              style={{ color: T.nav }}
                                            >
                                              <Sparkles className="h-3 w-3" />
                                            </button>
                                          </span>
                                        </td>
                                      )
                                    return (
                                      <td
                                        key={c.id}
                                        className={cn(
                                          'px-2 tabular-nums',
                                          c.al === 'right' ? 'text-right' : 'text-left',
                                        )}
                                      >
                                        {celula(c, (l as any)[c.id])}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                        </Fragment>
                      )
                    })}
                </Fragment>
              )
            })}
            <tr style={{ background: '#eef2f5', borderTop: '2px solid ' + T.border }}>
              {colVisiveis.map((c) => {
                if (c.id === 'rede')
                  return (
                    <td
                      key={c.id}
                      className="px-2 py-2 text-[12px] font-bold"
                      style={{ color: T.text }}
                    >
                      Total
                    </td>
                  )
                if (c.id === 'loja')
                  return (
                    <td key={c.id} className="px-2 text-[11px]" style={{ color: T.muted }}>
                      {lojasFiltradas.length} lojas
                    </td>
                  )
                return (
                  <td
                    key={c.id}
                    className={cn(
                      'px-2 py-2 tabular-nums font-bold',
                      c.al === 'right' ? 'text-right' : 'text-left',
                    )}
                    style={{ color: T.text }}
                  >
                    {celula(c, (somaGrupo(lojasFiltradas) as any)[c.id])}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )

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

      {/* painel de filtros */}
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
              {/* (c) Rede só no canal Varejo */}
              <Sel
                label="Rede"
                largura={130}
                value={f.aba === 'varejo' ? f.rede : ''}
                onChange={(v: any) => setCampo('rede', v)}
                options={f.aba === 'varejo' ? REDES : [{ v: '', l: '—' }]}
                disabled={f.aba !== 'varejo'}
              />
              {/* (f2) NSS / SSS */}
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
              {/* (d,e) Bandeira conforme a Rede */}
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
              {/* (g) Supervisor 30% menor: 260 -> 182 */}
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
