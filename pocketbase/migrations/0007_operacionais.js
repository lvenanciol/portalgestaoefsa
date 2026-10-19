// Fase 10 — Coleções operacionais da SPEC: documentos, tarefas, projetos,
// atas, emails (enviados pelo portal) e contratos.
// Leitura e escrita autenticadas; botões de ação controlados por gate (Fase 9).

migrate(
  (app) => {
    // ---------- DOCUMENTOS ----------
    const documentos = new Collection({
      name: 'documentos',
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
          values: ['balancete', 'dre', 'contrato', 'ata', 'relatorio', 'outro'],
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', max: 500 },
        { name: 'arquivo', type: 'file', maxSelect: 1, maxSize: 10485760 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_documentos_categoria ON documentos (categoria)'],
    })
    app.save(documentos)

    // ---------- TAREFAS ----------
    const tarefas = new Collection({
      name: 'tarefas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'titulo', type: 'text', required: true, max: 190 },
        { name: 'descricao', type: 'text', max: 1000 },
        {
          name: 'status',
          type: 'select',
          values: ['pendente', 'em_andamento', 'concluida'],
          maxSelect: 1,
        },
        {
          name: 'prioridade',
          type: 'select',
          values: ['baixa', 'media', 'alta'],
          maxSelect: 1,
        },
        { name: 'responsavel', type: 'text', max: 120 },
        { name: 'prazo', type: 'date' },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_tarefas_status ON tarefas (status)'],
    })
    app.save(tarefas)

    // ---------- PROJETOS ----------
    const projetos = new Collection({
      name: 'projetos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true, max: 190 },
        { name: 'descricao', type: 'text', max: 1000 },
        { name: 'empresa', type: 'text', max: 120 },
        {
          name: 'status',
          type: 'select',
          values: ['planejamento', 'em_andamento', 'pausado', 'concluido'],
          maxSelect: 1,
        },
        { name: 'progresso', type: 'number', onlyInt: false },
        { name: 'responsavel', type: 'text', max: 120 },
        { name: 'prazo', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_projetos_status ON projetos (status)'],
    })
    app.save(projetos)

    // ---------- ATAS ----------
    const atas = new Collection({
      name: 'atas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'titulo', type: 'text', required: true, max: 190 },
        { name: 'data', type: 'date' },
        { name: 'participantes', type: 'text', max: 500 },
        { name: 'resumo', type: 'text', max: 5000 },
        { name: 'decisoes', type: 'text', max: 5000 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_atas_data ON atas (data)'],
    })
    app.save(atas)

    // ---------- EMAILS (enviados pelo portal) ----------
    const emails = new Collection({
      name: 'emails',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'para', type: 'text', required: true, max: 190 },
        { name: 'assunto', type: 'text', required: true, max: 190 },
        { name: 'status', type: 'select', values: ['enviado', 'erro'], maxSelect: 1 },
        { name: 'erro', type: 'text', max: 500 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_emails_created ON emails (created DESC)'],
    })
    app.save(emails)

    // ---------- CONTRATOS ----------
    const contratos = new Collection({
      name: 'contratos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'titulo', type: 'text', required: true, max: 190 },
        { name: 'parte', type: 'text', required: true, max: 190 },
        {
          name: 'tipo',
          type: 'select',
          values: ['locacao', 'servico', 'fornecimento', 'outro'],
          maxSelect: 1,
        },
        { name: 'empresa', type: 'text', max: 120 },
        { name: 'valor_mensal', type: 'number', onlyInt: false },
        { name: 'inicio', type: 'date' },
        { name: 'fim', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'vencendo', 'encerrado'],
          maxSelect: 1,
        },
        { name: 'observacao', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contratos_status ON contratos (status)'],
    })
    app.save(contratos)

    // ---------- SEEDS (idempotentes) ----------
    const seedTarefas = [
      {
        titulo: 'Fechar contabilidade de Outubro',
        status: 'em_andamento',
        prioridade: 'alta',
        responsavel: 'Equipe Financeiro',
        prazo: '2026-11-10 00:00:00.000Z',
        descricao: 'Conciliação e fechamento contábil-financeiro.',
      },
      {
        titulo: 'Revisar metas das unidades Q4',
        status: 'pendente',
        prioridade: 'media',
        responsavel: 'Diretoria',
        prazo: '2026-11-05 00:00:00.000Z',
        descricao: 'Revisar metas de faturamento e margem por unidade.',
      },
      {
        titulo: 'Atualizar cadastro de fornecedores críticos',
        status: 'pendente',
        prioridade: 'baixa',
        responsavel: 'Compras',
        prazo: '2026-11-20 00:00:00.000Z',
        descricao: '',
      },
    ]
    for (const t of seedTarefas) {
      try {
        app.findFirstRecordByFilter('tarefas', 'titulo = "' + t.titulo + '"', '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('tarefas')
        const rec = new Record(col)
        rec.set('titulo', t.titulo)
        rec.set('descricao', t.descricao)
        rec.set('status', t.status)
        rec.set('prioridade', t.prioridade)
        rec.set('responsavel', t.responsavel)
        rec.set('prazo', t.prazo)
        rec.set('criado_por', 'seed')
        app.save(rec)
      }
    }

    const seedProjetos = [
      {
        nome: 'Portal de Gestão Executiva',
        empresa: 'Grupo',
        status: 'em_andamento',
        progresso: 65,
        responsavel: 'Leonardo Lourenço',
        prazo: '2026-12-15 00:00:00.000Z',
        descricao: 'Consolidação da gestão do grupo em um portal único.',
      },
      {
        nome: 'Integração Sankhya — Financeiro',
        empresa: 'Extrafruti',
        status: 'em_andamento',
        progresso: 80,
        responsavel: 'TI',
        prazo: '2026-11-30 00:00:00.000Z',
        descricao: 'DRE/Balancete reais via importação mensal.',
      },
      {
        nome: 'Expansão CD Serra',
        empresa: 'Extrafruti',
        status: 'planejamento',
        progresso: 15,
        responsavel: 'Operações',
        prazo: '2027-03-01 00:00:00.000Z',
        descricao: 'Ampliação da capacidade de armazenagem.',
      },
    ]
    for (const p of seedProjetos) {
      try {
        app.findFirstRecordByFilter('projetos', 'nome = "' + p.nome + '"', '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('projetos')
        const rec = new Record(col)
        rec.set('nome', p.nome)
        rec.set('descricao', p.descricao)
        rec.set('empresa', p.empresa)
        rec.set('status', p.status)
        rec.set('progresso', p.progresso)
        rec.set('responsavel', p.responsavel)
        rec.set('prazo', p.prazo)
        app.save(rec)
      }
    }

    const seedAtas = [
      {
        titulo: 'Reunião de Resultados — Outubro',
        data: '2026-10-15 00:00:00.000Z',
        participantes: 'Leonardo Lourenço, Diretoria, Controladoria',
        resumo:
          'Revisão dos resultados de outubro por empresa; destaque para faturamento SMJ e posição de A/P vencido.',
        decisoes:
          '1) Priorizar renegociação de A/P vencido. 2) Fechar DRE real via importação mensal.',
      },
      {
        titulo: 'Comitê de TI — Roadmap Q4',
        data: '2026-10-08 00:00:00.000Z',
        participantes: 'Leonardo Lourenço, TI',
        resumo: 'Roadmap do portal e integrações (Sankhya, ML, MP).',
        decisoes: '1) Concluir Fase 10 do portal. 2) VPS proxy ML segue pendente.',
      },
    ]
    for (const a of seedAtas) {
      try {
        app.findFirstRecordByFilter('atas', 'titulo = "' + a.titulo + '"', '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('atas')
        const rec = new Record(col)
        rec.set('titulo', a.titulo)
        rec.set('data', a.data)
        rec.set('participantes', a.participantes)
        rec.set('resumo', a.resumo)
        rec.set('decisoes', a.decisoes)
        rec.set('criado_por', 'seed')
        app.save(rec)
      }
    }

    const seedContratos = [
      {
        titulo: 'Locação de embalagens logísticas',
        parte: 'FoldBox × Extrafruti',
        tipo: 'locacao',
        empresa: 'Extrafruti',
        valor_mensal: 18500,
        inicio: '2026-01-01 00:00:00.000Z',
        fim: null,
        status: 'ativo',
        observacao: 'Indeterminado; reajuste anual.',
      },
      {
        titulo: 'Serviço de logística de distribuição',
        parte: 'Transportadora Aliança',
        tipo: 'servico',
        empresa: 'Casafruti',
        valor_mensal: 42000,
        inicio: '2025-06-01 00:00:00.000Z',
        fim: '2026-11-30 00:00:00.000Z',
        status: 'vencendo',
        observacao: 'Renovar ou licitar até 15/11.',
      },
      {
        titulo: 'Fornecimento de insumos frescos',
        parte: 'AgroQuissamã',
        tipo: 'fornecimento',
        empresa: 'Extrafruti',
        valor_mensal: 96000,
        inicio: '2026-03-01 00:00:00.000Z',
        fim: '2027-02-28 00:00:00.000Z',
        status: 'ativo',
        observacao: '',
      },
    ]
    for (const c of seedContratos) {
      try {
        app.findFirstRecordByFilter('contratos', 'titulo = "' + c.titulo + '"', '', 1, 0)
      } catch (_) {
        const col = app.findCollectionByNameOrId('contratos')
        const rec = new Record(col)
        rec.set('titulo', c.titulo)
        rec.set('parte', c.parte)
        rec.set('tipo', c.tipo)
        rec.set('empresa', c.empresa)
        rec.set('valor_mensal', c.valor_mensal)
        rec.set('inicio', c.inicio)
        if (c.fim) rec.set('fim', c.fim)
        rec.set('status', c.status)
        rec.set('observacao', c.observacao)
        app.save(rec)
      }
    }
  },
  (app) => {
    for (const nome of ['contratos', 'emails', 'atas', 'projetos', 'tarefas', 'documentos']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
