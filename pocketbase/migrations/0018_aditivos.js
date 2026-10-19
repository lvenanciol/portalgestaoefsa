// COR-3 F8 — Aditivos em contratos: coleção contratos_aditivos com vínculo
// ao contrato-pai (contrato_id). O alerta de vencimento 90/60/30 do Dashboard
// recalcula a partir da vigência do ÚLTIMO aditivo (nova_vigencia) quando
// existir, senão do fim do contrato.
// Leitura/escrita autenticadas; exclusão só via gate (tela).

migrate(
  (app) => {
    const aditivos = new Collection({
      name: 'contratos_aditivos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'contrato_id', type: 'text', required: true, max: 30 },
        { name: 'numero', type: 'text', required: true, max: 60 },
        { name: 'data', type: 'date' },
        { name: 'valor', type: 'number', onlyInt: false },
        { name: 'indexador', type: 'text', max: 120 },
        { name: 'nova_vigencia', type: 'date' },
        { name: 'aprovador', type: 'text', max: 120 },
        { name: 'anexo', type: 'file', maxSelect: 1, maxSize: 10485760 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_aditivos_contrato ON contratos_aditivos (contrato_id)',
        'CREATE INDEX idx_aditivos_data ON contratos_aditivos (data)',
      ],
    })
    app.save(aditivos)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('contratos_aditivos'))
    } catch (_) {}
  },
)
