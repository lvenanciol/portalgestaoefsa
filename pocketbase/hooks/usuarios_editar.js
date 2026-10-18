// Fase 3 — Editar vínculos/status de um usuário (Controle de Acessos). Somente Admin.
routerAdd(
  'PATCH',
  '/backend/v1/usuarios/{id}',
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
    const id = e.request.pathValue('id')
    let rec
    try {
      rec = $app.findRecordById('users', id)
    } catch (_) {
      return e.notFoundError('Usuário não encontrado')
    }
    if (body.nome !== undefined) rec.set('name', String(body.nome))
    if (body.cargo !== undefined) rec.set('cargo', String(body.cargo))
    if (body.ativo !== undefined) rec.set('ativo', Boolean(body.ativo))
    if (body.grupo_id !== undefined) rec.set('grupo_id', body.grupo_id)
    if (body.empresa_id !== undefined) rec.set('empresa_id', body.empresa_id)
    if (body.unidade_id !== undefined) rec.set('unidade_id', body.unidade_id)
    if (body.senha) {
      if (String(body.senha).length < 8) return e.badRequestError('senha mínima de 8 caracteres')
      rec.setPassword(String(body.senha))
    }
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
      a.set('acao', 'editar')
      a.set('modulo', 'usuarios')
      a.set('detalhe', { usuario: id, campos: Object.keys(body) })
      $app.save(a)
    } catch (_) {}
    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
