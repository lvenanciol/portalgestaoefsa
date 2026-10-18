// Fase 2 — Migração 0001: campos não-relacionais do perfil no users (auth).
// As relações (grupo_id/empresa_id/unidade_id) são adicionadas na 0002.
// Self-update: o usuário edita o próprio perfil, mas NÃO pode criar/excluir
// a própria conta (createRule/deleteRule null = só superuser/admin).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('cargo')) {
      users.fields.add(new TextField({ name: 'cargo', max: 120 }))
    }
    if (!users.fields.getByName('telefone')) {
      users.fields.add(new TextField({ name: 'telefone', max: 30 }))
    }
    if (!users.fields.getByName('ativo')) {
      users.fields.add(new BoolField({ name: 'ativo' }))
    }
    if (!users.fields.getByName('ultimo_login')) {
      users.fields.add(new DateField({ name: 'ultimo_login' }))
    }

    // Self-update: sem :changed (gramática PB não aceita o modificador aqui);
    // o vínculo grupo/empresa/unidade é protegido na Fase 3 via hooks de
    // validação (onRecordUpdate) — usuário comum não altera campos de acesso.
    users.updateRule = 'id = @request.auth.id'
    users.createRule = null
    users.deleteRule = null

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    for (const f of ['cargo', 'telefone', 'ativo', 'ultimo_login']) {
      try {
        users.fields.removeByName(f)
      } catch (_) {}
    }
    users.updateRule = 'id = @request.auth.id'
    users.createRule = ''
    users.deleteRule = 'id = @request.auth.id'
    app.save(users)
  },
)
