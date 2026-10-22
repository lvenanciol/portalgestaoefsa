// Fechamento de gaps (19/10) + TX-b (22/10): resumo de ATA via IA.
// v2: aceita PAYLOAD DIRETO (transcricao/pauta/resumo/decisoes/participantes)
// para gerar resumo ANTES de salvar a ata (botão "Gerar com IA" no dialog) —
// e mantém o modo ata_id para atas já salvas. Retorna resumo + decisoes +
// action_items sugeridos; o front preenche os campos (TX-b).

routerAdd(
  'POST',
  '/backend/v1/ia/resumo-ata',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const ataId = String(body.ata_id || '')
    const promptExtra = String(body.prompt_extra || '').trim()
    // payload direto (TX-b)
    const transcricao = String(body.transcricao || '').trim()
    const pauta = String(body.pauta || '').trim()
    const resumoAtual = String(body.resumo || '').trim()
    const decisoes = String(body.decisoes || '').trim()
    const participantes = String(body.participantes || '').trim()

    let contexto = ''
    let tituloRef = ''
    if (ataId) {
      let ata
      try {
        ata = $app.findRecordById('atas', ataId)
      } catch (_) {
        return e.json(404, { ok: false, erro: 'Ata não encontrada.' })
      }
      tituloRef = ata.getString('titulo')
      contexto =
        'Título: ' +
        tituloRef +
        '\nData: ' +
        ata.getString('data') +
        '\nModalidade: ' +
        ata.getString('modalidade') +
        '\nParticipantes: ' +
        ata.getString('participantes') +
        '\nPauta: ' +
        ata.getString('pauta') +
        '\nResumo atual: ' +
        ata.getString('resumo') +
        '\nDecisões: ' +
        ata.getString('decisoes') +
        '\nAction items: ' +
        ata.getString('action_items')
    } else {
      // TX-b: payload direto do dialog (transcrição do áudio é a fonte principal)
      tituloRef = (pauta || transcricao || '').slice(0, 60)
      contexto =
        'Participantes: ' +
        participantes +
        '\nTranscrição do áudio: ' +
        transcricao +
        '\nPauta: ' +
        pauta +
        '\nResumo atual: ' +
        resumoAtual +
        '\nDecisões: ' +
        decisoes
    }

    const sys =
      'Você é analista sênior do grupo Extrafruti (Extrafruti, Casafruti, FoldBox). ' +
      'Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem cercas), com as chaves: ' +
      '"resumo" (string, até 5 linhas executivas com decisões/responsáveis/prazos), ' +
      '"decisoes" (string, decisões em linhas numeradas "1) ..."), ' +
      '"action_items" (array de objetos {acao, dono, prazo(YYYY-MM-DD ou "")}). ' +
      'Português do Brasil, objetivo. Não invente informação: use apenas o conteúdo fornecido.'

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content:
            'Conteúdo da reunião:\n' +
            contexto +
            '\n\nTarefa: ' +
            (promptExtra ||
              'gere o resumo executivo, as decisões tomadas e os action items (com dono e prazo quando mencionados).'),
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
      estrutura = { resumo: texto, decisoes: '', action_items: [] }
    }

    // modo ata_id: grava o resumo na ata (comportamento original)
    if (ataId && estrutura.resumo) {
      try {
        const ata = $app.findRecordById('atas', ataId)
        ata.set('resumo', String(estrutura.resumo).slice(0, 4000))
        $app.save(ata)
      } catch (_) {}
    }

    // histórico
    try {
      const col = $app.findCollectionByNameOrId('ia_pareceres')
      const rec = new Record(col)
      rec.set('modulo', 'atas')
      rec.set('ref', tituloRef)
      rec.set('prompt', 'Resumo/decisões/action items da ata')
      rec.set('contexto', contexto.slice(0, 12000))
      rec.set('resultado', JSON.stringify(estrutura))
      rec.set('status', 'rascunho')
      rec.set('observacao', '')
      rec.set('criado_por', auth.getString('email'))
      rec.set('modelo', 'fast')
      $app.save(rec)
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
          det: 'resumo IA: ' + tituloRef,
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, {
      ok: true,
      resumo: String(estrutura.resumo || ''),
      decisoes: String(estrutura.decisoes || ''),
      action_items: estrutura.action_items || [],
    })
  },
  $apis.requireAuth(),
)
