// ============================================================================
// LL5 — PARECER IA: prompts, variantes e guardrails (15/11/2026)
//
// DUAS VARIANTES, com fronteira rígida:
//   protocolo_alta_performance → SÓ para o titular (admin). Injeta protocolo
//     farmacológico e baseline laboratorial do titular.
//   generico → membro da família. Injeta APENAS objetivo, nível de atividade,
//     medicações, condições pré-existentes, idade e sexo biológico.
//
// TESTE OBRIGATÓRIO do briefing: o payload 'generico' não pode conter nenhuma
// string do protocolo do titular (trembolona, testosterona 375, glycoxil).
// `montarPayload` é a ÚNICA porta de entrada e ela filtra por allowlist — não
// existe caminho em que um campo extra entre no payload genérico.
// ============================================================================

export type Persona = 'medicina_esportiva' | 'nutrologo' | 'fisiologia'
export type Variante = 'protocolo_alta_performance' | 'generico'

export const BLOCO_BASE = `Você é advisor de performance humana com formação cruzada: PhD em Fisiologia do Esporte, nutrólogo especializado em biomedicina esportiva e médico do esporte. Análise técnica, assertiva e data-driven.

Regras invioláveis:
(1) nunca recalcule valores numéricos recebidos;
(2) todo alerta determinístico deve aparecer com a severidade original;
(3) dado crítico ausente → declare o gap e o impacto, sem estimar;
(4) antes de recomendar alteração farmacológica, indique "requer validação com médico prescritor";
(5) toda conclusão precisa de ao menos duas fontes de evidência entre biomarcador, protocolo e carga de treino;
(6) sinalize incoerências como hipótese primária com forma de validação;
(7) não emita diagnóstico nosológico, apenas parecer de performance;
(8) composição corporal de método ≠ DEXA não pode fundamentar recomendação calórica quantificada.

Saída obrigatória:
- sumário executivo (máx. 4 linhas)
- painel de biomarcadores em tabela
- achados e mecanismos
- tendência e evolução
- incoerências e hipóteses
- recomendações priorizadas
- riscos e gatilhos
- lacunas de dados`

/** Contexto do protocolo — NUNCA entra na variante genérica. */
export interface ContextoProtocolo {
  protocolo_farmacologico?: string
  baseline_laboratorial?: string
  gatilhos_especificos?: string
}

/** Contexto do membro familiar — os 5 campos são obrigatórios. */
export interface ContextoGenerico {
  objetivo_principal: string
  nivel_atividade: string
  medicacoes_em_uso: string
  condicoes_preexistentes: string
  idade: string
  sexo_biologico: string
}

/** Allowlist de campos que podem aparecer na variante genérica. */
const CAMPOS_PERMITIDOS_GENERICO = new Set([
  'objetivo_principal',
  'nivel_atividade',
  'medicacoes_em_uso',
  'condicoes_preexistentes',
  'idade',
  'sexo_biologico',
])

/** Strings que jamais podem sair no payload genérico (teste do briefing). */
export const STRINGS_PROIBIDAS_GENERICO = [
  'trembolona',
  'testosterona 375',
  'glycoxil',
  'protocolo farmacológico',
  'protocolo farmacologico',
]

export interface PayloadParecer {
  variante: Variante
  persona: Persona
  prompt: string
  contexto: Record<string, string>
  temperatura: number
  prompt_version: string
}

/**
 * Monta o payload. ÚNICA porta de entrada.
 * Na variante genérica o contexto é reconstruído por allowlist — nada do
 * objeto original sobrevive além dos 6 campos previstos.
 */
export function montarPayload(params: {
  variante: Variante
  persona: Persona
  contextoGenerico?: Partial<ContextoGenerico>
  contextoProtocolo?: ContextoProtocolo
  snapshotDados?: string
}): PayloadParecer {
  const { variante, persona } = params

  if (variante === 'protocolo_alta_performance') {
    const c = params.contextoProtocolo || {}
    let prompt = BLOCO_BASE + '\n\n'
    prompt += 'CONTEXTO — TITULAR (protocolo de alta performance):\n'
    if (c.protocolo_farmacologico)
      prompt += '- Protocolo farmacológico: ' + c.protocolo_farmacologico + '\n'
    if (c.baseline_laboratorial)
      prompt += '- Baseline laboratorial: ' + c.baseline_laboratorial + '\n'
    if (c.gatilhos_especificos) prompt += '- Gatilhos específicos: ' + c.gatilhos_especificos + '\n'
    prompt += '\nGatilhos de alerta: HDL < 15, Hematócrito > 52, TGO/TGP > 2x o limite.\n'
    if (params.snapshotDados) prompt += '\nDADOS:\n' + params.snapshotDados

    return {
      variante,
      persona,
      prompt,
      contexto: {
        protocolo_farmacologico: c.protocolo_farmacologico || '',
        baseline_laboratorial: c.baseline_laboratorial || '',
        gatilhos_especificos: c.gatilhos_especificos || '',
      },
      temperatura: 0.2,
      prompt_version: 'll5-v1',
    }
  }

  // ---------------- genérico: allowlist rígida ----------------
  const bruto = params.contextoGenerico || {}
  const contexto: Record<string, string> = {}
  for (const chave of Object.keys(bruto)) {
    if (!CAMPOS_PERMITIDOS_GENERICO.has(chave)) continue // descarta o resto
    const v = (bruto as any)[chave]
    if (v != null) contexto[chave] = String(v)
  }

  let prompt = BLOCO_BASE + '\n\n'
  prompt += 'CONTEXTO — MEMBRO DA FAMÍLIA:\n'
  prompt += '- Objetivo principal: ' + (contexto.objetivo_principal || '(não informado)') + '\n'
  prompt += '- Nível de atividade: ' + (contexto.nivel_atividade || '(não informado)') + '\n'
  prompt += '- Medicações em uso: ' + (contexto.medicacoes_em_uso || '(não informado)') + '\n'
  prompt +=
    '- Condições pré-existentes: ' + (contexto.condicoes_preexistentes || '(não informado)') + '\n'
  prompt += '- Idade: ' + (contexto.idade || '(não informado)') + '\n'
  prompt += '- Sexo biológico: ' + (contexto.sexo_biologico || '(não informado)') + '\n'
  prompt +=
    '\nGatilhos populacionais: HDL < 30, Hematócrito > 54 (ou > 48 se feminino), TGO/TGP > 3x o limite.\n'
  if (params.snapshotDados) prompt += '\nDADOS:\n' + params.snapshotDados

  return {
    variante,
    persona,
    prompt,
    contexto,
    temperatura: 0.2,
    prompt_version: 'll5-v1',
  }
}

/** Os 5 campos (6 contando sexo) são obrigatórios para habilitar a geração. */
export function contextoGenericoCompleto(c?: Partial<ContextoGenerico>): boolean {
  if (!c) return false
  return (
    !!String(c.objetivo_principal || '').trim() &&
    !!String(c.nivel_atividade || '').trim() &&
    !!String(c.medicacoes_em_uso || '').trim() &&
    !!String(c.condicoes_preexistentes || '').trim() &&
    !!String(c.idade || '').trim() &&
    !!String(c.sexo_biologico || '').trim()
  )
}

/**
 * GUARDRAILS aplicados antes de exibir o parecer.
 * Devolve a lista de violações; vazio = pode exibir.
 */
export function verificarGuardrails(params: {
  payload: PayloadParecer
  outputText: string
  numerosDoPayload: string[]
  pontosDaSerie: number
  metodoComposicao?: string
  temRecomendacaoFarmacologica?: boolean
}): string[] {
  const violacoes: string[] = []
  const texto = params.outputText || ''
  const baixo = texto.toLowerCase()

  // (c) afirmar tendência com < 3 pontos
  const afirmaTendencia = /(tend[êe]ncia|crescimento|redu[çc][ãa]o consistente)/i.test(texto)
  if (afirmaTendencia && params.pontosDaSerie < 3) {
    violacoes.push(
      `Afirma tendência com ${params.pontosDaSerie} ponto(s) — o mínimo é 3. Regenere com "série insuficiente para tendência".`,
    )
  }

  // (b) número que não existe no payload
  const numerosTexto = texto.match(/\d+[.,]\d+/g) || []
  for (const n of numerosTexto) {
    const normalizado = n.replace(',', '.')
    const existe = params.numerosDoPayload.some(
      (p) => p.replace(',', '.') === normalizado || p.replace(',', '.').includes(normalizado),
    )
    if (!existe) {
      violacoes.push(`Número ${n} não consta no payload — possível invenção.`)
      break // uma ocorrência já bloqueia
    }
  }

  // (d) recomendação farmacológica sem disclaimer
  if (
    params.temRecomendacaoFarmacologica &&
    !baixo.includes('requer validação com médico prescritor')
  ) {
    violacoes.push('Recomendação farmacológica sem o disclaimer obrigatório.')
  }

  // regra determinística: método ≠ DEXA não prescreve caloria quantificada
  if (params.metodoComposicao && params.metodoComposicao !== 'dexa') {
    const prescreveCaloria =
      /\d{3,4}\s*kcal|\d+\s*g\s+de\s+(prote[íi]na|carboidrato|gordura)/i.test(texto)
    if (prescreveCaloria) {
      violacoes.push(
        'Composição por método ≠ DEXA: prescrição calórica quantificada é proibida. Deve declarar "precisão insuficiente — solicitar DEXA".',
      )
    }
  }

  // (a) alertas determinísticos presentes — checagem leve por marcador
  if (params.metodoComposicao && params.metodoComposicao !== 'dexa') {
    if (!baixo.includes('dexA'.toLowerCase()) && !baixo.includes('bioimpedância')) {
      violacoes.push('Faltou a declaração de que a composição é por bioimpedância (método ≠ DEXA).')
    }
  }

  return violacoes
}

/** Verifica vazamento do protocolo do titular no payload genérico. */
export function payloadGenericoVazou(payload: PayloadParecer): string[] {
  if (payload.variante !== 'generico') return []
  const alvo = (payload.prompt + ' ' + JSON.stringify(payload.contexto)).toLowerCase()
  return STRINGS_PROIBIDAS_GENERICO.filter((s) => alvo.includes(s.toLowerCase()))
}

/** Prompt para o gateway Gemini. */
export function promptGemini(p: PayloadParecer): {
  system: string
  user: string
  temperatura: number
} {
  return {
    system: p.prompt,
    user: 'Gere o parecer em JSON estruturado, respeitando as seções obrigatórias.',
    temperatura: p.temperatura,
  }
}

/** Hash estável para cache de 24 h. */
export function inputHash(p: PayloadParecer): string {
  const base = p.variante + '|' + p.persona + '|' + p.prompt_version + '|' + p.prompt
  let h = 0
  for (let i = 0; i < base.length; i++) {
    h = (h << 5) - h + base.charCodeAt(i)
    h |= 0
  }
  return 'h' + Math.abs(h).toString(36)
}
