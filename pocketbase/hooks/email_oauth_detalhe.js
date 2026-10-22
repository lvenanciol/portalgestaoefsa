// T0b (21/10) — Detalhe do e-mail sincronizado: corpo completo (HTML/texto)
// + anexos, no layout do Outlook. GET /backend/v1/email/oauth/detalhe?id=<pb_id>
// T0b/e (22/10) — mojibake windows-1252 re-decodificado (fix1252) + cid
// case-insensitive por prefixo (antes do '@') + anexo grande individual.
// - google: Gmail API messages/{id}?format=full (base64url → partes)
// - microsoft: Graph messages/{id}?$select=... (body + attachments)
// Devolve { ok, assunto, de, para, data, corpo_html, corpo_texto, anexos:[{nome, mime, tamanho, base64?}] }
// v10 (22/10): imagens inline vão em out.cids_inline [{cid, dataUrl}] — o FRONT
// resolve cid→dataUrl no iframe (JSVM é lento com strings de MB; browser não).
// v11 (22/10): bodyOf rápido p/ payloads grandes (fromCharCode em blocos) —
// utf8Decode char a char sobre 1.6MB de base64 travava o JSVM (timeout 40s+).
// v12 (22/10): re-lista 100 (não 50) ao re-vincular + erro 502 amigável.

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
    let tok
    try {
      tok = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "' + provedor + '"')
    } catch (_) {
      return e.json(502, { ok: false, erro: 'Conta não conectada.' })
    }
    let at = tok.getString('access_token')
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
    // v11: body grande (base64 ~MB) é ASCII puro — fromCharCode em blocos é
    // ~100× mais rápido que utf8Decode char a char (que travava o JSVM)
    const bodyOf = (res) => {
      const b = res && res.body
      if (typeof b === 'string') return b
      if (Array.isArray(b)) {
        if (b.length > 65536) {
          let s = ''
          for (let i = 0; i < b.length; i += 65536) {
            s += String.fromCharCode.apply(null, b.slice(i, i + 65536))
          }
          return s
        }
        return String.fromCharCode.apply(null, b)
      }
      return String(b || '')
    }
    // T0b (22/10): mojibake windows-1252 — texto UTF-8 lido como latin1 vira
    // "Ã©/Ã£/Ã§". Re-decodifica: cada par de bytes 0xC2-0xC3 + cont. recombina
    // em 1 codepoint UTF-8 real (JSVM não tem TextDecoder — manual).
    const fix1252 = (s) => {
      if (!s || s.length < 2) return s
      let temMojibake = false
      for (let i = 0; i < s.length - 1; i++) {
        const c = s.charCodeAt(i)
        if (
          (c === 0xc3 || c === 0xc2) &&
          s.charCodeAt(i + 1) >= 0x80 &&
          s.charCodeAt(i + 1) <= 0xbf
        ) {
          temMojibake = true
          break
        }
      }
      if (!temMojibake) return s
      let out = ''
      let i = 0
      while (i < s.length) {
        const c = s.charCodeAt(i)
        if ((c === 0xc2 || c === 0xc3) && i + 1 < s.length) {
          const c2 = s.charCodeAt(i + 1)
          if (c2 >= 0x80 && c2 <= 0xbf) {
            out += String.fromCodePoint(((c & 31) << 6) | (c2 & 63))
            i += 2
            continue
          }
        }
        out += s.charAt(i)
        i += 1
      }
      return out
    }
    const consertaCharset = (html) => {
      if (!html) return html
      let h = fix1252(html)
      if (!/charset=/i.test(h)) h = '<meta charset="utf-8">' + h
      return h
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
      const b64urlDecode = (s) => {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
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
          out.corpo_html = fix1252(b64urlDecode(String(body.data)))
        }
        if (mime === 'text/plain' && !out.corpo_texto && body.data) {
          out.corpo_texto = fix1252(b64urlDecode(String(body.data)))
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
      // T0b fix (21/10): IDs do Graph são VOLÁTEIS — 404 → re-lista e casa por
      // assunto/remetente; v12: top=100 (não 50) p/ cobrir caixas movimentadas.
      // v9: SEM attachments no $select — a listagem /attachments já traz tudo
      const buscar = (idMid) =>
        $http.send({
          url:
            'https://graph.microsoft.com/v1.0/me/messages/' +
            encodeURIComponent(idMid) +
            '?$select=subject,from,toRecipients,body,bodyPreview,receivedDateTime',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + at },
          timeout: 30,
        })
      let r = buscar(mid)
      if (r.statusCode === 404) {
        const rl = $http.send({
          url: 'https://graph.microsoft.com/v1.0/me/messages?$top=100&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime%20desc',
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
          erro: 'Este e-mail não está mais na caixa sincronizada (movido/excluído no Outlook). Sincronize a caixa e abra novamente — ou abra direto no Outlook.',
        })
      const d = JSON.parse(bodyOf(r))
      out.corpo_html = String((d.body && d.body.content) || '')
      if ((d.body || {}).contentType === 'text') out.corpo_texto = out.corpo_html
      out.corpo_html = consertaCharset(out.corpo_html)
      if (out.corpo_texto) out.corpo_texto = fix1252(out.corpo_texto)
      const anexos = d.attachments || []
      try {
        const cids = out.corpo_html.match(/cid:[a-zA-Z0-9._@-]+/g) || []
        if (cids.length) {
          // v8: listagem SEM $select — o Graph devolve contentId + contentBytes
          // de TODOS os anexos numa chamada (~0.3s); $select com contentId/
          // contentBytes dá 400 OData. Match por contentId REAL, bytes direto.
          const ri = $http.send({
            url:
              'https://graph.microsoft.com/v1.0/me/messages/' +
              encodeURIComponent(mid) +
              '/attachments',
            method: 'GET',
            headers: { Authorization: 'Bearer ' + at },
            timeout: 60,
          })
          if (ri.statusCode === 200) {
            const listaAnexos = JSON.parse(bodyOf(ri)).value || []
            const mapaCid = {} // v10: prefixo→{cid,dataUrl} p/ o front
            for (const cid of cids.slice(0, 10)) {
              const cidLimpo = cid.replace('cid:', '')
              const prefixo = cidLimpo.split('@')[0].toLowerCase()
              let a = listaAnexos.find((x) => {
                const cidAnexo = String(x.contentId || '')
                  .replace(/[<>]/g, '')
                  .toLowerCase()
                const nomeAnexo = String(x.name || '').toLowerCase()
                return (
                  cidAnexo === cidLimpo.toLowerCase() ||
                  (prefixo && cidAnexo.split('@')[0] === prefixo) ||
                  (prefixo && nomeAnexo.split('@')[0] === prefixo) ||
                  nomeAnexo === cidLimpo.toLowerCase()
                )
              })
              if (a && a.contentBytes) {
                mapaCid[prefixo] = {
                  cid: cidLimpo,
                  dataUrl: 'data:' + a.contentType + ';base64,' + a.contentBytes,
                }
              }
            }
            out.cids_inline = Object.values(mapaCid)
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
