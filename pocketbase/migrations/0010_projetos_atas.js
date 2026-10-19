// Fase 7 (prompt-mestre) — Projetos: marcos, riscos, RACI.
// Atas: modalidade, pauta, discussões, action items.

migrate(
  (app) => {
    const projetos = app.findCollectionByNameOrId('projetos')
    projetos.fields.add(new NumberField({ name: 'orcamento', onlyInt: false }))
    projetos.fields.add(new NumberField({ name: 'realizado', onlyInt: false }))
    projetos.fields.add(new JSONField({ name: 'marcos', maxSize: 50000 }))
    projetos.fields.add(new JSONField({ name: 'riscos', maxSize: 50000 }))
    projetos.fields.add(new JSONField({ name: 'raci', maxSize: 20000 }))
    app.save(projetos)

    const atas = app.findCollectionByNameOrId('atas')
    atas.fields.add(
      new SelectField({
        name: 'modalidade',
        values: ['Presencial', 'Microsoft Teams', 'Google Meet'],
        maxSelect: 1,
      }),
    )
    atas.fields.add(new TextField({ name: 'link_reuniao', max: 500 }))
    atas.fields.add(new TextField({ name: 'pauta', max: 5000 }))
    atas.fields.add(new JSONField({ name: 'action_items', maxSize: 50000 }))
    app.save(atas)

    // seeds
    try {
      app.findFirstRecordByFilter('projetos', 'nome = "Portal de Gestão Executiva"')
      // já existe da Fase 10 — apenas enriquece
    } catch (_) {}
    const p = app.findFirstRecordByFilter('projetos', 'nome = "Portal de Gestão Executiva"')
    p.set('orcamento', 180000)
    p.set('realizado', 117000)
    p.set(
      'marcos',
      JSON.stringify([
        { nome: 'Fases 1-5 (SPEC + proxy + IA)', data: '2026-10-18', ok: true },
        { nome: 'Fases 6-10 (prompt-mestre)', data: '2026-11-30', ok: false },
        { nome: 'Go-live completo', data: '2026-12-15', ok: false },
      ]),
    )
    p.set(
      'riscos',
      JSON.stringify([
        {
          risco: 'Allowlist IP Sankhya bloqueia novos egress',
          prob: 'baixa',
          impacto: 'alto',
          mitigacao: 'Edge proxy no Foldbox já resolve',
        },
        {
          risco: 'Dependência de importação manual do balancete',
          prob: 'alta',
          impacto: 'medio',
          mitigacao: 'Rotina mensal documentada',
        },
      ]),
    )
    p.set(
      'raci',
      JSON.stringify({
        R: 'Leonardo Lourenço',
        A: 'Diretoria',
        C: 'Controladoria',
        I: 'Gestores de unidade',
      }),
    )
    app.save(p)

    const colA = app.findCollectionByNameOrId('atas')
    try {
      const a = app.findFirstRecordByFilter('atas', 'titulo = "Reunião de Resultados — Outubro"')
      a.set('modalidade', 'Microsoft Teams')
      a.set('link_reuniao', 'https://teams.microsoft.com/l/meetup-join/exemplo')
      a.set('pauta', '1. Resultados Out/26 por empresa; 2. A/P vencido; 3. Roadmap portal')
      a.set(
        'action_items',
        JSON.stringify([
          { acao: 'Renegociar top 10 A/P vencido', dono: 'Equipe Financeiro', prazo: '2026-11-10' },
          { acao: 'Importar balancete Outubro', dono: 'Controladoria', prazo: '2026-11-08' },
        ]),
      )
      app.save(a)
    } catch (_) {}
  },
  (app) => {
    try {
      const p = app.findCollectionByNameOrId('projetos')
      for (const f of ['orcamento', 'realizado', 'marcos', 'riscos', 'raci']) {
        try {
          p.fields.removeByName(f)
        } catch (_) {}
      }
      app.save(p)
    } catch (_) {}
    try {
      const a = app.findCollectionByNameOrId('atas')
      for (const f of ['modalidade', 'link_reuniao', 'pauta', 'action_items']) {
        try {
          a.fields.removeByName(f)
        } catch (_) {}
      }
      app.save(a)
    } catch (_) {}
  },
)
