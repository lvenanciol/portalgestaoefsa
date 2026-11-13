import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  TrendingDown,
  Percent,
  Package,
  Tag,
  Receipt,
  Ticket,
  Store,
  DollarSign,
  ShoppingCart,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ParceiroParecerDialog } from '@/components/varejo/ParceiroParecerDialog'
import { useBotoes } from '@/services/botoes-service'
import { cn } from '@/lib/utils'

// ============================================================================
// DESEMPENHO POR UNIDADE — camada de apresentação (13/11/2026)
//
// ESCOPO: só HTML/CSS/JS. Nenhuma query, endpoint, KPI ou rota alterada.
//
// CORREÇÕES DESTA RODADA (print do dono):
//  a) Tela cheia em TODOS os gráficos e na grade.
//  b) Dropdown de supervisor não estoura mais o layout (min-w-0 + truncate).
//  c) Grade reorganizada: larguras explícitas por coluna (colgroup) — o
//     table-fixed sem width espremia tudo e truncava em "Caro…", "R$ 2…".
//  d) Cards Faturamento/CMV/Quebra: rodapé centralizado com % da meta e % A.A.
//  e) Cards Quantidade/Preço/Cupons/Ticket: rodapé com % M.A e % A.A.
//  f) Cada card tem ícone e cor próprios.
//  g) Colunas por loja preenchidas a partir do Sankhya (ver hook).
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

const SEGMENTOS: { id: Aba; label: string }[] = [
  { id: 'varejo', label: 'Varejo (Carone + Extrabom)' },
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
}

interface Resposta {
  schema_v: number
  ok: boolean
  aba: Aba
  periodo: string
  kpis: Record<string, number | null>
  origem: Record<string, string>
  serie: { MES: string; ANO: string; FAT: number | null }[]
  lojas: Loja[]
  supervisores: { codparc: string | number; nome: string; qtd?: number; email?: string | null }[]
  falhas?: string[]
  aviso?: string
  do_cache?: boolean
  stale?: boolean
  cache_idade_min?: number
}

const fmtNum = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtBRL = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: dec,
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

const fmtPct = (v: number | null | undefined, dec = 1) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(dec).replace('.', ',') + '%'

// ============================================================================
// CARD — ícone e cor próprios; rodapé centralizado com as variações
// ============================================================================
type CardTone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet'

const TONE: Record<CardTone, { icon: string; bg: string; text: string }> = {
  green: { icon: T.pos, bg: T.tintGreen, text: T.pos },
  amber: { icon: T.warn, bg: T.tintAmber, text: T.warn },
  red: { icon: T.neg, bg: T.tintRed, text: T.neg },
  gray: { icon: T.muted, bg: T.input, text: T.muted },
  blue: { icon: '#1d4ed8', bg: '#eff6ff', text: '#1d4ed8' },
  violet: { icon: '#6d28d9', bg: '#f5f3ff', text: '#6d28d9' },
}

interface CardVars {
  label: string
  valor: number | null
  tom?: CardTone
  inverso?: boolean
}

function ScoreCard({
  id,
  label,
  valor,
  contexto,
  Icone,
  tom,
  variacoes,
  arrastavel,
  onDragStart,
  onDragOver,
  onDrop,
  onMover,
  onOcultar,
  dragAtivo,
}: {
  id: string
  label: string
  valor: string
  contexto?: string
  Icone: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  tom: CardTone
  variacoes: CardVars[]
  arrastavel?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onMover?: (dir: -1 | 1) => void
  onOcultar?: () => void
  dragAtivo?: boolean
}) {
  const c = TONE[tom]
  return (
    <div
      data-card={id}
      draggable={arrastavel}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative h-full flex flex-col bg-white border p-3 transition-shadow hover:shadow-sm',
        dragAtivo && 'ring-2 ring-offset-1',
      )}
      style={{ borderColor: T.border, borderRadius: 6, cursor: arrastavel ? 'grab' : 'default' }}
    >
      {/* controles no próprio item (item f) */}
      <div className="absolute top-1 right-1 z-20 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 border rounded shadow-sm px-0.5">
        {onMover && (
          <>
            <button
              type="button"
              onClick={() => onMover(-1)}
              title="Mover para a esquerda"
              className="p-0.5 hover:bg-gray-100 rounded"
              style={{ color: T.muted }}
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onMover(1)}
              title="Mover para a direita"
              className="p-0.5 hover:bg-gray-100 rounded"
              style={{ color: T.muted }}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </>
        )}
        {onOcultar && (
          <button
            type="button"
            onClick={onOcultar}
            title="Ocultar card"
            className="p-0.5 hover:bg-gray-100 rounded"
            style={{ color: T.muted }}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* cabeçalho: ícone + label */}
      <div className="flex items-center gap-1.5 pr-12">
        <span
          className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded"
          style={{ background: c.bg, color: c.icon }}
        >
          <Icone className="h-3 w-3" />
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.05em] truncate"
          style={{ color: T.muted }}
        >
          {label}
        </span>
      </div>

      <div
        className="text-[22px] font-bold leading-none mt-1.5 tabular-nums"
        style={{ color: T.text }}
      >
        {valor}
      </div>

      {contexto && (
        <div className="text-[10px] mt-0.5 truncate" style={{ color: T.muted }} title={contexto}>
          {contexto}
        </div>
      )}

      {/* rodapé CENTRALIZADO com as variações (itens d e e) */}
      <div className="mt-auto pt-2 flex items-center justify-center gap-2 flex-wrap text-[10px] leading-none">
        {variacoes.map((v, i) => {
          const n = v.valor
          if (n === null || n === undefined) {
            return (
              <span key={i} className="inline-flex items-center gap-0.5" style={{ color: T.muted }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.muted }} />
                {v.label} —
              </span>
            )
          }
          const positivo = v.inverso ? n < 0 : n > 0
          const neutro = Math.abs(n) < 0.05
          const cor = neutro ? T.muted : positivo ? T.pos : T.neg
          const Ico = neutro ? Minus : n > 0 ? ArrowUpRight : ArrowDownRight
          return (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 font-semibold tabular-nums"
              style={{ color: cor }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
              <Ico className="h-2.5 w-2.5" />
              {v.label} {(n > 0 ? '+' : '') + n.toFixed(1).replace('.', ',')}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Painel de filtros (mantido da rodada aprovada)
// ============================================================================
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
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-[11px] shrink-0 max-w-[220px]"
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
}) {
  return (
    // min-w-0 é o que impede o select de estourar a célula do grid (item b)
    <div className="min-w-0 w-full">
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

// ============================================================================
// Drawer de atenção
// ============================================================================
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
  onVer: (codparc: number) => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!aberto) return
    const onDown = (ev: MouseEvent) => {
      const alvo = ev.target as Node
      if (ref.current?.contains(alvo) || anchorRef.current?.contains(alvo)) return
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
        const foc = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        )
        if (!foc.length) return
        const p = foc[0]
        const u = foc[foc.length - 1]
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
            Nenhum alerta para a seleção atual.
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

// ============================================================================
// Colunas da grade — larguras EXPLÍCITAS (item c: sem sobreposição)
// ============================================================================
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
    largura: 82,
    alinhamento: 'left',
    tipo: 'texto',
    visivelPadrao: true,
  },
  {
    id: 'loja',
    label: 'Loja',
    largura: 190,
    alinhamento: 'left',
    tipo: 'texto',
    visivelPadrao: true,
  },
  {
    id: 'participacao',
    label: 'Part. %',
    largura: 72,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: true,
  },
  {
    id: 'meta',
    label: 'Venda Orçada',
    largura: 118,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'faturamento',
    label: 'Venda Realizada',
    largura: 128,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'ating',
    label: '% Atg',
    largura: 88,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: true,
  },
  {
    id: 'cresc_aa',
    label: '% Cresc A.A',
    largura: 104,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: true,
  },
  {
    id: 'preco_medio',
    label: 'Preço Médio',
    largura: 104,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: true,
  },
  {
    id: 'quantidade',
    label: 'Qtde/Kg',
    largura: 100,
    alinhamento: 'right',
    tipo: 'num',
    visivelPadrao: false,
  },
  {
    id: 'qtd_aa',
    label: '% Qtde/Kg A.A',
    largura: 116,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'preco_aa',
    label: '% Pc Médio A.A',
    largura: 122,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'cupons',
    label: 'Cupom',
    largura: 82,
    alinhamento: 'right',
    tipo: 'num',
    visivelPadrao: false,
  },
  {
    id: 'cupons_aa',
    label: '% Cupom A.A',
    largura: 108,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'ticket_medio',
    label: 'Ticket Médio',
    largura: 108,
    alinhamento: 'right',
    tipo: 'brl',
    visivelPadrao: false,
  },
  {
    id: 'ticket_aa',
    label: '% T. Médio A.A',
    largura: 118,
    alinhamento: 'right',
    tipo: 'delta',
    visivelPadrao: false,
  },
  {
    id: 'cmv_orcado',
    label: '% CMV Orçado',
    largura: 112,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'cmv_mensal',
    label: '% CMV Mensal',
    largura: 112,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'cmv_parcial',
    label: '% CMV Parcial',
    largura: 114,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'limite_quebra',
    label: '% Lim. Quebra',
    largura: 112,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
  {
    id: 'quebra',
    label: '% Quebra',
    largura: 92,
    alinhamento: 'right',
    tipo: 'pct',
    visivelPadrao: false,
  },
]

const CHAVE_FILTROS_ABERTOS = 'pge_desempenho_filtros_aberto'
const CHAVE_COLUNAS = 'pge_desempenho_colunas_v4'
const CHAVE_CARDS = 'pge_desempenho_cards_v4'

function lerColunas(): { ordem: string[]; ocultas: string[] } {
  const padrao = {
    ordem: COLUNAS.map((c) => c.id as string),
    ocultas: COLUNAS.filter((c) => !c.visivelPadrao).map((c) => c.id as string),
  }
  try {
    const raw = localStorage.getItem(CHAVE_COLUNAS)
    if (!raw) return padrao
    const o = JSON.parse(raw) as { ordem?: string[]; ocultas?: string[] }
    const base = COLUNAS.map((c) => c.id as string)
    const ordem = (o.ordem || []).filter((id) => base.includes(id))
    return {
      ordem: ordem.concat(base.filter((id) => !ordem.includes(id))),
      ocultas: (o.ocultas || []).filter((id) => base.includes(id)),
    }
  } catch (_e) {
    return padrao
  }
}

// Ordem dos cards (item f)
const CARDS_IDS = ['fat', 'cmv', 'quebra', 'qtd', 'preco', 'cupons', 'ticket', 'lojas'] as const
type CardId = (typeof CARDS_IDS)[number]

function lerCards(): { ordem: CardId[]; ocultos: CardId[] } {
  const padrao = { ordem: [...CARDS_IDS] as CardId[], ocultos: [] as CardId[] }
  try {
    const raw = localStorage.getItem(CHAVE_CARDS)
    if (!raw) return padrao
    const o = JSON.parse(raw) as { ordem?: string[]; ocultos?: string[] }
    const base = CARDS_IDS as unknown as string[]
    const ordem = (o.ordem || []).filter((id) => base.includes(id)) as CardId[]
    return {
      ordem: ordem.concat(base.filter((id) => !ordem.includes(id)) as CardId[]),
      ocultos: (o.ocultos || []).filter((id) => base.includes(id)) as CardId[],
    }
  } catch (_e) {
    return padrao
  }
}

// ============================================================================
// PÁGINA
// ============================================================================
export default function DesempenhoPage() {
  const { pode } = useBotoes()
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

  // filtros: lê da URL no primeiro render (deep link)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const abaRaw = (q.get('aba') || 'varejo') as Aba
    const aba = SEGMENTOS.some((s) => s.id === abaRaw) ? abaRaw : 'varejo'
    setF({
      aba,
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

  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  useEffect(() => {
    try {
      setFiltrosAbertos(localStorage.getItem(CHAVE_FILTROS_ABERTOS) === '1')
    } catch (_e) {
      /* sem localStorage */
    }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FILTROS_ABERTOS, filtrosAbertos ? '1' : '0')
    } catch (_e) {
      /* idem */
    }
  }, [filtrosAbertos])

  const [colCfg, setColCfg] = useState(lerColunas)
  const [menuColunas, setMenuColunas] = useState(false)
  const [ordem, setOrdem] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const arrastandoCol = useRef<string | null>(null)

  const [cards, setCards] = useState(lerCards)
  const [cardArrastando, setCardArrastando] = useState<CardId | null>(null)

  const [drawerAberto, setDrawerAberto] = useState(false)
  const bellRef = useRef<HTMLDivElement | null>(null)

  const [telaCheia, setTelaCheia] = useState<'grafico' | 'grade' | null>(null)
  useEffect(() => {
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setTelaCheia(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<Loja | null>(null)
  const [busca, setBusca] = useState('')

  const salvarColunas = (cfg: { ordem: string[]; ocultas: string[] }) => {
    setColCfg(cfg)
    try {
      localStorage.setItem(CHAVE_COLUNAS, JSON.stringify(cfg))
    } catch (_e) {
      /* idem */
    }
  }
  const salvarCards = (cfg: { ordem: CardId[]; ocultos: CardId[] }) => {
    setCards(cfg)
    try {
      localStorage.setItem(CHAVE_CARDS, JSON.stringify(cfg))
    } catch (_e) {
      /* idem */
    }
  }

  const setCampo = (campo: keyof typeof f, valor: string | number) =>
    setF((p) => ({ ...p, [campo]: valor }))

  // URL espelha os filtros
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

  const seriePivot = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    for (const s of dados?.serie || []) {
      const m = String(s.MES || '').padStart(2, '0')
      if (!mapa[m]) mapa[m] = {}
      mapa[m][String(s.ANO)] = Number(s.FAT) || 0
    }
    const anos = Array.from(
      new Set((dados?.serie || []).map((s) => String(s.ANO || '')).filter(Boolean)),
    ).sort()
    const ultimoAno = anos[anos.length - 1]
    return Object.keys(mapa)
      .sort()
      .map((m) => {
        const linha: Record<string, any> = { mes: MESES_CURTOS[Number(m) - 1] || m }
        for (const a of anos) linha[a] = mapa[m][a] ?? null
        if (ultimoAno) {
          const valor = mapa[m][ultimoAno] ?? null
          linha[ultimoAno] = Number(m) <= ultimoFechado ? valor : null
          linha[ultimoAno + ' parcial'] = Number(m) >= ultimoFechado ? valor : null
        }
        return linha
      })
  }, [dados, ultimoFechado])

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
      const atg = l.ating_venda
      if (atg !== null && atg !== undefined && atg < LIMIAR_ATG.atencao) {
        out.push({
          id: 'atg-' + l.codparc,
          loja: l.loja,
          descricao: `Atingimento ${fmtPct(atg)}`,
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
          id: 'qbr-' + l.codparc,
          loja: l.loja,
          descricao: `Quebra ${fmtPct(l.quebra - l.limite_quebra)} acima da meta`,
          tom: 'amber',
          codparc: l.codparc,
        })
      } else if (l.meta === null || l.meta === undefined) {
        out.push({
          id: 'meta-' + l.codparc,
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
    }
    return arr
  }, [dados, ordem, busca])

  const valorColuna = (l: Loja, c: ColDef) =>
    c.id === 'ating'
      ? (l.ating_venda ?? null)
      : c.id === 'meta'
        ? (l.meta ?? null)
        : ((l as any)[c.id] ?? null)

  const moverColuna = (de: string, para: string) => {
    if (de === para) return
    const arr = [...colCfg.ordem]
    const iDe = arr.indexOf(de)
    const iPara = arr.indexOf(para)
    if (iDe < 0 || iPara < 0) return
    arr.splice(iDe, 1)
    arr.splice(iPara, 0, de)
    salvarColunas({ ...colCfg, ordem: arr })
  }

  const moverCard = (id: CardId, dir: -1 | 1) => {
    const arr = [...cards.ordem]
    const i = arr.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    arr.splice(i, 1)
    arr.splice(j, 0, id)
    salvarCards({ ...cards, ordem: arr })
  }

  const soltarCard = (destino: CardId) => {
    if (!cardArrastando || cardArrastando === destino) return
    const arr = [...cards.ordem]
    const de = arr.indexOf(cardArrastando)
    const para = arr.indexOf(destino)
    if (de < 0 || para < 0) return
    arr.splice(de, 1)
    arr.splice(para, 0, cardArrastando)
    salvarCards({ ...cards, ordem: arr })
    setCardArrastando(null)
  }

  const exportar = () => {
    const cab = colunasVisiveis.map((c) => c.label)
    const body = linhas.map((l) =>
      colunasVisiveis.map((c) => {
        const v = valorColuna(l, c)
        return v === null || v === undefined ? '' : String(v).replace(/;/g, ',')
      }),
    )
    const csv = [cab, ...body].map((r) => r.join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'desempenho-unidades-' + f.ano + '-' + String(f.mes).padStart(2, '0') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const verLoja = (codparc: number) => {
    const l = (dados?.lojas || []).find((x) => x.codparc === codparc)
    if (!l) return
    setParecerLoja(l)
    setParecerAberto(true)
    setDrawerAberto(false)
  }

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
        <AlertTriangle className="h-4 w-4" /> Erro ao carregar: {erro || 'sem dados'}
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

  const nomeSegmento = SEGMENTOS.find((s) => s.id === f.aba)?.label || 'Varejo'
  const nomeSupervisor =
    (dados.supervisores || []).find((s) => String(s.codparc) === f.supervisor)?.nome || 'Todos'

  // ---- definição dos cards (d, e, f) ----
  const defs: Record<
    CardId,
    { label: string; valor: string; contexto?: string; Icone: any; tom: CardTone; vars: CardVars[] }
  > = {
    fat: {
      label: 'Faturamento',
      valor: fmtCompacto(k.faturamento),
      contexto: fmtBRL(k.faturamento),
      Icone: TrendingUp,
      tom: (k.faturamento_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'Meta', valor: k.faturamento_ating ?? null },
        { label: 'A.A.', valor: k.faturamento_aa ?? null },
      ],
    },
    cmv: {
      label: 'CMV Parcial',
      valor: fmtPct(k.cmv_pct ?? null, 2),
      contexto: 'meta ' + fmtPct(k.meta_cmv ?? null, 1),
      Icone: Percent,
      tom: (k.cmv_ating ?? 100) >= 100 ? 'green' : 'amber',
      vars: [
        { label: 'Meta', valor: k.cmv_ating ?? null, inverso: true },
        { label: 'A.A.', valor: k.cmv_aa ?? null, inverso: true },
      ],
    },
    quebra: {
      label: 'Quebra Varejo',
      valor: fmtPct(k.quebra_pct ?? null, 2),
      contexto: 'limite ' + fmtPct(k.limite_perda ?? null, 1),
      Icone: AlertTriangle,
      tom: (k.quebra_ating ?? 100) <= 100 ? 'green' : 'red',
      vars: [
        { label: 'Meta', valor: k.quebra_ating ?? null, inverso: true },
        { label: 'A.A.', valor: k.quebra_ma ?? null, inverso: true },
      ],
    },
    qtd: {
      label: 'Qtde / Kg',
      valor: fmtCompacto(k.quantidade_kg),
      contexto: fmtNum(k.quantidade_kg) + ' un/kg',
      Icone: Package,
      tom: (k.quantidade_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: k.quantidade_ma ?? null },
        { label: 'A.A.', valor: k.quantidade_aa ?? null },
      ],
    },
    preco: {
      label: 'Preço Médio',
      valor: fmtBRL(k.preco_medio, 2),
      Icone: Tag,
      tom: (k.preco_aa ?? 0) >= 0 ? 'green' : 'red',
      vars: [
        { label: 'M.A.', valor: k.preco_ma ?? null },
        { label: 'A.A.', valor: k.preco_aa ?? null },
      ],
    },
    cupons: {
      label: 'Cupons',
      valor: fmtNum(k.cupons),
      Icone: Receipt,
      tom: (k.cupons_aa ?? 0) >= 0 ? 'blue' : 'red',
      vars: [
        { label: 'M.A.', valor: k.cupons_ma ?? null },
        { label: 'A.A.', valor: k.cupons_aa ?? null },
      ],
    },
    ticket: {
      label: 'Ticket Médio',
      valor: fmtBRL(k.ticket_medio, 0),
      Icone: Ticket,
      tom: (k.ticket_aa ?? 0) >= 0 ? 'violet' : 'red',
      vars: [
        { label: 'M.A.', valor: k.ticket_ma ?? null },
        { label: 'A.A.', valor: k.ticket_aa ?? null },
      ],
    },
    lojas: {
      label: 'Lojas',
      valor: fmtNum(dados.lojas.length),
      contexto: dados.lojas.filter((l) => l.loja_nova).length + ' novas',
      Icone: Store,
      tom: 'gray',
      vars: [],
    },
  }

  const cardsVisiveis = cards.ordem.filter((id) => !cards.ocultos.includes(id))
  const emCheio = (tipo: 'grafico' | 'grade') => telaCheia === tipo

  return (
    <div className="space-y-3 pb-8" style={{ background: T.bg }}>
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight" style={{ color: T.text }}>
            Desempenho por Unidade
          </h1>
          <p className="text-[11px]" style={{ color: T.muted }}>
            {nomeSegmento} · {MESES[f.mes - 1]}/{f.ano}
            {dados.do_cache && (
              <span className="ml-1.5">
                · {dados.stale ? 'cache antigo' : 'cache'}
                {dados.cache_idade_min ? ` ${dados.cache_idade_min} min` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {cards.ocultos.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => salvarCards({ ...cards, ocultos: [] })}
              className="h-8 text-[11px]"
              style={{ borderRadius: 6 }}
            >
              <Eye className="h-3 w-3 mr-1" /> Reexibir ({cards.ocultos.length})
            </Button>
          )}
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
              className="h-8 text-[11px]"
              style={{ borderRadius: 6 }}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} /> Atualizar
            </Button>
          )}
        </div>
      </div>

      {/* painel de filtros (mantido) */}
      <div className="bg-white border" style={{ borderColor: T.border, borderRadius: 8 }}>
        <div className="flex items-center gap-2 px-3 h-[50px] overflow-x-auto">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold shrink-0"
            style={{ color: T.text }}
          >
            <Filter className="h-3.5 w-3.5" style={{ color: T.nav }} />
            Filtros
            {filtrosAbertos ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <Chip
              rotulo="Segmento"
              valor={nomeSegmento}
              onRemover={() => setCampo('aba', 'varejo')}
            />
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
              rotulo="Tipo Loja"
              valor={
                f.tipoLoja === 'nova'
                  ? 'Loja Nova'
                  : f.tipoLoja === 'existente'
                    ? 'Existente'
                    : 'Todas'
              }
              onRemover={() => setCampo('tipoLoja', '')}
            />
            <Chip
              rotulo="Supervisor"
              valor={nomeSupervisor}
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
              {filtrosAbertos ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
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
            {dados.do_cache && (
              <span className="text-[10px]" style={{ color: T.muted }}>
                cache {dados.cache_idade_min ?? 0} min
              </span>
            )}
          </div>
        </div>

        {filtrosAbertos && (
          <>
            <div className="border-t" style={{ borderColor: T.border }} />
            {/* grid 100% da largura; minmax evita estouro (item b) */}
            <div className="px-3 py-2.5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3 items-end">
              <CampoSelect
                label="Segmento"
                value={f.aba}
                onChange={(v) => setCampo('aba', v)}
                options={SEGMENTOS.map((s) => ({ v: s.id, l: s.label }))}
              />
              <CampoSelect
                label="Ano"
                value={String(f.ano)}
                onChange={(v) => setCampo('ano', Number(v))}
                options={[anoCorrente - 2, anoCorrente - 1, anoCorrente, anoCorrente + 1].map(
                  (a) => ({ v: String(a), l: String(a) }),
                )}
              />
              <CampoSelect
                label="Mês"
                value={String(f.mes)}
                onChange={(v) => setCampo('mes', Number(v))}
                options={MESES.map((m, i) => ({ v: String(i + 1), l: m.slice(0, 3) }))}
              />
              <CampoSelect
                label="Rede"
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
                value={f.loja}
                onChange={(v) => setCampo('loja', v)}
                options={[
                  { v: '', l: 'Todas' },
                  ...(dados.lojas || []).map((l) => ({ v: String(l.codparc), l: l.loja })),
                ]}
              />
              <CampoSelect
                label="Supervisor"
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

      {dados.falhas && dados.falhas.length > 0 && (
        <div
          className="px-3 py-2 rounded-lg border text-[11px]"
          style={{ background: T.tintAmber, borderColor: '#fde68a', color: T.warn }}
        >
          <b>{dados.falhas.length} consulta(s) com falha</b>
          <ul className="list-disc pl-4 mt-0.5">
            {dados.falhas.map((x, i) => (
              <li key={i} className="font-mono text-[10px] break-all">
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SCORECARD — cards idênticos, arrastáveis, ocultáveis (item f) */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 items-stretch">
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
              arrastavel
              dragAtivo={cardArrastando === id}
              onDragStart={() => setCardArrastando(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltarCard(id)}
              onMover={(dir) => moverCard(id, dir)}
              onOcultar={() => salvarCards({ ...cards, ocultos: cards.ocultos.concat([id]) })}
            />
          )
        })}
      </div>

      {/* GRADE — tela cheia (item a) e larguras explícitas (item c) */}
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
            <h2 className="text-[14px] font-semibold" style={{ color: T.text }}>
              Desempenho por loja
            </h2>
            <span className="text-[11px]" style={{ color: T.muted }}>
              {linhas.length} unidades
            </span>
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
                className="h-7 w-36 rounded border pl-6 pr-2 text-[11px] outline-none"
                style={{
                  background: T.input,
                  borderColor: T.border,
                  borderRadius: 6,
                  color: T.text,
                }}
              />
            </div>

            {alertas.length > 0 && (
              <div ref={bellRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDrawerAberto((v) => !v)}
                  aria-expanded={drawerAberto}
                  aria-controls="drawer-atencao"
                  aria-label={`Atenção: ${alertas.length} alertas`}
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
                <div id="drawer-atencao">
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
                style={{
                  borderColor: T.border,
                  color: T.text,
                  borderRadius: 6,
                  background: T.card,
                }}
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
                    const oculta = colCfg.ocultas.includes(c.id as string)
                    return (
                      <label
                        key={c.id as string}
                        className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer text-[11px] hover:bg-gray-50"
                        style={{ color: T.text }}
                      >
                        <input
                          type="checkbox"
                          checked={!oculta}
                          onChange={() => {
                            const ocultas = oculta
                              ? colCfg.ocultas.filter((x) => x !== c.id)
                              : colCfg.ocultas.concat([c.id as string])
                            salvarColunas({ ...colCfg, ocultas })
                          }}
                          className="h-3 w-3 accent-[#14532d]"
                        />
                        {oculta ? (
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
                    onClick={() =>
                      salvarColunas({
                        ordem: COLUNAS.map((c) => c.id as string),
                        ocultas: COLUNAS.filter((c) => !c.visivelPadrao).map((c) => c.id as string),
                      })
                    }
                    className="mt-1 w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded hover:bg-gray-50"
                    style={{ color: T.muted }}
                  >
                    <RotateCcw className="h-3 w-3" /> Restaurar padrão
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
              title={emCheio('grade') ? 'Sair da tela cheia' : 'Tela cheia'}
              aria-label={emCheio('grade') ? 'Sair da tela cheia' : 'Tela cheia'}
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
            className="text-[12px] w-full"
            style={{ minWidth: colunasVisiveis.reduce((a, c) => a + c.largura, 0) }}
          >
            {/* larguras explícitas: resolve sobreposição/truncamento (item c) */}
            <colgroup>
              {colunasVisiveis.map((c) => (
                <col key={c.id as string} style={{ width: c.largura }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10" style={{ background: T.card }}>
              <tr className="border-b" style={{ borderColor: T.border }}>
                {colunasVisiveis.map((c) => (
                  <th
                    key={c.id as string}
                    draggable
                    onDragStart={() => (arrastandoCol.current = 'col:' + c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (arrastandoCol.current?.startsWith('col:'))
                        moverColuna(arrastandoCol.current.replace('col:', ''), c.id as string)
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
                      ordem?.id === c.id
                        ? ordem.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={cn(
                      'py-2 px-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none',
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
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.codparc}
                  className="border-b hover:bg-[#f9fafb]"
                  style={{ borderColor: T.border, height: 38 }}
                >
                  {colunasVisiveis.map((c) => {
                    const valor = valorColuna(l, c)
                    const al = c.alinhamento === 'right' ? 'text-right' : 'text-left'

                    if (c.id === 'ating') {
                      if (valor === null || valor === undefined)
                        return (
                          <td
                            key={c.id as string}
                            className={cn('px-2 tabular-nums', al)}
                            style={{ color: T.muted }}
                          >
                            —
                          </td>
                        )
                      const vv = Number(valor)
                      const acima = vv >= LIMIAR_ATG.meta
                      const atencao = vv >= LIMIAR_ATG.atencao && vv < LIMIAR_ATG.meta
                      const fundo = acima ? T.tintGreen : atencao ? T.tintAmber : T.tintRed
                      const cor = acima ? T.pos : atencao ? T.warn : T.neg
                      return (
                        <td
                          key={c.id as string}
                          className={cn('px-2 tabular-nums', al)}
                          style={{ background: fundo }}
                        >
                          <span
                            className="inline-flex items-center gap-1 justify-end w-full font-bold"
                            style={{ color: cor }}
                          >
                            {acima ? '▲' : atencao ? '▬' : '▼'} {fmtPct(vv)}
                          </span>
                        </td>
                      )
                    }

                    if (c.tipo === 'delta') {
                      if (valor === null || valor === undefined)
                        return (
                          <td
                            key={c.id as string}
                            className={cn('px-2 tabular-nums', al)}
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

                    if (c.id === 'loja') {
                      return (
                        <td
                          key={c.id as string}
                          className="px-2 font-semibold truncate"
                          style={{ color: T.text }}
                          title={l.loja}
                        >
                          <span className="group inline-flex items-center gap-1 max-w-full">
                            <span className="truncate">{l.loja}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setParecerLoja(l)
                                setParecerAberto(true)
                              }}
                              title="Parecer desta loja"
                              className="opacity-0 group-hover:opacity-100 shrink-0"
                              style={{ color: T.nav }}
                            >
                              <Sparkles className="h-3 w-3" />
                            </button>
                          </span>
                        </td>
                      )
                    }

                    if (c.id === 'rede')
                      return (
                        <td
                          key={c.id as string}
                          className="px-2 truncate"
                          style={{ color: T.muted }}
                          title={l.rede}
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
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td
                    colSpan={colunasVisiveis.length}
                    className="py-8 text-center text-[12px]"
                    style={{ color: T.muted }}
                  >
                    Sem lojas para os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className="px-3 py-1.5 text-[10px] border-t"
          style={{ color: T.muted, borderColor: T.border }}
        >
          Arraste as colunas pelo cabeçalho para reordenar · clique para ordenar
        </div>
      </div>

      {/* GRÁFICO — tela cheia (item a) */}
      <div
        className={cn(
          'bg-white border p-3.5 flex flex-col',
          emCheio('grafico') && 'fixed inset-2 z-50 shadow-2xl',
        )}
        style={{ borderColor: T.border, borderRadius: 8 }}
      >
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold" style={{ color: T.text }}>
              Evolução Faturamento
            </h2>
            <span
              className="text-[10px] font-semibold rounded px-1.5 py-0.5 border"
              style={{ background: T.tintAmber, borderColor: '#fde68a', color: T.warn }}
              title={`${MESES_CURTOS[ultimoFechado - 1] || ''} é o último mês fechado`}
            >
              parcial
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] hidden sm:inline" style={{ color: T.muted }}>
              Clique no ano da legenda para ocultar ou exibir a linha
            </span>
            <button
              type="button"
              onClick={() => setTelaCheia(emCheio('grafico') ? null : 'grafico')}
              title={emCheio('grafico') ? 'Sair da tela cheia' : 'Tela cheia'}
              aria-label={emCheio('grafico') ? 'Sair da tela cheia' : 'Tela cheia'}
              className="inline-flex items-center justify-center h-7 w-7 rounded border shrink-0"
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
                tickFormatter={(v) => fmtCompacto(v)}
              />
              <Tooltip
                formatter={(v: any) => fmtBRL(Number(v))}
                contentStyle={{ borderRadius: 8, border: '1px solid ' + T.border, fontSize: 11 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, cursor: 'pointer' }}
                onClick={(entry: any) => {
                  const nome = String(entry?.dataKey ?? entry?.value ?? '')
                  if (!nome) return
                  setAnosOcultos((prev) =>
                    prev.includes(nome) ? prev.filter((x) => x !== nome) : prev.concat([nome]),
                  )
                }}
                formatter={(value: any, entry: any) => {
                  const nome = String(entry?.dataKey ?? value)
                  const oculto = anosOcultos.includes(nome)
                  return (
                    <span
                      style={{
                        color: oculto ? '#9ca3af' : nome.includes('parcial') ? T.warn : T.text,
                        fontWeight: oculto ? 400 : 700,
                        textDecoration: oculto ? 'line-through' : 'none',
                      }}
                    >
                      {nome}
                    </span>
                  )
                }}
              />
              {anos.map((a, i) => {
                const ultimo = anos[anos.length - 1]
                if (a === ultimo) {
                  return (
                    <Line
                      key={a + '-s'}
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
                  key="parcial"
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

      <ParceiroParecerDialog
        aberto={parecerAberto}
        onFechar={() => setParecerAberto(false)}
        abaLabel={nomeSegmento}
        contexto={
          nomeSegmento +
          ', ' +
          dados.periodo +
          '. Faturamento ' +
          fmtBRL(k.faturamento) +
          ', venda orçada ' +
          fmtBRL(k.meta_venda) +
          ' (atingimento ' +
          fmtPct(k.faturamento_ating ?? null) +
          ')' +
          ', quantidade ' +
          fmtNum(k.quantidade_kg) +
          ', preço médio ' +
          fmtBRL(k.preco_medio, 2) +
          ', ticket médio ' +
          fmtBRL(k.ticket_medio, 2) +
          ', cupons ' +
          fmtNum(k.cupons) +
          ', lojas ' +
          dados.lojas.length +
          '.'
        }
        loja={parecerLoja}
        contextoLoja={
          parecerLoja
            ? 'Loja ' +
              parecerLoja.loja +
              ' (rede ' +
              parecerLoja.rede +
              '). ' +
              'Venda realizada ' +
              fmtBRL(parecerLoja.faturamento) +
              ', venda orçada ' +
              fmtBRL(parecerLoja.meta ?? null) +
              ' (atingimento ' +
              fmtPct(parecerLoja.ating_venda ?? null) +
              ')' +
              ', crescimento A.A. ' +
              fmtPct(parecerLoja.cresc_aa ?? null) +
              ', preço médio ' +
              fmtBRL(parecerLoja.preco_medio, 2) +
              ', ticket médio ' +
              fmtBRL(parecerLoja.ticket_medio, 2) +
              ', participação ' +
              fmtPct(parecerLoja.participacao) +
              '.'
            : ''
        }
      />
    </div>
  )
}
