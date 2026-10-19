// Fechamento de gaps (verificação 19/10) — IA nos botões de Atas e Documentos:
// (1) Resumo de ATA: POST /backend/v1/ia/resumo-ata { ata_id } → resumo executivo
// gravado em atas.resumo + ia_pareceres + auditoria.
// (2) Ambos usam o texto já persistido (ata: pauta/decisões/action_items).

routerAdd(
  'POST',
  '/backend/v1/ia/resumo-ata',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const ataId = String(body.ata_id || '')
    const promptExtra = String(body.prompt_extra || '').trim()
    if (!ataId) return e.badRequestError('ata_id é obrigatório')

    let ata
    try {
      ata = $app.findRecordById('atas', ataId)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Ata não encontrada.' })
    }

    const contexto =
      'Título: ' +
      ata.getString('titulo') +
      '\nData: ' +
      ata.getString('data') +
      '\nModalidade: ' +
      ata.getString('modalidade') +
      '\nParticipantes: ' +
      ata.getString('participantes') +
      '\nPauta: ' +
      ata.getString('pauta') +
      '\nDecisões: ' +
      ata.getString('decisoes') +
      '\nAction items: ' +
      ata.getString('action_items')

    const sys =
      'Você é analista sênior do grupo Extrafruti (Extrafruti, Casafruti, FoldBox). ' +
      'Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem cercas), com as chaves: ' +
      'sumario_executivo (string, até 5 linhas), principais_achados (array de strings), riscos_alertas (array de strings), ' +
      'recomendacoes (array de strings, priorizadas), score_saude (numero 0-10), disclaimer (string). ' +
      'Português do Brasil, objetivo. Não invente informação: use apenas o conteúdo da ata.'

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content:
            'Ata:\n' +
            contexto +
            '\n\nTarefa: ' +
            (promptExtra ||
              'resuma em 5 linhas executivas: decisões, responsáveis, prazos e pendências críticas.'),
        },
      ],
    })
    const texto =
      r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
    if (!texto) return e.json(502, { ok: false, erro: 'IA não retornou conteúdo.' })

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
      estrutura = {
        sumario_executivo: texto,
        principais_achados: [],
        riscos_alertas: [],
        recomendacoes: [],
        score_saude: null,
        disclaimer: 'Análise assistida — não substitui contador/auditor.',
      }
    }

    // grava resumo na ata (campo resumo = sumário executivo)
    try {
      ata.set('resumo', String(estrutura.sumario_executivo || '').slice(0, 4000))
      $app.save(ata)
    } catch (_) {}

    // histórico
    let parecerId = ''
    try {
      const col = $app.findCollectionByNameOrId('ia_pareceres')
      const rec = new Record(col)
      rec.set('modulo', 'atas')
      rec.set('ref', ata.getString('titulo'))
      rec.set('prompt', 'Resumo executivo da ata')
      rec.set('contexto', contexto.slice(0, 12000))
      rec.set('resultado', JSON.stringify(estrutura))
      rec.set('status', 'rascunho')
      rec.set('observacao', '')
      rec.set('criado_por', auth.getString('email'))
      rec.set('modelo', 'fast')
      $app.save(rec)
      parecerId = rec.id
    } catch (_) {}

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'ia_resumo_ata', 'atas', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'resumo IA: ' + ata.getString('titulo'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, parecer_id: parecerId, estrutura: estrutura })
  },
  $apis.requireAuth(),
)
