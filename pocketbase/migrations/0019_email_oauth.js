// COR-4 F8 — Conexão real Gmail/Outlook (OAuth 2.0):
// - email_oauth_state: state anti-CSRF de uso único (iniciar → callback)
// - email_oauth_tokens: access/refresh tokens por provedor (google/microsoft)
// - emails_inbox: caixa de entrada sincronizada (Gmail API / Microsoft Graph)
// Regras: autenticados do portal (mesmo padrão das coleções operacionais).

migrate(
  (app) => {
    const state = new Collection({
      name: 'email_oauth_state',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'state', type: 'text', required: true, max: 64 },
        { name: 'provedor', type: 'select', values: ['google', 'microsoft'], maxSelect: 1 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_emailstate_state ON email_oauth_state (state)'],
    })
    app.save(state)

    const tokens = new Collection({
      name: 'email_oauth_tokens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'provedor', type: 'select', values: ['google', 'microsoft'], maxSelect: 1 },
        { name: 'conta', type: 'text', max: 190 },
        { name: 'access_token', type: 'text', max: 4000 },
        { name: 'refresh_token', type: 'text', max: 2000 },
        { name: 'expires_at', type: 'date' },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_emailtok_provedor ON email_oauth_tokens (provedor)'],
    })
    app.save(tokens)

    const inbox = new Collection({
      name: 'emails_inbox',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'message_id', type: 'text', required: true, max: 190 },
        { name: 'provedor', type: 'text', max: 20 },
        { name: 'de', type: 'text', max: 190 },
        { name: 'assunto', type: 'text', max: 500 },
        { name: 'preview', type: 'text', max: 500 },
        { name: 'recebido_em', type: 'date' },
        { name: 'lido', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_inbox_msg ON emails_inbox (provedor, message_id)',
        'CREATE INDEX idx_inbox_recebido ON emails_inbox (recebido_em)',
      ],
    })
    app.save(inbox)
  },
  (app) => {
    for (const nome of ['emails_inbox', 'email_oauth_tokens', 'email_oauth_state']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
