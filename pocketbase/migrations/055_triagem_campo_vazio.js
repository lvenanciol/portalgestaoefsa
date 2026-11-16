/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// TRIAGEM: O CAMPO ESTÁ *VAZIO*, NÃO 'triagem' (16/11/2026)
//
// CAUSA DAS 40 TAREFAS CONTINUAREM APARECENDO:
//
//   O kanban agrupa com `t.status_kanban || 'triagem'` — ou seja, qualquer
//   tarefa com o campo VAZIO (NULL ou '') é EXIBIDA na coluna TRIAGEM.
//
//   Minhas migrações apagavam `WHERE status_kanban = 'triagem'`, que casa
//   apenas o valor LITERAL. As 40 têm o campo NULL/'' e passavam intactas.
//
// Esta migração apaga os TRÊS estados que a UI trata como triagem:
//   status_kanban IS NULL · status_kanban = '' · status_kanban = 'triagem'
//
// E também remove do sino (notificacoes) tudo que aponta para elas.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- retrato completo antes ----------
    try {
      const total = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of total) console.log('[fix40] total de tarefas: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const porStatus = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l = []
      for (const r of porStatus) {
        l.push(JSON.stringify(r.get('status_kanban')) + '=' + String(r.get('n')))
      }
      console.log('[fix40] ANTES por status_kanban: ' + l.join(' · '))
    } catch (err) {
      console.log('[fix40] group by: ' + String(err).slice(0, 160))
    }

    try {
      const vazios = db
        .newQuery(
          "SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban IS NULL OR TRIM(COALESCE(status_kanban,'')) = ''",
        )
        .all()
      for (const r of vazios) console.log('[fix40] com status_kanban VAZIO: ' + String(r.get('n')))
    } catch (_) {}

    // ---------- amostra do que será apagado ----------
    try {
      const amostra = db
        .newQuery(
          'SELECT titulo, prazo FROM tarefas ' +
            "WHERE status_kanban IS NULL OR TRIM(COALESCE(status_kanban,'')) = '' " +
            "   OR status_kanban = 'triagem' LIMIT 8",
        )
        .all()
      for (const r of amostra) {
        console.log('[fix40] amostra: ' + String(r.get('titulo')) + ' | ' + String(r.get('prazo')))
      }
    } catch (_) {}

    // ---------- apaga notificações (sino) dessas tarefas ----------
    try {
      db.newQuery(
        'DELETE FROM notificacoes WHERE tarefa_id IN (' +
          '  SELECT id FROM tarefas WHERE status_kanban IS NULL ' +
          "    OR TRIM(COALESCE(status_kanban,'')) = '' OR status_kanban = 'triagem'" +
          ')',
      ).execute()
      console.log('[fix40] notificações (sino) removidas')
    } catch (err) {
      console.log('[fix40] sino: ' + String(err).slice(0, 160))
    }

    // ---------- apaga as tarefas ----------
    let apagadas = 0
    try {
      // 1) literal 'triagem'
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[fix40] DELETE status_kanban=triagem')
    } catch (err) {
      console.log('[fix40] DELETE literal: ' + String(err).slice(0, 160))
    }

    try {
      // 2) NULL
      db.newQuery('DELETE FROM tarefas WHERE status_kanban IS NULL').execute()
      console.log('[fix40] DELETE status_kanban IS NULL')
    } catch (err) {
      console.log('[fix40] DELETE null: ' + String(err).slice(0, 160))
    }

    try {
      // 3) vazio ''
      db.newQuery("DELETE FROM tarefas WHERE TRIM(COALESCE(status_kanban,'')) = ''").execute()
      console.log('[fix40] DELETE status_kanban vazio')
    } catch (err) {
      console.log('[fix40] DELETE vazio: ' + String(err).slice(0, 160))
    }

    // ---------- conferência ----------
    try {
      const depois = db
        .newQuery('SELECT status_kanban, COUNT(*) AS n FROM tarefas GROUP BY status_kanban')
        .all()
      const l2 = []
      for (const r of depois) {
        l2.push(JSON.stringify(r.get('status_kanban')) + '=' + String(r.get('n')))
      }
      console.log('[fix40] DEPOIS por status_kanban: ' + l2.join(' · '))
    } catch (_) {}

    try {
      const t2 = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of t2) console.log('[fix40] total agora: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const v2 = db
        .newQuery(
          "SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban IS NULL OR TRIM(COALESCE(status_kanban,'')) = '' OR status_kanban = 'triagem'",
        )
        .all()
      for (const r of v2) {
        console.log('[fix40] AINDA em triagem (visível): ' + String(r.get('n')))
      }
    } catch (_) {}

    console.log('[fix40] CONCLUÍDO')
  },
  (app) => {
    console.log('[fix40] rollback: tarefas não são recriadas')
  },
)
