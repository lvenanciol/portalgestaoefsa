// ============================================================================
// 14/11/2026 — renomeia o menu "Tarefas & Agenda" para "Tarefas".
//
// O label da sidebar vem da coleção `menus` (não do código). Renomear só o
// componente deixaria o menu com o nome antigo.
//
// Migração idempotente: só atualiza o que ainda tem o título antigo.
// ============================================================================
migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('menus')
      const registros = app.findRecordsByFilter(
        'menus',
        'rota = "/tarefas" && titulo = "Tarefas & Agenda"',
        '',
        10,
        0,
      )
      for (const r of registros || []) {
        r.set('titulo', 'Tarefas')
        app.save(r)
        console.log('[014-rename-tarefas] menu renomeado: ' + r.id)
      }
      if (!registros || !registros.length) {
        console.log('[014-rename-tarefas] nenhum menu com o título antigo — nada a fazer')
      }
    } catch (err) {
      console.warn('[014-rename-tarefas] falhou: ' + String(err).slice(0, 200))
    }
  },
  (app) => {
    // rollback: volta o nome original
    try {
      const registros = app.findRecordsByFilter(
        'menus',
        'rota = "/tarefas" && titulo = "Tarefas"',
        '',
        10,
        0,
      )
      for (const r of registros || []) {
        r.set('titulo', 'Tarefas & Agenda')
        app.save(r)
      }
    } catch (_) {}
  },
)
