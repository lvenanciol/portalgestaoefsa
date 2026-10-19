// COR-4 F8 — Desconectar: apaga tokens do provedor (e-mails sincronizados
// permanecem no histórico). Opcionalmente revoga o refresh no provedor.

routerAdd(
  'POST',
  '/backend/v1/email/oauth/desconectar',
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

    // revoga (best-effort) antes de apagar
    let rt = ''
    try {
      const rec = $app.findFirstRecordByFilter(
        'email_oauth_tokens',
        'provedor = "' + provedor + '"',
      )
      rt = rec.getString('refresh_token')
    } catch (_) {}
    if (rt) {
      try {
        if (provedor === 'google') {
          const cid = $secrets.get('GMAIL_OAUTH_CLIENT_ID')
          const csec = $secrets.get('GMAIL_OAUTH_CLIENT_SECRET')
          $http.send({
            url: 'https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt),
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:
              'token=' +
              encodeURIComponent(rt) +
              '&client_id=' +
              encodeURIComponent(cid) +
              '&client_secret=' +
              encodeURIComponent(csec),
            timeout: 15,
          })
        } else {
          $http.send({
            url: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
            method: 'GET',
            timeout: 15,
          })
        }
      } catch (_) {}
    }

    try {
      const rec = $app.findFirstRecordByFilter(
        'email_oauth_tokens',
        'provedor = "' + provedor + '"',
      )
      $app.delete(rec)
    } catch (_) {}

    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'email_desconectar', 'configuracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: provedor,
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
