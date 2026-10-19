// TAREFA A — status das integrações (espelho do edge integracoes-status do
// Foldbox, adaptado ao PGE/Skip Cloud): sankhya (OAuth via edge proxy),
// email (relay Skip + OAuth real), gemini ($ai), powerbi (client id salvo),
// whatsapp (integracoes_config + teste Meta opcional). Auditoria em cada load.

routerAdd(
  'GET',
  '/backend/v1/integracoes/status',
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

    const integracoes = {}

    // ---- Sankhya: OAuth serviço-serviço via edge proxy (Foldbox) ----
    try {
      const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
      const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
      const st = {
        configurado: !!(edgeUrl && edgeSecret),
        credenciais_cofre: !!(edgeUrl && edgeSecret),
      }
      if (edgeUrl && edgeSecret) {
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
            timeout: 25,
          })
          st.ok = res.statusCode === 200
          if (!st.ok) st.erro = 'edge ' + res.statusCode
        } catch (err) {
          st.ok = false
          st.erro = String(err).slice(0, 160)
        }
      } else {
        st.ok = false
        st.erro = 'Proxy Sankhya não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).'
      }
      // últimas ações de sync (auditoria)
      try {
        const rows = $app.findRecordsByFilter(
          'auditoria',
          "acao = 'sankhya_sync' || acao = 'sankhya_logout' || acao = 'testar_integracao'",
          '-created',
          5,
          0,
        )
        st.ultimas_acoes = rows.map(function (r) {
          return {
            created_at: r.getDateTime('created').string(),
            action: r.getString('acao'),
            user_email: r.getString('usuario_email'),
          }
        })
      } catch (_) {}
      integracoes.sankhya = st
    } catch (err) {
      integracoes.sankhya = { ok: false, erro: String(err).slice(0, 160) }
    }

    // ---- E-mail: relay Skip + OAuth real (Gmail/Outlook) ----
    try {
      const st = { relay: 'Skip — remetente Portal de Gestão Executivo — Extrafruti', ok: true }
      const provs = {}
      for (const prov of ['google', 'microsoft']) {
        try {
          const r = $app.findFirstRecordByFilter('email_oauth_tokens', 'provider = "' + prov + '"')
          provs[prov] = { conectado: true, conta: r.getString('conta') || '' }
        } catch (_) {
          provs[prov] = { conectado: false }
        }
      }
      st.oauth = provs
      integracoes.email = st
    } catch (err) {
      integracoes.email = { ok: false, erro: String(err).slice(0, 160) }
    }

    // ---- Gemini: gateway $ai (ping curto) ----
    try {
      const r = $ai.chat({
        model: 'fast',
        messages: [{ role: 'user', content: 'Responda apenas: OK' }],
      })
      const txt =
        r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
      integracoes.gemini = {
        ok: !!txt,
        model: 'fast',
        erro: txt ? '' : 'sem resposta do gateway $ai',
      }
    } catch (err) {
      integracoes.gemini = { ok: false, erro: String(err).slice(0, 160) }
    }

    // ---- Power BI: client id salvo no navegador (pass-through do front) ----
    integracoes.powerbi = {
      ok: true,
      detalhe: 'Embed para organização — client ID Entra ID no navegador',
    }

    // ---- WhatsApp: config em integracoes_config ----
    try {
      let cfg = null
      try {
        cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
      } catch (_) {}
      const c = cfg ? cfg.get('config') || {} : {}
      const ativo = !!c.is_active
      const temToken = !!(c.access_token && String(c.access_token).trim())
      const temPhoneId = !!(c.phone_number_id && String(c.phone_number_id).trim())
      const st = {
        ativo: ativo,
        phone_display: c.phone_number_display || '',
        credenciais_ok: temToken && temPhoneId,
        webhook_verify: c.verify_token ? 'definido' : 'ausente',
        ultima_mensagem: c.last_test_result || null,
      }
      if (temToken && c.waba_id) {
        try {
          const res = $http.send({
            url: 'https://graph.facebook.com/v21.0/' + String(c.waba_id) + '/phone_numbers',
            method: 'GET',
            headers: { Authorization: 'Bearer ' + String(c.access_token) },
            timeout: 15,
          })
          st.meta_ok = res.statusCode === 200
          if (res.statusCode === 200) {
            const d = res.json || {}
            const arr = (d.data || [])[0]
            if (arr) {
              st.phone_display = arr.display_phone_number || arr.verified_name || st.phone_display
              st.quality = arr.quality_rating || ''
            }
          } else {
            st.meta_erro = 'Meta API ' + res.statusCode
          }
        } catch (err2) {
          st.meta_ok = false
          st.meta_erro = String(err2).slice(0, 120)
        }
      }
      integracoes.whatsapp = st
    } catch (err) {
      integracoes.whatsapp = { ok: false, erro: String(err).slice(0, 160) }
    }

    // auditoria do load
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'integracoes_status', 'integracoes', 'status consultado', {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, {
      success: true,
      gerado_em: new DateTime().string(),
      integracoes: integracoes,
    })
  },
  $apis.requireAuth(),
)
