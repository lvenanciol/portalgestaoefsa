/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR TODAS AS TAREFAS EM 'triagem' (15/11/2026)
//
// PEDIDO DIRETO DO DONO: "Apague todas as tarefas com status triagem".
//
// O print do kanban mostrava 31 cartões na coluna TRIAGEM, e as MESMAS
// tarefas repetidas em A Fazer (30), Em Andamento (11) e Concluído (6) —
// resultado das criações repetidas do reconciliar.
//
// Esta migração apaga TUDO em 'triagem', sem condição. É o que foi pedido.
// Se alguma triagem legítima existir, o fluxo do PGE a recria.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- antes ----------
    try {
      const r = db.newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status').all()
      const l = []
      for (const x of r) l.push(String(x.get('status')) + '=' + String(x.get('n')))
      console.log('[apagar] ANTES: ' + l.join(' · '))
    } catch (err) {
      console.log('[apagar] group by antes: ' + String(err).slice(0, 140))
    }

    // ---------- apaga TODAS as triagem ----------
    try {
      db.newQuery("DELETE FROM tarefas WHERE status = 'triagem'").execute()
      console.log('[apagar] DELETE de todas as triagem executado')
    } catch (err) {
      console.log('[apagar] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- depois ----------
    try {
      const r2 = db.newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status').all()
      const l2 = []
      for (const x of r2) l2.push(String(x.get('status')) + '=' + String(x.get('n')))
      console.log('[apagar] DEPOIS: ' + l2.join(' · '))
    } catch (_) {}

    try {
      const rt = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const x of rt) console.log('[apagar] total de tarefas: ' + String(x.get('n')))
    } catch (_) {}

    console.log('[apagar] CONCLUÍDO')
  },
  (app) => {
    console.log('[apagar] rollback: tarefas de triagem não são recriadas')
  },
)
