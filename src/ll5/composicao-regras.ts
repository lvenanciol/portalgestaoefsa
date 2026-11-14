// ============================================================================
// LL5 — REGRAS DE COMPOSIÇÃO CORPORAL (15/11/2026)
//
// Módulo PURO (sem React, sem rede): é o que o teste automatizado exercita.
// Concentra tudo que o briefing define como validação bloqueante, advertência
// e cálculo — para a tela e o teste usarem EXATAMENTE a mesma régua.
//
// Princípio do briefing: "em divergência aritmética, exibir a CONTA EXPLÍCITA
// no banner". Por isso cada erro devolve a conta montada, não uma frase vaga.
// ============================================================================

export type Metodo = 'dexa' | 'bia' | 'antropometria' | 'balanca'

export interface ComposicaoDados {
  metodo?: Metodo | ''
  data_exame?: string
  hora_exame?: string
  peso_kg?: number | null
  altura_cm?: number | null
  massa_gorda_kg?: number | null
  massa_magra_kg?: number | null
  gordura_pct?: number | null
  perimetro_cintura_cm?: number | null
  perimetro_quadril_cm?: number | null
  gordura_visceral_area_cm2?: number | null
  gordura_visceral_indice?: number | null
  razao_android_gynoid?: number | null
  tmb_informada_kcal?: number | null
  tmb_calculada_kcal?: number | null
  jejum_horas?: number | null
  treinou_24h?: boolean
  clinica_laboratorio?: string
  idade?: number | null
  sexo?: 'M' | 'F' | ''
  segmentos?: Array<{
    regiao: string
    massa_gorda_g?: number | null
    massa_magra_g?: number | null
  }>
  divergencia_altura_confirmada?: boolean
  nova_serie_confirmada?: boolean
}

export interface Resultado {
  bloqueios: string[]
  advertencias: string[]
  confiabilidade: 'alta' | 'media' | 'baixa'
}

/** Campos visíveis por método — o briefing exige OCULTAR, não desabilitar. */
export const CAMPOS_POR_METODO: Record<Metodo, string[]> = {
  dexa: [
    'peso_kg',
    'altura_cm',
    'imc',
    'perimetro_cintura_cm',
    'perimetro_quadril_cm',
    'rcq',
    'massa_gorda_kg',
    'gordura_pct',
    'massa_magra_kg',
    'massa_muscular_esqueletica_kg',
    'mme_pct',
    'massa_ossea_kg',
    'gordura_visceral_kg',
    'gordura_visceral_area_cm2',
    'tmb_calculada_kcal',
  ],
  bia: [
    'peso_kg',
    'altura_cm',
    'imc',
    'perimetro_cintura_cm',
    'perimetro_quadril_cm',
    'rcq',
    'massa_gorda_kg',
    'gordura_pct',
    'massa_magra_kg',
    'massa_muscular_esqueletica_kg',
    'mme_pct',
    'agua_corporal_l',
    'agua_corporal_pct',
    'gordura_visceral_indice',
    'tmb_calculada_kcal',
    'tmb_informada_kcal',
    'proteina_pct',
    'idade_corporal',
  ],
  antropometria: [
    'peso_kg',
    'altura_cm',
    'imc',
    'perimetro_cintura_cm',
    'perimetro_quadril_cm',
    'rcq',
    'massa_gorda_kg',
    'gordura_pct',
    'tmb_calculada_kcal',
  ],
  balanca: ['peso_kg', 'altura_cm', 'imc', 'perimetro_cintura_cm', 'tmb_calculada_kcal'],
}

/** O campo aparece para este método? Sem método, nada aparece (regra do B0). */
export function campoVisivel(campo: string, metodo?: Metodo | ''): boolean {
  if (!metodo) return false
  return CAMPOS_POR_METODO[metodo]?.includes(campo) ?? false
}

/** IMC — calculado, badge "secundário". */
export function calcIMC(peso?: number | null, alturaCm?: number | null): number | null {
  if (!peso || !alturaCm || alturaCm <= 0) return null
  const m = alturaCm / 100
  return Number((peso / (m * m)).toFixed(2))
}

/** RCQ — calculado. */
export function calcRCQ(cintura?: number | null, quadril?: number | null): number | null {
  if (!cintura || !quadril || quadril <= 0) return null
  return Number((cintura / quadril).toFixed(3))
}

/**
 * TMB do SISTEMA — sempre a calculada, nunca a informada pelo aparelho.
 * Cunningham com massa magra; Mifflin-St Jeor como fallback.
 */
export function calcTMB(params: {
  massaMagraKg?: number | null
  pesoKg?: number | null
  alturaCm?: number | null
  idade?: number | null
  sexo?: 'M' | 'F' | ''
}): number | null {
  const { massaMagraKg, pesoKg, alturaCm, idade, sexo } = params
  if (massaMagraKg && massaMagraKg > 0) {
    // Cunningham: 500 + 22 × MLG
    return Math.round(500 + 22 * massaMagraKg)
  }
  if (pesoKg && alturaCm && idade) {
    // Mifflin-St Jeor
    const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade
    return Math.round(sexo === 'F' ? base - 161 : base + 5)
  }
  return null
}

/** Percentual de divergência entre dois valores. */
function pctDivergencia(a: number, b: number): number {
  if (!b) return 0
  return (Math.abs(a - b) / Math.abs(b)) * 100
}

function fmt(v: number, casas = 2): string {
  return v.toFixed(casas).replace('.', ',')
}

/**
 * VALIDAÇÃO COMPLETA.
 * `ultimoRegistro` permite checar as regras que dependem do histórico
 * (altura variando > 2 cm, método diferente do último).
 */
export function validar(d: ComposicaoDados, ultimoRegistro?: ComposicaoDados | null): Resultado {
  const bloqueios: string[] = []
  const advertencias: string[] = []
  let confiabilidade: 'alta' | 'media' | 'baixa' = 'alta'

  // ---------------------------------------------- BLOQUEANTE 1: método
  if (!d.metodo) {
    bloqueios.push(
      'Método do exame não informado. Selecione DEXA, BIA, antropometria ou balança antes de lançar qualquer dado.',
    )
  }

  // ---------------------------------------------- BLOQUEANTE 4: data futura
  if (d.data_exame) {
    const hoje = new Date()
    hoje.setHours(23, 59, 59, 999)
    const dt = new Date(d.data_exame + (d.data_exame.length === 10 ? 'T12:00:00' : ''))
    if (!isNaN(dt.getTime()) && dt.getTime() > hoje.getTime()) {
      bloqueios.push(
        `Data do exame (${d.data_exame.split('-').reverse().join('/')}) é futura. Corrija para hoje ou antes.`,
      )
    }
  } else if (d.metodo) {
    bloqueios.push('Data do exame é obrigatória.')
  }

  // ------------------------------- BLOQUEANTE 2: gordura + magra ≠ peso (±2%)
  const mg = d.massa_gorda_kg
  const mm = d.massa_magra_kg
  const peso = d.peso_kg
  if (mg != null && mm != null && peso != null && peso > 0) {
    const soma = mg + mm
    const dif = pctDivergencia(soma, peso)
    if (dif > 2) {
      bloqueios.push(
        `Identidade aritmética: ${fmt(mg)} + ${fmt(mm)} = ${fmt(soma)} kg vs peso ${fmt(peso)} kg → divergência de ${fmt(dif, 1)}% (limite ±2%). Ajuste o campo de massa magra.`,
      )
    }
  }

  // ------------------------------- BLOQUEANTE 3: DEXA, soma regional ≠ total
  if (d.metodo === 'dexa' && d.segmentos && d.segmentos.length > 0) {
    // tronco + membros (sem "pernas total" e "apendicular", que são derivados)
    const principais = d.segmentos.filter((s) =>
      ['braco_direito', 'braco_esquerdo', 'tronco', 'perna_direita', 'perna_esquerda'].includes(
        s.regiao,
      ),
    )
    const somaGorda = principais.reduce((a, s) => a + Number(s.massa_gorda_g || 0), 0)
    const somaMagra = principais.reduce((a, s) => a + Number(s.massa_magra_g || 0), 0)

    if (mg != null && somaGorda > 0) {
      const difG = pctDivergencia(somaGorda / 1000, mg)
      if (difG > 2) {
        bloqueios.push(
          `DEXA — gordura regional: soma dos 5 segmentos = ${fmt(somaGorda / 1000)} kg vs total ${fmt(mg)} kg → divergência de ${fmt(difG, 1)}% (limite ±2%).`,
        )
      }
    }
    if (mm != null && somaMagra > 0) {
      const difM = pctDivergencia(somaMagra / 1000, mm)
      if (difM > 2) {
        bloqueios.push(
          `DEXA — massa magra regional: soma dos 5 segmentos = ${fmt(somaMagra / 1000)} kg vs total ${fmt(mm)} kg → divergência de ${fmt(difM, 1)}% (limite ±2%).`,
        )
      }
    }
  }

  // ------------------------------- BLOQUEANTE 5: altura variando > 2 cm
  if (ultimoRegistro?.altura_cm && d.altura_cm) {
    const dif = Math.abs(d.altura_cm - ultimoRegistro.altura_cm)
    if (dif > 2 && !d.divergencia_altura_confirmada) {
      bloqueios.push(
        `Altura varia ${fmt(dif, 1)} cm em relação ao último registro (${fmt(ultimoRegistro.altura_cm, 1)} → ${fmt(d.altura_cm, 1)} cm). O limite é 2 cm — confirme explicitamente para continuar.`,
      )
    }
  }

  // ------------------------------- BLOQUEANTE 6: método mudou sem confirmar
  if (ultimoRegistro?.metodo && d.metodo && ultimoRegistro.metodo !== d.metodo) {
    if (!d.nova_serie_confirmada) {
      bloqueios.push(
        `Método diferente do último registro (${ultimoRegistro.metodo.toUpperCase()} → ${d.metodo.toUpperCase()}). Isso inicia uma NOVA SÉRIE — confirme para continuar.`,
      )
    }
  }

  // ---------------------------------------------- ADVERTÊNCIA 2: V-fat ≥ 100
  if (d.gordura_visceral_area_cm2 != null && d.gordura_visceral_area_cm2 >= 100) {
    advertencias.push(
      `Gordura visceral ${fmt(d.gordura_visceral_area_cm2, 1)} cm² ≥ 100 cm² — faixa crítica.`,
    )
  }

  // ---------------------------------------------- ADVERTÊNCIA 3: A/G ≥ 1,0
  if (d.razao_android_gynoid != null && d.razao_android_gynoid >= 1) {
    advertencias.push(
      `Razão androide/ginoide ${fmt(d.razao_android_gynoid, 2)} ≥ 1,0 — distribuição central de gordura.`,
    )
  }

  // ---------------------------------------------- ADVERTÊNCIA 4/5: BIA
  if (d.metodo === 'bia') {
    if (d.treinou_24h === true) {
      advertencias.push(
        'Treinou nas últimas 24 h — confiabilidade da bioimpedância reduzida para BAIXA.',
      )
      confiabilidade = 'baixa'
    }
    if (d.jejum_horas != null && d.jejum_horas < 2) {
      advertencias.push(
        `Jejum de ${d.jejum_horas} h (< 2 h) — confiabilidade da bioimpedância reduzida para BAIXA.`,
      )
      confiabilidade = 'baixa'
    }
  }

  // ---------------------------------------------- ADVERTÊNCIA 6: TMB informada
  const tmbCalc = d.tmb_calculada_kcal
  const tmbInf = d.tmb_informada_kcal
  if (tmbCalc && tmbInf) {
    const dif = pctDivergencia(tmbInf, tmbCalc)
    if (dif > 15) {
      advertencias.push(
        `TMB informada ${tmbInf} kcal diverge ${fmt(dif, 1)}% da calculada ${tmbCalc} kcal — exibindo apenas a calculada.`,
      )
    }
  }

  return { bloqueios, advertencias, confiabilidade }
}

/** Bloqueante de "método ≠ dexa impede prescrição calórica" — usado no parecer. */
export function prescricaoCaloricaPermitida(metodo?: Metodo | ''): boolean {
  return metodo === 'dexa'
}

// ============================================================================
// DICIONÁRIO FIXO DE OCR (16 rótulos) — o app de origem é sempre o mesmo.
// Não é mapeador genérico: rótulo desconhecido vai para revisão, nunca é
// adivinhado.
// ============================================================================
export type AcaoOcr = 'importar' | 'revisar' | 'ignorar'

export interface RegraOcr {
  rotulo: string
  campo: string | null
  acao: AcaoOcr
  motivo?: string
}

export const DICIONARIO_OCR: RegraOcr[] = [
  { rotulo: 'Weight(Kg)', campo: 'peso_kg', acao: 'importar' },
  { rotulo: 'BMI', campo: null, acao: 'ignorar', motivo: 'recalculado pelo sistema' },
  { rotulo: 'Fat(%)', campo: 'gordura_pct', acao: 'importar' },
  { rotulo: 'Body fat weight(Kg)', campo: 'massa_gorda_kg', acao: 'importar' },
  { rotulo: 'Skeletal muscle mass percentage(%)', campo: 'mme_pct', acao: 'importar' },
  {
    rotulo: 'Skeletal muscle weight(Kg)',
    campo: 'massa_muscular_esqueletica_kg',
    acao: 'importar',
  },
  { rotulo: 'Muscle Percent(%)', campo: null, acao: 'ignorar', motivo: 'ambíguo' },
  {
    rotulo: 'Muscle weight(Kg)',
    campo: 'massa_magra_kg',
    acao: 'revisar',
    motivo: 'ambíguo — requer revisão humana',
  },
  {
    rotulo: 'V-fat',
    campo: 'gordura_visceral_indice',
    acao: 'importar',
    motivo: 'índice, nunca cm² nem kg',
  },
  { rotulo: 'Water(%)', campo: 'agua_corporal_pct', acao: 'importar' },
  { rotulo: 'Weight of water(Kg)', campo: 'agua_corporal_l', acao: 'importar' },
  {
    rotulo: 'Metabolism(kcal/day)',
    campo: 'tmb_informada_kcal',
    acao: 'importar',
    motivo: 'informativo, nunca usado em prescrição',
  },
  { rotulo: 'Protein(%)', campo: 'proteina_pct', acao: 'importar' },
  { rotulo: 'Body age', campo: 'idade_corporal', acao: 'importar', motivo: 'sem validade clínica' },
  { rotulo: 'Data/hora do print', campo: 'data_exame', acao: 'importar' },
  { rotulo: 'Compared to Last Time', campo: null, acao: 'ignorar', motivo: 'delta, não medição' },
]

/** Detecta a assinatura do método pelos rótulos encontrados no print. */
export function detectarMetodo(rotulos: string[]): Metodo | null {
  const tem = (r: string) => rotulos.some((x) => x.toLowerCase().includes(r.toLowerCase()))
  const bia = tem('Body age') && tem('V-fat') && tem('Protein') && tem('Metabolism')
  const dexa = tem('T-score') || tem('Z-score') || tem('BMC') || tem('Android')
  // DEXA tem precedência: a assinatura é mais específica
  if (dexa) return 'dexa'
  if (bia) return 'bia'
  return null
}

export interface LinhaConciliacao {
  rotulo: string
  campo: string | null
  acao: AcaoOcr
  valor: string
  status: 'confirmado' | 'revisar' | 'ignorado'
  motivo?: string
}

/**
 * Concilia o texto extraído do print com o dicionário.
 * Rótulo desconhecido entra como 'revisar' com alerta — nunca falha em silêncio.
 */
export function conciliarOcr(pares: Array<{ rotulo: string; valor: string }>): {
  linhas: LinhaConciliacao[]
  resumo: { confirmados: number; revisar: number; ignorados: number }
  metodoSugerido: Metodo | null
} {
  const linhas: LinhaConciliacao[] = []

  for (const p of pares) {
    const regra = DICIONARIO_OCR.find((r) => r.rotulo.toLowerCase() === p.rotulo.toLowerCase())
    if (!regra) {
      linhas.push({
        rotulo: p.rotulo,
        campo: null,
        acao: 'revisar',
        valor: p.valor,
        status: 'revisar',
        motivo: 'rótulo desconhecido — revisão manual obrigatória',
      })
      continue
    }
    const status: LinhaConciliacao['status'] =
      regra.acao === 'ignorar' ? 'ignorado' : regra.acao === 'revisar' ? 'revisar' : 'confirmado'
    linhas.push({
      rotulo: p.rotulo,
      campo: regra.campo,
      acao: regra.acao,
      valor: p.valor,
      status,
      motivo: regra.motivo,
    })
  }

  return {
    linhas,
    resumo: {
      confirmados: linhas.filter((l) => l.status === 'confirmado').length,
      revisar: linhas.filter((l) => l.status === 'revisar').length,
      ignorados: linhas.filter((l) => l.status === 'ignorado').length,
    },
    metodoSugerido: detectarMetodo(pares.map((p) => p.rotulo)),
  }
}

/** Chave de deduplicação: hash do arquivo + owner + data + hora + método. */
export function chaveDedupe(params: {
  hashArquivo?: string
  ownerId: string
  dataExame?: string
  horaExame?: string
  metodo?: string
}): string {
  return [
    params.hashArquivo || 'semhash',
    params.ownerId,
    params.dataExame || '',
    params.horaExame || '',
    params.metodo || '',
  ].join('|')
}
