// Fase 5 — Proxy Sankhya (mesma instância/conta de serviço do Foldbox).
// Credenciais em secrets: SANKHYA_BASE_URL, SANKHYA_CLIENT_ID,
// SANKHYA_CLIENT_SECRET, SANKHYA_X_TOKEN, SANKHYA_USER, SANKHYA_PASSWORD.
// OAuth client_credentials (com X-Token) + fallback /login, igual ao Foldbox.

routerAdd(
  'POST',
  '/backend/v1/sankhya/proxy',
  (e) => {
    const body = e.requestInfo().body || {}
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    // Somente Admin chama o proxy (Financeiro entra na Fase 6 se o dono liberar)
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const op = String(body.op || '')
    if (!op) return e.badRequestError('op é obrigatório')
    const payload = body.payload || {}

    const baseUrl = ($secrets.get('SANKHYA_BASE_URL') || 'https://api.sankhya.com.br').replace(
      /\/+$/,
      '',
    )
    const clientId = $secrets.get('SANKHYA_CLIENT_ID') || ''
    const clientSecret = $secrets.get('SANKHYA_CLIENT_SECRET') || ''
    const xToken = $secrets.get('SANKHYA_X_TOKEN') || ''
    const user = $secrets.get('SANKHYA_USER') || ''
    const password = $secrets.get('SANKHYA_PASSWORD') || ''

    // 1) OAuth client_credentials (com X-Token) — igual ao Foldbox
    let bearer = ''
    let via = ''
    if (clientId && clientSecret) {
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
      if (xToken) headers['X-Token'] = xToken
      const form = new URLSearchParams()
      form.set('grant_type', 'client_credentials')
      form.set('client_id', clientId)
      form.set('client_secret', clientSecret)
      try {
        const res = $http.send({
          url: baseUrl + '/authenticate',
          method: 'POST',
          headers: headers,
          body: form.toString(),
          timeout: 20,
        })
        if (res.statusCode === 200) {
          const d = res.json || {}
          const tok =
            d.bearerToken ||
            d.access_token ||
            d.token ||
            (d.responseBody && d.responseBody.bearerToken) ||
            ''
          if (tok) {
            bearer = tok
            via = 'oauth'
          }
        }
      } catch (_) {}
    }

    // 2) Fallback /login (user/senha) — igual ao Foldbox
    if (!bearer && user && password) {
      try {
        const res = $http.send({
          url: baseUrl + '/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, password: password }),
          timeout: 20,
        })
        if (res.statusCode === 200) {
          const d = res.json || {}
          const jsession = (d.json && d.json.jsessionid) || d.jsessionid || ''
          if (jsession) {
            bearer = jsession
            via = 'login'
          }
        }
      } catch (_) {}
    }

    if (!bearer) {
      $app.logger().error('sankhya_proxy: falha de autenticacao')
      return e.json(502, { ok: false, erro: 'Falha de autenticação no Sankhya (OAuth e login).' })
    }

    // 3) Chamada ao serviço alvo
    let url = ''
    let method = 'POST'
    let outBody = ''
    if (op === 'login') {
      return e.json(200, { ok: true, via: via })
    } else if (op === 'loadRecords') {
      // CRUDServiceProvider.loadRecords — payload: { serviceName, requestBody }
      url =
        baseUrl +
        '/gateway/v1/mge/service.sbr?serviceName=' +
        encodeURIComponent(payload.serviceName || 'CRUDServiceProvider.loadRecords') +
        '&outputType=json'
      outBody = JSON.stringify(payload.requestBody || {})
    } else if (op === 'crudSave') {
      url =
        baseUrl +
        '/gateway/v1/mge/service.sbr?serviceName=' +
        encodeURIComponent('CRUDServiceProvider.saveRecord') +
        '&outputType=json'
      outBody = JSON.stringify(payload.requestBody || {})
    } else if (op === 'dbExplorer') {
      url =
        baseUrl +
        '/gateway/v1/mge/service.sbr?serviceName=' +
        encodeURIComponent('DbExplorerSP.executeQuery') +
        '&outputType=json'
      outBody = JSON.stringify(payload.requestBody || {})
    } else if (op === 'service') {
      // serviço genérico: payload.serviceName + payload.requestBody
      url =
        baseUrl +
        '/gateway/v1/mge/service.sbr?serviceName=' +
        encodeURIComponent(payload.serviceName) +
        '&outputType=json'
      outBody = JSON.stringify(payload.requestBody || {})
    } else {
      return e.badRequestError('op desconhecida: ' + op)
    }

    const headers = { 'Content-Type': 'application/json' }
    if (via === 'oauth') {
      headers['Authorization'] = 'Bearer ' + bearer
    } else {
      headers['Cookie'] = 'JSESSIONID=' + bearer
    }

    let resposta
    try {
      const res = $http.send({
        url: url,
        method: method,
        headers: headers,
        body: outBody,
        timeout: 30,
      })
      let parsed = null
      try {
        parsed = res.json
      } catch (_) {
        parsed = { raw: String(res.body).slice(0, 2000) }
      }
      resposta = { status: res.statusCode, data: parsed }
    } catch (err) {
      $app.logger().error('sankhya_proxy: erro na chamada', 'error', String(err))
      return e.json(502, { ok: false, erro: 'Falha na chamada ao Sankhya: ' + String(err) })
    }

    // Auditoria da operação (best-effort)
    try {
      const id = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'sankhya_proxy', 'financeiro', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: op + (payload.serviceName ? ' ' + payload.serviceName : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, {
      ok: resposta.status >= 200 && resposta.status < 300,
      via: via,
      status: resposta.status,
      data: resposta.data,
    })
  },
  $apis.requireAuth(),
)
