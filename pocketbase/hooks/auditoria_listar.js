// Fase 3 — Lista os últimos registros de auditoria (somente Admin).
// redeploy v2 — arquivo não subiu no build v0.0.10 (deploy gap)
routerAdd(
  'GET',
  '/backend/v1/auditoria',
  (e) => {
    const auth = e.auth
    let isAdmin = false
    if (auth) {
      try {
        const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
        isAdmin = g.getString('nome') === 'Admin'
      } catch (_) {}
    }
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const q = e.requestInfo().query || {}
    const limit = Math.min(parseInt(q.limit || '100', 10) || 100, 300)
    const rows = $app.findRecordsByFilter('auditoria', "id != ''", '-created', limit, 0)
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      out.push({
        id: r.id,
        created: r.getDateTime('created').string(),
        usuario_email: r.getString('usuario_email'),
        acao: r.getString('acao'),
        modulo: r.getString('modulo'),
        ip: r.getString('ip'),
      })
    }
    return e.json(200, { registros: out })
  },
  $apis.requireAuth(),
)
