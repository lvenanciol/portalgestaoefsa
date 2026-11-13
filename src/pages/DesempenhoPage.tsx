import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { ParceiroParecerDialog } from '@/components/varejo/ParceiroParecerDialog'
import { useBotoes } from '@/services/botoes-service'
import { cn } from '@/lib/utils'

// TAREFA VAREJO (13/11/2026) — "Desempenho Unidades"
// Antes: "Desempenho por Unidade" (só empresa/CODEMP + títulos).
// Agora: 5 abas por bandeira, com os cards do painel de referência, na paleta
// e identidade do PGE (verde #1B5E20). Dados REAIS do Sankhya via hook
// /backend/v1/varejo/desempenho — sem número inventado: métrica que não existe
// na base volta "—" com a origem esperada no tooltip.

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

interface Resposta {
  ok: boolean
  aba: Aba
  gerado_em: string
  periodo: string
  kpis: {
    faturamento: number | null
    quantidade_kg: number | null
    preco_medio: number | null
    cupons: number | null
    ticket_medio: number | null
    cmv_pct: number | null
    quebra_pct: number | null
    quebra_geral_pct: number | null
    quebra_geral_valor_mes: number | null
    quebra_geral_valor_12m: number | null
    quebra_geral_notas_12m: number | null
  }
  origem?: Record<string, string>
  serie: any[]
  lojas: any[]
  cidades: any[]
  participacao: any[]
  falhas?: string[]
  do_cache?: boolean
  cache_idade_min?: number
}

const fmtNum = (v: number | null, dec = 0) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtBRL = (v: number | null) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtCompacto = (v: number | null) => {
  if (v === null || v === undefined) return '—'
  if (Math.abs(v) >= 1_000_000)
    return (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mi'
  if (Math.abs(v) >= 1_000)
    return (v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' Mil'
  return fmtNum(v)
}

/** Card de KPI no padrão do painel de referência, com a paleta do PGE. */
function KpiCard({
  titulo,
  valor,
  sub,
  cor = 'verde',
  tooltip,
  semDado,
}: {
  titulo: string
  valor: string
  sub?: string
  cor?: 'verde' | 'dourado' | 'cinza'
  tooltip?: string
  semDado?: boolean
}) {
  const bg = cor === 'dourado' ? 'bg-[#7A5C1E]' : cor === 'cinza' ? 'bg-[#374151]' : 'bg-[#1B5E20]'
  return (
    <div className={cn('rounded-xl p-4 text-white shadow-xs relative', bg)} title={tooltip}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-white/75">
          {titulo}
        </div>
        {tooltip && <Info className="h-3 w-3 text-white/50 shrink-0" />}
      </div>
      <div
        className={cn(
          'text-xl font-bold tabular-nums mt-1.5 leading-none',
          semDado && 'text-white/45',
        )}
      >
        {valor}
      </div>
      {sub && (
        <div className="text-[10px] text-white/70 mt-1.5 font-medium tabular-nums">{sub}</div>
      )}
      {semDado && (
        <span className="absolute top-3 right-3 text-[8px] font-bold uppercase bg-white/15 px-1.5 py-0.5 rounded">
          sem dado
        </span>
      )}
    </div>
  )
}

function CardPainel({
  titulo,
  children,
  acao,
}: {
  titulo: string
  children: React.ReactNode
  acao?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
        {acao}
      </div>
      {children}
    </div>
  )
}

export default function DesempenhoPage() {
  const { pode } = useBotoes()
  const [aba, setAba] = useState<Aba>('varejo')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // Parecer: null = aberto para a ABA inteira; objeto = aberto para uma loja
  const [parecerAberto, setParecerAberto] = useState(false)
  const [parecerLoja, setParecerLoja] = useState<any | null>(null)

  // Cache local por aba (localStorage): abrir a tela de novo mostra o último
  // resultado na hora, sem esperar o backend. O backend também tem cache de
  // 15 min; aqui é só para não piscar "carregando" a cada navegação.
  const chaveLocal = (a: Aba) => 'pge_varejo_cache_' + a

  const lerCacheLocal = (a: Aba): Resposta | null => {
    try {
      const raw = localStorage.getItem(chaveLocal(a))
      if (!raw) return null
      const obj = JSON.parse(raw) as { em: number; dados: Resposta }
      if (!obj || !obj.dados) return null
      // considera válido por 15 min, igual ao backend
      if (Date.now() - obj.em > 15 * 60 * 1000) return null
      return obj.dados
    } catch (_) {
      return null
    }
  }

  const gravarCacheLocal = (a: Aba, d: Resposta) => {
    try {
      localStorage.setItem(chaveLocal(a), JSON.stringify({ em: Date.now(), dados: d }))
    } catch (_) {}
  }

  const carregar = useCallback(async (a: Aba, forcar = false) => {
    // 1) pinta na hora com o que já está no navegador
    if (!forcar) {
      const local = lerCacheLocal(a)
      if (local) {
        setDados(local)
        setLoading(false)
        return
      }
    }
    setLoading(true)
    setErro('')
    try {
      const url = '/backend/v1/varejo/desempenho?aba=' + a + (forcar ? '&forcar=1' : '')
      const r = await pb.send(url, { method: 'GET' })
      const resp = r as Resposta
      setDados(resp)
      gravarCacheLocal(a, resp)
    } catch (e) {
      setErro(String(e))
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar(aba)
  }, [aba, carregar])

  const kpis = dados?.kpis

  // Contexto enviado à IA: monta um resumo textual do que está na tela.
  const contextoAba = useMemo(() => {
    if (!dados || !kpis) return ''
    const lojasTxt = (dados.lojas || [])
      .slice(0, 15)
      .map((l: any) => `${l.LOJA} ${fmtBRL(Number(l.FAT))}`)
      .join('; ')
    const cidTxt = (dados.cidades || [])
      .slice(0, 10)
      .map((c: any) => `${c.CIDADE} ${fmtBRL(Number(c.FAT))}`)
      .join('; ')
    const partTxt = (dados.participacao || [])
      .map((p: any) => `${p.BANDEIRA} ${fmtBRL(Number(p.FAT))}`)
      .join('; ')
    return (
      `Aba: ${ABAS.find((x) => x.id === aba)?.label}. Período: ${dados.periodo}. ` +
      `Faturamento: ${fmtBRL(kpis.faturamento)}. ` +
      `Quantidade/KG: ${fmtNum(kpis.quantidade_kg, 0)}. ` +
      `Preço médio: ${fmtBRL(kpis.preco_medio)}. ` +
      `Cupons: ${fmtNum(kpis.cupons)}. ` +
      `Ticket médio: ${fmtBRL(kpis.ticket_medio)}. ` +
      `CMV parcial: ${kpis.cmv_pct === null ? 'sem dado' : fmtNum(kpis.cmv_pct, 2) + '%'} ` +
      `(${dados.origem?.cmv_pct}). ` +
      `Quebra varejo (Resumo Lojas): ${kpis.quebra_pct === null ? 'sem dado' : fmtNum(kpis.quebra_pct, 2) + '%'} ` +
      `(${dados.origem?.quebra_pct}). ` +
      `Quebra geral da empresa (nota de perda TGFCAB): ` +
      `${kpis.quebra_geral_pct === null ? 'sem dado' : fmtNum(kpis.quebra_geral_pct, 2) + '%'} ` +
      `— ${fmtBRL(kpis.quebra_geral_valor_mes)} no mês. ` +
      (partTxt ? `Participação por bandeira: ${partTxt}. ` : '') +
      (lojasTxt ? `Ranking de lojas: ${lojasTxt}. ` : '') +
      (cidTxt ? `Faturamento por cidade: ${cidTxt}. ` : '')
    )
  }, [dados, kpis, aba])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
        <span className="ml-2 text-sm text-gray-500">Consultando o Sankhya…</span>
      </div>
    )
  }

  if (erro || !dados || !kpis) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Erro ao carregar o desempenho: {erro || 'sem dados'}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => carregar(aba, true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    )
  }

  const serieGrafico = (dados.serie || []).map((s: any) => ({
    mes: String(s.MES || '').slice(5) + '/' + String(s.MES || '').slice(2, 4),
    faturamento: Number(s.FAT) || 0,
    cupons: Number(s.CUPONS) || 0,
  }))

  const cidadesGrafico = (dados.cidades || []).slice(0, 12).map((c: any) => ({
    nome: c.CIDADE || '—',
    valor: Number(c.FAT) || 0,
  }))

  const participacaoGrafico = (dados.participacao || []).map((p: any) => ({
    name: p.BANDEIRA,
    value: Number(p.FAT) || 0,
  }))
  const totalParticipacao = participacaoGrafico.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-5 pb-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Store className="h-6 w-6 text-[#1B5E20]" />
            Desempenho Unidades
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Indicadores de varejo por bandeira — dados reais do ERP · {dados.periodo}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            onClick={() => {
              setParecerLoja(null)
              setParecerAberto(true)
            }}
            className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[12px] h-9"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Parecer
          </Button>
          {pode('desempenho', 'atualizar') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregar(aba, true)}
              className="h-9"
              title="Ignora o cache e consulta o Sankhya novamente"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200">
        {ABAS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            className={cn(
              'px-3.5 py-2 text-[12px] font-semibold rounded-t-lg transition-colors -mb-px border border-b-0',
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
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          <div className="font-bold mb-1">
            {dados.falhas.length} consulta(s) com falha — os cards abaixo podem estar incompletos
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {dados.falhas.map((f, i) => (
              <li key={i} className="font-mono text-[11px] break-all">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dados.do_cache && (
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Info className="h-3 w-3" />
          Resultado em cache do servidor
          {typeof dados.cache_idade_min === 'number' && dados.cache_idade_min > 0
            ? ` (gerado há ${dados.cache_idade_min} min)`
            : ''}
          . Use <b className="font-semibold">Atualizar</b> para consultar o Sankhya agora.
        </div>
      )}

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          titulo="Faturamento"
          valor={fmtCompacto(kpis.faturamento)}
          sub={fmtBRL(kpis.faturamento)}
        />
        <KpiCard
          titulo="Quantidade / KG"
          valor={fmtCompacto(kpis.quantidade_kg)}
          sub="soma de unidades e kg"
        />
        <KpiCard titulo="Preço Médio" valor={fmtBRL(kpis.preco_medio)} />
        <KpiCard titulo="Cupons" valor={fmtNum(kpis.cupons)} sub="notas emitidas" />
        <KpiCard titulo="Ticket Médio" valor={fmtBRL(kpis.ticket_medio)} />
        <KpiCard
          titulo="CMV Parcial"
          valor={kpis.cmv_pct === null ? '—' : fmtNum(kpis.cmv_pct, 2) + '%'}
          cor="dourado"
          semDado={kpis.cmv_pct === null}
          tooltip={dados.origem?.cmv_pct}
        />
        <KpiCard
          titulo="Quebra Varejo"
          valor={kpis.quebra_pct === null ? '—' : fmtNum(kpis.quebra_pct, 2) + '%'}
          cor="cinza"
          semDado={kpis.quebra_pct === null}
          tooltip={dados.origem?.quebra_pct}
        />
        <KpiCard
          titulo="Quebra Geral"
          valor={kpis.quebra_geral_pct === null ? '—' : fmtNum(kpis.quebra_geral_pct, 2) + '%'}
          sub={fmtBRL(kpis.quebra_geral_valor_mes) + ' em nota · mês'}
          cor="cinza"
          semDado={kpis.quebra_geral_pct === null}
          tooltip={dados.origem?.quebra_geral_pct}
        />
        <KpiCard
          titulo="Lojas / Parceiros"
          valor={fmtNum((dados.lojas || []).length)}
          sub="no ranking do período"
        />
      </div>

      {/* Evolução do faturamento (12m) */}
      <CardPainel titulo="Evolução Faturamento — 12 meses">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serieGrafico} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                tick={{ fill: '#6B7280', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(v) => fmtCompacto(v)}
              />
              <Tooltip
                formatter={(v: any) => fmtBRL(Number(v))}
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="faturamento"
                name="Venda Realizada"
                stroke={VERDE}
                strokeWidth={2.5}
                dot={{ r: 3, fill: VERDE }}
                animationDuration={600}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardPainel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Participação por bandeira */}
        {participacaoGrafico.length > 0 && (
          <CardPainel titulo="Participação por Faturamento">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={participacaoGrafico}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {participacaoGrafico.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? VERDE : i === 1 ? VERDE_CLARO : DOURADO} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(v: any, entry: any) => {
                      const val = entry?.payload?.value || 0
                      const pct = totalParticipacao ? (val / totalParticipacao) * 100 : 0
                      return `${v} ${pct.toFixed(1)}%`
                    }}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v: any) => fmtBRL(Number(v))}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardPainel>
        )}

        {/* Faturamento por cidade */}
        <div className={cn(participacaoGrafico.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <CardPainel titulo="Faturamento por Cidade">
            <div className="h-[240px] w-full">
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
                    tick={{ fill: '#6B7280', fontSize: 10 }}
                    tickFormatter={(v) => fmtCompacto(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#374151', fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip
                    formatter={(v: any) => fmtBRL(Number(v))}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
                  />
                  <Bar dataKey="valor" name="Faturamento" fill={VERDE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardPainel>
        </div>
      </div>

      {/* Ranking de lojas — cada linha tem seu próprio Parecer */}
      <CardPainel
        titulo="Desempenho por Loja"
        acao={
          <span className="text-[11px] text-gray-400">
            Clique em uma loja para gerar o parecer dela
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left font-semibold py-2 px-2">Loja</th>
                <th className="text-right font-semibold py-2 px-2">Cupons</th>
                <th className="text-right font-semibold py-2 px-2">Faturamento</th>
                <th className="text-right font-semibold py-2 px-2">Ticket</th>
                <th className="text-right font-semibold py-2 px-2 w-24">Parecer</th>
              </tr>
            </thead>
            <tbody>
              {(dados.lojas || []).map((l: any) => {
                const fat = Number(l.FAT) || 0
                const cup = Number(l.CUPONS) || 0
                return (
                  <tr key={l.LOJA} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="py-2 px-2 font-semibold text-gray-800 flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
                      {l.LOJA}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                      {fmtNum(cup)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-gray-900">
                      {fmtBRL(fat)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                      {cup > 0 ? fmtBRL(fat / cup) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setParecerLoja({ ...l, fat, cup })
                          setParecerAberto(true)
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B5E20] hover:text-[#0F3D13] hover:underline"
                      >
                        <Sparkles className="h-3 w-3" /> Parecer
                      </button>
                    </td>
                  </tr>
                )
              })}
              {(dados.lojas || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    Sem movimento no período para esta aba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardPainel>

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>
          Sankhya · TGFCAB/TGFITE/TGFPAR · mês corrente · gerado em{' '}
          {dados.gerado_em?.slice(0, 19).replace('T', ' ')}
        </span>
      </div>

      <ParceiroParecerDialog
        aberto={parecerAberto}
        onFechar={() => setParecerAberto(false)}
        abaLabel={ABAS.find((x) => x.id === aba)?.label || ''}
        contexto={contextoAba}
        loja={parecerLoja}
        contextoLoja={
          parecerLoja
            ? `Loja ${parecerLoja.LOJA}. Faturamento ${fmtBRL(parecerLoja.fat)}. ` +
              `Cupons ${fmtNum(parecerLoja.cup)}. ` +
              `Ticket médio ${parecerLoja.cup > 0 ? fmtBRL(parecerLoja.fat / parecerLoja.cup) : '—'}. ` +
              `Aba: ${ABAS.find((x) => x.id === aba)?.label}.`
            : ''
        }
      />
    </div>
  )
}
