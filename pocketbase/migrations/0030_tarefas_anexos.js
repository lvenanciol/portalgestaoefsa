// 0030_tarefas_anexos.js
// Adiciona o campo 'anexos' (FileField, múltiplo, até 50MB cada) na coleção tarefas
// para persistir anexos/mídias das tarefas no backend PocketBase.

migrate(
  (app) => {
    const tarefas = app.findCollectionByNameOrId('tarefas')
    if (!tarefas.fields.getByName('anexos')) {
      tarefas.fields.add(
        new FileField({
          name: 'anexos',
          maxSelect: 0, // 0 = múltiplos / sem limite de quantidade
          maxSize: 52428800, // 50 MB
        }),
      )
      app.save(tarefas)
    }
  },
  (app) => {
    try {
      const tarefas = app.findCollectionByNameOrId('tarefas')
      tarefas.fields.removeByName('anexos')
      app.save(tarefas)
    } catch (_) {}
  },
)
