/// <reference path="../pb_data/types.d.ts" />
// 0062 — Coleção 'seguros': apólices e instrumentos securitários do grupo.
// Espelha o padrão das coleções documentais (alvaras, contratos, convencoes):
// dados do seguro + anexo de arquivo (apólice em PDF).
migrate(
  (app) => {
    const collection = new Collection({
      name: 'seguros',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'titulo', type: 'text', required: true },
        { name: 'empresa', type: 'text' },
        { name: 'seguradora', type: 'text' },
        { name: 'corretora', type: 'text' },
        { name: 'numero_apolice', type: 'text' },
        { name: 'ramo', type: 'text' },
        { name: 'objeto', type: 'text' },
        { name: 'cobertura', type: 'text' },
        { name: 'importancia_segurada', type: 'number' },
        { name: 'premio_total', type: 'number' },
        { name: 'franquia', type: 'number' },
        { name: 'vigencia_inicio', type: 'date' },
        { name: 'vigencia_fim', type: 'date' },
        { name: 'status', type: 'text' },
        { name: 'responsaveis', type: 'text' },
        { name: 'observacoes', type: 'text' },
        {
          name: 'anexo',
          type: 'file',
          maxSelect: 10,
          maxSize: 52428800,
          mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        },
      ],
      indexes: [
        'CREATE INDEX idx_seguros_empresa ON seguros (empresa)',
        'CREATE INDEX idx_seguros_apolice ON seguros (numero_apolice)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('seguros')
    app.delete(collection)
  },
)
