/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA + VÍNCULO DE TRATAMENTO NAS TAREFAS (16/11/2026)
//
// DIRETIVAS DO DONO:
//   (g) tarefa criada pela aba Tratamentos cujo tratamento não existe → apagar
//   (h) apagar TODAS as tarefas com "Liberação Miofascial" no título
//   (f) tarefa da aba Tratamentos deve exibir vínculo "tratamento"
//
// O print mostra as tarefas com a tag "avulsa" — quer dizer `origem='avulsa'`
// e `vinculo_tipo` vazio, porque eu nunca gravava esses campos ao criar.
//
// Ordem desta migração:
//   1. captura os ids de tarefa dos tratamentos VIVOS (ainda válidos)
//   2. apaga tudo com "Liberação Miofascial" no título (pedido h)
//   3. apaga órfãs de tratamento (pedido g)
//   4. marca vínculo "tratamento" nas tarefas que sobreviveram e pertencem
//      a um tratamento vivo (pedido f)
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- retrato ----------
    try {
      const a = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of a) console.log('[fix-trat] total antes: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const b = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE titulo LIKE '%Liberação Miofascial%'")
        .all()
      for (const r of b) {
        console.log('[fix-trat] com "Liberação Miofascial": ' + String(r.get('n')))
      }
    } catch (_) {}

    // ---------- 1) ids vinculados a tratamentos VIVOS ----------
    const idsVivos = {}
    const tiposVivos = {}

    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[fix-trat] leitura tratamentos: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    for (const tr of tratamentos) {
      let tipo = ''
      try {
        tipo = String(tr.getString('tipo_nome') || '').trim()
      } catch (_) {}
      if (tipo) tiposVivos[tipo] = true

      let excluido = false
      try {
        if (String(tr.getString('deletado_em') || '').length > 4) excluido = true
      } catch (_) {}
      if (excluido) continue

      try {
        const bruto = tr.get('tarefa_ids')
        let ids = []
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
        for (const i of ids) idsVivos[String(i)] = String(tr.id)
      } catch (_) {}

      try {
        const m = tr.get('tarefa_por_data')
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          for (const k of Object.keys(m)) idsVivos[String(m[k])] = String(tr.id)
        }
      } catch (_) {}
    }

    console.log(
      '[fix-trat] tratamentos=' +
        tratamentos.length +
        ' · ids vivos=' +
        Object.keys(idsVivos).length,
    )

    // ---------- 2) pedido (h): apaga "Liberação Miofascial" ----------
    try {
      db.newQuery("DELETE FROM tarefas WHERE titulo LIKE '%Liberação Miofascial%'").execute()
      console.log('[fix-trat] (h) tarefas "Liberação Miofascial" apagadas')
    } catch (err) {
      console.log('[fix-trat] (h) falhou: ' + String(err).slice(0, 180))
    }

    // ---------- 3) pedido (g): órfãs de tratamento ----------
    //
    // Critério: título no padrão "<Tipo> · dd/mm/aaaa" cujo Tipo pertence a
    // algum tratamento, mas o id NÃO está entre os vivos → tratamento sumiu.
    let candidatas = []
    try {
      candidatas = db.newQuery("SELECT id, titulo FROM tarefas WHERE titulo LIKE '%·%'").all()
    } catch (err) {
      console.log('[fix-trat] consulta: ' + String(err).slice(0, 140))
      candidatas = []
    }

    let orfas = 0
    for (const row of candidatas) {
      const id = String(row.get('id'))
      if (idsVivos[id]) continue

      const titulo = String(row.get('titulo') || '')
      const m = /^(.+?)\s*·\s*\d{2}\/\d{2}\/\d{4}\s*$/.exec(titulo)
      if (!m) continue

      const tipoTarefa = m[1].trim()
      if (!tiposVivos[tipoTarefa]) continue

      try {
        db.newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        orfas++
      } catch (_) {}
    }
    console.log('[fix-trat] (g) órfãs de tratamento apagadas: ' + orfas)

    // ---------- 4) pedido (f): vínculo "tratamento" ----------
    //
    // Tudo que restou e pertence a um tratamento vivo recebe:
    //   vinculo_tipo = 'tratamento'
    //   vinculo_id   = <id do tratamento>
    //   origem       = 'projeto'   ← tira a tag "avulsa" da tela
    let marcadas = 0
    for (const idTarefa of Object.keys(idsVivos)) {
      const idTrat = idsVivos[idTarefa]
      try {
        db.newQuery(
          "UPDATE tarefas SET vinculo_tipo = 'tratamento', vinculo_id = {:vid}, origem = 'projeto' WHERE id = {:id}",
        )
          .bind({ vid: idTrat, id: idTarefa })
          .execute()
        marcadas++
      } catch (err) {
        if (marcadas < 3) {
          console.log('[fix-trat] vinculo ' + idTarefa + ': ' + String(err).slice(0, 120))
        }
      }
    }
    console.log('[fix-trat] (f) tarefas marcadas como vínculo tratamento: ' + marcadas)

    // ---------- 5) notificações sem tarefa ----------
    try {
      db.newQuery(
        'DELETE FROM notificacoes WHERE tarefa_id NOT IN (SELECT id FROM tarefas)',
      ).execute()
      console.log('[fix-trat] notificações órfãs removidas')
    } catch (_) {}

    // ---------- retrato final ----------
    try {
      const f = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of f) console.log('[fix-trat] total depois: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const g = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of g) l.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[fix-trat] por coluna: ' + l.join(' · '))
    } catch (_) {}

    try {
      const h = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE vinculo_tipo = 'tratamento'")
        .all()
      for (const r of h) console.log('[fix-trat] com vínculo tratamento: ' + String(r.get('n')))
    } catch (_) {}

    console.log('[fix-trat] CONCLUÍDO')
  },
  (app) => {
    console.log('[fix-trat] rollback: tarefas não são recriadas')
  },
)
