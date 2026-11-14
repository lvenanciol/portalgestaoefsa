import { describe, it, expect } from 'vitest'
import {
  parseFit,
  tipoPorSport,
  cadenciaSpm,
  semicirculosParaGraus,
  altitudeComOffset,
  nomeSport,
} from '../parser'
import {
  avaliarConfiabilidade,
  calcularZonas,
  calcularDecoupling,
  calcularTrimp,
  ehWellness,
  idDoNome,
  normalizarAtividade,
} from '../normalizar'

// ============================================================================
// MATRIZ DE ACEITE DO IMPORTADOR .FIT
// ============================================================================

/** Monta um .FIT mínimo válido em memória, para os testes de estrutura. */
function fitSintetico(opts: {
  comSession?: boolean
  session?: Partial<{
    sport: number
    sub: number
    start: number
    dur: number
    dist: number
    fc: number
    fcmax: number
    cad: number
    ascent: number
    cal: number
    te: number
    teAna: number
  }>
  comRD?: boolean
  nRecords?: number
}): Uint8Array {
  const { comSession = true, session = {}, comRD = true, nRecords = 10 } = opts

  const s = {
    sport: 1,
    sub: 0,
    start: 1760000000,
    dur: 1800,
    dist: 5200,
    fc: 148,
    fcmax: 172,
    cad: 84,
    ascent: 42,
    cal: 380,
    te: 3.2,
    teAna: 0.4,
    ...session,
  }

  // ---- monta as definitions e data messages byte a byte ----
  const chunks: number[] = []

  function def(local: number, globalNum: number, fields: Array<[number, number, number]>) {
    chunks.push(0x40 | local, 0x00, 0x00)
    chunks.push(globalNum & 0xff, (globalNum >> 8) & 0xff)
    chunks.push(fields.length)
    for (const [n, sz, bt] of fields) chunks.push(n, sz, bt)
  }
  function data(local: number, buf: number[]) {
    chunks.push(local)
    chunks.push(...buf)
  }
  function u32(v: number) {
    return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
  }
  function u16(v: number) {
    return [v & 0xff, (v >> 8) & 0xff]
  }
  function u8(v: number) {
    return [v & 0xff]
  }

  if (comSession) {
    // session (gn 18): sport(5), sub_sport(6), start_time(2), elapsed(7),
    // distance(9), avg_hr(16), max_hr(17), cadence(41), ascent(22), cal(11)
    def(0, 18, [
      [5, 1, 0x00],
      [6, 1, 0x00],
      [2, 4, 0x86],
      [7, 4, 0x86],
      [9, 4, 0x86],
      [16, 1, 0x02],
      [17, 1, 0x02],
      [41, 1, 0x02],
      [22, 2, 0x84],
      [11, 2, 0x84],
    ])
    data(0, [
      ...u8(s.sport),
      ...u8(s.sub),
      ...u32(s.start),
      ...u32(Math.round(s.dur * 1000)), // FIT grava duration em ms
      ...u32(Math.round(s.dist * 100)),
      ...u8(s.fc),
      ...u8(s.fcmax),
      ...u8(s.cad),
      ...u16(s.ascent),
      ...u16(s.cal),
    ])
  }

  // record (gn 20): timestamp(253), hr(3), cadence(4), distance(5), speed(6)
  const camposRecord: Array<[number, number, number]> = [
    [253, 4, 0x86],
    [3, 1, 0x02],
    [4, 1, 0x02],
    [5, 4, 0x86],
    [6, 2, 0x84],
  ]
  if (comRD) {
    camposRecord.push([40, 2, 0x84]) // gct
    camposRecord.push([39, 2, 0x84]) // vertical_oscillation
    camposRecord.push([41, 1, 0x02]) // vertical_ratio
  }
  def(1, 20, camposRecord)

  for (let i = 0; i < nRecords; i++) {
    const row = [
      ...u32(s.start + i),
      ...u8(140 + (i % 10)),
      ...u8(84),
      ...u32(Math.round((s.dist * 100 * i) / nRecords)),
      ...u16(2900),
    ]
    if (comRD) {
      row.push(...u16(248)) // gct 248ms
      row.push(...u16(85)) // vo 8.5mm
      row.push(...u8(7)) // vr 7%
    }
    data(1, row)
  }

  // header
  const dataSize = chunks.length
  const header = [
    14,
    0x10,
    0x42,
    0x06,
    ...u32(dataSize),
    0x2e,
    0x46,
    0x49,
    0x54, // ".FIT"
    0x00,
    0x00,
  ]
  const out = new Uint8Array([...header, ...chunks])
  // CRC fake (2 bytes) — o parser não valida
  return new Uint8Array([...out, 0x00, 0x00])
}

describe('FIT · parser de estrutura', () => {
  it('lê session, records e devolve os campos do briefing', () => {
    const buf = fitSintetico({ comSession: true, nRecords: 12 })
    const d = parseFit(buf)
    expect(d.erro).toBeUndefined()
    expect(d.sessions).toHaveLength(1)
    expect(d.records.length).toBeGreaterThanOrEqual(10)

    const s = d.sessions[0]
    expect(s.sport).toBe(1)
    expect(s.start_time).toBe(1760000000)
    expect(s.total_distance).toBeCloseTo(520000, 0) // 5200m em escala FIT (×100)
    expect(s.avg_heart_rate).toBe(148)
    expect(s.max_heart_rate).toBe(172)
  })

  it('arquivo sem assinatura .FIT devolve erro, sem lançar', () => {
    const lixo = new Uint8Array(30)
    const d = parseFit(lixo)
    expect(d.erro).toBeTruthy()
    expect(d.sessions).toHaveLength(0)
  })

  it('arquivo truncado não quebra o parser', () => {
    const buf = fitSintetico({ comSession: true, nRecords: 10 })
    const cortado = buf.slice(0, 40)
    const d = parseFit(cortado)
    // pode dar erro ou ler parcial — o que NÃO pode é lançar
    expect(d).toBeTruthy()
    expect(Array.isArray(d.sessions)).toBe(true)
  })

  it('arquivo de 8 anos sem Running Dynamics importa com campos nulos', () => {
    const buf = fitSintetico({ comSession: true, comRD: false, nRecords: 8 })
    const d = parseFit(buf)
    expect(d.erro).toBeUndefined()
    expect(d.sessions).toHaveLength(1)
    // records existem, mas sem gct/vo/vr
    const comRD = d.records.filter(
      (r) => r.gct != null || r.vertical_oscillation != null || r.vertical_ratio != null,
    )
    expect(comRD).toHaveLength(0)
  })
})

describe('FIT · conversões', () => {
  it('sport/sub_sport → tipo', () => {
    expect(tipoPorSport(1, 0)).toBe('rua')
    expect(tipoPorSport(1, 14)).toBe('esteira')
    expect(tipoPorSport(1, 6)).toBe('trail')
    expect(tipoPorSport(2, 0)).toBeNull() // ciclismo não é corrida
  })

  it('nomeSport legível', () => {
    expect(nomeSport(1, 0)).toBe('Corrida de rua')
    expect(nomeSport(1, 14)).toBe('Esteira')
    expect(nomeSport(null, null)).toBe('Desconhecido')
  })

  it('cadência: valor por-pé (<120) dobra', () => {
    expect(cadenciaSpm(84)).toBe(168)
    expect(cadenciaSpm(172)).toBe(172) // já é spm
    expect(cadenciaSpm(null)).toBeNull()
    expect(cadenciaSpm(0)).toBeNull()
  })

  it('semicírculos → graus', () => {
    expect(semicirculosParaGraus(Math.pow(2, 31))).toBeCloseTo(180, 5)
    expect(semicirculosParaGraus(null)).toBeNull()
  })

  it('altitude aplica o offset de +500', () => {
    // valor bruto 3000 → 3000/5 - 500 = 100 m
    expect(altitudeComOffset(3000)).toBe(100)
    expect(altitudeComOffset(null)).toBeNull()
  })
})

describe('FIT · confiabilidade de FC (CA4)', () => {
  it('intervalado curto com FC alta → baixa', () => {
    // 120 s, FC média 150 de 172 max (87% da max)
    expect(avaliarConfiabilidade(150, 172, 120, 'optica_pulso')).toBe('baixa')
  })

  it('sessão com menos de 60 s → insuficiente', () => {
    expect(avaliarConfiabilidade(150, 172, 45, 'optica_pulso')).toBe('insuficiente')
  })

  it('cinta de peito → alta', () => {
    expect(avaliarConfiabilidade(150, 172, 3600, 'cinta_peito')).toBe('alta')
  })

  it('pulso óptico em sessão longa → alta', () => {
    expect(avaliarConfiabilidade(140, 175, 3600, 'optica_pulso')).toBe('alta')
  })

  it('FC média 86% da max em 179 s → baixa (limite)', () => {
    expect(avaliarConfiabilidade(148, 172, 179, 'optica_pulso')).toBe('baixa')
  })

  it('FC média 86% da max em 181 s → alta (passou o limite)', () => {
    expect(avaliarConfiabilidade(148, 172, 181, 'optica_pulso')).toBe('alta')
  })
})

describe('FIT · zonas, trimp e decoupling', () => {
  it('zonas somam tempo apenas em intervalos válidos', () => {
    const recs = [
      {
        timestamp: 1000,
        heart_rate: 100,
        cadence: null,
        distance: null,
        altitude: null,
        speed: null,
        position_lat: null,
        position_long: null,
        gct: null,
        vertical_oscillation: null,
        vertical_ratio: null,
      },
      {
        timestamp: 1010,
        heart_rate: 120,
        cadence: null,
        distance: null,
        altitude: null,
        speed: null,
        position_lat: null,
        position_long: null,
        gct: null,
        vertical_oscillation: null,
        vertical_ratio: null,
      },
      {
        timestamp: 1020,
        heart_rate: 150,
        cadence: null,
        distance: null,
        altitude: null,
        speed: null,
        position_lat: null,
        position_long: null,
        gct: null,
        vertical_oscillation: null,
        vertical_ratio: null,
      },
      {
        timestamp: 1030,
        heart_rate: 168,
        cadence: null,
        distance: null,
        altitude: null,
        speed: null,
        position_lat: null,
        position_long: null,
        gct: null,
        vertical_oscillation: null,
        vertical_ratio: null,
      },
    ]
    const z = calcularZonas(recs as any, 172)
    expect(z).not.toBeNull()
    // 100/172=58% → z1? (0.5-0.6); 120/172=70% → z3; 150/172=87% → z4; 168/172=98% → z5
    expect(Object.values(z!).reduce((a, b) => a + b, 0)).toBe(30)
  })

  it('zonas devolvem null com menos de 2 amostras', () => {
    expect(calcularZonas([], 172)).toBeNull()
  })

  it('trimp devolve null sem FC', () => {
    expect(calcularTrimp(null, null, null, 1800)).toBeNull()
  })

  it('trimp calcula com FC média e duração', () => {
    const t = calcularTrimp(null, 148, 172, 1800)
    expect(t).toBeGreaterThan(0)
  })

  it('decoupling devolve null com poucas amostras', () => {
    expect(calcularDecoupling([])).toBeNull()
  })
})

describe('FIT · normalização para ll5_activity', () => {
  it('gera a linha completa a partir de uma session válida', () => {
    const buf = fitSintetico({ comSession: true, nRecords: 30 })
    const d = parseFit(buf)
    const r = normalizarAtividade(d, {
      deviceActivityId: '12345678901',
      arquivoOrigem: '12345678901_ACTIVITY.fit',
    })
    expect(r.ok).toBe(true)
    const a = r.activity!
    expect(a.fonte).toBe('garmin_fit')
    expect(a.tipo).toBe('rua')
    expect(a.demo).toBe(false)
    expect(a.tem_streams).toBe(true)
    expect(a.fonte_fc).toBe('optica_pulso')
    expect(a.device_activity_id).toBe('12345678901')
    expect(a.cadencia_spm).toBe(168) // 84 por-pé → 168
  })

  it('bloqueia arquivo sem session (validação 1)', () => {
    const buf = fitSintetico({ comSession: false, nRecords: 5 })
    const d = parseFit(buf)
    const r = normalizarAtividade(d, {
      deviceActivityId: '999',
      arquivoOrigem: '999_ACTIVITY.fit',
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/session/i)
  })

  it('wellness é identificado pelo NOME, mesmo com conteúdo ambíguo', () => {
    const buf = fitSintetico({ comSession: true, nRecords: 5 })
    const d = parseFit(buf)
    // nome de wellness sempre recusa, independente do conteúdo
    expect(ehWellness('8386643197_WELLNESS.fit', d)).toBe(true)
    // arquivo de atividade com session válida NÃO é wellness
    expect(ehWellness('12345_ACTIVITY.fit', d)).toBe(false)
    // arquivo sem session não tem o que importar (tratado como ignorável)
    const semSessao = parseFit(fitSintetico({ comSession: false }))
    expect(ehWellness('12345_ACTIVITY.fit', semSessao)).toBe(true)
  })

  it('idDoNome extrai o id do padrão <id>_ACTIVITY.fit', () => {
    expect(idDoNome('12345678901_ACTIVITY.fit')).toBe('12345678901')
    expect(idDoNome('DI_CONNECT/arquivo/998877_ACTIVITY.fit')).toBe('998877')
  })

  it('atividade antiga sem RD grava null nos campos de dynamics', () => {
    const buf = fitSintetico({ comSession: true, comRD: false, nRecords: 10 })
    const d = parseFit(buf)
    const r = normalizarAtividade(d, {
      deviceActivityId: 'velho',
      arquivoOrigem: 'velho_ACTIVITY.fit',
    })
    expect(r.ok).toBe(true)
    const a = r.activity!
    expect(a.ground_contact_time_ms).toBeNull()
    expect(a.vertical_oscillation_cm).toBeNull()
    expect(a.vertical_ratio_pct).toBeNull()
  })
})
