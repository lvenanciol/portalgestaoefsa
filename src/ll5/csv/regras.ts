// ============================================================================
// LL5 — PARSER E REGRAS DO CSV DO GARMIN (v2, 15/11/2026)
//
// Módulo PURO (sem rede, sem React): é o que os testes exercitam.
//
// VALIDADO CONTRA O ARQUIVO REAL (uploads/Gramin_20160621.csv):
//   · 1.189 linhas, 42 colunas, UTF-8 SEM BOM
//   · 988 corridas (Running 980 + Treadmill 6 + Indoor 1 + Trail 1)
//   · 172 sessões de força, 21 walking, 6 natação, 2 ciclismo
//   · período 21/06/2016 → 13/11/2026
//   · 164 atividades com Max HR ≥ 200 · 9 com ≥ 210 · pico 218
//   · TSS zerado em 1.189/1.189 (por isso o proxy de carga)
//   · coluna "Avg Run Cadence" aparece DUAS VEZES (índice 10 e 21)
//
// REGRA DE OURO: "--" = null. NUNCA inferir, NUNCA gravar 0 no lugar.
// ============================================================================

/** FCmax validada estatisticamente (164 atividades ≥ 200 bpm). */
export const FCMAX_REFERENCIA = 218
export const FCMAX_METODO = 'estatistico_164_atividades'

/** Zonas sobre FCmax = 218 (não sobre 220 − idade). */
export const ZONAS_FCMAX218 = [
  { id: 'z1', min: 109, max: 131, rotulo: '50–60%' },
  { id: 'z2', min: 131, max: 153, rotulo: '60–70%' },
  { id: 'z3', min: 153, max: 174, rotulo: '70–80%' },
  { id: 'z4', min: 174, max: 196, rotulo: '80–90%' },
  { id: 'z5', min: 196, max: 218, rotulo: '90–100%' },
]

/** Limite inferior de Z4 → usado na sinalização de longos. */
export const LIMITE_Z4 = 174
/** 90 minutos em segundos. */
export const LIMITE_LONGO_S = 5400
/** Data a partir da qual a sinalização de longos é aplicada. */
export const DATA_CORTE_SINALIZACAO = '2026-11-14'

/** Tipo do CSV → tipo interno + aba de destino. */
export const MAPA_TIPOS: Record<string, { tipo: string; aba: 'running' | 'gym' | 'ignorar' }> = {
  Running: { tipo: 'rua', aba: 'running' },
  'Treadmill Running': { tipo: 'esteira', aba: 'running' },
  'Indoor Running': { tipo: 'indoor', aba: 'running' },
  'Trail Running': { tipo: 'trail', aba: 'running' },
  'Strength Training': { tipo: 'forca', aba: 'gym' },
  Walking: { tipo: 'caminhada', aba: 'ignorar' },
  'Pool Swim': { tipo: 'natacao', aba: 'ignorar' },
  Cycling: { tipo: 'ciclismo', aba: 'ignorar' },
}

/** Colunas ignoradas por decisão (TSS zerado, duplicata, sempre vazio). */
export const COLUNAS_IGNORADAS = [
  'Favorite',
  'Training Stress Score®',
  'Total Strokes',
  'Avg. Swolf',
  'Avg Stroke Rate',
  'Min Temp',
  'Max Temp',
  'Decompression',
]

// ------------------------------------------------------------------ helpers
/** Valor cru → número. "--"/vazio → null. Trata vírgula decimal e milhar. */
export function num(v: string | undefined | null): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || s === '--' || s === '-' || s === 'No') return null
  // remove apóstrofo (Body Battery) e espaços
  const limpo = s.replace(/'/g, '').replace(/\s/g, '')
  // "5.710" (milhar BR) vs "0,94" (decimal BR)
  // regra: se tem vírgula, a vírgula é decimal e os pontos são milhar
  let normal: string
  if (limpo.includes(',')) {
    normal = limpo.replace(/\./g, '').replace(',', '.')
  } else {
    // sem vírgula: se houver mais de um ponto OU ponto seguido de 3 dígitos
    // no fim, é milhar BR (5.710); senão é decimal (0.94)
    if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
      normal = limpo.replace(/\./g, '')
    } else {
      normal = limpo
    }
  }
  const n = Number(normal)
  return isFinite(n) ? n : null
}

/** "HH:MM:SS" ou "M:SS" → segundos. "--" → null. */
export function tempoParaSegundos(v: string | undefined | null): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || s === '--') return null
  const partes = s.split(':').map((x) => x.trim())
  if (partes.length < 2) return null
  const nums = partes.map((p) => {
    const n = Number(p.replace(',', '.'))
    return isFinite(n) ? n : null
  })
  if (nums.some((n) => n == null)) return null
  if (partes.length === 3) {
    const [h, m, sec] = nums as number[]
    return Math.round(h * 3600 + m * 60 + sec)
  }
  // M:SS (pace)
  const [m, sec] = nums as number[]
  return Math.round(m * 60 + sec)
}

/** "2026-11-13 06:11:57" → ISO com offset de São Paulo (-03:00). */
export function dataParaIso(v: string | undefined | null): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const [, a, mes, d, h, mi, se] = m
  // o CSV já vem no horário local do usuário (America/Sao_Paulo); gravamos
  // com o offset explícito para não depender do fuso do servidor
  return `${a}-${mes}-${d}T${h}:${mi}:${se}-03:00`
}

/** Cadência < 120 numa corrida é inválida (regra do briefing). */
export function cadenciaValida(v: number | null): number | null {
  if (v == null) return null
  if (v < 120) return null
  return v
}

/** Potência anterior a 01/01/2024 não é confiável. */
export function potenciaConfiavel(dataIso: string | null): boolean {
  if (!dataIso) return false
  return dataIso >= '2024-01-01'
}

/**
 * Zonas de FC ESTIMADAS a partir da FC média (o CSV não traz streams).
 * Distribui a duração em uma gaussiana de desvio 8 bpm centrada na FC média.
 * Marca `zonas_estimadas = true` — é estimativa, não medição.
 */
export function zonasEstimadas(
  fcMedia: number | null,
  duracaoS: number | null,
): { zonas: Record<string, number> | null; estimadas: boolean } {
  if (fcMedia == null || duracaoS == null || duracaoS <= 0) {
    return { zonas: null, estimadas: true }
  }
  const desvio = 8
  const zonas: Record<string, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }

  // amostra sintética: 61 pontos de fcMedia-30 a fcMedia+30
  const passos = 61
  let somaPeso = 0
  const pesos: number[] = []
  for (let i = 0; i < passos; i++) {
    const x = fcMedia - 30 + (60 * i) / (passos - 1)
    const w = Math.exp(-0.5 * Math.pow((x - fcMedia) / desvio, 2))
    pesos.push(w)
    somaPeso += w
  }
  for (let i = 0; i < passos; i++) {
    const x = fcMedia - 30 + (60 * i) / (passos - 1)
    const z = ZONAS_FCMAX218.find((zz) => x >= zz.min && x < zz.max)
    if (z) zonas[z.id] += (pesos[i] / somaPeso) * duracaoS
  }
  for (const k of Object.keys(zonas)) zonas[k] = Math.round(zonas[k])
  return { zonas, estimadas: true }
}

/**
 * Sinalização de intensidade excessiva em treinos longos.
 * Só vale para atividades a partir de 14/11/2026 (regra do briefing).
 */
export function sinalizarLongoZ4(
  tipo: string | null,
  duracaoS: number | null,
  fcMedia: number | null,
  dataIso: string | null,
): boolean {
  if (!dataIso || dataIso.slice(0, 10) < DATA_CORTE_SINALIZACAO) return false
  if (!tipo || !['rua', 'esteira', 'trail', 'indoor'].includes(tipo)) return false
  if (duracaoS == null || duracaoS < LIMITE_LONGO_S) return false
  if (fcMedia == null || fcMedia < LIMITE_Z4) return false
  return true
}

/**
 * Carga por proxy: TE aeróbico × duração em minutos.
 * O TSS do export está 0,0 em 100% das linhas — este número NÃO é TSS.
 */
export function cargaProxy(teAerobico: number | null, duracaoS: number | null): number | null {
  if (teAerobico == null || duracaoS == null || duracaoS <= 0) return null
  return Math.round(teAerobico * (duracaoS / 60) * 10) / 10
}

/** Semana ISO (1-53) e ano ISO a partir da data. */
export function semanaIso(dataIso: string): { ano: number; semana: number } {
  const d = new Date(dataIso)
  const alvo = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dia = alvo.getUTCDay() || 7
  alvo.setUTCDate(alvo.getUTCDate() + 4 - dia)
  const inicioAno = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((alvo.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7)
  return { ano: alvo.getUTCFullYear(), semana }
}

// ------------------------------------------------------------------ linhas
export interface LinhaCsv {
  [coluna: string]: string
}

/** Mapeia uma linha do CSV para o registro de ll5_activity. */
export interface AtividadeCsv {
  tipo: string | null
  aba: 'running' | 'gym' | 'ignorar'
  data_hora_inicio: string | null
  titulo: string | null
  distancia_m: number | null
  calorias: number | null
  duracao_s: number | null
  tempo_movimento_s: number | null
  tempo_decorrido_s: number | null
  fc_media: number | null
  fc_max: number | null
  te_aerobico: number | null
  passos: number | null
  body_battery_drain: number | null
  num_voltas: number | null
  melhor_volta_s: number | null
  // corrida
  cadencia_spm: number | null
  cadencia_max_spm: number | null
  cadencia_invalida: boolean
  pace_medio_s_km: number | null
  melhor_pace_s_km: number | null
  gap_s_km: number | null
  ganho_elevacao_m: number | null
  perda_elevacao_m: number | null
  elevacao_min_m: number | null
  elevacao_max_m: number | null
  comprimento_passada_m: number | null
  vertical_ratio_pct: number | null
  vertical_oscillation_cm: number | null
  ground_contact_time_ms: number | null
  potencia_media_w: number | null
  potencia_max_w: number | null
  potencia_normalizada_w: number | null
  potencia_confiavel: boolean
  tem_running_dynamics: boolean
  // força
  total_reps: number | null
  total_sets: number | null
  volume_kg: number | null
  tem_detalhe_exercicio: boolean
  // derivados
  zonas_fc_seg: Record<string, number> | null
  zonas_estimadas: boolean
  fcmax_referencia: number
  fcmax_validada: boolean
  fcmax_metodo_validacao: string
  carga_proxy: number | null
  carga_metodo: string
  sinalizar_intensidade_excessiva: boolean
  qualidade_dados: string
  fonte: string
  demo: boolean
}

/**
 * Converte uma linha. `hdr` mapeia nome da coluna → índice.
 * Colunas duplicadas ("Avg Run Cadence") usam a PRIMEIRA ocorrência.
 */
export function mapearLinha(row: string[], hdr: Record<string, number>): AtividadeCsv | null {
  const g = (c: string): string | null => {
    const i = hdr[c]
    if (i == null) return null
    return row[i] ?? null
  }

  const activityType = (g('Activity Type') || '').trim()
  const mapa = MAPA_TIPOS[activityType]
  if (!mapa) return null // tipo desconhecido: erro de linha

  const dataIso = dataParaIso(g('Date'))
  if (!dataIso) return null // sem data não entra

  const ehForca = activityType === 'Strength Training'
  const ehCorrida = mapa.aba === 'running'

  const duracao = tempoParaSegundos(g('Time'))
  const distanciaKm = num(g('Distance'))
  const fcMedia = num(g('Avg HR'))
  const fcMax = num(g('Max HR'))
  const teAerobico = num(g('Aerobic TE'))

  // cadência: só vale para corrida; <120 é inválida
  let cadencia: number | null = null
  let cadenciaInvalida = false
  if (ehCorrida) {
    const bruta = num(g('Avg Run Cadence'))
    if (bruta != null && bruta < 120) {
      cadenciaInvalida = true
      cadencia = null
    } else {
      cadencia = bruta
    }
  }

  const gct = num(g('Avg Ground Contact Time'))
  const temRD = ehCorrida && gct != null

  const { zonas, estimadas } = zonasEstimadas(fcMedia, duracao)

  const potConfiavel = potenciaConfiavel(dataIso)
  const temPotencia = ehCorrida && num(g('Avg Power')) != null

  const ativ: AtividadeCsv = {
    tipo: mapa.tipo,
    aba: mapa.aba,
    data_hora_inicio: dataIso,
    titulo: (g('Title') || '').trim() || null,
    distancia_m: distanciaKm != null ? Math.round(distanciaKm * 1000 * 100) / 100 : null,
    calorias: num(g('Calories')),
    duracao_s: duracao,
    tempo_movimento_s: tempoParaSegundos(g('Moving Time')),
    tempo_decorrido_s: tempoParaSegundos(g('Elapsed Time')),
    fc_media: fcMedia,
    fc_max: fcMax,
    te_aerobico: teAerobico,
    passos: num(g('Steps')),
    body_battery_drain: num(g('Body Battery Drain')),
    num_voltas: num(g('Number of Laps')),
    melhor_volta_s: tempoParaSegundos(g('Best Lap Time')),

    cadencia_spm: cadencia,
    cadencia_max_spm: ehCorrida ? cadenciaValida(num(g('Max Run Cadence'))) : null,
    cadencia_invalida: cadenciaInvalida,
    pace_medio_s_km: ehCorrida ? tempoParaSegundos(g('Avg Pace')) : null,
    melhor_pace_s_km: ehCorrida ? tempoParaSegundos(g('Best Pace')) : null,
    gap_s_km: ehCorrida ? tempoParaSegundos(g('Avg GAP')) : null,
    ganho_elevacao_m: ehCorrida ? num(g('Total Ascent')) : null,
    perda_elevacao_m: ehCorrida ? num(g('Total Descent')) : null,
    elevacao_min_m: ehCorrida ? num(g('Min Elevation')) : null,
    elevacao_max_m: ehCorrida ? num(g('Max Elevation')) : null,
    comprimento_passada_m: ehCorrida ? num(g('Avg Stride Length')) : null,
    vertical_ratio_pct: ehCorrida ? num(g('Avg Vertical Ratio')) : null,
    vertical_oscillation_cm: ehCorrida ? num(g('Avg Vertical Oscillation')) : null,
    ground_contact_time_ms: ehCorrida ? gct : null,
    potencia_media_w: ehCorrida ? num(g('Avg Power')) : null,
    potencia_max_w: ehCorrida ? num(g('Max Power')) : null,
    potencia_normalizada_w: ehCorrida ? num(g('Normalized Power® (NP®)')) : null,
    potencia_confiavel: temPotencia ? potConfiavel : false,
    tem_running_dynamics: temRD,

    total_reps: ehForca ? num(g('Total Reps')) : null,
    total_sets: ehForca ? num(g('Total Sets')) : null,
    // REGRA: força NÃO calcula volume
    volume_kg: null,
    tem_detalhe_exercicio: false,

    zonas_fc_seg: zonas,
    zonas_estimadas: estimadas,
    fcmax_referencia: FCMAX_REFERENCIA,
    fcmax_validada: true,
    fcmax_metodo_validacao: FCMAX_METODO,
    carga_proxy: cargaProxy(teAerobico, duracao),
    carga_metodo: 'proxy_te_x_duracao',
    sinalizar_intensidade_excessiva: sinalizarLongoZ4(mapa.tipo, duracao, fcMedia, dataIso),
    qualidade_dados: ehForca
      ? 'limitado'
      : duracao != null && duracao > 0
        ? 'resumo'
        : 'incompleto',
    fonte: 'garmin_csv',
    demo: false,
  }

  return ativ
}

/** Chave de deduplicação: (owner, data_hora_inicio, tipo, distancia_m). */
export function chaveDedupeCsv(a: AtividadeCsv, ownerId: string): string {
  return [ownerId, a.data_hora_inicio || '', a.tipo || '', a.distancia_m ?? ''].join('|')
}

/**
 * Procura um FIT equivalente: mesma data/hora em ±60 s.
 * Usado para enriquecer o registro do FIT com campos que só o CSV tem.
 */
export function casaComFit(csv: AtividadeCsv, fit: { data_hora_inicio?: string | null }): boolean {
  if (!csv.data_hora_inicio || !fit.data_hora_inicio) return false
  const a = new Date(csv.data_hora_inicio).getTime()
  const b = new Date(fit.data_hora_inicio).getTime()
  if (!isFinite(a) || !isFinite(b)) return false
  return Math.abs(a - b) <= 60000
}

/** Detecta o delimitador olhando a primeira linha. */
export function detectarDelimitador(primeiraLinha: string): string {
  const candidatos = [',', ';', '\t']
  let melhor = ','
  let maior = 0
  for (const c of candidatos) {
    const n = primeiraLinha.split(c).length
    if (n > maior) {
      maior = n
      melhor = c
    }
  }
  return melhor
}

/** Remove BOM do início do texto. */
export function removerBom(txt: string): string {
  return txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt
}

/** Parser de uma linha CSV respeitando aspas. */
export function dividirLinha(linha: string, delim: string): string[] {
  const out: string[] = []
  let atual = ''
  let dentro = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (ch === '"') {
      if (dentro && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else {
        dentro = !dentro
      }
    } else if (ch === delim && !dentro) {
      out.push(atual)
      atual = ''
    } else {
      atual += ch
    }
  }
  out.push(atual)
  return out
}
