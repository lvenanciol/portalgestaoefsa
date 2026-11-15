import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  FileSpreadsheet,
  Plus,
  Footprints,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, registrarLog } from '@/ll5/repo'
import { garminAdapter, appleHealthAdapter } from '@/ll5/adapters'
import ParecerIaCard from '@/ll5/ParecerIaCard'
import TabelaInterativa from './TabelaInterativa'
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

/** segundos → "1:23:45" ou "23:45" */
function hms(s: number | null | undefined): string {
  const t = Number(s || 0)
  if (!t) return '—'
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const seg = Math.round(t % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
  return `${m}:${String(seg).padStart(2, '0')}`
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
  const [limpando, setLimpando] = useState(false)

  /** Apaga CSV/.FIT e mantém só a API (fonte única). */
  const limparCsv = async () => {
    setLimpando(true)
    try {
      const r: any = await pb.send('/backend/v1/ll5/limpar-csv', {
        method: 'POST',
        body: '{}',
      })
      toast({
        title: 'Limpeza concluída',
        description:
          `${r.apagadas || 0} removida(s) · ${r.mantidas_api || 0} mantida(s) da API.` +
          (r.falhas ? ` · ${r.falhas} falha(s).` : '') +
          ` Fontes: ${Object.keys(r.fontes || {}).join(', ')}`,
      })
      const l = await listar('ll5_activity', ator, {
        ownerEscolhido: ownerAtual,
        sort: '-data_hora_inicio',
      })
      setAtividades(l)
    } catch (e: any) {
      const detalhe = e?.response?.data?.erro || e?.message || String(e)
      toast({ title: 'Falha na limpeza', description: detalhe, variant: 'destructive' })
    } finally {
      setLimpando(false)
    }
  }
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
      // campos completos para a tabela de recentes (b)
      titulo: a.titulo,
      duracao_s: Number(a.duracao_s || 0),
      melhor_pace_s_km: a.melhor_pace_s_km,
      gap_s_km: a.gap_s_km,
      cadencia_spm: a.cadencia_spm,
      ganho_elevacao_m: a.ganho_elevacao_m,
      calorias: a.calorias,
      te_aerobico: a.te_aerobico,
      passos: a.passos,
      fc_max: a.fc_max,
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
      origem_aba: a.origem_aba,
    }))

    // 15/11/2026 — REMOÇÃO DAS CORRIDAS COM 0 km.
    // O print mostrava linhas "Outro / 0,00 km / —" misturadas com corridas
    // reais. Elas vêm de sessões de força (forca→outro) e de registros sem
    // distância. Não são corrida: não devem aparecer nesta tabela nem
    // alimentar os KPIs de distância/pace.
    //
    // Critério: distância > 0 E tipo de corrida (rua/esteira/trail/indoor).
    // Sessões de força (origem_aba='gym') NÃO entram aqui — elas vivem na
    // aba GYM.
    // a) (15/11/2026) — A ABA RUNNING NÃO EXIBE FORÇA.
    // Sessões de força têm `origem_aba='gym'`; elas vivem SÓ na aba GYM.
    // Filtro em duas camadas: origem_aba e tipo.
    const TIPOS_CORRIDA = ['rua', 'esteira', 'trail', 'indoor']
    return [...doRunning, ...daActivity]
      .filter((c) => !!c.data)
      .filter((c) => c.origem !== 'activity' || c.origem_aba !== 'gym')
      .filter((c) => Number(c.distancia_km || 0) > 0)
      .filter((c) => TIPOS_CORRIDA.includes(String(c.tipo || '')))
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
      {/* barra de integração — estado REAL (o botão "Importar" vive aqui) */}
      <Card className="p-3 rounded-xl border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Footprints className="h-3.5 w-3.5 text-gray-600" />
            <span className="text-[12px] font-semibold text-gray-800">Garmin</span>
            {/* 15/11/2026 — o badge estava HARDCODED em "Não configurado".
                Mostrava "Garmin não configurado" mesmo com a API conectada.
                Agora reflete o estado real do adapter. */}
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] font-bold uppercase',
                garmin?.estado === 'conectado'
                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                  : garmin?.estado === 'pendente'
                    ? 'border-amber-300 text-amber-700 bg-amber-50'
                    : 'border-gray-300 text-gray-600 bg-gray-50',
              )}
            >
              {garmin?.estado === 'conectado'
                ? 'Conectado'
                : garmin?.estado === 'pendente'
                  ? 'Pendente'
                  : 'Não configurado'}
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
            {/* c) (15/11/2026): o botão "Importar" fica à ESQUERDA de "Baixar treinos" */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[11.5px]">
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Importar
                  <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 bg-white border-gray-200 z-[120]">
                {/* 15/11/2026 — A API É A FONTE ÚNICA.
                    Importar CSV/FIT junto com a API gerava a mesma corrida em
                    2-3 versões (o PocketBase normaliza data de forma diferente
                    por origem, então nenhum dedupe funcionou).
                    As opções continuam aqui como RESERVA, desativadas, para o
                    caso de a API ficar indisponível. */}
                <DropdownMenuItem
                  onClick={() => {
                    toast({
                      title: 'Use a API como fonte única',
                      description:
                        'A sincronização traz tudo do Garmin. Importar CSV ou .FIT junto geraria a mesma corrida em duplicata. Para usar o arquivo como reserva, fale comigo.',
                      variant: 'destructive',
                    })
                  }}
                  className="cursor-pointer text-[12px] gap-2 opacity-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-500">CSV do Garmin</p>
                    <p className="text-[10.5px] text-gray-400">Desativado — a API é a fonte</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    toast({
                      title: 'Use a API como fonte única',
                      description:
                        'A sincronização traz tudo do Garmin. Importar .FIT junto geraria a mesma corrida em duplicata.',
                      variant: 'destructive',
                    })
                  }}
                  className="cursor-pointer text-[12px] gap-2 opacity-50"
                >
                  <FileArchive className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-500">Arquivos .FIT</p>
                    <p className="text-[10.5px] text-gray-400">Desativado — a API é a fonte</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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

            {/* 15/11/2026 — mantém SOMENTE a fonte garmin_api.
                Os pares CSV/API idênticos vinham de duas importações da mesma
                corrida; nenhum dedupe funcionou porque o PocketBase normaliza
                a data de forma diferente por origem. */}
            <Button
              variant="outline"
              size="sm"
              onClick={limparCsv}
              disabled={limpando}
              className="h-8 text-[11.5px] text-red-600 border-red-200 hover:bg-red-50"
              title="Remove todas as atividades importadas de CSV/.FIT — mantém só a API"
            >
              {limpando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Limpar CSV/.FIT
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

      {/* b2 (15/11/2026) — BARRA HORIZONTAL DE ZONAS acima da tabela.
          Era um card lateral que ocupava 1/3 da largura sem necessidade.
          Como barra horizontal, funciona como legenda/progressão da tabela. */}
      {/* d) (15/11/2026): o DONUT foi REMOVIDO. Fica só a barra empilhada com
          a legenda das zonas — é o que serve de progressão/legenda da tabela. */}
      <Card className="rounded-xl border-gray-200 shadow-sm px-4 py-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-[13px] font-bold text-gray-900 shrink-0">Zonas de FC</h3>
          <DonutZonas corridas={todasCorridas} horizontal />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {/* tabela */}
        <Card className="rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Atividades recentes</h3>
            <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-500">
              últimas 5
            </Badge>
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
            <TabelaInterativa
              id="running.recentes"
              dados={todasCorridas}
              limite={5}
              colunas={[
                {
                  key: 'data',
                  label: 'Data',
                  largura: 90,
                  valor: (r: any) => new Date(r.data).getTime(),
                  render: (r: any) => (
                    <span className="font-semibold text-gray-800 tabular-nums">
                      {dataBR(r.data)}
                    </span>
                  ),
                },
                {
                  key: 'titulo',
                  label: 'Título',
                  largura: 180,
                  render: (r: any) => (
                    <span className="text-gray-700 block truncate">{r.titulo || '—'}</span>
                  ),
                },
                {
                  key: 'tipo',
                  label: 'Tipo',
                  largura: 90,
                  render: (r: any) => <span className="capitalize text-gray-600">{r.tipo}</span>,
                },
                {
                  key: 'duracao_s',
                  label: 'Duração',
                  largura: 90,
                  align: 'right',
                  valor: (r: any) => Number(r.duracao_s || 0),
                  render: (r: any) => <span className="text-gray-600">{hms(r.duracao_s)}</span>,
                },
                {
                  key: 'distancia_km',
                  label: 'Distância',
                  largura: 105,
                  align: 'right',
                  render: (r: any) => (
                    <span>
                      {Number(r.distancia_km || 0)
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      km
                    </span>
                  ),
                },
                {
                  key: 'pace_medio_s_km',
                  label: 'Pace',
                  largura: 85,
                  align: 'right',
                  render: (r: any) => (
                    <span className="text-gray-600">{pace(Number(r.pace_medio_s_km || 0))}</span>
                  ),
                },
                {
                  key: 'melhor_pace_s_km',
                  label: 'Best pace',
                  largura: 90,
                  align: 'right',
                  valor: (r: any) => Number(r.melhor_pace_s_km || 0),
                  render: (r: any) => (
                    <span className="text-gray-600">{pace(Number(r.melhor_pace_s_km || 0))}</span>
                  ),
                },
                {
                  key: 'gap_s_km',
                  label: 'GAP',
                  largura: 75,
                  align: 'right',
                  valor: (r: any) => Number(r.gap_s_km || 0),
                  render: (r: any) => (
                    <span className="text-gray-600">{pace(Number(r.gap_s_km || 0))}</span>
                  ),
                },
                {
                  key: 'fc_media',
                  label: 'FC média',
                  largura: 90,
                  align: 'right',
                  render: (r: any) => <span className="text-gray-600">{r.fc_media || '—'}</span>,
                },
                {
                  key: 'fc_max',
                  label: 'FC máx',
                  largura: 80,
                  align: 'right',
                  valor: (r: any) => Number(r.fc_max || 0),
                  render: (r: any) => <span className="text-gray-600">{r.fc_max ?? '—'}</span>,
                },
                {
                  key: 'cadencia_spm',
                  label: 'Cadência',
                  largura: 85,
                  align: 'right',
                  valor: (r: any) => Number(r.cadencia_spm || 0),
                  render: (r: any) => (
                    <span className="text-gray-600">{r.cadencia_spm ?? '—'}</span>
                  ),
                },
                {
                  key: 'ganho_elevacao_m',
                  label: 'Ganho alt.',
                  largura: 90,
                  align: 'right',
                  valor: (r: any) => Number(r.ganho_elevacao_m || 0),
                  render: (r: any) => (
                    <span className="text-gray-600">
                      {r.ganho_elevacao_m != null ? r.ganho_elevacao_m + ' m' : '—'}
                    </span>
                  ),
                },
                {
                  key: 'calorias',
                  label: 'Calorias',
                  largura: 80,
                  align: 'right',
                  valor: (r: any) => Number(r.calorias || 0),
                  render: (r: any) => <span className="text-gray-600">{r.calorias ?? '—'}</span>,
                },
                {
                  key: 'te_aerobico',
                  label: 'TE',
                  largura: 60,
                  align: 'right',
                  valor: (r: any) => Number(r.te_aerobico || 0),
                  render: (r: any) => (
                    <span className="text-gray-600">
                      {r.te_aerobico != null ? String(r.te_aerobico).replace('.', ',') : '—'}
                    </span>
                  ),
                },
                {
                  key: 'passos',
                  label: 'Passos',
                  largura: 80,
                  align: 'right',
                  valor: (r: any) => Number(r.passos || 0),
                  render: (r: any) => <span className="text-gray-600">{r.passos ?? '—'}</span>,
                },
                {
                  key: 'zonas_fc',
                  label: 'Zonas',
                  largura: 150,
                  valor: (r: any) =>
                    ZONAS.reduce((a, k) => a + Number((r.zonas_fc || {})[k.k] || 0), 0),
                  render: (r: any) => {
                    const z = r.zonas_fc || {}
                    const total = ZONAS.reduce((a, k) => a + Number(z[k.k] || 0), 0) || 1
                    return (
                      <div className="flex h-3 w-full rounded-sm overflow-hidden">
                        {ZONAS.map((k) => {
                          const v = Number(z[k.k] || 0)
                          if (!v) return null
                          return (
                            <div
                              key={k.k}
                              style={{ width: (v / total) * 100 + '%', backgroundColor: k.c }}
                              title={`${k.l}: ${Math.round(v / 60)} min`}
                            />
                          )
                        })}
                      </div>
                    )
                  },
                },
                {
                  key: 'fonte',
                  label: 'Origem',
                  largura: 95,
                  align: 'center',
                  render: (r: any) => (
                    <Badge
                      variant="outline"
                      className="text-[9px] font-semibold border-gray-200 text-gray-600"
                    >
                      {/* 15/11/2026 — garmin_api aparecia como ".FIT" porque o
                          ternário só distinguia garmin_csv do resto. */}
                      {r.origem === 'activity'
                        ? r.fonte === 'garmin_api'
                          ? 'API'
                          : r.fonte === 'garmin_csv'
                            ? 'CSV'
                            : '.FIT'
                        : r.fonte === 'garmin'
                          ? 'Garmin'
                          : 'Manual'}
                    </Badge>
                  ),
                },
              ]}
            />
          )}
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
              {atividades.length} atividade(s) importada(s)
            </Badge>
          </div>
          {/* b3 (15/11/2026) — TODAS as colunas do CSV, com ordenação por
              clique, redimensionamento e reordenação por arrasto.
              As colunas marcadas (ignoradas no CSV) NÃO aparecem por decisão
              de parsing: TSS (100% zerado), Total Strokes, Swolf, Stroke Rate,
              Min/Max Temp, Decompression, Favorite. */}
          <TabelaInterativa
            id="running.importadas"
            // GRMN (15/11/2026) — FORÇA NÃO APARECE NA ABA RUNNING.
            // O filtro anterior só olhava o `tipo`, e a força é gravada como
            // `tipo='outro'` (o enum não aceita 'forca'). A classificação real
            // está em `origem_aba='gym'`. Filtramos os dois casos.
            dados={atividades.filter(
              (a: any) =>
                a.origem_aba !== 'gym' &&
                ['rua', 'esteira', 'trail', 'indoor'].includes(String(a.tipo || '')),
            )}
            colunas={[
              {
                key: 'data_hora_inicio',
                label: 'Data',
                largura: 95,
                valor: (r: any) => new Date(r.data_hora_inicio).getTime(),
                render: (r: any) => (
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {String(r.data_hora_inicio || '')
                      .slice(0, 10)
                      .split('-')
                      .reverse()
                      .join('/')}
                  </span>
                ),
              },
              {
                key: 'titulo',
                label: 'Título',
                largura: 190,
                render: (r: any) => (
                  <span className="text-gray-700 block truncate">{r.titulo || '—'}</span>
                ),
              },
              {
                key: 'tipo',
                label: 'Tipo',
                largura: 80,
                render: (r: any) => (
                  <span className="capitalize text-gray-600">
                    {r.origem_aba === 'gym' ? 'força' : r.tipo || '—'}
                  </span>
                ),
              },
              {
                key: 'distancia_m',
                label: 'Distância km',
                largura: 105,
                align: 'right',
                valor: (r: any) => Number(r.distancia_m || 0),
                render: (r: any) => (
                  <span>{(Number(r.distancia_m || 0) / 1000).toFixed(2).replace('.', ',')}</span>
                ),
              },
              {
                key: 'duracao_s',
                label: 'Duração',
                largura: 90,
                align: 'right',
                valor: (r: any) => Number(r.duracao_s || 0),
                render: (r: any) => <span className="text-gray-600">{hms(r.duracao_s)}</span>,
              },
              {
                key: 'pace_medio_s_km',
                label: 'Pace',
                largura: 80,
                align: 'right',
                valor: (r: any) => Number(r.pace_medio_s_km || 0),
                render: (r: any) => (
                  <span className="text-gray-600">{pace(Number(r.pace_medio_s_km || 0))}</span>
                ),
              },
              {
                key: 'melhor_pace_s_km',
                label: 'Best pace',
                largura: 90,
                align: 'right',
                valor: (r: any) => Number(r.melhor_pace_s_km || 0),
                render: (r: any) => (
                  <span className="text-gray-600">{pace(Number(r.melhor_pace_s_km || 0))}</span>
                ),
              },
              {
                key: 'gap_s_km',
                label: 'GAP',
                largura: 75,
                align: 'right',
                valor: (r: any) => Number(r.gap_s_km || 0),
                render: (r: any) => (
                  <span className="text-gray-600">{pace(Number(r.gap_s_km || 0))}</span>
                ),
              },
              {
                key: 'fc_media',
                label: 'FC méd',
                largura: 75,
                align: 'right',
                valor: (r: any) => Number(r.fc_media || 0),
                render: (r: any) => <span className="text-gray-600">{r.fc_media ?? '—'}</span>,
              },
              {
                key: 'fc_max',
                label: 'FC máx',
                largura: 75,
                align: 'right',
                valor: (r: any) => Number(r.fc_max || 0),
                render: (r: any) => <span className="text-gray-600">{r.fc_max ?? '—'}</span>,
              },
              {
                key: 'cadencia_spm',
                label: 'Cadência',
                largura: 85,
                align: 'right',
                valor: (r: any) => Number(r.cadencia_spm || 0),
                render: (r: any) => (
                  <span className="text-gray-600">
                    {r.cadencia_spm ?? (r.cadencia_invalida ? 'inválida' : '—')}
                  </span>
                ),
              },
              {
                key: 'ganho_elevacao_m',
                label: 'Ganho alt.',
                largura: 90,
                align: 'right',
                valor: (r: any) => Number(r.ganho_elevacao_m || 0),
                render: (r: any) => (
                  <span className="text-gray-600">
                    {r.ganho_elevacao_m != null ? r.ganho_elevacao_m + ' m' : '—'}
                  </span>
                ),
              },
              {
                key: 'calorias',
                label: 'Calorias',
                largura: 80,
                align: 'right',
                valor: (r: any) => Number(r.calorias || 0),
                render: (r: any) => <span className="text-gray-600">{r.calorias ?? '—'}</span>,
              },
              {
                key: 'te_aerobico',
                label: 'TE',
                largura: 60,
                align: 'right',
                valor: (r: any) => Number(r.te_aerobico || 0),
                render: (r: any) => (
                  <span className="text-gray-600">
                    {r.te_aerobico != null ? String(r.te_aerobico).replace('.', ',') : '—'}
                  </span>
                ),
              },
              {
                key: 'carga_proxy',
                label: 'Carga',
                largura: 70,
                align: 'right',
                valor: (r: any) => Number(r.carga_proxy || 0),
                render: (r: any) => (
                  <span className="text-gray-600">
                    {r.carga_proxy != null ? String(r.carga_proxy).replace('.', ',') : '—'}
                  </span>
                ),
              },
              {
                key: 'passos',
                label: 'Passos',
                largura: 80,
                align: 'right',
                valor: (r: any) => Number(r.passos || 0),
                render: (r: any) => <span className="text-gray-600">{r.passos ?? '—'}</span>,
              },
              {
                key: 'confiabilidade_fc',
                label: 'Confiab. FC',
                largura: 95,
                align: 'center',
                render: (r: any) =>
                  r.confiabilidade_fc === 'alta' ? (
                    <span className="text-[9px] font-bold text-emerald-700">alta</span>
                  ) : (
                    <span
                      className="text-[9px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5"
                      title="FC não confiável (pulso óptico) — fora do cálculo de TSS e carga"
                    >
                      {r.confiabilidade_fc === 'insuficiente' ? 'insuficiente' : 'não confiável'}
                    </span>
                  ),
              },
              {
                key: 'qualidade_dados',
                label: 'Dados',
                largura: 80,
                align: 'center',
                render: (r: any) => (
                  <span className="text-[9.5px] font-semibold text-gray-500">
                    {r.qualidade_dados || '—'}
                  </span>
                ),
              },
            ]}
          />
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

function DonutZonas({ corridas, horizontal = false }: { corridas: any[]; horizontal?: boolean }) {
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

  // modo horizontal: donut pequeno + zonas em linha, ocupando a largura toda
  if (horizontal) {
    return (
      <div className="flex-1 min-w-0">
        {/* d) sem donut: apenas barra empilhada + legenda */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex h-2.5 w-full rounded-full overflow-hidden">
            {ZONAS.map((k) => {
              const v = totais[k.k] || 0
              if (!v) return null
              return (
                <div
                  key={k.k}
                  style={{ width: (v / soma) * 100 + '%', backgroundColor: k.c }}
                  title={`${k.l}: ${Math.round(v / 60)} min`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            {ZONAS.map((k) => (
              <span key={k.k} className="inline-flex items-center gap-1 text-[10.5px]">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: k.c }} />
                <span className="text-gray-500">{k.l}</span>
                <span className="font-semibold text-gray-800 tabular-nums">
                  {Math.round((totais[k.k] || 0) / 60)} min
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
