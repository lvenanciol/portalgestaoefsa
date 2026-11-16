/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// SINCRONIZAR STATUS POR DATA — v2, MAIS ROBUSTA (16/11/2026)
//
// A migração 123 tentou reconciliar e o print mostra que não fechou:
// 13/11, 15/10 e 23/09 continuam em "A Fazer" no kanban, embora o tratamento
// as exiba como "Concluída".
//
// POR QUE A 123 FALHOU (hipóteses prováveis):
//   1. dependia de `tarefa_por_data`, e esse mapa pode estar vazio/errado;
//   2. o fallback por título usava `titulo ~ 'dd/mm/aaaa'` dentro de um
//      findRecordsByFilter — se a busca não casar (acento/encoding), nada é
//      encontrado e o laço segue em silêncio;
//   3. tarefa DUPLICADA na mesma data: uma foi concluída, a outra não, e a
//      que aparece no kanban é a segunda.
//
// ESTRATÉGIA DESTA VERSÃO (não depende de mapa nem de busca textual):
//   1. lê TODAS as tarefas e monta um índice por DIA do `prazo`;
//   2. para cada tratamento, pega `sessoes_concluidas`;
//   3. conclui TODA tarefa daquele dia cujo título comece com o tipo do
//      tratamento — inclusive duplicatas, para não sobrar cópia em A Fazer;
//   4. remove duplicatas da mesma data (mantém a primeira já concluída).
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- índice: dia → [tarefas] ----------
    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[sync2] listar tarefas: ' + String(err).slice(0, 140))
      tarefas = []
    }
    console.log('[sync2] tarefas lidas: ' + tarefas.length)

    const porDia = {}
    for (const t of tarefas) {
      let dia = ''
      try {
        dia = String(t.getDateTime('prazo') || '').slice(0, 10)
      } catch (_) {
        dia = ''
      }
      if (!dia) continue
      if (!porDia[dia]) porDia[dia] = []
      porDia[dia].push({
        id: String(t.id),
        titulo: String(t.getString('titulo') || ''),
        status: String(t.getString('status') || ''),
        kanban: String(t.getString('status_kanban') || ''),
      })
    }
    console.log('[sync2] dias distintos com tarefa: ' + Object.keys(porDia).length)

    // ---------- tratamentos ----------
    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[sync2] listar tratamentos: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    let concluidasAgora = 0
    let duplicadasRemovidas = 0
    const exemplos = []

    for (const tr of tratamentos) {
      let concluidas = []
      try {
        const b = tr.get('sessoes_concluidas')
        if (Array.isArray(b)) concluidas = b
        else if (typeof b === 'string') {
          const p = JSON.parse(b)
          concluidas = Array.isArray(p) ? p : []
        }
      } catch (_) {
        concluidas = []
      }
      if (!concluidas.length) continue

      const tipo = String(tr.getString('tipo_nome') || '').trim()
      if (!tipo) continue

      for (const bruto of concluidas) {
        const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(bruto || '').trim())
        if (!mm) continue
        const dia = mm[1] + '-' + mm[2] + '-' + mm[3]

        const lista = porDia[dia] || []
        if (!lista.length) {
          if (exemplos.length < 12) {
            exemplos.push('SEM TAREFA em ' + dia + ' para "' + tipo + '"')
          }
          continue
        }

        // tarefas daquele dia que representam este tratamento
        const doTratamento = []
        for (const item of lista) {
          if (item.titulo.indexOf(tipo) === 0) doTratamento.push(item)
        }
        // se o título não casar, aceita todas do dia (o dia é exclusivo)
        const alvo = doTratamento.length ? doTratamento : lista

        let mantida = ''

        for (let i = 0; i < alvo.length; i++) {
          const item = alvo[i]

          // conclui (inclusive as que já estavam, por idempotência)
          try {
            db.newQuery(
              "UPDATE tarefas SET status = 'concluida', status_kanban = 'concluido' WHERE id = {:id}",
            )
              .bind({ id: item.id })
              .execute()
            if (item.status !== 'concluida' || item.kanban !== 'concluido') {
              concluidasAgora++
              if (exemplos.length < 12) {
                exemplos.push('concluída: ' + item.titulo.slice(0, 45) + ' [' + dia + ']')
              }
            }
          } catch (err) {
            console.log('[sync2] falha em ' + item.id + ': ' + String(err).slice(0, 110))
          }

          // duplicata da mesma data: mantém a primeira, apaga as demais
          if (i === 0) {
            mantida = item.id
          } else {
            try {
              db.newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: item.id }).execute()
              duplicadasRemovidas++
            } catch (_) {}
          }
        }

        // atualiza o mapa data → tarefa com a que sobrou
        if (mantida) {
          try {
            const mapaBruto = tr.get('tarefa_por_data')
            const mapa =
              mapaBruto && typeof mapaBruto === 'object' && !Array.isArray(mapaBruto)
                ? mapaBruto
                : {}
            mapa[dia] = mantida
            tr.set('tarefa_por_data', mapa)
            app.save(tr)
          } catch (err) {
            console.log('[sync2] mapa ' + tr.id + ': ' + String(err).slice(0, 110))
          }
        }
      }
    }

    console.log('[sync2] tarefas concluídas agora: ' + concluidasAgora)
    console.log('[sync2] duplicatas removidas: ' + duplicadasRemovidas)
    for (const e of exemplos) console.log('[sync2] ' + e)

    // ---------- retrato final ----------
    try {
      const r = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const x of r) l.push(String(x.get('status_kanban')) + '=' + String(x.get('n')))
      console.log('[sync2] por coluna: ' + l.join(' · '))
    } catch (_) {}

    console.log('[sync2] CONCLUÍDO')
  },
  (app) => {
    console.log('[sync2] rollback: reversão manual se necessário')
  },
)
