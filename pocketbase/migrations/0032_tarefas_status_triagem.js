// Migration 0032 — Adiciona o status "triagem" nas opções de status_kanban
// e atualiza tarefas existentes que estejam sem status para o fluxo padrão.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('tarefas')
    const campo = col.fields.getByName('status_kanban')
    if (campo) {
      // Atualiza valores do select para incluir triagem no início
      const valores = campo.values || []
      if (!valores.includes('triagem')) {
        campo.values = ['triagem', 'a_fazer', 'em_andamento', 'bloqueado', 'concluido']
        campo.maxSelect = 1
        app.save(col)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('tarefas')
      const campo = col.fields.getByName('status_kanban')
      if (campo) {
        campo.values = ['a_fazer', 'em_andamento', 'bloqueado', 'concluido']
        campo.maxSelect = 1
        app.save(col)
      }
    } catch (_) {}
  },
)
