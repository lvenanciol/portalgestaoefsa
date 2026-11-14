// ============================================================================
// PARSER .FIT — LL5 (15/11/2026)
//
// Implementação própria do protocolo FIT (sem SDK da Garmin): leitura de
// definition/data messages, base types, e extração das mensagens session,
// record, lap e event.
//
// CALIBRADO CONTRA ARQUIVOS REAIS: os 3 .FIT de wellness anexados ao briefing
// foram lidos com a mesma estrutura (header 14B, definition messages com
// developer fields, compressed timestamp headers).
//
// REGRA DE OURO: campo ausente = null. NUNCA inferir, NUNCA preencher com 0.
// Versões antigas (8 anos) podem não trazer gct/vertical_oscillation/
// training_effect — o parser devolve null e segue.
// ============================================================================

export interface FitSession {
  sport: number | null
  sub_sport: number | null
  start_time: number | null
  total_elapsed_time: number | null
  total_distance: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  avg_running_cadence: number | null
  total_ascent: number | null
  total_calories: number | null
  total_training_effect: number | null
  total_anaerobic_training_effect: number | null
  training_load_peak: number | null
  avg_speed: number | null
}

export interface FitRecord {
  timestamp: number | null
  heart_rate: number | null
  cadence: number | null
  distance: number | null
  altitude: number | null
  speed: number | null
  position_lat: number | null
  position_long: number | null
  gct: number | null
  vertical_oscillation: number | null
  vertical_ratio: number | null
}

export interface FitLap {
  start_time: number | null
  total_elapsed_time: number | null
  total_distance: number | null
  avg_speed: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  avg_cadence: number | null
  total_ascent: number | null
}

export interface FitEvent {
  timestamp: number | null
  event: number | null
  event_type: number | null
}

export interface FitData {
  sessions: FitSession[]
  records: FitRecord[]
  laps: FitLap[]
  events: FitEvent[]
  fileId: { type: number | null; manufacturer: number | null; product: number | null }
  erro?: string
}

const BASE_TYPES: Record<number, { name: string; size: number }> = {
  0x00: { name: 'enum', size: 1 },
  0x01: { name: 'sint8', size: 1 },
  0x02: { name: 'uint8', size: 1 },
  0x83: { name: 'sint16', size: 2 },
  0x84: { name: 'uint16', size: 2 },
  0x85: { name: 'sint32', size: 4 },
  0x86: { name: 'uint32', size: 4 },
  0x07: { name: 'string', size: 1 },
  0x88: { name: 'float32', size: 4 },
  0x89: { name: 'float64', size: 8 },
  0x8a: { name: 'uint8z', size: 1 },
  0x8b: { name: 'uint16z', size: 2 },
  0x8c: { name: 'uint32z', size: 4 },
  0x0d: { name: 'byte', size: 1 },
  0x8e: { name: 'sint64', size: 8 },
  0x8f: { name: 'uint64', size: 8 },
  0x90: { name: 'uint64z', size: 8 },
}

interface FieldDef {
  num: number
  size: number
  baseType: number
}

interface Definition {
  globalNum: number
  littleEndian: boolean
  fields: FieldDef[]
}

function sanitize(name: string, v: number | string | null): number | string | null {
  if (v === null) return null
  if (typeof v === 'string') return v
  switch (name) {
    case 'uint8':
    case 'enum':
      return v === 0xff ? null : v
    case 'uint8z':
      return v === 0x00 ? null : v
    case 'uint16':
      return v === 0xffff ? null : v
    case 'uint16z':
      return v === 0x0000 ? null : v
    case 'uint32':
      return v === 0xffffffff ? null : v
    case 'uint32z':
      return v === 0x00000000 ? null : v
    case 'sint8':
      return v === 0x7f ? null : v
    case 'sint16':
      return v === 0x7fff ? null : v
    case 'sint32':
      return v === 0x7fffffff ? null : v
    default:
      return v
  }
}

function readValue(
  view: DataView,
  offset: number,
  baseType: number,
  little: boolean,
  size: number,
): { value: number | string | null; size: number } {
  // CRÍTICO: o tamanho consumido é SEMPRE o `size` declarado no field da
  // definition message — nunca o tamanho do base type. Um .FIT real declara
  // field 7 com size 8 e base 0x86 (uint32): usar o tamanho do tipo (4)
  // desalinharia a leitura e corromperia todo o resto do arquivo.
  const bt = BASE_TYPES[baseType] || { name: 'byte', size }
  try {
    switch (bt.name) {
      case 'string': {
        let s = ''
        for (let i = 0; i < size; i++) {
          const b = view.getUint8(offset + i)
          if (b === 0) break
          s += String.fromCharCode(b)
        }
        return { value: s, size }
      }
      case 'float32':
        return { value: view.getFloat32(offset, little), size }
      case 'float64':
        return { value: view.getFloat64(offset, little), size }
      case 'sint8':
        return { value: sanitize('sint8', view.getInt8(offset)), size }
      case 'sint16':
        return { value: sanitize('sint16', view.getInt16(offset, little)), size }
      case 'sint32':
        return { value: sanitize('sint32', view.getInt32(offset, little)), size }
      case 'uint16':
        return { value: sanitize('uint16', view.getUint16(offset, little)), size }
      case 'uint32':
        return { value: sanitize('uint32', view.getUint32(offset, little)), size }
      case 'uint8':
      case 'enum':
        return { value: sanitize('uint8', view.getUint8(offset)), size }
      case 'uint8z':
        return { value: sanitize('uint8z', view.getUint8(offset)), size }
      default:
        return { value: view.getUint8(offset), size }
    }
  } catch (_e) {
    return { value: null, size }
  }
}

const SESSION_MAP: Record<number, string> = {
  5: 'sport',
  6: 'sub_sport',
  2: 'start_time',
  7: 'total_elapsed_time',
  9: 'total_distance',
  16: 'avg_heart_rate',
  17: 'max_heart_rate',
  41: 'avg_running_cadence',
  22: 'total_ascent',
  11: 'total_calories',
  24: 'total_training_effect',
  49: 'total_anaerobic_training_effect',
  14: 'avg_speed',
}

const RECORD_MAP: Record<number, string> = {
  253: 'timestamp',
  3: 'heart_rate',
  4: 'cadence',
  5: 'distance',
  2: 'altitude',
  6: 'speed',
  0: 'position_lat',
  1: 'position_long',
  40: 'gct',
  39: 'vertical_oscillation',
  41: 'vertical_ratio',
}

const LAP_MAP: Record<number, string> = {
  2: 'start_time',
  7: 'total_elapsed_time',
  9: 'total_distance',
  13: 'avg_speed',
  15: 'avg_heart_rate',
  16: 'max_heart_rate',
  17: 'avg_cadence',
  22: 'total_ascent',
}

const EVENT_MAP: Record<number, string> = {
  253: 'timestamp',
  0: 'event',
  1: 'event_type',
}

function consumir(view: DataView, pos: number, d: Definition, out: FitData): number {
  const vals: Record<number, any> = {}

  for (const f of d.fields) {
    if (pos + f.size > view.byteLength) return view.byteLength
    const r = readValue(view, pos, f.baseType, d.littleEndian, f.size)
    vals[f.num] = r.value
    pos += r.size
  }

  switch (d.globalNum) {
    case 0: {
      out.fileId.type = (vals[0] as number) ?? null
      out.fileId.manufacturer = (vals[1] as number) ?? null
      out.fileId.product = (vals[2] as number) ?? null
      break
    }
    case 18: {
      const s: any = {}
      for (const k of Object.keys(SESSION_MAP)) s[SESSION_MAP[Number(k)]] = vals[Number(k)] ?? null
      out.sessions.push(s as FitSession)
      break
    }
    case 20: {
      const r: any = {}
      for (const k of Object.keys(RECORD_MAP)) r[RECORD_MAP[Number(k)]] = vals[Number(k)] ?? null
      out.records.push(r as FitRecord)
      break
    }
    case 19: {
      const l: any = {}
      for (const k of Object.keys(LAP_MAP)) l[LAP_MAP[Number(k)]] = vals[Number(k)] ?? null
      out.laps.push(l as FitLap)
      break
    }
    case 21: {
      const e: any = {}
      for (const k of Object.keys(EVENT_MAP)) e[EVENT_MAP[Number(k)]] = vals[Number(k)] ?? null
      out.events.push(e as FitEvent)
      break
    }
    default:
      // monitoring (55/103), wellness, device_info — ignorados de propósito
      break
  }

  return pos
}

/**
 * Parse de um .FIT. Nunca lança por campo ausente: devolve o que encontrou.
 * Preenche `erro` apenas quando o arquivo não é FIT válido.
 */
export function parseFit(bytes: Uint8Array): FitData {
  const out: FitData = {
    sessions: [],
    records: [],
    laps: [],
    events: [],
    fileId: { type: null, manufacturer: null, product: null },
  }

  if (!bytes || bytes.length < 14) {
    out.erro = 'Arquivo menor que o cabeçalho FIT (14 bytes).'
    return out
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerSize = view.getUint8(0)

  const sig = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  )
  if (sig !== '.FIT') {
    out.erro = 'Assinatura .FIT ausente — arquivo inválido ou corrompido.'
    return out
  }

  const dataSize = view.getUint32(4, true)
  const limite = Math.min(headerSize + dataSize, view.byteLength)

  const defs: Record<number, Definition> = {}
  let pos = headerSize

  try {
    while (pos < limite) {
      const hdr = view.getUint8(pos)

      if (hdr & 0x80) {
        const local = (hdr >> 5) & 0x03
        const d = defs[local]
        if (!d) {
          out.erro = 'Header comprimido sem definition correspondente.'
          return out
        }
        pos += 1
        pos = consumir(view, pos, d, out)
        continue
      }

      if (hdr & 0x40) {
        const local = hdr & 0x0f
        pos += 2
        const arch = view.getUint8(pos)
        pos += 1
        const little = arch === 0
        const globalNum = view.getUint16(pos, little)
        pos += 2
        const nFields = view.getUint8(pos)
        pos += 1
        const fields: FieldDef[] = []
        for (let i = 0; i < nFields; i++) {
          fields.push({
            num: view.getUint8(pos),
            size: view.getUint8(pos + 1),
            baseType: view.getUint8(pos + 2),
          })
          pos += 3
        }
        if (hdr & 0x20) {
          const nDev = view.getUint8(pos)
          pos += 1
          pos += nDev * 3
        }
        defs[local] = { globalNum, littleEndian: little, fields }
        continue
      }

      const local = hdr & 0x0f
      const d = defs[local]
      if (!d) {
        out.erro = 'Data message sem definition (arquivo truncado).'
        return out
      }
      pos += 1
      pos = consumir(view, pos, d, out)
    }
  } catch (e: any) {
    out.erro = 'Falha ao ler a estrutura FIT: ' + (e?.message || String(e))
  }

  return out
}

/** sport → tipo de corrida. null quando não é corrida. */
export function tipoPorSport(sport: number | null, subSport: number | null): string | null {
  if (sport === 1) {
    if (subSport === 6) return 'trail'
    if (subSport === 14) return 'esteira'
    return 'rua'
  }
  return null
}

export function nomeSport(sport: number | null, subSport: number | null): string {
  if (sport === 1) {
    if (subSport === 6) return 'Trail running'
    if (subSport === 14) return 'Esteira'
    return 'Corrida de rua'
  }
  if (sport === 2) return 'Ciclismo'
  if (sport === 5) return 'Natação'
  if (sport === 11) return 'Caminhada'
  if (sport === null) return 'Desconhecido'
  return 'Esporte ' + sport
}

/**
 * Cadência FIT → passos por minuto.
 * O FIT grava a cadência de UM pé; valores baixos (<120) são multiplicados
 * por 2. Documentado em DECISIONS.md.
 */
export function cadenciaSpm(bruto: number | null): number | null {
  if (bruto == null || bruto <= 0) return null
  return bruto < 120 ? bruto * 2 : bruto
}

/** Coordenada FIT (semicírculos) → graus. */
export function semicirculosParaGraus(v: number | null): number | null {
  if (v == null) return null
  return v * (180 / Math.pow(2, 31))
}

/** Altitude FIT: valor bruto / 5 − 500 (offset do protocolo). */
export function altitudeComOffset(raw: number | null): number | null {
  if (raw == null) return null
  return raw / 5 - 500
}
