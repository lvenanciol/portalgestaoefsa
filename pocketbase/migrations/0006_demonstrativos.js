// Fase 8 — Migração 0006: coleções de demonstrativos contábeis (importados
// das extrações do ERP Sankhya — Balancete de Verificação e DRE).
// balancete_linhas: 1 registro por conta (linha do balancete importado).
// dre_linhas: 1 registro por linha da DRE (grupo/subtotal/linha).
// Import substitutivo: cada importação apaga as linhas do mesmo tipo+mês.

migrate(
  (app) => {
    // ---------- BALANCETE ----------
    const bal = new Collection({
      name: 'balancete_linhas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'periodo', type: 'text', required: true, max: 7 }, // YYYY-MM
        { name: 'empresa', type: 'text', max: 120 }, // razão social do cabeçalho
        { name: 'conta', type: 'text', max: 40 }, // código da conta (hífen ou reduzida)
        { name: 'nome', type: 'text', required: true, max: 190 },
        { name: 'grau', type: 'number', onlyInt: true }, // 1=sintética raiz
        { name: 'saldo_anterior', type: 'number', onlyInt: false },
        { name: 'debitos', type: 'number', onlyInt: false },
        { name: 'creditos', type: 'number', onlyInt: false },
        { name: 'saldo_atual', type: 'number', onlyInt: false },
        { name: 'fonte', type: 'text', max: 40 }, // [rodapé do PDF | soma das linhas]
        { name: 'importado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_bal_periodo ON balancete_linhas (periodo)',
        'CREATE INDEX idx_bal_periodo_conta ON balancete_linhas (periodo, conta)',
      ],
    })
    app.save(bal)

    // ---------- DRE ----------
    const dre = new Collection({
      name: 'dre_linhas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'periodo', type: 'text', required: true, max: 7 }, // YYYY-MM
        { name: 'empresa', type: 'text', max: 120 },
        { name: 'ordem', type: 'number', onlyInt: true },
        { name: 'conta', type: 'text', max: 40 },
        { name: 'nome', type: 'text', required: true, max: 190 },
        { name: 'nivel', type: 'select', values: ['grupo', 'subtotal', 'linha'], maxSelect: 1 },
        { name: 'valor', type: 'number', onlyInt: false },
        { name: 'importado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dre_periodo ON dre_linhas (periodo)',
        'CREATE INDEX idx_dre_periodo_ordem ON dre_linhas (periodo, ordem)',
      ],
    })
    app.save(dre)
  },
  (app) => {
    for (const name of ['dre_linhas', 'balancete_linhas']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
