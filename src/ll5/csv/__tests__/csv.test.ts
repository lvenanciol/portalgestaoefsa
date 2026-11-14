import { describe, it, expect } from 'vitest'
import {
  num,
  tempoParaSegundos,
  dataParaIso,
  cadenciaValida,
  potenciaConfiavel,
  zonasEstimadas,
  sinalizarLongoZ4,
  cargaProxy,
  semanaIso,
  mapearLinha,
  chaveDedupeCsv,
  casaComFit,
  detectarDelimitador,
  removerBom,
  dividirLinha,
  FCMAX_REFERENCIA,
  LIMITE_Z4,
  DATA_CORTE_SINALIZACAO,
} from '../regras'

// ============================================================================
// CSV DO GARMIN — matriz de aceite
// Os valores esperados foram OBTIDOS DO ARQUIVO REAL (1.189 linhas).
// ============================================================================

const HDR: Record<string, number> = {
  'Activity Type': 0,
  Date: 1,
  Title: 2,
  Distance: 3,
  Calories: 4,
  Time: 5,
  'Avg HR': 6,
  'Max HR': 7,
  'Aerobic TE': 8,
  'Avg Run Cadence': 9,
  'Max Run Cadence': 10,
  'Avg Pace': 11,
  'Best Pace': 12,
  'Total Ascent': 13,
  'Total Descent': 14,
  'Avg Stride Length': 15,
  'Avg Vertical Ratio': 16,
  'Avg Vertical Oscillation': 17,
  'Avg Ground Contact Time': 18,
  'Avg GAP': 19,
  'Normalized Power® (NP®)': 20,
  'Training Stress Score®': 21,
  'Avg Power': 22,
  'Max Power': 23,
  Steps: 24,
  'Total Reps': 25,
  'Total Sets': 26,
  'Body Battery Drain': 27,
  'Best Lap Time': 28,
  'Number of Laps': 29,
  'Moving Time': 30,
  'Elapsed Time': 31,
  'Min Elevation': 32,
  'Max Elevation': 33,
}

/** Linha real do CSV (13/11/2026, Running, 5,40 km, 35:03). */
function linhaReal(): string[] {
  const r = new Array(34).fill('--')
  r[0] = 'Running'
  r[1] = '2026-11-13 06:11:57'
  r[2] = 'Vila Velha Running'
  r[3] = '5,40'
  r[4] = '450'
  r[5] = '00:35:03'
  r[6] = '155'
  r[7] = '182'
  r[8] = '3,4'
  r[9] = '162'
  r[10] = '183'
  r[11] = '6:30'
  r[12] = '4:35'
  r[13] = '54'
  r[14] = '46'
  r[15] = '0,94'
  r[16] = '8,2'
  r[17] = '7,6'
  r[18] = '265'
  r[19] = '6:21'
  r[20] = '323'
  r[21] = '0,0'
  r[22] = '295'
  r[23] = '504'
  r[24] = '5.710'
  r[27] = "'-9"
  r[28] = '00:02:14,8'
  r[29] = '6'
  r[30] = '00:35:01'
  r[31] = '00:35:03'
  r[32] = '3'
  r[33] = '29'
  return r
}

describe('CSV · conversões numéricas (validadas no arquivo real)', () => {
  it('"--" vira null, nunca 0', () => {
    expect(num('--')).toBeNull()
    expect(num('')).toBeNull()
    expect(num(null)).toBeNull()
    expect(num('-')).toBeNull()
  })

  it('milhar BR "5.710" → 5710', () => {
    expect(num('5.710')).toBe(5710)
    expect(num('12.345')).toBe(12345)
  })

  it('decimal BR "0,94" → 0.94', () => {
    expect(num('0,94')).toBeCloseTo(0.94, 5)
    expect(num('3,4')).toBeCloseTo(3.4, 5)
  })

  it('Body Battery com apóstrofo', () => {
    expect(num("'-9")).toBe(-9)
    expect(num("'-24")).toBe(-24)
  })

  it('inteiro simples', () => {
    expect(num('450')).toBe(450)
    expect(num('155')).toBe(155)
  })
})

describe('CSV · tempos', () => {
  it('HH:MM:SS → segundos', () => {
    expect(tempoParaSegundos('00:35:03')).toBe(2103)
    expect(tempoParaSegundos('02:21:32')).toBe(8492)
    expect(tempoParaSegundos('01:00:00')).toBe(3600)
  })

  it('M:SS (pace) → segundos', () => {
    expect(tempoParaSegundos('6:30')).toBe(390)
    expect(tempoParaSegundos('4:35')).toBe(275)
    expect(tempoParaSegundos('5:00')).toBe(300)
  })

  it('melhor volta com vírgula nos décimos', () => {
    expect(tempoParaSegundos('00:02:14,8')).toBe(135)
  })

  it('"--" → null', () => {
    expect(tempoParaSegundos('--')).toBeNull()
    expect(tempoParaSegundos('')).toBeNull()
  })
})

describe('CSV · data com fuso de São Paulo', () => {
  it('grava com offset explícito -03:00', () => {
    expect(dataParaIso('2026-11-13 06:11:57')).toBe('2026-11-13T06:11:57-03:00')
  })

  it('data inválida → null', () => {
    expect(dataParaIso('--')).toBeNull()
    expect(dataParaIso('')).toBeNull()
    expect(dataParaIso('13/11/2026')).toBeNull()
  })
})

describe('CSV · cadência inválida (CA4)', () => {
  it('< 120 vira null', () => {
    expect(cadenciaValida(84)).toBeNull()
    expect(cadenciaValida(119)).toBeNull()
  })

  it('>= 120 é mantida', () => {
    expect(cadenciaValida(162)).toBe(162)
    expect(cadenciaValida(120)).toBe(120)
  })
})

describe('CSV · potência confiável só a partir de 2024', () => {
  it('antes de 2024-01-01 → false', () => {
    expect(potenciaConfiavel('2023-12-31T10:00:00-03:00')).toBe(false)
    expect(potenciaConfiavel('2016-06-21T07:00:00-03:00')).toBe(false)
  })

  it('a partir de 2024-01-01 → true', () => {
    expect(potenciaConfiavel('2024-01-01T00:00:00-03:00')).toBe(true)
    expect(potenciaConfiavel('2026-11-13T06:11:57-03:00')).toBe(true)
  })

  it('sem data → false', () => {
    expect(potenciaConfiavel(null)).toBe(false)
  })
})

describe('CSV · zonas sobre FCmax 218 (CA3)', () => {
  it('FCmax de referência é 218', () => {
    expect(FCMAX_REFERENCIA).toBe(218)
  })

  it('zonas somam a duração total', () => {
    const { zonas, estimadas } = zonasEstimadas(155, 2103)
    expect(zonas).not.toBeNull()
    expect(estimadas).toBe(true) // CSV não tem streams
    const total = Object.values(zonas!).reduce((a, b) => a + b, 0)
    expect(total).toBe(2103)
  })

  it('FC média em Z5 concentra tempo nas zonas altas', () => {
    const { zonas } = zonasEstimadas(200, 3600)
    expect(zonas!.z5).toBeGreaterThan(zonas!.z1)
  })

  it('FC média baixa concentra em Z1/Z2', () => {
    const { zonas } = zonasEstimadas(120, 3600)
    expect(zonas!.z1 + zonas!.z2).toBeGreaterThan(zonas!.z4 + zonas!.z5)
  })

  it('sem FC ou duração → null', () => {
    expect(zonasEstimadas(null, 1800).zonas).toBeNull()
    expect(zonasEstimadas(150, null).zonas).toBeNull()
    expect(zonasEstimadas(150, 0).zonas).toBeNull()
  })
})

describe('CSV · sinalização de longo em Z4 (CA11)', () => {
  it('corte é 14/11/2026', () => {
    expect(DATA_CORTE_SINALIZACAO).toBe('2026-11-14')
  })

  it('atividade histórica NUNCA sinaliza', () => {
    expect(sinalizarLongoZ4('rua', 7200, 180, '2026-11-13T06:00:00-03:00')).toBe(false)
    expect(sinalizarLongoZ4('rua', 7200, 180, '2019-05-01T06:00:00-03:00')).toBe(false)
  })

  it('a partir do corte, longa e em Z4 sinaliza', () => {
    expect(sinalizarLongoZ4('rua', 5400, LIMITE_Z4, '2026-11-14T06:00:00-03:00')).toBe(true)
    expect(sinalizarLongoZ4('trail', 7200, 180, '2026-12-01T06:00:00-03:00')).toBe(true)
  })

  it('curta (<90min) não sinaliza', () => {
    expect(sinalizarLongoZ4('rua', 5399, 180, '2026-12-01T06:00:00-03:00')).toBe(false)
  })

  it('FC abaixo de Z4 não sinaliza', () => {
    expect(sinalizarLongoZ4('rua', 7200, 173, '2026-12-01T06:00:00-03:00')).toBe(false)
  })

  it('força não sinaliza', () => {
    expect(sinalizarLongoZ4('forca', 7200, 180, '2026-12-01T06:00:00-03:00')).toBe(false)
  })
})

describe('CSV · carga por proxy (CA9)', () => {
  it('TE × duração em minutos', () => {
    // 3,4 × (2103/60) = 119,17 → 119.2
    expect(cargaProxy(3.4, 2103)).toBeCloseTo(119.2, 1)
    expect(cargaProxy(2, 3600)).toBe(120)
  })

  it('sem TE ou duração → null', () => {
    expect(cargaProxy(null, 1800)).toBeNull()
    expect(cargaProxy(3, null)).toBeNull()
    expect(cargaProxy(3, 0)).toBeNull()
  })
})

describe('CSV · semana ISO', () => {
  it('calcula semana e ano ISO', () => {
    const s = semanaIso('2026-11-13T06:11:57-03:00')
    expect(s.ano).toBe(2026)
    expect(s.semana).toBeGreaterThan(44)
    expect(s.semana).toBeLessThan(48)
  })
})

describe('CSV · mapeamento da linha REAL do arquivo', () => {
  const a = mapearLinha(linhaReal(), HDR)!

  it('não é nulo e vai para a aba running', () => {
    expect(a).not.toBeNull()
    expect(a.aba).toBe('running')
    expect(a.tipo).toBe('rua')
  })

  it('campos comuns batem com o arquivo', () => {
    expect(a.data_hora_inicio).toBe('2026-11-13T06:11:57-03:00')
    expect(a.titulo).toBe('Vila Velha Running')
    expect(a.distancia_m).toBe(5400)
    expect(a.calorias).toBe(450)
    expect(a.duracao_s).toBe(2103)
    expect(a.fc_media).toBe(155)
    expect(a.fc_max).toBe(182)
    expect(a.te_aerobico).toBeCloseTo(3.4, 1)
    expect(a.passos).toBe(5710)
    expect(a.body_battery_drain).toBe(-9)
    expect(a.num_voltas).toBe(6)
    expect(a.melhor_volta_s).toBe(135)
  })

  it('corrida: pace, cadência, elevação e dynamics', () => {
    expect(a.pace_medio_s_km).toBe(390)
    expect(a.melhor_pace_s_km).toBe(275)
    expect(a.gap_s_km).toBe(381)
    expect(a.cadencia_spm).toBe(162)
    expect(a.cadencia_invalida).toBe(false)
    expect(a.ganho_elevacao_m).toBe(54)
    expect(a.perda_elevacao_m).toBe(46)
    expect(a.comprimento_passada_m).toBeCloseTo(0.94, 2)
    expect(a.vertical_ratio_pct).toBeCloseTo(8.2, 1)
    expect(a.vertical_oscillation_cm).toBeCloseTo(7.6, 1)
    expect(a.ground_contact_time_ms).toBe(265)
    expect(a.tem_running_dynamics).toBe(true)
  })

  it('potência de 2026 é confiável', () => {
    expect(a.potencia_media_w).toBe(295)
    expect(a.potencia_max_w).toBe(504)
    expect(a.potencia_normalizada_w).toBe(323)
    expect(a.potencia_confiavel).toBe(true)
  })

  it('FCmax validada e carga por proxy', () => {
    expect(a.fcmax_referencia).toBe(218)
    expect(a.fcmax_validada).toBe(true)
    expect(a.fcmax_metodo_validacao).toBe('estatistico_164_atividades')
    expect(a.zonas_estimadas).toBe(true)
    expect(a.carga_proxy).toBeCloseTo(119.2, 1)
    expect(a.carga_metodo).toBe('proxy_te_x_duracao')
  })

  it('TSS NÃO é importado (CA5)', () => {
    expect((a as any).tss).toBeUndefined()
    expect((a as any).training_stress_score).toBeUndefined()
  })

  it('histórica não sinaliza (CA11)', () => {
    expect(a.sinalizar_intensidade_excessiva).toBe(false)
  })
})

describe('CSV · força (CA8)', () => {
  function linhaForca(): string[] {
    const r = new Array(34).fill('--')
    r[0] = 'Strength Training'
    r[1] = '2026-11-12 18:00:00'
    r[2] = 'Treino Push'
    r[4] = '310'
    r[5] = '01:05:00'
    r[6] = '118'
    r[7] = '142'
    r[25] = '184'
    r[26] = '22'
    return r
  }
  const f = mapearLinha(linhaForca(), HDR)!

  it('vai para a aba gym com tipo forca', () => {
    expect(f.aba).toBe('gym')
    expect(f.tipo).toBe('forca')
  })

  it('qualidade limitado e sem detalhe de exercício', () => {
    expect(f.qualidade_dados).toBe('limitado')
    expect(f.tem_detalhe_exercicio).toBe(false)
  })

  it('volume_kg é null — NUNCA calculado', () => {
    expect(f.volume_kg).toBeNull()
  })

  it('preserva reps e sets', () => {
    expect(f.total_reps).toBe(184)
    expect(f.total_sets).toBe(22)
  })

  it('não traz campos de corrida', () => {
    expect(f.pace_medio_s_km).toBeNull()
    expect(f.cadencia_spm).toBeNull()
    expect(f.ground_contact_time_ms).toBeNull()
  })
})

describe('CSV · tipos ignorados (CA7)', () => {
  for (const [csvTipo, esperado] of [
    ['Walking', 'caminhada'],
    ['Pool Swim', 'natacao'],
    ['Cycling', 'ciclismo'],
  ]) {
    it(csvTipo + ' → aba ignorar', () => {
      const r = new Array(34).fill('--')
      r[0] = csvTipo
      r[1] = '2026-05-01 07:00:00'
      r[5] = '00:40:00'
      const m = mapearLinha(r, HDR)!
      expect(m.aba).toBe('ignorar')
      expect(m.tipo).toBe(esperado)
    })
  }
})

describe('CSV · cadência inválida na linha (CA4)', () => {
  it('cadência 84 → null + flag', () => {
    const r = linhaReal()
    r[9] = '84'
    const a = mapearLinha(r, HDR)!
    expect(a.cadencia_spm).toBeNull()
    expect(a.cadencia_invalida).toBe(true)
  })
})

describe('CSV · estrutura do arquivo', () => {
  it('detecta vírgula como delimitador', () => {
    expect(detectarDelimitador('A,B,C')).toBe(',')
    expect(detectarDelimitador('A;B;C')).toBe(';')
    expect(detectarDelimitador('A\tB\tC')).toBe('\t')
  })

  it('remove BOM', () => {
    expect(removerBom('\ufeffActivity')).toBe('Activity')
    expect(removerBom('Activity')).toBe('Activity')
  })

  it('divide linha respeitando aspas', () => {
    expect(dividirLinha('a,b,c', ',')).toEqual(['a', 'b', 'c'])
    expect(dividirLinha('"a,b",c', ',')).toEqual(['a,b', 'c'])
    expect(dividirLinha('"diz ""oi""",x', ',')).toEqual(['diz "oi"', 'x'])
  })
})

describe('CSV · deduplicação (CA2)', () => {
  const a = mapearLinha(linhaReal(), HDR)!

  it('chave composta owner+data+tipo+distancia', () => {
    const k = chaveDedupeCsv(a, 'u1')
    expect(k).toBe('u1|2026-11-13T06:11:57-03:00|rua|5400')
  })

  it('mesma atividade com owner diferente gera chave diferente', () => {
    expect(chaveDedupeCsv(a, 'u1')).not.toBe(chaveDedupeCsv(a, 'u2'))
  })

  it('casa com FIT dentro de ±60 s', () => {
    expect(casaComFit(a, { data_hora_inicio: '2026-11-13T06:12:30-03:00' })).toBe(true)
    expect(casaComFit(a, { data_hora_inicio: '2026-11-13T06:13:30-03:00' })).toBe(false)
  })

  it('sem data no FIT não casa', () => {
    expect(casaComFit(a, { data_hora_inicio: null })).toBe(false)
  })
})
