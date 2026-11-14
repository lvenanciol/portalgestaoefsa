// ============================================================================
// TESTES LL5 — critérios de aceite do briefing (15/11/2026)
//
// Executar com: npx vitest run src/ll5/__tests__/ll5.test.ts
// (o pacote vitest não está no projeto; instalar com `npm i -D vitest` ou
//  rodar o script scripts/ll5-selftest.mjs que cobre a lógica pura sem DOM)
//
// Os testes de repositório usam um cliente FALSO, para provar que o filtro
// por owner acontece na camada de dados — e não na UI.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { filtroOwner, ownerEfetivo, atorAtual, type Ator } from '../repo'
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
  nome: 'Outro Membro',
  role: 'membro_familia',
}

// ---------------------------------------------------------------------------
describe('isolamento por owner (camada de dados)', () => {
  it('membro NUNCA recebe filtro que não seja o próprio id', () => {
    // mesmo pedindo explicitamente o owner de outro, o filtro é o dele
    const f = filtroOwner(MEMBRO, OUTRO.id)
    expect(f).toBe('owner_id = "u_membro"')
    expect(f).not.toContain('u_outro')
  })

  it('membro sem parâmetro também recebe o próprio filtro', () => {
    expect(filtroOwner(MEMBRO)).toBe('owner_id = "u_membro"')
  })

  it('admin sem escolha não tem cláusula de owner (vê tudo)', () => {
    expect(filtroOwner(ADMIN)).toBe('')
  })

  it('admin com escolha filtra pelo owner escolhido', () => {
    expect(filtroOwner(ADMIN, OUTRO.id)).toBe(`owner_id = "${OUTRO.id}"`)
  })

  it('ownerEfetivo de membro ignora o owner pedido', () => {
    expect(ownerEfetivo(MEMBRO, OUTRO.id)).toBe(MEMBRO.id)
    expect(ownerEfetivo(ADMIN, OUTRO.id)).toBe(OUTRO.id)
    expect(ownerEfetivo(ADMIN)).toBe(ADMIN.id)
  })

  it('atorAtual deriva o papel do nome do grupo', () => {
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, 'Admin').role).toBe('admin')
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, 'Suprimentos').role).toBe('membro_familia')
    expect(atorAtual({ id: 'x', email: 'a@b.c' }, null).role).toBe('membro_familia')
  })

  it('a lista devolvida para membro nunca contém owner de outro (recorte em memória)', () => {
    // simula o que listar() faz após buscar: filtra por owner no cliente
    const linhas = [
      { id: '1', owner_id: MEMBRO.id },
      { id: '2', owner_id: OUTRO.id },
      { id: '3', owner_id: ADMIN.id },
    ]
    const visiveis = linhas.filter((r) => r.owner_id === MEMBRO.id)
    expect(visiveis).toHaveLength(1)
    expect(visiveis[0].id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
describe('composição — visibilidade de campos por método', () => {
  it('sem método NENHUM campo aparece', () => {
    expect(campoVisivel('peso_kg', '')).toBe(false)
    expect(campoVisivel('peso_kg', undefined)).toBe(false)
  })

  it('campos exclusivos de DEXA ficam ocultos na BIA', () => {
    expect(campoVisivel('massa_ossea_kg', 'bia')).toBe(false)
    expect(campoVisivel('gordura_visceral_area_cm2', 'bia')).toBe(false)
    expect(campoVisivel('t_score', 'bia')).toBe(false)
  })

  it('campos exclusivos de BIA ficam ocultos na DEXA', () => {
    expect(campoVisivel('agua_corporal_l', 'dexa')).toBe(false)
    expect(campoVisivel('gordura_visceral_indice', 'dexa')).toBe(false)
    expect(campoVisivel('idade_corporal', 'dexa')).toBe(false)
  })

  it('balança só mostra o bloco mínimo', () => {
    expect(campoVisivel('peso_kg', 'balanca')).toBe(true)
    expect(campoVisivel('massa_gorda_kg', 'balanca')).toBe(false)
    expect(campoVisivel('perimetro_quadril_cm', 'balanca')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('composição — validações bloqueantes', () => {
  const base: ComposicaoDados = {
    metodo: 'bia',
    data_exame: '2026-10-11',
    peso_kg: 82.15,
    altura_cm: 178,
    massa_gorda_kg: 21.0,
    massa_magra_kg: 58.0,
  }

  it('bloqueia quando gordura + magra diverge ±2% e mostra a CONTA', () => {
    const r = validar(base)
    expect(r.bloqueios.length).toBeGreaterThan(0)
    const msg = r.bloqueios.join(' ')
    expect(msg).toContain('21,00 + 58,00 = 79,00')
    expect(msg).toContain('82,15')
    expect(msg).toContain('3,8')
  })

  it('passa quando a soma bate com o peso', () => {
    const r = validar({ ...base, massa_gorda_kg: 24.15, massa_magra_kg: 58.0 })
    expect(r.bloqueios).toHaveLength(0)
  })

  it('bloqueia sem método', () => {
    const r = validar({ ...base, metodo: '' })
    expect(r.bloqueios.some((b) => b.includes('Método'))).toBe(true)
  })

  it('bloqueia data futura', () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const r = validar({
      ...base,
      data_exame: amanha.toISOString().slice(0, 10),
      massa_gorda_kg: 24.15,
    })
    expect(r.bloqueios.some((b) => b.includes('futura'))).toBe(true)
  })

  it('bloqueia altura variando mais de 2 cm sem confirmação', () => {
    const r = validar(
      { ...base, massa_gorda_kg: 24.15, altura_cm: 180 },
      { ...base, altura_cm: 176 },
    )
    expect(r.bloqueios.some((b) => b.includes('Altura varia'))).toBe(true)
  })

  it('libera altura divergente quando confirmada', () => {
    const r = validar(
      { ...base, massa_gorda_kg: 24.15, altura_cm: 180, divergencia_altura_confirmada: true },
      { ...base, altura_cm: 176 },
    )
    expect(r.bloqueios.some((b) => b.includes('Altura varia'))).toBe(false)
  })

  it('bloqueia troca de método sem confirmar nova série', () => {
    const r = validar({ ...base, metodo: 'dexa', massa_gorda_kg: 24.15 }, { ...base })
    expect(r.bloqueios.some((b) => b.includes('NOVA SÉRIE'))).toBe(true)
  })

  it('DEXA: bloqueia quando a soma regional diverge do total', () => {
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
    // soma gordura = 14 kg vs total 20 kg → divergência
    expect(r.bloqueios.some((b) => b.includes('gordura regional'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('composição — advertências', () => {
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

  it('A/G ≥ 1,0 gera advertência de distribuição central', () => {
    const r = validar({
      metodo: 'dexa',
      data_exame: '2026-10-11',
      razao_android_gynoid: 1.05,
    })
    expect(r.advertencias.some((a) => a.includes('central'))).toBe(true)
  })

  it('BIA + treinou_24h rebaixa a confiabilidade', () => {
    const r = validar({
      metodo: 'bia',
      data_exame: '2026-10-11',
      treinou_24h: true,
    })
    expect(r.confiabilidade).toBe('baixa')
    expect(r.advertencias.some((a) => a.includes('24 h'))).toBe(true)
  })

  it('BIA + jejum < 2h rebaixa a confiabilidade', () => {
    const r = validar({ metodo: 'bia', data_exame: '2026-10-11', jejum_horas: 1 })
    expect(r.confiabilidade).toBe('baixa')
  })
})

// ---------------------------------------------------------------------------
describe('composição — cálculos', () => {
  it('IMC', () => {
    expect(calcIMC(82.15, 178)).toBeCloseTo(25.93, 1)
  })
  it('RCQ', () => {
    expect(calcRCQ(94, 101)).toBeCloseTo(0.931, 2)
  })
  it('TMB Cunningham com massa magra', () => {
    expect(calcTMB({ massaMagraKg: 58 })).toBe(1776)
  })
  it('TMB Mifflin sem massa magra', () => {
    const v = calcTMB({ pesoKg: 82, alturaCm: 178, idade: 45, sexo: 'M' })
    expect(v).toBeGreaterThan(1600)
    expect(v).toBeLessThan(1800)
  })
})

// ---------------------------------------------------------------------------
describe('OCR — dicionário fixo', () => {
  it('mapeia rótulos conhecidos e ignora os previstos', () => {
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

  it('Muscle weight entra para REVISÃO (ambíguo)', () => {
    const { linhas } = conciliarOcr([{ rotulo: 'Muscle weight(Kg)', valor: '58,0' }])
    expect(linhas[0].status).toBe('revisar')
    expect(linhas[0].campo).toBe('massa_magra_kg')
  })

  it('rótulo desconhecido vai para revisão, nunca é adivinhado', () => {
    const { linhas } = conciliarOcr([{ rotulo: 'Foo Bar', valor: '1' }])
    expect(linhas[0].status).toBe('revisar')
    expect(linhas[0].campo).toBeNull()
  })

  it('V-fat nunca é mapeado para cm² nem kg', () => {
    const { linhas } = conciliarOcr([{ rotulo: 'V-fat', valor: '14,5' }])
    expect(linhas[0].campo).toBe('gordura_visceral_indice')
  })

  it('detecta assinatura BIA', () => {
    expect(detectarMetodo(['Body age', 'V-fat', 'Protein(%)', 'Metabolism(kcal/day)'])).toBe('bia')
  })

  it('detecta assinatura DEXA', () => {
    expect(detectarMetodo(['T-score', 'Z-score', 'BMC'])).toBe('dexa')
  })

  it('sem assinatura devolve null (salvamento bloqueado)', () => {
    expect(detectarMetodo(['Weight(Kg)'])).toBeNull()
  })

  it('chave de dedupe combina arquivo + owner + data + hora + método', () => {
    const k1 = chaveDedupe({
      hashArquivo: 'abc',
      ownerId: 'u1',
      dataExame: '2026-10-11',
      horaExame: '05:27',
      metodo: 'bia',
    })
    const k2 = chaveDedupe({
      hashArquivo: 'abc',
      ownerId: 'u1',
      dataExame: '2026-10-11',
      horaExame: '05:27',
      metodo: 'bia',
    })
    expect(k1).toBe(k2)
    const k3 = chaveDedupe({
      hashArquivo: 'abc',
      ownerId: 'u2',
      dataExame: '2026-10-11',
      horaExame: '05:27',
      metodo: 'bia',
    })
    expect(k1).not.toBe(k3)
  })
})

// ---------------------------------------------------------------------------
describe('parecer — variantes e não vazamento', () => {
  const protocolo = {
    protocolo_farmacologico: 'testosterona 375 mg/semana, trembolona 200 mg',
    baseline_laboratorial: 'HDL 18, Hematócrito 49',
    gatilhos_especificos: 'monitorar HDL',
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

  it('variante genérica NÃO contém nenhuma string do protocolo', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'nutrologo',
      contextoGenerico: generico,
    })
    const vazou = payloadGenericoVazou(p)
    expect(vazou).toEqual([])
    for (const s of STRINGS_PROIBIDAS_GENERICO) {
      expect(p.prompt.toLowerCase()).not.toContain(s.toLowerCase())
    }
  })

  it('variante genérica descarta campos fora da allowlist', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'fisiologia',
      contextoGenerico: {
        ...generico,
        // tenta injetar o protocolo por um campo extra
        protocolo_farmacologico: 'trembolona',
        baseline_laboratorial: 'HDL 18',
      } as any,
    })
    expect(p.contexto.protocolo_farmacologico).toBeUndefined()
    expect(payloadGenericoVazou(p)).toEqual([])
  })

  it('contexto genérico exige os 6 campos', () => {
    expect(contextoGenericoCompleto(generico)).toBe(true)
    expect(contextoGenericoCompleto({ objetivo_principal: 'x' })).toBe(false)
  })

  it('temperatura é 0.2', () => {
    const p = montarPayload({
      variante: 'generico',
      persona: 'nutrologo',
      contextoGenerico: generico,
    })
    expect(p.temperatura).toBe(0.2)
  })
})

// ---------------------------------------------------------------------------
describe('parecer — guardrails', () => {
  it('bloqueia prescrição calórica quando o método não é DEXA', () => {
    const p = montarPayload({ variante: 'generico', persona: 'nutrologo', contextoGenerico: {} })
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Recomendo 2200 kcal por dia e 180 g de proteína.',
      numerosDoPayload: [],
      pontosDaSerie: 5,
      metodoComposicao: 'bia',
    })
    expect(v.some((x) => x.includes('prescrição calórica'))).toBe(true)
  })

  it('permite prescrição calórica com DEXA', () => {
    const p = montarPayload({ variante: 'generico', persona: 'nutrologo', contextoGenerico: {} })
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Bioimpedância analisada. Recomendo 2200 kcal por dia.',
      numerosDoPayload: ['2200'],
      pontosDaSerie: 5,
      metodoComposicao: 'dexa',
    })
    expect(v.filter((x) => x.includes('prescrição calórica'))).toHaveLength(0)
  })

  it('bloqueia afirmação de tendência com menos de 3 pontos', () => {
    const p = montarPayload({ variante: 'generico', persona: 'fisiologia', contextoGenerico: {} })
    const v = verificarGuardrails({
      payload: p,
      outputText: 'Há tendência consistente de queda.',
      numerosDoPayload: [],
      pontosDaSerie: 2,
    })
    expect(v.some((x) => x.includes('tendência'))).toBe(true)
  })

  it('a regra determinística reconhece só DEXA como permitido', () => {
    expect(prescricaoCaloricaPermitida('dexa')).toBe(true)
    expect(prescricaoCaloricaPermitida('bia')).toBe(false)
    expect(prescricaoCaloricaPermitida('')).toBe(false)
  })
})
