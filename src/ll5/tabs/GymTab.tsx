import { useEffect, useMemo, useState } from 'react'
import {
  Dumbbell,
  CalendarDays,
  Gauge,
  Trophy,
  Loader2,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Activity,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar } from '@/ll5/repo'
import { garminAdapter } from '@/ll5/adapters'
import ParecerIaCard from '@/ll5/ParecerIaCard'
import TabelaInterativa from './TabelaInterativa'

// ============================================================================
// ABA GYM (v3, 15/11/2026)
//
// 1a) Cards calculados sobre a lista COMPLETA (o filtro de semana age só na
//     tabela).
// 1b) "Exercícios recentes" virou TABELA: cabeçalho ordenável ao clique,
//     redimensionável e reorganizável por arrasto (TabelaInterativa).
// 1c) As caixas "Progressão de carga" e "Distribuição por grupo muscular"
//     saíram do lado e viraram TAGS nas colunas ("Carga" e "Músculos"),
//     à direita de "Registro de freq." — cada uma abre a sua caixa.
// ============================================================================

const DIV_LABEL: Record<string, string> = {
  peito: 'Peito',
  costas: 'Costas',
  pernas: 'Pernas',
  ombros: 'Ombros',
  bracos: 'Braços',
  core: 'Core',
  custom: 'Livre',
  outro: 'Outro',
}

function dataBR(iso?: string | null): string {
  if (!iso) return '—'
  return String(iso).slice(0, 10).split('-').reverse().join('/')
}

export default function GymTab({
  aba,
  parecerVisivel = false,
}: {
  aba: any
  parecerVisivel?: boolean
}) {
  const { ator, ownerAtual } = useLl5()
  const [sessoes, setSessoes] = useState<any[]>([])
  const [exercicios, setExercicios] = useState<any[]>([])
  const [importadas, setImportadas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)
  const [garmin, setGarmin] = useState<any>(null)

  // tags da tabela
  const [tagAberta, setTagAberta] = useState<string | null>(null)
  const [semanaFiltro, setSemanaFiltro] = useState<string | null>(null)
  // 1c: qual caixa lateral está aberta ('carga' | 'musculos' | null)
  const [caixaLateral, setCaixaLateral] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      const [s, e, g, imp] = await Promise.all([
        listar('ll5_gym_sessions', ator, { ownerEscolhido: ownerAtual, sort: '-data' }),
        listar('ll5_gym_exercises', ator, { ownerEscolhido: ownerAtual }),
        garminAdapter.status(),
        listar('ll5_activity', ator, {
          ownerEscolhido: ownerAtual,
          filtroExtra: 'origem_aba = "gym"',
          sort: '-data_hora_inicio',
        }),
      ])
      if (!vivo) return
      setSessoes(s)
      setExercicios(e)
      setGarmin(g)
      setImportadas(imp || [])
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [ator, ownerAtual])

  /** Lista COMPLETA (manuais + importadas). Base dos cards. */
  const todasSessoes = useMemo(() => {
    const manuais = sessoes.map((s) => ({
      id: s.id,
      data: s.data,
      divisao: s.divisao,
      volume_total_kg: s.volume_total_kg,
      rpe_medio: s.rpe_medio,
      duracao_min: s.duracao_min,
      fonte: s.fonte,
      origem_registro: 'manual' as const,
      qualidade_dados: 'completo',
      tem_detalhe_exercicio: true,
      calorias: null,
      fc_media: null,
      fc_max: null,
      carga_proxy: null,
      titulo: null,
    }))
    const importados = importadas.map((a) => ({
      id: a.id,
      data: a.data_hora_inicio,
      divisao: 'custom',
      volume_total_kg: a.volume_kg,
      rpe_medio: null,
      duracao_min: a.duracao_s ? Math.round(a.duracao_s / 60) : null,
      fonte: a.fonte,
      origem_registro: 'importado' as const,
      qualidade_dados: a.qualidade_dados || 'limitado',
      tem_detalhe_exercicio: !!a.tem_detalhe_exercicio,
      calorias: a.calorias,
      fc_media: a.fc_media,
      fc_max: a.fc_max,
      carga_proxy: a.carga_proxy,
      titulo: a.titulo,
    }))
    return [...manuais, ...importados].sort(
      (x, y) => new Date(y.data).getTime() - new Date(x.data).getTime(),
    )
  }, [sessoes, importadas])

  /** 1a — os CARDS usam a lista completa; só a TABELA filtra pela semana. */
  const kpis = useMemo(() => {
    const corte = new Date()
    corte.setDate(corte.getDate() - 30)
    const janela = todasSessoes.filter((s) => new Date(s.data) >= corte)

    const comDetalhe = janela.filter((s) => s.tem_detalhe_exercicio)
    const volume = comDetalhe.reduce((a, s) => a + Number(s.volume_total_kg || 0), 0)
    const rpe = comDetalhe.length
      ? comDetalhe.reduce((a, s) => a + Number(s.rpe_medio || 0), 0) / comDetalhe.length
      : 0

    let pr = 0
    let prEx = '—'
    for (const e of exercicios) {
      for (const s of Array.isArray(e.series) ? e.series : []) {
        const c = Number(s.carga_kg || 0)
        if (c > pr) {
          pr = c
          prEx = e.exercicio_nome
        }
      }
    }

    const semDetalhe = janela.length - comDetalhe.length
    return {
      volume,
      sessoes: janela.length,
      rpe,
      pr,
      prEx,
      comDetalhe: comDetalhe.length,
      semDetalhe,
    }
  }, [todasSessoes, exercicios])

  const porGrupo = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const e of exercicios) {
      const g = e.grupo_muscular || 'Outro'
      const vol = (Array.isArray(e.series) ? e.series : []).reduce(
        (a: number, s: any) => a + Number(s.reps || 0) * Number(s.carga_kg || 0),
        0,
      )
      mapa[g] = (mapa[g] || 0) + vol
    }
    const total = Object.values(mapa).reduce((a, b) => a + b, 0) || 1
    return Object.entries(mapa)
      .map(([g, v]) => ({ grupo: g, valor: v, pct: (v / total) * 100 }))
      .sort((a, b) => b.valor - a.valor)
  }, [exercicios])

  /** Filtro de semana — aplicado SÓ na tabela. */
  const sessoesFiltradas = useMemo(() => {
    if (!semanaFiltro) return todasSessoes
    const [dia, mes] = semanaFiltro.split('/').map((n) => Number(n))
    const ano = new Date().getFullYear()
    const inicioSemana = new Date(ano, mes - 1, dia)
    const fimSemana = new Date(inicioSemana)
    fimSemana.setDate(fimSemana.getDate() + 7)
    return todasSessoes.filter((s) => {
      const d = new Date(s.data)
      return d >= inicioSemana && d < fimSemana
    })
  }, [todasSessoes, semanaFiltro])

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* GYM 1a — "Parecer IA — GYM" ACIMA dos cards, só sob clique */}
      {parecerVisivel && (
        <ParecerIaCard
          scope="gym"
          titulo="Parecer IA — GYM"
          resumo="Avalie volume, progressão de carga e equilíbrio entre grupos musculares."
          dados={{
            volume_30d: kpis.volume,
            sessoes: kpis.sessoes,
            rpe_medio: kpis.rpe,
            pr: kpis.pr,
          }}
        />
      )}

      {/* KPIs — sobre a lista completa (1a) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            l: 'Volume (30d)',
            v: kpis.comDetalhe > 0 ? kpis.volume.toLocaleString('pt-BR') + ' kg' : '—',
            ico: Dumbbell,
            sub:
              kpis.semDetalhe > 0
                ? `${kpis.semDetalhe} sessão(ões) sem detalhe de carga`
                : undefined,
          },
          {
            l: 'Sessões',
            v: String(kpis.sessoes),
            ico: CalendarDays,
            sub: kpis.semDetalhe > 0 ? `${kpis.semDetalhe} de frequência` : undefined,
          },
          {
            l: 'Carga média (RPE)',
            v: kpis.comDetalhe > 0 ? kpis.rpe.toFixed(1).replace('.', ',') : '—',
            ico: Gauge,
          },
          {
            l: 'Recordes (PR)',
            v: kpis.pr > 0 ? kpis.pr + ' kg' : '—',
            ico: Trophy,
            sub: kpis.prEx,
          },
        ].map((k) => (
          <Card key={k.l} className="p-4 rounded-xl border-gray-200 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {k.l}
              </span>
              <k.ico className="h-4 w-4 text-[#1b5e20]" />
            </div>
            <div className="text-[22px] font-extrabold text-gray-900 mt-1.5 tabular-nums leading-none">
              {k.v}
            </div>
            {k.sub && <div className="text-[10.5px] text-gray-400 mt-1 truncate">{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Frequência semanal — clicar filtra a tabela (GYM 2) */}
      {todasSessoes.length > 0 && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-gray-900">Frequência semanal</h3>
            <div className="flex items-center gap-2">
              {semanaFiltro && (
                <button
                  type="button"
                  onClick={() => setSemanaFiltro(null)}
                  className="text-[10px] font-semibold text-red-600 hover:underline"
                >
                  limpar filtro
                </button>
              )}
              <span className="text-[10px] text-gray-400">
                {semanaFiltro ? `semana de ${semanaFiltro}` : 'últimas 12 semanas · clique filtra'}
              </span>
            </div>
          </div>
          <FrequenciaSemanal
            sessoes={todasSessoes}
            selecionada={semanaFiltro}
            onSelecionar={(rotulo) => setSemanaFiltro(semanaFiltro === rotulo ? null : rotulo)}
          />
        </Card>
      )}

      {/* Caixas que abrem pelas tags da tabela (1c) */}
      {caixaLateral === 'carga' && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-gray-900">Progressão de carga</h3>
            <button
              type="button"
              onClick={() => setCaixaLateral(null)}
              className="text-[10px] font-semibold text-gray-500 hover:text-red-600"
            >
              fechar
            </button>
          </div>
          {exercicios.length === 0 ? (
            <p className="text-[11px] text-gray-500 py-3 leading-snug">
              Sem exercício detalhado. As sessões importadas do Garmin são registro de frequência —
              não trazem carga por exercício.
            </p>
          ) : (
            <ProgressaoCarga exercicios={exercicios} />
          )}
        </Card>
      )}

      {caixaLateral === 'musculos' && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-gray-900">Distribuição por grupo muscular</h3>
            <button
              type="button"
              onClick={() => setCaixaLateral(null)}
              className="text-[10px] font-semibold text-gray-500 hover:text-red-600"
            >
              fechar
            </button>
          </div>
          {porGrupo.length === 0 ? (
            <p className="text-[11.5px] text-gray-500 py-3 leading-snug">
              Sem dados de exercícios. Sessões de frequência não informam grupo muscular.
            </p>
          ) : (
            <div className="space-y-1.5">
              {porGrupo.map((g) => (
                <div key={g.grupo} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-24 truncate">{g.grupo}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: g.pct + '%', backgroundColor: '#1b5e20' }}
                    />
                  </div>
                  <span className="text-[10.5px] font-semibold text-gray-700 tabular-nums w-8 text-right">
                    {g.pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 1b — tabela com cabeçalho interativo */}
      <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-gray-900">Exercícios recentes</h3>
          {kpis.semDetalhe > 0 && (
            <Badge
              variant="outline"
              className="text-[8.5px] font-bold border-amber-300 text-amber-800 bg-amber-50"
            >
              {kpis.semDetalhe} de frequência
            </Badge>
          )}
          <span className="ml-auto text-[10px] text-gray-400">
            clique ordena · arraste a borda redimensiona · arraste o cabeçalho reordena
          </span>
        </div>

        {todasSessoes.length === 0 ? (
          <div className="py-12 text-center">
            <Dumbbell className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-[12px] font-semibold text-gray-700">Nenhuma sessão registrada</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Registre um treino ou sincronize o Garmin.
            </p>
          </div>
        ) : (
          <TabelaInterativa
            id="gym.sessoes"
            dados={sessoesFiltradas}
            onLinhaClique={(r) => setAberta(aberta === r.id ? null : r.id)}
            colunas={[
              {
                key: 'data',
                label: 'Data',
                largura: 100,
                valor: (r: any) => new Date(r.data).getTime(),
                render: (r: any) => (
                  <span className="font-semibold text-gray-800 tabular-nums">{dataBR(r.data)}</span>
                ),
              },
              {
                key: 'divisao',
                label: 'Divisão',
                largura: 110,
                render: (r: any) => (
                  <span className="text-gray-700">{DIV_LABEL[r.divisao] || r.divisao}</span>
                ),
              },
              {
                key: 'titulo',
                label: 'Sessão',
                largura: 190,
                render: (r: any) => (
                  <span className="text-gray-600 block truncate">
                    {r.origem_registro === 'importado'
                      ? r.titulo || 'Sessão importada'
                      : `${exercicios.filter((e) => e.sessao_id === r.id).length} exercício(s)`}
                  </span>
                ),
              },
              {
                key: 'duracao_min',
                label: 'Duração',
                largura: 90,
                align: 'right',
                valor: (r: any) => Number(r.duracao_min || 0),
                render: (r: any) => (
                  <span className="text-gray-700 tabular-nums whitespace-nowrap">
                    {r.duracao_min != null ? `${r.duracao_min} min` : '—'}
                  </span>
                ),
              },
              {
                key: 'fc_media',
                label: 'FC méd',
                largura: 85,
                align: 'right',
                valor: (r: any) => Number(r.fc_media || 0),
                render: (r: any) => (
                  <span className="text-gray-600 tabular-nums whitespace-nowrap">
                    {r.fc_media != null ? `${r.fc_media} bpm` : '—'}
                  </span>
                ),
              },
              {
                key: 'fc_max',
                label: 'FC máx',
                largura: 85,
                align: 'right',
                valor: (r: any) => Number(r.fc_max || 0),
                render: (r: any) => (
                  <span className="text-gray-600 tabular-nums whitespace-nowrap">
                    {r.fc_max != null ? `${r.fc_max} bpm` : '—'}
                  </span>
                ),
              },
              {
                key: 'calorias',
                label: 'Calorias',
                largura: 80,
                align: 'right',
                valor: (r: any) => Number(r.calorias || 0),
                render: (r: any) => (
                  <span className="text-gray-600 tabular-nums">{r.calorias ?? '—'}</span>
                ),
              },
              {
                key: 'volume_total_kg',
                label: 'Volume kg',
                largura: 95,
                align: 'right',
                valor: (r: any) => Number(r.volume_total_kg || 0),
                render: (r: any) =>
                  r.tem_detalhe_exercicio ? (
                    <span className="text-gray-700 tabular-nums">
                      {Number(r.volume_total_kg || 0).toLocaleString('pt-BR')}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  ),
              },
              {
                key: 'fonte',
                label: 'Origem',
                largura: 90,
                align: 'center',
                render: (r: any) => (
                  <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-600">
                    {r.fonte === 'garmin_api'
                      ? 'API'
                      : r.fonte === 'garmin_csv'
                        ? 'CSV'
                        : r.fonte === 'garmin_fit'
                          ? '.FIT'
                          : r.fonte === 'garmin'
                            ? 'Garmin'
                            : 'Manual'}
                  </Badge>
                ),
              },
              {
                // 1c — TAGS à direita de "Registro de freq."
                key: 'tags',
                label: 'Registro de freq.',
                largura: 220,
                render: (r: any) => (
                  <div className="flex items-center gap-1">
                    {r.origem_registro === 'importado' && !r.tem_detalhe_exercicio && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setTagAberta(tagAberta === r.id ? null : r.id)
                        }}
                        title="Clique para ver a explicação"
                      >
                        <Badge
                          variant="outline"
                          className="text-[8.5px] font-bold border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                        >
                          Frequência
                        </Badge>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setCaixaLateral(caixaLateral === 'carga' ? null : 'carga')
                      }}
                      title="Abrir Progressão de carga"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[8.5px] font-bold cursor-pointer whitespace-nowrap',
                          caixaLateral === 'carga'
                            ? 'border-[#1b5e20] text-white bg-[#1b5e20]'
                            : 'border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100',
                        )}
                      >
                        Carga
                      </Badge>
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setCaixaLateral(caixaLateral === 'musculos' ? null : 'musculos')
                      }}
                      title="Abrir Distribuição por grupo muscular"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[8.5px] font-bold cursor-pointer whitespace-nowrap',
                          caixaLateral === 'musculos'
                            ? 'border-[#1b5e20] text-white bg-[#1b5e20]'
                            : 'border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100',
                        )}
                      >
                        Músculos
                      </Badge>
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}

        {/* detalhe da linha: explicação da tag + exercícios */}
        {aberta && (
          <div className="px-4 pb-3 border-t border-gray-100 pt-2.5 space-y-2">
            {tagAberta === aberta && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                <p className="text-[10.5px] font-bold text-amber-900 mb-1">
                  Registro de frequência — sem detalhe de exercício
                </p>
                <p className="text-[10.5px] text-amber-800 leading-snug">
                  O Garmin não envia exercício, série ou carga desta sessão. Ela conta para
                  frequência semanal e sessões, mas fica fora de "Volume" e "Progressão de carga".
                </p>
              </div>
            )}

            {(() => {
              const exs = exercicios.filter((e) => e.sessao_id === aberta)
              if (!exs.length) return null
              return (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50/70">
                      <tr className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">
                        <th className="text-left px-2 py-1.5">Exercício</th>
                        <th className="text-left px-2 py-1.5">Séries × Reps</th>
                        <th className="text-right px-2 py-1.5">Carga</th>
                        <th className="text-right px-2 py-1.5">RPE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {exs.map((e) => {
                        const series = Array.isArray(e.series) ? e.series : []
                        const reps = series[0]?.reps || 0
                        const carga = series[0]?.carga_kg || 0
                        const rpe = series[0]?.rpe || '—'
                        return (
                          <tr key={e.id}>
                            <td className="px-2 py-1.5 text-gray-800 font-medium">
                              {e.exercicio_nome}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600 tabular-nums">
                              {series.length}×{reps}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                              {carga > 0 ? carga + ' kg' : 'peso corporal'}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                              {rpe}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * Barras de frequência por semana (últimas 12).
 * Clicar numa semana filtra a tabela (GYM 2).
 */
function FrequenciaSemanal({
  sessoes,
  selecionada,
  onSelecionar,
}: {
  sessoes: any[]
  selecionada?: string | null
  onSelecionar?: (rotulo: string) => void
}) {
  const semanas = useMemo(() => {
    const hoje = new Date()
    const out: Array<{ rotulo: string; total: number; comDetalhe: number; inicio: Date }> = []
    for (let i = 11; i >= 0; i--) {
      const fim = new Date(hoje)
      fim.setDate(fim.getDate() - i * 7)
      const inicio = new Date(fim)
      inicio.setDate(inicio.getDate() - 6)
      inicio.setHours(0, 0, 0, 0)
      const f = new Date(fim)
      f.setHours(23, 59, 59, 999)

      const daSemana = sessoes.filter((s) => {
        const d = new Date(s.data)
        return d >= inicio && d <= f
      })
      out.push({
        rotulo: `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`,
        total: daSemana.length,
        comDetalhe: daSemana.filter((s) => s.tem_detalhe_exercicio).length,
        inicio,
      })
    }
    return out
  }, [sessoes])

  const maximo = Math.max(...semanas.map((s) => s.total), 1)

  return (
    <div>
      <div className="flex items-end gap-1 h-[80px]">
        {semanas.map((s, i) => {
          const ativa = selecionada === s.rotulo
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelecionar?.(s.rotulo)}
              className={cn(
                'flex-1 flex flex-col items-center justify-end gap-0.5 rounded-t transition-colors',
                ativa ? 'bg-emerald-50' : 'hover:bg-gray-50',
              )}
              title={`Semana de ${s.rotulo}: ${s.total} sessão(ões) — ${s.comDetalhe} com detalhe. Clique para filtrar.`}
            >
              <span className="text-[9px] font-bold text-gray-600 tabular-nums">
                {s.total > 0 ? s.total : ''}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(s.total / maximo) * 58}px`,
                  minHeight: s.total > 0 ? 4 : 1,
                  backgroundColor: s.total > 0 ? (ativa ? '#0F3D13' : '#1b5e20') : '#f3f4f6',
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {semanas.map((s, i) => (
          <span key={i} className="flex-1 text-center text-[8px] text-gray-400 tabular-nums">
            {s.rotulo}
          </span>
        ))}
      </div>
    </div>
  )
}

function ProgressaoCarga({ exercicios }: { exercicios: any[] }) {
  // agrupa por exercício e mostra a evolução da maior carga
  const porExercicio: Record<string, number[]> = {}
  for (const e of exercicios) {
    const nome = e.exercicio_nome || 'Exercício'
    const series = Array.isArray(e.series) ? e.series : []
    const maior = Math.max(...series.map((s: any) => Number(s.carga_kg || 0)), 0)
    if (maior > 0) {
      if (!porExercicio[nome]) porExercicio[nome] = []
      porExercicio[nome].push(maior)
    }
  }

  const entradas = Object.entries(porExercicio)
    .filter(([, v]) => v.length > 1)
    .slice(0, 6)

  if (!entradas.length) {
    return (
      <p className="text-[11px] text-gray-500 py-3 leading-snug">
        Sem histórico suficiente para mostrar progressão (mínimo 2 registros por exercício).
      </p>
    )
  }

  const maxGlobal = Math.max(...entradas.flatMap(([, v]) => v), 1)

  return (
    <div className="space-y-2">
      {entradas.map(([nome, valores]) => (
        <div key={nome} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-700 w-32 truncate">{nome}</span>
          <div className="flex-1 flex items-end gap-0.5 h-6">
            {valores.slice(-8).map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-[#1b5e20]/70 rounded-t"
                style={{ height: `${(v / maxGlobal) * 24}px`, minHeight: 2 }}
                title={`${v} kg`}
              />
            ))}
          </div>
          <span className="text-[10px] text-gray-500 tabular-nums w-12 text-right">
            {valores[valores.length - 1]} kg
          </span>
        </div>
      ))}
    </div>
  )
}
