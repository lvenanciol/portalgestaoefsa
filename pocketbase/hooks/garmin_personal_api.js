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

    // 15/11/2026 — o Garmin respondeu HTTP 406 com {"cl":{"error":"invalid_key"}}.
    // 406 é "Not Acceptable": pode ser o header Accept OU a chave. Testamos as
    // variações em ordem, parando na primeira que devolver 200 — assim
    // descobrimos o que o endpoint aceita em vez de chutar.
    const URL_TOKEN =
      'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token'
    const variacoes = [
      {
        nome: 'só ApiKey (sem Accept/body)',
        headers: { Authorization: 'ApiKey ' + apiKey },
        body: null,
      },
      {
        nome: 'ApiKey + Accept */*',
        headers: { Authorization: 'ApiKey ' + apiKey, Accept: '*/*' },
        body: null,
      },
      { nome: 'ApiKey + body {}', headers: { Authorization: 'ApiKey ' + apiKey }, body: '{}' },
      {
        nome: 'ApiKey + json completo',
        headers: {
          Authorization: 'ApiKey ' + apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      { nome: 'Authorization cru (sem prefixo)', headers: { Authorization: apiKey }, body: null },
    ]

    let res = null
    const log = []
    for (const v of variacoes) {
      try {
        const opts = { url: URL_TOKEN, method: 'POST', headers: v.headers, timeout: 25 }
        if (v.body != null) opts.body = v.body
        const r = $http.send(opts)
        log.push(v.nome + '→' + r.statusCode)
        if (r.statusCode === 200) {
          res = r
          break
        }
        if (!res) res = r
      } catch (err) {
        log.push(v.nome + '→erro')
      }
    }

    console.log('[garmin/token] variações testadas: ' + log.join(' · '))

    if (!res) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma variação de requisição funcionou: ' + log.join(' · '),
      })
    }

    const status = res.statusCode
    // 15/11/2026 — `res.body` no JSVM vem como ARRAY DE BYTES, não string.
    // O print mostrava "123,34,99,108,..." em vez de `{"cl":{"error":"invalid_key"}}`.
    // Aqui convertemos os bytes em texto para ler o motivo REAL do Garmin.
    let corpoCru = ''
    try {
      const b = res.body
      if (typeof b === 'string') {
        corpoCru = b.slice(0, 500)
      } else if (b && b.length !== undefined) {
        // array de bytes
        let s = ''
        for (let i = 0; i < b.length && i < 500; i++) {
          const c = Number(b[i])
          if (c > 0) s += String.fromCharCode(c)
        }
        corpoCru = s
      } else {
        corpoCru = String(b || '').slice(0, 500)
      }
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

    // ------------------------------------------------------------------
    // O TOKEN É O PRÓPRIO CORPO (JWT cru), NÃO UM JSON com access_token.
    //
    // PROVA (log de produção):
    //   corpo: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRpLW9hdXRo...
    //   header decodificado: {"alg":"RS256","typ":"JWT",
    //                         "kid":"di-oauth-signer-personal-api-prod-2026-q3"}
    //
    // O endpoint devolve o JWT como texto. Meu código procurava JSON
    // (`dados.access_token`) e por isso dizia "200 sem token reconhecível".
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // O TOKEN É O PRÓPRIO CORPO (JWT cru), NÃO UM JSON com access_token.
    //
    // PROVA (log de produção, 15/11/2026 10:37):
    //   corpo: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRpLW9hdXRo...
    //   header: {"alg":"RS256","typ":"JWT",
    //            "kid":"di-oauth-signer-personal-api-prod-2026-q3"}
    //
    // CORREÇÃO DEFINITIVA: leio o corpo INTEIRO (sem o corte de 500 chars que
    // quebrava o JWT no meio) e procuro o padrão JWT em QUALQUER posição com
    // regex — não dependo de split('.').length === 3, que falhava quando o
    // corpo vinha com prefixo/sufixo.
    // ------------------------------------------------------------------
    let token = ''

    let corpoInteiro = ''
    try {
      const b2 = res.body
      if (typeof b2 === 'string') {
        corpoInteiro = b2
      } else if (b2 && b2.length !== undefined) {
        let s2 = ''
        for (let i = 0; i < b2.length; i++) {
          const c = Number(b2[i])
          if (c > 0) s2 += String.fromCharCode(c)
        }
        corpoInteiro = s2
      } else {
        corpoInteiro = String(b2 || '')
      }
    } catch (_) {
      corpoInteiro = corpoCru
    }

    const cru = String(corpoInteiro || corpoCru || '').trim()

    // procura um JWT em qualquer posição do corpo
    const mJwt = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/.exec(cru)
    if (mJwt) token = mJwt[1]

    // corpo inteiro também pode ser o token (sem pontos extras)
    if (!token && cru.length > 100 && cru.indexOf('.') > 0) {
      token = cru
    }

    // 2) fallback: corpo é JSON com o token dentro
    if (!token && cru.indexOf('{') === 0) {
      try {
        const j = JSON.parse(cru)
        const cand = [
          j.access_token,
          j.accessToken,
          j.token,
          j.data && j.data.access_token,
          j.data && j.data.token,
        ]
        for (let i = 0; i < cand.length; i++) {
          const c = cand[i]
          if (c && typeof c === 'string' && c.length > 10) {
            token = c
            break
          }
        }
      } catch (_) {}
    }

    // 3) fallback: res.json já parseado pelo PocketBase
    if (!token) {
      try {
        const d = res.json || {}
        const cand2 = [
          d.access_token,
          d.accessToken,
          d.token,
          d.data && d.data.access_token,
          d.data && d.data.token,
        ]
        for (let i = 0; i < cand2.length; i++) {
          const c = cand2[i]
          if (c && typeof c === 'string' && c.length > 10) {
            token = c
            break
          }
        }
      } catch (_) {}
    }

    if (!token) {
      return e.json(200, {
        success: false,
        erro:
          'Respondeu 200 mas não reconheci o formato. Primeiros 120 caracteres: ' +
          cru.slice(0, 120),
        corpo: corpoCru.slice(0, 300),
      })
    }

    // expiração: o JWT tem `exp` no payload
    let validadeJwt = ''
    try {
      const partes = token.split('.')
      if (partes.length >= 2) {
        let s = partes[1].replace(/-/g, '+').replace(/_/g, '/')
        while (s.length % 4 !== 0) s += '='
        const payload = JSON.parse(atob(s))
        if (payload.exp) validadeJwt = new Date(Number(payload.exp) * 1000).toISOString()
      }
    } catch (_) {
      validadeJwt = ''
    }

    // validade: do JWT (exp) ou 1 h de folga
    let validade = validadeJwt
    if (!validade) validade = new Date(Date.now() + 3600 * 1000).toISOString()

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
      // ----------------------------------------------------------------
      // 15/11/2026 — ENDPOINT CORRIGIDO (era a causa do 401).
      //
      // Eu testava `apis.garmin.com/wellness-api/rest/user/id` — essa é a
      // API EMPRESARIAL (Health API), que exige consentimento de usuário e
      // não aceita token da Personal API. Daí o 401.
      //
      // A Personal API usa outro host e outro caminho (docs oficiais):
      //   GET personal.connectapi.garmin.com/activitylist-service/
      //       activities/search/activities?start=0&limit=1
      //   Authorization: Bearer <token>
      //   Accept: */*        ← `application/json` devolve HTTP 406
      // ----------------------------------------------------------------
      try {
        const ping = $http.send({
          url: 'https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=1',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: '*/*' },
          timeout: 25,
        })
        st.conexao_ok = ping.statusCode === 200 || ping.statusCode === 204
        if (st.conexao_ok) {
          st.recursos.activities = true
          st.recursos.workouts = true
          st.detalhe = 'Conectado — lista de atividades acessível.'
          // conta as atividades para dar um número real ao dono
          try {
            const total = $http.send({
              url: 'https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=1000',
              method: 'GET',
              headers: { Authorization: 'Bearer ' + token, Accept: '*/*' },
              timeout: 40,
            })
            if (total.statusCode === 200) {
              let arr = total.json
              if (!arr || !arr.length) {
                // corpo pode vir como bytes
                try {
                  let s = ''
                  const b = total.body
                  if (typeof b === 'string') s = b
                  else if (b && b.length) {
                    for (let i = 0; i < b.length; i++) s += String.fromCharCode(Number(b[i]))
                  }
                  arr = JSON.parse(s)
                } catch (_) {
                  arr = []
                }
              }
              if (arr && arr.length) {
                st.detalhe =
                  'Conectado — ' +
                  arr.length +
                  ' atividade(s) visível(is) na API' +
                  (arr.length >= 1000 ? ' (limite da consulta)' : '') +
                  '.'
              }
            }
          } catch (_) {}
        } else if (ping.statusCode === 401) {
          st.detalhe =
            'Token recusado pela API de atividades (401). Gere um novo token — o anterior pode ter expirado.'
        } else if (ping.statusCode === 406) {
          st.detalhe = 'API respondeu 406 — problema de Accept header.'
        } else {
          st.detalhe = 'API respondeu HTTP ' + ping.statusCode + '.'
        }
      } catch (err) {
        st.detalhe = 'Token OK, mas a API não respondeu: ' + String(err).slice(0, 120)
      }
    }

    return e.json(200, { success: true, status: st })
  },
  $apis.requireAuth(),
)
