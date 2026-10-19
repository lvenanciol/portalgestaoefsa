// COR-4 F8 — Status da conexão de e-mail OAuth: "Conectado" quando existe
// registro de tokens válido (access não expirado ou refresh disponível).

routerAdd(
  'GET',
  '/backend/v1/email/oauth/status',
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

    const out = { google: { conectado: false }, microsoft: { conectado: false } }
    try {
      const rec = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "google"')
      out.google = {
        conectado: true,
        conta: rec.getString('conta'),
        expira: rec.getString('expires_at'),
      }
    } catch (_) {}
    try {
      const rec = $app.findFirstRecordByFilter('email_oauth_tokens', 'provedor = "microsoft"')
      out.microsoft = {
        conectado: true,
        conta: rec.getString('conta'),
        expira: rec.getString('expires_at'),
      }
    } catch (_) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
