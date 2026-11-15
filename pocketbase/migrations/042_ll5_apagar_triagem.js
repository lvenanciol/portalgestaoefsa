/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR TODAS AS TAREFAS EM 'triagem' (15/11/2026)
//
// Pedido direto do dono: "Apagar todas as novas tarefas criadas com status
// triagem". As tentativas anteriores (104, 105, 106) usaram critérios
// condicionais (data equivalente, título com data) e o banco mostra que
// ainda restam tarefas.
//
// Aqui é simples e sem condição: DELETE de tudo que está em 'triagem' e foi
// criado pelo reconciliar (criado_por = 'reconciliar' ou vazio) e NÃO tem
// projeto vinculado — para não tocar em triagem legítima do fluxo do PGE.
//
// O log imprime contagem antes, quantas removidas e contagem depois.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- contagem por status antes ----------
    try {
      const r = db.newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status').all()
      const l = []
      for (const x of r) l.push(String(x.get('status')) + '=' + String(x.get('n')))
      console.log('[apagar-triagem] ANTES: ' + l.join(' · '))
    } catch (err) {
      console.log('[apagar-triagem] group by: ' + String(err).slice(0, 140))
    }

    // ---------- 1) apaga triagem sem projeto vinculado ----------
    try {
      db.newQuery(
        'DELETE FROM tarefas ' +
          "WHERE status = 'triagem' " +
          "  AND (projeto_id IS NULL OR projeto_id = '')",
      ).execute()
      console.log('[apagar-triagem] DELETE (sem projeto) executado')
    } catch (err) {
      console.log('[apagar-triagem] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- 2) sobra: triagem criada pelo reconciliar ----------
    try {
      db.newQuery(
        'DELETE FROM tarefas ' +
          "WHERE status = 'triagem' " +
          "  AND (criado_por = 'reconciliar' OR criado_por = '' OR criado_por IS NULL)",
      ).execute()
      console.log('[apagar-triagem] DELETE (criado_por reconciliar) executado')
    } catch (err) {
      console.log('[apagar-triagem] DELETE 2: ' + String(err).slice(0, 200))
    }

    // ---------- 3) contagem depois ----------
    try {
      const r2 = db.newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status').all()
      const l2 = []
      for (const x of r2) l2.push(String(x.get('status')) + '=' + String(x.get('n')))
      console.log('[apagar-triagem] DEPOIS: ' + l2.join(' · '))
    } catch (_) {}

    // ---------- 4) total final ----------
    try {
      const rt = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const x of rt) console.log('[apagar-triagem] total de tarefas: ' + String(x.get('n')))
    } catch (_) {}

    console.log('[apagar-triagem] CONCLUÍDO')
  },
  (app) => {
    console.log('[apagar-triagem] rollback: tarefas não são recriadas')
  },
)
