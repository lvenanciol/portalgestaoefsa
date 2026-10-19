// Ajustes PGE (19/10) — T2b/T2c/T3: parceiros/contatos centrais;
// T4/T7: logomarcas por empresa. Parceiros usados em todo o sistema
// (tarefas obrigatórias, compartilhar, vínculo a centro de resultado Sankhya).

migrate(
  (app) => {
    const parceiros = new Collection({
      name: 'parceiros',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true, max: 190 },
        {
          name: 'tipo',
          type: 'select',
          values: ['Parceiro', 'Contato', 'Fornecedor', 'Cliente'],
          maxSelect: 1,
        },
        { name: 'empresa', type: 'text', max: 120 },
        { name: 'documento', type: 'text', max: 30 },
        { name: 'email', type: 'text', max: 190 },
        { name: 'whatsapp', type: 'text', max: 30 },
        { name: 'telefone', type: 'text', max: 30 },
        { name: 'cargo', type: 'text', max: 120 },
        { name: 'centro_resultado', type: 'text', max: 120 },
        { name: 'centro_resultado_codigo', type: 'text', max: 40 },
        { name: 'observacao', type: 'text', max: 2000 },
        { name: 'ativo', type: 'bool' },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_parceiros_nome ON parceiros (nome)'],
    })
    app.save(parceiros)

    const logomarcas = new Collection({
      name: 'logomarcas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'empresa', type: 'text', required: true, max: 120 },
        { name: 'sigla', type: 'text', max: 10 },
        { name: 'cor', type: 'text', max: 20 },
        {
          name: 'logo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
        },
        {
          name: 'emblema',
          type: 'file',
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
        },
        { name: 'ativo', type: 'bool' },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_logomarcas_emp ON logomarcas (empresa)'],
    })
    app.save(logomarcas)

    // seeds logomarcas (Extrafruti verde #1B5E20 — paleta respeitada)
    const seeds = [
      { empresa: 'Extrafruti', sigla: 'EX', cor: '#1B5E20' },
      { empresa: 'Casafruti', sigla: 'CA', cor: '#F59E0B' },
      { empresa: 'FoldBox', sigla: 'FB', cor: '#0F3D13' },
    ]
    for (const s of seeds) {
      try {
        app.findFirstRecordByFilter('logomarcas', 'empresa = "' + s.empresa + '"')
      } catch (_) {
        const col = app.findCollectionByNameOrId('logomarcas')
        const r = new Record(col)
        r.set('empresa', s.empresa)
        r.set('sigla', s.sigla)
        r.set('cor', s.cor)
        r.set('ativo', true)
        app.save(r)
      }
    }

    // tarefas: parceiros vinculados (JSONB — ids de parceiros)
    const ta = app.findCollectionByNameOrId('tarefas')
    ta.fields.add(new JSONField({ name: 'parceiros', maxSize: 20000 }))
    app.save(ta)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('parceiros'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('logomarcas'))
    } catch (_) {}
    try {
      const ta = app.findCollectionByNameOrId('tarefas')
      try {
        ta.fields.removeByName('parceiros')
      } catch (_) {}
      app.save(ta)
    } catch (_) {}
  },
)
