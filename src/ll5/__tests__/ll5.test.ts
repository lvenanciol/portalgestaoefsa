import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// LL5 — SUÍTE DE ACEITE (15/11/2026)
//
// Prova os critérios de aceite do briefing na CAMADA DE DADOS e nas REGRAS
// PURAS — não na UI.
//
// O cliente do PocketBase é MOCKADO: os testes de isolamento controlam o que
// o banco devolveria e verificam que o repositório recorta por owner antes de
// qualquer transformação.
// ============================================================================

// banco falso compartilhado com o mock
const banco: any[] = []

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: () => ({
        async getFullList(opts: any = {}) {
          let rows = [...banco]
          const f: string = opts.filter || ''
          const m = /owner_id = "([^"]+)"/.exec(f)
          if (m) rows = rows.filter((r) => String(r.owner_id) === m[1])
          return rows
        },
        async getOne(id: string) {
          const r = banco.find((x) => x.id === id)
          if (!r) throw new Error('404')
          return r
        },
        async create(dados: any) {
          const rec = { id: 'id' + Math.random().toString(36).slice(2, 8), ...dados }
          banco.push(rec)
          return rec
        },
        async update(id: string, dados: any) {
          const i = banco.findIndex((x) => x.id === id)
          if (i < 0) throw new Error('404')
          banco[i] = { ...banco[i], ...dados }
          return banco[i]
        },
        async delete(id: string) {
          const i = banco.findIndex((x) => x.id === id)
          if (i >= 0) banco.splice(i, 1)
        },
      }),
    },
  }
})

import {
  filtroOwner,
  ownerEfetivo,
  atorAtual,
  listar,
  criar,
  atualizar,
  excluirLogico,
  type Ator,
} from '../repo'
import {
  validar,
  calcIMC,
  calcRCQ,
  calcTMB,
  campoVisivel,
  conciliarOcr,
  detectarMetodo,
  chaveDedupe,
  prescricaoCaloricaPermitida,
  DICIONARIO_OCR,
  type ComposicaoDados,
} from '../composicao-regras'
import {
  montarPayload,
  payloadGenericoVazou,
  contextoGenericoCompleto,
  verificarGuardrails,
  STRINGS_PROIBIDAS_GENERICO,
} from '../parecer'

const ADMIN: Ator = {
  id: 'u_admin',
  email: 'leo@extrafruti.com.br',
  nome: 'Leonardo',
  role: 'admin',
}
const MEMBRO: Ator = {
  id: 'u_membro',
  email: 'familiar@extrafruti.com.br',
  nome: 'Familiar',
  role: 'membro_familia',
}
const OUTRO: Ator = {
  id: 'u_outro',
  email: 'outro@extrafruti.com.br',
  nome: 'Outro',
  role: 'membro_familia',
}

beforeEach(() => {
  banco.length = 0
})

// ===========================================================================
// CA1 — isolamento por owner (camada de dados)
// ===========================================================================
describe('CA1 · isolamento por owner (repositório, não UI)', () => {
  it('membro nunca recebe filtro que não seja o próprio id', () => {
    const f = filtroOwner(MEMBRO, OUTRO.id)
    expect(f).toBe('owner_id = "u_membro"')
    expect(f).not.toContain('u_outro')
  })

  it('admin sem escolha não tem cláusula de owner', () => {
    expect(filtroOwner(ADMIN)).toBe('')
  })

  it('admin com escolha filtra pelo owner escolhido', () => {
    expect(filtroOwner(ADMIN, OUTRO.id)).toBe(`owner_id = "${OUTRO.id}"`)
  })

  it('ownerEfetivo de membro ignora o owner pedido', () => {
    expect(ownerEfetivo(MEMBRO, OUTRO.id)).toBe(MEMBRO.id)
    expect(ownerEfetivo(ADMIN, OUTRO.id)).toBe(OUTRO.id)
  })

  it('atorAtual deriva o papel do nome do grupo (nunca de user.grupoNome)', () => {
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, 'Admin').role).toBe('admin')
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, 'Suprimentos').role).toBe('membro_familia')
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, null).role).toBe('membro_familia')
  })

  it('listar() para membro NÃO devolve registro de outro owner', async () => {
    banco.push(
      { id: 'r1', owner_id: MEMBRO.id },
      { id: 'r2', owner_id: OUTRO.id },
      { id: 'r3', owner_id: ADMIN.id },
    )
    const vistos = await listar('ll5_body_composition', MEMBRO)
    expect(vistos).toHaveLength(1)
    expect(vistos[0].id).toBe('r1')
    expect(vistos.some((r) => r.owner_id === OUTRO.id)).toBe(false)
  })

  it('membro pedindo owner de outro explicitamente continua sem ver', async () => {
    banco.push({ id: 'r1', owner_id: MEMBRO.id }, { id: 'r2', owner_id: OUTRO.id })
    const t = await listar('ll5_body_composition', MEMBRO, { ownerEscolhido: OUTRO.id })
    expect(t).toHaveLength(1)
    expect(t[0].owner_id).toBe(MEMBRO.id)
  })

  it('admin vê todos os owners', async () => {
    banco.push(
      { id: 'r1', owner_id: MEMBRO.id },
      { id: 'r2', owner_id: OUTRO.id },
      { id: 'r3', owner_id: ADMIN.id },
    )
    expect(await listar('ll5_body_composition', ADMIN)).toHaveLength(3)
  })

  it('admin escolhendo um owner vê só aquele', async () => {
    banco.push({ id: 'r1', owner_id: MEMBRO.id }, { id: 'r2', owner_id: OUTRO.id })
    const v = await listar('ll5_body_composition', ADMIN, { ownerEscolhido: OUTRO.id })
    expect(v).toHaveLength(1)
    expect(v[0].owner_id).toBe(OUTRO.id)
  })

  it('membro não consegue ATUALIZAR registro de outro owner', async () => {
    banco.push({ id: 'r2', owner_id: OUTRO.id, valor: 1 })
    await expect(atualizar('ll5_running', MEMBRO, 'r2', { valor: 99 })).rejects.toThrow(
      /Sem permissão/,
    )
  })

  it('membro não consegue EXCLUIR registro de outro owner', async () => {
    banco.push({ id: 'r2', owner_id: OUTRO.id })
    await expect(excluirLogico('ll5_running', MEMBRO, 'r2')).rejects.toThrow(/Sem permissão/)
  })

  it('criar carimba owner_id e created_by', async () => {
    const rec = await criar('ll5_running', MEMBRO, { distancia_km: 5 })
    expect(rec.owner_id).toBe(MEMBRO.id)
    expect(rec.created_by).toBe(MEMBRO.email)
  })

  it('admin criando para familiar registra no access_log', async () => {
    await criar('ll5_running', ADMIN, { distancia_km: 5 }, MEMBRO.id)
    const log = banco.filter((r) => r.acao === 'escrita')
    expect(log).toHaveLength(1)
    expect(log[0].owner_id_alvo).toBe(MEMBRO.id)
  })
})

// ===========================================================================
// CA3 — campos de DEXA OCULTOS na BIA
// ===========================================================================
describe('CA3 · campos exclusivos de DEXA ocultos (não desabilitados)', () => {
  it('sem método NENHUM campo aparece', () => {
    expect(campoVisivel('peso_kg', '')).toBe(false)
    expect(campoVisivel('peso_kg', undefined)).toBe(false)
  })

  it('DEXA-only ocultos na BIA', () => {
    expect(campoVisivel('massa_ossea_kg', 'bia')).toBe(false)
    expect(campoVisivel('gordura_visceral_area_cm2', 'bia')).toBe(false)
    expect(campoVisivel('t_score', 'bia')).toBe(false)
  })

  it('BIA-only ocultos na DEXA', () => {
    expect(campoVisivel('agua_corporal_l', 'dexa')).toBe(false)
    expect(campoVisivel('gordura_visceral_indice', 'dexa')).toBe(false)
    expect(campoVisivel('idade_corporal', 'dexa')).toBe(false)
  })

  it('balança mostra o bloco mínimo', () => {
    expect(campoVisivel('peso_kg', 'balanca')).toBe(true)
    expect(campoVisivel('massa_gorda_kg', 'balanca')).toBe(false)
    expect(campoVisivel('perimetro_quadril_cm', 'balanca')).toBe(false)
  })
})

// ===========================================================================
// CA2 / CA6 — banner com a conta explícita
// ===========================================================================
describe('CA2/CA6 · divergência aritmética com conta explícita', () => {
  const seedB: ComposicaoDados = {
    metodo: 'bia',
    data_exame: '2026-10-11',
    peso_kg: 82.15,
    altura_cm: 178,
    massa_gorda_kg: 21.0,
    massa_magra_kg: 58.0,
  }

  it('bloqueia e MOSTRA A CONTA', () => {
    const r = validar(seedB)
    const msg = r.bloqueios.join(' ')
    expect(msg).toContain('21,00 + 58,00 = 79,00')
    expect(msg).toContain('82,15')
    expect(msg).toMatch(/3,[89]/)
    expect(msg).toContain('±2%')
  })

  it('passa quando a soma bate com o peso', () => {
    expect(validar({ ...seedB, massa_gorda_kg: 24.15 }).bloqueios).toHaveLength(0)
  })

  it('bloqueia sem método', () => {
    expect(validar({ ...seedB, metodo: '' }).bloqueios.some((b) => b.includes('Método'))).toBe(true)
  })

  it('bloqueia data futura', () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const r = validar({
      ...seedB,
      data_exame: amanha.toISOString().slice(0, 10),
      massa_gorda_kg: 24.15,
    })
    expect(r.bloqueios.some((b) => b.includes('futura'))).toBe(true)
  })

  it('bloqueia altura variando > 2 cm sem confirmação', () => {
    const r = validar(
      { ...seedB, massa_gorda_kg: 24.15, altura_cm: 180 },
      { ...seedB, altura_cm: 176 },
    )
    expect(r.bloqueios.some((b) => b.includes('Altura varia'))).toBe(true)
  })

  it('libera altura divergente quando confirmada', () => {
    const r = validar(
      { ...seedB, massa_gorda_kg: 24.15, altura_cm: 180, divergencia_altura_confirmada: true },
      { ...seedB, altura_cm: 176 },
    )
    expect(r.bloqueios.some((b) => b.includes('Altura varia'))).toBe(false)
  })

  it('bloqueia troca de método sem confirmar nova série', () => {
    const r = validar({ ...seedB, metodo: 'dexa', massa_gorda_kg: 24.15 }, { ...seedB })
    expect(r.bloqueios.some((b) => b.includes('NOVA SÉRIE'))).toBe(true)
  })

  it('DEXA: bloqueia soma regional divergente do total', () => {
    const r = validar({
      metodo: 'dexa',
      data_exame: '2026-10-11',
      peso_kg: 82,
      massa_gorda_kg: 20,
      massa_magra_kg: 62,
      segmentos: [
        { regiao: 'braco_direito', massa_gorda_g: 1000, massa_magra_g: 3000 },
        { regiao: 'braco_esquerdo', massa_gorda_g: 1000, massa_magra_g: 3000 },
        { regiao: 'tronco', massa_gorda_g: 8000, massa_magra_g: 25000 },
        { regiao: 'perna_direita', massa_gorda_g: 2000, massa_magra_g: 10000 },
        { regiao: 'perna_esquerda', massa_gorda_g: 2000, massa_magra_g: 10000 },
      ],
    })
    expect(r.bloqueios.some((b) => b.includes('gordura regional'))).toBe(true)
  })
})

describe('advertências', () => {
  it('V-fat ≥ 100 gera advertência crítica', () => {
    const r = validar({
      metodo: 'dexa',
      data_exame: '2026-10-11',
      peso_kg: 82,
      massa_gorda_kg: 20,
      massa_magra_kg: 62,
      gordura_visceral_area_cm2: 110,
    })
    expect(r.advertencias.some((a) => a.includes('crítica'))).toBe(true)
  })

  it('A/G ≥ 1,0 gera advertência central', () => {
    const r = validar({ metodo: 'dexa', data_exame: '2026-10-11', razao_android_gynoid: 1.05 })
    expect(r.advertencias.some((a) => a.includes('central'))).toBe(true)
  })

  it('BIA + treinou_24h rebaixa confiabilidade', () => {
    const r = validar({ metodo: 'bia', data_exame: '2026-10-11', treinou_24h: true })
    expect(r.confiabilidade).toBe('baixa')
  })

  it('BIA + jejum < 2h rebaixa confiabilidade', () => {
    expect(
      validar({ metodo: 'bia', data_exame: '2026-10-11', jejum_horas: 1 }).confiabilidade,
    ).toBe('baixa')
  })
})

describe('cálculos', () => {
  it('IMC', () => expect(calcIMC(82.15, 178)).toBeCloseTo(25.93, 1))
  it('RCQ', () => expect(calcRCQ(94, 101)).toBeCloseTo(0.931, 2))
  it('TMB Cunningham', () => expect(calcTMB({ massaMagraKg: 58 })).toBe(1776))
  it('TMB Mifflin', () => {
    const v = calcTMB({ pesoKg: 82, alturaCm: 178, idade: 45, sexo: 'M' })
    expect(v).toBeGreaterThan(1600)
    expect(v).toBeLessThan(1800)
  })
})

// ===========================================================================
// OCR — dicionário fixo
// ===========================================================================
describe('OCR · dicionário fixo de rótulos', () => {
  it('tem exatamente 16 rótulos', () => {
    expect(DICIONARIO_OCR).toHaveLength(16)
  })

  it('mapeia conhecidos e ignora previstos', () => {
    const { linhas, resumo } = conciliarOcr([
      { rotulo: 'Weight(Kg)', valor: '82,15' },
      { rotulo: 'BMI', valor: '27,1' },
      { rotulo: 'V-fat', valor: '14,5' },
      { rotulo: 'Body age', valor: '45' },
    ])
    expect(linhas.find((l) => l.rotulo === 'Weight(Kg)')?.status).toBe('confirmado')
    expect(linhas.find((l) => l.rotulo === 'BMI')?.status).toBe('ignorado')
    expect(resumo.confirmados).toBe(3)
    expect(resumo.ignorados).toBe(1)
  })

  it('Muscle weight vai para REVISÃO', () => {
    const { linhas } = conciliarOcr([{ rotulo: 'Muscle weight(Kg)', valor: '58,0' }])
    expect(linhas[0].status).toBe('revisar')
    expect(linhas[0].campo).toBe('massa_magra_kg')
  })

  it('rótulo desconhecido vai para revisão, nunca adivinhado', () => {
    const { linhas } = conciliarOcr([{ rotulo: 'Foo Bar', valor: '1' }])
    expect(linhas[0].status).toBe('revisar')
    expect(linhas[0].campo).toBeNull()
  })

  it('V-fat NUNCA vira cm² nem kg', () => {
    expect(conciliarOcr([{ rotulo: 'V-fat', valor: '14,5' }]).linhas[0].campo).toBe(
      'gordura_visceral_indice',
    )
  })

  it('detecta assinatura BIA', () => {
    expect(detectarMetodo(['Body age', 'V-fat', 'Protein(%)', 'Metabolism(kcal/day)'])).toBe('bia')
  })

  it('detecta assinatura DEXA', () => {
    expect(detectarMetodo(['T-score', 'Z-score', 'BMC'])).toBe('dexa')
  })

  it('sem assinatura devolve null', () => {
    expect(detectarMetodo(['Weight(Kg)'])).toBeNull()
  })

  it('dedupe combina arquivo + owner + data + hora + método', () => {
    const base = {
      hashArquivo: 'abc',
      ownerId: 'u1',
      dataExame: '2026-10-11',
      horaExame: '05:27',
      metodo: 'bia',
    }
    expect(chaveDedupe(base)).toBe(chaveDedupe({ ...base }))
    expect(chaveDedupe(base)).not.toBe(chaveDedupe({ ...base, ownerId: 'u2' }))
  })
})

// ===========================================================================
// CA9 — nenhuma string do protocolo no payload genérico
// ===========================================================================
describe('CA9 · parecer genérico sem vazamento do protocolo', () => {
  const protocolo = {
    protocolo_farmacologico: 'trembolona 200 mg, testosterona 375 mg/semana',
    baseline_laboratorial: 'HDL 18, Hematócrito 49',
    gatilhos_especificos: 'monitorar HDL, glycoxil',
  }
  const generico = {
    objetivo_principal: 'emagrecer',
    nivel_atividade: 'moderado',
    medicacoes_em_uso: 'losartana',
    condicoes_preexistentes: 'hipertensão',
    idade: '52',
    sexo_biologico: 'F',
  }

  it('variante do titular inclui o protocolo', () => {
    const p = montarPayload({
      variante: 'protocolo_alta_performance',
      persona: 'medicina_esportiva',
      contextoProtocolo: protocolo,
    })
    expect(p.prompt).toContain('trembolona')
  })

  it('variante genérica NÃO contém nenhuma string proibida', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'nutrologo',
      contextoGenerico: generico,
    })
    expect(payloadGenericoVazou(p)).toEqual([])
    for (const s of STRINGS_PROIBIDAS_GENERICO) {
      expect(p.prompt.toLowerCase()).not.toContain(s.toLowerCase())
    }
  })

  it('injeção por campo extra é DESCARTADA', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'fisiologia',
      contextoGenerico: {
        ...generico,
        protocolo_farmacologico: 'trembolona',
        baseline_laboratorial: 'HDL 18',
      } as any,
    })
    expect(p.contexto.protocolo_farmacologico).toBeUndefined()
    expect(payloadGenericoVazou(p)).toEqual([])
  })

  it('só 6 campos sobrevivem no contexto genérico', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'nutrologo',
      contextoGenerico: { ...generico, extra1: 'x', extra2: 'y' } as any,
    })
    expect(Object.keys(p.contexto).sort()).toEqual([
      'condicoes_preexistentes',
      'idade',
      'medicacoes_em_uso',
      'nivel_atividade',
      'objetivo_principal',
      'sexo_biologico',
    ])
  })

  it('contexto genérico exige os 6 campos', () => {
    expect(contextoGenericoCompleto(generico)).toBe(true)
    expect(contextoGenericoCompleto({ objetivo_principal: 'x' })).toBe(false)
  })

  it('temperatura é 0.2', () => {
    expect(
      montarPayload({ variante: 'generico', persona: 'nutrologo', contextoGenerico: generico })
        .temperatura,
    ).toBe(0.2)
  })
})

// ===========================================================================
// CA4 — prescrição calórica bloqueada sem DEXA
// ===========================================================================
describe('CA4 · prescrição calórica bloqueada sem DEXA', () => {
  const p = montarPayload({ variante: 'generico', persona: 'nutrologo', contextoGenerico: {} })

  it('bloqueia com método BIA', () => {
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Composição por bioimpedância. Recomendo 2200 kcal por dia.',
      numerosDoPayload: [],
      pontosDaSerie: 5,
      metodoComposicao: 'bia',
    })
    expect(v.some((x) => x.includes('prescrição calórica'))).toBe(true)
  })

  it('permite com DEXA', () => {
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Composição por DEXA. Recomendo 2200 kcal por dia.',
      numerosDoPayload: ['2200'],
      pontosDaSerie: 5,
      metodoComposicao: 'dexa',
    })
    expect(v.filter((x) => x.includes('prescrição calórica'))).toHaveLength(0)
  })

  it('bloqueia tendência com menos de 3 pontos', () => {
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Há tendência consistente de queda.',
      numerosDoPayload: [],
      pontosDaSerie: 2,
    })
    expect(v.some((x) => x.includes('tendência'))).toBe(true)
  })

  it('bloqueia número inventado', () => {
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Seu percentual de gordura caiu para 18,4%.',
      numerosDoPayload: ['25.6'],
      pontosDaSerie: 5,
    })
    expect(v.some((x) => x.includes('não consta'))).toBe(true)
  })

  it('regra determinística reconhece só DEXA', () => {
    expect(prescricaoCaloricaPermitida('dexa')).toBe(true)
    expect(prescricaoCaloricaPermitida('bia')).toBe(false)
    expect(prescricaoCaloricaPermitida('')).toBe(false)
  })
})
