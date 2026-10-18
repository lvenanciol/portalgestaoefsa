// Fase 2 — Migração 0002: coleções base + relações do users resolvidas.
// Escopo empresa/unidade em TODAS as tabelas (list/view autenticado).
migrate(
  (app) => {
    // ---------- EMPRESAS ----------
    const empresas = new Collection({
      name: 'empresas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'cnpj', type: 'text', max: 20 },
        { name: 'cor', type: 'text', max: 12 },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_empresas_nome ON empresas (nome)'],
    })
    app.save(empresas)
    const empresasId = empresas.id

    // ---------- UNIDADES ----------
    const unidades = new Collection({
      name: 'unidades',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 120 },
        {
          name: 'empresa_id',
          type: 'relation',
          required: true,
          collectionId: empresasId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          values: ['loja', 'cd', 'matriz', 'administrativo'],
          maxSelect: 1,
        },
        { name: 'gestor_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'meta_mensal', type: 'number', onlyInt: false },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_unidades_nome_empresa ON unidades (empresa_id, nome)'],
    })
    app.save(unidades)
    const unidadesId = unidades.id

    // ---------- GRUPOS DE PERMISSÃO ----------
    const grupos = new Collection({
      name: 'grupos_permissao',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 80 },
        { name: 'descricao', type: 'text', max: 255 },
        { name: 'permissoes', type: 'json', maxSize: 200000 },
        {
          name: 'escopo',
          type: 'select',
          values: ['grupo', 'empresa', 'unidade'],
          maxSelect: 1,
          required: true,
        },
        { name: 'empresa_id', type: 'relation', collectionId: empresasId, maxSelect: 1 },
        { name: 'unidade_id', type: 'relation', collectionId: unidadesId, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_grupos_nome ON grupos_permissao (nome)'],
    })
    app.save(grupos)
    const gruposId = grupos.id

    // ---------- MENUS ----------
    const menus = new Collection({
      name: 'menus',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'titulo', type: 'text', required: true, max: 120 },
        { name: 'rota', type: 'text', max: 255 },
        { name: 'secao', type: 'text', max: 60 },
        { name: 'ordem', type: 'number', onlyInt: true },
        { name: 'icone', type: 'text', max: 60 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_menus_secao_ordem ON menus (secao, ordem)'],
    })
    app.save(menus)

    // ---------- AUDITORIA ----------
    const auditoria = new Collection({
      name: 'auditoria',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'usuario_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'usuario_email', type: 'text', max: 190 },
        { name: 'acao', type: 'text', required: true, max: 80 },
        { name: 'modulo', type: 'text', max: 80 },
        { name: 'detalhe', type: 'json', maxSize: 50000 },
        { name: 'ip', type: 'text', max: 60 },
        { name: 'empresa_id', type: 'relation', collectionId: empresasId, maxSelect: 1 },
        { name: 'unidade_id', type: 'relation', collectionId: unidadesId, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_auditoria_usuario ON auditoria (usuario_id, created DESC)',
        'CREATE INDEX idx_auditoria_acao ON auditoria (acao, created DESC)',
      ],
    })
    app.save(auditoria)

    // ---------- USERS: relações agora que as coleções existem ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.add(new RelationField({ name: 'grupo_id', collectionId: gruposId, maxSelect: 1 }))
    users.fields.add(
      new RelationField({ name: 'empresa_id', collectionId: empresasId, maxSelect: 1 }),
    )
    users.fields.add(
      new RelationField({ name: 'unidade_id', collectionId: unidadesId, maxSelect: 1 }),
    )
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    for (const f of ['grupo_id', 'empresa_id', 'unidade_id']) {
      try {
        users.fields.removeByName(f)
      } catch (_) {}
    }
    app.save(users)
    for (const name of ['auditoria', 'menus', 'grupos_permissao', 'unidades', 'empresas']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
