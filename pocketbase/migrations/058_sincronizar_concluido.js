/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// SINCRONIZAR STATUS: SESSÃO CONCLUÍDA ⇒ TAREFA CONCLUÍDA (16/11/2026)
//
// PROBLEMA RELATADO: as tarefas "Liberação Miofascial · 23/09, 15/10 e 13/11"
// aparecem CONCLUÍDAS no tratamento, mas estão em "A Fazer" no kanban.
//
// CAUSA: a conclusão da sessão grava a data em `sessoes_concluidas` do
// tratamento, mas a TAREFA daquela data só é atualizada no fluxo de
// "salvar sessão". Quando a conclusão vem de outro caminho (botão de ação,
// botão "marcar como realizado", ou uma gravação anterior à correção), a
// tarefa fica para trás — divergência permanente entre os dois lados.
//
// Esta migração reconcilia TODOS os tratamentos: para cada data em
// `sessoes_concluidas`, a tarefa correspondente passa a concluída.
//
// Direção única (não faz o inverso): concluir sessão conclui tarefa; mas
// tarefa concluída NÃO conclui sessão — isso evitaria efeito colateral.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    let tratamentos = []
    try {
      // sort VAZIO: 'created' lança "invalid sort field" e mata o laço
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[sync-concluido] falha ao listar tratamentos: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    console.log('[sync-concluido] tratamentos: ' + tratamentos.length)

    let ajustadas = 0
    const detalhes = []

    for (const tr of tratamentos) {
      // ---------- datas concluídas ----------
      let concluidas = []
      try {
        const bruto = tr.get('sessoes_concluidas')
        if (Array.isArray(bruto)) concluidas = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          concluidas = Array.isArray(p) ? p : []
        }
      } catch (_) {
        concluidas = []
      }
      if (!Array.isArray(concluidas) || !concluidas.length) continue

      // ---------- mapa data → tarefa ----------
      let mapa = {}
      try {
        const m = tr.get('tarefa_por_data')
        if (m && typeof m === 'object' && !Array.isArray(m)) mapa = { ...m }
      } catch (_) {
        mapa = {}
      }

      // fallback: reconstrói o mapa pelos tarefa_ids
      if (!Object.keys(mapa).length) {
        let ids = []
        try {
          const brutoIds = tr.get('tarefa_ids')
          if (Array.isArray(brutoIds)) ids = brutoIds
          else if (typeof brutoIds === 'string') {
            const pi = JSON.parse(brutoIds)
            ids = Array.isArray(pi) ? pi : []
          }
        } catch (_) {
          ids = []
        }
        for (const idc of ids) {
          try {
            const tc = app.findRecordById('tarefas', String(idc))
            const dc = String(tc.getDateTime('prazo') || '').slice(0, 10)
            if (dc) mapa[dc] = String(idc)
          } catch (_) {}
        }
      }

      const tipoNome = String(tr.getString('tipo_nome') || '').trim()

      for (const brutoDia of concluidas) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(brutoDia || '').trim())
        if (!m) continue
        const dia = m[1] + '-' + m[2] + '-' + m[3]

        // procura a tarefa desta data
        let idTarefa = mapa[dia] ? String(mapa[dia]) : ''

        // fallback por título quando o mapa não tem a data
        if (!idTarefa && tipoNome) {
          const diaBR = dia.split('-').reverse().join('/')
          try {
            const ach = app.findRecordsByFilter(
              'tarefas',
              "titulo ~ '" + diaBR.replace(/'/g, "''") + "'",
              '',
              10,
              0,
            )
            for (const c of ach) {
              const tit = String(c.getString('titulo') || '')
              if (tit.indexOf(tipoNome) === 0) {
                idTarefa = String(c.id)
                break
              }
            }
          } catch (_) {}
        }

        if (!idTarefa) continue

        // já está concluída?
        let jaOk = false
        try {
          const t = app.findRecordById('tarefas', idTarefa)
          const st = String(t.getString('status') || '')
          const sk = String(t.getString('status_kanban') || '')
          jaOk = st === 'concluida' || sk === 'concluido'
        } catch (_) {
          continue
        }
        if (jaOk) continue

        // ---------- conclui a tarefa por SQL ----------
        try {
          db.newQuery(
            "UPDATE tarefas SET status = 'concluida', status_kanban = 'concluido' WHERE id = {:id}",
          )
            .bind({ id: idTarefa })
            .execute()
          ajustadas++
          if (detalhes.length < 15) {
            detalhes.push((tipoNome || '?') + ' · ' + dia.split('-').reverse().join('/'))
          }
        } catch (err) {
          console.log('[sync-concluido] falha em ' + idTarefa + ': ' + String(err).slice(0, 120))
        }
      }
    }

    console.log('[sync-concluido] tarefas concluídas: ' + ajustadas)
    for (const d of detalhes) console.log('[sync-concluido] ex.: ' + d)

    // ---------- retrato ----------
    try {
      const a = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'concluido'")
        .all()
      for (const r of a) console.log('[sync-concluido] total concluídas: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const b = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of b) l.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[sync-concluido] por coluna: ' + l.join(' · '))
    } catch (_) {}

    console.log('[sync-concluido] CONCLUÍDO')
  },
  (app) => {
    console.log('[sync-concluido] rollback: status revertido manualmente se necessário')
  },
)
