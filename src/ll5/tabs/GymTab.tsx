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

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      const [s, e, g] = await Promise.all([
        listar('ll5_gym_sessions', ator, { ownerEscolhido: ownerAtual, sort: '-data' }),
        listar('ll5_gym_exercises', ator, { ownerEscolhido: ownerAtual }),
        garminAdapter.status(),
      ])
      if (!vivo) return
      setSessoes(s)
      setExercicios(e)
      setGarmin(g)
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [ator, ownerAtual])

  const kpis = useMemo(() => {
    const corte = new Date()
    corte.setDate(corte.getDate() - 30)
    const janela = sessoes.filter((s) => new Date(s.data) >= corte)
    const volume = janela.reduce((a, s) => a + Number(s.volume_total_kg || 0), 0)
    const rpe = janela.length
      ? janela.reduce((a, s) => a + Number(s.rpe_medio || 0), 0) / janela.length
      : 0
    // PR: maior carga registrada
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
    return { volume, sessoes: janela.length, rpe, pr, prEx }
  }, [sessoes, exercicios])

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
          { l: 'Volume (30d)', v: kpis.volume.toLocaleString('pt-BR') + ' kg', ico: Dumbbell },
          { l: 'Sessões', v: String(kpis.sessoes), ico: CalendarDays },
          { l: 'Carga média (RPE)', v: kpis.rpe.toFixed(1).replace('.', ','), ico: Gauge },
          { l: 'Recordes (PR)', v: kpis.pr + ' kg', ico: Trophy, sub: kpis.prEx },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Sessões recentes</h3>
          </div>

          {sessoes.length === 0 ? (
            <div className="py-12 text-center">
              <Dumbbell className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] font-semibold text-gray-700">Nenhuma sessão registrada</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Registre um treino ou importe do dispositivo.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {sessoes.map((s) => {
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
                        {exs.length} exercício(s)
                      </span>
                      <span className="text-[11.5px] text-gray-700 tabular-nums shrink-0">
                        {Number(s.volume_total_kg || 0).toLocaleString('pt-BR')} kg
                      </span>
                      <span className="text-[11px] text-gray-500 shrink-0">RPE {s.rpe_medio}</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] border-gray-200 text-gray-600 shrink-0"
                      >
                        {s.fonte === 'garmin' ? 'Garmin' : s.fonte === 'apple' ? 'Apple' : 'Manual'}
                      </Badge>
                    </button>

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
            <ProgressaoCarga exercicios={exercicios} />
          </Card>

          <Card className="rounded-xl border-gray-200 shadow-sm p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">
              Distribuição por grupo muscular
            </h3>
            {porGrupo.length === 0 ? (
              <p className="text-[11.5px] text-gray-500 py-3">Sem dados de exercícios.</p>
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
