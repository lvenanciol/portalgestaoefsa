// ============================================================================
// TAREFAS EM 'triagem' SÃO EXCLUÍDAS (16/11/2026)
//
// DIRETIVA DO DONO: "TAREFAS criadas com status = triagem devem ser excluídas
// incondicionalmente".
//
// API usada: `onRecordAfterCreateSuccess` / `onRecordAfterUpdateSuccess` —
// as mesmas que `tarefas_notificacoes.js` já usa neste projeto e que o runtime
// comprovadamente carrega. A tentativa anterior com `onRecordCreateRequest`
// NÃO registrou o hook (o cron nem apareceu na lista de jobs).
//
// Estratégia, em duas frentes:
//   1. HOOK — toda tarefa que chega em 'triagem' é APAGADA na hora;
//   2. CRON (15 min) — remove o que escapar por gravação de sistema.
//
// Atenção ao escopo: no JSVM cada callback tem que declarar suas funções
// DENTRO dele. Nada de helper no topo do arquivo.
// ============================================================================

// ---------------------------------------------------------------------------
// AO CRIAR: se nasceu em triagem, apaga imediatamente.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  try {
    const t = e.record
    if (!t) return e.next()

    const st = String(t.getString('status_kanban') || '')
      .toLowerCase()
      .trim()

    if (st === 'triagem') {
      const id = String(t.id)
      console.log('[sem-triagem] APAGANDO tarefa criada em triagem: ' + id)

      // apaga via SQL (não passa pelo hook de novo, evita recursão)
      try {
        $app.db().newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        console.log('[sem-triagem] apagada: ' + id)
      } catch (errSql) {
        // fallback pela API de records
        try {
          $app.delete(t)
          console.log('[sem-triagem] apagada (fallback): ' + id)
        } catch (errDel) {
          console.log('[sem-triagem] FALHA ao apagar ' + id + ': ' + String(errDel).slice(0, 140))
        }
      }
    }
  } catch (err) {
    console.log('[sem-triagem] create: ' + String(err).slice(0, 160))
  } finally {
    return e.next()
  }
}, 'tarefas')

// ---------------------------------------------------------------------------
// AO ATUALIZAR: se foi movida para triagem, apaga.
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  try {
    const t = e.record
    if (!t) return e.next()

    const st = String(t.getString('status_kanban') || '')
      .toLowerCase()
      .trim()

    if (st === 'triagem') {
      const id = String(t.id)
      console.log('[sem-triagem] APAGANDO tarefa movida para triagem: ' + id)
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
// REDE DE SEGURANÇA — a cada 15 minutos apaga o que restar.
// ---------------------------------------------------------------------------
cronAdd('tarefas_limpar_triagem', '*/15 * * * *', () => {
  try {
    const db = $app.db()

    let antes = 0
    try {
      const r = db
        .newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status_kanban = 'triagem'")
        .all()
      for (const x of r) antes = Number(x.get('n') || 0)
    } catch (_) {}

    if (antes === 0) return

    try {
      db.newQuery("DELETE FROM tarefas WHERE status_kanban = 'triagem'").execute()
      console.log('[sem-triagem] cron apagou ' + antes + ' tarefa(s) em triagem')
    } catch (err) {
      console.log('[sem-triagem] cron falhou: ' + String(err).slice(0, 160))
    }
  } catch (errGeral) {
    console.log('[sem-triagem] cron erro: ' + String(errGeral).slice(0, 160))
  }
})
