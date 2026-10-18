// Fase 3 — CRUD de usuários (Controle de Acessos). Somente Admin.
// redeploy v2 — arquivo não subiu no build v0.0.10 (deploy gap)
// POST cria usuário (grupo/empresa/unidade/ativo); PATCH edita vínculos;
// GET lista usuários com grupo expandido. Auditoria em toda ação.
routerAdd(
  'POST',
  '/backend/v1/usuarios',
  (e) => {
    const body = e.requestInfo().body || {}
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
    const email = String(body.email || '').toLowerCase()
    const senha = String(body.senha || '')
    if (!email || senha.length < 8) {
      return e.badRequestError('email e senha (min 8) são obrigatórios')
    }
    try {
      $app.findAuthRecordByEmail('users', email)
      return e.badRequestError('E-mail já cadastrado')
    } catch (_) {}
    const users = $app.findCollectionByNameOrId('users')
    const rec = new Record(users)
    rec.setEmail(email)
    rec.setPassword(senha)
    rec.setVerified(true)
    rec.set('name', String(body.nome || ''))
    rec.set('cargo', String(body.cargo || ''))
    rec.set('ativo', body.ativo !== false)
    if (body.grupo_id) rec.set('grupo_id', body.grupo_id)
    if (body.empresa_id) rec.set('empresa_id', body.empresa_id)
    if (body.unidade_id) rec.set('unidade_id', body.unidade_id)
    try {
      $app.save(rec)
    } catch (err) {
      return e.badRequestError('Dados inválidos: ' + String(err))
    }
    try {
      const col = $app.findCollectionByNameOrId('auditoria')
      const a = new Record(col)
      if (auth) {
        a.set('usuario_id', auth.id)
        a.set('usuario_email', auth.getString('email'))
      }
      a.set('acao', 'criar')
      a.set('modulo', 'usuarios')
      a.set('detalhe', { email: email })
      $app.save(a)
    } catch (_) {}
    return e.json(200, { id: rec.id, email: email })
  },
  $apis.requireAuth(),
)
