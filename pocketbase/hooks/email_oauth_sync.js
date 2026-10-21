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
    // T0a fix (21/10): bytes → UTF-8 REAL — fromCharCode trata byte=char
    // latin-1 e corrompe acentos (mojibake "Ã©"). Decodifica UTF-8 de verdade.
    const utf8Decode = (bytes) => {
      let out = ''
      let i = 0
      while (i < bytes.length) {
        const b = bytes[i]
        let cp
        if (b < 0x80) {
          cp = b
          i += 1
        } else if (b < 0xe0) {
          cp = ((b & 31) << 6) | (bytes[i + 1] & 63)
          i += 2
        } else if (b < 0xf0) {
          cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
          i += 3
        } else {
          cp =
            ((b & 7) << 18) |
            ((bytes[i + 1] & 63) << 12) |
            ((bytes[i + 2] & 63) << 6) |
            (bytes[i + 3] & 63)
          i += 4
        }
        out += String.fromCodePoint(cp)
      }
      return out
    }
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
      // app single-tenant: token endpoint do TENANT (não /common — dá invalid_client)
      const tenantMs =
        String($secrets.get('OUTLOOK_TENANT_ID') || '') || 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
      tokenUrl = 'https://login.microsoftonline.com/' + tenantMs + '/oauth2/v2.0/token'
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
        // PB pode devolver body como array de bytes
        const bodyStr =
          typeof r.body === 'string'
            ? r.body
            : Array.isArray(r.body)
              ? utf8Decode(r.body)
              : String(r.body || '')
        if (r.statusCode === 200) {
          const t = JSON.parse(bodyStr)
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
        const listaStr =
          typeof r.body === 'string'
            ? r.body
            : Array.isArray(r.body)
              ? utf8Decode(r.body)
              : String(r.body || '')
        lista = JSON.parse(listaStr)
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
          const detStr =
            typeof d.body === 'string'
              ? d.body
              : Array.isArray(d.body)
                ? utf8Decode(d.body)
                : String(d.body || '')
          const det = JSON.parse(detStr)
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
          // espaço em $orderby DEVE ser %20 (URL crua com espaço → 400 HTML)
          url: 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=15&$select=id,subject,from,bodyPreview,receivedDateTime&$orderby=receivedDateTime%20desc',
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
        const dataStr =
          typeof r.body === 'string'
            ? r.body
            : Array.isArray(r.body)
              ? utf8Decode(r.body)
              : String(r.body || '')
        data = JSON.parse(dataStr)
      } catch (_) {
        return e.json(200, { ok: false, erro: 'json graph' })
      }
      for (const m of data.value || []) {
        msgs.push({
          message_id: String(m.id || ''), // T0b fix: ID COMPLETO do Graph (truncar → 404 no detalhe)
          de: m.from && m.from.emailAddress ? m.from.emailAddress.address : '',
          assunto: m.subject || '(sem assunto)',
          preview: String(m.bodyPreview || '').slice(0, 500),
          recebido_em: m.receivedDateTime || new Date().toISOString(),
        })
      }
    }

    // grava com dedupe — existente é ATUALIZADO (corrige mojibake de syncs antigos)
    let novos = 0
    const col = $app.findCollectionByNameOrId('emails_inbox')
    for (const m of msgs) {
      let existente = null
      try {
        existente = $app.findFirstRecordByFilter(
          'emails_inbox',
          'provedor = "' +
            provedor +
            '" && message_id = "' +
            String(m.message_id).replace(/"/g, '') +
            '"',
        )
      } catch (_) {
        existente = null
      }
      if (existente) {
        try {
          existente.set('assunto', m.assunto)
          existente.set('preview', m.preview)
          existente.set('de', m.de)
          existente.set('recebido_em', m.recebido_em)
          $app.save(existente)
        } catch (_) {}
        continue
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
