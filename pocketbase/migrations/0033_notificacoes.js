// Migration 0033 — Sistema centralizado de notificações para tarefas e preferência no usuário
migrate(
  (app) => {
    // 1. Campo de preferência no users: notificacoes_desativadas (bool)
    const usersCol = app.findCollectionByNameOrId('users')
    if (!usersCol.fields.getByName('notificacoes_desativadas')) {
      usersCol.fields.add(
        new BoolField({
          name: 'notificacoes_desativadas',
          required: false,
        }),
      )
      app.save(usersCol)
    }

    // 2. Collection notificacoes
    const notifCol = new Collection({
      name: 'notificacoes',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (usuario_id = @request.auth.id || usuario_email = @request.auth.email)",
      viewRule:
        "@request.auth.id != '' && (usuario_id = @request.auth.id || usuario_email = @request.auth.email)",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.id != '' && (usuario_id = @request.auth.id || usuario_email = @request.auth.email)",
      deleteRule:
        "@request.auth.id != '' && (usuario_id = @request.auth.id || usuario_email = @request.auth.email)",
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: false,
          maxSelect: 1,
        },
        { name: 'usuario_email', type: 'text', required: false, max: 190 },
        { name: 'titulo', type: 'text', required: true, max: 250 },
        { name: 'mensagem', type: 'text', required: true, max: 2000 },
        {
          name: 'tipo',
          type: 'select',
          values: ['tarefa_status', 'tarefa_atribuicao', 'tarefa_triagem', 'sistema'],
          maxSelect: 1,
        },
        { name: 'tarefa_id', type: 'text', required: false, max: 50 },
        { name: 'rota', type: 'text', required: false, max: 250 },
        { name: 'autor_nome', type: 'text', required: false, max: 190 },
        { name: 'autor_email', type: 'text', required: false, max: 190 },
        { name: 'lida', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_notif_usuario ON notificacoes (usuario_id, lida, created DESC)',
        'CREATE INDEX idx_notif_email ON notificacoes (usuario_email, lida, created DESC)',
        'CREATE INDEX idx_notif_tarefa ON notificacoes (tarefa_id)',
      ],
    })
    app.save(notifCol)
  },
  (app) => {
    try {
      const notifCol = app.findCollectionByNameOrId('notificacoes')
      app.delete(notifCol)
    } catch (_) {}
    try {
      const usersCol = app.findCollectionByNameOrId('users')
      const campo = usersCol.fields.getByName('notificacoes_desativadas')
      if (campo) {
        usersCol.fields.removeByName('notificacoes_desativadas')
        app.save(usersCol)
      }
    } catch (_) {}
  },
)
