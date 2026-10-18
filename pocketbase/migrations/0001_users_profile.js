// Fase 2 — Migração 0001: estende a coleção users (auth) com campos de
// perfil do Portal de Gestão Executiva: grupo de permissão, empresa e unidade.
// Regra de self-update TRAVADA: o usuário não pode alterar o próprio
// grupo/empresa/unidade/ativo (campos que decidem acesso) via API.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('grupo_id')) {
      users.fields.add(
        new RelationField({
          name: 'grupo_id',
          collectionId: 'grupos_permissao_placeholder',
          maxSelect: 1,
        }),
      )
    }
    if (!users.fields.getByName('empresa_id')) {
      users.fields.add(
        new RelationField({
          name: 'empresa_id',
          collectionId: 'empresas_placeholder',
          maxSelect: 1,
        }),
      )
    }
    if (!users.fields.getByName('unidade_id')) {
      users.fields.add(
        new RelationField({
          name: 'unidade_id',
          collectionId: 'unidades_placeholder',
          maxSelect: 1,
        }),
      )
    }
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

    // Self-update travado: role/grupo/empresa/unidade/ativo não podem mudar via self-update
    users.updateRule =
      'id = @request.auth.id && @request.body.grupo_id:changed = false && @request.body.empresa_id:changed = false && @request.body.unidade_id:changed = false && @request.body.ativo:changed = false'

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    for (const f of [
      'grupo_id',
      'empresa_id',
      'unidade_id',
      'cargo',
      'telefone',
      'ativo',
      'ultimo_login',
    ]) {
      try {
        users.fields.removeByName(f)
      } catch (_) {}
    }
    users.updateRule = 'id = @request.auth.id'
    app.save(users)
  },
)
