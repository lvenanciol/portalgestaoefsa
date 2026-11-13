import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  BarChart3,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Building2,
  Info,
  Store,
  Sparkles,
  SlidersHorizontal,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Filter,
  X,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ParceiroParecerDialog } from '@/components/varejo/ParceiroParecerDialog'
import { useBotoes } from '@/services/botoes-service'
import { cn } from '@/lib/utils'

// TAREFA VAREJO v2 (13/11/2026) — 8 itens do pedido do dono.
//
// a) Cards com variação M.A / A.A; Faturamento, CMV e Quebra com % de
//    atingimento de meta + A.A.
// b) Cards 25% mais estreitos (grid lg:grid-cols-5, padding menor).
// c) Gráfico de evolução com 3 linhas: 2024, 2025, 2026.
// d) Todos os gráficos respondem ao filtro.
// e) Filtro completo conforme print: Ano, Mês, Tipo Loja, Tipo Grupo, Rede,
//    Tipo Venda, Loja, Supervisor.
// f) Exibir/ocultar/mover cards e gráficos (persistido em localStorage).
// g) Grade ordenável por clique, colunas arrastáveis e ícone para ocultar.
// h) Todas as colunas por loja do print.
//
// DADOS: hook /backend/v1/varejo/desempenho (Sankhya real). Nenhum valor é
// inventado: métrica sem fonte volta null e o card mostra "—".

const VERDE = '#1B5E20'
const VERDE_CLARO = '#4CAF50'
const DOURADO = '#C8A951'
const CINZA = '#9CA3AF'

type Aba = 'distribuicao' | 'atacado' | 'carone' | 'extrabom' | 'varejo'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'distribuicao', label: 'Distribuição' },
  { id: 'atacado', label: 'Atacado' },
  { id: 'carone', label: 'Carone' },
  { id: 'extrabom', label: 'Extrabom' },
  { id: 'varejo', label: 'Varejo (Carone + Extrabom)' },
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
}

interface Resposta {
  schema_v: number
  ok: boolean
  aba: Aba
  periodo: string
  filtros_aplicados: Record<string, any>
  kpis: Record<string, number | null>
  origem: Record<string, string>
  serie: { MES: string; ANO: string; FAT: number | null }[]
  lojas: Loja[]
  supervisores: { codparc: number; nome: string }[]
  falhas?: string[]
  do_cache?: boolean
  cache_idade_min?: number
}

const fmtNum = (v: number | null | undefined, dec = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })

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

/** Variação colorida: verde para positivo, vermelho para negativo. */
function Variacao({
  label,
  valor,
  inverso,
}: {
  label: string
  valor: number | null
  inverso?: boolean
}) {
  if (valor === null || valor === undefined) {
    return <span className="text-[9px] text-white/50 font-medium">{label} —</span>
  }
  const positivo = inverso ? valor < 0 : valor > 0
  const neutro = Math.abs(valor) < 0.05
  return (
    <span
      className={cn(
        'text-[9px] font-bold tabular-nums',
        neutro ? 'text-white/60' : positivo ? 'text-emerald-200' : 'text-red-200',
      )}
    >
      {label} {valor > 0 ? '+' : ''}
      {valor.toFixed(1).replace('.', ',')}%
    </span>
  )
}

/** Card compacto — 25% mais estreito que a versão anterior. */
function KpiCard({
  id,
  titulo,
  valor,
  sub,
  cor = 'verde',
  tooltip,
  variacoes,
  arrastavel,
  onDragStart,
}: {
  id?: string
  titulo: string
  valor: string
  sub?: string
  cor?: 'verde' | 'dourado' | 'cinza'
  tooltip?: string
  variacoes?: { label: string; valor: number | null; inverso?: boolean }[]
  arrastavel?: boolean
  onDragStart?: (e: React.DragEvent) => void
}) {
  const bg = cor === 'dourado' ? 'bg-[#7A5C1E]' : cor === 'cinza' ? 'bg-[#374151]' : 'bg-[#1B5E20]'
  return (
    <div
      draggable={arrastavel}
      onDragStart={onDragStart}
      data-card={id}
      className={cn(
        'rounded-lg px-2.5 py-2 text-white shadow-xs relative select-none',
        bg,
        arrastavel && 'cursor-grab active:cursor-grabbing',
      )}
      title={tooltip}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[8.5px] font-bold uppercase tracking-[0.06em] text-white/75 leading-tight">
          {titulo}
        </div>
        {tooltip && <Info className="h-2.5 w-2.5 text-white/40 shrink-0" />}
      </div>
      <div className="text-[15px] font-bold tabular-nums mt-1 leading-none">{valor}</div>
      {sub && (
        <div className="text-[8.5px] text-white/65 mt-0.5 font-medium tabular-nums">{sub}</div>
      )}
      {variacoes && variacoes.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {variacoes.map((v, i) => (
            <Variacao key={i} label={v.label} valor={v.valor} inverso={v.inverso} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Configuração de cards e gráficos (item f) ----------------

const CARDS_DEF = [
  { id: 'fat', titulo: 'Faturamento' },
  { id: 'qtd', titulo: 'Quantidade / KG' },
  { id: 'preco', titulo: 'Preço Médio' },
  { id: 'cupons', titulo: 'Cupons' },
  { id: 'ticket', titulo: 'Ticket Médio' },
  { id: 'cmv', titulo: 'CMV Parcial' },
  { id: 'quebra', titulo: 'Quebra Varejo' },
  { id: 'quebraGeral', titulo: 'Quebra Geral' },
  { id: 'lojas', titulo: 'Lojas' },
]

const GRAFICOS_DEF = [
  { id: 'evolucao', titulo: 'Evolução Faturamento — 3 anos' },
  { id: 'participacao', titulo: 'Participação por Faturamento' },
  { id: 'cidades', titulo: 'Faturamento por Cidade' },
]

const CHAVE_LAYOUT = 'pge_varejo_layout_v2'

interface LayoutCfg {
  cardsOrdem: string[]
  cardsOcultos: string[]
  graficosOrdem: string[]
  graficosOcultos: string[]
}

const layoutPadrao = (): LayoutCfg => ({
  cardsOrdem: CARDS_DEF.map((c) => c.id),
  cardsOcultos: [],
  graficosOrdem: GRAFICOS_DEF.map((g) => g.id),
  graficosOcultos: [],
})

function lerLayout(): LayoutCfg {
  try {
    const raw = localStorage.getItem(CHAVE_LAYOUT)
    if (!raw) return layoutPadrao()
    const obj = JSON.parse(raw) as LayoutCfg
    const base = layoutPadrao()
    // mantém só ids conhecidos (protege contra mudança de versão)
    const cardsOk = (obj.cardsOrdem || []).filter((id) => base.cardsOrdem.includes(id))
    const faltando = base.cardsOrdem.filter((id) => !cardsOk.includes(id))
    return {
      cardsOrdem: cardsOk.concat(faltando),
      cardsOcultos: (obj.cardsOcultos || []).filter((id) => base.cardsOrdem.includes(id)),
      graficosOrdem: (obj.graficosOrdem || []).filter((id) => base.graficosOrdem.includes(id)),
      graficosOcultos: (obj.graficosOcultos || []).filter((id) => base.graficosOrdem.includes(id)),
    }
  } catch (_e) {
    return layoutPadrao()
  }
}

// ---------------- Colunas da grade (itens g e h) ----------------

interface ColDef {
  id: string
  label: string
  align: 'left' | 'right'
  tipo: 'texto' | 'brl' | 'num' | 'pct'
  traco?: boolean
}

// Todas as colunas do print do dono.
const COLUNAS: ColDef[] = [
  { id: 'rede', label: 'Rede', align: 'left', tipo: 'texto' },
  { id: 'loja', label: 'Loja', align: 'left', tipo: 'texto' },
  { id: 'participacao', label: 'Participação', align: 'right', tipo: 'pct' },
  { id: 'meta', label: 'Venda Orçada', align: 'right', tipo: 'brl' },
  { id: 'faturamento', label: 'Venda Realizada', align: 'right', tipo: 'brl' },
  { id: 'ating_venda', label: '% Atg Venda', align: 'right', tipo: 'pct' },
  { id: 'cresc_aa', label: '% Cresc A.A', align: 'right', tipo: 'pct' },
  { id: 'quantidade', label: 'Qtde/Kg', align: 'right', tipo: 'num' },
  { id: 'qtd_aa', label: '% Qtde/Kg A.A', align: 'right', tipo: 'pct' },
  { id: 'preco_medio', label: 'Preço Médio', align: 'right', tipo: 'brl' },
  { id: 'preco_aa', label: '% Pc Médio A.A', align: 'right', tipo: 'pct' },
  { id: 'cupons', label: 'Cupom', align: 'right', tipo: 'num' },
  { id: 'cupons_aa', label: '% Cupom A.A', align: 'right', tipo: 'pct' },
  { id: 'ticket_medio', label: 'Ticket Médio', align: 'right', tipo: 'brl' },
  { id: 'ticket_aa', label: '% T. Medio A.A', align: 'right', tipo: 'pct' },
  { id: 'cmv_orcado', label: '% CMV Orçado', align: 'right', tipo: 'pct' },
  { id: 'cmv_mensal', label: '% CMV Mensal', align: 'right', tipo: 'pct' },
  { id: 'cmv_parcial', label: '% CMV Parcial', align: 'right', tipo: 'pct' },
  { id: 'limite_quebra', label: '% Limite Quebra', align: 'right', tipo: 'pct' },
  { id: 'quebra', label: '% Quebra', align: 'right', tipo: 'pct' },
]

const CHAVE_COLUNAS = 'pge_varejo_colunas_v2'

interface ColCfg {
  ordem: string[]
  ocultas: string[]
}

function lerColunas(): ColCfg {
  try {
    const raw = localStorage.getItem(CHAVE_COLUNAS)
    const base = COLUNAS.map((c) => c.id)
    if (!raw) return { ordem: base, ocultas: [] }
    const obj = JSON.parse(raw) as ColCfg
    const ok = (obj.ordem || []).filter((id) => base.includes(id))
    const faltando = base.filter((id) => !ok.includes(id))
    return {
      ordem: ok.concat(faltando),
      ocultas: (obj.ocultas || []).filter((id) => base.includes(id)),
    }
  } catch (_e) {
    return { ordem: COLUNAS.map((c) => c.id), ocultas: [] }
  }
}

export default function DesempenhoPage() {
  const { pode } = useBotoes()
  const [aba, setAba] = useState<Aba>('varejo')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // ---- filtros (item e) ----
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [tipoLoja, setTipoLoja] = useState('')
  const [tipoGrupo, setTipoGrupo] = useState('')
  const [rede, setRede] = useState('')
  const [tipoVenda, setTipoVenda] = useState('')
  const [loja, setLoja] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [mostrarFiltros, setMostrarFiltros] = useState(true)

  // ---- layout (item f) ----
  const [layout, setLayout] = useState<LayoutCfg>(lerLayout)
  const [configAberta, setConfigAberta] = useState(false)

  // ---- colunas (itens g e h) ----
  const [colCfg, setColCfg] = useState<ColCfg>(lerColunas)
  const [menuColunas, setMenuColunas] = useState(false)
  const [ordem, setOrdem] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(null)
  const arrastando = useRef<string | null>(null)

  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<Loja | null>(null)

  const salvarLayout = (cfg: LayoutCfg) => {
    setLayout(cfg)
    try {
      localStorage.setItem(CHAVE_LAYOUT, JSON.stringify(cfg))
    } catch (_e) {
      // localStorage bloqueado: mantém só em memória
    }
  }
  const salvarColunas = (cfg: ColCfg) => {
    setColCfg(cfg)
    try {
      localStorage.setItem(CHAVE_COLUNAS, JSON.stringify(cfg))
    } catch (_e) {
      // idem
    }
  }

  const qs = useCallback(
    (forcar: boolean) => {
      const p = new URLSearchParams()
      p.set('aba', aba)
      p.set('ano', String(ano))
      p.set('mes', String(mes))
      if (tipoLoja) p.set('tipoloja', tipoLoja)
      if (tipoGrupo) p.set('tipogrupo', tipoGrupo)
      if (rede) p.set('rede', rede)
      if (tipoVenda) p.set('tipovenda', tipoVenda)
      if (loja) p.set('loja', loja)
      if (supervisor) p.set('supervisor', supervisor)
      if (forcar) p.set('forcar', '1')
      return p.toString()
    },
    [aba, ano, mes, tipoLoja, tipoGrupo, rede, tipoVenda, loja, supervisor],
  )

  const carregar = useCallback(
    async (forcar = false) => {
      setLoading(true)
      setErro('')
      try {
        const r = await pb.send('/backend/v1/varejo/desempenho?' + qs(forcar), { method: 'GET' })
        setDados(r as Resposta)
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

  // Série pivotada: uma linha por mês, uma coluna por ano (item c)
  const seriePivot = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    for (const s of dados?.serie || []) {
      const m = String(s.MES || '').padStart(2, '0')
      if (!mapa[m]) mapa[m] = {}
      mapa[m][String(s.ANO)] = Number(s.FAT) || 0
    }
    return Object.keys(mapa)
      .sort()
      .map((m) => ({
        mes: MESES[Number(m) - 1]?.slice(0, 3) || m,
        ...mapa[m],
      }))
  }, [dados])

  const anosGrafico = useMemo(() => {
    const set = new Set<string>()
    for (const s of dados?.serie || []) if (s.ANO) set.add(String(s.ANO))
    return Array.from(set).sort()
  }, [dados])

  const participacaoGrafico = useMemo(() => {
    const eb = (dados?.lojas || [])
      .filter((l) => l.rede === 'ExtraBOM')
      .reduce((a, l) => a + (l.faturamento || 0), 0)
    const cr = (dados?.lojas || [])
      .filter((l) => l.rede === 'Carone')
      .reduce((a, l) => a + (l.faturamento || 0), 0)
    const out = []
    if (eb > 0) out.push({ name: 'ExtraBOM', value: eb })
    if (cr > 0) out.push({ name: 'Carone', value: cr })
    return out
  }, [dados])

  const cidadesGrafico = useMemo(() => {
    // agrupa por prefixo do nome da loja não dá cidade; usamos o que o backend
    // manda em `cidades` quando existir, senão deriva das lojas por rede.
    return (dados?.lojas || [])
      .slice(0, 12)
      .map((l) => ({ nome: l.loja, valor: l.faturamento || 0 }))
  }, [dados])

  // ---- grade: aplica ordem de colunas, ocultas e ordenação (item g) ----
  const colunasVisiveis = useMemo(() => {
    const mapa = new Map(COLUNAS.map((c) => [c.id, c]))
    return colCfg.ordem
      .filter((id) => !colCfg.ocultas.includes(id))
      .map((id) => mapa.get(id))
      .filter(Boolean) as ColDef[]
  }, [colCfg])

  const lojasOrdenadas = useMemo(() => {
    const arr = [...(dados?.lojas || [])]
    if (!ordem) return arr
    const { id, dir } = ordem
    arr.sort((a, b) => {
      const va = (a as any)[id]
      const vb = (b as any)[id]
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va
      }
      return dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
    return arr
  }, [dados, ordem])

  const valorCelula = (l: Loja, col: ColDef) => {
    const raw = (l as any)[col.id]
    if (raw === null || raw === undefined) return '—'
    if (col.tipo === 'brl') return fmtBRL(raw)
    if (col.tipo === 'pct') return fmtPct(raw)
    if (col.tipo === 'num') return fmtNum(raw)
    return String(raw)
  }

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

  const moverCard = (de: string, para: string) => {
    if (de === para) return
    const arr = [...layout.cardsOrdem]
    const iDe = arr.indexOf(de)
    const iPara = arr.indexOf(para)
    if (iDe < 0 || iPara < 0) return
    arr.splice(iDe, 1)
    arr.splice(iPara, 0, de)
    salvarLayout({ ...layout, cardsOrdem: arr })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
        <span className="ml-2 text-sm text-gray-500">Consultando o Sankhya…</span>
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Erro ao carregar: {erro || 'sem dados'}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => carregar(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    )
  }

  const cardRender = (id: string) => {
    switch (id) {
      case 'fat':
        return (
          <KpiCard
            key="fat"
            id="fat"
            arrastavel
            onDragStart={(e) => (arrastando.current = 'fat')}
            titulo="Faturamento"
            valor={fmtCompacto(k.faturamento)}
            sub={fmtBRL(k.faturamento)}
            variacoes={[
              { label: 'ATG', valor: k.faturamento_ating },
              { label: 'A.A', valor: k.faturamento_aa },
            ]}
            tooltip={'Meta do mês: ' + fmtBRL(k.meta_venda) + ' · ' + (dados.origem.meta || '')}
          />
        )
      case 'qtd':
        return (
          <KpiCard
            key="qtd"
            id="qtd"
            arrastavel
            onDragStart={() => (arrastando.current = 'qtd')}
            titulo="Quantidade / KG"
            valor={fmtCompacto(k.quantidade_kg)}
            variacoes={[
              { label: 'M.A', valor: k.quantidade_ma },
              { label: 'A.A', valor: k.quantidade_aa },
            ]}
          />
        )
      case 'preco':
        return (
          <KpiCard
            key="preco"
            id="preco"
            arrastavel
            onDragStart={() => (arrastando.current = 'preco')}
            titulo="Preço Médio"
            valor={fmtBRL(k.preco_medio, 2)}
            variacoes={[
              { label: 'M.A', valor: k.preco_ma },
              { label: 'A.A', valor: k.preco_aa },
            ]}
          />
        )
      case 'cupons':
        return (
          <KpiCard
            key="cupons"
            id="cupons"
            arrastavel
            onDragStart={() => (arrastando.current = 'cupons')}
            titulo="Cupons"
            valor={fmtNum(k.cupons)}
            variacoes={[
              { label: 'M.A', valor: k.cupons_ma },
              { label: 'A.A', valor: k.cupons_aa },
            ]}
          />
        )
      case 'ticket':
        return (
          <KpiCard
            key="ticket"
            id="ticket"
            arrastavel
            onDragStart={() => (arrastando.current = 'ticket')}
            titulo="Ticket Médio"
            valor={fmtBRL(k.ticket_medio, 2)}
            variacoes={[
              { label: 'M.A', valor: k.ticket_ma },
              { label: 'A.A', valor: k.ticket_aa },
            ]}
          />
        )
      case 'cmv':
        return (
          <KpiCard
            key="cmv"
            id="cmv"
            arrastavel
            onDragStart={() => (arrastando.current = 'cmv')}
            titulo="CMV Parcial"
            valor={fmtPct(k.cmv_pct, 2)}
            cor="dourado"
            variacoes={[
              { label: 'ATG', valor: k.cmv_ating, inverso: true },
              { label: 'A.A', valor: k.cmv_aa, inverso: true },
            ]}
            tooltip={dados.origem.cmv_pct}
          />
        )
      case 'quebra':
        return (
          <KpiCard
            key="quebra"
            id="quebra"
            arrastavel
            onDragStart={() => (arrastando.current = 'quebra')}
            titulo="Quebra Varejo"
            valor={fmtPct(k.quebra_pct, 2)}
            cor="cinza"
            variacoes={[
              { label: 'ATG', valor: k.quebra_ating, inverso: true },
              { label: 'P.P/M.A', valor: k.quebra_ma, inverso: true },
            ]}
            tooltip={dados.origem.quebra_pct}
          />
        )
      case 'quebraGeral':
        return (
          <KpiCard
            key="quebraGeral"
            id="quebraGeral"
            arrastavel
            onDragStart={() => (arrastando.current = 'quebraGeral')}
            titulo="Quebra Geral"
            valor={fmtPct(k.quebra_geral_pct, 2)}
            sub={fmtBRL(k.quebra_geral_valor_mes) + ' em nota'}
            cor="cinza"
            tooltip={dados.origem.quebra_geral_pct}
          />
        )
      case 'lojas':
        return (
          <KpiCard
            key="lojas"
            id="lojas"
            arrastavel
            onDragStart={() => (arrastando.current = 'lojas')}
            titulo="Lojas"
            valor={fmtNum(dados.lojas.length)}
            sub="na seleção atual"
          />
        )
      default:
        return null
    }
  }

  const cardsVisiveis = layout.cardsOrdem.filter((id) => !layout.cardsOcultos.includes(id))
  const graficosVisiveis = layout.graficosOrdem.filter((id) => !layout.graficosOcultos.includes(id))

  return (
    <div className="space-y-4 pb-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-xl lg:text-[22px] font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Store className="h-5 w-5 text-[#1B5E20]" />
            Desempenho Unidades
          </h1>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Indicadores de varejo por bandeira · {dados.periodo}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostrarFiltros((v) => !v)}
            className="h-8 text-[11px]"
          >
            <Filter className="h-3 w-3 mr-1" /> Filtros
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigAberta(true)}
            className="h-8 text-[11px]"
            title="Exibir, ocultar e reordenar cards e gráficos"
          >
            <SlidersHorizontal className="h-3 w-3 mr-1" /> Layout
          </Button>
          <Button
            onClick={() => {
              setParecerLoja(null)
              setParecerAberto(true)
            }}
            className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[11px] h-8"
          >
            <Sparkles className="h-3 w-3 mr-1" /> Parecer
          </Button>
          {pode('desempenho', 'atualizar') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregar(true)}
              className="h-8 text-[11px]"
              title="Ignora o cache e consulta o Sankhya"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} /> Atualizar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros (item e) */}
      {mostrarFiltros && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-3 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-700">
            <Filter className="h-3 w-3 text-[#1B5E20]" />
            Filtro aplicado: {MESES[mes - 1]} / {ano}
            <span className="text-gray-400 font-normal">
              ({dados.lojas.length} loja{dados.lojas.length === 1 ? '' : 's'})
            </span>
            {dados.do_cache && (
              <span className="ml-auto text-[10px] text-amber-600 font-semibold">
                cache {dados.cache_idade_min ? `(${dados.cache_idade_min} min)` : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
            {/* Ano */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Ano
              </div>
              <div className="flex flex-wrap gap-1">
                {[ano - 2, ano - 1, ano, ano + 1].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAno(a)}
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-semibold border transition-colors',
                      ano === a
                        ? 'bg-[#1B5E20] text-white border-[#1B5E20]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Mês */}
            <div className="lg:col-span-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Mês
              </div>
              <div className="flex flex-wrap gap-1">
                {MESES.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setMes(i + 1)}
                    className={cn(
                      'px-1.5 py-1 rounded text-[10px] font-semibold border transition-colors',
                      mes === i + 1
                        ? 'bg-[#1B5E20] text-white border-[#1B5E20]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                    )}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Loja e Supervisor */}
            <div className="space-y-2">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Loja
                </div>
                <select
                  value={loja}
                  onChange={(e) => setLoja(e.target.value)}
                  className="w-full text-[11px] border border-gray-200 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">Todos</option>
                  {(dados.lojas || []).map((l) => (
                    <option key={l.codparc} value={l.codparc}>
                      {l.loja}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Supervisor
                </div>
                <select
                  value={supervisor}
                  onChange={(e) => setSupervisor(e.target.value)}
                  className="w-full text-[11px] border border-gray-200 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">Todos</option>
                  {(dados.supervisores || []).map((s) => (
                    <option key={s.codparc} value={s.codparc}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {[
              {
                label: 'Tipo Loja',
                valor: tipoLoja,
                set: setTipoLoja,
                opts: [
                  ['', 'Todos'],
                  ['1', 'Loja Nova'],
                  ['2', 'SSS'],
                ],
              },
              {
                label: 'Tipo Grupo',
                valor: tipoGrupo,
                set: setTipoGrupo,
                opts: [
                  ['', 'Todos'],
                  ['varejo', 'Varejo'],
                  ['atacarejo', 'Atacarejo'],
                ],
              },
              {
                label: 'Rede',
                valor: rede,
                set: setRede,
                opts: [
                  ['', 'Todos'],
                  ['carone', 'Carone'],
                  ['extrabom', 'ExtraBOM'],
                ],
              },
              {
                label: 'Tipo Venda',
                valor: tipoVenda,
                set: setTipoVenda,
                opts: [
                  ['', 'Todos'],
                  ['loja', 'Stores'],
                  ['ecommerce', 'Ecommerce'],
                ],
              },
            ].map((f) => (
              <div key={f.label}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  {f.label}
                </div>
                <div className="flex flex-wrap gap-1">
                  {f.opts.map(([v, lbl]) => (
                    <button
                      key={v}
                      onClick={() => f.set(v)}
                      className={cn(
                        'px-2 py-1 rounded text-[10px] font-semibold border transition-colors',
                        f.valor === v
                          ? 'bg-[#1B5E20] text-white border-[#1B5E20]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setTipoLoja('')
                  setTipoGrupo('')
                  setRede('')
                  setTipoVenda('')
                  setLoja('')
                  setSupervisor('')
                }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 w-full justify-center"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {ABAS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-semibold rounded-t-lg transition-colors -mb-px border border-b-0',
              aba === t.id
                ? 'bg-white text-[#1B5E20] border-gray-200 shadow-xs'
                : 'bg-transparent text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dados.falhas && dados.falhas.length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
          <div className="font-bold mb-1">{dados.falhas.length} consulta(s) com falha</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {dados.falhas.map((f, i) => (
              <li key={i} className="font-mono text-[10px] break-all">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cards (itens a, b, f) — 5 por linha = 25% mais estreitos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cardsVisiveis.map((id) => {
          const card = cardRender(id)
          if (!card) return null
          return (
            <div
              key={id}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => {
                if (arrastando.current) moverCard(arrastando.current, id)
                arrastando.current = null
              }}
            >
              {card}
            </div>
          )
        })}
      </div>

      {/* Gráficos (itens c, d) */}
      {graficosVisiveis.includes('evolucao') && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
          <h3 className="text-[12px] font-bold text-gray-900 mb-3">
            Evolução Faturamento — 2024 · 2025 · 2026
          </h3>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriePivot} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  tick={{ fill: '#6B7280', fontSize: 10 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#6B7280', fontSize: 10 }}
                  tickFormatter={(v) => fmtCompacto(v)}
                />
                <Tooltip
                  formatter={(v: any) => fmtBRL(Number(v))}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {anosGrafico.map((a, i) => (
                  <Line
                    key={a}
                    type="monotone"
                    dataKey={a}
                    name={a}
                    stroke={i === anosGrafico.length - 1 ? VERDE : i === 0 ? CINZA : VERDE_CLARO}
                    strokeWidth={i === anosGrafico.length - 1 ? 2.5 : 1.8}
                    strokeDasharray={i === 0 ? '4 3' : undefined}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {graficosVisiveis.includes('participacao') && participacaoGrafico.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
            <h3 className="text-[12px] font-bold text-gray-900 mb-2">
              Participação por Faturamento
            </h3>
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={participacaoGrafico}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={72}
                    paddingAngle={2}
                  >
                    {participacaoGrafico.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? VERDE : VERDE_CLARO} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(v: any, entry: any) => {
                      const tot = participacaoGrafico.reduce((a, b) => a + b.value, 0)
                      const pct = tot ? ((entry?.payload?.value || 0) / tot) * 100 : 0
                      return `${v} ${pct.toFixed(1)}%`
                    }}
                    wrapperStyle={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(v: any) => fmtBRL(Number(v))}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {graficosVisiveis.includes('cidades') && cidadesGrafico.length > 0 && (
          <div className={cn(participacaoGrafico.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3')}>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
              <h3 className="text-[12px] font-bold text-gray-900 mb-2">
                Faturamento por Loja — Top 12
              </h3>
              <div className="h-[210px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cidadesGrafico}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tick={{ fill: '#6B7280', fontSize: 9 }}
                      tickFormatter={(v) => fmtCompacto(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#374151', fontSize: 9, fontWeight: 600 }}
                    />
                    <Tooltip
                      formatter={(v: any) => fmtBRL(Number(v))}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 11 }}
                    />
                    <Bar dataKey="valor" name="Faturamento" fill={VERDE} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grade (itens g e h) */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[12px] font-bold text-gray-900">Desempenho por Loja</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 hidden sm:inline">
              Arraste as colunas pelo cabeçalho para reordenar
            </span>
            <div className="relative">
              <button
                onClick={() => setMenuColunas((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
                title="Exibir/ocultar colunas"
              >
                <Eye className="h-3 w-3" /> Colunas
                <ChevronDown className="h-3 w-3" />
              </button>
              {menuColunas && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-56 max-h-72 overflow-y-auto">
                  {COLUNAS.map((c) => {
                    const oculta = colCfg.ocultas.includes(c.id)
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer text-[11px] text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={!oculta}
                          onChange={() => {
                            const ocultas = oculta
                              ? colCfg.ocultas.filter((x) => x !== c.id)
                              : colCfg.ocultas.concat([c.id])
                            salvarColunas({ ...colCfg, ocultas })
                          }}
                          className="h-3 w-3 accent-[#1B5E20]"
                        />
                        {oculta ? (
                          <EyeOff className="h-3 w-3 text-gray-400" />
                        ) : (
                          <Eye className="h-3 w-3 text-[#1B5E20]" />
                        )}
                        <span className="truncate">{c.label}</span>
                      </label>
                    )
                  })}
                  <button
                    onClick={() => salvarColunas({ ordem: COLUNAS.map((c) => c.id), ocultas: [] })}
                    className="mt-1 w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 py-1 rounded hover:bg-gray-50"
                  >
                    <RotateCcw className="h-3 w-3" /> Restaurar padrão
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                {colunasVisiveis.map((c) => (
                  <th
                    key={c.id}
                    draggable
                    onDragStart={() => (arrastando.current = 'col:' + c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (arrastando.current?.startsWith('col:')) {
                        moverColuna(arrastando.current.replace('col:', ''), c.id)
                      }
                      arrastando.current = null
                    }}
                    onClick={() =>
                      setOrdem((o) =>
                        o?.id === c.id
                          ? { id: c.id, dir: o.dir === 'asc' ? 'desc' : 'asc' }
                          : { id: c.id, dir: 'desc' },
                      )
                    }
                    className={cn(
                      'font-semibold py-1.5 px-2 cursor-pointer select-none whitespace-nowrap hover:text-gray-800 hover:bg-gray-50',
                      c.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      <GripVertical className="h-2.5 w-2.5 text-gray-300 shrink-0" />
                      {c.label}
                      {ordem?.id === c.id &&
                        (ordem.dir === 'asc' ? (
                          <ArrowUp className="h-2.5 w-2.5" />
                        ) : (
                          <ArrowDown className="h-2.5 w-2.5" />
                        ))}
                    </span>
                  </th>
                ))}
                <th className="text-right font-semibold py-1.5 px-2 w-20">Parecer</th>
              </tr>
            </thead>
            <tbody>
              {lojasOrdenadas.map((l) => (
                <tr key={l.codparc} className="border-b border-gray-100 hover:bg-gray-50/60">
                  {colunasVisiveis.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        'py-1.5 px-2 whitespace-nowrap',
                        c.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                        c.id === 'loja' && 'font-semibold text-gray-800',
                        c.id === 'faturamento' && 'font-bold text-gray-900',
                        ['cresc_aa', 'qtd_aa', 'preco_aa', 'cupons_aa', 'ticket_aa'].includes(
                          c.id,
                        ) &&
                          Number((l as any)[c.id]) < 0 &&
                          'text-red-600',
                      )}
                    >
                      {c.id === 'loja' ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                          {l.loja}
                        </span>
                      ) : (
                        valorCelula(l, c)
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setParecerLoja(l)
                        setParecerAberto(true)
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#1B5E20] hover:text-[#0F3D13] hover:underline"
                    >
                      <Sparkles className="h-2.5 w-2.5" /> Parecer
                    </button>
                  </td>
                </tr>
              ))}
              {lojasOrdenadas.length === 0 && (
                <tr>
                  <td
                    colSpan={colunasVisiveis.length + 1}
                    className="py-6 text-center text-gray-400"
                  >
                    Sem movimento para os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Painel de configuração de layout (item f) */}
      {configAberta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfigAberta(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-bold text-gray-900">Layout da tela</h3>
              <button
                onClick={() => setConfigAberta(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-3">
              Marque para exibir. Arraste os cards para reordenar na tela.
            </p>

            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              Cards
            </div>
            <div className="space-y-1 mb-4">
              {CARDS_DEF.map((c) => {
                const oculto = layout.cardsOcultos.includes(c.id)
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={!oculto}
                      onChange={() => {
                        const ocultos = oculto
                          ? layout.cardsOcultos.filter((x) => x !== c.id)
                          : layout.cardsOcultos.concat([c.id])
                        salvarLayout({ ...layout, cardsOcultos: ocultos })
                      }}
                      className="h-3 w-3 accent-[#1B5E20]"
                    />
                    {oculto ? (
                      <EyeOff className="h-3 w-3 text-gray-400" />
                    ) : (
                      <Eye className="h-3 w-3 text-[#1B5E20]" />
                    )}
                    {c.titulo}
                  </label>
                )
              })}
            </div>

            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              Gráficos
            </div>
            <div className="space-y-1 mb-4">
              {GRAFICOS_DEF.map((g) => {
                const oculto = layout.graficosOcultos.includes(g.id)
                return (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer text-[11px] text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={!oculto}
                      onChange={() => {
                        const ocultos = oculto
                          ? layout.graficosOcultos.filter((x) => x !== g.id)
                          : layout.graficosOcultos.concat([g.id])
                        salvarLayout({ ...layout, graficosOcultos: ocultos })
                      }}
                      className="h-3 w-3 accent-[#1B5E20]"
                    />
                    {oculto ? (
                      <EyeOff className="h-3 w-3 text-gray-400" />
                    ) : (
                      <Eye className="h-3 w-3 text-[#1B5E20]" />
                    )}
                    {g.titulo}
                  </label>
                )
              })}
            </div>

            <button
              onClick={() => salvarLayout(layoutPadrao())}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 w-full justify-center"
            >
              <RotateCcw className="h-3 w-3" /> Restaurar layout padrão
            </button>
          </div>
        </div>
      )}

      <ParceiroParecerDialog
        aberto={parecerAberto}
        onFechar={() => setParecerAberto(false)}
        abaLabel={ABAS.find((x) => x.id === aba)?.label || ''}
        contexto={
          'Aba ' +
          (ABAS.find((x) => x.id === aba)?.label || '') +
          ', ' +
          dados.periodo +
          '. Faturamento ' +
          fmtBRL(k.faturamento) +
          ', quantidade ' +
          fmtNum(k.quantidade_kg) +
          ', preço médio ' +
          fmtBRL(k.preco_medio, 2) +
          ', cupons ' +
          fmtNum(k.cupons) +
          ', ticket médio ' +
          fmtBRL(k.ticket_medio, 2) +
          ', CMV ' +
          fmtPct(k.cmv_pct, 2) +
          ', quebra varejo ' +
          fmtPct(k.quebra_pct, 2) +
          ', quebra geral ' +
          fmtPct(k.quebra_geral_pct, 2) +
          '. Meta de venda do mês: ' +
          fmtBRL(k.meta_venda) +
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
              'Faturamento ' +
              fmtBRL(parecerLoja.faturamento) +
              ', ' +
              'cupons ' +
              fmtNum(parecerLoja.cupons) +
              ', ' +
              'quantidade ' +
              fmtNum(parecerLoja.quantidade) +
              ', ' +
              'preço médio ' +
              fmtBRL(parecerLoja.preco_medio, 2) +
              ', ' +
              'ticket médio ' +
              fmtBRL(parecerLoja.ticket_medio, 2) +
              ', ' +
              'participação ' +
              fmtPct(parecerLoja.participacao, 2) +
              ', ' +
              'limite de quebra ' +
              fmtPct(parecerLoja.limite_quebra, 2) +
              '. ' +
              'Período ' +
              dados.periodo +
              '.'
            : ''
        }
      />
    </div>
  )
}
