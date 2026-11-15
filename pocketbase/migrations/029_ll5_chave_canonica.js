/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — CHAVE CANÔNICA E LIMPEZA DE DUPLICATAS (15/11/2026)
//
// PROBLEMA (print do dono): 2.350 atividades importadas para um CSV de 1.189.
// A MESMA corrida entrava várias vezes porque o `device_activity_id` muda por
// fonte:
//     CSV  →  csv-2026-11-13T06:11:57-03:00-rua
//     API  →  garmin-12345678901
//     .FIT →  12345678901
//
// O índice UNIQUE (fonte, device_activity_id) nunca barra isso, porque a
// fonte também difere. Resultado: 1.189 (CSV) + 1.189 (API) ≈ 2.350.
//
// SOLUÇÃO:
//   1. novo campo `chave_canonica` = data(UTC, minuto) + tipo + distância(100m)
//      — igual para a mesma atividade, venha de onde vier;
//   2. LIMPEZA: agrupa por essa chave e mantém UM registro, preferindo o de
//      melhor qualidade (com zonas de FC > com streams > o mais antigo);
//   3. índice único em `chave_canonica` impede nova duplicação.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_activity')
    } catch (_) {
      console.log('[ll5/dedupe] ll5_activity não existe')
      return
    }

    // ---- 1) campo chave_canonica ----
    const nomes = (col.fields || []).map((f) => f.name)
    if (!nomes.includes('chave_canonica')) {
      col.fields.add(new TextField({ name: 'chave_canonica', max: 120 }))
      console.log('[ll5/dedupe] + chave_canonica')
    }
    try {
      app.save(col)
    } catch (err) {
      console.log('[ll5/dedupe] falha ao salvar campo: ' + String(err).slice(0, 160))
    }

    // ---- 2) LIMPEZA das duplicatas existentes ----
    let todas = []
    try {
      todas = app.findRecordsByFilter('ll5_activity', "id != ''", '-created', 0, 0)
    } catch (err) {
      console.log('[ll5/dedupe] falha ao listar: ' + String(err).slice(0, 160))
      return
    }

    console.log('[ll5/dedupe] atividades lidas: ' + todas.length)

    // agrupa pela chave canônica
    const grupos = {}
    for (const r of todas) {
      let dataMs = 0
      try {
        const d = r.getDateTime('data_hora_inicio')
        dataMs = d ? new Date(String(d)).getTime() : 0
      } catch (_) {
        dataMs = 0
      }
      // arredonda para o MINUTO: CSV e API diferem em segundos
      const minuto = dataMs ? Math.floor(dataMs / 60000) : 0
      const tipo = String(r.getString('tipo') || 'outro')
      let dist = 0
      try {
        dist = Math.round(Number(r.getFloat('distancia_m') || 0) / 100)
      } catch (_) {
        dist = 0
      }
      const chave = minuto + '|' + tipo + '|' + dist

      // grava a chave no proprio registro
      try {
        r.set('chave_canonica', chave)
        app.save(r)
      } catch (_) {}

      if (!grupos[chave]) grupos[chave] = []
      grupos[chave].push(r)
    }

    // pontuação de qualidade: quem fica
    const pontuar = (r) => {
      let p = 0
      try {
        const z = r.get('zonas_fc_seg')
        if (z && (typeof z === 'object' ? Object.keys(z).length : String(z).length > 5)) p += 100
      } catch (_) {}
      try {
        if (r.getBool('tem_streams')) p += 50
      } catch (_) {}
      try {
        if (String(r.getString('fonte') || '').indexOf('csv') >= 0) p += 30
      } catch (_) {}
      try {
        if (r.getFloat('fc_media')) p += 10
      } catch (_) {}
      try {
        if (r.getFloat('cadencia_spm')) p += 5
      } catch (_) {}
      return p
    }

    let removidas = 0
    const chaves = Object.keys(grupos)
    for (const k of chaves) {
      const lista = grupos[k]
      if (!lista || lista.length < 2) continue

      // ordena por qualidade desc, depois por criação asc
      lista.sort((a, b) => {
        const pa = pontuar(a)
        const pb = pontuar(b)
        if (pa !== pb) return pb - pa
        return String(a.getString('created') || '').localeCompare(
          String(b.getString('created') || ''),
        )
      })

      // mantém o primeiro, remove os demais
      for (let i = 1; i < lista.length; i++) {
        try {
          app.delete(lista[i])
          removidas++
        } catch (err) {
          console.log('[ll5/dedupe] falha ao remover ' + lista[i].id)
        }
      }
    }

    console.log('[ll5/dedupe] grupos=' + chaves.length + ' removidas=' + removidas)

    // ---- 3) índice único em chave_canonica ----
    try {
      const conf = app.findCollectionByNameOrId('ll5_activity')
      const idx = conf.indexes || []
      const temIndice = idx.some((i) => String(i).indexOf('chave_canonica') >= 0)
      if (!temIndice) {
        conf.indexes = idx.concat([
          'CREATE UNIQUE INDEX idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
        ])
        app.save(conf)
        console.log('[ll5/dedupe] índice único criado')
      }
    } catch (err) {
      console.log('[ll5/dedupe] índice não criado: ' + String(err).slice(0, 160))
    }
  },
  (app) => {
    console.log('[ll5/dedupe] rollback: duplicatas removidas não são recriadas')
  },
)
