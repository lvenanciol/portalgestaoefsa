// TAREFA A/B/C — seção Integrações: menus (sidebar) + coleção integracoes_config
// (config por integração: whatsapp etc, JSONB). Sankhya/Gemini/Email/Power BI
// usam secrets/edge existentes — só WhatsApp precisa de config persistida.

migrate(
  (app) => {
    // menus: seção INTEGRAÇÕES com as 3 telas
    const seeds = [
      {
        titulo: 'Status Integrações',
        rota: '/integracoes',
        secao: 'INTEGRAÇÕES',
        ordem: 1,
        icone: 'plug',
      },
      {
        titulo: 'Sankhya',
        rota: '/integracoes/sankhya',
        secao: 'INTEGRAÇÕES',
        ordem: 2,
        icone: 'database',
      },
      {
        titulo: 'WhatsApp',
        rota: '/integracoes/whatsapp',
        secao: 'INTEGRAÇÕES',
        ordem: 3,
        icone: 'message',
      },
    ]
    for (const s of seeds) {
      try {
        app.findFirstRecordByFilter('menus', 'rota = "' + s.rota + '"')
      } catch (_) {
        const col = app.findCollectionByNameOrId('menus')
        const r = new Record(col)
        r.set('titulo', s.titulo)
        r.set('rota', s.rota)
        r.set('secao', s.secao)
        r.set('ordem', s.ordem)
        r.set('icone', s.icone)
        r.set('ativo', true)
        app.save(r)
      }
    }

    // coleção de config por integração (1 registro por integração, JSONB)
    const cfg = new Collection({
      name: 'integracoes_config',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'integracao', type: 'text', required: true, max: 40 },
        { name: 'config', type: 'json', maxSize: 20000 },
        { name: 'atualizado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_intcfg_int ON integracoes_config (integracao)'],
    })
    app.save(cfg)
  },
  (app) => {
    for (const rota of ['/integracoes', '/integracoes/sankhya', '/integracoes/whatsapp']) {
      try {
        const r = app.findFirstRecordByFilter('menus', 'rota = "' + rota + '"')
        app.delete(r)
      } catch (_) {}
    }
    try {
      app.delete(app.findCollectionByNameOrId('integracoes_config'))
    } catch (_) {}
  },
)
