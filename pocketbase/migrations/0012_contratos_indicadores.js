// Fase 8 (prompt-mestre) — Contratos: cláusulas críticas (multa, rescisão,
// SLA), aditivos, forma de pagamento, indexador, anexo. Indicadores: catálogo
// Negócio/Pessoas/Operações com metas, semáforo, dono e observações.

migrate(
  (app) => {
    const contratos = app.findCollectionByNameOrId('contratos')
    contratos.fields.add(new TextField({ name: 'objeto', max: 2000 }))
    contratos.fields.add(new TextField({ name: 'indexador', max: 30 }))
    contratos.fields.add(new TextField({ name: 'forma_pagamento', max: 190 }))
    contratos.fields.add(new TextField({ name: 'unidade', max: 120 }))
    contratos.fields.add(new NumberField({ name: 'multa_pct', onlyInt: false }))
    contratos.fields.add(new TextField({ name: 'rescisao', max: 1000 }))
    contratos.fields.add(new TextField({ name: 'sla', max: 1000 }))
    contratos.fields.add(new FileField({ name: 'anexo', maxSelect: 1, maxSize: 10485760 }))
    contratos.fields.add(new JSONField({ name: 'aditivos', maxSize: 50000 }))
    app.save(contratos)

    const indicadores = new Collection({
      name: 'indicadores',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true, max: 190 },
        {
          name: 'categoria',
          type: 'select',
          values: ['Negócio', 'Pessoas', 'Operações'],
          maxSelect: 1,
        },
        { name: 'empresa', type: 'text', max: 120 },
        { name: 'unidade_medida', type: 'text', max: 20 },
        { name: 'meta', type: 'number', onlyInt: false },
        { name: 'realizado', type: 'number', onlyInt: false },
        { name: 'anterior', type: 'number', onlyInt: false },
        { name: 'dono', type: 'text', max: 120 },
        { name: 'observacoes', type: 'text', max: 2000 },
        { name: 'serie_12m', type: 'json', maxSize: 20000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_ind_cat ON indicadores (categoria, empresa)'],
    })
    app.save(indicadores)

    // seeds contratos (enriquece os existentes)
    try {
      const c = app.findFirstRecordByFilter(
        'contratos',
        'titulo = "Serviço de logística de distribuição"',
      )
      c.set(
        'objeto',
        'Distribuição de produtos frescos para redes varejistas da Grande Vitória, com frota dedicada.',
      )
      c.set('indexador', 'IPCA')
      c.set('forma_pagamento', 'Mensal, boleto dia 10')
      c.set('unidade', 'Matriz Casafruti')
      c.set('multa_pct', 10)
      c.set('rescisao', 'Aviso prévio de 60 dias; multa de 10% do saldo remanescente.')
      c.set('sla', 'On-time delivery ≥ 95%; janela de entrega respeitada em 90%.')
      c.set(
        'aditivos',
        JSON.stringify([
          { numero: 1, data: '2026-03-01', descricao: 'Reajuste IPCA 4,5%', valor: 42000 },
        ]),
      )
      app.save(c)
    } catch (_) {}

    // seeds indicadores (3 categorias)
    const colI = app.findCollectionByNameOrId('indicadores')
    const seedsInd = [
      {
        nome: 'Faturamento mensal',
        categoria: 'Negócio',
        empresa: 'Grupo',
        unidade_medida: 'R$ M',
        meta: 19,
        realizado: 20.4,
        anterior: 19.3,
        dono: 'Comercial',
        observacoes: 'Acima da meta puxado por SMJ.',
        serie_12m: JSON.stringify([
          15.2, 16.1, 14.8, 15.9, 17.2, 16.8, 18.1, 17.5, 18.9, 19.3, 20.4, 20.4,
        ]),
      },
      {
        nome: 'Margem bruta',
        categoria: 'Negócio',
        empresa: 'Grupo',
        unidade_medida: '%',
        meta: 23,
        realizado: 22.1,
        anterior: 23.4,
        dono: 'Controladoria',
        observacoes: 'Pressão de custo nos frescos.',
        serie_12m: JSON.stringify([
          23.4, 23.1, 22.8, 23.0, 22.5, 22.9, 23.1, 22.4, 22.8, 22.6, 22.1, 22.1,
        ]),
      },
      {
        nome: 'Turnover mensal',
        categoria: 'Pessoas',
        empresa: 'Grupo',
        unidade_medida: '%',
        meta: 3,
        realizado: 3.8,
        anterior: 3.2,
        dono: 'RH',
        observacoes: 'Alta concentrada nas lojas VV/ES.',
        serie_12m: JSON.stringify([3.1, 2.9, 3.0, 3.3, 3.1, 3.5, 3.2, 3.4, 3.6, 3.3, 3.2, 3.8]),
      },
      {
        nome: 'Absenteísmo',
        categoria: 'Pessoas',
        empresa: 'Grupo',
        unidade_medida: '%',
        meta: 4,
        realizado: 3.6,
        anterior: 4.1,
        dono: 'RH',
        observacoes: '',
        serie_12m: JSON.stringify([4.2, 4.0, 4.1, 3.9, 4.0, 3.8, 3.9, 3.7, 3.8, 3.6, 4.1, 3.6]),
      },
      {
        nome: 'On-time delivery',
        categoria: 'Operações',
        empresa: 'Casafruti',
        unidade_medida: '%',
        meta: 95,
        realizado: 93.5,
        anterior: 96.2,
        dono: 'Logística',
        observacoes: 'Queda por atraso de transportadora terceirizada.',
        serie_12m: JSON.stringify([
          96.5, 96.0, 95.8, 96.2, 95.5, 95.1, 94.8, 95.2, 94.6, 94.1, 96.2, 93.5,
        ]),
      },
      {
        nome: 'Quebra de frescos (perda)',
        categoria: 'Operações',
        empresa: 'Extrafruti',
        unidade_medida: '%',
        meta: 2.5,
        realizado: 2.3,
        anterior: 2.6,
        dono: 'Operações Lojas',
        observacoes: 'Melhora com novo fluxo de recebimento.',
        serie_12m: JSON.stringify([2.7, 2.6, 2.8, 2.6, 2.5, 2.4, 2.6, 2.5, 2.4, 2.3, 2.6, 2.3]),
      },
    ]
    for (const s of seedsInd) {
      try {
        app.findFirstRecordByFilter('indicadores', 'nome = "' + s.nome + '"')
      } catch (_) {
        const r = new Record(colI)
        r.set('nome', s.nome)
        r.set('categoria', s.categoria)
        r.set('empresa', s.empresa)
        r.set('unidade_medida', s.unidade_medida)
        r.set('meta', s.meta)
        r.set('realizado', s.realizado)
        r.set('anterior', s.anterior)
        r.set('dono', s.dono)
        r.set('observacoes', s.observacoes)
        r.set('serie_12m', s.serie_12m)
        app.save(r)
      }
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('contratos')
      for (const f of [
        'objeto',
        'indexador',
        'forma_pagamento',
        'unidade',
        'multa_pct',
        'rescisao',
        'sla',
        'anexo',
        'aditivos',
      ]) {
        try {
          c.fields.removeByName(f)
        } catch (_) {}
      }
      app.save(c)
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('indicadores'))
    } catch (_) {}
  },
)
