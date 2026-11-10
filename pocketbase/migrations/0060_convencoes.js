/// <reference path="../pb_data/types.d.ts" />
// 0060 — Coleção 'convencoes': convenções coletivas e instrumentos coletivos de trabalho
// Mesmo padrão das coleções documentais existentes (alvaras, contratos, locacoes, atas).
migrate(
  (app) => {
    const collection = new Collection({
      name: 'convencoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'titulo', type: 'text', required: true },
        { name: 'empresa', type: 'text' },
        { name: 'entidade_sindical', type: 'text' },
        { name: 'parte_patronal', type: 'text' },
        { name: 'vigencia_inicio', type: 'date' },
        { name: 'vigencia_fim', type: 'date' },
        { name: 'data_base', type: 'text' },
        { name: 'reajuste_percentual', type: 'number' },
        { name: 'piso_salarial', type: 'number' },
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
      indexes: ['CREATE INDEX idx_convencoes_empresa ON convencoes (empresa)'],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('convencoes')
    app.delete(collection)
  },
)
