// Fase 3 — Registra ação na trilha de auditoria (qualquer autenticado).
// Body: { acao, modulo?, detalhe? }. Em acao=login também carimba ultimo_login.
routerAdd(
  'POST',
  '/backend/v1/auditoria',
  (e) => {
    const body = e.requestInfo().body || {}
    const acao = String(body.acao || '').slice(0, 80)
    if (!acao) return e.badRequestError('acao é obrigatório')
    const auth = e.auth
    try {
      const col = $app.findCollectionByNameOrId('auditoria')
      const rec = new Record(col)
      if (auth) {
        rec.set('usuario_id', auth.id)
        rec.set('usuario_email', auth.getString('email'))
      }
      rec.set('acao', acao)
      if (body.modulo) rec.set('modulo', String(body.modulo).slice(0, 80))
      if (body.detalhe) rec.set('detalhe', body.detalhe)
      const ip = (e.request.remoteAddr || '').split(':')[0]
      rec.set('ip', ip)
      $app.save(rec)
      if (acao === 'login' && auth) {
        try {
          const u = $app.findRecordById('users', auth.id)
          u.set('ultimo_login', new DateTime().string())
          $app.save(u)
        } catch (_) {}
      }
      return e.json(200, { ok: true })
    } catch (err) {
      $app.logger().error('auditoria_registrar falhou', 'error', String(err))
      return e.json(500, { ok: false })
    }
  },
  $apis.requireAuth(),
)
