/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — ZONAS DE FC NAS ATIVIDADES DA API (15/11/2026)
//
// PROBLEMA: a aba Running mostra "Sem dados de zona de FC". As zonas existiam
// quando os dados vinham do CSV (que trazia FC média e duração), mas a
// sincronização pela API não as calcula.
//
// IMPORTANTE — HONESTIDADE DA FONTE: a API de atividades da Garmin NÃO devolve
// distribuição de tempo por zona (isso exigiria os streams segundo a segundo,
// que só vêm no .FIT). O que o CSV fazia era ESTIMAR: distribuir a duração em
// uma gaussiana de desvio 8 bpm centrada na FC média, sobre FCmax 218.
//
// Este backfill aplica a MESMA estimativa às atividades da API, marcando
// `zonas_estimadas = true`. Não é medição — é a mesma aproximação de antes,
// agora calculada aqui.
//
//   Z1 109–131 · Z2 131–153 · Z3 153–174 · Z4 174–196 · Z5 196–218  (FCmax 218)
// ============================================================================
migrate(
  (app) => {
    const ZONAS = [
      { id: 'z1', min: 109, max: 131 },
      { id: 'z2', min: 131, max: 153 },
      { id: 'z3', min: 153, max: 174 },
      { id: 'z4', min: 174, max: 196 },
      { id: 'z5', min: 196, max: 218 },
    ]

    let atividades = []
    try {
      // sort VAZIO: 'created' é rejeitado por findRecordsByFilter
      atividades = app.findRecordsByFilter('ll5_activity', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[zonas] falha ao listar: ' + String(err).slice(0, 160))
      return
    }

    console.log('[zonas] atividades lidas: ' + atividades.length)

    let calculadas = 0
    let semDados = 0
    let jaTinha = 0

    for (const r of atividades) {
      // já tem zonas? não mexe
      let temZonas = false
      try {
        const z = r.get('zonas_fc_seg')
        if (z && typeof z === 'object' && Object.keys(z).length > 0) temZonas = true
        else if (typeof z === 'string' && z.length > 5 && z !== '{}') temZonas = true
      } catch (_) {}
      if (temZonas) {
        jaTinha++
        continue
      }

      let fcMedia = null
      let duracao = null
      try {
        const v = r.get('fc_media')
        if (v != null && Number(v) > 0) fcMedia = Number(v)
      } catch (_) {}
      try {
        const d = r.get('duracao_s')
        if (d != null && Number(d) > 0) duracao = Number(d)
      } catch (_) {}

      if (!fcMedia || !duracao) {
        semDados++
        continue
      }

      // ---- mesma estimativa do CSV: gaussiana sd=8, 61 pontos de ±30 bpm ----
      const desvio = 8
      const passos = 61
      const zonas = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
      let somaPeso = 0
      const pesos = []

      for (let i = 0; i < passos; i++) {
        const x = fcMedia - 30 + (60 * i) / (passos - 1)
        const w = Math.exp(-0.5 * Math.pow((x - fcMedia) / desvio, 2))
        pesos.push(w)
        somaPeso += w
      }

      for (let i = 0; i < passos; i++) {
        const x = fcMedia - 30 + (60 * i) / (passos - 1)
        for (const z of ZONAS) {
          if (x >= z.min && x < z.max) {
            zonas[z.id] += (pesos[i] / somaPeso) * duracao
            break
          }
        }
      }

      // arredonda
      let total = 0
      for (const k of Object.keys(zonas)) {
        zonas[k] = Math.round(zonas[k])
        total += zonas[k]
      }
      if (total <= 0) {
        semDados++
        continue
      }

      try {
        r.set('zonas_fc_seg', zonas)
        r.set('zonas_estimadas', true)
        // a FCmax de referência acompanha o cálculo
        try {
          r.set('fcmax_referencia', 218)
          r.set('fcmax_validada', true)
          r.set('fcmax_metodo_validacao', 'estatistico_164_atividades')
        } catch (_) {}
        app.save(r)
        calculadas++
      } catch (err) {
        if (calculadas < 3) {
          console.log('[zonas] falha ao salvar ' + r.id + ': ' + String(err).slice(0, 120))
        }
      }
    }

    console.log(
      '[zonas] calculadas=' + calculadas + ' jáTinha=' + jaTinha + ' semDados=' + semDados,
    )
    console.log('[zonas] CONCLUÍDO')
  },
  (app) => {
    console.log('[zonas] rollback: zonas calculadas permanecem')
  },
)
