// Fase 6 (prompt-mestre) — Documentos & Importações.
// arquivos_importados: metadados do arquivo (Skip Cloud storage) + status.
// importacoes: cabeçalho da importação (tipo, empresa, período, quadratura).
// financeiro_linhas: linhas gravadas no Financeiro, vinculadas ao arquivo.
// Tipos: balancete | fluxo_caixa | planilha_gerencial | contrato | ata | outro

migrate(
  (app) => {
    const arquivos = new Collection({
      name: 'arquivos_importados',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true, max: 190 },
        { name: 'arquivo', type: 'file', maxSelect: 1, maxSize: 26214400 },
        { name: 'tipo', type: 'text', max: 40 },
        { name: 'tamanho', type: 'number', onlyInt: true },
        {
          name: 'status',
          type: 'select',
          values: ['recebido', 'processado', 'erro'],
          maxSelect: 1,
        },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_arq_tipo ON arquivos_importados (tipo)'],
    })
    app.save(arquivos)

    const importacoes = new Collection({
      name: 'importacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'arquivo_id', type: 'relation', collectionId: arquivos.id, maxSelect: 1 },
        { name: 'tipo', type: 'text', required: true, max: 40 },
        { name: 'empresa', type: 'text', max: 120 },
        { name: 'periodo', type: 'text', max: 7 },
        { name: 'total_linhas', type: 'number', onlyInt: true },
        { name: 'total_debito', type: 'number', onlyInt: false },
        { name: 'total_credito', type: 'number', onlyInt: false },
        { name: 'quadrado', type: 'bool' },
        { name: 'mapeamento', type: 'json', maxSize: 20000 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_imp_periodo ON importacoes (tipo, periodo, empresa)'],
    })
    app.save(importacoes)

    const linhas = new Collection({
      name: 'financeiro_linhas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'importacao_id',
          type: 'relation',
          collectionId: importacoes.id,
          required: true,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'conta', type: 'text', max: 40 },
        { name: 'descricao', type: 'text', max: 190 },
        { name: 'debito', type: 'number', onlyInt: false },
        { name: 'credito', type: 'number', onlyInt: false },
        { name: 'data', type: 'text', max: 10 },
        { name: 'centro_custo', type: 'text', max: 60 },
        { name: 'ordem', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_finlin_imp ON financeiro_linhas (importacao_id, ordem)'],
    })
    app.save(linhas)

    // ---------- SEED: balancete + fluxo de caixa de teste ----------
    const colArq = app.findCollectionByNameOrId('arquivos_importados')
    const colImp = app.findCollectionByNameOrId('importacoes')
    const colLin = app.findCollectionByNameOrId('financeiro_linhas')

    // Balancete de teste — Out/2026, Extrafruti, quadrado
    let impBal
    try {
      impBal = app.findFirstRecordByFilter(
        'importacoes',
        'tipo = "balancete" && periodo = "2026-10"',
      )
    } catch (_) {
      const a = new Record(colArq)
      a.set('nome', 'balancete-teste-out26.xlsx')
      a.set('tipo', 'balancete')
      a.set('tamanho', 8421)
      a.set('status', 'processado')
      a.set('criado_por', 'seed')
      app.save(a)
      impBal = new Record(colImp)
      impBal.set('arquivo_id', a.id)
      impBal.set('tipo', 'balancete')
      impBal.set('empresa', 'Extrafruti')
      impBal.set('periodo', '2026-10')
      impBal.set('total_linhas', 6)
      impBal.set('total_debito', 475000)
      impBal.set('total_credito', 475000)
      impBal.set('quadrado', true)
      impBal.set('criado_por', 'seed')
      app.save(impBal)
      const seedBal = [
        {
          conta: '1.1.1',
          descricao: 'Caixa geral',
          debito: 125000,
          credito: 0,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 1,
        },
        {
          conta: '1.1.2',
          descricao: 'Bancos conta movimento',
          debito: 340000,
          credito: 0,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 2,
        },
        {
          conta: '2.1.1',
          descricao: 'Fornecedores nacionais',
          debito: 0,
          credito: 280000,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 3,
        },
        {
          conta: '2.1.2',
          descricao: 'Empréstimos bancários',
          debito: 0,
          credito: 95000,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 4,
        },
        {
          conta: '3.1.1',
          descricao: 'Capital social',
          debito: 0,
          credito: 100000,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 5,
        },
        {
          conta: '3.2.1',
          descricao: 'Lucros acumulados',
          debito: 10000,
          credito: 0,
          data: '2026-10-31',
          centro_custo: 'ADM',
          ordem: 6,
        },
      ]
      seedBal.forEach((l) => {
        const r = new Record(colLin)
        r.set('importacao_id', impBal.id)
        r.set('conta', l.conta)
        r.set('descricao', l.descricao)
        r.set('debito', l.debito)
        r.set('credito', l.credito)
        r.set('data', l.data)
        r.set('centro_custo', l.centro_custo)
        r.set('ordem', l.ordem)
        app.save(r)
      })
    }

    // Fluxo de caixa de teste — Out/2026, Casafruti
    try {
      app.findFirstRecordByFilter('importacoes', 'tipo = "fluxo_caixa" && periodo = "2026-10"')
    } catch (_) {
      const a = new Record(colArq)
      a.set('nome', 'fluxo-caixa-teste-out26.xlsx')
      a.set('tipo', 'fluxo_caixa')
      a.set('tamanho', 6120)
      a.set('status', 'processado')
      a.set('criado_por', 'seed')
      app.save(a)
      const imp = new Record(colImp)
      imp.set('arquivo_id', a.id)
      imp.set('tipo', 'fluxo_caixa')
      imp.set('empresa', 'Casafruti')
      imp.set('periodo', '2026-10')
      imp.set('total_linhas', 5)
      imp.set('total_debito', 318000)
      imp.set('total_credito', 402000)
      imp.set('quadrado', false)
      imp.set('criado_por', 'seed')
      app.save(imp)
      const seedFluxo = [
        {
          conta: '1.1.2.001',
          descricao: 'Recebimentos vendas varejo',
          debito: 285000,
          credito: 0,
          data: '2026-10-05',
          centro_custo: 'COM',
          ordem: 1,
        },
        {
          conta: '1.1.2.002',
          descricao: 'Recebimentos atacado',
          debito: 117000,
          credito: 0,
          data: '2026-10-12',
          centro_custo: 'COM',
          ordem: 2,
        },
        {
          conta: '2.1.1.001',
          descricao: 'Pagamento fornecedores frescos',
          debito: 0,
          credito: 198000,
          data: '2026-10-08',
          centro_custo: 'LOG',
          ordem: 3,
        },
        {
          conta: '2.1.1.002',
          descricao: 'Folha de pagamento',
          debito: 0,
          credito: 84000,
          data: '2026-10-05',
          centro_custo: 'RH',
          ordem: 4,
        },
        {
          conta: '2.1.1.003',
          descricao: 'Energia e utilities CD',
          debito: 0,
          credito: 36000,
          data: '2026-10-20',
          centro_custo: 'LOG',
          ordem: 5,
        },
      ]
      seedFluxo.forEach((l) => {
        const r = new Record(colLin)
        r.set('importacao_id', imp.id)
        r.set('conta', l.conta)
        r.set('descricao', l.descricao)
        r.set('debito', l.debito)
        r.set('credito', l.credito)
        r.set('data', l.data)
        r.set('centro_custo', l.centro_custo)
        r.set('ordem', l.ordem)
        app.save(r)
      })
    }
  },
  (app) => {
    for (const nome of ['financeiro_linhas', 'importacoes', 'arquivos_importados']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
