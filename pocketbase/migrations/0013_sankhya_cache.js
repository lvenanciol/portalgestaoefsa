// Fase 10 (prompt-mestre) — cache do snapshot Sankhya do sync diário 06:00.
// Escrita só via hooks (regras null); leitura para usuários autenticados.

migrate(
  (app) => {
    const c = new Collection({
      name: 'sankhya_cache',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'chave', type: 'text', required: true, max: 60 },
        { name: 'payload', type: 'json', maxSize: 500000 },
        { name: 'gerado_em', type: 'text', max: 40 },
        { name: 'status', type: 'text', max: 20 },
        { name: 'falhas', type: 'json', maxSize: 20000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_skcache_chave ON sankhya_cache (chave)'],
    })
    app.save(c)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('sankhya_cache'))
    } catch (_) {}
  },
)
