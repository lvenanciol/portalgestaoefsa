// ============================================================================
// GARMIN CONNECT — PERSONAL API (API key → access token) — 15/11/2026
//
// O print do dono mostra o fluxo REAL do "Garmin Connect Developer Program —
// Personal API":
//
//   POST https://personal.connectapi.garmin.com/personalapitoken-service/
//        personal-api/personal-api-key/token
//   Header: Authorization: ApiKey {your-api-key}
//
// A API key gera um ACCESS TOKEN de curta duração. Este hook:
//   · guarda a API key no backend (nunca volta ao navegador);
//   · obtém o token sob demanda;
//   · testa a conexão com o token;
//   · expõe o status real para a tela de monitoramento.
//
// DIFERENÇA da integração OAuth antiga: esta é a API PESSOAL (só o titular),
// não a empresarial. Ela não exige aprovação de app — a API key é a
// credencial. Mesmo assim, o token expira: precisamos renovar.
// ============================================================================

// NOTA DE IMPLEMENTAÇÃO: as funções auxiliares ficam INLINE dentro de cada
// callback. O JSVM do PocketBase executa callbacks em pool separado e um
// helper de topo causaria ReferenceError (lição do menus_crud.js).

routerAdd(
  'GET',
  '/backend/v1/garmin/personal/config',
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

    // devolve SEM a API key
    return e.json(200, {
      success: true,
      config: {
        modo: cfg.modo || 'personal',
        ativo: !!cfg.ativo,
        tem_api_key: !!(cfg.personal_api_key && String(cfg.personal_api_key).trim()),
        api_key_mascarada: cfg.personal_api_key
          ? String(cfg.personal_api_key).slice(0, 6) + '…' + String(cfg.personal_api_key).slice(-4)
          : '',
        token_validade: cfg.token_validade || '',
        ultimo_teste: cfg.last_test_result || null,
        ultimo_sync: cfg.ultimo_sync || '',
      },
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/garmin/personal/config',
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

    const apiKey = String(body.api_key || '').trim()

    // valida o formato mínimo da API key antes de gravar
    if (apiKey && apiKey.length < 20) {
      return e.badRequestError('A API key parece curta demais. Cole a chave completa do portal.')
    }

    cfg.modo = 'personal'
    if (apiKey) cfg.personal_api_key = apiKey
    if (body.ativo !== undefined) cfg.ativo = !!body.ativo
    cfg.aprovado_programa = true // a Personal API concede acesso pela própria key

    try {
      if (rec) {
        rec.set('config', cfg)
        $app.save(rec)
      } else {
        const col = $app.findCollectionByNameOrId('integracoes_config')
        const r = new Record(col)
        r.set('integracao', 'garmin')
        r.set('config', cfg)
        $app.save(r)
      }
    } catch (err) {
      return e.json(500, { success: false, erro: String(err).slice(0, 200) })
    }

    try {
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'garmin_personal_config', 'integracoes', 'API key pessoal salva', {:now}, {:now})",
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
// OBTER TOKEN — o endpoint do print, executado no servidor
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/garmin/personal/token',
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
    } catch (_) {
      cfg = {}
    }

    const apiKey = String(cfg.personal_api_key || '').trim()
    if (!apiKey) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma API key salva. Cole a chave do Garmin Connect Developer Program.',
      })
    }

    // EXATAMENTE o endpoint do print do dono
    let res
    try {
      res = $http.send({
        url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
        method: 'POST',
        headers: {
          Authorization: 'ApiKey ' + apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 25,
      })
    } catch (err) {
      return e.json(200, {
        success: false,
        erro: 'Falha de rede ao contatar o Garmin: ' + String(err).slice(0, 160),
      })
    }

    if (res.statusCode !== 200) {
      // guarda o erro para a tela de status exibir
      try {
        cfg.last_test_result = {
          ok: false,
          detalhe: 'Garmin respondeu ' + res.statusCode,
          quando: new DateTime().string(),
        }
        if (rec) {
          rec.set('config', cfg)
          $app.save(rec)
        }
      } catch (_) {}
      return e.json(200, {
        success: false,
        erro:
          'O Garmin recusou a API key (HTTP ' +
          res.statusCode +
          '). Confira se a chave está correta e ativa.',
        http_status: res.statusCode,
      })
    }

    // extrai o token da resposta (o nome do campo varia; cobrimos os comuns)
    let token = ''
    let validade = ''
    try {
      const dados = res.json || {}
      token =
        dados.access_token ||
        dados.accessToken ||
        (dados.data && (dados.data.access_token || dados.data.accessToken)) ||
        ''
      const exp =
        dados.expires_in ||
        dados.expiresIn ||
        (dados.data && (dados.data.expires_in || dados.data.expiresIn)) ||
        null
      if (exp) {
        const t = new Date(Date.now() + Number(exp) * 1000)
        validade = t.toISOString()
      }
    } catch (_) {
      token = ''
    }

    if (!token) {
      return e.json(200, {
        success: false,
        erro: 'O Garmin respondeu 200 mas sem access_token no corpo. Formato inesperado.',
      })
    }

    // guarda o token e a validade (nunca devolve o token ao navegador)
    try {
      cfg.personal_token = token
      cfg.token_validade = validade
      cfg.last_test_result = {
        ok: true,
        detalhe:
          'Token obtido com sucesso' +
          (validade ? ' · válido até ' + validade.slice(0, 16).replace('T', ' ') : ''),
        quando: new DateTime().string(),
      }
      if (rec) {
        rec.set('config', cfg)
        $app.save(rec)
      }
    } catch (_) {}

    return e.json(200, {
      success: true,
      tem_token: true,
      validade: validade,
      // NUNCA devolvemos o token: só confirmamos que existe
    })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// TESTAR CONEXÃO — obtém token e faz uma chamada real ao Garmin
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/backend/v1/garmin/personal/status',
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
    } catch (_) {
      cfg = {}
    }

    const st = {
      modo: 'personal',
      tem_api_key: !!(cfg.personal_api_key && String(cfg.personal_api_key).trim()),
      tem_token: !!cfg.personal_token,
      token_validade: cfg.token_validade || '',
      conexao_ok: false,
      recursos: { activities: false, workouts: false },
      detalhe: '',
      erro: '',
    }

    if (!st.tem_api_key) {
      st.erro = 'API key não configurada.'
      st.detalhe = 'Cole a chave pessoal do Garmin Connect Developer Program.'
      return e.json(200, { success: true, status: st, gerado_em: new DateTime().string() })
    }

    // 1) garante token
    let token = cfg.personal_token || ''
    let precisaRenovar = !token
    if (token && cfg.token_validade) {
      try {
        precisaRenovar = new Date(cfg.token_validade).getTime() - 60000 < Date.now()
      } catch (_) {
        precisaRenovar = true
      }
    }

    if (precisaRenovar) {
      try {
        const r = $http.send({
          url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
          method: 'POST',
          headers: {
            Authorization: 'ApiKey ' + String(cfg.personal_api_key),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 25,
        })
        if (r.statusCode === 200) {
          const d = r.json || {}
          token =
            d.access_token ||
            d.accessToken ||
            (d.data && (d.data.access_token || d.data.accessToken)) ||
            ''
          const exp =
            d.expires_in ||
            d.expiresIn ||
            (d.data && (d.data.expires_in || d.data.expiresIn)) ||
            null
          if (exp) st.token_validade = new Date(Date.now() + Number(exp) * 1000).toISOString()
          if (token) {
            try {
              cfg.personal_token = token
              cfg.token_validade = st.token_validade
              if (rec) {
                rec.set('config', cfg)
                $app.save(rec)
              }
            } catch (_) {}
          }
        } else {
          st.erro = 'Garmin recusou a API key (HTTP ' + r.statusCode + ').'
          st.detalhe = 'Verifique se a chave está ativa no portal do desenvolvedor.'
        }
      } catch (err) {
        st.erro = 'Falha de rede ao obter token: ' + String(err).slice(0, 120)
      }
    }

    st.tem_token = !!token

    // 2) com token, testa uma chamada real
    if (token) {
      try {
        const ping = $http.send({
          url: 'https://apis.garmin.com/wellness-api/rest/user/id',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          timeout: 20,
        })
        st.conexao_ok = ping.statusCode === 200
        if (ping.statusCode === 200) {
          st.recursos.activities = true
          st.recursos.workouts = true
          st.detalhe = 'Token válido — API respondendo.'
        } else if (ping.statusCode === 401) {
          st.detalhe =
            'Token obtido, mas a API de atividades respondeu 401 — a Personal API libera escopos específicos; confirme quais no portal.'
        } else {
          st.detalhe = 'API respondeu HTTP ' + ping.statusCode + '.'
        }
      } catch (err) {
        st.detalhe = 'Token OK, mas a API não respondeu: ' + String(err).slice(0, 100)
      }
    }

    try {
      cfg.last_test_result = {
        ok: st.conexao_ok,
        detalhe: st.detalhe || st.erro,
        quando: new DateTime().string(),
      }
      if (rec) {
        rec.set('config', cfg)
        $app.save(rec)
      }
    } catch (_) {}

    return e.json(200, { success: true, status: st, gerado_em: new DateTime().string() })
  },
  $apis.requireAuth(),
)
