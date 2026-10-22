// TAREFA C — config do WhatsApp (espelho do whatsapp-service do Foldbox):
// GET /backend/v1/integracoes/whatsapp/config → config mascarada + flags
// POST /backend/v1/integracoes/whatsapp/config → salva (preserva segredos
// mascarados/em branco) + auditoria. Estado em integracoes_config (JSONB).
// v12 (22/10): cfg.get('config') no JSVM devolve o JSONB como ARRAY DE CHAR
// CODES numéricos (não objeto, não strings) — decodifica com fromCharCode em
// blocos antes do JSON.parse (causa do GET config vazio). cfgObj é INLINE em
// cada callback (JSVM não acessa declarações top-level).

routerAdd(
  'GET',
  '/backend/v1/integracoes/whatsapp/config',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const cfgObj = (cfg) => {
      if (!cfg) return {}
      let c = cfg.get('config')
      if (Array.isArray(c)) {
        // JSVM: array de char codes numéricos (v12b) OU de chars string
        if (c.length && typeof c[0] === 'number') {
          let s = ''
          for (let i = 0; i < c.length; i += 65536) {
            s += String.fromCharCode.apply(null, c.slice(i, i + 65536))
          }
          c = s
        } else {
          c = c.join('')
        }
      }
      if (typeof c === 'string') {
        try {
          c = JSON.parse(c)
        } catch (_) {
          c = {}
        }
      }
      return c && typeof c === 'object' && !Array.isArray(c) ? c : {}
    }
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    const c = cfgObj(cfg) // v12: JSONB pode virar array de char codes no JSVM
    const rawToken = String(c.access_token || '').trim()
    const rawSecret = String(c.app_secret || '').trim()
    const mask = function (v, keep) {
      if (!v) return ''
      if (v.length <= keep) return '••••••'
      return v.slice(0, keep) + '••••••••' + v.slice(-4)
    }
    const hasToken = !!rawToken && !rawToken.startsWith('••••')
    const hasSecret = !!rawSecret && !rawSecret.startsWith('••••')
    return e.json(200, {
      success: true,
      config: {
        phone_number_id: c.phone_number_id || '',
        phone_number_display: c.phone_number_display || '',
        waba_id: c.waba_id || '',
        verify_token: c.verify_token || '',
        notification_phone: c.notification_phone || '',
        is_active: !!c.is_active,
        welcome_message: c.welcome_message || '',
        access_token: hasToken ? mask(rawToken, 7) : '',
        app_secret: hasSecret ? mask(rawSecret, 4) : '',
        last_tested_at: c.last_tested_at || null,
        last_test_result: c.last_test_result || null,
      },
      has_access_token: hasToken,
      has_app_secret: hasSecret,
      atualizado_em: cfg ? cfg.getDateTime('updated').string() : null,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/integracoes/whatsapp/config',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const cfgObj = (cfg) => {
      if (!cfg) return {}
      let c = cfg.get('config')
      if (Array.isArray(c)) {
        if (c.length && typeof c[0] === 'number') {
          let s = ''
          for (let i = 0; i < c.length; i += 65536) {
            s += String.fromCharCode.apply(null, c.slice(i, i + 65536))
          }
          c = s
        } else {
          c = c.join('')
        }
      }
      if (typeof c === 'string') {
        try {
          c = JSON.parse(c)
        } catch (_) {
          c = {}
        }
      }
      return c && typeof c === 'object' && !Array.isArray(c) ? c : {}
    }
    let isAdmin = false
    try {
      const g = $app.findRecordById('grupos_permissao', auth.getString('grupo_id'))
      isAdmin = g.getString('nome') === 'Admin'
    } catch (_) {}
    if (!isAdmin && !e.hasSuperuserAuth()) {
      throw new ForbiddenError('Acesso restrito a administradores.')
    }
    const body = e.requestInfo().body || {}
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    const atual = cfgObj(cfg) // v12: JSONB pode virar array de char codes no JSVM
    // preserva segredos quando o valor vem mascarado/em branco
    const novoToken = String(body.access_token || '').trim()
    const novoSecret = String(body.app_secret || '').trim()
    const config = {
      phone_number_id: String(body.phone_number_id || '').trim(),
      phone_number_display: String(body.phone_number_display || '').trim(),
      waba_id: String(body.waba_id || '').trim(),
      verify_token: String(
        body.verify_token !== undefined && body.verify_token !== ''
          ? body.verify_token
          : atual.verify_token || '',
      ).trim(),
      notification_phone: String(body.notification_phone || '').trim(),
      is_active: !!body.is_active,
      welcome_message: String(body.welcome_message || '').trim(),
      access_token:
        novoToken && !novoToken.startsWith('••••') ? novoToken : atual.access_token || '',
      app_secret:
        novoSecret && !novoSecret.startsWith('••••') ? novoSecret : atual.app_secret || '',
    }
    if (cfg) {
      cfg.set('config', config)
      cfg.set('atualizado_por', auth.getString('email'))
      $app.save(cfg)
    } else {
      const col = $app.findCollectionByNameOrId('integracoes_config')
      const r = new Record(col)
      r.set('integracao', 'whatsapp')
      r.set('config', config)
      r.set('atualizado_por', auth.getString('email'))
      $app.save(r)
    }
    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'whatsapp_config_salvar', 'integracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'WhatsApp config salva (ativo=' + (config.is_active ? 'sim' : 'não') + ')',
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}
    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)

// POST /backend/v1/integracoes/whatsapp/importar → importa credenciais do Foldbox
// (edge pge-whatsapp-export, autenticada por X-PGE-Secret) e grava local.
routerAdd(
  'POST',
  '/backend/v1/integracoes/whatsapp/importar',
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

    const edgeUrl = $secrets.get('PGE_EDGE_URL') || ''
    const edgeSecret = $secrets.get('PGE_PROXY_SECRET') || ''
    if (!edgeUrl || !edgeSecret) {
      return e.json(502, {
        ok: false,
        erro: 'Proxy não configurado (PGE_EDGE_URL/PGE_PROXY_SECRET).',
      })
    }

    // edge do foldbox: substitui o nome da função pela export do whatsapp
    const exportUrl = edgeUrl.replace(
      /\/functions\/v1\/[^/]+$/,
      '/functions/v1/pge-whatsapp-export',
    )
    let resp
    try {
      resp = $http.send({
        url: exportUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PGE-Secret': edgeSecret },
        body: '{}',
        timeout: 20,
      })
    } catch (err) {
      return e.json(502, { ok: false, erro: 'Falha na edge: ' + String(err).slice(0, 120) })
    }
    if (resp.statusCode !== 200) {
      return e.json(200, { ok: false, erro: 'edge ' + resp.statusCode })
    }
    const d = resp.json || {}
    if (!d.ok) {
      return e.json(200, { ok: false, erro: d.erro || 'sem credenciais no Foldbox' })
    }

    // grava em integracoes_config (integração 'whatsapp')
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    const config = {
      phone_number_id: d.phone_number_id || '',
      phone_number_display: d.phone_display || '',
      waba_id: d.waba_id || '',
      verify_token: d.verify_token || '',
      access_token: d.access_token || '',
      app_secret: '',
      is_active: true,
      welcome_message: 'Olá! Bem-vindo ao atendimento via WhatsApp.',
      importado_de: 'foldbox',
      importado_em: new DateTime().string(),
    }
    if (cfg) {
      cfg.set('config', config)
      cfg.set('atualizado_por', auth.getString('email'))
      $app.save(cfg)
    } else {
      const col = $app.findCollectionByNameOrId('integracoes_config')
      const r = new Record(col)
      r.set('integracao', 'whatsapp')
      r.set('config', config)
      r.set('atualizado_por', auth.getString('email'))
      $app.save(r)
    }
    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'whatsapp_importar', 'integracoes', 'Credenciais importadas do Foldbox', {:now}, {:now})",
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
      ok: true,
      phone_display: d.phone_display || '',
      waba_id: d.waba_id || '',
    })
  },
  $apis.requireAuth(),
)

// POST /backend/v1/integracoes/whatsapp/testar → testa token contra a Graph API
routerAdd(
  'POST',
  '/backend/v1/integracoes/whatsapp/testar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const cfgObj = (cfg) => {
      if (!cfg) return {}
      let c = cfg.get('config')
      if (Array.isArray(c)) {
        if (c.length && typeof c[0] === 'number') {
          let s = ''
          for (let i = 0; i < c.length; i += 65536) {
            s += String.fromCharCode.apply(null, c.slice(i, i + 65536))
          }
          c = s
        } else {
          c = c.join('')
        }
      }
      if (typeof c === 'string') {
        try {
          c = JSON.parse(c)
        } catch (_) {
          c = {}
        }
      }
      return c && typeof c === 'object' && !Array.isArray(c) ? c : {}
    }
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'whatsapp'")
    } catch (_) {}
    const c = cfgObj(cfg) // v12: JSONB pode virar array de char codes no JSVM
    const token = String(c.access_token || '').trim()
    const phoneId = String(c.phone_number_id || '').trim()
    if (!token || !phoneId) {
      return e.json(200, {
        success: false,
        ok: false,
        erro: 'Credenciais incompletas — informe Phone Number ID e Access Token.',
      })
    }
    let ok = false
    let detalhe = ''
    try {
      const res = $http.send({
        url:
          'https://graph.facebook.com/v21.0/' +
          phoneId +
          '?fields=display_phone_number,verified_name,quality_rating',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        timeout: 15,
      })
      if (res.statusCode === 200) {
        const d = res.json || {}
        ok = true
        detalhe =
          'Conectado: ' + (d.display_phone_number || '') + ' (' + (d.verified_name || '') + ')'
      } else {
        const d = res.json || {}
        detalhe =
          'Meta ' + res.statusCode + ': ' + ((d.error && d.error.message) || 'erro desconhecido')
      }
    } catch (err) {
      detalhe = String(err).slice(0, 160)
    }
    try {
      if (cfg) {
        // v12: parte do objeto NORMALIZADO (não do get() cru que vira array)
        const cfg2 = cfgObj(cfg)
        cfg2.last_tested_at = new DateTime().string()
        cfg2.last_test_result = { ok: ok, detalhe: detalhe, quando: new DateTime().string() }
        cfg.set('config', cfg2)
        $app.save(cfg)
      }
    } catch (_) {}
    // auditoria
    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'testar_integracao', 'integracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'whatsapp: ' + (ok ? 'OK' : 'FALHA (' + detalhe.slice(0, 80) + ')'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}
    return e.json(200, { success: true, ok: ok, detalhe: detalhe })
  },
  $apis.requireAuth(),
)
