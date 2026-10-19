// Fechamento de gaps (verificação 19/10) — Compositor de e-mail:
// POST /backend/v1/emails/enviar  { para, assunto, corpo, modelo? }
// Envia via $app.newMailClient() (relay Skip, From da plataforma) e grava
// na coleção emails (histórico da tela E-mails). Modelos = templates simples
// em ia_prompts-like? Não: modelos fixos embutidos (aviso, cobrança, reunião)
// + custom do body. Admin-only para envio; leitura permanece na tela.

routerAdd(
  'POST',
  '/backend/v1/emails/enviar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth())
      throw new ForbiddenError('Acesso restrito a administradores.')

    const body = e.requestInfo().body || {}
    const para = String(body.para || '').trim()
    const assunto = String(body.assunto || '').trim()
    let corpo = String(body.corpo || '').trim()
    const modelo = String(body.modelo || 'livro').slice(0, 60)
    if (!para || !assunto) return e.badRequestError('para e assunto são obrigatórios')

    // valida e-mails simples (a,b c/ vírgula)
    const dests = para
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const d of dests) {
      if (!re.test(d)) return e.badRequestError('e-mail inválido: ' + d)
    }

    // modelos embutidos: envolve o corpo num layout com marca do grupo
    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<div style="background:#1B5E20;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0">' +
      '<strong style="font-size:15px">Portal de Gestão Executivo — Extrafruti</strong></div>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">' +
      assunto +
      '</h2>' +
      '<div style="font-size:14px;line-height:1.6;white-space:pre-wrap">' +
      corpo +
      '</div>' +
      '<p style="margin-top:24px;font-size:11px;color:#9ca3af">Grupo Extrafruti · Casafruti · FoldBox</p>' +
      '</div></div>'

    let status = 'enviado'
    let erro = ''
    try {
      const message = new MailerMessage({
        from: {
          address: $app.settings().senderName
            ? $app.settings().meta.senderAddress
            : $app.settings().meta.senderAddress,
          name: 'Portal de Gestão Executivo — Extrafruti',
        },
        to: dests.map((d) => ({ address: d })),
        subject: assunto,
        html: html,
        text: corpo,
      })
      const client = $app.newMailClient()
      client.send(message)
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 500)
    }

    // grava histórico (coleção emails — tela E-mails lê)
    try {
      const col = $app.findCollectionByNameOrId('emails')
      const rec = new Record(col)
      rec.set('para', para)
      rec.set('assunto', assunto)
      rec.set('corpo', corpo.slice(0, 20000))
      rec.set('status', status)
      rec.set('erro', erro)
      rec.set('modelo', modelo)
      rec.set('criado_por', auth.getString('email'))
      $app.save(rec)
    } catch (_) {}

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'email_enviado', 'emails', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: assunto + ' → ' + para + (erro ? ' (ERRO: ' + erro.slice(0, 80) + ')' : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    if (status === 'erro') {
      return e.json(502, { ok: false, erro: erro || 'falha no envio' })
    }
    return e.json(200, { ok: true, status: status })
  },
  $apis.requireAuth(),
)

// Modelos de e-mail (catálogo simples, embutido — editável depois no banco)
routerAdd(
  'GET',
  '/backend/v1/emails/modelos',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const modelos = [
      {
        chave: 'aviso',
        titulo: 'Aviso geral',
        assunto: 'Aviso — Portal de Gestão Executivo',
        corpo: 'Prezado(a),\n\nInformamos que ...\n\nAtenciosamente,\nEquipe de Gestão',
      },
      {
        chave: 'cobranca',
        titulo: 'Cobrança de título',
        assunto: 'Lembrete de vencimento',
        corpo:
          'Prezado(a),\n\nIdentificamos um título em aberto a vencer. Solicitamos a conferência e, se aplicável, a programação do pagamento.\n\nAtenciosamente,\nFinanceiro',
      },
      {
        chave: 'reuniao',
        titulo: 'Convocação de reunião',
        assunto: 'Convocação — reunião',
        corpo:
          'Prezado(a),\n\nVocê está convidado(a) para a reunião de [data/hora], modalidade [Presencial/Teams/Meet]. Pauta: ...\n\nAtenciosamente,\nDiretoria',
      },
    ]
    return e.json(200, { ok: true, modelos: modelos })
  },
  $apis.requireAuth(),
)
