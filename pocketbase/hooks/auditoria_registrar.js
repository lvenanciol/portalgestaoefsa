// Fase 3 — Registra ação na trilha de auditoria (qualquer autenticado).
// Body: { acao, modulo?, detalhe? }. Em acao=login também carimba ultimo_login.
// INSERT via SQL puro (id/created/updated gerados aqui).
routerAdd(
  'POST',
  '/backend/v1/auditoria',
  (e) => {
    const body = e.requestInfo().body || {}
    const acao = String(body.acao || '').slice(0, 80)
    if (!acao) return e.badRequestError('acao é obrigatório')
    const auth = e.auth
    const id = $security.randomString(15)
    const agora = new DateTime().string()
    const ip = (e.request.remoteAddr || '').split(':')[0]
    try {
      $app
        .db()
        .newQuery(
          'INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, ip, created, updated) VALUES ({:id}, {:uid}, {:uemail}, {:acao}, {:modulo}, {:ip}, {:now}, {:now})',
        )
        .bind({
          id: id,
          uid: auth ? auth.id : '',
          uemail: auth ? auth.getString('email') : '',
          acao: acao,
          modulo: body.modulo ? String(body.modulo).slice(0, 80) : '',
          ip: ip,
          now: agora,
        })
        .execute()
      if (acao === 'login' && auth) {
        try {
          $app
            .db()
            .newQuery('UPDATE users SET ultimo_login = {:now} WHERE id = {:id}')
            .bind({ now: agora, id: auth.id })
            .execute()
        } catch (_) {}
      }
      return e.json(200, { ok: true, id: id })
    } catch (err) {
      $app.logger().error('auditoria_registrar falhou', 'error', String(err))
      return e.json(500, { ok: false })
    }
  },
  $apis.requireAuth(),
)
