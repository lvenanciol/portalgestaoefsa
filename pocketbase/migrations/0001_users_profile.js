// Fase 2 — Migração 0001: campos não-relacionais do perfil no users (auth).
// As relações (grupo_id/empresa_id/unidade_id) são adicionadas na 0002,
// depois que as coleções existem. Self-update travado para campos sensíveis.
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

    // Self-update travado: grupo/empresa/unidade/ativo não podem mudar via self-update
    users.updateRule =
      'id = @request.auth.id && @request.body.grupo_id:changed = false && @request.body.empresa_id:changed = false && @request.body.unidade_id:changed = false && @request.body.ativo:changed = false'

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
    app.save(users)
  },
)
