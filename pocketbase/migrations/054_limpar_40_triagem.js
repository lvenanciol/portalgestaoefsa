/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// EXCLUIR AS 40 TAREFAS EM 'triagem' — AGORA (16/11/2026)
//
// O print do dono mostra TRIAGEM 40 no kanban, todas "Liberação Miofascial ·
// 11/11/2026" — ou seja, a MESMA sessão replicada por cada salvamento do
// tratamento (o loop de `sincronizarAgenda`).
//
// Aqui a limpeza é por SQL direto, no campo correto (`status_kanban`), sem
// condição. O log mostra o retrato antes e depois.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    try {
      const a = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of a) console.log('[limpar40] total antes: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const b = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of b) l.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[limpar40] ANTES: ' + l.join(' · '))
    } catch (_) {}

    // amostra do que vai sair (para o log provar que é o lote certo)
    try {
      const s = db
        .newQuery("SELECT titulo, prazo FROM tarefas WHERE status_kanban = 'triagem' LIMIT 5")
        .all()
      for (const r of s) {
        console.log(
          '[limpar40] amostra: ' + String(r.get('titulo')) + ' | ' + String(r.get('prazo')),
        )
      }
    } catch (_) {}

    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[limpar40] DELETE status_kanban=triagem')
    } catch (err) {
      console.log('[limpar40] DELETE falhou: ' + String(err).slice(0, 200))
    }

    try {
      const c = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l2 = []
      for (const r of c) l2.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[limpar40] DEPOIS: ' + l2.join(' · '))
    } catch (_) {}

    try {
      const d = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of d) console.log('[limpar40] total depois: ' + String(r.get('n')))
    } catch (_) {}

    console.log('[limpar40] CONCLUÍDO')
  },
  (app) => {
    console.log('[limpar40] rollback: tarefas não são recriadas')
  },
)
