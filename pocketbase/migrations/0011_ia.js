// Fase 9 (prompt-mestre) — coleção ia_pareceres (histórico de pareceres IA)
// + biblioteca de 8 prompts editáveis (ia_prompts).

migrate(
  (app) => {
    const pareceres = new Collection({
      name: 'ia_pareceres',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'modulo', type: 'text', max: 60 },
        { name: 'ref', type: 'text', max: 60 },
        { name: 'prompt', type: 'text', max: 8000 },
        { name: 'contexto', type: 'text', max: 12000 },
        { name: 'resultado', type: 'json', maxSize: 100000 },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'revisado', 'aprovado'],
          maxSelect: 1,
        },
        { name: 'observacao', type: 'text', max: 2000 },
        { name: 'criado_por', type: 'text', max: 190 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_iap_mod ON ia_pareceres (modulo, created DESC)'],
    })
    app.save(pareceres)

    const prompts = new Collection({
      name: 'ia_prompts',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'chave', type: 'text', required: true, max: 60 },
        { name: 'titulo', type: 'text', required: true, max: 190 },
        { name: 'instrucoes', type: 'text', required: true, max: 4000 },
        { name: 'ordem', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_iaprom_chave ON ia_prompts (chave)'],
    })
    app.save(prompts)

    // ---------- Biblioteca dos 8 prompts ----------
    const seedPrompts = [
      {
        chave: 'parecer_financeiro_mensal',
        titulo: 'Parecer financeiro mensal',
        ordem: 1,
        instrucoes:
          'Gere o parecer financeiro do mês: desempenho de receita e despesa, posição de caixa, A/P e A/R, comparativo com o mês anterior e 3 recomendações priorizadas.',
      },
      {
        chave: 'analise_balancete',
        titulo: 'Análise de balancete',
        ordem: 2,
        instrucoes:
          'Analise o balancete importado: quadratura, evolução das contas patrimoniais, pontos de atenção (contas com variação atípica) e conferência de saldos.',
      },
      {
        chave: 'analise_dre_desvios',
        titulo: 'Análise de DRE e desvios',
        ordem: 3,
        instrucoes:
          'Analise a DRE: margens por linha, desvios relevantes vs período anterior, CMV e despesas operacionais, e aponte causas prováveis.',
      },
      {
        chave: 'fluxo_caixa',
        titulo: 'Fluxo de caixa',
        ordem: 4,
        instrucoes:
          'Analise o fluxo de caixa: entradas vs saídas por mês, tendência do saldo acumulado, meses de pressão e recomendações de tesouraria.',
      },
      {
        chave: 'risco_contrato',
        titulo: 'Risco de contrato',
        ordem: 5,
        instrucoes:
          'Analise o contrato: cláusulas críticas (multa, rescisão, SLA), vigência e reajuste, exposição financeira e riscos com mitigação sugerida.',
      },
      {
        chave: 'resumo_ata',
        titulo: 'Resumo de ata',
        ordem: 6,
        instrucoes:
          'Resuma a ata em 5 linhas executivas: decisões, responsáveis, prazos e pendências críticas.',
      },
      {
        chave: 'diagnostico_kpis',
        titulo: 'Diagnóstico de KPIs',
        ordem: 7,
        instrucoes:
          'Diagnostique os indicadores: realizado vs meta vs anterior, semáforo, causas prováveis dos desvios e ações corretivas.',
      },
      {
        chave: 'analise_imagem',
        titulo: 'Análise de imagem/tela (multimodal)',
        ordem: 8,
        instrucoes:
          'Descreva e analise a imagem/tela enviada (screenshot de dashboard ou relatório): leitura dos números visíveis, inconsistências e leitura executiva.',
      },
    ]
    for (const p of seedPrompts) {
      try {
        app.findFirstRecordByFilter('ia_prompts', 'chave = "' + p.chave + '"')
      } catch (_) {
        const col = app.findCollectionByNameOrId('ia_prompts')
        const rec = new Record(col)
        rec.set('chave', p.chave)
        rec.set('titulo', p.titulo)
        rec.set('instrucoes', p.instrucoes)
        rec.set('ordem', p.ordem)
        app.save(rec)
      }
    }
  },
  (app) => {
    for (const nome of ['ia_prompts', 'ia_pareceres']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
