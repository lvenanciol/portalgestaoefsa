// Fase 9 — Salva botões ocultos por grupo (admin-only).
// POST /backend/v1/botoes/salvar  body: { grupo_id, botoes: {screen: [keys]} }
// Grava em grupos_permissao.permissoes.botoes (JSONB) e registra auditoria.

routerAdd(
  'POST',
  '/backend/v1/botoes/salvar',
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
    const grupoId = String(body.grupo_id || '')
    const botoes = body.botoes
    if (!grupoId) return e.badRequestError('grupo_id obrigatório')
    if (!botoes || typeof botoes !== 'object') return e.badRequestError('botoes obrigatório')

    let grupo
    try {
      grupo = $app.findRecordById('grupos_permissao', grupoId)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'Grupo não encontrado.' })
    }

    // preserva o resto do JSON de permissões
    let permissoes = {}
    try {
      const raw = grupo.getString('permissoes')
      permissoes = raw ? JSON.parse(raw) : {}
    } catch (_) {
      permissoes = {}
    }
    permissoes['botoes'] = botoes

    try {
      grupo.set('permissoes', JSON.stringify(permissoes))
      $app.save(grupo)
    } catch (err) {
      return e.json(500, { ok: false, erro: 'Falha ao salvar: ' + String(err) })
    }

    // Auditoria
    try {
      const id = $security.randomString(15)
      const agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'salvar_botoes_grupo', 'controle-acessos', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'grupo ' + grupo.getString('nome') + ': ' + JSON.stringify(botoes).slice(0, 500),
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
