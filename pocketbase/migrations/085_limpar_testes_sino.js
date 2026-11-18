/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LIMPEZA DOS TESTES DO SINO + RÓTULOS DE DIAGNÓSTICO (18/11/2026)
//
// 1) Remove as tarefas criadas durante o diagnóstico ("TESTE SINO", "DIAG",
//    "VALIDACAO SINO", "VALID NOME", "ORDEM HOOKS", "SINO AUTO").
// 2) Remove as notificações associadas a essas tarefas.
// 3) Remove a migração de prova (084) não tem efeito em dado.
//
// Tarefas reais e notificações reais NÃO são tocadas.
// ============================================================================
migrate(
  (app) => {
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
      const ts = app.db().newQuery('SELECT id, titulo FROM tarefas').all()
      for (const x of ts) {
        const titulo = String(x.get('titulo') || '')
        for (const m of marcadores) {
          if (titulo.indexOf(m) >= 0) {
            ids.push(String(x.get('id')))
            break
          }
        }
      }
    } catch (e) {
      console.log('[limpa-sino] select: ' + String(e).slice(0, 140))
    }

    console.log('[limpa-sino] tarefas de teste encontradas: ' + ids.length)

    let notif = 0
    for (const id of ids) {
      try {
        app
          .db()
          .newQuery('DELETE FROM notificacoes WHERE tarefa_id = {:id}')
          .bind({ id: id })
          .execute()
        notif++
      } catch (_) {}
    }
    console.log('[limpa-sino] lotes de notificacao limpos: ' + notif)

    let rem = 0
    for (const id of ids) {
      try {
        app.db().newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        rem++
      } catch (_) {}
    }
    console.log('[limpa-sino] tarefas removidas: ' + rem)

    // notificação inserida manualmente no diagnóstico
    try {
      app.db().newQuery("DELETE FROM notificacoes WHERE titulo = 'TESTE MANUAL SINO'").execute()
      console.log('[limpa-sino] notificacao manual removida')
    } catch (_) {}

    try {
      const r = app.db().newQuery('SELECT COUNT(*) AS n FROM notificacoes').all()
      for (const x of r) console.log('[limpa-sino] notificacoes restantes: ' + String(x.get('n')))
    } catch (_) {}
    console.log('[limpa-sino] FIM')
  },
  (app) => {
    console.log('[limpa-sino] rollback nao aplicavel')
  },
)
