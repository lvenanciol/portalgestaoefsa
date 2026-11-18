import { useMemo } from 'react'
import { AlertTriangle, Info, CheckCircle2, Target, TrendingUp, Calendar } from 'lucide-react'
import {
  PEN,
  SEMAFORO_CORES,
  semaforoPorAtingimento,
  fmtNumero,
  fmtPct,
  type Semaforo,
} from '@/pen/tokens'
import { KpiCard, SectionHeader, SemaforoDot, ProgressBar } from '@/pen/components'
import { usePenFiltro } from '@/pen/PenShell'
import {
  cockpitTopo,
  progressoEmpresa,
  penDataset,
  ALERTAS,
  RITOS,
  CONSOLIDADO,
  type CompanyScopeId,
  type CompanyId,
} from '@/pen/lib/mock'

// ============================================================================
// FASE 2.1 — COCKPIT
//
// Referência visual: mockup do Planejamento Estratégico (grid de 4 KPIs no
// topo, 3 cards de empresa abaixo, painel de alertas à direita e tabela de
// ritos no rodapé).
//
// TUDO aqui vem do mock e reage ao filtro global (empresa + ciclo) do topbar:
// nenhum número é digitado na tela.
// ============================================================================

const EMPRESAS_ESCOPO: CompanyId[] = ['extrafruti', 'casafruti', 'foldbox']

function fmtReais(v: number): string {
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
  const escopo = empresa.toLowerCase() as CompanyScopeId

  // o filtro global do topbar usa o NOME da empresa; o mock usa o id
  const escopoId: CompanyScopeId =
    escopo === 'extrafruti' || escopo === 'casafruti' || escopo === 'foldbox' ? escopo : 'all'

  const topo = useMemo(() => cockpitTopo(escopoId), [escopoId])
  const ds = useMemo(() => penDataset(escopoId), [escopoId])

  const empresasVisiveis = escopoId === 'all' ? EMPRESAS_ESCOPO : [escopoId as CompanyId]

  const alertas = ALERTAS.filter((a) => escopoId === 'all' || a.company_id === escopoId)
  const ritos = RITOS.filter((r) => escopoId === 'all' || r.company_id === escopoId)

  // atingimento de receita (base das metas)
  const atingReceita = topo.receitaMeta ? (topo.receita / topo.receitaMeta) * 100 : null

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Cockpit"
        descricao={`Visão consolidada do plano — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex items-center gap-1.5">
            <span
              className="px-2 py-1 text-[10.5px] font-bold"
              style={{ background: PEN.acentoClaro, color: PEN.acento, borderRadius: 6 }}
            >
              {empresa}
            </span>
            <span
              className="px-2 py-1 text-[10.5px] font-bold"
              style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
            >
              {ciclo}
            </span>
          </div>
        }
      />

      {/* ================= 4 KPIs ================= */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Receita"
          valor={topo.receita}
          variacao={topo.receitaVar}
          meta={topo.receitaMeta}
          formato="moeda"
          casas={1}
        />
        <KpiCard
          label="EBITDA"
          valor={topo.ebitda}
          variacao={topo.ebitdaVar}
          meta={topo.ebitdaMeta}
          formato="percentual"
          casas={1}
          sufixo="da receita"
        />
        <KpiCard
          label="Turnover operacional"
          valor={topo.turnover}
          variacao={topo.turnoverVar}
          meta={topo.turnoverMeta}
          formato="percentual"
          casas={1}
          sufixo="% ao mês"
        />
        <KpiCard
          label="Iniciativas no prazo"
          valor={topo.iniciativasNoPrazo}
          variacao={topo.iniciativasVar}
          meta={topo.iniciativasTotal}
          formato="numero"
          casas={0}
          sufixo={`de ${topo.iniciativasTotal}`}
        />
      </div>

      {/* linha de contexto: valores em reais para leitura imediata */}
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
          <strong style={{ color: PEN.texto }}>{fmtReais(topo.receita)}</strong> de receita
          realizada
        </span>
        <span>
          Meta: <strong style={{ color: PEN.texto }}>{fmtReais(topo.receitaMeta)}</strong>
        </span>
        <span>
          Atingimento:{' '}
          <strong
            style={{
              color: SEMAFORO_CORES[semaforoPorAtingimento(atingReceita)].cor,
            }}
          >
            {atingReceita === null ? '—' : fmtPct(atingReceita, 1)}
          </strong>
        </span>
        <span>
          Objetivos: <strong style={{ color: PEN.texto }}>{ds.objectives.length}</strong> ·
          Iniciativas: <strong style={{ color: PEN.texto }}>{ds.initiatives.length}</strong>
        </span>
      </div>

      {/* ================= EMPRESAS + ALERTAS ================= */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* 3 StatusCard por empresa */}
        <div>
          <SectionHeader
            titulo="Execução do plano por empresa"
            descricao="Progresso derivado do status dos objetivos e iniciativas."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {empresasVisiveis.map((cid) => {
              const c = ds.companies.find((x) => x.company_id === cid)
              const prog = progressoEmpresa(cid)
              const nivel: Semaforo = semaforoPorAtingimento(prog)
              const objC = (penDataset(cid).objectives || []).length
              const iniC = (penDataset(cid).initiatives || []).length
              const concl = penDataset(cid).initiatives.filter(
                (i) => i.status === 'concluido',
              ).length
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
                      <p className="truncate text-[12.5px] font-bold" style={{ color: PEN.texto }}>
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
                    <span>{objC} objetivos</span>
                    <span>·</span>
                    <span>{iniC} iniciativas</span>
                    <span>·</span>
                    <span>{concl} concluídas</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* painel de alertas de desvio */}
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
                    style={{ borderTop: i === 0 ? 'none' : `1px solid #F0F2F5` }}
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
                      style={{ color: PEN.texto, borderBottom: `1px solid #F0F2F5` }}
                    >
                      {fmtData(r.data)}
                    </td>
                    <td
                      className="px-3 py-2 text-[11.5px] font-medium"
                      style={{ color: PEN.texto, borderBottom: `1px solid #F0F2F5` }}
                    >
                      {r.rito}
                    </td>
                    <td
                      className="px-3 py-2 text-[11.5px]"
                      style={{ color: PEN.textoSecundario, borderBottom: `1px solid #F0F2F5` }}
                    >
                      {r.pauta}
                    </td>
                    <td
                      className="px-3 py-2 text-[11.5px]"
                      style={{ color: PEN.texto, borderBottom: `1px solid #F0F2F5` }}
                    >
                      {r.responsavel}
                    </td>
                    <td
                      className="px-3 py-2 text-[11.5px]"
                      style={{ color: PEN.textoSecundario, borderBottom: `1px solid #F0F2F5` }}
                    >
                      {r.frequencia}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* rodapé de fonte e cobertura */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[10.5px]"
        style={{ color: PEN.textoFraco }}
      >
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Dados do mock do ciclo — nenhuma API real nesta fase.
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3" />
          Receita consolidada: {fmtReais(CONSOLIDADO.receita)}
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Turnover é consolidado do grupo em qualquer escopo.
        </span>
      </div>
    </div>
  )
}
