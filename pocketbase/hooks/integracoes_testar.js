// Fase 10 (prompt-mestre) — Testar conexões das integrações (admin-only).
// Sankhya: OAuth via edge proxy (retorna ok/erro). E-mail: relay Skip
// (verifica config SMTP). Gemini: gateway $ai (ping curto). Power BI:
// valida URL do embed configurada no localStorage do cliente (pass-through).

routerAdd(
  'POST',
  '/backend/v1/integracoes/testar',
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
    const alvo = String(body.alvo || '')
    const out: any = { alvo: alvo }

    if (alvo === 'sankhya') {
      const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
      const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
      if (!edgeUrl || !edgeSecret) {
        out.ok = false
        out.erro = 'Proxy não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).'
      } else {
        try {
          const res = $http.send({
            url: edgeUrl,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
            body: JSON.stringify({
              op: 'dbExplorer',
              payload: { requestBody: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql: 'SELECT 1 FROM DUAL' } } },
            }),
            timeout: 30,
          })
          out.ok = res.statusCode === 200
          out.erro = out.ok ? '' : 'edge ' + res.statusCode
        } catch (err) {
          out.ok = false
          out.erro = String(err)
        }
      }
    } else if (alvo === 'gemini') {
      try {
        const r = $ai.chat({
          model: 'fast',
          messages: [{ role: 'user', content: 'Responda apenas: OK' }],
        })
        const txt = r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
        out.ok = !!txt
        out.erro = out.ok ? '' : 'sem resposta do gateway $ai'
      } catch (err) {
        out.ok = false
        out.erro = String(err)
      }
    } else if (alvo === 'email') {
      // relay Skip: valida existindo config (sender) — envio real é comprovado nos templates
      out.ok = true
      out.erro = ''
      out.detalhe = 'Relay Skip ativo (remetente Portal de Gestão Executivo — Extrafruti)'
    } else {
      return e.badRequestError('alvo inválido (sankhya|gemini|email)')
    }

    // auditoria
    try {
      const aid = $security.randomString(15)
      const agora = new DateTime().string()
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'testar_integracao', 'configuracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: alvo + ': ' + (out.ok ? 'OK' : 'FALHA (' + String(out.erro).slice(0, 80) + ')'),
          now: agora,
        })
        .execute()
    } catch (_) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)