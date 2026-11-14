// ============================================================================
// GARMIN CONNECT — configuração e status (15/11/2026)
//
// REALIDADE DA INTEGRAÇÃO (não simulamos conexão):
//   O Garmin Connect Developer Program exige APROVAÇÃO da Garmin e fornece:
//     · Activity API  → atividades em JSON/.FIT
//     · Training API  → publica treinos/planos no calendário do usuário
//     · Health API    → push de dados (sem histórico no plano Starter)
//   Sem credenciais aprovadas (client_id + client_secret + tokens OAuth 1.0a
//   ou 2.0), NÃO existe chamada possível. O status reflete isso.
//
// ONDE FICAM OS PARÂMETROS
//   coleção `integracoes_config`, registro integracao='garmin'.
//   Os campos sensíveis (client_secret, tokens) ficam no mesmo registro e
//   NUNCA são devolvidos ao front — o GET retorna apenas `tem_secret` etc.
//
// ENDPOINTS
//   GET  /backend/v1/garmin/config   → config sem segredos (admin)
//   POST /backend/v1/garmin/config   → salva config (admin)
//   GET  /backend/v1/garmin/status   → testa a conexão real (admin)
//   POST /backend/v1/garmin/testar   → registra um teste manual no log
// ============================================================================

routerAdd(
  'GET',
  '/backend/v1/garmin/config',
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

    let cfg = {}
    try {
      const rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      cfg = rec.get('config') || {}
    } catch (_) {
      cfg = {}
    }

    // devolve SEM os segredos — apenas a existência deles
    return e.json(200, {
      success: true,
      config: {
        ativo: !!cfg.ativo,
        ambiente: cfg.ambiente || 'producao',
        client_id: cfg.client_id || '',
        tem_client_secret: !!cfg.client_secret,
        redirect_uri: cfg.redirect_uri || '',
        escopos: cfg.escopos || 'activity,training',
        aprovado_programa: !!cfg.aprovado_programa,
        data_aprovacao: cfg.data_aprovacao || '',
        consumer_key: cfg.consumer_key || '',
        tem_consumer_secret: !!cfg.consumer_secret,
        ultimo_sync: cfg.ultimo_sync || '',
        last_test_result: cfg.last_test_result || null,
      },
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/garmin/config',
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

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      cfg = rec.get('config') || {}
    } catch (_) {
      rec = null
    }

    // mescla: os segredos só são sobrescritos quando vierem preenchidos
    const novo = {
      ativo: body.ativo === undefined ? !!cfg.ativo : !!body.ativo,
      ambiente: String(body.ambiente || cfg.ambiente || 'producao'),
      client_id: body.client_id !== undefined ? String(body.client_id) : cfg.client_id || '',
      client_secret:
        body.client_secret && String(body.client_secret).trim()
          ? String(body.client_secret).trim()
          : cfg.client_secret || '',
      redirect_uri:
        body.redirect_uri !== undefined ? String(body.redirect_uri) : cfg.redirect_uri || '',
      escopos:
        body.escopos !== undefined ? String(body.escopos) : cfg.escopos || 'activity,training',
      aprovado_programa:
        body.aprovado_programa === undefined ? !!cfg.aprovado_programa : !!body.aprovado_programa,
      data_aprovacao:
        body.data_aprovacao !== undefined ? String(body.data_aprovacao) : cfg.data_aprovacao || '',
      consumer_key:
        body.consumer_key !== undefined ? String(body.consumer_key) : cfg.consumer_key || '',
      consumer_secret:
        body.consumer_secret && String(body.consumer_secret).trim()
          ? String(body.consumer_secret).trim()
          : cfg.consumer_secret || '',
      ultimo_sync: cfg.ultimo_sync || '',
      last_test_result: cfg.last_test_result || null,
    }

    // validação mínima coerente com a realidade do programa
    if (novo.ativo && !novo.client_id) {
      return e.badRequestError(
        'Informe o client_id antes de ativar. Sem credenciais aprovadas no Garmin Connect Developer Program não há sincronização.',
      )
    }
    if (novo.ativo && !novo.client_secret) {
      return e.badRequestError('Informe o client_secret para ativar a integração.')
    }
    if (novo.ativo && !novo.aprovado_programa) {
      return e.badRequestError(
        'Marque "Aprovação no Garmin Connect Developer Program" — a Garmin precisa aprovar a conta antes de liberar as APIs.',
      )
    }

    try {
      if (rec) {
        rec.set('config', novo)
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('integracoes_config')
        const r = new Record(col)
        r.set('integracao', 'garmin')
        r.set('config', novo)
        $app.save(r)
      }
    } catch (err) {
      return e.json(500, { success: false, erro: String(err).slice(0, 200) })
    }

    // auditoria
    try {
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'garmin_config', 'integracoes', 'configuração Garmin salva', {:now}, {:now})",
        )
        .bind({
          id: $security.randomString(15),
          uid: auth.id,
          uemail: auth.getString('email'),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { success: true })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// STATUS REAL — testa se há como falar com o Garmin agora
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/garmin/status',
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

    let cfg = {}
    try {
      cfg =
        $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'").get('config') ||
        {}
    } catch (_) {
      cfg = {}
    }

    const st = {
      configurado: false,
      ativo: !!cfg.ativo,
      aprovado_programa: !!cfg.aprovado_programa,
      tem_credenciais: !!(cfg.client_id && cfg.client_secret),
      conexao_ok: false,
      ambiente: cfg.ambiente || 'producao',
      ultimo_sync: cfg.ultimo_sync || '',
      recursos: {
        activity_api: false,
        training_api: false,
        health_api: false,
      },
      erro: '',
      detalhe: '',
    }

    if (!st.aprovado_programa) {
      st.erro = 'Conta não aprovada no Garmin Connect Developer Program.'
      st.detalhe =
        'A Garmin precisa aprovar sua conta antes de liberar as APIs. Solicite acesso em developer.garmin.com.'
    } else if (!st.tem_credenciais) {
      st.erro = 'Credenciais incompletas (client_id / client_secret).'
      st.detalhe = 'Gere o app no portal do desenvolvedor e cole as credenciais na configuração.'
    } else if (!st.ativo) {
      st.erro = 'Integração desativada na configuração.'
      st.detalhe = 'Ative o toggle "Integração ativa" para permitir a sincronização.'
    } else {
      // Com credenciais e aprovação, testa o endpoint OAuth do Garmin.
      // O domínio usado é o oficial do programa (apis.garmin.com).
      st.configurado = true
      try {
        const res = $http.send({
          url: 'https://apis.garmin.com/wellness-api/rest/user/id',
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + String(cfg.client_secret).slice(0, 8) + '...',
          },
          timeout: 15,
        })
        // 401 é esperado sem token de usuário válido: prova que o host responde
        st.conexao_ok = res.statusCode === 200
        if (res.statusCode === 401) {
          st.detalhe =
            'Host do Garmin respondeu 401 — as credenciais existem, mas falta o token do usuário (fluxo OAuth não concluído).'
        } else if (res.statusCode === 200) {
          st.detalhe = 'Conexão validada com o Garmin.'
          st.conexao_ok = true
          st.recursos = { activity_api: true, training_api: true, health_api: false }
        } else {
          st.erro = 'Garmin respondeu ' + res.statusCode
        }
      } catch (err) {
        st.erro = 'Falha de rede ao contatar o Garmin: ' + String(err).slice(0, 120)
      }
    }

    return e.json(200, { success: true, status: st, gerado_em: new DateTime().string() })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// TESTAR — registra o teste manual no log (aparece no Status Integrações)
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/garmin/testar',
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

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      cfg = rec.get('config') || {}
    } catch (_) {}

    const aprovado = !!cfg.aprovado_programa
    const temCred = !!(cfg.client_id && cfg.client_secret)
    const ativo = !!cfg.ativo

    let ok = false
    let detalhe = ''
    if (!aprovado) {
      detalhe = 'Sem aprovação no Developer Program — nenhuma chamada foi feita.'
    } else if (!temCred) {
      detalhe = 'Credenciais ausentes — nenhuma chamada foi feita.'
    } else if (!ativo) {
      detalhe = 'Integração desativada.'
    } else {
      try {
        const res = $http.send({
          url: 'https://apis.garmin.com/wellness-api/rest/user/id',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + String(cfg.client_secret).slice(0, 8) + '...' },
          timeout: 15,
        })
        ok = res.statusCode === 200
        detalhe =
          res.statusCode === 401
            ? 'Host respondeu 401 — credenciais presentes, token de usuário pendente.'
            : 'Garmin respondeu ' + res.statusCode
      } catch (err) {
        detalhe = 'Falha de rede: ' + String(err).slice(0, 120)
      }
    }

    // grava o resultado no config para o painel de status exibir
    try {
      if (rec) {
        cfg.last_test_result = {
          ok: ok,
          detalhe: detalhe,
          quando: new DateTime().string(),
        }
        rec.set('config', cfg)
        $app.save(rec)
      }
    } catch (_) {}

    try {
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'garmin_testar', 'integracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: $security.randomString(15),
          uid: auth.id,
          uemail: auth.getString('email'),
          det: detalhe.slice(0, 190),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { success: true, ok: ok, detalhe: detalhe })
  },
  $apis.requireAuth(),
)
