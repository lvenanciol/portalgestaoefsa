// ============================================================================
// GARMIN CONNECT — PERSONAL API (v3, 15/11/2026)
//
// MUDANÇA ESTRUTURAL: os dados do Garmin passam a viver em CAMPOS TEXT
// DEDICADOS de `integracoes_config`, não no campo JSON `config`.
//
// MOTIVO (confirmado em produção): `rec.set('config', objeto)` + `$app.save()`
// no JSVM não persistia o JSON — o save não dava erro, mas a releitura vinha
// vazia. Texto grava de forma confiável.
//
//   garmin_personal_api_key  · garmin_personal_token
//   garmin_token_validade    · garmin_ativo
//   garmin_ultimo_teste      · garmin_ultimo_sync
//
// REGRA DO JSVM: nada de helper no topo — tudo inline em cada callback.
// ============================================================================

/** Registro único da integração; cria se não existir. */
routerAdd(
  'GET',
  '/backend/v1/garmin/personal/config',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
    } catch (_) {
      rec = null
    }

    const key = rec ? String(rec.getString('garmin_personal_api_key') || '') : ''
    const token = rec ? String(rec.getString('garmin_personal_token') || '') : ''
    const validade = rec ? String(rec.getString('garmin_token_validade') || '') : ''
    const ultimoTeste = rec ? String(rec.getString('garmin_ultimo_teste') || '') : ''
    const ultimoSync = rec ? String(rec.getString('garmin_ultimo_sync') || '') : ''

    return e.json(200, {
      success: true,
      config: {
        modo: 'personal',
        ativo: rec ? !!rec.getBool('garmin_ativo') : false,
        tem_api_key: !!key.trim(),
        tem_client_secret: !!key.trim(),
        api_key_mascarada: key ? key.slice(0, 6) + '…' + key.slice(-4) : '',
        tem_token: !!token.trim(),
        token_validade: validade,
        ultimo_teste: ultimoTeste ? { ok: true, detalhe: ultimoTeste } : null,
        ultimo_sync: ultimoSync,
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
    } catch (_) {
      body = {}
    }

    const apiKey = String(body.api_key || '').trim()
    if (!apiKey) return e.json(400, { success: false, erro: 'Informe a API key.' })
    if (apiKey.length < 20) {
      return e.json(400, {
        success: false,
        erro: 'A API key parece curta (' + apiKey.length + ' caracteres).',
      })
    }

    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
    } catch (_) {
      rec = null
    }

    try {
      if (!rec) {
        const col = $app.findCollectionByNameOrId('integracoes_config')
        rec = new Record(col)
        rec.set('integracao', 'garmin')
      }
      // CAMPOS TEXT — gravam de forma confiável no JSVM
      rec.set('garmin_personal_api_key', apiKey)
      rec.set('garmin_ativo', true)
      $app.save(rec)
    } catch (err) {
      console.log('[garmin/config] FALHA no save: ' + String(err))
      return e.json(500, {
        success: false,
        erro: 'Falha ao gravar: ' + String(err).slice(0, 160),
      })
    }

    // RELEITURA de verificação
    let verificado = false
    let relido = 0
    try {
      const conf = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
      const k = String(conf.getString('garmin_personal_api_key') || '')
      verificado = !!k.trim()
      relido = k.length
    } catch (err) {
      console.log('[garmin/config] releitura falhou: ' + String(err))
    }

    console.log(
      '[garmin/config] chave ' +
        apiKey.length +
        ' chars · verificado=' +
        verificado +
        ' · relido=' +
        relido,
    )

    if (!verificado) {
      return e.json(200, {
        success: false,
        erro: 'A chave não foi encontrada na releitura do banco (campo texto).',
      })
    }

    return e.json(200, {
      success: true,
      tem_api_key: true,
      tem_client_secret: true,
      api_key_mascarada: apiKey.slice(0, 6) + '…' + apiKey.slice(-4),
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
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
    } catch (_) {
      rec = null
    }

    const apiKey = rec ? String(rec.getString('garmin_personal_api_key') || '').trim() : ''
    if (!apiKey) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma API key salva. Cole a chave e clique em "Salvar API key".',
      })
    }

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
      console.log('[garmin/token] rede: ' + String(err))
      return e.json(200, {
        success: false,
        erro: 'Falha de rede: ' + String(err).slice(0, 150),
      })
    }

    const status = res.statusCode
    let corpoCru = ''
    try {
      corpoCru = res.body ? String(res.body).slice(0, 500) : ''
    } catch (_) {
      corpoCru = ''
    }
    console.log('[garmin/token] Garmin respondeu ' + status + ' · corpo: ' + corpoCru.slice(0, 200))

    // guarda o resultado do teste (campo texto)
    try {
      if (rec) {
        rec.set(
          'garmin_ultimo_teste',
          status === 200
            ? 'Token obtido com sucesso'
            : 'Garmin respondeu HTTP ' + status + ' · ' + corpoCru.slice(0, 200),
        )
        $app.save(rec)
      }
    } catch (_) {}

    if (status !== 200) {
      return e.json(200, {
        success: false,
        erro: 'O Garmin recusou a API key (HTTP ' + status + ').',
        http_status: status,
        corpo: corpoCru,
      })
    }

    let dados = {}
    try {
      dados = res.json || {}
    } catch (_) {
      dados = {}
    }

    let token = ''
    const cand = [
      dados.access_token,
      dados.accessToken,
      dados.token,
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

    if (!token) {
      return e.json(200, {
        success: false,
        erro: 'Respondeu 200 sem token reconhecível. Veja o corpo.',
        corpo: corpoCru,
      })
    }

    let validade = ''
    const exp =
      dados.expires_in ||
      dados.expiresIn ||
      (dados.data && (dados.data.expires_in || dados.data.expiresIn)) ||
      null
    if (exp) validade = new Date(Date.now() + Number(exp) * 1000).toISOString()

    try {
      if (rec) {
        rec.set('garmin_personal_token', token)
        rec.set('garmin_token_validade', validade)
        $app.save(rec)
      }
    } catch (err) {
      console.log('[garmin/token] falha ao gravar token: ' + String(err))
    }

    console.log('[garmin/token] token obtido (' + token.length + ' chars)')
    return e.json(200, { success: true, tem_token: true, validade: validade })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/garmin/personal/status',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('integracoes_config', "integracao = 'garmin'")
    } catch (_) {
      rec = null
    }

    const apiKey = rec ? String(rec.getString('garmin_personal_api_key') || '').trim() : ''
    const tokenSalvo = rec ? String(rec.getString('garmin_personal_token') || '') : ''
    const validadeSalva = rec ? String(rec.getString('garmin_token_validade') || '') : ''

    const st = {
      modo: 'personal',
      tem_api_key: !!apiKey,
      tem_token: !!tokenSalvo,
      token_validade: validadeSalva,
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

    let token = tokenSalvo
    let renovar = !token
    if (token && validadeSalva) {
      try {
        renovar = new Date(validadeSalva).getTime() - 60000 < Date.now()
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
          if (token && rec) {
            try {
              rec.set('garmin_personal_token', token)
              rec.set('garmin_token_validade', st.token_validade)
              $app.save(rec)
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

    return e.json(200, { success: true, status: st })
  },
  $apis.requireAuth(),
)
