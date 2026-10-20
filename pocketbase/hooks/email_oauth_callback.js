// COR-4 F8 — OAuth callback: recebe ?code&state do provedor, valida o state
// de uso único, troca o code por tokens (access+refresh) e grava em
// email_oauth_tokens. Depois redireciona para o portal (tela Configurações).

// COR-4 fix (20/10): redirect final SEMPRE para o SITE PUBLICADO (SPA) —
// o domínio do backend interno não serve a interface (404 "File not found").
// NOTA scoping: helpers inline no callback (top-level não sobrevive no JSVM).

routerAdd('GET', '/backend/v1/email/oauth/callback', (e) => {
  const SITE = String(
    $secrets.get('SITE_URL') || 'https://portal-de-gestao-executivo-b4d94.goskip.app',
  ).replace(/\/$/, '')
  const irPara = (path) => SITE + path
  const q = e.requestInfo().query || {}
  const code = String(q.code || '')
  const st = String(q.state || '')
  const erro = String(q.error || '')

  if (erro) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=' + encodeURIComponent(erro)))
  }
  if (!code || !st) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=sem_code_ou_state'))
  }

  // valida e consome o state (uso único)
  let provedor = ''
  try {
    const rec = $app.findFirstRecordByFilter(
      'email_oauth_state',
      'state = "' + st.replace(/"/g, '') + '"',
    )
    provedor = rec.getString('provedor')
    $app.delete(rec)
  } catch (_) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=state_invalido_ou_expirado'))
  }
  if (provedor !== 'google' && provedor !== 'microsoft') {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=provedor_invalido'))
  }

  // credenciais
  const cid = $secrets.get(
    provedor === 'google' ? 'GMAIL_OAUTH_CLIENT_ID' : 'OUTLOOK_OAUTH_CLIENT_ID',
  )
  const csec = $secrets.get(
    provedor === 'google' ? 'GMAIL_OAUTH_CLIENT_SECRET' : 'OUTLOOK_OAUTH_CLIENT_SECRET',
  )
  if (!cid || !csec) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=credenciais_ausentes'))
  }

  // COR-4 (20/10): mesma base do iniciar (OAUTH_REDIRECT_BASE > PB_INSTANCE_URL)
  // — redirect_uri DEVE ser idêntico ao usado na autorização, senão o token
  // exchange falha (redirect_uri_mismatch).
  let backend = String($secrets.get('OAUTH_REDIRECT_BASE') || '')
  if (!backend) backend = String($secrets.get('PB_INSTANCE_URL') || '')
  backend = backend.replace(/\/_\/?$/, '').replace(/\/$/, '')
  const redirectUri = backend + '/backend/v1/email/oauth/callback'

  // endpoints de token por provedor
  // COR-4 (20/10): token endpoint do tenant (mesma base do authorize)
  const tenantMs =
    String($secrets.get('OUTLOOK_TENANT_ID') || '') || 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
  const tokenUrl =
    provedor === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/' + tenantMs + '/oauth2/v2.0/token'

  const form =
    'client_id=' +
    encodeURIComponent(cid) +
    '&client_secret=' +
    encodeURIComponent(csec) +
    '&code=' +
    encodeURIComponent(code) +
    '&grant_type=authorization_code' +
    '&redirect_uri=' +
    encodeURIComponent(redirectUri)

  let res
  try {
    res = $http.send({
      url: tokenUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      timeout: 30,
    })
  } catch (err) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=transporte_token'))
  }
  if (res.statusCode !== 200) {
    const det = encodeURIComponent(String(res.body || '').slice(0, 180))
    return e.redirect(
      302,
      irPara('/configuracoes?oauth=erro&det=token_' + res.statusCode + '_' + det),
    )
  }

  let tok
  try {
    tok = JSON.parse(res.body)
  } catch (_) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=json_invalido'))
  }
  const at = String(tok.access_token || '')
  const rt = String(tok.refresh_token || '')
  const expiresIn = Number(tok.expires_in || 3600)
  if (!at) {
    return e.redirect(302, irPara('/configuracoes?oauth=erro&det=sem_access_token'))
  }
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // grava/atualiza tokens (1 registro por provedor)
  try {
    let rec
    try {
      rec = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "' + provedor + '"')
    } catch (_) {
      rec = null
    }
    if (rec) {
      rec.set('access_token', at)
      if (rt) rec.set('refresh_token', rt)
      rec.set('expires_at', expiresAt)
      $app.save(rec)
    } else {
      const col = $app.findCollectionByNameOrId('email_oauth_tokens')
      const novo = new Record(col)
      novo.set('provedor', provedor)
      novo.set('access_token', at)
      novo.set('refresh_token', rt)
      novo.set('expires_at', expiresAt)
      novo.set('criado_por', 'oauth')
      $app.save(novo)
    }
  } catch (err) {
    return e.redirect(
      302,
      irPara('/configuracoes?oauth=erro&det=gravar_tokens_' + String(err).slice(0, 80)),
    )
  }

  return e.redirect(302, irPara('/configuracoes?oauth=ok&provedor=' + provedor))
})
