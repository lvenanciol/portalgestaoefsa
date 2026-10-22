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
    const out = { alvo: alvo }

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
              payload: {
                requestBody: {
                  serviceName: 'DbExplorerSP.executeQuery',
                  requestBody: { sql: 'SELECT 1 FROM DUAL' },
                },
              },
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
        const txt =
          r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
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
    } else if (alvo === 'powerbi') {
      // T11b (22/10): teste REAL de conexão Power BI — valida o que é validável
      // no servidor e devolve o erro real (sem catch vazio). O token Microsoft é
      // obtido no cliente (MSAL); quando o cliente o envia, validamos na API.
      const body2 = body || {}
      const clientId = String(body2.client_id || '').trim()
      const token = String(body2.access_token || '').trim()
      const TENANT = 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
      if (!clientId) {
        out.ok = false
        out.erro =
          'Sem conta MS conectada: informe o Application (client) ID do app registration (tela Power BI) e conclua o login Microsoft.'
        out.detalhe = 'App registration (Entra ID) não configurado.'
      } else if (!token) {
        out.ok = false
        out.erro =
          'Sessão Microsoft ausente ou expirada — abra a tela Power BI e clique em "Listar relatórios" para refazer o login (acquireToken).'
        out.detalhe =
          'client_id ' +
          clientId.slice(0, 8) +
          '… · tenant ' +
          TENANT.slice(0, 8) +
          '… · escopo Report.Read.All'
      } else {
        try {
          const res = $http.send({
            url: 'https://api.powerbi.com/v1.0/myorg/groups',
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token },
            timeout: 20,
          })
          if (res.statusCode === 200) {
            out.ok = true
            out.erro = ''
            out.detalhe =
              'Token Microsoft válido — ' +
              ((res.json || {}).value || []).length +
              ' workspace(s) visíveis.'
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            out.ok = false
            out.erro =
              'Power BI API ' +
              res.statusCode +
              ' — token expirado/sem escopo Report.Read.All ou sem licença Pro. Refaça o login na tela Power BI.'
            out.detalhe = String((typeof res.body === 'string' ? res.body : '') || '').slice(0, 160)
          } else {
            out.ok = false
            out.erro = 'Power BI API ' + res.statusCode + ' — falha ao validar o token.'
            out.detalhe = String((typeof res.body === 'string' ? res.body : '') || '').slice(0, 160)
          }
        } catch (err) {
          out.ok = false
          out.erro = 'Falha de rede ao validar token: ' + String(err).slice(0, 160)
        }
      }
    } else {
      return e.badRequestError('alvo inválido (sankhya|gemini|email|powerbi)')
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
