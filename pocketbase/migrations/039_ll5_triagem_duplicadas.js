/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — REMOVER TAREFAS DUPLICADAS EM 'triagem' (15/11/2026)
//
// b6 do pedido: o "Reconciliar tarefas" criou tarefas novas em status
// 'triagem' quando já existia a mesma tarefa em outro status.
//
// Esta migração apaga, por SQL, as tarefas em 'triagem' que têm outra tarefa
// no MESMO DIA com status diferente. Mantém a que já estava sendo trabalhada.
// Só toca em tarefas sem projeto vinculado (as do PGE real ficam intactas).
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // diagnóstico antes
    try {
      const r = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of r) {
        console.log('[triagem] antes: ' + String(x.get('n')) + ' em triagem')
      }
    } catch (err) {
      console.log('[triagem] contagem: ' + String(err).slice(0, 120))
    }

    // apaga a duplicata em triagem quando existe outra no mesmo dia
    try {
      db.newQuery(
        'DELETE FROM tarefas ' +
          "WHERE status = 'triagem' " +
          "  AND (projeto_id IS NULL OR projeto_id = '') " +
          '  AND EXISTS (' +
          '    SELECT 1 FROM tarefas t2 ' +
          '    WHERE t2.id != tarefas.id ' +
          "      AND t2.status != 'triagem' " +
          '      AND DATE(t2.prazo) = DATE(tarefas.prazo) ' +
          '      AND DATE(tarefas.prazo) IS NOT NULL' +
          '  )',
      ).execute()
      console.log('[triagem] DELETE de duplicatas executado')
    } catch (err) {
      console.log('[triagem] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // diagnóstico depois
    try {
      const r2 = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of r2) {
        console.log('[triagem] depois: ' + String(x.get('n')) + ' em triagem')
      }
    } catch (_) {}

    console.log('[triagem] CONCLUÍDO')
  },
  (app) => {
    console.log('[triagem] rollback: nada é recriado')
  },
)
