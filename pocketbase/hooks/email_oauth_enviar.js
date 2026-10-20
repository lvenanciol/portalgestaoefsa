// COR-4 F8 — Enviar e-mail REAL via OAuth: Gmail API (google) ou Microsoft
// Graph (microsoft), com refresh de token. Grava no histórico emails.

routerAdd(
  'POST',
  '/backend/v1/email/oauth/enviar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const body = e.requestInfo().body || {}
    const provedor = String(body.provedor || '')
    const para = String(body.para || '').trim()
    const assunto = String(body.assunto || '').trim()
    const corpoTexto = String(body.corpo || '')
    if (provedor !== 'google' && provedor !== 'microsoft') {
      return e.badRequestError('provedor inválido (google|microsoft)')
    }
    if (!para || !assunto) return e.badRequestError('para e assunto são obrigatórios')

    // tokens
    let rec
    try {
      rec = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "' + provedor + '"')
    } catch (_) {
      return e.json(200, { ok: false, erro: 'Não conectado (' + provedor + ').' })
    }
    let at = rec.getString('access_token')
    const rt = rec.getString('refresh_token')
    const expira = rec.getString('expires_at')

    // refresh se expirado
    const expMs = expira ? new Date(expira).getTime() : 0
    let cid, csec, tokenUrl
    if (provedor === 'google') {
      cid = $secrets.get('GMAIL_OAUTH_CLIENT_ID')
      csec = $secrets.get('GMAIL_OAUTH_CLIENT_SECRET')
      tokenUrl = 'https://oauth2.googleapis.com/token'
    } else {
      cid = $secrets.get('OUTLOOK_OAUTH_CLIENT_ID')
      csec = $secrets.get('OUTLOOK_OAUTH_CLIENT_SECRET')
      // app single-tenant: token endpoint do TENANT (não /common — dá invalid_client)
      const tenantMs =
        String($secrets.get('OUTLOOK_TENANT_ID') || '') || 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
      tokenUrl = 'https://login.microsoftonline.com/' + tenantMs + '/oauth2/v2.0/token'
    }
    if (expMs - 60000 < Date.now() && rt && cid && csec) {
      const form =
        'client_id=' +
        encodeURIComponent(cid) +
        '&client_secret=' +
        encodeURIComponent(csec) +
        '&refresh_token=' +
        encodeURIComponent(rt) +
        '&grant_type=refresh_token' +
        (provedor === 'google'
          ? ''
          : '&scope=' + encodeURIComponent('https://graph.microsoft.com/.default offline_access'))
      try {
        const r = $http.send({
          url: tokenUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          timeout: 30,
        })
        // PB pode devolver body como array de bytes
        const bodyStr =
          typeof r.body === 'string'
            ? r.body
            : Array.isArray(r.body)
              ? String.fromCharCode.apply(null, r.body)
              : String(r.body || '')
        if (r.statusCode === 200) {
          const t = JSON.parse(bodyStr)
          at = String(t.access_token || at)
          rec.set('access_token', at)
          rec.set(
            'expires_at',
            new Date(Date.now() + Number(t.expires_in || 3600) * 1000).toISOString(),
          )
          if (t.refresh_token) rec.set('refresh_token', String(t.refresh_token))
          $app.save(rec)
        }
      } catch (_) {}
    }

    // montar mensagem
    let status = 'enviado'
    let erro = ''
    // T-fix (20/10): $security.base64Encode NÃO existe no JSVM — encoder puro inline
    const b64encode = (str) => {
      const bytes = []
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i)
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
          const c2 = str.charCodeAt(i + 1)
          if (c2 >= 0xdc00 && c2 <= 0xdfff) {
            c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
            i++
          }
        }
        if (c < 0x80) bytes.push(c)
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
        else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
        else
          bytes.push(
            0xf0 | (c >> 18),
            0x80 | ((c >> 12) & 63),
            0x80 | ((c >> 6) & 63),
            0x80 | (c & 63),
          )
      }
      const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b1 = bytes[i]
        const has2 = i + 1 < bytes.length
        const has3 = i + 2 < bytes.length
        const b2 = has2 ? bytes[i + 1] : 0
        const b3 = has3 ? bytes[i + 2] : 0
        out += CH[b1 >> 2]
        out += CH[((b1 & 3) << 4) | (b2 >> 4)]
        out += has2 ? CH[((b2 & 15) << 2) | (b3 >> 6)] : '='
        out += has3 ? CH[b3 & 63] : '='
      }
      return out
    }
    try {
      if (provedor === 'google') {
        // RFC 822 em base64url
        const raw =
          'To: ' +
          para +
          '\r\n' +
          'Subject: ' +
          assunto +
          '\r\n' +
          'Content-Type: text/plain; charset="UTF-8"\r\n\r\n' +
          corpoTexto
        const b64 = b64encode(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        const r = $http.send({
          url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          method: 'POST',
          headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: b64 }),
          timeout: 30,
        })
        if (r.statusCode !== 200) {
          status = 'erro'
          erro = 'gmail ' + r.statusCode + ': ' + String(r.body || '').slice(0, 200)
        }
      } else {
        const r = $http.send({
          url: 'https://graph.microsoft.com/v1.0/me/sendMail',
          method: 'POST',
          headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: assunto,
              body: { contentType: 'Text', content: corpoTexto },
              toRecipients: [{ emailAddress: { address: para } }],
            },
            saveToSentItems: true,
          }),
          timeout: 30,
        })
        if (r.statusCode !== 202) {
          status = 'erro'
          erro = 'graph ' + r.statusCode + ': ' + String(r.body || '').slice(0, 200)
        }
      }
    } catch (err) {
      status = 'erro'
      erro = String(err).slice(0, 200)
    }

    // histórico (coleção emails)
    try {
      const col = $app.findCollectionByNameOrId('emails')
      const recE = new Record(col)
      recE.set('para', para)
      recE.set('assunto', assunto)
      recE.set('corpo', corpoTexto.slice(0, 20000))
      recE.set('status', status)
      recE.set('erro', erro)
      recE.set('modelo', provedor === 'google' ? 'gmail_oauth' : 'outlook_oauth')
      recE.set('criado_por', auth.getString('email'))
      $app.save(recE)
    } catch (_) {}

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'email_enviado_oauth', 'emails', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det:
            provedor +
            ': ' +
            assunto +
            ' → ' +
            para +
            (erro ? ' (ERRO: ' + erro.slice(0, 80) + ')' : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    if (status === 'erro') {
      return e.json(502, { ok: false, erro: erro || 'falha no envio' })
    }
    return e.json(200, { ok: true, provedor: provedor, status: status })
  },
  $apis.requireAuth(),
)
