// Fechamento de gaps (verificação 19/10) — IA sobre ARQUIVOS: PDF/DOCX/XLSX/CSV
// convertidos server-side via $documents.toMarkdown (preserva tabelas) e
// analisados com saída estruturada. Duas formas de entrada:
// (a) multipart: campo 'arquivo' + prompt/modulo/ref
// (b) JSON: { arquivo_id, prompt, modulo, ref } — arquivo já em arquivos_importados
// Grava ia_pareceres (modelo='fast') + auditoria. Sem OCR (PDF escaneado → 422).

routerAdd(
  'POST',
  '/backend/v1/ia/analisar-arquivo',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const prompt = String(
      body.prompt ||
        'Analise este documento e extraia os pontos principais, números relevantes e riscos.',
    ).slice(0, 8000)
    const modulo = String(body.modulo || 'documentos').slice(0, 60)
    const ref = String(body.ref || '').slice(0, 60)

    let markdown = ''
    let truncated = false
    try {
      const files = e.findUploadedFiles('arquivo')
      if (files && files.length > 0) {
        const conv = $documents.toMarkdown({ file: files[0] })
        markdown = conv.markdown || ''
        truncated = !!conv.truncated
      } else if (body.arquivo_id) {
        const rec = $app.findRecordById('arquivos_importados', String(body.arquivo_id))
        const conv = $documents.toMarkdown({ record: rec, field: 'arquivo' })
        markdown = conv.markdown || ''
        truncated = !!conv.truncated
      } else {
        return e.badRequestError('envie o arquivo (multipart campo "arquivo") ou arquivo_id')
      }
    } catch (err) {
      if (err && err.status === 422) {
        return e.json(422, { ok: false, erro: err.message })
      }
      return e.json(500, { ok: false, erro: 'Falha ao converter documento: ' + String(err) })
    }
    if (!markdown.trim()) {
      return e.json(422, {
        ok: false,
        erro: 'Documento sem texto extraível (PDF escaneado exige OCR — não suportado nesta plataforma).',
      })
    }

    // guia: PDFs custam 2-3 tokens/char; 12000 chars mantém dentro do limite 8192 tokens
    const contexto = markdown.slice(0, 12000)

    const sys =
      'Você é analista sênior do grupo Extrafruti (Extrafruti, Casafruti, FoldBox). ' +
      'Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem cercas), com as chaves: ' +
      'sumario_executivo (string), principais_achados (array de strings), riscos_alertas (array de strings), ' +
      'recomendacoes (array de strings, priorizadas), score_saude (numero 0-10), disclaimer (string). ' +
      'Português do Brasil, objetivo. Não invente números: use apenas o que o documento trouxer.'

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: 'Documento (texto extraído):\n' + contexto + '\n\nTarefa: ' + prompt,
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
      rec.set('modelo', 'fast')
      $app.save(rec)
      parecerId = rec.id
    } catch (_) {}

    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'ia_analisar_arquivo', {:mod}, {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          mod: modulo,
          det: 'análise de arquivo (' + String(ref || 'upload') + ')',
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, {
      ok: true,
      parecer_id: parecerId,
      estrutura: estrutura,
      truncated: truncated,
    })
  },
  $apis.requireAuth(),
)
