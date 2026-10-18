// Fase 5 — Proxy Sankhya do PGE via edge do Foldbox (egress autorizado).
// O pod Skip não tem IP na allowlist do app OAuth Sankhya (401
// invalid_client provado 18/10; teste direto do Supabase OK 19:32).
// Fluxo: hook (admin-only) → edge sankhya-proxy-pge (Foldbox, IPs
// Supabase autorizados) → Sankhya. Autenticação da edge: header
// X-PGE-Secret com o segredo compartilhado PGE_PROXY_SECRET.

routerAdd(
  'POST',
  '/backend/v1/sankhya/proxy',
  (e) => {
    const body = e.requestInfo().body || {}
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    // Somente Admin chama o proxy
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }

    const op = String(body.op || '')
    if (!op) return e.badRequestError('op é obrigatório')
    const payload = body.payload || {}

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, {
        ok: false,
        erro: 'Proxy não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).',
      })
    }

    let resposta
    try {
      const res = $http.send({
        url: edgeUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
        body: JSON.stringify({ op: op, payload: payload }),
        timeout: 45,
      })
      let parsed = null
      try {
        parsed = res.json
      } catch (_) {
        parsed = { raw: String(res.body).slice(0, 2000) }
      }
      resposta = { status: res.statusCode, data: parsed }
    } catch (err) {
      $app.logger().error('sankhya_proxy: erro na edge', 'error', String(err))
      return e.json(502, { ok: false, erro: 'Falha na edge proxy: ' + String(err) })
    }

    // Auditoria da operação (best-effort)
    try {
      const id = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'sankhya_proxy', 'financeiro', {:det}, {:now}, {:now})",
        )
        .bind({
          id: id,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: op + (payload.serviceName ? ' ' + payload.serviceName : ''),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    const d = resposta.data || {}
    return e.json(200, {
      ok: resposta.status === 200 && d.ok !== false,
      via: d.via || null,
      status: resposta.status,
      data: d.data !== undefined ? d.data : d,
    })
  },
  $apis.requireAuth(),
)
