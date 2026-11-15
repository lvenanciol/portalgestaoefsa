/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR TAREFAS EM 'triagem' DO KANBAN (15/11/2026)
//
// CAUSA DAS 6 TENTATIVAS FALHAREM: eu apagava por `status = 'triagem'`, mas
// 'triagem' é valor do campo **`status_kanban`**, não de `status`.
//
//   status        → pendente | em_andamento | concluida
//   status_kanban → triagem | a_fazer | em_andamento | bloqueado | concluido
//
// O kanban do print mostra "TRIAGEM 31" — esse número vem de `status_kanban`.
// Todas as migrações anteriores (104, 105, 106, 107, 109) filtraram o campo
// errado e por isso apagaram ZERO linhas, sempre.
//
// Esta migração acerta o campo.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- antes: contagem pelos DOIS campos ----------
    try {
      const r = db.newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status').all()
      const l = []
      for (const x of r) l.push('status:' + String(x.get('status')) + '=' + String(x.get('n')))
      console.log('[triagem3] ANTES ' + l.join(' · '))
    } catch (err) {
      console.log('[triagem3] status: ' + String(err).slice(0, 120))
    }

    try {
      const r2 = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l2 = []
      for (const x of r2) {
        l2.push('kanban:' + String(x.get('status_kanban')) + '=' + String(x.get('n')))
      }
      console.log('[triagem3] ANTES ' + l2.join(' · '))
    } catch (err) {
      console.log('[triagem3] status_kanban: ' + String(err).slice(0, 120))
    }

    // ---------- DELETE pelo campo CORRETO ----------
    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[triagem3] DELETE status_kanban=triagem executado')
    } catch (err) {
      console.log('[triagem3] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- depois ----------
    try {
      const r3 = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l3 = []
      for (const x of r3) {
        l3.push('kanban:' + String(x.get('status_kanban')) + '=' + String(x.get('n')))
      }
      console.log('[triagem3] DEPOIS ' + l3.join(' · '))
    } catch (_) {}

    try {
      const rt = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const x of rt) console.log('[triagem3] total de tarefas: ' + String(x.get('n')))
    } catch (_) {}

    console.log('[triagem3] CONCLUÍDO')
  },
  (app) => {
    console.log('[triagem3] rollback: tarefas não são recriadas')
  },
)
