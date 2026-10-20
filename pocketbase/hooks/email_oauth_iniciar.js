// COR-4 F8 — OAuth iniciar: gera state anti-CSRF de uso único e devolve a
// URL de autorização do provedor (google=Gmail API, microsoft=MS Graph).
// Escopos: leitura + envio. Redirect URI = <backend>/backend/v1/email/oauth/callback
// (registrar EXATAMENTE este URI no Google Cloud Console / Azure Entra ID).

routerAdd(
  'POST',
  '/backend/v1/email/oauth/iniciar',
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

    // credenciais
    const cid = $secrets.get(
      provedor === 'google' ? 'GMAIL_OAUTH_CLIENT_ID' : 'OUTLOOK_OAUTH_CLIENT_ID',
    )
    if (!cid) {
      return e.json(200, {
        ok: false,
        erro:
          'Credenciais não registradas. Crie o secret ' +
          (provedor === 'google' ? 'GMAIL_OAUTH_CLIENT_ID' : 'OUTLOOK_OAUTH_CLIENT_ID') +
          ' (e o *_CLIENT_SECRET) no Skip Cloud.',
      })
    }

    // state anti-CSRF de uso único
    const st = $security.randomString(48)
    try {
      const col = $app.findCollectionByNameOrId('email_oauth_state')
      const rec = new Record(col)
      rec.set('state', st)
      rec.set('provedor', provedor)
      rec.set('criado_por', auth.getString('email'))
      $app.save(rec)
    } catch (err) {
      return e.json(500, { ok: false, erro: 'state: ' + String(err).slice(0, 120) })
    }

    // backend base: PB_INSTANCE_URL (sem sufixo /_/ do admin)
    // COR-4 (20/10): OAUTH_REDIRECT_BASE (opcional) permite usar o domínio
    // PÚBLICO do portal como redirect (ex.: https://portal-de-gestao-executivo-b4d94.goskip.app)
    // — o callback do PB responde igual no domínio público. Sem o secret,
    // mantém o comportamento antigo (URL interna da instância).
    let backend = String($secrets.get('OAUTH_REDIRECT_BASE') || '')
    if (!backend) backend = String($secrets.get('PB_INSTANCE_URL') || '')
    backend = backend.replace(/\/_\/?$/, '').replace(/\/$/, '')
    if (!backend) {
      return e.json(500, { ok: false, erro: 'PB_INSTANCE_URL não configurada.' })
    }
    const redirectUri = backend + '/backend/v1/email/oauth/callback'

    // URL de autorização por provedor
    let url = ''
    if (provedor === 'google') {
      // COR-4 fix: escopos gmail exigem URL completa (gmail.send curto = 400 invalid_scope)
      const escopos = [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'openid',
        'email',
        'profile',
      ].join(' ')
      url =
        'https://accounts.google.com/o/oauth2/v2/auth' +
        '?client_id=' +
        encodeURIComponent(cid) +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&response_type=code' +
        '&scope=' +
        encodeURIComponent(escopos) +
        '&access_type=offline' +
        '&prompt=consent' +
        '&state=' +
        encodeURIComponent(st)
    } else {
      const escopos = [
        'offline_access',
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/User.Read',
      ].join(' ')
      // COR-4 (20/10): app single-tenant — /common retorna AADSTS50194;
      // usar o endpoint do tenant (secret OUTLOOK_TENANT_ID, fallback Extrafruti)
      const tenant =
        String($secrets.get('OUTLOOK_TENANT_ID') || '') || 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
      url =
        'https://login.microsoftonline.com/' +
        tenant +
        '/oauth2/v2.0/authorize' +
        '?client_id=' +
        encodeURIComponent(cid) +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&response_type=code' +
        '&scope=' +
        encodeURIComponent(escopos) +
        '&response_mode=query' +
        '&state=' +
        encodeURIComponent(st)
    }

    return e.json(200, { ok: true, url: url, redirect_uri: redirectUri })
  },
  $apis.requireAuth(),
)
