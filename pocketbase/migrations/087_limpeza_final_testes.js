/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA FINAL DOS TESTES (18/11/2026)
//
// Remove o que sobrou dos diagnósticos desta sessão: tarefas de teste e as
// notificações/e-mails gerados por elas. Tarefas reais não são tocadas.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()
    const marcadores = [
      'TESTE SINO',
      'TESTE NOTIF',
      'TESTE PERSISTENCIA',
      'DIAG SINO',
      'DIAG LOG',
      'DIAG ERRO',
      'DIAG LACO',
      'VALIDACAO SINO',
      'VALID NOME',
      'ORDEM HOOKS',
      'SINO AUTO',
    ]

    const ids = []
    try {
      const r = db.newQuery('SELECT id, titulo FROM tarefas').all()
      for (const x of r) {
        const titulo = String(x.get('titulo') || '')
        for (const m of marcadores) {
          if (titulo.indexOf(m) >= 0) {
            ids.push(String(x.get('id')))
            break
          }
        }
      }
    } catch (e) {
      console.log('[limpa-final] select: ' + String(e).slice(0, 120))
    }
    console.log('[limpa-final] tarefas de teste: ' + ids.length)

    for (const id of ids) {
      try {
        db.newQuery('DELETE FROM notificacoes WHERE tarefa_id = {:id}').bind({ id: id }).execute()
      } catch (_) {}
      try {
        db.newQuery('DELETE FROM tarefas_chat WHERE tarefa_id = {:id}').bind({ id: id }).execute()
      } catch (_) {}
      try {
        db.newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        console.log('[limpa-final] removida ' + id)
      } catch (e) {
        console.log('[limpa-final] falha ao remover ' + id + ': ' + String(e).slice(0, 80))
      }
    }

    // e-mails e notificações dos testes (o SMTP já saiu; apagar o registro de
    // histórico evita poluir a tela de E-mails)
    try {
      let n = 0
      for (const m of marcadores) {
        const r = db
          .newQuery('SELECT COUNT(*) AS n FROM emails WHERE assunto LIKE {:p}')
          .bind({ p: '%' + m + '%' })
          .all()
        for (const x of r) n += Number(x.get('n') || 0)
      }
      for (const m of marcadores) {
        db.newQuery('DELETE FROM emails WHERE assunto LIKE {:p}')
          .bind({ p: '%' + m + '%' })
          .execute()
      }
      console.log('[limpa-final] e-mails de teste removidos: ' + n)
    } catch (e) {
      console.log('[limpa-final] emails: ' + String(e).slice(0, 100))
    }

    try {
      db.newQuery("DELETE FROM notificacoes WHERE titulo = 'TESTE MANUAL SINO'").execute()
    } catch (_) {}

    console.log('[limpa-final] FIM')
  },
  (app) => {
    console.log('[limpa-final] rollback nao aplicavel')
  },
)
