import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  Target,
  TrendingUp,
  Calendar,
  Download,
  FileText,
  RefreshCw,
} from 'lucide-react'
import {
  PEN,
  SEMAFORO_CORES,
  semaforoPorAtingimento,
  fmtNumero,
  fmtPct,
  type Semaforo,
} from '@/pen/tokens'
import { KpiCard, SectionHeader, SemaforoDot, ProgressBar } from '@/pen/components'
import {
  SkeletonKpi,
  SkeletonCard,
  SkeletonTabela,
  Skeleton,
  ErroBloco,
  AvisoFallback,
} from '@/pen/components/estados'
import { usePenFiltro } from '@/pen/PenShell'
import { useAuth } from '@/hooks/use-auth'
import { carregarPen, topoDosDados, progressoDosDados, type PenDados } from '@/pen/lib/dados'
import { exportarConsolidado } from '@/pen/lib/exportar'
import { ALERTAS, RITOS, type CompanyScopeId, type CompanyId } from '@/pen/lib/mock'

// ============================================================================
// FASE 2.1 + 3.1 + 3.2 — COCKPIT
//
// 2.1  estrutura: 4 KPI, 3 cards de empresa, alertas de desvio, tabela de ritos
// 3.1  dado real do PocketBase com sincronização INCREMENTAL por `updated`,
//      skeleton e erro POR BLOCO (nunca por tela inteira)
// 3.2  exportação: PDF desta tela e consolidado de 1 página para o conselho,
//      ambas registradas em pen_audit
//
// O filtro global (empresa · ciclo) do topbar recalcula todos os blocos.
// ============================================================================

const EMPRESAS_ESCOPO: CompanyId[] = ['extrafruti', 'casafruti', 'foldbox']

function fmtReais(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1_000_000) return `R$ ${fmtNumero(v / 1_000_000, 1)} mi`
  if (v >= 1_000) return `R$ ${fmtNumero(v / 1_000, 0)} mil`
  return `R$ ${fmtNumero(v, 0)}`
}

function fmtData(s: string): string {
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

const ICONE_ALERTA: Record<string, typeof AlertTriangle> = {
  critico: AlertTriangle,
  atencao: AlertTriangle,
  ok: CheckCircle2,
}

export default function PenCockpitPage() {
  const { empresa, ciclo } = usePenFiltro()
  const { user } = useAuth()

  const escopoId: CompanyScopeId =
    empresa === 'Extrafruti'
      ? 'extrafruti'
      : empresa === 'Casafruti'
        ? 'casafruti'
        : empresa === 'FoldBox'
          ? 'foldbox'
          : 'all'

  const [dados, setDados] = useState<PenDados | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)

  const nomeUsuario = String((user as any)?.name || (user as any)?.email || 'usuário')

  // ------------------------------------------------------------------
  // carga: incrementa por updated a cada troca de escopo
  // ------------------------------------------------------------------
  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroGlobal(null)
    try {
      const d = await carregarPen(escopoId)
      setDados(d)
    } catch (e: any) {
      // caminho de último recurso: nem o fallback resolveu
      setErroGlobal(String(e?.message || e))
    } finally {
      setCarregando(false)
    }
  }, [escopoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const topo = useMemo(() => (dados ? topoDosDados(dados) : null), [dados])

  const empresasVisiveis: CompanyId[] =
    escopoId === 'all' ? EMPRESAS_ESCOPO : [escopoId as CompanyId]

  const alertas = ALERTAS.filter((a) => escopoId === 'all' || a.company_id === escopoId)
  const ritos = RITOS.filter((r) => escopoId === 'all' || r.company_id === escopoId)

  const atingReceita =
    topo && topo.receita !== null && topo.receitaMeta
      ? (topo.receita / topo.receitaMeta) * 100
      : null

  // algum bloco caiu no mock? avisa sem esconder o conteúdo
  const algumFallback = dados
    ? [dados.companies, dados.objectives, dados.kpis, dados.initiatives].some(
        (b) => b.fonte === 'mock',
      )
    : false

  // ------------------------------------------------------------------
  // exportações (3.2)
  // ------------------------------------------------------------------
  const cabecalho = {
    titulo: 'Cockpit',
    empresa,
    ciclo,
    usuario: nomeUsuario,
  }

  async function exportarPagina() {
    if (!topo || !dados) return
    const corpo = `
      <h2>Indicadores do ciclo</h2>
      <div class="kpis">
        <div class="kpi"><div class="rot">Receita</div><div class="val">${fmtReais(topo.receita)}</div><div class="det">Meta ${fmtReais(topo.receitaMeta)}</div></div>
        <div class="kpi"><div class="rot">EBITDA</div><div class="val">${topo.ebitda === null ? '—' : fmtPct(topo.ebitda)}</div><div class="det">Meta ${topo.ebitdaMeta === null ? '—' : fmtPct(topo.ebitdaMeta)}</div></div>
        <div class="kpi"><div class="rot">Turnover</div><div class="val">${topo.turnover === null ? '—' : fmtPct(topo.turnover)}</div><div class="det">Meta ${topo.turnoverMeta === null ? '—' : fmtPct(topo.turnoverMeta)}</div></div>
        <div class="kpi"><div class="rot">Iniciativas no prazo</div><div class="val">${topo.iniNoPrazo}/${topo.iniTotal}</div><div class="det">do plano do ciclo</div></div>
      </div>
      <h2>Execução por empresa</h2>
      <table><thead><tr><th>Empresa</th><th class="num">Execução</th></tr></thead><tbody>
      ${empresasVisiveis
        .map((cid) => {
          const c = dados.companies.dados.find((x) => x.company_id === cid)
          const p = progressoDosDados(dados, cid)
          return `<tr><td><strong>${c?.nome || cid}</strong></td><td class="num">${p.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</td></tr>`
        })
        .join('')}
      </tbody></table>
      <h2>Alertas de desvio</h2>
      <table><thead><tr><th>Tema</th><th>Detalhe</th></tr></thead><tbody>
      ${alertas.map((a) => `<tr><td><strong>${a.titulo}</strong></td><td>${a.detalhe}</td></tr>`).join('')}
      </tbody></table>
      <h2>Próximos ritos</h2>
      <table><thead><tr><th>Data</th><th>Rito</th><th>Pauta</th><th>Responsável</th></tr></thead><tbody>
      ${ritos.map((r) => `<tr><td>${fmtData(r.data)}</td><td><strong>${r.rito}</strong></td><td>${r.pauta}</td><td>${r.responsavel}</td></tr>`).join('')}
      </tbody></table>
    `
    const { exportarTela } = await import('@/pen/lib/exportar')
    await exportarTela(cabecalho, corpo)
  }

  async function exportarUmaPagina() {
    if (!topo || !dados) return
    await exportarConsolidado(cabecalho, {
      receita: topo.receita,
      receitaMeta: topo.receitaMeta,
      ebitda: topo.ebitda,
      ebitdaMeta: topo.ebitdaMeta,
      turnover: topo.turnover,
      turnoverMeta: topo.turnoverMeta,
      iniNoPrazo: topo.iniNoPrazo,
      iniTotal: topo.iniTotal,
      empresas: empresasVisiveis.map((cid) => ({
        nome: dados.companies.dados.find((x) => x.company_id === cid)?.nome || cid,
        progresso: progressoDosDados(dados, cid),
      })),
      alertas: alertas.map((a) => ({ nivel: a.nivel, titulo: a.titulo, detalhe: a.detalhe })),
      ritos: ritos.map((r) => ({
        data: r.data,
        rito: r.rito,
        pauta: r.pauta,
        responsavel: r.responsavel,
      })),
    })
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Cockpit"
        descricao={`Visão consolidada do plano — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold disabled:opacity-50"
              style={{
                background: '#F1F3F5',
                color: PEN.textoSecundario,
                borderRadius: 8,
              }}
              title="Sincronizar o que mudou desde a última leitura"
            >
              <RefreshCw className={carregando ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={exportarPagina}
              disabled={!dados || carregando}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold disabled:opacity-50"
              style={{ background: PEN.acentoClaro, color: PEN.acento, borderRadius: 8 }}
              title="Exportar esta tela em PDF"
            >
              <FileText className="h-3 w-3" />
              PDF
            </button>
            <button
              type="button"
              onClick={exportarUmaPagina}
              disabled={!dados || carregando}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: PEN.acento, borderRadius: 8 }}
              title="Consolidado de uma página para o conselho"
            >
              <Download className="h-3 w-3" />
              Consolidado 1 página
            </button>
          </div>
        }
      />

      {erroGlobal && <ErroBloco mensagem={erroGlobal} onTentar={carregar} />}

      {algumFallback && !carregando && (
        <div className="flex items-center gap-2">
          <AvisoFallback />
          <span className="text-[10px]" style={{ color: PEN.textoFraco }}>
            o banco não respondeu ou está vazio — os números abaixo são a referência do ciclo
          </span>
        </div>
      )}

      {/* ================= 4 KPIs (3.1: skeleton próprio) ================= */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {carregando || !topo ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : (
          <>
            <KpiCard
              label="Receita"
              valor={topo.receita}
              meta={topo.receitaMeta}
              formato="moeda"
              casas={1}
            />
            <KpiCard
              label="EBITDA"
              valor={topo.ebitda}
              meta={topo.ebitdaMeta}
              formato="percentual"
              casas={1}
              sufixo="da receita"
            />
            <KpiCard
              label="Turnover operacional"
              valor={topo.turnover}
              meta={topo.turnoverMeta}
              formato="percentual"
              casas={1}
              sufixo="% ao mês"
            />
            <KpiCard
              label="Iniciativas no prazo"
              valor={topo.iniNoPrazo}
              meta={topo.iniTotal}
              formato="numero"
              casas={0}
              sufixo={`de ${topo.iniTotal}`}
            />
          </>
        )}
      </div>

      {carregando || !topo ? (
        <div
          className="px-3 py-2"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
          }}
        >
          <div className="flex gap-6">
            <Skeleton altura={9} largura={120} />
            <Skeleton altura={9} largura={90} />
            <Skeleton altura={9} largura={100} />
          </div>
        </div>
      ) : (
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
            <strong style={{ color: PEN.texto }}>{fmtReais(topo.receita)}</strong> realizado
          </span>
          <span>
            Meta: <strong style={{ color: PEN.texto }}>{fmtReais(topo.receitaMeta)}</strong>
          </span>
          <span>
            Atingimento:{' '}
            <strong style={{ color: SEMAFORO_CORES[semaforoPorAtingimento(atingReceita)].cor }}>
              {atingReceita === null ? '—' : fmtPct(atingReceita, 1)}
            </strong>
          </span>
          <span>
            Objetivos:{' '}
            <strong style={{ color: PEN.texto }}>{dados?.objectives.dados.length ?? 0}</strong> ·
            Iniciativas:{' '}
            <strong style={{ color: PEN.texto }}>{dados?.initiatives.dados.length ?? 0}</strong>
          </span>
        </div>
      )}

      {/* ================= EMPRESAS + ALERTAS ================= */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div>
          <SectionHeader titulo="Execução do plano por empresa" />
          <div className="grid gap-3 sm:grid-cols-3">
            {carregando || !dados ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              empresasVisiveis.map((cid) => {
                const blocoEmpresa = dados.companies
                if (blocoEmpresa.erro) {
                  return (
                    <ErroBloco
                      key={cid}
                      mensagem={blocoEmpresa.erro}
                      onTentar={carregar}
                      compacto
                    />
                  )
                }
                const c = blocoEmpresa.dados.find((x) => x.company_id === cid)
                const prog = progressoDosDados(dados, cid)
                const nivel: Semaforo = semaforoPorAtingimento(prog)
                const objs = dados.objectives.dados.filter((o) => o.company_id === cid)
                const inis = dados.initiatives.dados.filter((i) => i.company_id === cid)
                const concl = inis.filter((i) => i.status === 'concluido').length
                return (
                  <div
                    key={cid}
                    className="p-3.5"
                    style={{
                      background: PEN.cartao,
                      borderRadius: PEN.raio,
                      border: `1px solid ${PEN.borda}`,
                      borderLeft: `3px solid ${SEMAFORO_CORES[nivel].cor}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className="truncate text-[12.5px] font-bold"
                          style={{ color: PEN.texto }}
                        >
                          {c?.nome || cid}
                        </p>
                        <p className="text-[10.5px]" style={{ color: PEN.textoSecundario }}>
                          Execução do plano
                        </p>
                      </div>
                      <SemaforoDot nivel={nivel} />
                    </div>
                    <div className="mt-2.5">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[18px] font-extrabold" style={{ color: PEN.texto }}>
                          {fmtNumero(prog, 1)}%
                        </span>
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: SEMAFORO_CORES[nivel].cor }}
                        >
                          {SEMAFORO_CORES[nivel].rotulo}
                        </span>
                      </div>
                      <ProgressBar valor={prog} cor={SEMAFORO_CORES[nivel].cor} />
                    </div>
                    <div
                      className="mt-2.5 flex items-center gap-3 text-[10.5px]"
                      style={{ color: PEN.textoSecundario }}
                    >
                      <span>{objs.length} objetivos</span>
                      <span>·</span>
                      <span>{inis.length} iniciativas</span>
                      <span>·</span>
                      <span>{concl} concluídas</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div>
          <SectionHeader
            titulo="Alertas de desvio"
            acao={
              <span className="text-[10px] font-bold" style={{ color: PEN.textoFraco }}>
                {alertas.length}
              </span>
            }
          />
          <div
            className="overflow-hidden"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {alertas.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11.5px]" style={{ color: PEN.textoFraco }}>
                Nenhum desvio no escopo selecionado.
              </p>
            ) : (
              alertas.map((a, i) => {
                const cor =
                  SEMAFORO_CORES[
                    a.nivel === 'ok' ? 'verde' : a.nivel === 'atencao' ? 'ambar' : 'vermelho'
                  ]
                const Icone = ICONE_ALERTA[a.nivel] || Info
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-2.5 px-3 py-2.5"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                  >
                    <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: cor.cor }} />
                    <div className="min-w-0">
                      <p
                        className="text-[11.5px] font-semibold leading-snug"
                        style={{ color: PEN.texto }}
                      >
                        {a.titulo}
                      </p>
                      <p
                        className="mt-0.5 text-[10.5px] leading-snug"
                        style={{ color: PEN.textoSecundario }}
                      >
                        {a.detalhe}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ================= PRÓXIMOS RITOS ================= */}
      <div>
        <SectionHeader
          titulo="Próximos ritos"
          descricao="Reuniões e comitês do ciclo de planejamento."
          acao={<Calendar className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
        />
        {carregando ? (
          <SkeletonTabela linhas={3} colunas={5} />
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
                  {['Data', 'Rito', 'Pauta', 'Responsável', 'Frequência'].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: PEN.textoFraco, borderBottom: `1px solid ${PEN.borda}` }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ritos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-[12px]"
                      style={{ color: PEN.textoFraco }}
                    >
                      Nenhum rito no escopo selecionado.
                    </td>
                  </tr>
                ) : (
                  ritos.map((r) => (
                    <tr key={r.id}>
                      <td
                        className="whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold tabular-nums"
                        style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {fmtData(r.data)}
                      </td>
                      <td
                        className="px-3 py-2 text-[11.5px] font-medium"
                        style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {r.rito}
                      </td>
                      <td
                        className="px-3 py-2 text-[11.5px]"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {r.pauta}
                      </td>
                      <td
                        className="px-3 py-2 text-[11.5px]"
                        style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {r.responsavel}
                      </td>
                      <td
                        className="px-3 py-2 text-[11.5px]"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {r.frequencia}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[10.5px]"
        style={{ color: PEN.textoFraco }}
      >
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Fonte: pen_* no banco · sincronização incremental por updated
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3" />
          Receita consolidada: {fmtReais(topo?.receita ?? null)}
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Turnover é consolidado do grupo em qualquer escopo.
        </span>
      </div>
    </div>
  )
}
