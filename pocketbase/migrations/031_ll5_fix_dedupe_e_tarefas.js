/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — CORREÇÃO DEFINITIVA (15/11/2026)
//
// ─────────────────────────────────────────────────────────────────────────
// BUG 1 — O DEDUPE NUNCA RODOU POR CAUSA DO PRÓPRIO ÍNDICE
//
// A migração 094 criou:
//   CREATE UNIQUE INDEX idx_ll5_activity_canonica ON ll5_activity (chave_canonica)
//
// E deixou 2.350 linhas com `chave_canonica` VAZIA. Quando a 095 tentou
// gravar a chave em cada linha para agrupar, a segunda gravação violou o
// índice único (todas com o mesmo valor vazio) → `app.save` falhava em
// silêncio → nenhuma linha recebia chave → grupos de 1 → nada era apagado.
//
// ORDEM CORRETA: DROP do índice → apagar duplicatas → recriar o índice.
//
// ─────────────────────────────────────────────────────────────────────────
// BUG 2 — O RECONCILIAR CRIOU TAREFAS EM MASSA
//
// `proximas_sessoes` pode conter valores que NÃO são ISO (números, datas com
// hora). Meu código fazia `String(dia).slice(0,10)` e concatenava
// " 12:00:00.000Z" → data INVÁLIDA → `prazo` gravado vazio (o print mostra
// PRAZO "—"). Como o dedupe comparava por prazo, cada execução não achava as
// tarefas antigas (prazo vazio) e criava outras.
//
// Esta migração LIMPA as tarefas duplicadas criadas assim.
// ============================================================================
migrate(
  (app) => {
    // ===================== PARTE 1: ATIVIDADES =====================
    try {
      app.db().newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[fix] índice único removido (permitia o dedupe)')
    } catch (err) {
      console.log('[fix] drop index: ' + String(err).slice(0, 140))
    }

    let atividades = []
    try {
      atividades = app.findRecordsByFilter('ll5_activity', "id != ''", 'created', 0, 0)
    } catch (_) {
      atividades = []
    }
    console.log('[fix] atividades lidas: ' + atividades.length)

    if (atividades.length > 0) {
      // agrupa por data(minuto)+tipo+distância
      const grupos = {}
      for (const r of atividades) {
        // data: aceita "2026-11-13 09:11:57.000Z"
        let ms = 0
        try {
          const bruto = String(r.get('data_hora_inicio') || '')
          ms = new Date(bruto.replace(' ', 'T')).getTime()
          if (!isFinite(ms)) ms = 0
        } catch (_) {
          ms = 0
        }
        const minuto = ms > 0 ? Math.floor(ms / 60000) : 0
        const tipo = String(r.get('tipo') || 'outro')
        let dist = 0
        try {
          const d = r.get('distancia_m')
          if (d != null && Number(d) > 0) dist = Math.round(Number(d) / 100)
        } catch (_) {}
        const chave = minuto + '|' + tipo + '|' + dist

        if (!grupos[chave]) grupos[chave] = []
        grupos[chave].push(r)
      }

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
        return p
      }

      let removidas = 0
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
        for (let i = 1; i < lista.length; i++) {
          try {
            app.delete(lista[i])
            removidas++
          } catch (_) {}
        }
      }
      console.log('[fix] atividades removidas: ' + removidas + ' · grupos: ' + chaves.length)

      // marca a chave nos sobreviventes e recria o índice
      let marcados = 0
      try {
        const restantes = app.findRecordsByFilter('ll5_activity', "id != ''", '', 0, 0)
        for (const r of restantes) {
          try {
            let ms2 = 0
            const bruto2 = String(r.get('data_hora_inicio') || '')
            ms2 = new Date(bruto2.replace(' ', 'T')).getTime()
            if (!isFinite(ms2)) ms2 = 0
            const minuto2 = ms2 > 0 ? Math.floor(ms2 / 60000) : 0
            const tipo2 = String(r.get('tipo') || 'outro')
            const d2 = r.get('distancia_m')
            const dist2 = d2 != null && Number(d2) > 0 ? Math.round(Number(d2) / 100) : 0
            // sufixo com o id evita colisão quando data/tipo/dist são nulos
            const chave2 =
              minuto2 > 0 ? minuto2 + '|' + tipo2 + '|' + dist2 : 'sem-data|' + String(r.id)
            r.set('chave_canonica', chave2)
            app.save(r)
            marcados++
          } catch (_) {}
        }
      } catch (_) {}
      console.log('[fix] sobreviventes marcados: ' + marcados)

      try {
        app
          .db()
          .newQuery(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
          )
          .execute()
        console.log('[fix] índice único recriado')
      } catch (err) {
        console.log('[fix] recriar índice: ' + String(err).slice(0, 140))
      }
    }

    // ===================== PARTE 2: TAREFAS DUPLICADAS =====================
    //
    // Remove as tarefas criadas em massa pelo reconciliar: mesmo TÍTULO com
    // mais de uma ocorrência e sem vínculo (origem 'avulsa'). Mantém a mais
    // antiga de cada título. As tarefas legítimas de projeto têm vínculo e
    // não são tocadas.
    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", 'created', 0, 0)
    } catch (_) {
      tarefas = []
    }
    console.log('[fix] tarefas lidas: ' + tarefas.length)

    const porTitulo = {}
    for (const t of tarefas) {
      let titulo = ''
      try {
        titulo = String(t.get('titulo') || '')
      } catch (_) {}

      // só olhamos as que têm o padrão do reconciliar (contém " · ")
      if (titulo.indexOf(' · ') < 0) continue

      // nunca tocar em tarefa de projeto
      let temVinculo = false
      try {
        const v = t.get('projeto_id')
        if (v) temVinculo = true
      } catch (_) {}
      if (temVinculo) continue

      if (!porTitulo[titulo]) porTitulo[titulo] = []
      porTitulo[titulo].push(t)
    }

    let tarefasRemovidas = 0
    const titulos = Object.keys(porTitulo)
    for (const tt of titulos) {
      const lista = porTitulo[tt]
      if (!lista || lista.length < 2) continue
      // mantém a mais antiga
      lista.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      for (let i = 1; i < lista.length; i++) {
        try {
          app.delete(lista[i])
          tarefasRemovidas++
        } catch (_) {}
      }
    }

    console.log('[fix] tarefas duplicadas removidas: ' + tarefasRemovidas)
    console.log('[fix] CONCLUÍDO')
  },
  (app) => {
    console.log('[fix] rollback: nada é recriado')
  },
)
