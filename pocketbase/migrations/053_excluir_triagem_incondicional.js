/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// EXCLUIR TODAS AS TAREFAS EM 'triagem' — INCONDICIONALMENTE (16/11/2026)
//
// DIRETIVA DO DONO: "TAREFAS criadas com status = triagem devem ser excluídas
// incondicionalmente".
//
// Campos (não confundir):
//   status        → pendente | em_andamento | concluida
//   status_kanban → triagem | a_fazer | em_andamento | bloqueado | concluido
//
// Triagem vive em `status_kanban`. Esta migração apaga TUDO que estiver em
// triagem — sem filtro de projeto, criador ou data. É o que foi pedido.
//
// Em seguida, um hook (tarefas_sem_triagem.js) apaga qualquer tarefa que
// nasça em triagem, para que o estado não volte.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- retrato antes ----------
    try {
      const a = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of a) console.log('[triagem-final] total antes: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const b = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of b) l.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[triagem-final] antes por status_kanban: ' + l.join(' · '))
    } catch (err) {
      console.log('[triagem-final] group by antes: ' + String(err).slice(0, 140))
    }

    // ---------- DELETE incondicional ----------
    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[triagem-final] DELETE status_kanban=triagem')
    } catch (err) {
      console.log('[triagem-final] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- também as que têm o campo vazio e status=triagem ----------
    try {
      db.newQuery(
        "DELETE FROM tarefas WHERE COALESCE(status_kanban,'') = '' AND COALESCE(status,'') = 'triagem'",
      ).execute()
      console.log('[triagem-final] DELETE (kanban vazio + status triagem)')
    } catch (_) {}

    // ---------- conferência ----------
    try {
      const c = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l2 = []
      for (const r of c) l2.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      console.log('[triagem-final] DEPOIS por status_kanban: ' + l2.join(' · '))
    } catch (_) {}

    try {
      const d = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const r of d) console.log('[triagem-final] restantes em triagem: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const e = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of e) console.log('[triagem-final] total depois: ' + String(r.get('n')))
    } catch (_) {}

    console.log('[triagem-final] CONCLUÍDO')
  },
  (app) => {
    console.log('[triagem-final] rollback: tarefas não são recriadas')
  },
)
