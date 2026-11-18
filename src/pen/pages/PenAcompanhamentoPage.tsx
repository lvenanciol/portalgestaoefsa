import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, AlertTriangle, ShieldAlert, Gavel, Database, Info } from 'lucide-react'
import { PEN, SEMAFORO_CORES, type Semaforo } from '@/pen/tokens'
import { SectionHeader, ProgressBar } from '@/pen/components'
import { BotaoExportar, tabelaHtml, secao, esc } from '@/pen/components/BotaoExportar'
import { SkeletonCard, SkeletonTabela, ErroBloco, AvisoFallback } from '@/pen/components/estados'
import { usePenFiltro } from '@/pen/PenShell'
import { carregarPen, type PenDados } from '@/pen/lib/dados'
import type { CompanyScopeId } from '@/pen/lib/mock'

// ============================================================================
// FASE 2.7 — ACOMPANHAMENTO E RITUAIS  ·  SOMENTE LEITURA
//
// Blocos:
//   1. 4 cards de ritos (diário, semanal, mensal, trimestral) com pauta em bullets
//   2. Gráfico de linha de 6 meses com 3 indicadores
//   3. Termômetro de atingimento por empresa
//   4. Quadro RAID com 6 itens  ← do BANCO (pen_risk)
//   5. Tabela de decisões com dono, prazo e status
//   6. Painel de qualidade do dado com 4 indicadores e semáforo
//
// HONESTIDADE DA SÉRIE: não existe medição mensal no banco. O gráfico desenha
// a TRAJETÓRIA INTERPOLADA entre baseline e realizado atual — e diz isso na
// tela. Não são 6 pontos medidos, e a legenda deixa claro.
// ============================================================================

type Frequencia = 'diario' | 'semanal' | 'mensal' | 'trimestral'

const RITOS: Array<{
  freq: Frequencia
  nome: string
  periodicidade: string
  dono: string
  pauta: string[]
}> = [
  {
    freq: 'diario',
    nome: 'Ritual diário de operação',
    periodicidade: 'Todo dia útil · 08h00 · 15 min',
    dono: 'Operações',
    pauta: [
      'Ruptura da prateleira e do CD nas últimas 24h',
      'Quebra registrada e motivo por loja',
      'Faltas de equipe e cobertura de turno',
      'Bloqueios do dia (caminhão, câmara, sistema)',
    ],
  },
  {
    freq: 'semanal',
    nome: 'Comitê semanal de execução',
    periodicidade: 'Toda segunda · 09h00 · 45 min',
    dono: 'Diretoria de Operações',
    pauta: [
      'Iniciativas da semana: entregue, atrasado, bloqueado',
      'Vendas por canal contra a meta semanal',
      'RAID: riscos que mudaram de nível',
      'Alçadas pendentes de decisão',
    ],
  },
  {
    freq: 'mensal',
    nome: 'Reunião de acompanhamento do plano',
    periodicidade: '1ª semana do mês · 2h',
    dono: 'Leonardo Lourenço',
    pauta: [
      'Atingimento dos objetivos e KPIs do ciclo',
      'Desvio de receita, EBITDA e turnover contra a meta',
      'Revisão do plano de ação 5W2H',
      'Decisões de realocação de recurso',
    ],
  },
  {
    freq: 'trimestral',
    nome: 'Revisão estratégica trimestral',
    periodicidade: 'Fim de trimestre · meio dia',
    dono: 'Leonardo Lourenço',
    pauta: [
      'Revalidação do Norte e da BHAG',
      'Trade-offs de capital entre as empresas',
      'Revisão do diagnóstico e das causas raiz',
      'Atualização de metas com justificativa em auditoria',
    ],
  },
]

interface Decisao {
  id: string
  tema: string
  decisao: string
  dono: string
  prazo: string
  status: 'concluida' | 'em_andamento' | 'pendente' | 'atrasada'
}

const DECISOES: Decisao[] = [
  {
    id: 'd1',
    tema: 'Alocação de capital',
    decisao: 'Priorizar automação fiscal antes da reforma das lojas âncora',
    dono: 'Leonardo Lourenço',
    prazo: '2026-11-30',
    status: 'concluida',
  },
  {
    id: 'd2',
    tema: 'Pessoas',
    decisao: 'Aprovar trilha de liderança para 34 líderes de turno',
    dono: 'Gestão de Pessoas',
    prazo: '2026-10-31',
    status: 'atrasada',
  },
  {
    id: 'd3',
    tema: 'Operações',
    decisao: 'Implantar sensor de temperatura com alarme em todas as câmaras',
    dono: 'Operações',
    prazo: '2026-12-15',
    status: 'em_andamento',
  },
  {
    id: 'd4',
    tema: 'Comercial',
    decisao: 'Suspender expansão de loja até fechar inventário em base única',
    dono: 'Diretoria Casafruti',
    prazo: '2026-11-20',
    status: 'pendente',
  },
  {
    id: 'd5',
    tema: 'FoldBox',
    decisao: 'Aprovar piloto de 60 dias com 3 operadores logísticos',
    dono: 'Diretoria FoldBox',
    prazo: '2026-11-10',
    status: 'em_andamento',
  },
  {
    id: 'd6',
    tema: 'Governança',
    decisao: 'Exigir justificativa registrada para toda alteração de meta',
    dono: 'Leonardo Lourenço',
    prazo: '2026-09-30',
    status: 'concluida',
  },
]

const STATUS_DEC: Record<Decisao['status'], { rotulo: string; cor: string }> = {
  concluida: { rotulo: 'Concluída', cor: SEMAFORO_CORES.verde.cor },
  em_andamento: { rotulo: 'Em andamento', cor: PEN.acento },
  pendente: { rotulo: 'Pendente', cor: SEMAFORO_CORES.ambar.cor },
  atrasada: { rotulo: 'Atrasada', cor: SEMAFORO_CORES.vermelho.cor },
}

const MESES_CURTOS = ['Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov']

function fmtData(s: string): string {
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0].slice(2)}` : s
}

export default function PenAcompanhamentoPage() {
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

  const kpis = dados?.kpis.dados ?? []
  const riscos = dados?.risks.dados ?? []
  const empresas = dados?.companies.dados ?? []

  // ---------------- 3 indicadores do gráfico ----------------
  const indicadores = useMemo(() => {
    const achar = (termo: string) =>
      kpis.find((k) => k.nome.toLowerCase().indexOf(termo) >= 0) || null
    return [
      {
        rotulo: 'Receita consolidada',
        kpi: achar('receita consolidada'),
        cor: PEN.acento,
        unidade: 'R$',
      },
      { rotulo: 'EBITDA', kpi: achar('ebitda'), cor: SEMAFORO_CORES.verde.cor, unidade: '%' },
      {
        rotulo: 'Turnover',
        kpi: achar('turnover'),
        cor: SEMAFORO_CORES.vermelho.cor,
        unidade: '%',
      },
    ]
  }, [kpis])

  /**
   * Trajetória de 6 pontos INTERPOLADA entre baseline e realizado.
   * NÃO é medição mensal — não existe histórico no banco. A tela informa isso.
   */
  function serie(kpi: any): number[] | null {
    if (!kpi) return null
    const base = Number(kpi.baseline ?? 0)
    const real = Number(kpi.realizado ?? 0)
    if (!base || !real) return null
    const pontos: number[] = []
    for (let i = 0; i < 6; i++) pontos.push(base + ((real - base) * i) / 5)
    return pontos
  }

  // ---------------- termômetro por empresa ----------------
  const termometro = useMemo(() => {
    return empresas.map((c) => {
      const objs = (dados?.objectives.dados ?? []).filter((o) => o.company_id === c.company_id)
      let pesoTotal = 0
      let soma = 0
      for (const o of objs) {
        if (o.realizado === null || o.baseline === null || o.target === null) continue
        const delta = o.polarity === 'down' ? o.baseline - o.target : o.target - o.baseline
        if (delta === 0) continue
        const andado = o.polarity === 'down' ? o.baseline - o.realizado : o.realizado - o.baseline
        const pct = (andado / delta) * 100
        const w = Number(o.weight) || 1
        soma += pct * w
        pesoTotal += w
      }
      const ating = pesoTotal ? soma / pesoTotal : null
      const nivel: Semaforo =
        ating === null ? 'cinza' : ating >= 100 ? 'verde' : ating >= 70 ? 'ambar' : 'vermelho'
      return { nome: c.nome, company_id: c.company_id, ating, nivel }
    })
  }, [empresas, dados])

  // ---------------- qualidade do dado ----------------
  const qualidade = useMemo(() => {
    const chk = (ok: boolean, sim: string, nao: string) => ({ ok, texto: ok ? sim : nao })
    const comDono = kpis.filter((k) => k.owner_id && k.owner_id.trim()).length
    const comRealizado = kpis.filter((k) => k.realizado !== null).length
    const comBaseline = kpis.filter((k) => k.baseline !== null && k.target !== null).length
    const comFreq = kpis.filter((k) => k.frequencia && k.frequencia.trim()).length
    const total = kpis.length || 1

    return [
      {
        nome: 'Dono atribuído',
        pct: Math.round((comDono / total) * 100),
        ...chk(
          comDono === total,
          `${comDono}/${total} KPIs com dono`,
          `${comDono}/${total} — falta dono`,
        ),
      },
      {
        nome: 'Valor realizado',
        pct: Math.round((comRealizado / total) * 100),
        ...chk(
          comRealizado === total,
          `${comRealizado}/${total} medidos`,
          `${comRealizado}/${total} sem medição`,
        ),
      },
      {
        nome: 'Baseline e meta',
        pct: Math.round((comBaseline / total) * 100),
        ...chk(
          comBaseline === total,
          `${comBaseline}/${total} completos`,
          `${comBaseline}/${total} incompletos`,
        ),
      },
      {
        nome: 'Frequência definida',
        pct: Math.round((comFreq / total) * 100),
        ...chk(
          comFreq === total,
          `${comFreq}/${total} definidas`,
          `${comFreq}/${total} sem frequência`,
        ),
      },
    ]
  }, [kpis])

  const raidCriticos = riscos.filter(
    (r) => r.impacto === 'critico' || r.impacto === 'alto' || r.probabilidade === 'alto',
  ).length

  const algumFallback = dados ? [dados.risks, dados.kpis].some((b) => b.fonte === 'mock') : false

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Acompanhamento e Rituais"
        descricao={`Ritos, indicadores, RAID e decisões — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold"
              style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
            >
              <Eye className="h-3 w-3" />
              somente leitura
            </span>
            <BotaoExportar
              titulo="Acompanhamento e Rituais"
              pronto={!carregando}
              corpo={() =>
                secao(
                  'Rituais de gestão',
                  tabelaHtml(
                    ['Cadência', 'Rito', 'Periodicidade', 'Dono'],
                    RITOS.map((r) => [esc(r.freq), esc(r.nome), esc(r.periodicidade), esc(r.dono)]),
                  ),
                ) +
                secao(
                  'Termômetro por empresa',
                  tabelaHtml(
                    ['Empresa', 'Atingimento'],
                    termometro.map((t) => [
                      esc(t.nome),
                      t.ating === null
                        ? '—'
                        : {
                            v: `${Math.round(t.ating)}%`,
                            cls: t.ating >= 100 ? 'verde' : t.ating >= 70 ? 'ambar' : 'vermelho',
                          },
                    ]),
                    [1],
                  ),
                ) +
                secao(
                  'Quadro RAID',
                  tabelaHtml(
                    ['Tipo', 'Item', 'Probabilidade', 'Impacto', 'Mitigação', 'Dono'],
                    riscos.map((r) => [
                      esc(r.tipo),
                      esc(r.titulo),
                      esc(r.probabilidade),
                      esc(r.impacto),
                      esc(r.mitigacao || '—'),
                      esc(r.owner_id || '—'),
                    ]),
                  ),
                ) +
                secao(
                  'Decisões do ciclo',
                  tabelaHtml(
                    ['Tema', 'Decisão', 'Dono', 'Prazo', 'Status'],
                    DECISOES.map((d) => [
                      esc(d.tema),
                      esc(d.decisao),
                      esc(d.dono),
                      fmtData(d.prazo),
                      {
                        v: STATUS_DEC[d.status].rotulo,
                        cls: d.status === 'atrasada' ? 'vermelho' : '',
                      },
                    ]),
                  ),
                ) +
                secao(
                  'Qualidade do dado',
                  tabelaHtml(
                    ['Verificação', 'Situação', '%'],
                    qualidade.map((q) => [
                      esc(q.nome),
                      esc(q.texto),
                      { v: `${q.pct}%`, cls: q.ok ? 'verde' : q.pct >= 60 ? 'ambar' : 'vermelho' },
                    ]),
                    [2],
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
            dados de referência do ciclo
          </span>
        </div>
      )}

      {/* ================= 4 CARDS DE RITOS ================= */}
      <div>
        <SectionHeader
          titulo="Rituais de gestão"
          descricao="Cadência e pauta de cada rito do ciclo."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RITOS.map((r) => (
            <div
              key={r.freq}
              className="p-3"
              style={{
                background: PEN.cartao,
                borderRadius: PEN.raio,
                border: `1px solid ${PEN.borda}`,
                borderTop: `3px solid ${PEN.acento}`,
              }}
            >
              <p
                className="text-[9px] font-extrabold uppercase tracking-wider"
                style={{ color: PEN.acento }}
              >
                {r.freq === 'diario'
                  ? 'Diário'
                  : r.freq === 'semanal'
                    ? 'Semanal'
                    : r.freq === 'mensal'
                      ? 'Mensal'
                      : 'Trimestral'}
              </p>
              <p
                className="mt-0.5 text-[11.5px] font-bold leading-tight"
                style={{ color: PEN.texto }}
              >
                {r.nome}
              </p>
              <p className="mt-0.5 text-[9.5px]" style={{ color: PEN.textoFraco }}>
                {r.periodicidade}
              </p>
              <p className="mt-1 text-[9.5px] font-semibold" style={{ color: PEN.textoSecundario }}>
                {r.dono}
              </p>
              <ul className="mt-1.5 space-y-1">
                {r.pauta.map((p) => (
                  <li key={p} className="flex gap-1.5">
                    <span
                      className="mt-1 h-1 w-1 shrink-0 rounded-full"
                      style={{ background: PEN.acento }}
                    />
                    <span
                      className="text-[10px] leading-snug"
                      style={{ color: PEN.textoSecundario }}
                    >
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ================= GRÁFICO 6 MESES ================= */}
      <div>
        <SectionHeader
          titulo="Evolução — 6 meses"
          descricao="Três indicadores do ciclo."
          acao={
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: PEN.atencaoClaro, color: PEN.atencao }}
              title="Não existe medição mensal no banco: a linha é interpolada entre baseline e realizado atual."
            >
              série interpolada
            </span>
          }
        />
        {carregando ? (
          <SkeletonCard />
        ) : (
          <div
            className="p-3"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            <svg
              viewBox="0 0 640 170"
              width="100%"
              style={{ display: 'block' }}
              role="img"
              aria-label="Evolução de 6 meses de três indicadores"
            >
              {/* eixos */}
              <line x1="46" y1="140" x2="620" y2="140" stroke="#E3E7EC" />
              <line x1="46" y1="12" x2="46" y2="140" stroke="#E3E7EC" />
              {MESES_CURTOS.map((m, i) => (
                <text
                  key={m}
                  x={66 + i * 110}
                  y={154}
                  fontSize={9}
                  textAnchor="middle"
                  fill={PEN.textoFraco}
                >
                  {m}
                </text>
              ))}

              {indicadores.map((ind) => {
                const s = serie(ind.kpi)
                if (!s) return null
                // normaliza cada série pelo próprio máximo
                const max = Math.max.apply(null, s) || 1
                const min = Math.min.apply(null, s)
                const range = max - min || 1
                const pontos = s.map((v, i) => {
                  const x = 66 + i * 110
                  const y = 132 - ((v - min) / range) * 104
                  return `${x},${y}`
                })
                return (
                  <g key={ind.rotulo}>
                    <polyline
                      points={pontos.join(' ')}
                      fill="none"
                      stroke={ind.cor}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    {s.map((v, i) => {
                      const x = 66 + i * 110
                      const y = 132 - ((v - min) / range) * 104
                      return <circle key={i} cx={x} cy={y} r={2.6} fill={ind.cor} />
                    })}
                    <text
                      x={70 + 5 * 110 + 8}
                      y={132 - ((s[5] - min) / range) * 104 + 3}
                      fontSize={9}
                      fontWeight={700}
                      fill={ind.cor}
                    >
                      {ind.rotulo}
                    </text>
                  </g>
                )
              })}
            </svg>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {indicadores.map((ind) => (
                <span
                  key={ind.rotulo}
                  className="inline-flex items-center gap-1 text-[10px]"
                  style={{ color: PEN.textoSecundario }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ind.cor }} />
                  {ind.rotulo}:{' '}
                  <strong style={{ color: PEN.texto }}>
                    {ind.kpi?.realizado === null || ind.kpi?.realizado === undefined
                      ? 'sem dado'
                      : `${Number(ind.kpi.realizado).toLocaleString('pt-BR')}${ind.unidade === '%' ? '%' : ''}`}
                  </strong>
                </span>
              ))}
            </div>

            <div
              className="mt-2 flex items-start gap-1.5 p-2"
              style={{ background: PEN.atencaoClaro, borderRadius: 6 }}
            >
              <Info className="mt-0.5 h-3 w-3 shrink-0" style={{ color: PEN.atencao }} />
              <p className="text-[9.5px] leading-snug" style={{ color: PEN.textoSecundario }}>
                O banco <strong>não guarda medição mensal</strong>. A linha é a interpolação entre o
                baseline e o realizado de hoje — serve para direção, não como histórico medido.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================= TERMÔMETRO + QUALIDADE ================= */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <SectionHeader
            titulo="Termômetro de atingimento"
            descricao="Atingimento médio ponderado por empresa."
          />
          {carregando ? (
            <SkeletonCard />
          ) : (
            <div
              className="space-y-2 p-3"
              style={{
                background: PEN.cartao,
                borderRadius: PEN.raio,
                border: `1px solid ${PEN.borda}`,
              }}
            >
              {termometro.length === 0 ? (
                <p className="text-[11px]" style={{ color: PEN.textoFraco }}>
                  Nenhuma empresa no escopo.
                </p>
              ) : (
                termometro.map((t) => (
                  <div key={t.company_id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11.5px] font-semibold" style={{ color: PEN.texto }}>
                        {t.nome}
                      </span>
                      <span
                        className="text-[11.5px] font-extrabold tabular-nums"
                        style={{ color: SEMAFORO_CORES[t.nivel].cor }}
                      >
                        {t.ating === null ? '—' : `${Math.round(t.ating)}%`}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        valor={t.ating === null ? null : Math.max(0, Math.min(100, t.ating))}
                        cor={SEMAFORO_CORES[t.nivel].cor}
                        altura={7}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div>
          <SectionHeader
            titulo="Qualidade do dado"
            descricao="Quanto do indicador está completo para ser cobrado."
            acao={<Database className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
          />
          {carregando ? (
            <SkeletonCard />
          ) : (
            <div
              className="overflow-hidden"
              style={{
                background: PEN.cartao,
                borderRadius: PEN.raio,
                border: `1px solid ${PEN.borda}`,
              }}
            >
              {qualidade.map((q, i) => {
                const nivel: Semaforo = q.ok ? 'verde' : q.pct >= 60 ? 'ambar' : 'vermelho'
                return (
                  <div
                    key={q.nome}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: SEMAFORO_CORES[nivel].cor }}
                      title={SEMAFORO_CORES[nivel].rotulo}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold" style={{ color: PEN.texto }}>
                        {q.nome}
                      </p>
                      <p className="text-[9.5px]" style={{ color: PEN.textoSecundario }}>
                        {q.texto}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[10.5px] font-bold tabular-nums"
                      style={{ color: SEMAFORO_CORES[nivel].cor }}
                    >
                      {q.pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= RAID ================= */}
      <div>
        <SectionHeader
          titulo="Quadro RAID"
          descricao="Riscos, premissas, issues e dependências do ciclo."
          acao={
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold"
              style={{ color: PEN.textoFraco }}
            >
              <ShieldAlert className="h-3 w-3" />
              {riscos.length} itens · {raidCriticos} de atenção
            </span>
          }
        />
        {carregando ? (
          <SkeletonTabela linhas={6} colunas={5} />
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
                  {['Tipo', 'Item', 'Prob.', 'Impacto', 'Mitigação', 'Dono'].map((h) => (
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
                {riscos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-2 py-5 text-center text-[11px]"
                      style={{ color: PEN.textoFraco }}
                    >
                      Nenhum item de RAID no escopo.
                    </td>
                  </tr>
                ) : (
                  riscos.map((r) => {
                    const corProb =
                      r.probabilidade === 'alto'
                        ? SEMAFORO_CORES.vermelho.cor
                        : r.probabilidade === 'medio'
                          ? SEMAFORO_CORES.ambar.cor
                          : SEMAFORO_CORES.verde.cor
                    const corImp =
                      r.impacto === 'critico' || r.impacto === 'alto'
                        ? SEMAFORO_CORES.vermelho.cor
                        : r.impacto === 'medio'
                          ? SEMAFORO_CORES.ambar.cor
                          : SEMAFORO_CORES.verde.cor
                    return (
                      <tr key={r.id} className="hover:bg-[#F7F9FA]">
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[9px] font-bold uppercase"
                          style={{ color: PEN.acento, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.tipo}
                        </td>
                        <td
                          className="px-2 py-1.5 text-[11px] font-semibold"
                          style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.titulo}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase"
                          style={{ color: corProb, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.probabilidade}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase"
                          style={{ color: corImp, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.impacto}
                        </td>
                        <td
                          className="px-2 py-1.5 text-[10px] leading-snug"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.mitigacao || '—'}
                        </td>
                        <td
                          className="px-2 py-1.5 text-[10px]"
                          style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                        >
                          {r.owner_id || '—'}
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

      {/* ================= DECISÕES ================= */}
      <div>
        <SectionHeader
          titulo="Decisões do ciclo"
          descricao="O que foi decidido, por quem e até quando."
          acao={<Gavel className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
        />
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
                {['Tema', 'Decisão', 'Dono', 'Prazo', 'Status'].map((h) => (
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
              {DECISOES.map((d) => {
                const st = STATUS_DEC[d.status]
                return (
                  <tr key={d.id} className="hover:bg-[#F7F9FA]">
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-[10px] font-bold"
                      style={{ color: PEN.acento, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {d.tema}
                    </td>
                    <td
                      className="px-2 py-1.5 text-[11px]"
                      style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {d.decisao}
                    </td>
                    <td
                      className="px-2 py-1.5 text-[10px]"
                      style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {d.dono}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-[10px] font-semibold tabular-nums"
                      style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {fmtData(d.prazo)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5"
                      style={{ borderBottom: '1px solid #F0F2F5' }}
                    >
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{
                          background: '#FFFFFF',
                          color: st.cor,
                          border: `1px solid ${st.cor}44`,
                        }}
                      >
                        {st.rotulo}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {raidCriticos > 0 && (
        <div
          className="flex items-start gap-2 p-2.5"
          style={{
            background: PEN.criticoClaro,
            borderRadius: 8,
            border: `1px solid ${PEN.critico}22`,
          }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.critico }} />
          <p className="text-[10.5px] leading-snug" style={{ color: PEN.textoSecundario }}>
            <strong style={{ color: PEN.critico }}>{raidCriticos} itens de RAID</strong> com
            probabilidade ou impacto alto exigem tratamento no comitê semanal.
          </p>
        </div>
      )}
    </div>
  )
}
