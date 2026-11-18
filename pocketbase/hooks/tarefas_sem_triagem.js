// ============================================================================
// TAREFAS EM 'triagem' SÃO EXCLUÍDAS (v2 — 16/11/2026)
//
// DIRETIVA DO DONO: "TAREFAS criadas com status = triagem devem ser excluídas
// incondicionalmente".
//
// ┌─ DESCOBERTA QUE EXPLICA AS 40 CONTINUAREM ────────────────────────────┐
// │ O kanban agrupa com `t.status_kanban || 'triagem'`.                    │
// │ Portanto: campo VAZIO (NULL ou '') é EXIBIDO como TRIAGEM.             │
// │ Cada tarefa criada sem definir status_kanban entrava nesse caso, e as  │
// │ migrações que filtravam `= 'triagem'` (literal) não as alcançavam.     │
// └────────────────────────────────────────────────────────────────────────┘
//
// Aqui os TRÊS estados são tratados:
//   1. tarefa criada/movida com status_kanban VAZIO  → recebe 'a_fazer'
//   2. tarefa criada/movida com 'triagem' (literal)  → é APAGADA
//   3. cron de 15 min                               → rede de segurança
//
// API: onRecordAfterCreateSuccess / onRecordAfterUpdateSuccess — as mesmas de
// tarefas_notificacoes.js, comprovadamente carregadas neste runtime.
// ============================================================================

// ---------------------------------------------------------------------------
// AO CRIAR
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  // 18/11/2026 — instrumentação de diagnóstico: saber se este hook roda e
  // termina no CREATE (suspeito de quebrar a cadeia e reverter a transação).
  console.log('[sem-triagem] create INICIO')
  try {
    const t = e.record
    if (!t) return e.next()

    const raw = String(t.getString('status_kanban') || '')
      .trim()
      .toLowerCase()
    const id = String(t.id)
    console.log('[sem-triagem] create status_kanban=' + raw)

    if (raw === 'triagem') {
      // pedido explícito do dono: apagar
      console.log('[sem-triagem] criada em triagem — APAGANDO ' + id)
      try {
        $app.db().newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
      } catch (_) {
        try {
          $app.delete(t)
        } catch (_) {}
      }
      return e.next()
    }

    if (!raw) {
      // campo vazio: o kanban mostraria como triagem. Corrige para a_fazer.
      console.log('[sem-triagem] criada sem status_kanban — promovendo para a_fazer ' + id)
      try {
        $app
          .db()
          .newQuery("UPDATE tarefas SET status_kanban = 'a_fazer' WHERE id = {:id}")
          .bind({ id: id })
          .execute()
      } catch (_) {
        try {
          t.set('status_kanban', 'a_fazer')
          $app.save(t)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[sem-triagem] create: ' + String(err).slice(0, 160))
  } finally {
    return e.next()
  }
}, 'tarefas')

// ---------------------------------------------------------------------------
// AO ATUALIZAR
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  try {
    const t = e.record
    if (!t) return e.next()

    const raw = String(t.getString('status_kanban') || '')
      .trim()
      .toLowerCase()
    const id = String(t.id)

    if (raw === 'triagem') {
      console.log('[sem-triagem] movida para triagem — APAGANDO ' + id)
      try {
        $app.db().newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
      } catch (_) {
        try {
          $app.delete(t)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[sem-triagem] update: ' + String(err).slice(0, 160))
  } finally {
    return e.next()
  }
}, 'tarefas')

// ---------------------------------------------------------------------------
// REDE DE SEGURANÇA — a cada 15 minutos
//
// Apaga as literais em 'triagem' e PROMOVE as de campo vazio para 'a_fazer'
// (apagar uma tarefa só porque o campo veio vazio destruiria dado legítimo;
// promover resolve o efeito no kanban sem perder a tarefa).
// ---------------------------------------------------------------------------
cronAdd('tarefas_limpar_triagem', '*/15 * * * *', () => {
  try {
    const db = $app.db()

    let literais = 0
    try {
      const r = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const x of r) literais = Number(x.get('n') || 0)
    } catch (_) {}

    if (literais > 0) {
      try {
        db.newQuery(
          "DELETE FROM notificacoes WHERE tarefa_id IN (SELECT id FROM tarefas WHERE status_kanban = 'triagem')",
        ).execute()
      } catch (_) {}
      try {
        db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
        console.log('[sem-triagem] cron apagou ' + literais + ' literal(is) em triagem')
      } catch (err) {
        console.log('[sem-triagem] cron delete: ' + String(err).slice(0, 140))
      }
    }

    let vazios = 0
    try {
      const r2 = db
        .newQuery(
          "SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban IS NULL OR TRIM(COALESCE(status_kanban,'')) = ''",
        )
        .all()
      for (const x of r2) vazios = Number(x.get('n') || 0)
    } catch (_) {}

    if (vazios > 0) {
      try {
        db.newQuery(
          "UPDATE tarefas SET status_kanban = 'a_fazer' WHERE status_kanban IS NULL OR TRIM(COALESCE(status_kanban,'')) = ''",
        ).execute()
        console.log('[sem-triagem] cron promoveu ' + vazios + ' tarefa(s) sem status para a_fazer')
      } catch (err) {
        console.log('[sem-triagem] cron update: ' + String(err).slice(0, 140))
      }
    }
  } catch (errGeral) {
    console.log('[sem-triagem] cron erro: ' + String(errGeral).slice(0, 160))
  }
})
