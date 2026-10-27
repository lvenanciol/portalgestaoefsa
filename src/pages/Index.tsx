import { useEffect, useState, useMemo } from 'react'
import { Calendar, RefreshCw, Database, FlaskConical, Loader2, AlertCircle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useApp } from '@/context/AppContext'
import { MOCK_DATA, KPI, CriticalAlert, Commitment } from '@/data/mockData'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueBarChart } from '@/components/dashboard/RevenueBarChart'
import { MarginLineChart } from '@/components/dashboard/MarginLineChart'
import { ExpenseDonutChart } from '@/components/dashboard/ExpenseDonutChart'
import { TopUnitsChart } from '@/components/dashboard/TopUnitsChart'
import { CriticalAlertsCard } from '@/components/dashboard/CriticalAlertsCard'
import { UpcomingCommitmentsCard } from '@/components/dashboard/UpcomingCommitmentsCard'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import {
  buscarSankhyaDashboardCache,
  processarDadosDashboard,
  SankhyaSnapshotDados,
  formatarDataHoraBR,
} from '@/services/sankhya-dashboard-service'

const fmtMilhoes = (v: number) => {
  if (v === 0) return 'R$ 0,0M'
  const m = Math.abs(v) / 1_000_000
  return (
    'R$ ' +
    m.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) +
    'M'
  )
}

const MES_CURTO = [
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

export default function Index() {
  const { selectedCompany, empresas } = useApp()
  const [loading, setLoading] = useState(true)
  const [fonte, setFonte] = useState<'real' | 'mock'>('real')
  const [snapshotDados, setSnapshotDados] = useState<SankhyaSnapshotDados | null>(null)
  const [geradoEm, setGeradoEm] = useState<string | null>(null)
  const [erroCarregamento, setErroCarregamento] = useState<string>('')
  const [recarregando, setRecarregando] = useState(false)

  // Dados complementares locais (Alertas de contratos com aditivos e tarefas atrasadas)
  const [alertas, setAlertas] = useState<CriticalAlert[]>([])
  const [compromissos, setCompromissos] = useState<Commitment[]>([])

  // Descobrir o nome da empresa selecionada no AppContext
  const nomeEmpresaSelecionada = useMemo(() => {
    if (!selectedCompany) return 'Consolidado (Todas as empresas)'
    const emp = empresas.find((e) => e.id === selectedCompany)
    return emp ? emp.nome : ''
  }, [selectedCompany, empresas])

  const carregarDadosSankhya = async (isManual = false) => {
    if (isManual) setRecarregando(true)
    else setLoading(true)
    setErroCarregamento('')

    try {
      const res = await buscarSankhyaDashboardCache()
      if (
        res.ok &&
        res.dados &&
        (res.dados.fat?.length || res.dados.ar_mensal?.length || res.dados.ap_mensal?.length)
      ) {
        setSnapshotDados(res.dados)
        setGeradoEm(res.gerado_em || null)
        setFonte('real')
      } else {
        // Fallback para mock caso não haja dados reais no cache
        setFonte('mock')
        setErroCarregamento(res.erro || res.mensagem || 'Snapshot vazio')
      }
    } catch (e: any) {
      console.warn('Falha ao carregar dados do Sankhya, ativando fallback:', e)
      setFonte('mock')
      setErroCarregamento(String(e?.message || e))
    } finally {
      setLoading(false)
      setRecarregando(false)
    }
  }

  // Carregar dados de alertas e compromissos operacionais locais (contratos + tarefas)
  const carregarOperacional = async () => {
    const als: CriticalAlert[] = []
    try {
      const contratos = await pb.collection('contratos').getFullList()
      const aditivos = await pb.collection('contratos_aditivos').getFullList({ sort: '-data' })
      const vigAdt: Record<string, string> = {}
      for (const a of aditivos as any[]) {
        const cid = a.contrato_id
        if (cid && a.nova_vigencia && !vigAdt[cid]) vigAdt[cid] = a.nova_vigencia
      }
      const hoje = new Date()
      const fim = (c: any) =>
        new Date(vigAdt[c.id] || c.fim || 0).getTime() ? new Date(vigAdt[c.id] || c.fim) : null

      contratos
        .filter((c: any) => {
          const f = fim(c)
          return f && c.status !== 'encerrado'
        })
        .sort((a: any, b: any) => fim(a)!.getTime() - fim(b)!.getTime())
        .slice(0, 3)
        .forEach((c: any) => {
          const f = fim(c)!
          const dias = Math.ceil((f.getTime() - hoje.getTime()) / 86400000)
          if (dias <= 90) {
            als.push({
              id: 'alt-contr-' + c.id,
              title:
                dias <= 0
                  ? 'Contrato vencido'
                  : dias <= 30
                    ? 'Contrato vence em até 30 dias'
                    : dias <= 60
                      ? 'Contrato vence em 31-60 dias'
                      : 'Contrato vence em 61-90 dias',
              description: c.parte + ' — ' + (c.titulo || '') + (vigAdt[c.id] ? ' (aditivo)' : ''),
              detail: f.toLocaleDateString('pt-BR'),
              severity: dias <= 30 ? 'critical' : 'warning',
            })
          }
        })
    } catch {
      /* intentionally ignored */
    }

    try {
      const hoje = new Date().toISOString().slice(0, 10)
      const ts = await pb.collection('tarefas').getFullList({ filter: "status!='concluida'" })
      const atrasadas = ts.filter((t: any) => t.prazo && String(t.prazo).slice(0, 10) < hoje)
      if (atrasadas.length) {
        als.push({
          id: 'alt-tar',
          title: `${atrasadas.length} tarefa(s) atrasada(s)`,
          description: 'Módulo Tarefas & Agenda',
          detail: 'Ação imediata',
          severity: 'critical',
        })
      }

      // Compromissos com data >= hoje
      const proximas = ts
        .filter((t: any) => t.prazo && String(t.prazo).slice(0, 10) >= hoje)
        .sort((a: any, b: any) => String(a.prazo).localeCompare(String(b.prazo)))
        .slice(0, 4)

      setCompromissos(
        proximas.map((t: any, i: number) => {
          const d = String(t.prazo).slice(0, 10).split('-')
          return {
            id: 'com-' + i,
            day: d[2] || '01',
            monthShort: MES_CURTO[parseInt(d[1] || '1', 10) - 1] || 'Out',
            title: t.titulo,
            time: 'Prazo',
            location: t.responsavel || 'Operacional',
          }
        }),
      )
    } catch {
      /* intentionally ignored */
    }

    setAlertas(als.length ? als : MOCK_DATA.criticalAlerts)
  }

  useEffect(() => {
    carregarDadosSankhya()
    carregarOperacional()
  }, [])

  // Processar dados em função da empresa selecionada na sidebar
  const processed = useMemo(() => {
    if (fonte === 'real' && snapshotDados) {
      return processarDadosDashboard(snapshotDados, nomeEmpresaSelecionada, geradoEm)
    }
    return null
  }, [fonte, snapshotDados, nomeEmpresaSelecionada, geradoEm])

  // Gerar os 6 KPIs combinando dados reais disponíveis e estado honesto para métricas ausentes no Sankhya
  const kpis: (KPI & { semDados?: boolean; motivoSemDados?: string })[] = useMemo(() => {
    if (!processed || fonte !== 'real') {
      return MOCK_DATA.kpis
    }

    const deltaFatStr =
      processed.deltaFat !== null
        ? `${processed.deltaFat >= 0 ? '+' : ''}${processed.deltaFat.toFixed(1).replace('.', ',')}% vs mês anterior`
        : ''

    return [
      // 1. FATURAMENTO YTD / 12M (REAL Sankhya TGFCAB)
      {
        id: 'fat-12m',
        label: 'FATURAMENTO 12M',
        value: fmtMilhoes(processed.fat12m),
        numericValue: processed.fat12m,
        delta: deltaFatStr,
        deltaType: (processed.deltaFat || 0) >= 0 ? 'positive' : 'negative',
        iconName: 'dollar-sign',
        semDados: false,
      },
      // 2. EBITDA (Ausente no sync atual — requer DRE / plano de contas)
      {
        id: 'ebitda',
        label: 'EBITDA',
        value: 'Sem dados',
        numericValue: 0,
        delta: '',
        deltaType: 'positive',
        iconName: 'chart-line',
        semDados: true,
        motivoSemDados: 'Requer integração da DRE / Balancete contábil no Sankhya.',
      },
      // 3. MARGEM BRUTA (Ausente no sync atual — requer CMV / custos de produtos)
      {
        id: 'margem-bruta',
        label: 'MARGEM BRUTA',
        value: 'Sem dados',
        numericValue: 0,
        delta: '',
        deltaType: 'positive',
        iconName: 'percent',
        semDados: true,
        motivoSemDados: 'Requer sincronização de CMV e custos diretos do Sankhya.',
      },
      // 4. RECEBÍVEL VENCIDO (REAL Sankhya TGFFIN)
      {
        id: 'recebivel-vencido',
        label: 'RECEBÍVEL VENCIDO',
        value: fmtMilhoes(processed.arVencido),
        numericValue: processed.arVencido,
        delta: `Total A/R: ${fmtMilhoes(processed.arTotal)}`,
        deltaType: 'negative',
        iconName: 'alert-triangle',
        semDados: false,
      },
      // 5. PAGAR 30D / VENCIDO (REAL Sankhya TGFFIN)
      {
        id: 'pagar-30d',
        label: 'PAGAR ABERTO / 30D',
        value: fmtMilhoes(processed.apTotal),
        numericValue: processed.apTotal,
        delta: `Vencido: ${fmtMilhoes(processed.apVencido)}`,
        deltaType: 'negative',
        iconName: 'clock',
        semDados: false,
      },
      // 6. TURNOVER RH (Ausente no sync atual — dados de folha/RH)
      {
        id: 'turnover',
        label: 'TURNOVER MÊS',
        value: 'Sem dados',
        numericValue: 0,
        delta: '',
        deltaType: 'negative',
        iconName: 'users',
        semDados: true,
        motivoSemDados: 'Módulo de folha/RH não incluído na rotina do Sankhya.',
      },
    ]
  }, [processed, fonte])

  // Contexto para o Parecer IA
  const contextoIa = useMemo(() => {
    if (!processed || fonte !== 'real') {
      return 'Dashboard em modo demonstração (dados mock).'
    }
    return (
      `Dashboard Executivo do grupo — Filtro: ${nomeEmpresaSelecionada}. ` +
      `Faturamento acumulado 12 meses: ${fmtMilhoes(processed.fat12m)} (TGFCAB). ` +
      `Faturamento no último mês (${processed.ultimoMesLabel}): ${fmtMilhoes(processed.fatUltimoMes)}. ` +
      `Contas a Receber total em aberto: ${fmtMilhoes(processed.arTotal)}, sendo vencido: ${fmtMilhoes(processed.arVencido)}. ` +
      `Contas a Pagar total em aberto: ${fmtMilhoes(processed.apTotal)}, sendo vencido: ${fmtMilhoes(processed.apVencido)}. ` +
      `Top unidades/empresas: ${processed.topEmpresas.map((u) => `${u.name}: ${fmtMilhoes(u.value)}`).join(', ')}. ` +
      `Status do Sync Sankhya: ${processed.geradoEmFormatado ? `Sincronizado em ${processed.geradoEmFormatado}` : 'Recente'}.`
    )
  }, [processed, fonte, nomeEmpresaSelecionada])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B5E20] mb-3" />
        <span className="text-sm font-medium">Carregando dados sincronizados do Sankhya...</span>
      </div>
    )
  }

  const isMock = fonte === 'mock'
  const dataAtualizacao = processed?.geradoEmFormatado || formatarDataHoraBR(geradoEm)

  return (
    <div className="space-y-6 pb-8">
      {/* 1) CABEÇALHO COM BADGE DE FONTE E SELETOR / STATUS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
              Dashboard Executivo
            </h1>
            {isMock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <FlaskConical className="h-3 w-3" /> Demonstração (mock)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="h-3.5 w-3.5 text-[#1B5E20]" /> Real — Sankhya
              </span>
            )}

            {/* Chip da Empresa Selecionada */}
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
              {nomeEmpresaSelecionada}
            </span>
          </div>

          <p className="text-xs sm:text-[13px] text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {isMock ? (
              <>Visão demonstrativa — dados reais indisponíveis no momento.</>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 text-emerald-600" />
                Dados reais integrados da rotina diária do Sankhya
                {dataAtualizacao && (
                  <span className="text-gray-400 font-medium ml-1">
                    · Atualizado em {dataAtualizacao}
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => carregarDadosSankhya(true)}
            disabled={recarregando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 shadow-2xs transition-colors disabled:opacity-50"
            title="Recarregar dados do cache"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-gray-500 ${recarregando ? 'animate-spin' : ''}`}
            />
            <span>Atualizar</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-gray-500" />
            <span>
              {processed?.ultimoMesLabel
                ? `Janela 12m (${processed.ultimoMesLabel})`
                : 'Últimos 12 meses'}
            </span>
          </div>
        </div>
      </div>

      {/* Alerta de transparência sobre métricas contábeis/RH */}
      {!isMock && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-50/60 border border-blue-200/80 text-xs text-blue-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            <strong>Fonte dos dados:</strong> Faturamento e Contas a Receber/Pagar refletem o ERP
            Sankhya (tabelas TGFCAB e TGFFIN). Indicadores de EBITDA, Margem Bruta e Turnover de RH
            constam identificados como sem dados até ativação das rotinas contábeis e de pessoal.
          </span>
        </div>
      )}

      {/* 2) 6 KPIS */}
      <section aria-label="Indicadores-Chave de Desempenho">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi, idx) => (
            <KpiCard key={kpi.id} kpi={kpi} index={idx} />
          ))}
        </div>
      </section>

      {/* 3) GRÁFICOS: FATURAMENTO 12M, MARGEM BRUTA 12M, COMPOSIÇÃO DE DESPESAS / AGING */}
      <section aria-label="Demonstrativos Gráficos">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico de Barras — Faturamento 12m por Empresa */}
          <div className="lg:col-span-2">
            <RevenueBarChart
              data={processed?.monthlyRevenues || []}
              empresaSelecionada={nomeEmpresaSelecionada}
              ultimaAtualizacao={dataAtualizacao}
            />
          </div>

          {/* Coluna direita: Margem Bruta (estado honesto) + Rosca A/R Aging Real */}
          <div className="space-y-4">
            {/* Margem Bruta 12m (exibe aviso honesto) */}
            <MarginLineChart semDados={true} empresaSelecionada={nomeEmpresaSelecionada} />

            {/* Composição de Carteira / Aging A/R Real */}
            <ExpenseDonutChart
              data={processed?.arAging || []}
              total={fmtMilhoes(processed?.arTotal || 0)}
              titulo="Composição A/R por Faixa"
              subtitulo="Distribuição de títulos a receber no Sankhya"
              fonteReal={!isMock}
            />
          </div>
        </div>
      </section>

      {/* 4) TOP UNIDADES + PRÓXIMOS COMPROMISSOS */}
      <section aria-label="Unidades e Agenda">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopUnitsChart
            data={processed?.topEmpresas || []}
            subtitulo={`Ranking acumulado 12 meses — ${nomeEmpresaSelecionada}`}
          />
          <UpcomingCommitmentsCard commitments={compromissos} />
        </div>
      </section>

      {/* 5) ALERTAS CRÍTICOS + PARECER IA */}
      <section aria-label="Alertas e IA">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CriticalAlertsCard alerts={alertas} />
          <ParecerIaCard
            titulo="Parecer IA — Análise Executiva"
            contexto={contextoIa}
            prompt="Você é o diretor executivo do Grupo Extrafruti. Com base nos dados reais do ERP Sankhya apresentados no contexto (faturamento 12m, títulos a receber e a pagar em aberto e vencidos, ranking de unidades e empresas), forneça um parecer executivo sucinto apontando os principais destaques financeiros, riscos de inadimplência/liquidez e 3 recomendações estratégicas."
          />
        </div>
      </section>
    </div>
  )
}
