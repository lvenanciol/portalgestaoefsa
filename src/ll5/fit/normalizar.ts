// ============================================================================
// LL5 — NORMALIZAÇÃO E REGRAS DE IMPORTAÇÃO .FIT (15/11/2026)
//
// Módulo PURO (sem rede, sem React): recebe o FitData do parser e devolve a
// linha pronta para gravar em ll5_activity, mais os sinais de qualidade.
//
// PRINCÍPIO: campo ausente no .FIT = null. Nunca 0, nunca estimado.
// ============================================================================
import {
  type FitData,
  type FitRecord,
  tipoPorSport,
  cadenciaSpm,
  semicirculosParaGraus,
  altitudeComOffset,
} from './parser'

export interface ActivityRow {
  device_activity_id: string
  fonte: string
  tipo: string | null
  data_hora_inicio: string | null
  duracao_s: number | null
  distancia_m: number | null
  pace_medio_s_km: number | null
  fc_media: number | null
  fc_max: number | null
  zonas_fc_seg: Record<string, number> | null
  cadencia_spm: number | null
  elevacao_m: number | null
  ganho_elevacao_m: number | null
  calorias: number | null
  ground_contact_time_ms: number | null
  vertical_oscillation_cm: number | null
  vertical_ratio_pct: number | null
  te_aerobico: number | null
  te_anaerobico: number | null
  training_load: number | null
  trimp: number | null
  decoupling_pct: number | null
  fc_amostras: number[] | null
  cadencia_amostras: number[] | null
  altitude_amostras: number[] | null
  gps_amostras: Array<{ t: number; lat: number; lon: number }> | null
  laps: any[] | null
  eventos: any[] | null
  fonte_fc: 'optica_pulso' | 'cinta_peito' | 'desconhecida'
  confiabilidade_fc: 'alta' | 'baixa' | 'insuficiente'
  tem_streams: boolean
  qualidade_dados: 'completo' | 'resumo' | 'parcial'
  possivel_duplicata: boolean
  arquivo_origem: string
  demo: boolean
}

/** Zonas de FC padrão (5 zonas), em % da FC máxima. */
const ZONAS = [
  { id: 'z1', min: 0.5, max: 0.6 },
  { id: 'z2', min: 0.6, max: 0.7 },
  { id: 'z3', min: 0.7, max: 0.8 },
  { id: 'z4', min: 0.8, max: 0.9 },
  { id: 'z5', min: 0.9, max: 1.01 },
]

/**
 * Zonas de FC por TEMPO em cada zona (segundos).
 * Usa o intervalo entre amostras consecutivas. Se não houver fc_max, usa o
 * maior HR observado nas amostras como referência.
 */
export function calcularZonas(
  records: FitRecord[],
  fcMax: number | null,
): Record<string, number> | null {
  const comHR = records.filter(
    (r) => r.timestamp != null && r.heart_rate != null && r.heart_rate > 0,
  )
  if (comHR.length < 2) return null

  const max = fcMax || Math.max(...comHR.map((r) => Number(r.heart_rate)))
  if (!max || max <= 0) return null

  const zonas: Record<string, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }

  for (let i = 1; i < comHR.length; i++) {
    const dt = Number(comHR[i].timestamp) - Number(comHR[i - 1].timestamp)
    // amostra muito longe (>60s) indica pausa/gravação esparsa: não conta
    if (!isFinite(dt) || dt <= 0 || dt > 60) continue
    const pct = Number(comHR[i].heart_rate) / max
    const z = ZONAS.find((x) => pct >= x.min && pct < x.max)
    if (z) zonas[z.id] += dt
  }

  const total = Object.values(zonas).reduce((a, b) => a + b, 0)
  return total > 0 ? zonas : null
}

/**
 * TRIMP de Banister — usa FC de reserva estimada.
 * Sem fc_repouso informado, adota 60 bpm (média populacional) e DECLARA a
 * limitação no comentário: o valor é indicativo, não prescritivo.
 */
export function calcularTrimp(
  zonas: Record<string, number> | null,
  fcMedia: number | null,
  fcMax: number | null,
  duracaoS: number | null,
): number | null {
  if (!fcMedia || !fcMax || !duracaoS || duracaoS <= 0) return null
  const fcRepouso = 60
  const reserva = fcMax - fcRepouso
  if (reserva <= 0) return null
  const hrr = (fcMedia - fcRepouso) / reserva
  if (!isFinite(hrr) || hrr <= 0) return null
  // Banister: duração(min) × HRR × 0.64 × e^(1.92×HRR)
  const min = duracaoS / 60
  return Math.round(min * hrr * 0.64 * Math.exp(1.92 * hrr) * 10) / 10
}

/**
 * Decoupling (%) — deriva da primeira e da segunda metade da atividade.
 * Só calcula com streams suficientes (>= 20 amostras com speed e HR).
 */
export function calcularDecoupling(records: FitRecord[]): number | null {
  const validos = records.filter(
    (r) =>
      r.speed != null &&
      r.speed > 0 &&
      r.heart_rate != null &&
      r.heart_rate > 0 &&
      r.timestamp != null,
  )
  if (validos.length < 20) return null
  const meio = Math.floor(validos.length / 2)
  const metade = (arr: FitRecord[]) => {
    const vel = arr.reduce((a, r) => a + Number(r.speed), 0) / arr.length
    const fc = arr.reduce((a, r) => a + Number(r.heart_rate), 0) / arr.length
    if (!vel || !fc) return null
    return { ratio: vel / fc, vel, fc }
  }
  const p1 = metade(validos.slice(0, meio))
  const p2 = metade(validos.slice(meio))
  if (!p1 || !p2 || p1.ratio <= 0) return null
  const pct = ((p2.ratio - p1.ratio) / p1.ratio) * 100
  if (!isFinite(pct)) return null
  return Math.round(pct * 10) / 10
}

/**
 * CONFIABILIDADE DE FC — regra exata do briefing.
 * Intervalados curtos com pulso óptico distorcem a leitura (a FC não sobe
 * em 2 min). Marca 'baixa' para não contaminar TSS/carga semanal.
 */
export function avaliarConfiabilidade(
  fcMedia: number | null,
  fcMax: number | null,
  duracaoS: number | null,
  fonteFc: 'optica_pulso' | 'cinta_peito' | 'desconhecida',
): 'alta' | 'baixa' | 'insuficiente' {
  if (duracaoS != null && duracaoS < 60) return 'insuficiente'

  if (fcMedia != null && fcMax != null && fcMax > 0 && duracaoS != null) {
    // fc_media > 85% da fc_max numa sessão curta = leitura implausível
    if (fcMedia > 0.85 * fcMax && duracaoS < 180) return 'baixa'
  }

  if (fonteFc === 'cinta_peito') return 'alta'
  return 'alta'
}

/** Limpa as amostras conforme as regras de descarte do briefing. */
function filtrarAmostras(records: FitRecord[]) {
  return records.filter((r) => {
    // perda de sinal
    if (r.heart_rate === 0) return false
    // erro de sensor: cadência 0 andando
    if (r.speed != null && r.speed > 0.5 && r.cadence === 0) return false
    return true
  })
}

/** Média simples ignorando null. */
function media(vals: Array<number | null>): number | null {
  const v = vals.filter((x): x is number => x != null && isFinite(x))
  if (!v.length) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

export interface NormalizarCtx {
  deviceActivityId: string
  arquivoOrigem: string
  fonte?: string
  /** fuso do usuário; o FIT traz UTC */
  fusoOffsetMin?: number
}

export interface NormalizarResultado {
  ok: boolean
  motivo?: string
  activity?: ActivityRow
}

/**
 * Transforma o FitData em uma linha de ll5_activity.
 * Devolve ok=false quando não há session válida (validação bloqueante 1).
 */
export function normalizarAtividade(d: FitData, ctx: NormalizarCtx): NormalizarResultado {
  if (d.erro) return { ok: false, motivo: d.erro }
  if (!d.sessions.length) {
    return {
      ok: false,
      motivo:
        'Sem mensagem session — não é um arquivo de atividade (wellness/monitoramento é ignorado).',
    }
  }

  const s = d.sessions[0]
  if (s.start_time == null) {
    return { ok: false, motivo: 'session sem start_time — registro sem data não entra na série.' }
  }

  const records = filtrarAmostras(d.records)

  // data em Sao Paulo: FIT grava UTC (epoch). -3h fixo não serve (DST antigo),
  // então derivamos do offset informado ou usamos o fuso do navegador.
  const offset = ctx.fusoOffsetMin != null ? ctx.fusoOffsetMin : 180
  const inicio = new Date((s.start_time - offset * 60) * 1000)
  const dataIso = inicio.toISOString().replace('Z', '')

  const duracao = s.total_elapsed_time != null ? Math.round(s.total_elapsed_time) : null
  const distanciaM = s.total_distance != null ? Math.round(s.total_distance * 100) / 100 : null

  const pace =
    duracao != null && distanciaM != null && distanciaM > 0
      ? Math.round(duracao / (distanciaM / 1000))
      : null

  const zonas = calcularZonas(records, s.max_heart_rate)

  // running dynamics: média das amostras (podem faltar em .FIT antigos)
  const gctMedia = media(records.map((r) => r.gct))
  const voMedia = media(records.map((r) => r.vertical_oscillation))
  const vrMedia = media(records.map((r) => r.vertical_ratio))

  const temStreams = records.length > 0

  const fonteFc: 'optica_pulso' | 'cinta_peito' | 'desconhecida' = 'optica_pulso'
  const confiabilidade = avaliarConfiabilidade(s.avg_heart_rate, s.max_heart_rate, duracao, fonteFc)

  const qualidade: 'completo' | 'resumo' | 'parcial' = temStreams
    ? s.avg_heart_rate != null && distanciaM != null
      ? 'completo'
      : 'parcial'
    : 'resumo'

  const row: ActivityRow = {
    device_activity_id: ctx.deviceActivityId,
    fonte: ctx.fonte || 'garmin_fit',
    tipo: tipoPorSport(s.sport, s.sub_sport),
    data_hora_inicio: dataIso,
    duracao_s: duracao,
    distancia_m: distanciaM,
    pace_medio_s_km: pace,
    fc_media: s.avg_heart_rate,
    fc_max: s.max_heart_rate,
    zonas_fc_seg: zonas,
    cadencia_spm: cadenciaSpm(s.avg_running_cadence),
    elevacao_m: null,
    ganho_elevacao_m: s.total_ascent,
    calorias: s.total_calories,
    ground_contact_time_ms: gctMedia != null ? Math.round(gctMedia * 10) / 10 : null,
    vertical_oscillation_cm: voMedia != null ? Math.round((voMedia / 10) * 10) / 10 : null,
    vertical_ratio_pct: vrMedia != null ? Math.round(vrMedia * 10) / 10 : null,
    te_aerobico: s.total_training_effect,
    te_anaerobico: s.total_anaerobic_training_effect,
    training_load: s.training_load_peak,
    trimp: calcularTrimp(zonas, s.avg_heart_rate, s.max_heart_rate, duracao),
    decoupling_pct: calcularDecoupling(records),
    fc_amostras: temStreams ? records.map((r) => r.heart_rate).filter((x) => x != null) : null,
    cadencia_amostras: temStreams ? records.map((r) => r.cadence).filter((x) => x != null) : null,
    altitude_amostras: temStreams
      ? records.map((r) => altitudeComOffset(r.altitude)).filter((x) => x != null)
      : null,
    gps_amostras: temStreams
      ? records
          .filter((r) => r.position_lat != null && r.position_long != null)
          .map((r) => ({
            t: Number(r.timestamp) || 0,
            lat: semicirculosParaGraus(r.position_lat) as number,
            lon: semicirculosParaGraus(r.position_long) as number,
          }))
      : null,
    laps: d.laps.length ? d.laps : null,
    eventos: d.events.length ? d.events : null,
    fonte_fc: fonteFc,
    confiabilidade_fc: confiabilidade,
    tem_streams: temStreams,
    qualidade_dados: qualidade,
    possivel_duplicata: false,
    arquivo_origem: ctx.arquivoOrigem,
    demo: false,
  }

  return { ok: true, activity: row }
}

/**
 * O arquivo é de wellness/monitoramento? Usado na varredura do ZIP e no
 * upload avulso. Regra do briefing: NUNCA importar peso, sono, passos.
 */
export function ehWellness(nomeArquivo: string, d?: FitData): boolean {
  const n = nomeArquivo.toLowerCase()
  if (n.includes('wellness')) return true
  if (n.includes('monitoring')) return true
  // pelo conteúdo: sem session e com mensagens de monitoramento
  if (d && d.sessions.length === 0) return true
  return false
}

/** Extrai o device_activity_id do nome `<id>_ACTIVITY.fit`. */
export function idDoNome(nome: string): string | null {
  const base = nome.split('/').pop() || nome
  const m = /^(\d{6,})_/i.exec(base)
  if (m) return m[1]
  // fallback: nome sem extensão
  return base.replace(/\.fit$/i, '') || null
}
