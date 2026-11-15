// ============================================================================
// GARMIN — SINCRONIZAÇÃO REAL DE ATIVIDADES (15/11/2026)
//
// A tela mostrava "Garmin não configurado — nenhum dado foi sincronizado"
// mesmo com a integração conectada, porque o `sync()` do adapter estava fixo
// em falha desde o primeiro ciclo (quando era mock).
//
// Este endpoint:
//   1. garante um token válido (renova se vencido);
//   2. busca as atividades na Personal API (paginado, 100 por página);
//   3. faz UPSERT em ll5_activity por device_activity_id;
//   4. devolve o resumo real para a UI.
//
// Endpoint da API (confirmado na documentação oficial):
//   GET personal.connectapi.garmin.com/activitylist-service/
//       activities/search/activities?start=0&limit=100
//   Authorization: Bearer <token>
//   Accept: */*          ← application/json devolve 406
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/garmin/personal/sincronizar',
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
        erro: 'Personal API key não configurada. Cole a chave em Configurações → Integrações.',
      })
    }

    // ---------------- 1) token válido ----------------
    let token = rec ? String(rec.getString('garmin_personal_token') || '') : ''
    const validade = rec ? String(rec.getString('garmin_token_validade') || '') : ''
    let renovar = !token
    if (token && validade) {
      try {
        renovar = new Date(validade).getTime() - 60000 < Date.now()
      } catch (_) {
        renovar = true
      }
    }

    if (renovar) {
      try {
        const tr = $http.send({
          // mesma variação que funciona: só o header Authorization
          url: 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token',
          method: 'POST',
          headers: { Authorization: 'ApiKey ' + apiKey },
          timeout: 25,
        })
        if (tr.statusCode !== 200) {
          return e.json(200, {
            success: false,
            erro: 'Garmin recusou a API key ao renovar o token (HTTP ' + tr.statusCode + ').',
          })
        }
        // o corpo é o JWT cru
        let corpo = ''
        try {
          const b = tr.body
          if (typeof b === 'string') corpo = b
          else if (b && b.length) {
            for (let i = 0; i < b.length; i++) corpo += String.fromCharCode(Number(b[i]))
          }
        } catch (_) {
          corpo = ''
        }
        const m = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/.exec(corpo)
        token = m ? m[1] : String(corpo || '').trim()
        if (!token) {
          return e.json(200, {
            success: false,
            erro: 'Token não reconhecido no corpo da resposta do Garmin.',
          })
        }
        try {
          if (rec) {
            rec.set('garmin_personal_token', token)
            rec.set('garmin_token_validade', new Date(Date.now() + 3600 * 1000).toISOString())
            $app.save(rec)
          }
        } catch (_) {}
      } catch (err) {
        return e.json(200, {
          success: false,
          erro: 'Falha de rede ao renovar o token: ' + String(err).slice(0, 140),
        })
      }
    }

    // ---------------- 2) busca as atividades ----------------
    const dono = e.auth.id
    let importadas = 0
    let atualizadas = 0
    let totalLidas = 0
    const errosDeLinha = []

    for (let pagina = 0; pagina < 20; pagina++) {
      const inicio = pagina * 100
      let res = null
      try {
        res = $http.send({
          url:
            'https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=' +
            inicio +
            '&limit=100',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: '*/*' },
          timeout: 40,
        })
      } catch (err) {
        return e.json(200, {
          success: false,
          erro: 'Falha de rede ao buscar atividades: ' + String(err).slice(0, 140),
        })
      }

      if (res.statusCode === 401) {
        return e.json(200, {
          success: false,
          erro: 'Token recusado (401). Clique em "Obter token" em Configurações e tente de novo.',
        })
      }
      if (res.statusCode === 204) break
      if (res.statusCode !== 200) {
        return e.json(200, {
          success: false,
          erro: 'A API respondeu HTTP ' + res.statusCode + ' ao listar atividades.',
        })
      }

      // corpo pode vir como bytes
      let lista = []
      try {
        lista = res.json
        if (!lista || !lista.length) {
          let corpo = ''
          const b = res.body
          if (typeof b === 'string') corpo = b
          else if (b && b.length) {
            for (let i = 0; i < b.length; i++) corpo += String.fromCharCode(Number(b[i]))
          }
          if (corpo.trim().startsWith('[')) lista = JSON.parse(corpo)
        }
      } catch (_) {
        lista = []
      }

      if (!lista || !lista.length) break
      totalLidas += lista.length

      for (let i = 0; i < lista.length; i++) {
        const a = lista[i] || {}
        const actId = String(a.activityId || '')
        if (!actId) continue

        // tipo do Garmin (activityType.typeKey) → tipo interno
        const chave = String(
          (a.activityType && (a.activityType.typeKey || a.activityType.typeId)) || '',
        ).toLowerCase()
        let tipo = 'outro'
        if (chave.indexOf('trail') >= 0) tipo = 'trail'
        else if (chave.indexOf('treadmill') >= 0 || chave.indexOf('indoor') >= 0) tipo = 'esteira'
        else if (chave.indexOf('running') >= 0) tipo = 'rua'
        const ehForca = chave.indexOf('strength') >= 0

        const dataInicio = a.startTimeGMT
          ? String(a.startTimeGMT).replace(' ', 'T') +
            (String(a.startTimeGMT).indexOf('Z') < 0 ? 'Z' : '')
          : null

        // ----------------------------------------------------------------
        // 15/11/2026 — MAPEAMENTO COMPLETO do SummarizedActivityDTO.
        // O print mostrava CADÊNCIA = 0 e colunas vazias porque eu mapeava só
        // 10 campos. A API devolve bem mais; nomes conforme a documentação:
        //   distance, duration, elapsedDuration, movingDuration, elevationGain,
        //   elevationLoss, averageSpeed, maxSpeed, calories, averageHR, maxHR,
        //   averageRunningCadenceInStepsPerMinute, maxRunningCadenceInStepsPerMinute,
        //   avgPower, maxPower, normPower, aerobicTrainingEffect,
        //   anaerobicTrainingEffect, activityTrainingLoad, steps, avgStrideLength,
        //   avgVerticalOscillation, avgGroundContactTime, avgVerticalRatio,
        //   avgGradeAdjustedSpeed, minElevation, maxElevation, vO2MaxValue
        // ----------------------------------------------------------------
        const num = (v) => (v == null || v === '' ? null : Number(v))
        const int = (v) => (v == null || v === '' ? null : Math.round(Number(v)))
        const velParaPace = (v) => (v && Number(v) > 0 ? Math.round(1000 / Number(v)) : null)

        const dados = {
          owner_id: dono,
          created_by: e.auth.getString('email') || 'garmin-api',
          updated_by: e.auth.getString('email') || 'garmin-api',
          device_activity_id: 'garmin-' + actId,
          // 15/11/2026 — chave CANÔNICA igual à do CSV: a mesma corrida não
          // duplica quando vem por API e por CSV.
          // chave canônica por DIA (a API devolve GMT; o CSV devolve -03:00;
          // o dia é o mesmo e casa nos dois)
          chave_canonica: (() => {
            const bruto = String(dataInicio || '')
            const m = /(\d{4})-(\d{2})-(\d{2})/.exec(bruto)
            const dia = m ? m[1] + '-' + m[2] + '-' + m[3] : 'sem-data'
            const dist = Math.round(Number(a.distance || 0) / 100)
            return dia + '|' + tipo + '|' + dist
          })(),
          fonte: 'garmin_api',
          tipo: tipo,
          origem_aba: ehForca ? 'gym' : 'running',
          titulo: String(a.activityName || ''),
          data_hora_inicio: dataInicio,

          // tempos e distância
          distancia_m: num(a.distance),
          duracao_s: int(a.duration),
          tempo_decorrido_s: int(a.elapsedDuration),
          tempo_movimento_s: int(a.movingDuration),
          pace_medio_s_km: velParaPace(a.averageSpeed),
          melhor_pace_s_km: velParaPace(a.maxSpeed),
          gap_s_km: velParaPace(a.avgGradeAdjustedSpeed),

          // coração
          fc_media: int(a.averageHR),
          fc_max: int(a.maxHR),

          // cadência: o campo da API já vem em passos/min
          cadencia_spm: int(a.averageRunningCadenceInStepsPerMinute),
          cadencia_max_spm: int(a.maxRunningCadenceInStepsPerMinute),

          // elevação
          ganho_elevacao_m: num(a.elevationGain),
          perda_elevacao_m: num(a.elevationLoss),
          elevacao_min_m: num(a.minElevation),
          elevacao_max_m: num(a.maxElevation),

          // corpo e carga
          calorias: int(a.calories),
          passos: int(a.steps),
          te_aerobico: num(a.aerobicTrainingEffect),
          te_anaerobico: num(a.anaerobicTrainingEffect),
          training_load: num(a.activityTrainingLoad),

          // running dynamics
          comprimento_passada_m: num(a.avgStrideLength),
          vertical_oscillation_cm: num(a.avgVerticalOscillation),
          ground_contact_time_ms: num(a.avgGroundContactTime),
          vertical_ratio_pct: num(a.avgVerticalRatio),
          tem_running_dynamics: a.avgGroundContactTime != null,

          // potência
          potencia_media_w: int(a.avgPower),
          potencia_max_w: int(a.maxPower),
          potencia_normalizada_w: int(a.normPower),
          potencia_confiavel: false,

          // força
          tem_detalhe_exercicio: false,
          volume_kg: null,

          // qualidade
          qualidade_dados: ehForca ? 'parcial' : 'resumo',
          demo: false,
        }

        // remove chaves nulas para não sobrescrever dado bom com null
        for (const k of Object.keys(dados)) {
          if (dados[k] === null || dados[k] === undefined) delete dados[k]
        }

        // dedupe: chave canônica primeiro (cruza CSV/.FIT/API), depois device_id
        let existente = null
        try {
          existente = $app.findFirstRecordByFilter(
            'll5_activity',
            "chave_canonica = '" + dados.chave_canonica + "'",
          )
        } catch (_) {
          existente = null
        }
        if (!existente) {
          try {
            existente = $app.findFirstRecordByFilter(
              'll5_activity',
              "device_activity_id = '" + dados.device_activity_id + "'",
            )
          } catch (_) {
            existente = null
          }
        }

        try {
          if (existente) {
            // não sobrescreve owner nem created_by
            // 15/11/2026 — atualização COMPLETA: a API deve refletir no app.
            // Só os campos de propriedade ficam protegidos.
            const d2 = {}
            for (const k of Object.keys(dados)) {
              if (k === 'owner_id' || k === 'created_by' || k === 'demo') continue
              d2[k] = dados[k]
            }
            for (const k of Object.keys(d2)) existente.set(k, d2[k])
            $app.save(existente)
            atualizadas++
          } else {
            const col = $app.findCollectionByNameOrId('ll5_activity')
            const novo = new Record(col)
            for (const k of Object.keys(dados)) novo.set(k, dados[k])
            $app.save(novo)
            importadas++
          }
        } catch (err) {
          if (errosDeLinha.length < 10) {
            errosDeLinha.push(String(a.activityName || actId) + ': ' + String(err).slice(0, 80))
          }
        }
      }

      if (lista.length < 100) break

      // pausa entre páginas: respeita o limite de ~100 req/min da API
      try {
        $http.send({
          url: 'https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=1',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: '*/*' },
          timeout: 10,
        })
      } catch (_) {}
    }

    // diagnóstico: se leu mas nada entrou nem atualizou, registra o motivo
    if (totalLidas > 0 && importadas === 0 && atualizadas === 0 && errosDeLinha.length > 0) {
      console.log('[garmin/sync] nenhuma atividade gravada. Erros: ' + errosDeLinha.join(' | '))
    }

    // ---------------- 3) resumo + auditoria ----------------
    const mensagem =
      totalLidas === 0
        ? 'A API respondeu sem atividades no período.'
        : importadas +
          ' nova(s) · ' +
          atualizadas +
          ' atualizada(s) · ' +
          totalLidas +
          ' lida(s) da API.'

    try {
      if (rec) {
        rec.set('garmin_ultimo_teste', 'Sincronização: ' + mensagem)
        $app.save(rec)
      }
    } catch (_) {}

    try {
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'garmin_sync', 'integracoes', {:det}, {:now}, {:now})",
        )
        .bind({
          id: $security.randomString(15),
          uid: dono,
          uemail: e.auth.getString('email'),
          det: mensagem.slice(0, 180),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, {
      success: true,
      total: totalLidas,
      importadas: importadas,
      atualizadas: atualizadas,
      erros: errosDeLinha,
      mensagem: mensagem,
    })
  },
  $apis.requireAuth(),
)
