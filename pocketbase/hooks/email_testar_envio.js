// ============================================================================
// E-MAIL — teste de envio (14/11/2026)
// POST /backend/v1/email/testar-envio
//
// Envia um e-mail de teste para o PRÓPRIO usuário autenticado, usando
// exatamente a mesma cadeia de remetente dos hooks de tarefa:
//   secret EMAIL_REMETENTE -> senderAddress da plataforma
//
// Serve para o gestor provar, na tela de configuração, que o envio funciona
// antes de culpar a notificação. Registra em `emails` com modelo
// "email_teste" para auditoria.
//
// Segurança: só autenticado, e só envia para o e-mail do próprio token —
// não aceita destinatário do corpo (evita virar relay de spam).
// ============================================================================
routerAdd(
  'POST',
  '/backend/v1/email/testar-envio',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const destino = auth.getString('email')
    if (!destino || destino.indexOf('@') === -1) {
      return e.badRequestError('Usuário sem e-mail válido no cadastro.')
    }

    const nome = auth.getString('name') || destino

    let remAddr = ''
    try {
      remAddr = String($secrets.get('EMAIL_REMETENTE') || '').trim()
    } catch (_) {}
    if (!remAddr) remAddr = $app.settings().meta.senderAddress

    // Nome: FONTE ÚNICA = tela Integrações > E-mail (secret removido 14/11).
    let remNome = ''
    try {
      const achN = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
        '',
        1,
        0,
      )
      if (achN && achN.length) {
        const cfgN = achN[0].get('config') || {}
        remNome = String(cfgN.nome || '').trim()
      }
    } catch (_) {}
    if (!remNome) {
      try {
        remNome = String($app.settings().meta.senderName || '').trim()
      } catch (_) {}
    }
    if (!remNome) remNome = 'Portal de Gestao Executivo - Extrafruti'

    let base = ''
    try {
      base = String($app.settings().meta.appURL || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($secrets.get('SITE_URL') || '')
      } catch (_) {}
    }
    if (!base) base = 'https://portalefsa.goskip.app'
    base = base.replace(/\/+$/, '')

    // SMTP próprio?
    let smtpProprio = false
    let smtpHost = ''
    try {
      const s = $app.settings()
      smtpHost = String((s.smtp && s.smtp.host) || '')
      smtpProprio = !!smtpHost && !!(s.smtp && s.smtp.port)
    } catch (_) {}

    const agora = (function () {
      try {
        const d = new Date()
        const p = (n) => String(n).padStart(2, '0')
        return (
          p(d.getDate()) +
          '/' +
          p(d.getMonth() + 1) +
          '/' +
          d.getFullYear() +
          ' ' +
          p(d.getHours()) +
          ':' +
          p(d.getMinutes())
        )
      } catch (_) {
        return ''
      }
    })()

    const assunto = 'Teste de envio — Portal de Gestão Executivo'

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="border-collapse:collapse">' +
      '<tr><td style="background:#1B5E20;color:#fff;padding:14px 20px">' +
      '<strong style="font-size:15px">Teste de envio</strong>' +
      '<span style="font-size:11px;opacity:.85;display:block;margin-top:2px">' +
      'Portal de Gestão Executivo · Grupo Extrafruti</span></td></tr></table>' +
      '<div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:16px">O envio está funcionando</h2>' +
      '<p style="font-size:14px;line-height:1.6">Olá, <strong>' +
      nome +
      '</strong>!</p>' +
      '<p style="font-size:14px;line-height:1.6">Este é um e-mail de teste disparado pela tela ' +
      'de configuração de e-mail do Portal.</p>' +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">' +
      '<tr><td style="padding:6px 0;color:#6b7280;width:140px">De</td>' +
      '<td style="padding:6px 0;font-weight:bold">' +
      remAddr +
      '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#6b7280">Para</td>' +
      '<td style="padding:6px 0">' +
      destino +
      '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#6b7280">Enviado em</td>' +
      '<td style="padding:6px 0">' +
      agora +
      '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#6b7280">Canal</td>' +
      '<td style="padding:6px 0">' +
      (smtpProprio ? 'SMTP próprio (' + smtpHost + ')' : 'Relay da plataforma') +
      '</td></tr></table>' +
      (smtpProprio
        ? '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;' +
          'font-size:12px;color:#065f46;line-height:1.6">Enviando pelo servidor próprio: o ' +
          'endereço acima aparece como remetente real.</div>'
        : '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;' +
          'font-size:12px;color:#92400e;line-height:1.6">Sem SMTP próprio: a plataforma reescreve ' +
          'o "De" e o endereço acima fica como Responder-para.</div>') +
      '<p style="margin-top:20px;font-size:11px;color:#9ca3af">Sistema corporativo de uso restrito. ' +
      'Grupo Extrafruti · Casafruti · FoldBox</p></div></div>'

    const texto =
      'Olá, ' +
      nome +
      '!\n\n' +
      'Este é um e-mail de teste do Portal de Gestão Executivo.\n\n' +
      'De: ' +
      remAddr +
      '\n' +
      'Para: ' +
      destino +
      '\n' +
      'Enviado em: ' +
      agora +
      '\n' +
      'Canal: ' +
      (smtpProprio ? 'SMTP próprio (' + smtpHost + ')' : 'Relay da plataforma') +
      '\n\n' +
      'Sistema corporativo de uso restrito.'

    let status = 'enviado'
    let erro = ''
    try {
      const msg = new MailerMessage({
        from: { address: remAddr, name: remNome },
        to: [{ address: destino }],
        subject: assunto,
        html: html,
        text: texto,
      })
      $app.newMailClient().send(msg)
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 500)
      console.warn('[email/testar-envio] falhou: ' + erro)
    }

    try {
      const col = $app.findCollectionByNameOrId('emails')
      const rec = new Record(col)
      rec.set('para', destino)
      rec.set('assunto', assunto)
      rec.set('corpo', texto.slice(0, 20000))
      rec.set('status', status)
      rec.set('erro', erro)
      rec.set('modelo', 'email_teste')
      rec.set('criado_por', destino)
      $app.save(rec)
    } catch (_) {}

    if (status === 'erro') {
      return e.json(502, { ok: false, erro: erro, para: destino })
    }
    return e.json(200, { ok: true, para: destino, remetente: remAddr, smtpProprio: smtpProprio })
  },
  $apis.requireAuth(),
)
