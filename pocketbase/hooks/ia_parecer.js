// Fase 5 — IA Gemini Flash via gateway $ai (chave gerenciada pela Skip).
// Body: { prompt, contexto? } → texto gerado (análises financeiras).
routerAdd(
  'POST',
  '/backend/v1/ia/parecer',
  (e) => {
    const body = e.requestInfo().body || {}
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const prompt = String(body.prompt || '').slice(0, 8000)
    if (!prompt) return e.badRequestError('prompt é obrigatório')
    const contexto = String(body.contexto || '').slice(0, 12000)

    // TAREFA VAREJO (13/11): o perfil é escolhido pelo cliente via campo `perfil`
    // no body. O padrão continua sendo o analista financeiro (não quebrar as
    // outras telas que já usam este hook).
    const perfil = String(body.perfil || '').toLowerCase()
    const PERSONAS = {
      varejo:
        'Você é especialista em varejo de alimentos e gestão de negócios, com vivência em operação de loja, ' +
        'gestão de margem, ruptura, quebra e produtividade por metro quadrado. ' +
        'Avalie sempre com base no que os números mostram e nomeie a alavanca de negócio por trás de cada leitura ' +
        '(fluxo, conversão, ticket, mix, preço, perda). ' +
        'Responda em português do Brasil, em blocos curtos com títulos, sem jargão vazio. ' +
        'Não invente dado: quando faltar (CMV, quebra, fluxo de pessoas), diga que falta e por que importa.',
    }
    const sys =
      PERSONAS[perfil] ||
      'Você é analista financeiro sênior do grupo Extrafruti (Extrafruti, Casafruti, FoldBox — alimentos frescos, embalagens logísticas e varejo). ' +
        'Responda em português do Brasil, direto e objetivo, em até 3 parágrafos curtos, com números quando o contexto trouxer. ' +
        'Não invente dados: se o contexto não trouxer informação, diga o que falta.'
    const userMsg = contexto
      ? 'Contexto (dados do portal):\n' + contexto + '\n\nTarefa: ' + prompt
      : prompt

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userMsg },
      ],
    })
    const texto =
      r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
    if (!texto) {
      return e.json(502, { ok: false, erro: 'IA não retornou conteúdo.' })
    }
    return e.json(200, { ok: true, texto: texto })
  },
  $apis.requireAuth(),
)
