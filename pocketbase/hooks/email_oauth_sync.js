// COR-4 F8 — Sincronizar caixa de entrada: Gmail API (google) ou Microsoft
// Graph (microsoft), com refresh de access token quando expirado. Grava em
// emails_inbox (dedupe por provedor+message_id).

routerAdd(
  'POST',
  '/backend/v1/email/oauth/sync',
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
    if (provedor !== 'google' && provedor !== 'microsoft') {
      return e.badRequestError('provedor inválido (google|microsoft)')
    }

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

    // refresh se expirado (< 60s de margem)
    const expMs = expira ? new Date(expira).getTime() : 0
    let cid, csec, tokenUrl
    if (provedor === 'google') {
      cid = $secrets.get('GMAIL_OAUTH_CLIENT_ID')
      csec = $secrets.get('GMAIL_OAUTH_CLIENT_SECRET')
      tokenUrl = 'https://oauth2.googleapis.com/token'
    } else {
      cid = $secrets.get('OUTLOOK_OAUTH_CLIENT_ID')
      csec = $secrets.get('OUTLOOK_OAUTH_CLIENT_SECRET')
      tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    }
    if (expMs - 60000 < Date.now() && rt && cid && csec) {
      let backend = String($secrets.get('PB_INSTANCE_URL') || '')
      backend = backend.replace(/\/_\/?$/, '').replace(/\/$/, '')
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
        if (r.statusCode === 200) {
          const t = JSON.parse(r.body)
          at = String(t.access_token || at)
          const expiresIn = Number(t.expires_in || 3600)
          rec.set('access_token', at)
          rec.set('expires_at', new Date(Date.now() + expiresIn * 1000).toISOString())
          if (t.refresh_token) rec.set('refresh_token', String(t.refresh_token))
          $app.save(rec)
        }
      } catch (_) {
        // refresh falhou — segue com o token atual
      }
    }

    // listar mensagens
    let msgs = []
    if (provedor === 'google') {
      let r
      try {
        r = $http.send({
          url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + at },
          timeout: 30,
        })
      } catch (err) {
        return e.json(200, { ok: false, erro: 'transporte gmail: ' + String(err).slice(0, 100) })
      }
      if (r.statusCode !== 200) {
        return e.json(200, {
          ok: false,
          erro: 'gmail ' + r.statusCode + ': ' + String(r.body || '').slice(0, 150),
        })
      }
      let lista
      try {
        lista = JSON.parse(r.body)
      } catch (_) {
        return e.json(200, { ok: false, erro: 'json gmail' })
      }
      // busca os detalhes de cada mensagem (assunto/de/preview/data)
      for (const m of (lista.messages || []).slice(0, 15)) {
        try {
          const d = $http.send({
            url:
              'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
              m.id +
              '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date',
            method: 'GET',
            headers: { Authorization: 'Bearer ' + at },
            timeout: 30,
          })
          if (d.statusCode !== 200) continue
          const det = JSON.parse(d.body)
          const hdrs = (det.payload && det.payload.headers) || []
          const h = (nome) => {
            const x = hdrs.find((x) => x.name === nome)
            return x ? x.value : ''
          }
          msgs.push({
            message_id: String(det.id || m.id),
            de: h('From'),
            assunto: h('Subject') || '(sem assunto)',
            preview: String(det.snippet || '').slice(0, 500),
            recebido_em: det.internalDate
              ? new Date(Number(det.internalDate)).toISOString()
              : new Date().toISOString(),
          })
        } catch (_) {
          continue
        }
      }
    } else {
      let r
      try {
        r = $http.send({
          url: 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=15&$select=id,subject,from,bodyPreview,receivedDateTime&$orderby=receivedDateTime desc',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + at },
          timeout: 30,
        })
      } catch (err) {
        return e.json(200, { ok: false, erro: 'transporte graph: ' + String(err).slice(0, 100) })
      }
      if (r.statusCode !== 200) {
        return e.json(200, {
          ok: false,
          erro: 'graph ' + r.statusCode + ': ' + String(r.body || '').slice(0, 150),
        })
      }
      let data
      try {
        data = JSON.parse(r.body)
      } catch (_) {
        return e.json(200, { ok: false, erro: 'json graph' })
      }
      for (const m of data.value || []) {
        msgs.push({
          message_id: String(m.id || '').slice(0, 190),
          de: m.from && m.from.emailAddress ? m.from.emailAddress.address : '',
          assunto: m.subject || '(sem assunto)',
          preview: String(m.bodyPreview || '').slice(0, 500),
          recebido_em: m.receivedDateTime || new Date().toISOString(),
        })
      }
    }

    // grava com dedupe
    let novos = 0
    const col = $app.findCollectionByNameOrId('emails_inbox')
    for (const m of msgs) {
      try {
        $app.findFirstRecordByFilter(
          'emails_inbox',
          'provedor = "' +
            provedor +
            '" && message_id = "' +
            String(m.message_id).replace(/"/g, '') +
            '"',
        )
        continue // já existe
      } catch (_) {
        // não existe — cria
      }
      try {
        const novo = new Record(col)
        novo.set('provedor', provedor)
        novo.set('message_id', m.message_id)
        novo.set('de', m.de)
        novo.set('assunto', m.assunto)
        novo.set('preview', m.preview)
        novo.set('recebido_em', m.recebido_em)
        novo.set('lido', false)
        $app.save(novo)
        novos++
      } catch (_) {
        continue
      }
    }

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'email_sync_inbox', 'emails', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: provedor + ': ' + novos + ' novos e-mails',
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, provedor: provedor, total: msgs.length, novos: novos })
  },
  $apis.requireAuth(),
)
