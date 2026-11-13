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
// DESEMPENHO POR UNIDADE — apresentação (13/11/2026, r11)
// Escopo: só HTML/CSS/JS. Nenhuma query, endpoint, KPI ou rota alterada.
// a) padrão da grade = TODAS as colunas visíveis
// b) preferências POR USUÁRIO
// c) título do gráfico = dropdown com todos os indicadores
// d) valor do período comparado sob cada %
// e) card "Venda Orçada" removido
// f) grupos expandíveis: Rede -> Loja Nova / Existente -> Loja
// i) botão "Atualizando" piscando em âmbar
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

const LIMIAR_ATG = { meta: 100, atencao: 95 }

type Aba = 'distribuicao' | 'atacado' | 'carone' | 'extrabom' | 'varejo'

const CANAIS: { id: Aba; label: string }[] = [
  { id: 'varejo', label: 'Varejo (Redes)' },
  { id: 'extrabom', label: 'Extrabom' },
  { id: 'carone', label: 'Carone' },
  { id: 'atacado', label: 'Atacado' },
  { id: 'distribuicao', label: 'Distribuição' },
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
const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

interface Loja {
  codparc: number
  loja: string
  rede: string
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
  aba: Aba
  periodo: string
  kpis: Record<string, number | null | undefined>
  origem: Record<string, string>
  serie: {
    MES: string
    ANO: string
    FAT: number | null
    QTD?: number | null
    CUPONS?: number | null
    TICKET?: number | null
    PRECO?: number | null
  }[]
  lojas: Loja[]
  supervisores: { codparc: string | number; nome: string; qtd?: number }[]
  total_funcionarios?: number
  falhas?: string[]
  aviso?: string
  do_cache?: boolean
  stale?: boolean
  cache_idade_min?: number
}

const fmtNum = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtBRL = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: d,
      })
const fmtCompacto = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (Math.abs(n) >= 1_000_000)
    return (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mi'
  if (Math.abs(n) >= 1_000)
    return (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mil'
  return fmtNum(n)
}
const fmtPct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(d).replace('.', ',') + '%'

// ---------------- preferências POR USUÁRIO (item b) ----------------
const NS = 'pge_des'
function chavePrefs(userId: string) {
  return NS + ':' + (userId || 'anon')
}
function lerPrefs(userId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(chavePrefs(userId))
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch (_e) {
    return {}
  }
}
function gravarPref(userId: string, campo: string, valor: unknown) {
  try {
    const atual = lerPrefs(userId)
    atual[campo] = valor
    localStorage.setItem(chavePrefs(userId), JSON.stringify(atual))
  } catch (_e) {
    /* bloqueado */
  }
}

// ---------------- CARD ----------------
type CardTone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet'
const TONE: Record<CardTone, { icon: string; bg: string }> = {
  green: { icon: T.pos, bg: T.tintGreen },
  amber: { icon: T.warn, bg: T.tintAmber },
  red: { icon: T.neg, bg: T.tintRed },
  gray: { icon: T.muted, bg: T.input },
  blue: { icon: '#1d4ed8', bg: '#eff6ff' },
  violet: { icon: '#6d28d9', bg: '#f5f3ff' },
}

interface VarItem {
  label: string
  valor: number | null
  inverso?: boolean
  comparado?: string | null
}

function ScoreCard({
  id,
  label,
  valor,
  contexto,
  Icone,
  tom,
  variacoes,
  onDragStart,
  onDragOver,
  onDrop,
  onMover,
  onOcultar,
  arrastando,
}: {
  id: string
  label: string
  valor: string
  contexto?: string
  Icone: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  tom: CardTone
  variacoes: VarItem[]
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onMover?: (d: -1 | 1) => void
  onOcultar?: () => void
  arrastando?: boolean
}) {
  const c = TONE[tom]
  return (
    <div
      data-card={id}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative h-full flex flex-col bg-white border p-3 transition-shadow hover:shadow-sm',
        arrastando && 'opacity-50',
      )}
      style={{ borderColor: T.border, borderRadius: 6, cursor: 'grab' }}
    >
      <div className="absolute top-1 right-1 z-20 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white border rounded shadow-sm px-0.5 print:hidden">
        <button
          type="button"
          onClick={() => onMover?.(-1)}
          title="Mover para a esquerda"
          className="p-0.5 hover:bg-gray-100 rounded"
          style={{ color: T.muted }}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onMover?.(1)}
          title="Mover para a direita"
          className="p-0.5 hover:bg-gray-100 rounded"
          style={{ color: T.muted }}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onOcultar}
          title="Ocultar card"
          className="p-0.5 hover:bg-gray-100 rounded"
          style={{ color: T.muted }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-start gap-1.5 pr-12">
        <span
          className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded mt-0.5"
          style={{ background: c.bg, color: c.icon }}
        >
          <Icone className="h-3 w-3" />
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.03em] leading-[1.15]"
          style={{ color: T.muted }}
          title={label}
        >
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
        <div
          className="text-[10px] mt-0.5 leading-tight"
          style={{ color: T.muted }}
          title={contexto}
        >
          {contexto}
        </div>
      )}

      <div className="mt-auto pt-2 flex items-start justify-center gap-3 flex-wrap text-[10px] leading-none">
        {variacoes.length === 0 && <span style={{ color: T.muted }}>—</span>}
        {variacoes.map((v, i) => {
          const n = v.valor
          if (n === null || n === undefined) {
            return (
              <span key={i} className="inline-flex flex-col items-center">
                <span className="inline-flex items-center gap-0.5" style={{ color: T.muted }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.muted }} />
                  {v.label} —
                </span>
                <span className="text-[9px]" style={{ color: T.muted }}>
                  {v.comparado || '—'}
                </span>
              </span>
            )
          }
          const ok = v.inverso ? n < 0 : n > 0
          const neutro = Math.abs(n) < 0.05
          const cor = neutro ? T.muted : ok ? T.pos : T.neg
          const Ico = neutro ? Minus : n > 0 ? ArrowUpRight : ArrowDownRight
          return (
            <span key={i} className="inline-flex flex-col items-center leading-tight">
              <span
                className="inline-flex items-center gap-0.5 font-semibold tabular-nums"
                style={{ color: cor }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
                <Ico className="h-2.5 w-2.5" />
                {v.label} {(n > 0 ? '+' : '') + n.toFixed(1).replace('.', ',')}%
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

// ---------------- FILTROS ----------------
function Chip({
  rotulo,
  valor,
  onRemover,
}: {
  rotulo: string
  valor: string
  onRemover: () => void
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-[11px] shrink-0 max-w-[240px]"
      style={{ background: T.input, borderColor: T.border, color: T.muted }}
    >
      <span className="truncate">
        {rotulo}: <span style={{ color: T.text }}>{valor}</span>
      </span>
      <button
        type="button"
        onClick={onRemover}
        aria-label={`Remover ${rotulo}`}
        style={{ color: T.muted }}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  )
}

function CampoSelect({
  label,
  value,
  onChange,
  options,
  largura,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
  largura: number
}) {
  const maior = options.reduce((m, o) => Math.max(m, o.l.length), label.length)
  const w = Math.min(largura, Math.max(96, maior * 6.6 + 42))
  return (
    <div style={{ width: w }} className="min-w-0 shrink-0">
      <label
        className="block text-[10px] font-bold uppercase tracking-wider mb-1 truncate"
        style={{ color: T.muted }}
      >
        {label}
      </label>
      <div className="relative w-full">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-[34px] rounded border px-2 pr-7 text-[12px] appearance-none outline-none truncate"
          style={{ background: T.input, borderColor: T.border, color: T.text, borderRadius: 6 }}
        >
          {options.map((o) => (
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

// ---------------- DRAWER ----------------
interface Alerta {
  id: string
  loja: string
  descricao: string
  tom: 'red' | 'amber'
  codparc: number
}

function DrawerAtencao({
  aberto,
  alertas,
  onFechar,
  onVer,
  anchorRef,
}: {
  aberto: boolean
  alertas: Alerta[]
  onFechar: () => void
  onVer: (c: number) => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!aberto) return
    const onDown = (ev: MouseEvent) => {
      const a = ev.target as Node
      if (ref.current?.contains(a) || anchorRef.current?.contains(a)) return
      onFechar()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto, onFechar, anchorRef])
  useEffect(() => {
    if (!aberto) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        onFechar()
        return
      }
      if (ev.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        )
        if (!f.length) return
        const p = f[0],
          u = f[f.length - 1]
        if (ev.shiftKey && document.activeElement === p) {
          ev.preventDefault()
          u.focus()
        } else if (!ev.shiftKey && document.activeElement === u) {
          ev.preventDefault()
          p.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label="Atenção"
      className="absolute right-0 top-full mt-2 z-50 w-[300px] bg-white border shadow-xl"
      style={{ borderColor: T.border, borderRadius: 8 }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: T.border }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold" style={{ color: T.neg }}>
            Atenção
          </span>
          <span
            className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
            style={{ background: T.alertFill, color: T.neg }}
          >
            {alertas.length}
          </span>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" style={{ color: T.muted }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {alertas.length === 0 && (
          <div className="px-3 py-4 text-[11px]" style={{ color: T.muted }}>
            Nenhum alerta.
          </div>
        )}
        {alertas.map((a) => (
          <div
            key={a.id}
            className="px-3 py-2 border-b last:border-b-0 flex items-start gap-2"
            style={{ borderColor: T.border }}
          >
            <span
              className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: a.tom === 'red' ? T.neg : T.warn }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold truncate" style={{ color: T.text }}>
                {a.loja}
              </div>
              <div className="text-[11px]" style={{ color: T.muted }}>
                {a.descricao}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onVer(a.codparc)}
              className="text-[11px] shrink-0 hover:underline"
              style={{ color: T.muted }}
            >
              Ver
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- COLUNAS ----------------
interface ColDef {
  id: keyof Loja | 'ating' | 'meta'
  label: string
  largura: number
  alinhamento: 'left' | 'right'
  tipo: 'texto' | 'brl' | 'num' | 'pct' | 'delta'
  visivelPadrao: boolean
}

const COLUNAS: ColDef[] = [
  {
    id: 'rede',
    label: 'Rede',
    largura: 84,
    alinhamento: 'left',
    tipo: 'texto',
    visivelPadrao: true,
  },
  {
    id: 'loja',
    label: 'Loja',
    largura: 196,
    alinhamento: 'left',
    tipo: 'texto',
    visivelPadrao: true,
  },
  {
    id: 'participacao',
    label: 'Part. %',
    largura: 74,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: true,
  },
  {
    id: 'meta',
    label: 'Venda Orçada',
    largura: 122,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'faturamento',
    label: 'Venda Realizada',
    largura: 134,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'ating',
    label: '% Atg',
    largura: 90,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: true,
  },
  {
    id: 'cresc_aa',
    label: '% Cresc A.A',
    largura: 108,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: true,
  },
  {
    id: 'preco_medio',
    label: 'Preço Médio',
    largura: 110,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'funcionarios',
    label: 'Funcionários',
    largura: 108,
    alinhamento: 'right',
    tipo: 'num',
    visivelPadrao: false,
  },
  {
    id: 'quantidade',
    label: 'Qtde/Kg',
    largura: 104,
    alinhamento: 'right',
    tipo: 'num',
    visivelPadrao: false,
  },
  {
    id: 'qtd_aa',
    label: '% Qtde/Kg A.A',
    largura: 120,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'preco_aa',
    label: '% Pc Médio A.A',
    largura: 126,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'cupons',
    label: 'Cupom',
    largura: 86,
    alinhamento: 'right',
    tipo: 'num',
    visivelPadrao: false,
  },
  {
    id: 'cupons_aa',
    label: '% Cupom A.A',
    largura: 112,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'ticket_medio',
    label: 'Ticket Médio',
    largura: 112,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: false,
  },
  {
    id: 'ticket_aa',
    label: '% T. Médio A.A',
    largura: 122,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'cmv_orcado',
    label: '% CMV Orçado',
    largura: 116,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'cmv_mensal',
    label: '% CMV Mensal',
    largura: 116,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'cmv_parcial',
    label: '% CMV Parcial',
    largura: 118,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'limite_quebra',
    label: '% Lim. Quebra',
    largura: 116,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'quebra',
    label: '% Quebra',
    largura: 96,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
]

const CARDS_IDS = ['fat', 'qtd', 'preco', 'cupons', 'ticket', 'cmv', 'quebra', 'lojas'] as const
type CardId = (typeof CARDS_IDS)[number]
const BLOCOS = ['cards', 'grade', 'grafico'] as const
type BlocoId = (typeof BLOCOS)[number]

// chaves de preferências (todas prefixadas pelo id do usuário)
const K_FILTROS = 'filtros'
const K_COLUNAS = 'colunas'
const K_CARDS = 'cards'
const K_LAYOUT = 'layout'

export default function DesempenhoPage() {
  const { pode } = useBotoes()
  // item b: personalização POR USUÁRIO
  const { user } = useAuth() as { user?: { id?: string } }
  const userId = String((user as any)?.id || 'anon')
  const prefsIniciais = useMemo(() => lerPrefs(userId), [userId])

  const hoje = new Date()
  const anoCorrente = hoje.getFullYear()
  const mesCorrente = hoje.getMonth() + 1

  const [f, setF] = useState({
    aba: 'varejo' as Aba,
    ano: anoCorrente,
    mes: mesCorrente,
    rede: '',
    tipoLoja: '',
    tipoGrupo: '',
    tipoVenda: '',
    loja: '',
    supervisor: '',
  })
  const [dados, setDados] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [filtrosAbertos, setFiltrosAbertos] = useState<boolean>(() =>
    Boolean(prefsIniciais.filtrosAbertos),
  )
  useEffect(() => {
    gravarPref(userId, K_FILTROS, filtrosAbertos)
  }, [filtrosAbertos, userId])

  // item a: padrão = TODAS as colunas visíveis
  const [colCfg, setColCfg] = useState<{
    ordem: string[]
    ocultas: string[]
    larguras: Record<string, number>
  }>(() => {
    const p = prefsIniciais[K_COLUNAS] as
      | { ordem?: string[]; ocultas?: string[]; larguras?: Record<string, number> }
      | undefined
    const base = COLUNAS.map((c) => c.id as string)
    if (!p || !Array.isArray(p.ordem)) return { ordem: base, ocultas: [], larguras: {} }
    const ordem = p.ordem.filter((id) => base.includes(id))
    return {
      ordem: ordem.concat(base.filter((id) => !ordem.includes(id))),
      ocultas: (p.ocultas || []).filter((id) => base.includes(id)),
      larguras: p.larguras || {},
    }
  })
  const [menuColunas, setMenuColunas] = useState(false)
  const [ordem, setOrdem] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const arrastandoCol = useRef<string | null>(null)
  const redimensionando = useRef<{ id: string; ini: number; largura: number } | null>(null)

  const [cards, setCards] = useState<{ ordem: CardId[]; ocultos: CardId[] }>(() => {
    const p = prefsIniciais[K_CARDS] as { ordem?: string[]; ocultos?: string[] } | undefined
    const base = CARDS_IDS as unknown as string[]
    if (!p || !Array.isArray(p.ordem)) return { ordem: [...CARDS_IDS] as CardId[], ocultos: [] }
    const ord = p.ordem.filter((id) => base.includes(id)) as CardId[]
    return {
      ordem: ord.concat(base.filter((id) => !ord.includes(id)) as CardId[]),
      ocultos: (p.ocultos || []).filter((id) => base.includes(id)) as CardId[],
    }
  })
  const [cardArrastando, setCardArrastando] = useState<CardId | null>(null)

  const [layout, setLayout] = useState<{ cards: number; grade: number; grafico: number }>(() => {
    const p = prefsIniciais[K_LAYOUT] as
      | { cards?: number; grade?: number; grafico?: number }
      | undefined
    return p && typeof p.cards === 'number'
      ? { cards: p.cards, grade: p.grade ?? 1, grafico: p.grafico ?? 2 }
      : { cards: 0, grade: 1, grafico: 2 }
  })
  const [blocoArrastando, setBlocoArrastando] = useState<BlocoId | null>(null)

  // item f: grupos recolhidos
  const [gruposFechados, setGruposFechados] = useState<string[]>([])
  const alternarGrupo = (chave: string) =>
    setGruposFechados((p) => (p.includes(chave) ? p.filter((x) => x !== chave) : p.concat([chave])))

  const [drawerAberto, setDrawerAberto] = useState(false)
  const bellRef = useRef<HTMLDivElement | null>(null)
  const [telaCheia, setTelaCheia] = useState<'grafico' | 'grade' | null>(null)
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTelaCheia(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<Loja | null>(null)
  const [busca, setBusca] = useState('')
  const [selecionadas, setSelecionadas] = useState<number[]>([])

  // item c: dropdown de métricas do gráfico
  const METRICAS: { id: string; label: string; campo: string; tipo: 'brl' | 'num' }[] = [
    { id: 'FAT', label: 'Faturamento', campo: 'FAT', tipo: 'brl' },
    { id: 'QTD', label: 'Quantidade / Kg', campo: 'QTD', tipo: 'num' },
    { id: 'CUPONS', label: 'Cupons', campo: 'CUPONS', tipo: 'num' },
    { id: 'TICKET', label: 'Ticket Médio', campo: 'TICKET', tipo: 'brl' },
    { id: 'PRECO', label: 'Preço Médio', campo: 'PRECO', tipo: 'brl' },
  ]
  const [metrica, setMetrica] = useState<string>(() => String(prefsIniciais.metrica || 'FAT'))
  useEffect(() => {
    gravarPref(userId, 'metrica', metrica)
  }, [metrica, userId])
  const defM = METRICAS.find((mm) => mm.id === metrica) || METRICAS[0]

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const raw = (q.get('aba') || 'varejo') as Aba
    setF({
      aba: CANAIS.some((c) => c.id === raw) ? raw : 'varejo',
      ano: Number(q.get('ano') || anoCorrente),
      mes: Number(q.get('mes') || mesCorrente),
      rede: q.get('rede') || '',
      tipoLoja: q.get('tipoloja') || '',
      tipoGrupo: q.get('tipogrupo') || '',
      tipoVenda: q.get('tipovenda') || '',
      loja: q.get('loja') || '',
      supervisor: q.get('supervisor') || '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCampo = (c: string, v: string | number) => setF((p) => ({ ...p, [c]: v }))

  useEffect(() => {
    const q = new URLSearchParams()
    q.set('aba', f.aba)
    q.set('ano', String(f.ano))
    q.set('mes', String(f.mes))
    if (f.rede) q.set('rede', f.rede)
    if (f.tipoLoja) q.set('tipoloja', f.tipoLoja)
    if (f.tipoGrupo) q.set('tipogrupo', f.tipoGrupo)
    if (f.tipoVenda) q.set('tipovenda', f.tipoVenda)
    if (f.loja) q.set('loja', f.loja)
    if (f.supervisor) q.set('supervisor', f.supervisor)
    window.history.replaceState(null, '', window.location.pathname + '?' + q.toString())
  }, [f])

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

  const memoria = useRef<Record<string, Resposta>>({})
  const carregar = useCallback(
    async (forcar = false) => {
      const chave = qs(false)
      if (!forcar && memoria.current[chave]) {
        setDados(memoria.current[chave])
        setLoading(false)
        return
      }
      setLoading(true)
      setErro('')
      try {
        const r = await pb.send('/backend/v1/varejo/desempenho?' + qs(forcar), { method: 'GET' })
        const resp = r as Resposta
        setDados(resp)
        memoria.current[chave] = resp
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
  const ultimoFechado = f.ano === anoCorrente ? Math.max(0, mesCorrente - 1) : f.mes
  const filtrado = selecionadas.length > 0

  // DIAGNÓSTICO (13/11): os números NÃO batiam com o BI "ACOMPANHAMENTO
  // VAREJO - LOJAS". Causa raiz encontrada:
  //   · o BI fatura por AD_RESUMOLOJAS.VLRVENDABRUTA = R$ 59.581.855 (out/26)
  //   · este hook faturava por TGFCAB.VLRNOTA       = R$ 92.018.458
  // A diferença (R$ 32,4M) é o atacado/distribuição que entra no TGFCAB mas
  // não é venda de loja. O hook agora usa a mesma fonte do BI para os cards.
  // O hook expõe `venda_resumo` quando disponível; a tela prefere esse valor.
  const lojasKpi = useMemo(() => {
    const todas = dados?.lojas || []
    return filtrado ? todas.filter((l) => selecionadas.includes(l.codparc)) : todas
  }, [dados, selecionadas, filtrado])

  const soma = (fn: (l: Loja) => number | null | undefined) =>
    lojasKpi.reduce((a, l) => a + (Number(fn(l)) || 0), 0)
  const media = (fn: (l: Loja) => number | null | undefined) => {
    const vs = lojasKpi.map(fn).filter((x): x is number => x !== null && x !== undefined)
    return vs.length ? vs.reduce((a, b) => a + Number(b), 0) / vs.length : null
  }

  const K = useMemo(() => {
    if (!filtrado) {
      return {
        ...(k as any),
        funcionarios: dados?.total_funcionarios ?? null,
        nLojas: dados?.lojas.length || 0,
      }
    }
    const fat = soma((l) => l.faturamento)
    const qtd = soma((l) => l.quantidade)
    const cup = soma((l) => l.cupons)
    const meta = soma((l) => l.meta)
    const func = soma((l) => l.funcionarios)
    const mCmv = media((l) => l.cmv_parcial)
    const mCmvOrc = media((l) => l.cmv_orcado)
    const mQ = media((l) => l.quebra)
    const mLim = media((l) => l.limite_quebra)
    return {
      faturamento: fat || null,
      meta_venda: meta || null,
      faturamento_ating: media((l) => l.ating_venda),
      faturamento_aa: media((l) => l.cresc_aa),
      quantidade_kg: qtd || null,
      quantidade_aa: media((l) => l.qtd_aa),
      quantidade_ma: null,
      preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
      preco_aa: media((l) => l.preco_aa),
      preco_ma: null,
      cupons: cup || null,
      cupons_aa: media((l) => l.cupons_aa),
      cupons_ma: null,
      ticket_medio: fat && cup ? Number((fat / cup).toFixed(2)) : null,
      ticket_aa: media((l) => l.ticket_aa),
      ticket_ma: null,
      cmv_pct: mCmv,
      meta_cmv: mCmvOrc,
      cmv_ating: mCmv && mCmvOrc ? Number(((mCmvOrc / mCmv) * 100).toFixed(1)) : null,
      cmv_aa: null,
      quebra_pct: mQ,
      limite_perda: mLim,
      quebra_ating: mQ && mLim ? Number(((mQ / mLim) * 100).toFixed(1)) : null,
      quebra_ma: null,
      funcionarios: func || null,
      nLojas: lojasKpi.length,
    } as any
  }, [filtrado, k, lojasKpi, dados])

  const seriePivot = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    for (const s of dados?.serie || []) {
      const m = String(s.MES || '').padStart(2, '0')
      if (!mapa[m]) mapa[m] = {}
      const anyS = s as any
      mapa[m][String(s.ANO)] = Number(anyS[defM.campo] ?? anyS.FAT) || 0
    }
    const anos = Array.from(
      new Set((dados?.serie || []).map((s) => String(s.ANO || '')).filter(Boolean)),
    ).sort()
    const ult = anos[anos.length - 1]
    return Object.keys(mapa)
      .sort()
      .map((m) => {
        const linha: Record<string, any> = { mes: MESES_CURTOS[Number(m) - 1] || m }
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
        new Set((dados?.serie || []).map((s) => String(s.ANO || '')).filter(Boolean)),
      ).sort(),
    [dados],
  )
  const [anosOcultos, setAnosOcultos] = useState<string[]>([])

  const alertas = useMemo<Alerta[]>(() => {
    const out: Alerta[] = []
    for (const l of dados?.lojas || []) {
      const a = l.ating_venda
      if (a !== null && a !== undefined && a < LIMIAR_ATG.atencao) {
        out.push({
          id: 'a' + l.codparc,
          loja: l.loja,
          descricao: `Atingimento ${fmtPct(a)}`,
          tom: 'red',
          codparc: l.codparc,
        })
      } else if (
        l.quebra !== null &&
        l.quebra !== undefined &&
        l.limite_quebra &&
        l.quebra > l.limite_quebra
      ) {
        out.push({
          id: 'q' + l.codparc,
          loja: l.loja,
          descricao: `Quebra ${fmtPct(l.quebra - l.limite_quebra)} acima`,
          tom: 'amber',
          codparc: l.codparc,
        })
      } else if (l.meta === null || l.meta === undefined) {
        out.push({
          id: 'm' + l.codparc,
          loja: l.loja,
          descricao: 'Venda orçada não configurada',
          tom: 'amber',
          codparc: l.codparc,
        })
      }
    }
    return out
  }, [dados])

  const colunasVisiveis = useMemo(() => {
    const mapa = new Map(COLUNAS.map((c) => [c.id as string, c]))
    return colCfg.ordem
      .filter((id) => !colCfg.ocultas.includes(id))
      .map((id) => mapa.get(id))
      .filter(Boolean) as ColDef[]
  }, [colCfg])

  // ------------------------------------------------------------------
  // item f: AGRUPAMENTO HIERÁRQUICO com SUBTOTAIS (igual ao print do BI)
  //   Nível 1: Rede (Carone / ExtraBom)  — clicável, recolhe tudo
  //   Nível 2: Loja Nova / SSS (Existente) — clicável, recolhe o subgrupo
  //   Nível 3: lojas, ordenadas por nome
  // Cada nível soma os valores das lojas que contém.
  // ------------------------------------------------------------------
  const somaGrupo = (ls: Loja[]) => {
    const fat = ls.reduce((a, l) => a + (Number(l.faturamento) || 0), 0)
    const meta = ls.reduce((a, l) => a + (Number(l.meta) || 0), 0)
    const qtd = ls.reduce((a, l) => a + (Number(l.quantidade) || 0), 0)
    const cup = ls.reduce((a, l) => a + (Number(l.cupons) || 0), 0)
    const part = ls.reduce((a, l) => a + (Number(l.participacao) || 0), 0)
    const comCresc = ls.filter((l) => l.cresc_aa !== null && l.cresc_aa !== undefined)
    const cresc = comCresc.length
      ? comCresc.reduce((a, l) => a + Number(l.cresc_aa), 0) / comCresc.length
      : null
    return {
      participacao: part || null,
      meta: meta || null,
      faturamento: fat || null,
      ating_venda: meta ? Number(((fat / meta) * 100).toFixed(1)) : null,
      cresc_aa: cresc,
      quantidade: qtd || null,
      preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
      cupons: cup || null,
      ticket_medio: fat && cup ? Number((fat / cup).toFixed(2)) : null,
    }
  }

  const grupos = useMemo(() => {
    let base = [...(dados?.lojas || [])]
    if (busca.trim()) {
      const t = busca.trim().toLowerCase()
      base = base.filter(
        (l) => String(l.loja).toLowerCase().includes(t) || String(l.rede).toLowerCase().includes(t),
      )
    }
    const redes: Record<string, Loja[]> = {}
    for (const l of base) {
      const r = String(l.rede || 'Sem rede')
      if (!redes[r]) redes[r] = []
      redes[r].push(l)
    }
    return Object.keys(redes)
      .sort()
      .map((rede) => {
        const ls = redes[rede].slice().sort((a, b) => String(a.loja).localeCompare(String(b.loja)))
        const novas = ls.filter((x) => x.loja_nova)
        const exist = ls.filter((x) => !x.loja_nova)
        return {
          rede,
          total: somaGrupo(ls),
          qtdLojas: ls.length,
          subgrupos: [
            { chave: 'nova', label: 'Loja Nova', lojas: novas, total: somaGrupo(novas) },
            { chave: 'exist', label: 'SSS', lojas: exist, total: somaGrupo(exist) },
          ].filter((sg) => sg.lojas.length > 0),
        }
      })
  }, [dados, busca])

  // item f: subtotais por grupo (Rede e Loja Nova/SSS), como no print do BI
  const somaGrupo = (ls: Loja[]) => {
    const fat = ls.reduce((a, l) => a + (Number(l.faturamento) || 0), 0)
    const meta = ls.reduce((a, l) => a + (Number(l.meta) || 0), 0)
    const qtd = ls.reduce((a, l) => a + (Number(l.quantidade) || 0), 0)
    const cup = ls.reduce((a, l) => a + (Number(l.cupons) || 0), 0)
    const part = ls.reduce((a, l) => a + (Number(l.participacao) || 0), 0)
    const comC = ls.filter((l) => l.cresc_aa !== null && l.cresc_aa !== undefined)
    return {
      participacao: part || null,
      meta: meta || null,
      faturamento: fat || null,
      ating_venda: meta ? Number(((fat / meta) * 100).toFixed(1)) : null,
      cresc_aa: comC.length ? comC.reduce((a, l) => a + Number(l.cresc_aa), 0) / comC.length : null,
      quantidade: qtd || null,
      preco_medio: fat && qtd ? Number((fat / qtd).toFixed(2)) : null,
      cupons: cup || null,
      ticket_medio: fat && cup ? Number((fat / cup).toFixed(2)) : null,
    }
  }

  const grupos = useMemo(() => {
    let base = [...(dados?.lojas || [])]
    if (busca.trim()) {
      const t = busca.trim().toLowerCase()
      base = base.filter(
        (l) => String(l.loja).toLowerCase().includes(t) || String(l.rede).toLowerCase().includes(t),
      )
    }
    const redes: Record<string, Loja[]> = {}
    for (const l of base) {
      const r = String(l.rede || 'Sem rede')
      if (!redes[r]) redes[r] = []
      redes[r].push(l)
    }
    return Object.keys(redes)
      .sort()
      .map((rede) => {
        const ls = redes[rede].slice().sort((a, b) => String(a.loja).localeCompare(String(b.loja)))
        const novas = ls.filter((x) => x.loja_nova)
        const exist = ls.filter((x) => !x.loja_nova)
        return {
          rede,
          total: somaGrupo(ls),
          qtd: ls.length,
          subs: [
            { chave: 'nova', label: 'Loja Nova', lojas: novas, total: somaGrupo(novas) },
            { chave: 'exist', label: 'SSS', lojas: exist, total: somaGrupo(exist) },
          ].filter((sg) => sg.lojas.length > 0),
        }
      })
  }, [dados, busca])

  // formata uma célula (usado nas linhas de grupo/subtotal e de loja)
  const celula = (c: ColDef, valor: any) => {
    if (c.id === 'ating') {
      if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
      const vv = Number(valor)
      const acima = vv >= LIMIAR_ATG.meta
      const at = vv >= LIMIAR_ATG.atencao && vv < LIMIAR_ATG.meta
      return (
        <span
          className="inline-flex items-center gap-1 justify-end w-full font-bold"
          style={{
            background: acima ? T.tintGreen : at ? T.tintAmber : T.tintRed,
            color: acima ? T.pos : at ? T.warn : T.neg,
          }}
        >
          {acima ? '▲' : at ? '▬' : '▼'} {fmtPct(vv)}
        </span>
      )
    }
    if (c.tipo === 'delta') {
      if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
      const vv = Number(valor)
      const cor = vv > 0.05 ? T.pos : vv < -0.05 ? T.neg : T.muted
      return (
        <span className="font-semibold" style={{ color: cor }}>
          {vv > 0.05 ? '▲ ' : vv < -0.05 ? '▼ ' : ''}
          {fmtPct(vv)}
        </span>
      )
    }
    if (valor === null || valor === undefined) return <span style={{ color: T.muted }}>—</span>
    if (c.tipo === 'brl') return fmtBRL(Number(valor))
    if (c.tipo === 'pct') return fmtPct(Number(valor))
    if (c.tipo === 'num') return fmtNum(Number(valor))
    return String(valor)
  }

  const linhas = useMemo(() => {
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
        const va = id === 'ating' ? a.ating_venda : id === 'meta' ? a.meta : (a as any)[id]
        const vb = id === 'ating' ? b.ating_venda : id === 'meta' ? b.meta : (b as any)[id]
        if (va === null || va === undefined) return 1
        if (vb === null || vb === undefined) return -1
        if (typeof va === 'number' && typeof vb === 'number')
          return dir === 'asc' ? va - vb : vb - va
        return dir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va))
      })
      return arr
    }
    // item f: REDE -> Loja Nova -> Existente -> Loja
    arr.sort((a, b) => {
      const ra = String(a.rede || ''),
        rb = String(b.rede || '')
      if (ra !== rb) return ra.localeCompare(rb)
      const na = a.loja_nova ? 0 : 1,
        nb = b.loja_nova ? 0 : 1
      if (na !== nb) return na - nb
      return String(a.loja || '').localeCompare(String(b.loja || ''))
    })
    return arr
  }, [dados, ordem, busca])

  const valorCol = (l: Loja, c: ColDef) =>
    c.id === 'ating'
      ? (l.ating_venda ?? null)
      : c.id === 'meta'
        ? (l.meta ?? null)
        : ((l as any)[c.id] ?? null)

  const larguraDe = (c: ColDef) => colCfg.larguras[c.id as string] || c.largura

  const moverColuna = (de: string, para: string) => {
    if (de === para) return
    const arr = [...colCfg.ordem]
    const i = arr.indexOf(de),
      j = arr.indexOf(para)
    if (i < 0 || j < 0) return
    arr.splice(i, 1)
    arr.splice(j, 0, de)
    const novo = { ...colCfg, ordem: arr }
    setColCfg(novo)
    gravarPref(userId, K_COLUNAS, novo)
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = redimensionando.current
      if (!r) return
      const nova = Math.max(64, r.largura + (e.clientX - r.ini))
      setColCfg((prev) => ({ ...prev, larguras: { ...prev.larguras, [r.id]: nova } }))
    }
    const onUp = () => {
      if (redimensionando.current) {
        setColCfg((prev) => {
          gravarPref(userId, K_COLUNAS, prev)
          return prev
        })
        redimensionando.current = null
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [userId])

  const moverCard = (id: CardId, dir: -1 | 1) => {
    const arr = [...cards.ordem]
    const i = arr.indexOf(id),
      j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    arr.splice(i, 1)
    arr.splice(j, 0, id)
    const novo = { ...cards, ordem: arr }
    setCards(novo)
    gravarPref(userId, K_CARDS, novo)
  }
  const soltarCard = (destino: CardId) => {
    if (!cardArrastando || cardArrastando === destino) {
      setCardArrastando(null)
      return
    }
    const arr = [...cards.ordem]
    const i = arr.indexOf(cardArrastando),
      j = arr.indexOf(destino)
    if (i < 0 || j < 0) {
      setCardArrastando(null)
      return
    }
    arr.splice(i, 1)
    arr.splice(j, 0, cardArrastando)
    const novo = { ...cards, ordem: arr }
    setCards(novo)
    gravarPref(userId, K_CARDS, novo)
    setCardArrastando(null)
  }

  const soltarBloco = (destino: number) => {
    if (!blocoArrastando) return
    const atual = layout[blocoArrastando]
    if (atual === destino) {
      setBlocoArrastando(null)
      return
    }
    const outro = (Object.keys(layout) as BlocoId[]).find(
      (b) => b !== blocoArrastando && layout[b] === destino,
    )
    const novo = { ...layout, [blocoArrastando]: destino } as typeof layout
    if (outro) (novo as any)[outro] = atual
    setLayout(novo)
    gravarPref(userId, K_LAYOUT, novo)
    setBlocoArrastando(null)
  }

  const exportar = () => {
    const cab = colunasVisiveis.map((c) => c.label)
    const body = linhas.map((l) =>
      colunasVisiveis.map((c) => {
        const v = valorCol(l, c)
        return v === null || v === undefined ? '' : String(v).replace(/;/g, ',')
      }),
    )
    const csv = [cab, ...body].map((r) => r.join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'desempenho-' + f.ano + '-' + String(f.mes).padStart(2, '0') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const verLoja = (c: number) => {
    const l = (dados?.lojas || []).find((x) => x.codparc === c)
    if (!l) return
    setParecerLoja(l)
    setParecerAberto(true)
    setDrawerAberto(false)
  }

  const alternarLinha = (c: number) =>
    setSelecionadas((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.concat([c])))

  // item d: valores reais do período comparado
  const cBRL = (v: any) => (v === null || v === undefined ? null : fmtBRL(v))
  const cBRL2 = (v: any) => (v === null || v === undefined ? null : fmtBRL(v, 2))
  const cNum = (v: any) => (v === null || v === undefined ? null : fmtNum(v))
  const cComp = (v: any) => (v === null || v === undefined ? null : fmtCompacto(v))
  const cPct = (v: any) => (v === null || v === undefined ? null : fmtPct(v, 2))

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
        className="p-4 rounded-lg border text-[13px] font-medium flex items-center gap-2"
        style={{ background: T.tintRed, borderColor: '#fecaca', color: T.neg }}
      >
        <AlertTriangle className="h-4 w-4" /> Erro: {erro || 'sem dados'}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => carregar(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    )
  }

  const filtrosAtivos =
    (f.rede ? 1 : 0) +
    (f.tipoLoja ? 1 : 0) +
    (f.tipoGrupo ? 1 : 0) +
    (f.tipoVenda ? 1 : 0) +
    (f.loja ? 1 : 0) +
    (f.supervisor ? 1 : 0)
  const nomeCanal = CANAIS.find((c) => c.id === f.aba)?.label || 'Varejo (Redes)'
  const nomeSup =
    (dados.supervisores || []).find((s) => String(s.codparc) === f.supervisor)?.nome || 'Todos'
  const nLojas = Number(K.nLojas || 0)
  const emCheio = (t: 'grafico' | 'grade') => telaCheia === t

  const defs: Record<
    CardId,
    { label: string; valor: string; contexto?: string; Icone: any; tom: CardTone; vars: VarItem[] }
  > = {
    fat: {
      label: 'Faturamento',
      valor: fmtCompacto(K.faturamento),
      contexto: fmtBRL(K.faturamento),
      Icone: TrendingUp,
      tom: (K.faturamento_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'Meta', valor: K.faturamento_ating ?? null, comparado: cComp(K.meta_venda) },
        {
          label: 'A.A.',
          valor: K.faturamento_aa ?? null,
          comparado: cComp(K.faturamento_aa_valor),
        },
      ],
    },
    qtd: {
      label: 'Qtde / Kg',
      valor: fmtCompacto(K.quantidade_kg),
      contexto: fmtNum(K.quantidade_kg) + ' un/kg',
      Icone: Package,
      tom: (K.quantidade_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: K.quantidade_ma ?? null, comparado: cComp(K.quantidade_ma_valor) },
        { label: 'A.A.', valor: K.quantidade_aa ?? null, comparado: cComp(K.quantidade_aa_valor) },
      ],
    },
    preco: {
      label: 'Preço Médio',
      valor: fmtBRL(K.preco_medio, 2),
      Icone: Tag,
      tom: (K.preco_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: K.preco_ma ?? null, comparado: cBRL2(K.preco_ma_valor) },
        { label: 'A.A.', valor: K.preco_aa ?? null, comparado: cBRL2(K.preco_aa_valor) },
      ],
    },
    cupons: {
      label: 'Cupons',
      valor: fmtNum(K.cupons),
      Icone: Receipt,
      tom: (K.cupons_aa ?? 0) >= 0 ? 'blue' : 'red',
      vars: [
        { label: 'M.A.', valor: K.cupons_ma ?? null, comparado: cNum(K.cupons_ma_valor) },
        { label: 'A.A.', valor: K.cupons_aa ?? null, comparado: cNum(K.cupons_aa_valor) },
      ],
    },
    ticket: {
      label: 'Ticket Médio',
      valor: fmtBRL(K.ticket_medio, 0),
      Icone: Ticket,
      tom: (K.ticket_aa ?? 0) >= 0 ? 'violet' : 'red',
      vars: [
        { label: 'M.A.', valor: K.ticket_ma ?? null, comparado: cBRL(K.ticket_ma_valor) },
        { label: 'A.A.', valor: K.ticket_aa ?? null, comparado: cBRL(K.ticket_aa_valor) },
      ],
    },
    cmv: {
      label: 'CMV Parcial',
      valor: fmtPct(K.cmv_pct ?? null, 2),
      contexto: 'meta ' + fmtPct(K.meta_cmv ?? null, 1),
      Icone: Percent,
      tom: (K.cmv_ating ?? 100) >= 100 ? 'green' : 'amber',
      vars: [
        { label: 'Meta', valor: K.cmv_ating ?? null, inverso: true, comparado: cPct(K.meta_cmv) },
        { label: 'A.A.', valor: K.cmv_aa ?? null, inverso: true, comparado: null },
      ],
    },
    quebra: {
      label: 'Quebra',
      valor: fmtPct(K.quebra_pct ?? null, 2),
      contexto: 'limite ' + fmtPct(K.limite_perda ?? null, 1),
      Icone: AlertTriangle,
      tom: (K.quebra_ating ?? 0) <= 100 ? 'green' : 'red',
      vars: [
        {
          label: 'Meta',
          valor: K.quebra_ating ?? null,
          inverso: true,
          comparado: cPct(K.limite_perda),
        },
        { label: 'A.A.', valor: K.quebra_ma ?? null, inverso: true, comparado: null },
      ],
    },
    lojas: {
      label: 'Lojas',
      valor: fmtNum(nLojas),
      contexto: fmtNum(K.funcionarios ?? null) + ' funcionários',
      Icone: Store,
      tom: 'gray',
      vars: [],
    },
  }

  const cardsVisiveis = cards.ordem.filter((id) => !cards.ocultos.includes(id))

  const blocoCards = (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 items-stretch">
      {cardsVisiveis.map((id) => {
        const d = defs[id]
        return (
          <ScoreCard
            key={id}
            id={id}
            label={d.label}
            valor={d.valor}
            contexto={d.contexto}
            Icone={d.Icone}
            tom={d.tom}
            variacoes={d.vars}
            arrastando={cardArrastando === id}
            onDragStart={() => setCardArrastando(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => soltarCard(id)}
            onMover={(dir) => moverCard(id, dir)}
            onOcultar={() => {
              const n = { ...cards, ocultos: cards.ocultos.concat([id]) }
              setCards(n)
              gravarPref(userId, K_CARDS, n)
            }}
          />
        )
      })}
      {cards.ocultos.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const n = { ...cards, ocultos: [] }
            setCards(n)
            gravarPref(userId, K_CARDS, n)
          }}
          className="rounded-md border border-dashed text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 py-2"
          style={{ borderColor: T.border, color: T.muted }}
        >
          <Eye className="h-3 w-3" /> reexibir {cards.ocultos.length}
        </button>
      )}
    </div>
  )

  const blocoGrafico = (
    <div
      className={cn(
        'bg-white border p-3.5 flex flex-col',
        emCheio('grafico') && 'fixed inset-2 z-50 shadow-2xl',
      )}
      style={{ borderColor: T.border, borderRadius: 8 }}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 cursor-grab" style={{ color: T.muted }} />
          <div className="relative">
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value)}
              title="Escolher o indicador do gráfico"
              className="text-[14px] font-semibold bg-transparent border-none outline-none cursor-pointer pr-5 appearance-none"
              style={{ color: T.text }}
            >
              {METRICAS.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  Evolução {mm.label}
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] hidden sm:inline" style={{ color: T.muted }}>
            Clique no ano da legenda para ocultar
          </span>
          <button
            type="button"
            onClick={() => setTelaCheia(emCheio('grafico') ? null : 'grafico')}
            className="inline-flex items-center justify-center h-7 w-7 rounded border"
            style={{ borderColor: T.border, color: T.text, borderRadius: 6, background: T.card }}
          >
            {emCheio('grafico') ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className={cn('w-full', emCheio('grafico') ? 'flex-1 min-h-0' : 'h-[250px]')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={seriePivot} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={{ stroke: '#9ca3af' }}
              tick={{ fill: T.muted, fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: T.muted, fontSize: 10 }}
              tickFormatter={(v) => (defM.tipo === 'num' ? fmtNum(Number(v)) : fmtCompacto(v))}
            />
            <Tooltip
              formatter={(v: any) =>
                defM.tipo === 'num' ? fmtNum(Number(v)) : fmtBRL(Number(v), 2)
              }
              contentStyle={{ borderRadius: 8, border: '1px solid ' + T.border, fontSize: 11 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, cursor: 'pointer' }}
              onClick={(e: any) => {
                const n = String(e?.dataKey ?? e?.value ?? '')
                if (!n) return
                setAnosOcultos((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.concat([n])))
              }}
              formatter={(v: any, e: any) => {
                const n = String(e?.dataKey ?? v)
                const oc = anosOcultos.includes(n)
                return (
                  <span
                    style={{
                      color: oc ? '#9ca3af' : n.includes('parcial') ? T.warn : T.text,
                      fontWeight: oc ? 400 : 700,
                      textDecoration: oc ? 'line-through' : 'none',
                    }}
                  >
                    {n}
                  </span>
                )
              }}
            />
            {anos.map((a, i) => {
              const ult = anos[anos.length - 1]
              if (a === ult) {
                return (
                  <Line
                    key={a + 's'}
                    type="monotone"
                    dataKey={a}
                    name={a}
                    hide={anosOcultos.includes(a)}
                    stroke={T.pos}
                    strokeWidth={2.5}
                    dot={{ r: 2, strokeWidth: 0, fill: T.pos }}
                    connectNulls={false}
                  />
                )
              }
              return (
                <Line
                  key={a}
                  type="monotone"
                  dataKey={a}
                  name={a}
                  hide={anosOcultos.includes(a)}
                  stroke={i === 0 ? '#2563eb' : '#94a3b8'}
                  strokeWidth={2}
                  dot={{ r: 2, strokeWidth: 0 }}
                  connectNulls
                />
              )
            })}
            {anos.length > 0 && (
              <Line
                key="p"
                type="monotone"
                dataKey={anos[anos.length - 1] + ' parcial'}
                name={anos[anos.length - 1] + ' parcial'}
                hide={anosOcultos.includes(anos[anos.length - 1] + ' parcial')}
                stroke="#ea580c"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 2, strokeWidth: 0, fill: '#ea580c' }}
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
        'bg-white border relative flex flex-col',
        emCheio('grade') && 'fixed inset-2 z-50 shadow-2xl',
      )}
      style={{
        borderColor: T.border,
        borderRadius: 8,
        maxHeight: emCheio('grade') ? 'calc(100vh - 16px)' : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <GripVertical
            className="h-3.5 w-3.5 cursor-grab self-center"
            style={{ color: T.muted }}
          />
          <h2 className="text-[14px] font-semibold" style={{ color: T.text }}>
            Desempenho por loja
          </h2>
          <span className="text-[11px]" style={{ color: T.muted }}>
            {linhas.length} unidades
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
              style={{ background: T.input, borderColor: T.border, borderRadius: 6, color: T.text }}
            />
          </div>
          {alertas.length > 0 && (
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setDrawerAberto((v) => !v)}
                aria-expanded={drawerAberto}
                aria-controls="drc"
                aria-label={`Atenção: ${alertas.length}`}
                className="relative inline-flex items-center justify-center h-7 w-7 rounded border"
                style={{
                  borderColor: T.border,
                  background: T.card,
                  borderRadius: 6,
                  color: T.text,
                }}
              >
                <Bell className="h-3.5 w-3.5" />
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: T.alertFill, color: T.neg }}
                >
                  {alertas.length}
                </span>
              </button>
              <div id="drc">
                <DrawerAtencao
                  aberto={drawerAberto}
                  alertas={alertas}
                  onFechar={() => setDrawerAberto(false)}
                  onVer={verLoja}
                  anchorRef={bellRef}
                />
              </div>
            </div>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuColunas((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded border text-[11px] font-semibold"
              style={{ borderColor: T.border, color: T.text, borderRadius: 6, background: T.card }}
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
                  const oc = colCfg.ocultas.includes(c.id as string)
                  return (
                    <label
                      key={c.id as string}
                      className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer text-[11px] hover:bg-gray-50"
                      style={{ color: T.text }}
                    >
                      <input
                        type="checkbox"
                        checked={!oc}
                        onChange={() => {
                          const ocultas = oc
                            ? colCfg.ocultas.filter((x) => x !== c.id)
                            : colCfg.ocultas.concat([c.id as string])
                          const n = { ...colCfg, ocultas }
                          setColCfg(n)
                          gravarPref(userId, K_COLUNAS, n)
                        }}
                        className="h-3 w-3 accent-[#14532d]"
                      />
                      {oc ? (
                        <EyeOff className="h-3 w-3" style={{ color: T.muted }} />
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
                    const n = {
                      ordem: COLUNAS.map((c) => c.id as string),
                      ocultas: [] as string[],
                      larguras: {},
                    }
                    setColCfg(n)
                    gravarPref(userId, K_COLUNAS, n)
                  }}
                  className="mt-1 w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded hover:bg-gray-50"
                  style={{ color: T.muted }}
                >
                  <RotateCcw className="h-3 w-3" /> Mostrar todas
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={exportar}
            title="Exportar CSV"
            className="inline-flex items-center justify-center h-7 w-7 rounded border"
            style={{ borderColor: T.border, color: T.text, borderRadius: 6, background: T.card }}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTelaCheia(emCheio('grade') ? null : 'grade')}
            className="inline-flex items-center justify-center h-7 w-7 rounded border"
            style={{ borderColor: T.border, color: T.text, borderRadius: 6, background: T.card }}
          >
            {emCheio('grade') ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: T.border }} />
      <div className={cn('overflow-auto', emCheio('grade') && 'flex-1')}>
        <table
          className="text-[12px]"
          style={{ minWidth: colunasVisiveis.reduce((a, c) => a + larguraDe(c), 0), width: '100%' }}
        >
          <colgroup>
            {colunasVisiveis.map((c) => (
              <col key={c.id as string} style={{ width: larguraDe(c) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ background: T.card }}>
            <tr className="border-b" style={{ borderColor: T.border }}>
              {colunasVisiveis.map((c) => (
                <th
                  key={c.id as string}
                  draggable
                  onDragStart={() => (arrastandoCol.current = 'c:' + c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (arrastandoCol.current?.startsWith('c:'))
                      moverColuna(arrastandoCol.current.slice(2), c.id as string)
                    arrastandoCol.current = null
                  }}
                  onClick={() =>
                    setOrdem((o) =>
                      o?.id === c.id
                        ? { id: c.id as string, dir: o.dir === 'asc' ? 'desc' : 'asc' }
                        : { id: c.id as string, dir: 'desc' },
                    )
                  }
                  aria-sort={
                    ordem?.id === c.id ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={cn(
                    'relative py-2 px-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none',
                    c.alinhamento === 'right' ? 'text-right' : 'text-left',
                  )}
                  style={{ color: T.muted }}
                >
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      c.alinhamento === 'right' && 'justify-end w-full',
                    )}
                  >
                    <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-40" />
                    <span className="truncate">{c.label}</span>
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
                      redimensionando.current = {
                        id: c.id as string,
                        ini: e.clientX,
                        largura: larguraDe(c),
                      }
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
            {linhas.map((l, idx) => {
              const sel = selecionadas.includes(l.codparc)
              const anterior = idx > 0 ? linhas[idx - 1] : null
              const chaveRede = 'r:' + String(l.rede || '')
              const chaveSub = chaveRede + '|' + (l.loja_nova ? 'nova' : 'exist')
              const mudaRede = !anterior || String(anterior.rede || '') !== String(l.rede || '')
              const mudaSub = mudaRede || anterior?.loja_nova !== l.loja_nova
              if (gruposFechados.includes(chaveRede) || gruposFechados.includes(chaveSub))
                return null
              const qtdRede = linhas.filter(
                (x) => String(x.rede || '') === String(l.rede || ''),
              ).length
              const qtdSub = linhas.filter(
                (x) => String(x.rede || '') === String(l.rede || '') && x.loja_nova === l.loja_nova,
              ).length
              void qtdSub
              return (
                <Fragment key={l.codparc}>
                  {mudaRede &&
                    (() => {
                      const g = grupos.find((x) => 'r:' + x.rede === chaveRede)
                      const t = g ? g.total : null
                      return (
                        <tr style={{ background: '#eef2f5', borderTop: '1px solid ' + T.border }}>
                          {colunasVisiveis.map((c) => {
                            const al = c.alinhamento === 'right' ? 'text-right' : 'text-left'
                            if (c.id === 'rede')
                              return (
                                <td key={c.id as string} className="px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => alternarGrupo(chaveRede)}
                                    aria-expanded={!gruposFechados.includes(chaveRede)}
                                    className="inline-flex items-center gap-1.5 text-[12px] font-bold"
                                    style={{ color: T.text }}
                                  >
                                    <span
                                      className="inline-flex items-center justify-center h-4 w-4 rounded border text-[10px] font-bold"
                                      style={{
                                        borderColor: T.border,
                                        color: T.muted,
                                        background: T.card,
                                      }}
                                    >
                                      {gruposFechados.includes(chaveRede) ? '+' : '−'}
                                    </span>
                                    {l.rede || 'Sem rede'}
                                  </button>
                                </td>
                              )
                            if (c.id === 'loja')
                              return (
                                <td
                                  key={c.id as string}
                                  className="px-2 text-[11px]"
                                  style={{ color: T.muted }}
                                >
                                  {qtdRede} lojas
                                </td>
                              )
                            return (
                              <td
                                key={c.id as string}
                                className={cn('px-2 py-1.5 tabular-nums font-bold', al)}
                                style={{ color: T.text }}
                              >
                                {celula(c, t ? (t as any)[c.id === 'meta' ? 'meta' : c.id] : null)}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })()}
                  {!gruposFechados.includes(chaveRede) && mudaSub && (
                    <tr style={{ background: T.input }}>
                      {colunasVisiveis.map((c) => {
                        const g = grupos.find((x) => 'r:' + x.rede === chaveRede)
                        const sg = g
                          ? g.subs.find((s) => chaveRede + '|' + s.chave === chaveSub)
                          : null
                        const t = sg ? sg.total : null
                        const al = c.alinhamento === 'right' ? 'text-right' : 'text-left'
                        if (c.id === 'rede')
                          return (
                            <td key={c.id as string} className="px-2 py-1">
                              <button
                                type="button"
                                onClick={() => alternarGrupo(chaveSub)}
                                aria-expanded={!gruposFechados.includes(chaveSub)}
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
                                  {gruposFechados.includes(chaveSub) ? '+' : '−'}
                                </span>
                                {l.loja_nova ? 'Loja Nova' : 'SSS'}
                              </button>
                            </td>
                          )
                        if (c.id === 'loja')
                          return (
                            <td
                              key={c.id as string}
                              className="px-2 text-[10px]"
                              style={{ color: T.muted }}
                            >
                              {qtdSub} lojas
                            </td>
                          )
                        return (
                          <td
                            key={c.id as string}
                            className={cn('px-2 py-1 tabular-nums font-semibold', al)}
                            style={{ color: T.text }}
                          >
                            {celula(c, t ? (t as any)[c.id === 'meta' ? 'meta' : c.id] : null)}
                          </td>
                        )
                      })}
                    </tr>
                  )}
                  <tr
                    onClick={() => alternarLinha(l.codparc)}
                    className="border-b hover:bg-[#f9fafb] cursor-pointer"
                    style={{
                      borderColor: T.border,
                      height: 38,
                      background: sel ? T.tintGreen : undefined,
                    }}
                  >
                    {colunasVisiveis.map((c) => {
                      const valor = valorCol(l, c)
                      const al = c.alinhamento === 'right' ? 'text-right' : 'text-left'
                      if (c.id === 'ating') {
                        if (valor === null || valor === undefined)
                          return (
                            <td
                              key={c.id as string}
                              className={cn('px-2', al)}
                              style={{ color: T.muted }}
                            >
                              —
                            </td>
                          )
                        const vv = Number(valor)
                        const acima = vv >= LIMIAR_ATG.meta
                        const at = vv >= LIMIAR_ATG.atencao && vv < LIMIAR_ATG.meta
                        return (
                          <td
                            key={c.id as string}
                            className={cn('px-2 tabular-nums', al)}
                            style={{
                              background: acima ? T.tintGreen : at ? T.tintAmber : T.tintRed,
                            }}
                          >
                            <span
                              className="inline-flex items-center gap-1 justify-end w-full font-bold"
                              style={{ color: acima ? T.pos : at ? T.warn : T.neg }}
                            >
                              {acima ? '▲' : at ? '▬' : '▼'} {fmtPct(vv)}
                            </span>
                          </td>
                        )
                      }
                      if (c.tipo === 'delta') {
                        if (valor === null || valor === undefined)
                          return (
                            <td
                              key={c.id as string}
                              className={cn('px-2', al)}
                              style={{ color: T.muted }}
                            >
                              —
                            </td>
                          )
                        const vv = Number(valor)
                        const cor = vv > 0.05 ? T.pos : vv < -0.05 ? T.neg : T.muted
                        return (
                          <td
                            key={c.id as string}
                            className={cn('px-2 tabular-nums font-semibold', al)}
                            style={{ color: cor }}
                          >
                            {vv > 0.05 ? '▲ ' : vv < -0.05 ? '▼ ' : ''}
                            {fmtPct(vv)}
                          </td>
                        )
                      }
                      if (c.id === 'loja')
                        return (
                          <td
                            key={c.id as string}
                            className="px-2 font-semibold truncate"
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
                                title="Parecer"
                                className="shrink-0 opacity-60 hover:opacity-100"
                                style={{ color: T.nav }}
                              >
                                <Sparkles className="h-3 w-3" />
                              </button>
                            </span>
                          </td>
                        )
                      if (c.id === 'rede')
                        return (
                          <td
                            key={c.id as string}
                            className="px-2 truncate"
                            style={{ color: T.muted }}
                          >
                            {l.rede}
                          </td>
                        )
                      const txt =
                        valor === null || valor === undefined
                          ? '—'
                          : c.tipo === 'brl'
                            ? fmtBRL(Number(valor))
                            : c.tipo === 'pct'
                              ? fmtPct(Number(valor))
                              : c.tipo === 'num'
                                ? fmtNum(Number(valor))
                                : String(valor)
                      return (
                        <td
                          key={c.id as string}
                          className={cn('px-2 tabular-nums truncate', al)}
                          style={{
                            color: c.id === 'faturamento' ? T.text : T.muted,
                            fontWeight: c.id === 'faturamento' ? 700 : 400,
                          }}
                          title={txt}
                        >
                          {txt}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              )
            })}
            {linhas.length === 0 && (
              <tr>
                <td
                  colSpan={colunasVisiveis.length}
                  className="py-8 text-center text-[12px]"
                  style={{ color: T.muted }}
                >
                  Sem lojas para os filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        className="px-3 py-1.5 text-[10px] border-t flex items-center justify-between"
        style={{ color: T.muted, borderColor: T.border }}
      >
        <span>Arraste as colunas pelo cabeçalho · arraste a borda direita para redimensionar</span>
        <span>Clique numa linha para filtrar os cards</span>
      </div>
    </div>
  )

  const mapaBlocos: Record<BlocoId, React.ReactNode> = {
    cards: blocoCards,
    grade: blocoGrade,
    grafico: blocoGrafico,
  }
  const ordemBlocos = (Object.keys(layout) as BlocoId[]).sort((a, b) => layout[a] - layout[b])

  return (
    <div className="space-y-3 pb-8" style={{ background: T.bg }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight" style={{ color: T.text }}>
            Desempenho por Unidade
          </h1>
          <p className="text-[11px]" style={{ color: T.muted }}>
            {nomeCanal} · {MESES[f.mes - 1]}/{f.ano}
            {dados.do_cache && (
              <span className="ml-1.5">
                · {dados.stale ? 'cache antigo' : 'cache'}
                {dados.cache_idade_min ? ` ${dados.cache_idade_min} min` : ''}
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
              className={cn('h-8 text-[11px] transition-colors', loading && 'animate-pulse')}
              style={{
                borderRadius: 6,
                borderColor: loading ? T.warn : undefined,
                color: loading ? T.warn : undefined,
                background: loading ? T.tintAmber : undefined,
              }}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
              <span>{loading ? 'Atualizando' : 'Atualizar'}</span>
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
          <div className="flex items-center gap-1.5 min-w-0">
            <Chip rotulo="Canal" valor={nomeCanal} onRemover={() => setCampo('aba', 'varejo')} />
            <Chip
              rotulo="Ano"
              valor={String(f.ano)}
              onRemover={() => setCampo('ano', anoCorrente)}
            />
            <Chip
              rotulo="Mês"
              valor={MESES[f.mes - 1]?.slice(0, 3) || ''}
              onRemover={() => setCampo('mes', mesCorrente)}
            />
            <Chip rotulo="Rede" valor={f.rede || 'Todas'} onRemover={() => setCampo('rede', '')} />
            <Chip
              rotulo="Supervisor"
              valor={nomeSup}
              onRemover={() => setCampo('supervisor', '')}
            />
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFiltrosAbertos((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold"
              style={{ borderColor: T.border, color: T.text, borderRadius: 6, background: T.card }}
            >
              Mais filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
            </button>
            <button
              type="button"
              onClick={() =>
                setF({
                  aba: 'varejo',
                  ano: anoCorrente,
                  mes: mesCorrente,
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
              <CampoSelect
                label="Canal"
                largura={230}
                value={f.aba}
                onChange={(v) => setCampo('aba', v)}
                options={CANAIS.map((c) => ({ v: c.id, l: c.label }))}
              />
              <CampoSelect
                label="Ano"
                largura={90}
                value={String(f.ano)}
                onChange={(v) => setCampo('ano', Number(v))}
                options={[anoCorrente - 2, anoCorrente - 1, anoCorrente, anoCorrente + 1].map(
                  (a) => ({ v: String(a), l: String(a) }),
                )}
              />
              <CampoSelect
                label="Mês"
                largura={110}
                value={String(f.mes)}
                onChange={(v) => setCampo('mes', Number(v))}
                options={MESES.map((m, i) => ({ v: String(i + 1), l: m.slice(0, 3) }))}
              />
              <CampoSelect
                label="Rede"
                largura={130}
                value={f.rede}
                onChange={(v) => setCampo('rede', v)}
                options={[
                  { v: '', l: 'Todas' },
                  { v: 'carone', l: 'Carone' },
                  { v: 'extrabom', l: 'ExtraBOM' },
                ]}
              />
              <CampoSelect
                label="Tipo Loja"
                largura={130}
                value={f.tipoLoja}
                onChange={(v) => setCampo('tipoLoja', v)}
                options={[
                  { v: '', l: 'Todas' },
                  { v: 'nova', l: 'Loja Nova' },
                  { v: 'existente', l: 'Existente' },
                ]}
              />
              <CampoSelect
                label="Tipo Grupo"
                largura={140}
                value={f.tipoGrupo}
                onChange={(v) => setCampo('tipoGrupo', v)}
                options={[
                  { v: '', l: 'Todos' },
                  { v: 'varejo', l: 'Varejo' },
                  { v: 'atacado', l: 'Atacado VEM' },
                ]}
              />
              <CampoSelect
                label="Tipo Venda"
                largura={135}
                value={f.tipoVenda}
                onChange={(v) => setCampo('tipoVenda', v)}
                options={[
                  { v: '', l: 'Todos' },
                  { v: 'loja', l: 'Stores' },
                  { v: 'ecommerce', l: 'Ecommerce' },
                ]}
              />
              <CampoSelect
                label="Loja"
                largura={210}
                value={f.loja}
                onChange={(v) => setCampo('loja', v)}
                options={[
                  { v: '', l: 'Todas' },
                  ...(dados.lojas || []).map((l) => ({ v: String(l.codparc), l: l.loja })),
                ]}
              />
              <CampoSelect
                label="Supervisor"
                largura={260}
                value={f.supervisor}
                onChange={(v) => setCampo('supervisor', v)}
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
          className="px-3 py-2 rounded-lg border text-[11px] flex items-start gap-2"
          style={{ background: T.tintAmber, borderColor: '#fde68a', color: T.warn }}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>{dados.aviso}</div>
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
            if (blocoArrastando) e.preventDefault()
          }}
          onDrop={(e) => {
            if (blocoArrastando) {
              e.preventDefault()
              soltarBloco(idx)
            }
          }}
        >
          {idx > 0 && (
            <div className="flex items-center gap-1.5 mb-1 group/sep">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: T.muted }}>
                {b === 'cards' ? 'indicadores' : b === 'grade' ? 'grade' : 'gráfico'}
              </span>
              <span className="flex-1 h-px" style={{ background: T.border }} />
              <button
                type="button"
                draggable
                onDragStart={() => setBlocoArrastando(b)}
                onDragEnd={() => setBlocoArrastando(null)}
                title="Arraste para reposicionar"
                className="opacity-0 group-hover/sep:opacity-100 px-1 rounded border text-[9px] inline-flex items-center gap-0.5 cursor-grab"
                style={{ borderColor: T.border, color: T.muted, background: T.card }}
              >
                <GripVertical className="h-2.5 w-2.5" /> mover
              </button>
            </div>
          )}
          <div className={cn(blocoArrastando === b && 'opacity-60')}>{mapaBlocos[b]}</div>
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
          fmtBRL(K.faturamento) +
          ', venda orçada ' +
          fmtBRL(K.meta_venda) +
          ' (atingimento ' +
          fmtPct(K.faturamento_ating ?? null) +
          ')' +
          ', quantidade ' +
          fmtNum(K.quantidade_kg) +
          ', preço médio ' +
          fmtBRL(K.preco_medio, 2) +
          ', ticket médio ' +
          fmtBRL(K.ticket_medio, 2) +
          ', cupons ' +
          fmtNum(K.cupons) +
          ', lojas ' +
          nLojas +
          ', funcionários ' +
          fmtNum(K.funcionarios ?? null) +
          '.'
        }
        loja={parecerLoja}
        contextoLoja={
          parecerLoja
            ? 'Loja ' +
              parecerLoja.loja +
              ' (rede ' +
              parecerLoja.rede +
              '). Faturamento ' +
              fmtBRL(parecerLoja.faturamento) +
              ', orçado ' +
              fmtBRL(parecerLoja.meta ?? null) +
              ' (atingimento ' +
              fmtPct(parecerLoja.ating_venda ?? null) +
              '), A.A. ' +
              fmtPct(parecerLoja.cresc_aa ?? null) +
              ', funcionários ' +
              fmtNum(parecerLoja.funcionarios ?? null) +
              '.'
            : ''
        }
      />
    </div>
  )
}
