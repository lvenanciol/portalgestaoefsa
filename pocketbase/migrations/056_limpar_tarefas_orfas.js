/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPAR TAREFAS ÓRFÃS DE TRATAMENTO — AGORA (16/11/2026)
//
// O print do dono mostra várias "Liberação Miofascial · dd/mm/aaaa" vivas no
// kanban, de tratamentos já excluídos.
//
// CAUSA: a exclusão apagava apenas os ids em `tarefa_ids`. Tarefa criada por
// outro caminho (reconciliação, recorrência, sincronização que perdeu o id)
// nunca saía.
//
// Esta migração reúne, por SQL, os ids vinculados a tratamentos VIVOS e apaga
// as tarefas de padrão de agenda ("<Tipo> · dd/mm/aaaa") que não estejam
// nessa lista.
//
// Tarefa avulsa do PGE (sem o padrão de agenda) NÃO é tocada.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- retrato ----------
    try {
      const a = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of a) console.log('[orfas] total de tarefas antes: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const t = db.newQuery('SELECT COUNT(*) AS n FROM ll5_treatments').all()
      for (const r of t) console.log('[orfas] tratamentos no banco: ' + String(r.get('n')))
    } catch (_) {}

    // ---------- ids de tarefa vinculados a tratamentos VIVOS ----------
    //
    // Lê o JSON `tarefa_ids` e `tarefa_por_data` de cada tratamento não
    // excluído. Em SQL, JSON1 pode não estar habilitado no PocketBase, então
    // usamos a API de records (segura) apenas para MONTAR a lista — o DELETE
    // continua por SQL.
    const idsVivos = {}
    const tiposConhecidos = {}

    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[orfas] falha ao ler tratamentos: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    for (const tr of tratamentos) {
      let tipo = ''
      try {
        tipo = String(tr.getString('tipo_nome') || '').trim()
      } catch (_) {}
      if (tipo) tiposConhecidos[tipo] = true

      let excluido = false
      try {
        const del = String(tr.getString('deletado_em') || '')
        if (del.length > 4) excluido = true
      } catch (_) {}
      if (excluido) continue

      // tarefa_ids
      try {
        const bruto = tr.get('tarefa_ids')
        let ids = []
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
        for (const i of ids) idsVivos[String(i)] = true
      } catch (_) {}

      // tarefa_por_data
      try {
        const m = tr.get('tarefa_por_data')
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          for (const k of Object.keys(m)) idsVivos[String(m[k])] = true
        }
      } catch (_) {}
    }

    console.log('[orfas] ids vinculados a tratamentos vivos: ' + Object.keys(idsVivos).length)
    console.log('[orfas] tipos conhecidos: ' + Object.keys(tiposConhecidos).join(', '))

    // ---------- varredura das tarefas ----------
    let candidatas = []
    try {
      candidatas = db
        .newQuery("SELECT id, titulo, status_kanban FROM tarefas WHERE titulo LIKE '%·%'")
        .all()
    } catch (err) {
      console.log('[orfas] consulta: ' + String(err).slice(0, 160))
      candidatas = []
    }

    console.log('[orfas] candidatas (título com ·): ' + candidatas.length)

    let apagadas = 0
    const amostra = []

    for (const row of candidatas) {
      const id = String(row.get('id'))
      if (idsVivos[id]) continue

      const titulo = String(row.get('titulo') || '')
      const m = /^(.+?)\s*·\s*\d{2}\/\d{2}\/\d{4}\s*$/.exec(titulo)
      if (!m) continue

      const tipoTarefa = m[1].trim()
      if (!tiposConhecidos[tipoTarefa]) continue

      try {
        db.newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        apagadas++
        if (amostra.length < 12) amostra.push(titulo)
      } catch (errDel) {
        console.log('[orfas] falha ao apagar ' + id + ': ' + String(errDel).slice(0, 120))
      }
    }

    console.log('[orfas] apagadas: ' + apagadas)
    for (const a of amostra) console.log('[orfas] ex.: ' + a)

    // ---------- notificações sem tarefa ----------
    try {
      db.newQuery(
        'DELETE FROM notificacoes WHERE tarefa_id NOT IN (SELECT id FROM tarefas)',
      ).execute()
      console.log('[orfas] notificações órfãs removidas')
    } catch (_) {}

    // ---------- retrato final ----------
    try {
      const f = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of f) console.log('[orfas] total de tarefas depois: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const g = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of g) l.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[orfas] por coluna: ' + l.join(' · '))
    } catch (_) {}

    console.log('[orfas] CONCLUÍDO')
  },
  (app) => {
    console.log('[orfas] rollback: tarefas não são recriadas')
  },
)
