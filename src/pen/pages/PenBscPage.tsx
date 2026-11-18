import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, X, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react'
import { PEN, SEMAFORO_CORES, type Semaforo } from '@/pen/tokens'
import { SectionHeader, ProgressBar } from '@/pen/components'
import { BotaoExportar, tabelaHtml, secao, esc } from '@/pen/components/BotaoExportar'
import { Skeleton, SkeletonTabela, ErroBloco, AvisoFallback } from '@/pen/components/estados'
import { usePenFiltro } from '@/pen/PenShell'
import { carregarPen, type PenDados } from '@/pen/lib/dados'
import type { CompanyScopeId, PenObjective, PenKpi, PenInitiative } from '@/pen/lib/mock'

// ============================================================================
// FASE 2.5 — BSC (Balanced Scorecard)  ·  SOMENTE LEITURA
//
// Mapa de 4 perspectivas empilhadas (Financeira → Cliente → Processos →
// Aprendizado) com setas de causa-efeito em SVG: o que está embaixo sustenta
// o que está em cima.
//
// TABELA SMART: objetivo, perspectiva, dono, indicador, baseline, meta,
// polaridade, peso e status.
//
// REGRA CRÍTICA DA FASE: "o badge de status reflete atingimento CALCULADO
// sobre o baseline, nunca valor digitado". Aqui o atingimento é sempre
// derivado de (realizado, baseline, target, polaridade) — não existe campo de
// status digitado na tela, e o `status` do banco NÃO é usado como badge.
//
// FONTE: pen_objective + pen_kpi + pen_initiative no banco (Fase 3.1), com
// sincronização incremental. Sem dado → "—", nunca zero inventado.
// ============================================================================

type Perspectiva = 'financeira' | 'cliente' | 'processos' | 'aprendizado'

const PERSPECTIVAS: Array<{
  key: Perspectiva
  nome: string
  descricao: string
  cor: string
}> = [
  {
    key: 'financeira',
    nome: 'Financeira',
    descricao: 'Resultado econômico: receita, margem e capital.',
    cor: '#1F6F78',
  },
  {
    key: 'cliente',
    nome: 'Cliente',
    descricao: 'O que o cliente percebe e escolhe.',
    cor: '#2E7D5B',
  },
  {
    key: 'processos',
    nome: 'Processos internos',
    descricao: 'O que precisa funcionar bem para entregar.',
    cor: '#C98A14',
  },
  {
    key: 'aprendizado',
    nome: 'Aprendizado e crescimento',
    descricao: 'Pessoas, cultura e tecnologia que sustentam tudo.',
    cor: '#7A5AF8',
  },
]

// ordem de empilhamento: financeira no topo
const ORDEM: Perspectiva[] = ['financeira', 'cliente', 'processos', 'aprendizado']

/**
 * Atingimento sobre o baseline, respeitando a polaridade.
 *
 *   up   (maior é melhor): (real - base) / (target - base)
 *   down (menor é melhor): (base - real) / (base - target)
 *
 * Devolve null quando falta dado ou quando a meta é igual ao baseline — nesse
 * caso NÃO existe progresso mensurável, e a tela mostra "—" em vez de inventar
 * percentual.
 */
export function atingimentoSobre(
  realizado: number | null,
  baseline: number | null,
  target: number | null,
  polarity: 'up' | 'down',
): number | null {
  if (realizado === null || baseline === null || target === null) return null
  const delta = polarity === 'down' ? baseline - target : target - baseline
  if (delta === 0) return null
  const andado = polarity === 'down' ? baseline - realizado : realizado - baseline
  return (andado / delta) * 100
}

function nivelDe(pct: number | null): Semaforo {
  if (pct === null) return 'cinza'
  if (pct >= 100) return 'verde'
  if (pct >= 70) return 'ambar'
  return 'vermelho'
}

function rotuloNivel(pct: number | null): string {
  if (pct === null) return 'sem dado'
  if (pct >= 100) return 'No alvo'
  if (pct >= 70) return 'Atenção'
  return 'Crítico'
}

function fmtValor(v: number | null, unidade?: string): string {
  if (v === null) return '—'
  const u = (unidade || '').trim()
  if (u === 'R$') {
    if (Math.abs(v) >= 1_000_000)
      return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    return `R$ ${v.toLocaleString('pt-BR')}`
  }
  if (u === '%' || u === '%/mês')
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${u ? ' ' + u : ''}`
}

export default function PenBscPage() {
  const { empresa, ciclo } = usePenFiltro()

  const escopo: CompanyScopeId =
    empresa === 'Extrafruti'
      ? 'extrafruti'
      : empresa === 'Casafruti'
        ? 'casafruti'
        : empresa === 'FoldBox'
          ? 'foldbox'
          : 'all'

  const [dados, setDados] = useState<PenDados | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [perspFiltro, setPerspFiltro] = useState<'todas' | Perspectiva>('todas')
  const [drawer, setDrawer] = useState<PenObjective | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await carregarPen(escopo))
    } catch (e: any) {
      setErro(String(e?.message || e))
    } finally {
      setCarregando(false)
    }
  }, [escopo])

  useEffect(() => {
    carregar()
  }, [carregar])

  const objetivos = useMemo(() => {
    const base = dados?.objectives.dados ?? []
    return perspFiltro === 'todas' ? base : base.filter((o) => o.perspectiva === perspFiltro)
  }, [dados, perspFiltro])

  const porPerspectiva = useMemo(() => {
    const m: Record<Perspectiva, PenObjective[]> = {
      financeira: [],
      cliente: [],
      processos: [],
      aprendizado: [],
    }
    for (const o of objetivos) {
      const p = (o.perspectiva || 'financeira') as Perspectiva
      if (m[p]) m[p].push(o)
      else m.financeira.push(o)
    }
    return m
  }, [objetivos])

  // KPI do objetivo: primeiro kpi cujo objetivo_id casa, senão o de mesmo nome
  const kpiDe = (o: PenObjective): PenKpi | null => {
    const kpis = dados?.kpis.dados ?? []
    return (
      kpis.find((k) => k.objetivo_id && k.objetivo_id === o.id) ||
      kpis.find((k) => k.nome.toLowerCase().includes(o.titulo.split(' ')[0].toLowerCase())) ||
      null
    )
  }

  const iniciativasDe = (o: PenObjective): PenInitiative[] =>
    (dados?.initiatives.dados ?? []).filter((i) => i.objetivo_id === o.id)

  // atingimento por objetivo (baseline → target com realizado do objetivo ou do KPI)
  const atingDe = (o: PenObjective): number | null => {
    const k = kpiDe(o)
    const real = o.realizado ?? k?.realizado ?? null
    const base = o.baseline ?? k?.baseline ?? null
    const meta = o.target ?? k?.target ?? null
    const pol = (o.polarity || k?.polarity || 'up') as 'up' | 'down'
    return atingimentoSobre(real, base, meta, pol)
  }

  // média ponderada das perspectivas (para o resumo do mapa)
  const resumoPerspectiva = (p: Perspectiva): number | null => {
    const itens = porPerspectiva[p]
    let pesoTotal = 0
    let soma = 0
    for (const o of itens) {
      const a = atingDe(o)
      if (a === null) continue
      const w = Number(o.weight) || 1
      soma += a * w
      pesoTotal += w
    }
    return pesoTotal ? soma / pesoTotal : null
  }

  const algumFallback = dados
    ? [dados.objectives, dados.kpis, dados.initiatives].some((b) => b.fonte === 'mock')
    : false

  const totalObj = objetivos.length
  const noAlvo = objetivos.filter((o) => {
    const a = atingDe(o)
    return a !== null && a >= 100
  }).length

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="BSC — Balanced Scorecard"
        descricao={`Mapa estratégico, metas SMART e atingimento calculado — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex items-center gap-2">
            <select
              value={perspFiltro}
              onChange={(e) => setPerspFiltro(e.target.value as any)}
              className="rounded-md border px-2 py-1 text-[11px] font-semibold"
              style={{ borderColor: PEN.borda, color: PEN.texto, background: '#FFF' }}
            >
              <option value="todas">Todas as perspectivas</option>
              {PERSPECTIVAS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.nome}
                </option>
              ))}
            </select>
            <span
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold"
              style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
            >
              <Eye className="h-3 w-3" />
              somente leitura
            </span>
            {/* 3.2 — exportação com cabeçalho + registro em pen_audit */}
            <BotaoExportar
              titulo="BSC — Balanced Scorecard"
              pronto={!carregando}
              corpo={() =>
                secao(
                  'Atingimento por perspectiva',
                  tabelaHtml(
                    ['Perspectiva', 'Objetivos', 'Atingimento'],
                    PERSPECTIVAS.map((p) => {
                      const m = resumoPerspectiva(p.key)
                      return [
                        esc(p.nome),
                        String(porPerspectiva[p.key].length),
                        m === null
                          ? '—'
                          : {
                              v: `${m.toFixed(0)}%`,
                              cls: m >= 100 ? 'verde' : m >= 70 ? 'ambar' : 'vermelho',
                            },
                      ]
                    }),
                    [1, 2],
                  ),
                ) +
                secao(
                  'Metas SMART',
                  tabelaHtml(
                    ['Objetivo', 'Perspectiva', 'Dono', 'Indicador', 'Baseline', 'Meta', 'Ating.'],
                    objetivos.map((o) => {
                      const k = kpiDe(o)
                      const a = atingDe(o)
                      return [
                        esc(o.titulo),
                        esc(
                          PERSPECTIVAS.find((x) => x.key === o.perspectiva)?.nome ||
                            String(o.perspectiva),
                        ),
                        esc(o.owner_id || '—'),
                        esc(k?.nome || '—'),
                        fmtValor(o.baseline ?? k?.baseline ?? null, k?.unidade),
                        fmtValor(o.target ?? k?.target ?? null, k?.unidade),
                        a === null
                          ? 'sem dado'
                          : {
                              v: `${a.toFixed(0)}%`,
                              cls: a >= 100 ? 'verde' : a >= 70 ? 'ambar' : 'vermelho',
                            },
                      ]
                    }),
                    [4, 5, 6],
                  ),
                )
              }
            />
          </div>
        }
      />

      {erro && <ErroBloco mensagem={erro} onTentar={carregar} />}

      {algumFallback && !carregando && (
        <div className="flex items-center gap-2">
          <AvisoFallback />
          <span className="text-[10px]" style={{ color: PEN.textoFraco }}>
            o banco não respondeu — números de referência do ciclo
          </span>
        </div>
      )}

      {/* resumo */}
      {!carregando && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 text-[11px]"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
            color: PEN.textoSecundario,
          }}
        >
          <span>
            Objetivos no escopo: <strong style={{ color: PEN.texto }}>{totalObj}</strong>
          </span>
          <span>
            No alvo: <strong style={{ color: SEMAFORO_CORES.verde.cor }}>{noAlvo}</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Atingimento calculado sobre baseline — nunca digitado
          </span>
        </div>
      )}

      {/* ================= MAPA ================= */}
      <div>
        <SectionHeader
          titulo="Mapa estratégico"
          descricao="O que está embaixo sustenta o que está em cima."
        />
        {carregando ? (
          <div
            className="space-y-2 p-3"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            <Skeleton altura={52} />
            <Skeleton altura={52} />
            <Skeleton altura={52} />
            <Skeleton altura={52} />
          </div>
        ) : (
          <div className="space-y-0">
            {ORDEM.map((pkey, idx) => {
              const p = PERSPECTIVAS.find((x) => x.key === pkey)!
              const itens = porPerspectiva[pkey]
              const media = resumoPerspectiva(pkey)
              const niv = nivelDe(media)
              const ultima = idx === ORDEM.length - 1

              return (
                <div key={pkey}>
                  <div
                    className="p-2.5"
                    style={{
                      background: PEN.cartao,
                      borderRadius: PEN.raio,
                      border: `1px solid ${PEN.borda}`,
                      borderLeft: `3px solid ${p.cor}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold" style={{ color: PEN.texto }}>
                          {p.nome}
                        </p>
                        <p className="text-[10px]" style={{ color: PEN.textoSecundario }}>
                          {p.descricao}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {media !== null && (
                          <span
                            className="text-[13px] font-extrabold tabular-nums"
                            style={{ color: SEMAFORO_CORES[niv].cor }}
                          >
                            {media.toFixed(0)}%
                          </span>
                        )}
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{
                            background: '#FFFFFF',
                            color: SEMAFORO_CORES[niv].cor,
                            border: `1px solid ${SEMAFORO_CORES[niv].cor}44`,
                          }}
                        >
                          {rotuloNivel(media)}
                        </span>
                        <span className="text-[10px]" style={{ color: PEN.textoFraco }}>
                          {itens.length} obj.
                        </span>
                      </div>
                    </div>

                    {/* nós dos objetivos */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {itens.length === 0 ? (
                        <span className="text-[10px] italic" style={{ color: PEN.textoFraco }}>
                          Nenhum objetivo nesta perspectiva no escopo.
                        </span>
                      ) : (
                        itens.map((o) => {
                          const a = atingDe(o)
                          const n = nivelDe(a)
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setDrawer(o)}
                              className="max-w-[260px] rounded-md px-2 py-1 text-left transition-colors hover:brightness-95"
                              style={{
                                background: '#FAFBFC',
                                border: `1px solid ${SEMAFORO_CORES[n].cor}44`,
                                borderLeft: `2px solid ${SEMAFORO_CORES[n].cor}`,
                              }}
                              title={o.titulo + ' — clique para ver KPIs e iniciativas'}
                            >
                              <span
                                className="block truncate text-[10.5px] font-semibold"
                                style={{ color: PEN.texto }}
                              >
                                {o.titulo}
                              </span>
                              <span
                                className="text-[9px] font-bold"
                                style={{ color: SEMAFORO_CORES[n].cor }}
                              >
                                {a === null ? 'sem dado' : a.toFixed(0) + '%'}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* seta de causa-efeito para a perspectiva de cima */}
                  {!ultima && (
                    <div className="flex h-7 items-center justify-center">
                      <svg width="40" height="28" aria-hidden="true">
                        <defs>
                          <marker
                            id={`seta-${pkey}`}
                            markerWidth="7"
                            markerHeight="7"
                            refX="5"
                            refY="3.5"
                            orient="auto"
                          >
                            <polygon points="0 0, 7 3.5, 0 7" fill={PEN.acento} />
                          </marker>
                        </defs>
                        <line
                          x1="20"
                          y1="26"
                          x2="20"
                          y2="6"
                          stroke={PEN.acento}
                          strokeWidth="1.6"
                          markerEnd={`url(#seta-${pkey})`}
                        />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ================= TABELA SMART ================= */}
      <div>
        <SectionHeader
          titulo="Metas SMART"
          descricao="Clique no objetivo para abrir KPIs e iniciativas vinculadas."
        />
        {carregando ? (
          <SkeletonTabela linhas={6} colunas={9} />
        ) : (
          <div
            className="overflow-x-auto"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ background: '#FAFBFC' }}>
                  {[
                    'Objetivo',
                    'Perspectiva',
                    'Dono',
                    'Indicador',
                    'Baseline',
                    'Meta',
                    'Pol.',
                    'Peso',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-wide"
                      style={{ color: PEN.textoFraco, borderBottom: `1px solid ${PEN.borda}` }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {objetivos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-2 py-6 text-center text-[11.5px]"
                      style={{ color: PEN.textoFraco }}
                    >
                      Nenhum objetivo no escopo selecionado.
                    </td>
                  </tr>
                ) : (
                  objetivos.map((o) => {
                    const k = kpiDe(o)
                    const a = atingDe(o)
                    const n = nivelDe(a)
                    const persp = PERSPECTIVAS.find((x) => x.key === o.perspectiva)
                    const unidade = k?.unidade
                    const real = o.realizado ?? k?.realizado ?? null
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setDrawer(o)}
                        className="cursor-pointer hover:bg-[#F7F9FA]"
                      >
                        <td
                          className="px-2 py-1.5 text-[11px] font-semibold"
                          style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {o.titulo}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[10px]"
                          style={{
                            color: persp?.cor || PEN.textoSecundario,
                            borderBottom: '1px solid #F0F2F5',
                          }}
                        >
                          {persp?.nome || o.perspectiva}
                        </td>
                        <td
                          className="px-2 py-1.5 text-[10.5px]"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {o.owner_id || '—'}
                        </td>
                        <td
                          className="px-2 py-1.5 text-[10.5px]"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {k?.nome || '—'}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[10.5px] tabular-nums"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {fmtValor(o.baseline ?? k?.baseline ?? null, unidade)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[10.5px] font-semibold tabular-nums"
                          style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {fmtValor(o.target ?? k?.target ?? null, unidade)}
                        </td>
                        <td
                          className="px-2 py-1.5 text-center"
                          style={{ borderBottom: '1px solid #F0F2F5' }}
                          title={o.polarity === 'down' ? 'menor é melhor' : 'maior é melhor'}
                        >
                          {o.polarity === 'down' ? (
                            <TrendingDown
                              className="mx-auto h-3 w-3"
                              style={{ color: PEN.atencao }}
                            />
                          ) : (
                            <TrendingUp
                              className="mx-auto h-3 w-3"
                              style={{ color: PEN.sucesso }}
                            />
                          )}
                        </td>
                        <td
                          className="px-2 py-1.5 text-center text-[10.5px] tabular-nums"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {o.weight ?? '—'}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5"
                          style={{ borderBottom: '1px solid #F0F2F5' }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                              style={{
                                background: '#FFFFFF',
                                color: SEMAFORO_CORES[n].cor,
                                border: `1px solid ${SEMAFORO_CORES[n].cor}44`,
                              }}
                              title={
                                a === null
                                  ? 'Atingimento não calculável: falta realizado, baseline ou meta'
                                  : `Calculado: realizado ${fmtValor(real, unidade)} sobre baseline ${fmtValor(o.baseline, unidade)} → meta ${fmtValor(o.target, unidade)}`
                              }
                            >
                              {a === null ? 'sem dado' : a.toFixed(0) + '%'}
                            </span>
                            <ProgressBar
                              valor={a === null ? null : Math.max(0, Math.min(100, a))}
                              cor={SEMAFORO_CORES[n].cor}
                              altura={4}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= DRAWER ================= */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(15,30,46,.35)' }}
          onClick={() => setDrawer(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto p-4"
            style={{ background: '#FFFFFF' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className="text-[9.5px] font-bold uppercase tracking-wide"
                  style={{ color: PEN.textoFraco }}
                >
                  {PERSPECTIVAS.find((p) => p.key === drawer.perspectiva)?.nome ||
                    drawer.perspectiva}
                </p>
                <p
                  className="mt-0.5 text-[13px] font-bold leading-tight"
                  style={{ color: PEN.texto }}
                >
                  {drawer.titulo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* atingimento calculado */}
            {(() => {
              const a = atingDe(drawer)
              const n = nivelDe(a)
              const k = kpiDe(drawer)
              const real = drawer.realizado ?? k?.realizado ?? null
              return (
                <div
                  className="mt-3 p-3"
                  style={{
                    background: '#FAFBFC',
                    borderRadius: PEN.raio,
                    border: `1px solid ${PEN.borda}`,
                  }}
                >
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-wide"
                    style={{ color: PEN.textoFraco }}
                  >
                    Atingimento calculado
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className="text-[26px] font-extrabold tabular-nums"
                      style={{ color: SEMAFORO_CORES[n].cor }}
                    >
                      {a === null ? '—' : a.toFixed(0) + '%'}
                    </span>
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: SEMAFORO_CORES[n].cor }}
                    >
                      {rotuloNivel(a)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      valor={a === null ? null : Math.max(0, Math.min(100, a))}
                      cor={SEMAFORO_CORES[n].cor}
                      altura={6}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <p style={{ color: PEN.textoFraco }}>Baseline</p>
                      <p className="font-bold tabular-nums" style={{ color: PEN.texto }}>
                        {fmtValor(drawer.baseline, k?.unidade)}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: PEN.textoFraco }}>Realizado</p>
                      <p className="font-bold tabular-nums" style={{ color: PEN.texto }}>
                        {fmtValor(real, k?.unidade)}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: PEN.textoFraco }}>Meta</p>
                      <p className="font-bold tabular-nums" style={{ color: PEN.texto }}>
                        {fmtValor(drawer.target, k?.unidade)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9.5px]" style={{ color: PEN.textoFraco }}>
                    Polaridade: {drawer.polarity === 'down' ? 'menor é melhor' : 'maior é melhor'} ·
                    cálculo: realizado sobre baseline até a meta.
                  </p>
                </div>
              )
            })()}

            {/* KPIs */}
            <p
              className="mt-4 text-[10.5px] font-bold uppercase tracking-wide"
              style={{ color: PEN.textoFraco }}
            >
              KPIs vinculados
            </p>
            <div className="mt-1.5 space-y-1.5">
              {(() => {
                const k = kpiDe(drawer)
                if (!k)
                  return (
                    <p className="text-[11px] italic" style={{ color: PEN.textoFraco }}>
                      Nenhum KPI vinculado a este objetivo.
                    </p>
                  )
                const a = atingimentoSobre(k.realizado, k.baseline, k.target, k.polarity)
                const n = nivelDe(a)
                return (
                  <div
                    key={k.id}
                    className="p-2.5"
                    style={{
                      background: '#FAFBFC',
                      borderRadius: 8,
                      border: `1px solid ${PEN.borda}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold" style={{ color: PEN.texto }}>
                        {k.nome}
                      </p>
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: SEMAFORO_CORES[n].cor }}
                      >
                        {a === null ? '—' : a.toFixed(0) + '%'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[9.5px]" style={{ color: PEN.textoSecundario }}>
                      {fmtValor(k.baseline, k.unidade)} → {fmtValor(k.realizado, k.unidade)} →{' '}
                      {fmtValor(k.target, k.unidade)} · {k.frequencia}
                    </p>
                  </div>
                )
              })()}
            </div>

            {/* iniciativas */}
            <p
              className="mt-4 text-[10.5px] font-bold uppercase tracking-wide"
              style={{ color: PEN.textoFraco }}
            >
              Iniciativas vinculadas
            </p>
            <div className="mt-1.5 space-y-1.5">
              {(() => {
                const inis = iniciativasDe(drawer)
                if (inis.length === 0)
                  return (
                    <p className="text-[11px] italic" style={{ color: PEN.textoFraco }}>
                      Nenhuma iniciativa vinculada a este objetivo.
                    </p>
                  )
                return inis.map((i) => (
                  <div
                    key={i.id}
                    className="p-2.5"
                    style={{
                      background: '#FAFBFC',
                      borderRadius: 8,
                      border: `1px solid ${PEN.borda}`,
                    }}
                  >
                    <p className="text-[11px] font-semibold" style={{ color: PEN.texto }}>
                      {i.titulo}
                    </p>
                    <p className="mt-0.5 text-[9.5px]" style={{ color: PEN.textoSecundario }}>
                      {i.owner_id} · prazo{' '}
                      {i.prazo ? String(i.prazo).slice(0, 10).split('-').reverse().join('/') : '—'}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar
                        valor={i.progresso ?? 0}
                        cor={PEN.acento}
                        altura={4}
                        rotuloDireita={`${i.progresso ?? 0}% concluído`}
                      />
                    </div>
                  </div>
                ))
              })()}
            </div>

            <div
              className="mt-4 flex items-start gap-1.5 p-2.5"
              style={{
                background: PEN.acentoClaro,
                borderRadius: 8,
                border: `1px solid ${PEN.acento}22`,
              }}
            >
              <Target className="mt-0.5 h-3 w-3 shrink-0" style={{ color: PEN.acento }} />
              <p className="text-[10px] leading-snug" style={{ color: PEN.textoSecundario }}>
                Tela somente leitura. O badge de status é <strong>sempre calculado</strong> sobre o
                baseline — não existe campo de status digitado.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
