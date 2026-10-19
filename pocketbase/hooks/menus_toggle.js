// Fase 11 — Toggle ativo de item do menu (admin-only).
// PATCH /backend/v1/menus/toggle  body: { id, ativo }
// A coleção menus tem updateRule null (Fase 2) — edições passam por aqui.

routerAdd(
  'PATCH',
  '/backend/v1/menus/toggle',
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
    const id = String(body.id || '')
    if (!id) return e.badRequestError('id obrigatório')

    let item
    try {
      item = $app.findRecordById('menus', id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Menu não encontrado.' })
    }
    item.set('ativo', body.ativo === true)
    try {
      $app.save(item)
    } catch (err) {
      return e.json(500, { ok: false, erro: String(err) })
    }

    // Auditoria
    try {
      const aid = $security.randomString(15)
      const agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'toggle_menu', 'arvore-menus', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: item.getString('titulo') + ' → ' + (body.ativo === true ? 'ativo' : 'inativo'),
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, ativo: body.ativo === true })
  },
  $apis.requireAuth(),
)
