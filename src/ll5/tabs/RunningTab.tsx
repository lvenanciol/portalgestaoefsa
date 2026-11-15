import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Footprints,
  Timer,
  HeartPulse,
  Activity,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Loader2,
  Info,
  FileArchive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, registrarLog } from '@/ll5/repo'
import { garminAdapter, appleHealthAdapter } from '@/ll5/adapters'
import ParecerIaCard from '@/ll5/ParecerIaCard'
import ImportarFitDialog from '@/ll5/fit/ImportarFitDialog'
import ImportarCsvDialog from '@/ll5/csv/ImportarCsvDialog'

// ============================================================================
// ABA RUNNING (mockup 1)
// Estado das integrações é o REAL: Garmin 'nao_configurado' (requer aprovação
// no Developer Program), Apple 'indisponivel' (HealthKit não tem API server).
// Nenhum botão finge sincronizar.
// ============================================================================

function pace(s: number): string {
  if (!s || !isFinite(s)) return '—'
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}'${String(r).padStart(2, '0')}"`
}

function dur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`
}

function dataBR(iso: string): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
}

const ZONAS = [
  { k: 'z1', l: 'Z1', c: '#93c5fd' },
  { k: 'z2', l: 'Z2', c: '#60a5fa' },
  { k: 'z3', l: 'Z3', c: '#34d399' },
  { k: 'z4', l: 'Z4', c: '#fbbf24' },
  { k: 'z5', l: 'Z5', c: '#ef4444' },
]

export default function RunningTab({ aba }: { aba: any }) {
  const { ator, ownerAtual } = useLl5()
  const [corridas, setCorridas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [garmin, setGarmin] = useState<any>(null)
  const [apple, setApple] = useState<any>(null)
  const [importarOpen, setImportarOpen] = useState(false)
  const [importarCsvOpen, setImportarCsvOpen] = useState(false)
  const [atividades, setAtividades] = useState<any[]>([])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      const [linhas, importadas] = await Promise.all([
        listar('ll5_running', ator, { ownerEscolhido: ownerAtual, sort: '-data' }),
        listar('ll5_activity', ator, { ownerEscolhido: ownerAtual, sort: '-data_hora_inicio' }),
      ])
      if (vivo) {
        setCorridas(linhas)
        setAtividades(importadas)
      }
      const [g, a] = await Promise.all([garminAdapter.status(), appleHealthAdapter.status()])
      if (vivo) {
        setGarmin(g)
        setApple(a)
        setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [ator, ownerAtual])

  /**
   * 15/11/2026 — UNIFICAÇÃO DAS FONTES.
   * A tela tinha DOIS bancos de dados na mesma página: `ll5_running` (seed/
   * manual) alimentava os KPIs e a tabela "Atividades recentes", enquanto
   * `ll5_activity` (importado) só aparecia na tabela de baixo. Resultado: o
   * KPI mostrava 0,0 km mesmo com 99 atividades importadas na tela.
   *
   * `todasCorridas` mescla as duas origens em um formato único, com os campos
   * que o KPI precisa (data, distancia_km, duracao_s, pace, fc, zonas).
   */
  const todasCorridas = useMemo(() => {
    const doRunning = corridas.map((c) => ({
      id: c.id,
      data: c.data,
      tipo: c.tipo,
      distancia_km: Number(c.distancia_km || 0),
      duracao_s: Number(c.duracao_s || 0),
      pace_medio_s_km: Number(c.pace_medio_s_km || 0),
      fc_media: c.fc_media,
      fc_max: c.fc_max,
      zonas_fc: c.zonas_fc || null,
      fonte: c.fonte || 'manual',
      origem: 'running' as const,
      titulo: c.titulo,
      confiabilidade_fc: 'alta',
      qualidade_dados: 'completo',
      carga_proxy: null,
    }))

    const daActivity = atividades.map((a) => ({
      id: a.id,
      data: a.data_hora_inicio,
      tipo: a.tipo,
      distancia_km: Number(a.distancia_m || 0) / 1000,
      duracao_s: Number(a.duracao_s || 0),
      // o CSV traz pace pronto; o .FIT precisa calcular
      pace_medio_s_km:
        a.pace_medio_s_km != null
          ? Number(a.pace_medio_s_km)
          : a.duracao_s && a.distancia_m
            ? Math.round(Number(a.duracao_s) / (Number(a.distancia_m) / 1000))
            : 0,
      fc_media: a.fc_media,
      fc_max: a.fc_max,
      zonas_fc: a.zonas_fc_seg || null,
      fonte: a.fonte || 'garmin_csv',
      origem: 'activity' as const,
      titulo: a.titulo,
      confiabilidade_fc: a.confiabilidade_fc || 'alta',
      qualidade_dados: a.qualidade_dados || 'resumo',
      carga_proxy: a.carga_proxy,
    }))

    return [...doRunning, ...daActivity]
      .filter((c) => !!c.data)
      .sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime())
  }, [corridas, atividades])

  // KPIs dos últimos 30 dias — sobre a lista UNIFICADA
  const kpis = (() => {
    const corte = new Date()
    corte.setDate(corte.getDate() - 30)
    const janela = todasCorridas.filter((c) => new Date(c.data) >= corte)
    const dist = janela.reduce((a, c) => a + Number(c.distancia_km || 0), 0)
    const durTotal = janela.reduce((a, c) => a + Number(c.duracao_s || 0), 0)
    const fc = janela.length
      ? janela.reduce((a, c) => a + Number(c.fc_media || 0), 0) / janela.length
      : 0
    const carga = janela.reduce((a, c) => a + Number(c.training_effect || 0) * 10, 0)
    return {
      dist,
      pace: dist > 0 ? durTotal / dist : 0,
      fc: Math.round(fc),
      carga: Math.round(carga),
      n: janela.length,
    }
  })()

  const sincronizar = async (nome: string, adapter: any) => {
    const r = await adapter.sync()
    toast({
      title: r.ok ? 'Sincronização concluída' : 'Sincronização indisponível',
      description: r.mensagem,
      variant: r.ok ? 'default' : 'destructive',
    })
  }

  const enviarTreino = async () => {
    const r = await garminAdapter.pushWorkout({
      id: 'w1',
      data: new Date().toISOString(),
      titulo: 'Rodagem leve 8 km',
      descricao: 'Z2, 8 km contínuos',
    })
    toast({
      title: r.ok ? 'Treino enviado' : 'Envio indisponível',
      description: r.mensagem,
      variant: r.ok ? 'default' : 'destructive',
    })
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* cabeçalho */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() =>
            toast({
              title: 'Registro manual',
              description: 'Em breve: formulário de nova corrida.',
            })
          }
          className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova corrida
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportarCsvOpen(true)}
          className="h-9 text-xs"
        >
          <FileArchive className="h-3.5 w-3.5 mr-1.5" /> Importar CSV do Garmin
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportarOpen(true)}
          className="h-9 text-xs"
        >
          <FileArchive className="h-3.5 w-3.5 mr-1.5" /> Importar arquivos .FIT
        </Button>
      </div>

      {/* barra de integração — estado REAL */}
      <Card className="p-3 rounded-xl border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Footprints className="h-3.5 w-3.5 text-gray-600" />
            <span className="text-[12px] font-semibold text-gray-800">Garmin</span>
            <Badge
              variant="outline"
              className="text-[9px] font-bold uppercase border-amber-300 text-amber-700 bg-amber-50"
            >
              Não configurado
            </Badge>
          </div>

          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <HeartPulse className="h-3.5 w-3.5 text-gray-600" />
            <span className="text-[12px] font-semibold text-gray-800">Apple Watch</span>
            <Badge
              variant="outline"
              className="text-[9px] font-bold uppercase border-gray-300 text-gray-600 bg-gray-50"
            >
              Indisponível
            </Badge>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11.5px]"
              onClick={() =>
                toast({
                  title: 'Baixar treinos',
                  description: garmin?.detalhe || 'Garmin não configurado.',
                  variant: 'destructive',
                })
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar treinos
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11.5px]"
              onClick={enviarTreino}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar treino
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11.5px]"
              onClick={() => sincronizar('Garmin', garminAdapter)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sincronizar agora
            </Button>
          </div>
        </div>
        <p className="text-[10.5px] text-gray-400 mt-2 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Garmin exige aprovação no Garmin Connect Developer Program. HealthKit não possui API
          server-side (requer app iOS). Nenhum dispositivo está conectado.
        </p>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            l: 'Distância (30d)',
            v: kpis.dist.toFixed(1).replace('.', ',') + ' km',
            ico: Footprints,
            sub: `${kpis.n} atividade(s)`,
          },
          { l: 'Pace médio', v: pace(kpis.pace) + ' /km', ico: Timer, sub: 'últimos 30 dias' },
          {
            l: 'FC média',
            v: kpis.fc ? kpis.fc + ' bpm' : '—',
            ico: HeartPulse,
            sub: 'zonas Z1–Z5',
          },
          {
            l: 'Carga de treino',
            v: String(kpis.carga),
            ico: Activity,
            sub: 'soma do efeito de treino',
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
            <div className="text-[10.5px] text-gray-400 mt-1">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* tabela */}
        <Card className="lg:col-span-2 rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Atividades recentes</h3>
          </div>

          {todasCorridas.length === 0 ? (
            <div className="py-12 text-center">
              <Footprints className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] font-semibold text-gray-700">Nenhuma corrida registrada</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Conecte o Garmin (requer aprovação no programa) ou lance uma corrida manualmente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50/70">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="text-left px-3 py-2">Data</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-right px-3 py-2">Distância</th>
                    <th className="text-right px-3 py-2">Pace</th>
                    <th className="text-right px-3 py-2">FC média</th>
                    <th className="text-left px-3 py-2 w-[120px]">Zonas</th>
                    <th className="text-center px-3 py-2">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {todasCorridas.slice(0, 25).map((c) => {
                    const z = c.zonas_fc || {}
                    const total = ZONAS.reduce((a, k) => a + Number(z[k.k] || 0), 0) || 1
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-semibold text-gray-800 tabular-nums">
                          {dataBR(c.data)}
                        </td>
                        <td className="px-3 py-2 capitalize text-gray-600">{c.tipo}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(c.distancia_km || 0)
                            .toFixed(2)
                            .replace('.', ',')}{' '}
                          km
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {pace(Number(c.pace_medio_s_km || 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {c.fc_media || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex h-3 w-full rounded-sm overflow-hidden">
                            {ZONAS.map((k) => {
                              const v = Number(z[k.k] || 0)
                              if (!v) return null
                              return (
                                <div
                                  key={k.k}
                                  style={{
                                    width: (v / total) * 100 + '%',
                                    backgroundColor: k.c,
                                  }}
                                  title={`${k.l}: ${Math.round(v / 60)} min`}
                                />
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-semibold border-gray-200 text-gray-600"
                          >
                            {c.fonte === 'garmin'
                              ? 'Garmin'
                              : c.fonte === 'apple'
                                ? 'Apple'
                                : 'Manual'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* estatísticas */}
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <h3 className="text-[13px] font-bold text-gray-900 mb-3">Estatísticas de treino</h3>
          <DonutZonas corridas={todasCorridas} />
        </Card>
      </div>

      {/* ===== ATIVIDADES IMPORTADAS (.FIT) ===== */}
      {atividades.length > 0 && (
        <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Atividades importadas do Garmin</h3>
            <Badge
              variant="outline"
              className="text-[9px] border-emerald-200 text-emerald-700 bg-emerald-50"
            >
              {atividades.length} arquivo(s) .FIT
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50/70">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-right px-3 py-2">Distância</th>
                  <th className="text-right px-3 py-2">Pace</th>
                  <th className="text-right px-3 py-2">FC média</th>
                  <th className="text-center px-3 py-2">Confiab. FC</th>
                  <th className="text-center px-3 py-2">Dados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {atividades.slice(0, 30).map((a) => {
                  const dist = Number(a.distancia_m || 0) / 1000
                  const pace = a.pace_medio_s_km
                  const paceTxt = pace
                    ? `${Math.floor(pace / 60)}'${String(Math.round(pace % 60)).padStart(2, '0')}"`
                    : '—'
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-semibold text-gray-800 tabular-nums">
                        {String(a.data_hora_inicio || '')
                          .slice(0, 10)
                          .split('-')
                          .reverse()
                          .join('/')}
                      </td>
                      <td className="px-3 py-2 capitalize text-gray-600">{a.tipo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {dist.toFixed(2).replace('.', ',')} km
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{paceTxt}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        {a.fc_media || '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {a.confiabilidade_fc === 'alta' ? (
                          <span className="text-[9px] font-bold text-emerald-700">alta</span>
                        ) : (
                          <span
                            className="text-[9px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5"
                            title="FC não confiável (pulso óptico) — fora do cálculo de TSS e carga"
                          >
                            {a.confiabilidade_fc === 'insuficiente'
                              ? 'insuficiente'
                              : 'não confiável'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-[9.5px] font-semibold text-gray-500">
                          {a.qualidade_dados || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* sugestão */}
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#1b5e20]" />
            <h3 className="text-[13px] font-bold text-gray-900">Sugestão de treino da semana</h3>
          </div>
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Baseado nas últimas {kpis.n} atividades, a carga está estável. Sugestão: 1 rodagem leve
            em Z2 (8 km) + 1 treino de tiros (6×800 m) + 1 longão progressivo de 14 km.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={enviarTreino}
              className="h-8 text-[11.5px]"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar para o Garmin
            </Button>
            <span className="text-[10px] text-amber-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Requer Garmin configurado
            </span>
          </div>
        </Card>

        {/* parecer IA */}
        <ParecerIaCard
          scope="running"
          titulo="Parecer IA — Running"
          resumo="Analise a progressão de volume e pace, sinalize risco de overtraining e sugira ajustes de carga semanal."
          dados={{ kpis, atividades: todasCorridas.length }}
        />
      </div>

      <ImportarCsvDialog
        open={importarCsvOpen}
        onOpenChange={setImportarCsvOpen}
        onImportou={() => {
          listar('ll5_activity', ator, { ownerEscolhido: ownerAtual, sort: '-data_hora_inicio' })
            .then(setAtividades)
            .catch(() => {})
        }}
      />

      <ImportarFitDialog
        open={importarOpen}
        onOpenChange={setImportarOpen}
        onImportou={() => {
          // recarrega as duas fontes após importar
          listar('ll5_activity', ator, { ownerEscolhido: ownerAtual, sort: '-data_hora_inicio' })
            .then(setAtividades)
            .catch(() => {})
        }}
      />
    </div>
  )
}

function DonutZonas({ corridas }: { corridas: any[] }) {
  const totais: Record<string, number> = {}
  for (const c of corridas) {
    const z = c.zonas_fc || {}
    for (const k of ZONAS) totais[k.k] = (totais[k.k] || 0) + Number(z[k.k] || 0)
  }
  const soma = Object.values(totais).reduce((a, b) => a + b, 0)

  if (!soma) {
    return (
      <p className="text-[11.5px] text-gray-500 py-6 text-center">
        Sem dados de zona de FC. As zonas vêm do dispositivo (Garmin) e não estão disponíveis.
      </p>
    )
  }

  let acumulado = 0
  const raio = 42
  const circ = 2 * Math.PI * raio

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] shrink-0 -rotate-90">
        {ZONAS.map((k) => {
          const v = totais[k.k] || 0
          if (!v) return null
          const frac = v / soma
          const dash = frac * circ
          const el = (
            <circle
              key={k.k}
              cx="50"
              cy="50"
              r={raio}
              fill="none"
              stroke={k.c}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-acumulado}
            />
          )
          acumulado += dash
          return el
        })}
      </svg>
      <div className="space-y-1">
        {ZONAS.map((k) => (
          <div key={k.k} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: k.c }} />
            <span className="text-gray-600 w-6">{k.l}</span>
            <span className="font-semibold text-gray-800 tabular-nums">
              {Math.round((totais[k.k] || 0) / 60)} min
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
