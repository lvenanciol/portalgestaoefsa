// ============================================================================
// GARMIN CONNECT — PERSONAL API (API key → access token) — 15/11/2026 v2
//
// FLUXO REAL (do portal do dono):
//   A Garmin NÃO entrega client_id/client_secret na Personal API.
//   Entrega apenas uma "Personal API Key". O token sai de:
//
//   POST https://personal.connectapi.garmin.com/personalapitoken-service/
//        personal-api/personal-api-key/token
//   Authorization: ApiKey {personal-api-key}
//
// ESTA VERSÃO (v2) corrige o 500 em "Salvar API key":
//   · garante que `config` seja um OBJETO antes de escrever (se vier string,
//     `cfg.x = y` lançava TypeError e o PocketBase devolvia a mensagem
//     genérica "Something went wrong while processing your request");
//   · loga o erro real com console.log para aparecer em Skip Cloud → Logs;
//   · devolve `erro` no corpo, nunca só o genérico.
//
// REGRA DO JSVM: nada de helper no topo. Tudo inline em cada callback.
// ============================================================================

// NOTA: NÃO existe função no topo deste arquivo. O JSVM executa callbacks em
// pool separado e um helper de topo causa ReferenceError em runtime (o
// pipeline de QA detecta e bloqueia o build). A normalização do JSON está
// INLINE em cada callback.

routerAdd(
  'GET',
  '/backend/v1/garmin/personal/config',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')
    const auth = e.auth

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      const bruto = rec.get('config')
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
        cfg = bruto
      } else if (typeof bruto === 'string') {
        try {
          const p = JSON.parse(bruto)
          cfg = p && typeof p === 'object' ? p : {}
        } catch (_) {
          cfg = {}
        }
      }
    } catch (_) {
      rec = null
      cfg = {}
    }

    const key = String(cfg.personal_api_key || '')
    return e.json(200, {
      success: true,
      config: {
        modo: cfg.modo || 'personal',
        ativo: !!cfg.ativo,
        tem_api_key: !!key.trim(),
        // alias mantido: a UI lê os dois nomes
        tem_client_secret: !!key.trim(),
        api_key_mascarada: key ? key.slice(0, 6) + '…' + key.slice(-4) : '',
        token_validade: cfg.token_validade || '',
        tem_token: !!cfg.personal_token,
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
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (err) {
      console.log('[garmin/personal/config] requestInfo falhou: ' + String(err))
      body = {}
    }

    const apiKey = String(body.api_key || '').trim()
    if (!apiKey) {
      return e.json(400, { success: false, erro: 'Informe a API key.' })
    }
    if (apiKey.length < 20) {
      return e.json(400, {
        success: false,
        erro:
          'A API key parece curta demais (' +
          apiKey.length +
          ' caracteres). Cole a chave completa.',
      })
    }

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      const bruto = rec.get('config')
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
        cfg = bruto
      } else if (typeof bruto === 'string') {
        try {
          const p = JSON.parse(bruto)
          cfg = p && typeof p === 'object' ? p : {}
        } catch (_) {
          cfg = {}
        }
      }
    } catch (_) {
      rec = null
      cfg = {}
    }

    // grava sempre como objeto novo (não muta o que veio do banco)
    const novo = {}
    for (const k of Object.keys(cfg)) novo[k] = cfg[k]
    novo.modo = 'personal'
    novo.ativo = body.ativo === undefined ? true : !!body.ativo
    novo.personal_api_key = apiKey
    novo.aprovado_programa = true
    // a Personal API não usa OAuth de app: limpa campos que não se aplicam
    delete novo.client_id
    delete novo.client_secret
    delete novo.redirect_uri
    delete novo.consumer_key
    delete novo.consumer_secret
    delete novo.escopos

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
      // LOG REAL: aparece em Skip Cloud → Logs → hooks
      console.log('[garmin/personal/config] FALHA ao salvar: ' + String(err))
      return e.json(500, {
        success: false,
        erro: 'Falha ao gravar a configuração: ' + String(err).slice(0, 180),
      })
    }

    // ------------------------------------------------------------------
    // VERIFICAÇÃO PÓS-GRAVAÇÃO (15/11/2026)
    // O log confirmava "API key salva" mas o GET seguinte devolvia
    // tem_api_key:false — a tela mostrava "ausente" e o botão "Obter token"
    // não habilitava. Aqui RELEMOS o registro depois do save e devolvemos o
    // estado REAL, para a UI não depender de um segundo request.
    // ------------------------------------------------------------------
    let verificado = false
    let mascara = ''
    let tamanho = 0
    try {
      const relido = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      let c2 = relido.get('config')
      if (typeof c2 === 'string') {
        try {
          c2 = JSON.parse(c2)
        } catch (_) {
          c2 = {}
        }
      }
      const k2 = c2 && typeof c2 === 'object' ? String(c2.personal_api_key || '') : ''
      verificado = !!k2.trim()
      tamanho = k2.length
      mascara = k2 ? k2.slice(0, 6) + '…' + k2.slice(-4) : ''
      if (!verificado) {
        console.log(
          '[garmin/personal/config] ATENÇÃO: save retornou OK mas a releitura não achou a chave',
        )
      }
    } catch (err) {
      console.log('[garmin/personal/config] falha na releitura: ' + String(err))
    }

    console.log(
      '[garmin/personal/config] API key salva (' +
        apiKey.length +
        ' chars) · verificado=' +
        verificado +
        ' · relido=' +
        tamanho +
        ' chars',
    )

    if (!verificado) {
      return e.json(200, {
        success: false,
        erro: 'A chave foi enviada mas não foi encontrada na releitura do banco. Isso indica falha de persistência do campo JSON.',
      })
    }

    return e.json(200, {
      success: true,
      tem_api_key: true,
      tem_client_secret: true,
      api_key_mascarada: mascara,
      ativo: true,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/garmin/personal/token',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      const bruto = rec.get('config')
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
        cfg = bruto
      } else if (typeof bruto === 'string') {
        try {
          const p = JSON.parse(bruto)
          cfg = p && typeof p === 'object' ? p : {}
        } catch (_) {
          cfg = {}
        }
      }
    } catch (_) {
      rec = null
      cfg = {}
    }

    const apiKey = String(cfg.personal_api_key || '').trim()
    if (!apiKey) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma API key salva. Cole a chave e clique em "Salvar API key" primeiro.',
      })
    }

    // ---------- 1) POST no endpoint do print ----------
    let res = null
    try {
      res = $http.send({
        url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
        method: 'POST',
        headers: {
          Authorization: 'ApiKey ' + apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
        timeout: 25,
      })
    } catch (err) {
      console.log('[garmin/personal/token] rede: ' + String(err))
      return e.json(200, {
        success: false,
        erro: 'Falha de rede ao contatar o Garmin: ' + String(err).slice(0, 160),
      })
    }

    const status = res.statusCode
    console.log('[garmin/personal/token] Garmin respondeu ' + status)

    // corpo cru para diagnóstico (limitado)
    let corpoCru = ''
    try {
      corpoCru = res.body ? String(res.body).slice(0, 600) : ''
    } catch (_) {
      corpoCru = ''
    }

    if (status !== 200) {
      try {
        cfg.last_test_result = {
          ok: false,
          detalhe: 'Garmin respondeu HTTP ' + status,
          corpo: corpoCru,
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
          status +
          '). Confira se a chave está ativa e se foi copiada inteira.',
        http_status: status,
        corpo: corpoCru,
      })
    }

    // ---------- 2) extrai o token ----------
    let token = ''
    let validade = ''
    let dados = {}
    try {
      dados = res.json || {}
    } catch (_) {
      dados = {}
    }

    const cand = [
      dados.access_token,
      dados.accessToken,
      dados.token,
      dados.access_token_value,
      dados.data && dados.data.access_token,
      dados.data && dados.data.accessToken,
      dados.data && dados.data.token,
    ]
    for (const c of cand) {
      if (c && typeof c === 'string' && c.length > 10) {
        token = c
        break
      }
    }

    const exp =
      dados.expires_in ||
      dados.expiresIn ||
      (dados.data && (dados.data.expires_in || dados.data.expiresIn)) ||
      null
    if (exp) {
      validade = new Date(Date.now() + Number(exp) * 1000).toISOString()
    }

    if (!token) {
      // 200 sem token: devolve o corpo para o dono me mandar o formato
      return e.json(200, {
        success: false,
        erro: 'O Garmin respondeu 200 mas sem access_token reconhecível. Formato inesperado — veja o corpo abaixo.',
        corpo: corpoCru,
      })
    }

    try {
      cfg.personal_token = token
      cfg.token_validade = validade
      cfg.last_test_result = {
        ok: true,
        detalhe:
          'Token obtido' +
          (validade ? ' · válido até ' + validade.slice(0, 16).replace('T', ' ') : ''),
        quando: new DateTime().string(),
      }
      if (rec) {
        rec.set('config', cfg)
        $app.save(rec)
      }
    } catch (err) {
      console.log('[garmin/personal/token] falha ao gravar token: ' + String(err))
    }

    console.log('[garmin/personal/token] token obtido com sucesso')
    return e.json(200, {
      success: true,
      tem_token: true,
      validade: validade,
      // nunca devolvemos o token
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/garmin/personal/status',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let rec = null
    let cfg = {}
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      const bruto = rec.get('config')
      if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
        cfg = bruto
      } else if (typeof bruto === 'string') {
        try {
          const p = JSON.parse(bruto)
          cfg = p && typeof p === 'object' ? p : {}
        } catch (_) {
          cfg = {}
        }
      }
    } catch (_) {
      rec = null
      cfg = {}
    }

    const apiKey = String(cfg.personal_api_key || '').trim()
    const st = {
      modo: 'personal',
      tem_api_key: !!apiKey,
      tem_token: !!cfg.personal_token,
      token_validade: cfg.token_validade || '',
      conexao_ok: false,
      recursos: { activities: false, workouts: false },
      detalhe: '',
      erro: '',
    }

    if (!apiKey) {
      st.erro = 'API key não configurada.'
      st.detalhe = 'Cole a Personal API Key e salve.'
      return e.json(200, { success: true, status: st })
    }

    // renova o token quando vencido ou ausente
    let token = String(cfg.personal_token || '')
    let renovar = !token
    if (token && cfg.token_validade) {
      try {
        renovar = new Date(cfg.token_validade).getTime() - 60000 < Date.now()
      } catch (_) {
        renovar = true
      }
    }

    if (renovar) {
      try {
        const r = $http.send({
          url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
          method: 'POST',
          headers: {
            Authorization: 'ApiKey ' + apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: '{}',
          timeout: 25,
        })
        if (r.statusCode === 200) {
          const d = r.json || {}
          token = d.access_token || d.accessToken || d.token || ''
          const exp = d.expires_in || d.expiresIn || null
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
        }
      } catch (err) {
        st.erro = 'Falha de rede: ' + String(err).slice(0, 120)
      }
    }

    st.tem_token = !!token

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
            'Token obtido, mas a API de atividades respondeu 401. A Personal API pode não liberar este escopo — o import por CSV continua disponível.'
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

    return e.json(200, { success: true, status: st })
  },
  $apis.requireAuth(),
)
