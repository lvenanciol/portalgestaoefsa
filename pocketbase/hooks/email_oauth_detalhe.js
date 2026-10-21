// T0b (21/10) — Detalhe do e-mail sincronizado: corpo completo (HTML/texto)
// + anexos, no layout do Outlook. GET /backend/v1/email/oauth/detalhe?id=<pb_id>
// - google: Gmail API messages/{id}?format=full (base64url → partes)
// - microsoft: Graph messages/{id}?$select=... (body + attachments)
// Devolve { ok, assunto, de, para, data, corpo_html, corpo_texto, anexos:[{nome, mime, tamanho, base64?}] }

routerAdd(
  'GET',
  '/backend/v1/email/oauth/detalhe',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const q = e.requestInfo().query || {}
    const id = String(q.id || '')
    if (!id) return e.badRequestError('id é obrigatório')

    const rec = $app.findRecordById('emails_inbox', id)
    const provedor = rec.getString('provedor')
    let mid = rec.getString('message_id') // T0b: pode ser re-vinculado (Graph volátil)
    let at = rec.getString('access_token') // não existe — usa tokens do provedor
    let tok
    try {
      tok = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "' + provedor + '"')
    } catch (_) {
      return e.json(502, { ok: false, erro: 'Conta não conectada.' })
    }
    at = tok.getString('access_token')
    const rt = tok.getString('refresh_token')
    const expira = tok.getString('expires_at')

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
        const bodyStr =
          typeof r.body === 'string'
            ? r.body
            : Array.isArray(r.body)
              ? String.fromCharCode.apply(null, r.body)
              : String(r.body || '')
        if (r.statusCode === 200) {
          const t = JSON.parse(bodyStr)
          at = String(t.access_token || at)
          tok.set('access_token', at)
          tok.set(
            'expires_at',
            new Date(Date.now() + Number(t.expires_in || 3600) * 1000).toISOString(),
          )
          if (t.refresh_token) tok.set('refresh_token', String(t.refresh_token))
          $app.save(tok)
        }
      } catch (_) {}
    }

    // UTF-8 real (T0a): bytes → string sem mojibake
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
    const bodyOf = (res) => {
      const b = res && res.body
      if (typeof b === 'string') return b
      if (Array.isArray(b)) return utf8Decode(b)
      return String(b || '')
    }

    const out = {
      ok: true,
      assunto: rec.getString('assunto'),
      de: rec.getString('de'),
      data: rec.getString('recebido_em'),
      corpo_html: '',
      corpo_texto: '',
      anexos: [],
    }

    if (provedor === 'google') {
      const r = $http.send({
        url:
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
          encodeURIComponent(mid) +
          '?format=full',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + at },
        timeout: 30,
      })
      if (r.statusCode !== 200)
        return e.json(502, {
          ok: false,
          erro: 'gmail ' + r.statusCode + ': ' + bodyOf(r).slice(0, 120),
        })
      const d = JSON.parse(bodyOf(r))
      // varre as partes MIME
      const b64urlDecode = (s) => {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
        // decodifica base64 → bytes → UTF-8
        const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        const bytes = []
        let bits = 0
        let acc = 0
        for (const ch of b64) {
          if (ch === '=') break
          const v = CH.indexOf(ch)
          if (v < 0) continue
          acc = (acc << 6) | v
          bits += 6
          if (bits >= 8) {
            bits -= 8
            bytes.push((acc >> bits) & 255)
          }
        }
        return utf8Decode(bytes)
      }
      const pegaPartes = (part) => {
        const mime = String(part.mimeType || '')
        const body = part.body || {}
        if (mime === 'text/html' && !out.corpo_html && body.data) {
          out.corpo_html = b64urlDecode(String(body.data))
        }
        if (mime === 'text/plain' && !out.corpo_texto && body.data) {
          out.corpo_texto = b64urlDecode(String(body.data))
        }
        if (mime === 'application/pdf' && body.attachmentId && out.anexos.length < 5) {
          out.anexos.push({
            nome: '(pdf) anexo id ' + body.attachmentId,
            attachment_id: body.attachmentId,
            mime: mime,
            tamanho: body.size || 0,
          })
        }
        for (const f of part.filename ? [part] : []) {
          if (f.filename && f.body && f.body.attachmentId && out.anexos.length < 5) {
            out.anexos.push({
              nome: String(f.filename),
              attachment_id: f.body.attachmentId,
              mime: mime,
              tamanho: f.body.size || 0,
            })
          }
        }
        for (const p of part.parts || []) pegaPartes(p)
      }
      if (d.payload) pegaPartes(d.payload)
      if (!out.corpo_html && !out.corpo_texto && d.snippet) out.corpo_texto = String(d.snippet)
    } else {
      // T0b fix (21/10): IDs do Graph são VOLÁTEIS (mudam entre sessões) —
      // 404 ErrorItemNotFound mesmo com id completo. Re-lista e casa por
      // assunto/remetente; atualiza o vínculo no registro.
      const buscar = (idMid) =>
        $http.send({
          url:
            'https://graph.microsoft.com/v1.0/me/messages/' +
            encodeURIComponent(idMid) +
            '?$select=subject,from,toRecipients,body,bodyPreview,attachments,receivedDateTime',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + at },
          timeout: 30,
        })
      let r = buscar(mid)
      if (r.statusCode === 404) {
        const rl = $http.send({
          url: 'https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime%20desc',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + at },
          timeout: 30,
        })
        if (rl.statusCode === 200) {
          const lista = JSON.parse(bodyOf(rl))
          const alvoAssunto = String(rec.getString('assunto') || '').toLowerCase()
          const alvoDe = String(rec.getString('de') || '').toLowerCase()
          const achou = (lista.value || []).find(
            (x) =>
              String(x.subject || '').toLowerCase() === alvoAssunto ||
              (alvoDe &&
                x.from &&
                x.from.emailAddress &&
                String(x.from.emailAddress.address || '').toLowerCase() === alvoDe),
          )
          if (achou) {
            mid = String(achou.id)
            try {
              rec.set('message_id', mid)
              $app.save(rec)
            } catch (_) {}
            r = buscar(mid)
          }
        }
      }
      if (r.statusCode !== 200)
        return e.json(502, {
          ok: false,
          erro:
            'graph ' + r.statusCode + ': e-mail não encontrado na caixa atual (movido/excluído?).',
        })
      const d = JSON.parse(bodyOf(r))
      out.corpo_html = String((d.body && d.body.content) || '')
      if ((d.body || {}).contentType === 'text') out.corpo_texto = out.corpo_html
      // T0b-2 (21/10): charset UTF-8 explícito no HTML (caracteres mal formatados
      // em e-mails sem <meta charset> — o browser assume windows-1252)
      if (out.corpo_html && !/charset=/i.test(out.corpo_html)) {
        out.corpo_html = '<meta charset="utf-8">' + out.corpo_html
      }
      const anexos = d.attachments || []
      // T0e fix (21/10): imagens INLINE (cid:) não abrem — baixar cada uma e
      // embutir como data URL no HTML (contentBytes já vem na listagem de
      // attachments com $expand). Sem expand, busca individual <100KB.
      try {
        const cids = out.corpo_html.match(/cid:[a-zA-Z0-9._@-]+/g) || []
        if (cids.length) {
          const ri = $http.send({
            url:
              'https://graph.microsoft.com/v1.0/me/messages/' +
              encodeURIComponent(mid) +
              '/attachments?$select=name,contentType,contentBytes,size,isInline,contentId',
            method: 'GET',
            headers: { Authorization: 'Bearer ' + at },
            timeout: 60,
          })
          if (ri.statusCode === 200) {
            const listaAnexos = JSON.parse(bodyOf(ri)).value || []
            for (const cid of cids.slice(0, 10)) {
              const cidLimpo = cid.replace('cid:', '')
              // casa por contentId (com/sem <>) ou nome
              let a = listaAnexos.find(
                (x) =>
                  String(x.contentId || '').replace(/[<>]/g, '') === cidLimpo ||
                  String(x.name || '') === cidLimpo,
              )
              // anexo grande: listagem NÃO traz contentBytes — buscar individual
              if (a && !a.contentBytes && a.id) {
                try {
                  const ra = $http.send({
                    url:
                      'https://graph.microsoft.com/v1.0/me/messages/' +
                      encodeURIComponent(mid) +
                      '/attachments/' +
                      encodeURIComponent(a.id) +
                      '?$select=contentType,contentBytes',
                    method: 'GET',
                    headers: { Authorization: 'Bearer ' + at },
                    timeout: 60,
                  })
                  if (ra.statusCode === 200) {
                    const aa = JSON.parse(bodyOf(ra))
                    a.contentBytes = aa.contentBytes
                    a.contentType = aa.contentType || a.contentType
                  }
                } catch (_eA) {}
              }
              if (a && a.contentBytes) {
                // substitui TODAS as variantes (aspas duplas/simples, case)
                const dataUrl = 'data:' + a.contentType + ';base64,' + a.contentBytes
                out.corpo_html = out.corpo_html
                  .split('src="cid:' + cidLimpo + '"')
                  .join('src="' + dataUrl + '"')
                out.corpo_html = out.corpo_html
                  .split("src='cid:" + cidLimpo + "'")
                  .join("src='" + dataUrl + "'")
                out.corpo_html = out.corpo_html.split('src=CID:' + cidLimpo).join('src=' + dataUrl)
              } else if (a && a.isInline) {
                // T0e-2 (21/10): anexo INLINE cujo cid não casou no HTML — injeta
                // <img> no topo (o Outlook referencia por contentId que nem sempre
                // aparece no corpo). Não perde a imagem.
                const dataUrl2 = 'data:' + a.contentType + ';base64,' + a.contentBytes
                out.corpo_html =
                  '<div><img src="' +
                  dataUrl2 +
                  '" style="max-width:100%;" /></div>' +
                  out.corpo_html
              }
            }
          }
        }
      } catch (_eCid) {
        /* sem imagens inline — segue */
      }
      for (const a of anexos.slice(0, 5)) {
        out.anexos.push({
          nome: String(a.name || 'anexo'),
          mime: String((a.contentType || '').slice(0, 60)),
          tamanho: a.size || 0,
          // anexos pequenos (<100KB) vêm inline — entregar base64 p/ download
          base64: a.contentBytes && (a.size || 0) < 100 * 1024 ? String(a.contentBytes) : '',
        })
      }
    }

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'email_detalhe', 'emails', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: provedor + ': ' + out.assunto.slice(0, 80),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
