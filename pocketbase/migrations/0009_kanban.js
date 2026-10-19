// Fase 7 (prompt-mestre) — Tarefas kanban: subtarefas, comentários, vínculos,
// prioridade P1-P3, status kanban (a_fazer/em_andamento/bloqueado/concluido).
// Migra a coleção tarefas (Fase 10 CRUD) para o modelo do prompt-mestre.

migrate(
  (app) => {
    const tarefas = app.findCollectionByNameOrId('tarefas')
    // novos campos
    tarefas.fields.add(
      new SelectField({
        name: 'status_kanban',
        values: ['a_fazer', 'em_andamento', 'bloqueado', 'concluido'],
        maxSelect: 1,
      }),
    )
    tarefas.fields.add(
      new SelectField({
        name: 'prioridade_p',
        values: ['P1', 'P2', 'P3'],
        maxSelect: 1,
      }),
    )
    tarefas.fields.add(new TextField({ name: 'vinculo_tipo', max: 20 }))
    tarefas.fields.add(new TextField({ name: 'vinculo_id', max: 30 }))
    tarefas.fields.add(new JSONField({ name: 'subtarefas', maxSize: 50000 }))
    tarefas.fields.add(new JSONField({ name: 'comentarios', maxSize: 100000 }))
    app.save(tarefas)

    // backfill: status antigo → kanban; prioridade → P1-P3
    app
      .db()
      .newQuery(
        "UPDATE tarefas SET status_kanban = CASE status WHEN 'concluida' THEN 'concluido' WHEN 'em_andamento' THEN 'em_andamento' ELSE 'a_fazer' END WHERE status_kanban = '' OR status_kanban IS NULL",
      )
      .execute()
    app
      .db()
      .newQuery(
        "UPDATE tarefas SET prioridade_p = CASE prioridade WHEN 'alta' THEN 'P1' WHEN 'media' THEN 'P2' ELSE 'P3' END WHERE prioridade_p = '' OR prioridade_p IS NULL",
      )
      .execute()

    // seeds kanban
    const col = app.findCollectionByNameOrId('tarefas')
    const seeds = [
      {
        titulo: 'Renegociar A/P vencido com fornecedores frescos',
        status_kanban: 'em_andamento',
        prioridade_p: 'P1',
        responsavel: 'Equipe Financeiro',
        prazo: '2026-11-10 00:00:00.000Z',
        subtarefas: JSON.stringify([
          { t: 'Listar top 10 vencidos', ok: true },
          { t: 'Ligar para SICOOB', ok: false },
        ]),
        comentarios: JSON.stringify([
          {
            autor: 'leo@extrafruti.com.br',
            texto: 'Priorizar fornecedores críticos.',
            when: '2026-10-18',
          },
        ]),
      },
      {
        titulo: 'Fechar DRE Outubro via importação',
        status_kanban: 'a_fazer',
        prioridade_p: 'P1',
        responsavel: 'Controladoria',
        prazo: '2026-11-08 00:00:00.000Z',
        subtarefas: JSON.stringify([{ t: 'Exportar balancete Sankhya', ok: false }]),
        comentarios: JSON.stringify([]),
      },
      {
        titulo: 'Renovar contrato logística Aliança',
        status_kanban: 'bloqueado',
        prioridade_p: 'P2',
        responsavel: 'Compras',
        prazo: '2026-11-15 00:00:00.000Z',
        subtarefas: JSON.stringify([{ t: 'Cotação alternativa', ok: false }]),
        comentarios: JSON.stringify([
          {
            autor: 'leo@extrafruti.com.br',
            texto: 'Aguardando proposta da transportadora.',
            when: '2026-10-17',
          },
        ]),
      },
      {
        titulo: 'Revisar metas Q4 unidades',
        status_kanban: 'concluido',
        prioridade_p: 'P3',
        responsavel: 'Diretoria',
        prazo: '2026-10-30 00:00:00.000Z',
        subtarefas: JSON.stringify([]),
        comentarios: JSON.stringify([]),
      },
    ]
    for (const s of seeds) {
      try {
        app.findFirstRecordByFilter('tarefas', 'titulo = "' + s.titulo + '"', '', 1, 0)
      } catch (_) {
        const r = new Record(col)
        r.set('titulo', s.titulo)
        r.set(
          'status',
          s.status_kanban === 'concluido'
            ? 'concluida'
            : s.status_kanban === 'em_andamento'
              ? 'em_andamento'
              : 'pendente',
        )
        r.set('status_kanban', s.status_kanban)
        r.set(
          'prioridade',
          s.prioridade_p === 'P1' ? 'alta' : s.prioridade_p === 'P2' ? 'media' : 'baixa',
        )
        r.set('prioridade_p', s.prioridade_p)
        r.set('responsavel', s.responsavel)
        r.set('prazo', s.prazo)
        r.set('subtarefas', s.subtarefas)
        r.set('comentarios', s.comentarios)
        r.set('criado_por', 'seed')
        app.save(r)
      }
    }
  },
  (app) => {
    try {
      const t = app.findCollectionByNameOrId('tarefas')
      for (const f of [
        'status_kanban',
        'prioridade_p',
        'vinculo_tipo',
        'vinculo_id',
        'subtarefas',
        'comentarios',
      ]) {
        try {
          t.fields.removeByName(f)
        } catch (_) {}
      }
      app.save(t)
    } catch (_) {}
  },
)
