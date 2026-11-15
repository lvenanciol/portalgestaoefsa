/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — DEDUPE POR DIA + DISTÂNCIA (v4, 15/11/2026)
//
// POR QUE AS VERSÕES ANTERIORES FALHARAM
//
// 094: criou UNIQUE INDEX antes de preencher a chave → save falhava calado.
// 095: chave vazia em todas as 2.350 linhas → grupos de 1 → nada apagado.
// 096: drop do índice CORRETO, mas a chave era `minuto|tipo|distância`.
//
// O PROBLEMA DO MINUTO:
//   CSV grava "2026-11-13T06:11:57-03:00" → PocketBase pode interpretar
//   LITERALMENTE como 06:11 UTC, enquanto a API devolve "09:11:57Z".
//   São 180 MINUTOS de diferença na mesma corrida → a chave nunca casa.
//   O print mostra exatamente isso: a mesma "Vila Velha Running 5,40 km"
//   aparece duas vezes, uma com fonte .FI e outra CS.
//
// A SOLUÇÃO: agrupar por DIA + tipo + distância. Uma pessoa não faz duas
// corridas do MESMO tipo e MESMA distância no mesmo dia. É determinístico
// e imune a fuso horário.
//
// Esta migração também remove as tarefas com título inválido.
// ============================================================================
migrate(
  (app) => {
    // ===================== 1) ATIVIDADES =====================
    try {
      app.db().newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[dedupe4] índice removido')
    } catch (err) {
      console.log('[dedupe4] drop index: ' + String(err).slice(0, 120))
    }

    let atividades = []
    try {
      atividades = app.findRecordsByFilter('ll5_activity', "id != ''", 'created', 0, 0)
    } catch (_) {
      atividades = []
    }
    console.log('[dedupe4] lidas: ' + atividades.length)

    if (atividades.length > 0) {
      // ---- agrupa por DIA + tipo + distância ----
      const grupos = {}
      for (const r of atividades) {
        let dia = 'sem-data'
        try {
          const bruto = String(r.get('data_hora_inicio') || '')
          // pega só a parte AAAA-MM-DD, ignorando hora e fuso
          const m = /(\d{4})-(\d{2})-(\d{2})/.exec(bruto)
          if (m) dia = m[1] + '-' + m[2] + '-' + m[3]
        } catch (_) {}

        const tipo = String(r.get('tipo') || 'outro')

        let dist = 0
        try {
          const d = r.get('distancia_m')
          if (d != null && Number(d) > 0) dist = Math.round(Number(d) / 100)
        } catch (_) {}

        const chave = dia + '|' + tipo + '|' + dist
        if (!grupos[chave]) grupos[chave] = []
        grupos[chave].push(r)
      }

      // ---- qualidade: quem sobrevive ----
      const pontuar = (r) => {
        let p = 0
        try {
          const z = r.get('zonas_fc_seg')
          if (z) {
            if (typeof z === 'object' && Object.keys(z).length > 0) p += 100
            else if (typeof z === 'string' && z.length > 5 && z !== '{}') p += 100
          }
        } catch (_) {}
        try {
          if (r.get('tem_streams') === true) p += 50
        } catch (_) {}
        try {
          if (String(r.get('fonte') || '').indexOf('csv') >= 0) p += 30
        } catch (_) {}
        try {
          const fc = r.get('fc_media')
          if (fc != null && Number(fc) > 0) p += 10
        } catch (_) {}
        try {
          const cad = r.get('cadencia_spm')
          if (cad != null && Number(cad) > 0) p += 5
        } catch (_) {}
        return p
      }

      let removidas = 0
      let marcados = 0
      const chaves = Object.keys(grupos)

      for (const k of chaves) {
        const lista = grupos[k]
        if (!lista || lista.length < 2) continue

        lista.sort((a, b) => {
          const pa = pontuar(a)
          const pb = pontuar(b)
          if (pa !== pb) return pb - pa
          return String(a.id).localeCompare(String(b.id))
        })

        // mantém o primeiro (melhor), apaga o resto
        for (let i = 1; i < lista.length; i++) {
          try {
            app.delete(lista[i])
            removidas++
          } catch (_) {}
        }
        marcados++
      }

      console.log(
        '[dedupe4] grupos=' +
          chaves.length +
          ' com duplicata=' +
          marcados +
          ' removidas=' +
          removidas,
      )

      // ---- grava a nova chave nos sobreviventes ----
      let gravadas = 0
      try {
        const restantes = app.findRecordsByFilter('ll5_activity', "id != ''", '', 0, 0)
        for (const r of restantes) {
          try {
            let dia2 = 'sem-data'
            const b2 = String(r.get('data_hora_inicio') || '')
            const m2 = /(\d{4})-(\d{2})-(\d{2})/.exec(b2)
            if (m2) dia2 = m2[1] + '-' + m2[2] + '-' + m2[3]

            const tipo2 = String(r.get('tipo') || 'outro')
            const d2 = r.get('distancia_m')
            const dist2 = d2 != null && Number(d2) > 0 ? Math.round(Number(d2) / 100) : 0

            // registros sem data recebem a própria id (nunca colidem)
            const chave2 =
              dia2 === 'sem-data' ? 'sem-data|' + String(r.id) : dia2 + '|' + tipo2 + '|' + dist2
            r.set('chave_canonica', chave2)
            app.save(r)
            gravadas++
          } catch (_) {}
        }
      } catch (_) {}
      console.log('[dedupe4] sobreviventes marcados: ' + gravadas)

      // recria o índice único
      try {
        app
          .db()
          .newQuery(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
          )
          .execute()
        console.log('[dedupe4] índice recriado')
      } catch (err) {
        console.log('[dedupe4] índice: ' + String(err).slice(0, 120))
      }
    }

    // ===================== 2) TAREFAS INVÁLIDAS =====================
    // Remove as tarefas do reconciliar cujo título termina em número
    // (data inválida, ex.: "· 93") — são lixo de execuções anteriores.
    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", 'created', 0, 0)
    } catch (_) {
      tarefas = []
    }
    console.log('[dedupe4] tarefas lidas: ' + tarefas.length)

    let tarefasRemovidas = 0
    for (const t of tarefas) {
      let titulo = ''
      try {
        titulo = String(t.get('titulo') || '')
      } catch (_) {}

      // padrão do lixo: "... · <número de 1 a 3 dígitos>"
      const lixo = / · \d{1,3}$/.test(titulo)
      if (!lixo) continue

      // nunca tocar em tarefa com projeto vinculado (é do PGE real)
      let temProjeto = false
      try {
        if (t.get('projeto_id')) temProjeto = true
      } catch (_) {}
      if (temProjeto) continue

      try {
        app.delete(t)
        tarefasRemovidas++
      } catch (_) {}
    }
    console.log('[dedupe4] tarefas inválidas removidas: ' + tarefasRemovidas)
  },
  (app) => {
    console.log('[dedupe4] rollback: nada é recriado')
  },
)
