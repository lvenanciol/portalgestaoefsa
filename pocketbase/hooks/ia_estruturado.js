// Fase 9 (prompt-mestre) — IA Gemini Flash: saída ESTRUTURADA em JSON
// (sumário, achados, riscos, recomendações, score, disclaimer) + histórico
// de pareceres (versão, status rascunho/revisado/aprovado, observação do
// revisor, comparação lado a lado) + auditoria com prompt e contexto.
// Chave gerenciada pelo gateway $ai da Skip (alias fast = gemini-2.5-flash).

routerAdd(
  'POST',
  '/backend/v1/ia/estruturado',
  (e) => {
    const body = e.requestInfo().body || {}
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const prompt = String(body.prompt || '').slice(0, 8000)
    if (!prompt) return e.badRequestError('prompt é obrigatório')
    const contexto = String(body.contexto || '').slice(0, 12000)
    const modulo = String(body.modulo || 'geral').slice(0, 60)
    const ref = String(body.ref || '').slice(0, 60)

    const sys =
      'Você é analista sênior do grupo Extrafruti (Extrafruti, Casafruti, FoldBox — alimentos frescos, embalagens logísticas, varejo alimentar). ' +
      'Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem cercas), com as chaves: ' +
      'sumario_executivo (string), principais_achados (array de strings), riscos_alertas (array de strings), ' +
      'recomendacoes (array de strings, priorizadas), score_saude (numero 0-10), disclaimer (string). ' +
      'Português do Brasil, objetivo. Não invente números: se o contexto não trouxer dado, aponte a lacuna nos achados.'

    const userMsg =
      (contexto ? 'Contexto (dados do portal):\n' + contexto + '\n\n' : '') + 'Tarefa: ' + prompt

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userMsg },
      ],
    })
    const texto =
      r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
    if (!texto) return e.json(502, { ok: false, erro: 'IA não retornou conteúdo.' })

    // parse tolerante (tira cercas markdown se vierem)
    let limpo = texto.trim()
    if (limpo.startsWith('```')) {
      limpo = limpo
        .replace(/^```(json)?/, '')
        .replace(/```$/, '')
        .trim()
    }
    let estrutura = null
    try {
      estrutura = JSON.parse(limpo)
    } catch (_) {
      // fallback: devolve como sumário único
      estrutura = {
        sumario_executivo: texto,
        principais_achados: [],
        riscos_alertas: [],
        recomendacoes: [],
        score_saude: null,
        disclaimer: 'Análise assistida — não substitui contador/auditor.',
      }
    }

    // histórico
    let parecerId = ''
    try {
      const col = $app.findCollectionByNameOrId('ia_pareceres')
      const rec = new Record(col)
      rec.set('modulo', modulo)
      rec.set('ref', ref)
      rec.set('prompt', prompt)
      rec.set('contexto', contexto)
      rec.set('resultado', JSON.stringify(estrutura))
      rec.set('status', 'rascunho')
      rec.set('observacao', '')
      rec.set('criado_por', auth.getString('email'))
      $app.save(rec)
      parecerId = rec.id
    } catch (_) {}

    // auditoria
    try {
      const aid = $security.randomString(15)
      const agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'ia_estruturado', {:mod}, {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          mod: modulo,
          det:
            'parecer IA gerado (' + String(estrutura.sumario_executivo || '').slice(0, 120) + ')',
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, parecer_id: parecerId, estrutura: estrutura })
  },
  $apis.requireAuth(),
)

// Atualiza status/observação do parecer (revisado/aprovado)
routerAdd(
  'PATCH',
  '/backend/v1/ia/pareceres/{id}',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const id = e.requestInfo().pathParams?.id || ''
    const body = e.requestInfo().body || {}
    const status = String(body.status || '')
    if (!['rascunho', 'revisado', 'aprovado'].includes(status)) {
      return e.badRequestError('status deve ser rascunho, revisado ou aprovado')
    }
    try {
      const rec = $app.findRecordById('ia_pareceres', id)
      rec.set('status', status)
      rec.set('observacao', String(body.observacao || '').slice(0, 2000))
      $app.save(rec)
      return e.json(200, { ok: true })
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Parecer não encontrado.' })
    }
  },
  $apis.requireAuth(),
)

// Lista histórico de pareceres
routerAdd(
  'GET',
  '/backend/v1/ia/pareceres',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const rows = $app.findRecordsByFilter('ia_pareceres', "id != ''", '-created', 100, 0)
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      out.push({
        id: r.id,
        modulo: r.getString('modulo'),
        ref: r.getString('ref'),
        prompt: r.getString('prompt'),
        resultado: r.getString('resultado'),
        status: r.getString('status'),
        observacao: r.getString('observacao'),
        criado_por: r.getString('criado_por'),
        created: r.getString('created'),
      })
    }
    return e.json(200, { ok: true, itens: out })
  },
  $apis.requireAuth(),
)
