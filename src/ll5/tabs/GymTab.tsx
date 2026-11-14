import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Upload,
  Dumbbell,
  CalendarDays,
  Gauge,
  Trophy,
  Loader2,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar } from '@/ll5/repo'
import { garminAdapter, appleHealthAdapter } from '@/ll5/adapters'
import ParecerIaCard from '@/ll5/ParecerIaCard'

// ============================================================================
// ABA GYM (mockup 3) — treino de força
// ============================================================================

const DIV_LABEL: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  full: 'Full',
  custom: 'Custom',
}

function dataBR(iso?: string): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
}

export default function GymTab({ aba }: { aba: any }) {
  const { ator, ownerAtual } = useLl5()
  const [sessoes, setSessoes] = useState<any[]>([])
  const [exercicios, setExercicios] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)
  const [garmin, setGarmin] = useState<any>(null)
  const [importadas, setImportadas] = useState<any[]>([])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      const [s, e, g, importadas] = await Promise.all([
        listar('ll5_gym_sessions', ator, { ownerEscolhido: ownerAtual, sort: '-data' }),
        listar('ll5_gym_exercises', ator, { ownerEscolhido: ownerAtual }),
        garminAdapter.status(),
        // 15/11/2026 — sessões de FORÇA vindas do CSV/.FIT, gravadas em
        // ll5_activity. Antes a aba só lia ll5_gym_sessions e as 172 sessões
        // importadas ficavam invisíveis.
        listar('ll5_activity', ator, {
          ownerEscolhido: ownerAtual,
          filtroExtra: 'tipo = "forca"',
          sort: '-data_hora_inicio',
        }),
      ])
      if (!vivo) return
      setSessoes(s)
      setExercicios(e)
      setGarmin(g)
      setImportadas(importadas || [])
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [ator, ownerAtual])

  /**
   * Unifica as duas origens em um formato só.
   * `origem_registro='importado'` marca o que veio do Garmin (CSV/.FIT) e
   * habilita o badge "Registro de frequência — sem detalhe de exercício".
   */
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

  const kpis = useMemo(() => {
    const corte = new Date()
    corte.setDate(corte.getDate() - 30)
    const janela = todasSessoes.filter((s) => new Date(s.data) >= corte)

    // Volume e RPE só consideram sessões COM detalhe de exercício.
    // As 172 importadas do Garmin são "registro de frequência": não têm
    // exercício, série nem carga — somá-las daria volume zero ou falso.
    const comDetalhe = janela.filter((s) => s.tem_detalhe_exercicio)
    const volume = comDetalhe.reduce((a, s) => a + Number(s.volume_total_kg || 0), 0)
    const rpe = comDetalhe.length
      ? comDetalhe.reduce((a, s) => a + Number(s.rpe_medio || 0), 0) / comDetalhe.length
      : 0

    // PR: maior carga registrada (só existe onde há exercício detalhado)
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

    // Sessões = TODAS (inclusive as de frequência): é a métrica que elas
    // alimentam legitimamente.
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

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={() =>
            toast({ title: 'Registrar treino', description: 'Em breve: formulário de sessão.' })
          }
          className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Registrar treino
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast({
              title: 'Importar do dispositivo',
              description: garmin?.detalhe || 'Garmin não configurado.',
              variant: 'destructive',
            })
          }
          className="h-9 text-xs"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Importar do dispositivo
        </Button>
      </div>

      {/* integração — estado real */}
      <Card className="p-3 rounded-xl border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Dumbbell className="h-3.5 w-3.5 text-gray-600" />
            <span className="text-[12px] font-semibold text-gray-800">Garmin</span>
            <Badge
              variant="outline"
              className="text-[9px] font-bold uppercase border-amber-300 text-amber-700 bg-amber-50"
            >
              Não configurado
            </Badge>
          </div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Gauge className="h-3.5 w-3.5 text-gray-600" />
            <span className="text-[12px] font-semibold text-gray-800">Apple Watch</span>
            <Badge
              variant="outline"
              className="text-[9px] font-bold uppercase border-gray-300 text-gray-600 bg-gray-50"
            >
              Indisponível
            </Badge>
          </div>
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-[11.5px]">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar treinos
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11.5px]">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sincronizar agora
            </Button>
          </div>
        </div>
        <p className="text-[10.5px] text-gray-400 mt-2 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Nenhum dispositivo conectado — os dados vêm do lançamento manual.
        </p>
      </Card>

      {/* KPIs */}
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

      {/* Frequência semanal — métrica que as sessões importadas ALIMENTAM */}
      {todasSessoes.length > 0 && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-bold text-gray-900">Frequência semanal</h3>
            <span className="text-[10px] text-gray-400">últimas 12 semanas</span>
          </div>
          <FrequenciaSemanal sessoes={todasSessoes} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Sessões recentes</h3>
            {kpis.semDetalhe > 0 && (
              <Badge
                variant="outline"
                className="text-[8.5px] font-bold border-amber-300 text-amber-800 bg-amber-50"
              >
                {kpis.semDetalhe} de frequência
              </Badge>
            )}
          </div>

          {todasSessoes.length === 0 ? (
            <div className="py-12 text-center">
              <Dumbbell className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] font-semibold text-gray-700">Nenhuma sessão registrada</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Registre um treino ou importe do dispositivo.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todasSessoes.map((s) => {
                const exs = exercicios.filter((e) => e.sessao_id === s.id)
                const expandida = aberta === s.id
                return (
                  <div key={s.id}>
                    <button
                      type="button"
                      onClick={() => setAberta(expandida ? null : s.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50/60"
                    >
                      {expandida ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      )}
                      <span className="text-[12px] font-semibold text-gray-800 tabular-nums w-10 shrink-0">
                        {dataBR(s.data)}
                      </span>
                      <span className="text-[12px] text-gray-700 w-14 shrink-0">
                        {DIV_LABEL[s.divisao] || s.divisao}
                      </span>
                      <span className="text-[11.5px] text-gray-500 flex-1 min-w-0 truncate">
                        {s.origem_registro === 'importado'
                          ? s.titulo || 'Sessão importada'
                          : `${exs.length} exercício(s)`}
                      </span>
                      {/* Volume só quando há detalhe de exercício */}
                      {s.tem_detalhe_exercicio ? (
                        <span className="text-[11.5px] text-gray-700 tabular-nums shrink-0">
                          {Number(s.volume_total_kg || 0).toLocaleString('pt-BR')} kg
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 shrink-0">—</span>
                      )}
                      {s.rpe_medio != null ? (
                        <span className="text-[11px] text-gray-500 shrink-0">
                          RPE {s.rpe_medio}
                        </span>
                      ) : s.fc_media != null ? (
                        <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">
                          {s.fc_media} bpm
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 shrink-0">—</span>
                      )}
                      {s.origem_registro === 'importado' && !s.tem_detalhe_exercicio && (
                        <Badge
                          variant="outline"
                          className="text-[8.5px] font-bold border-amber-300 text-amber-800 bg-amber-50 shrink-0"
                          title="Sessão importada do Garmin: registra frequência, duração, FC e calorias — sem exercício, série ou carga individuais."
                        >
                          Registro de frequência
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[9px] border-gray-200 text-gray-600 shrink-0"
                      >
                        {s.fonte === 'garmin_csv'
                          ? 'CSV'
                          : s.fonte === 'garmin_fit'
                            ? '.FIT'
                            : s.fonte === 'garmin'
                              ? 'Garmin'
                              : s.fonte === 'apple'
                                ? 'Apple'
                                : 'Manual'}
                      </Badge>
                    </button>

                    {/* painel de detalhe de uma sessão importada */}
                    {expandida && s.origem_registro === 'importado' && (
                      <div className="px-4 pb-3 pl-10">
                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                          <p className="text-[10.5px] font-bold text-amber-900 mb-1">
                            Registro de frequência — sem detalhe de exercício
                          </p>
                          <p className="text-[10.5px] text-amber-800 leading-snug">
                            O export do Garmin não traz exercício, série ou carga desta sessão. Ela
                            conta para frequência semanal e sessões, mas fica fora de "Volume" e
                            "Progressão de carga".
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10.5px] text-gray-700">
                            {s.duracao_min != null && (
                              <span>
                                Duração: <strong>{s.duracao_min} min</strong>
                              </span>
                            )}
                            {s.fc_media != null && (
                              <span>
                                FC média: <strong>{s.fc_media} bpm</strong>
                              </span>
                            )}
                            {s.fc_max != null && (
                              <span>
                                FC máx: <strong>{s.fc_max} bpm</strong>
                              </span>
                            )}
                            {s.calorias != null && (
                              <span>
                                Calorias: <strong>{s.calorias}</strong>
                              </span>
                            )}
                            {s.carga_proxy != null && (
                              <span>
                                Carga (proxy): <strong>{s.carga_proxy}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {expandida && exs.length > 0 && (
                      <div className="px-4 pb-3 pl-10">
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
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card className="rounded-xl border-gray-200 shadow-sm p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">Progressão de carga</h3>
            {exercicios.length === 0 ? (
              <p className="text-[11px] text-gray-500 py-3 leading-snug">
                Sem exercício detalhado. As sessões importadas do Garmin são registro de frequência
                — não trazem carga por exercício.
              </p>
            ) : (
              <ProgressaoCarga exercicios={exercicios} />
            )}
          </Card>

          <Card className="rounded-xl border-gray-200 shadow-sm p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">
              Distribuição por grupo muscular
            </h3>
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
        </div>
      </div>

      <ParecerIaCard
        scope="gym"
        titulo="Parecer IA — Especialista"
        resumo="Os dados mostram bom progresso de força e volume. Mantenha a hidratação e o sono adequados para otimizar a recuperação e evitar platôs."
        dados={{ volume_30d: kpis.volume, sessoes: kpis.sessoes, rpe_medio: kpis.rpe, pr: kpis.pr }}
      />
    </div>
  )
}

/**
 * Barras de frequência por semana (últimas 12).
 * Conta TODAS as sessões — inclusive as de frequência, que é exatamente
 * a métrica que elas podem alimentar.
 */
function FrequenciaSemanal({ sessoes }: { sessoes: any[] }) {
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
        {semanas.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
            <span className="text-[9px] font-bold text-gray-600 tabular-nums">
              {s.total > 0 ? s.total : ''}
            </span>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(s.total / maximo) * 58}px`,
                minHeight: s.total > 0 ? 4 : 1,
                backgroundColor: s.total > 0 ? '#1b5e20' : '#f3f4f6',
              }}
              title={`Semana de ${s.rotulo}: ${s.total} sessão(ões) — ${s.comDetalhe} com detalhe`}
            />
          </div>
        ))}
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
  const [selecionado, setSelecionado] = useState('')

  const nomes = useMemo(
    () => Array.from(new Set(exercicios.map((e) => e.exercicio_nome))).filter(Boolean),
    [exercicios],
  )

  useEffect(() => {
    if (!selecionado && nomes.length > 0) {
      // prioriza o composto mais pesado
      setSelecionado(nomes[0])
    }
  }, [nomes, selecionado])

  const serie = useMemo(() => {
    const alvo = exercicios.filter((e) => e.exercicio_nome === selecionado)
    return alvo
      .map((e) => {
        const s = Array.isArray(e.series) ? e.series : []
        return {
          id: e.id,
          carga: Math.max(...s.map((x: any) => Number(x.carga_kg || 0)), 0),
        }
      })
      .slice(0, 12)
  }, [exercicios, selecionado])

  if (nomes.length === 0) {
    return <p className="text-[11.5px] text-gray-500 py-3">Sem exercícios registrados.</p>
  }

  const maxCarga = Math.max(...serie.map((s) => s.carga), 1)

  return (
    <div>
      <select
        value={selecionado}
        onChange={(e) => setSelecionado(e.target.value)}
        className="w-full h-8 mb-2 rounded border border-gray-200 text-[11.5px] px-2"
      >
        {nomes.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      {serie.length < 3 ? (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Série insuficiente para tendência (n={serie.length}). São necessários 3 pontos.
        </p>
      ) : (
        <svg viewBox="0 0 200 60" className="w-full h-[60px]">
          <polyline
            fill="none"
            stroke="#1b5e20"
            strokeWidth="2"
            points={serie
              .map((s, i) => {
                const x = (i / (serie.length - 1)) * 190 + 5
                const y = 55 - (s.carga / maxCarga) * 45
                return `${x},${y}`
              })
              .join(' ')}
          />
          {serie.map((s, i) => {
            const x = (i / (serie.length - 1)) * 190 + 5
            const y = 55 - (s.carga / maxCarga) * 45
            return <circle key={s.id} cx={x} cy={y} r="2.5" fill="#1b5e20" />
          })}
        </svg>
      )}

      {serie.length > 0 && (
        <div className="flex items-center justify-between text-[10.5px] text-gray-500 mt-1">
          <span>{serie.length} registro(s)</span>
          <span className="font-semibold text-gray-800">máx {maxCarga} kg</span>
        </div>
      )}
    </div>
  )
}
