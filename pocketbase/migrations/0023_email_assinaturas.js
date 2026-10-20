// TAREFA MAIL + T0c (20/10) — menu "E-mail" em INTEGRAÇÕES + coleção
// email_assinaturas (1 arquivo por provedor: google/microsoft).
// Regras: authenticated lê; update/create admin (upload de assinatura).
// Aceita pdf/png/jpg/svg (T4b).

migrate(
  (app) => {
    try {
      app.findFirstRecordByFilter('menus', 'rota = "/integracoes/email"')
    } catch (_) {
      const col = app.findCollectionByNameOrId('menus')
      const r = new Record(col)
      r.set('titulo', 'E-mail')
      r.set('rota', '/integracoes/email')
      r.set('secao', 'INTEGRAÇÕES')
      r.set('ordem', 4)
      r.set('icone', 'mail')
      r.set('ativo', true)
      app.save(r)
    }

    const col = new Collection({
      name: 'email_assinaturas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'provedor',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['google', 'microsoft'],
        },
        {
          name: 'arquivo',
          type: 'file',
          required: false,
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
        },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_email_assin_prov ON email_assinaturas (provedor)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findFirstRecordByFilter('menus', 'rota = "/integracoes/email"'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('email_assinaturas'))
    } catch (_) {}
  },
)
