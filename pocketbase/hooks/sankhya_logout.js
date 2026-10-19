// Ajustes PGE — T8: logout na integração Sankhya ao encerrar sessão.
// A sessão Sankhya do PGE é OAuth serviço-serviço via edge proxy (Foldbox).
// Este hook: (1) limpa qualquer cache de token Sankhya local e (2) pede à
// edge proxy que invalide o token em cache (op 'logout', best-effort —
// edges antigas ignoram op desconhecida). Chamado pelo front no signOut
// (manual ou por inatividade).

routerAdd(
  'POST',
  '/backend/v1/sankhya/logout-sessao',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    let edgeOk = false
    if (edgeUrl && edgeSecret) {
      try {
        const res = $http.send({
          url: edgeUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
          body: JSON.stringify({ op: 'logout', payload: {} }),
          timeout: 10,
        })
        edgeOk = res.statusCode === 200
      } catch (_) {
        edgeOk = false
      }
    }

    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'sankhya_logout', 'configuracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'logout Sankhya ' + (edgeOk ? 'confirmado na edge' : 'solicitado (edge sem ack)'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, edge_ok: edgeOk })
  },
  $apis.requireAuth(),
)
