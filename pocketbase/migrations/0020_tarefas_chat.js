// Tarefas 2a/2b — histórico da tarefa em formato de chat com anexos:
// - tarefas_chat: mensagens do histórico (autor, texto, anexo file, tipo)
// A tarefa continua em tarefas; o histórico vive aqui (1 registro/mensagem).

migrate(
  (app) => {
    const chat = new Collection({
      name: 'tarefas_chat',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'tarefa_id', type: 'text', required: true, max: 30 },
        { name: 'autor', type: 'text', max: 190 },
        { name: 'autor_tipo', type: 'select', values: ['portal', 'parceiro'], maxSelect: 1 },
        { name: 'texto', type: 'text', max: 5000 },
        {
          name: 'anexo',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: [
            'image/png',
            'image/jpeg',
            'image/webp',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'text/csv',
            'audio/mpeg',
            'audio/mp4',
            'audio/wav',
            'audio/webm',
            'video/mp4',
            'video/webm',
          ],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX idx_tchat_tarefa ON tarefas_chat (tarefa_id)'],
    })
    app.save(chat)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('tarefas_chat'))
    } catch (_) {}
  },
)
