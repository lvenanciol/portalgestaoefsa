/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// APAGAR TODAS AS TAREFAS EM 'triagem' — v4 (16/11/2026)
//
// PEDIDO DIRETO DO DONO: "apagar todas as 40 tarefas com status = triagem".
//
// HISTÓRICO — por que as tentativas anteriores deram zero:
//   · migrações 104/105/106/107/109/111 filtraram `status = 'triagem'`
//   · mas 'triagem' é valor de **`status_kanban`**, não de `status`
//     (status: pendente | em_andamento | concluida)
//   · a 111 (046_ll5_triagem_kanban) usou o campo certo e removeu — mas as
//     tarefas foram RECRIADAS depois pelo reconciliar/salvamento de tratamentos
//
// Esta passada apaga pelo campo correto E confere o resultado nos dois campos.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- diagnóstico: quantas por campo ----------
    try {
      const a = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of a) console.log('[triagem] total de tarefas: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const b = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const r of b) console.log('[triagem] status_kanban=triagem: ' + String(r.get('n')))
    } catch (err) {
      console.log('[triagem] contagem status_kanban: ' + String(err).slice(0, 140))
    }

    try {
      const c = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const r of c)
        console.log('[triagem] status=triagem (campo errado): ' + String(r.get('n')))
    } catch (_) {}

    // ---------- DELETE pelo campo CORRETO ----------
    let removidas = 0
    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[triagem] DELETE status_kanban=triagem executado')
    } catch (err) {
      console.log('[triagem] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- reforço: se alguma ficou com NULL/vazio em status_kanban ----------
    try {
      const d = db
        .newQuery(
          "SELECT COUNT(*) AS n FROM tarefas WHERE COALESCE(status_kanban,'') = '' AND COALESCE(status,'') = 'triagem'",
        )
        .all()
      for (const r of d)
        console.log('[triagem] kanban vazio + status triagem: ' + String(r.get('n')))
    } catch (_) {}

    try {
      db.newQuery(
        "DELETE FROM tarefas WHERE COALESCE(status_kanban,'') = '' AND COALESCE(status,'') = 'triagem'",
      ).execute()
    } catch (_) {}

    // ---------- conferência final ----------
    try {
      const e = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const r of e) {
        removidas = Number(r.get('n') || 0)
        console.log('[triagem] RESTANTES em triagem: ' + String(r.get('n')))
      }
    } catch (_) {}

    try {
      const f = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of f) console.log('[triagem] total de tarefas agora: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const g = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const linhas = []
      for (const r of g) {
        linhas.push(String(r.get('status_kanban')) + '=' + String(r.get('n')))
      }
      console.log('[triagem] distribuição: ' + linhas.join(' · '))
    } catch (_) {}

    console.log('[triagem] CONCLUÍDO (restantes=' + removidas + ')')
  },
  (app) => {
    console.log('[triagem] rollback: tarefas de triagem não são recriadas')
  },
)
