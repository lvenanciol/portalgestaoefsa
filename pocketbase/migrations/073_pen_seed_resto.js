/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FASE 3.1 (parte 2) — INICIATIVAS, CAUSAS E RAID (18/11/2026)
//
// Continua a 072. Semeia os registros que faltam para as telas do /pen terem
// dado real: 8 iniciativas, 7 causas (dos 3 desvios) e 6 itens de RAID.
// Idempotente por chave lógica (titulo/descricao).
// ============================================================================
migrate(
  (app) => {
    const WS = 'ws-pge-001'
    const CICLO = 'ciclo-2026'

    function existe(col, campo, valor) {
      try {
        const r = app.findRecordsByFilter(
          col,
          campo + ' = "' + String(valor).replace(/"/g, '') + '"',
          '',
          1,
          0,
        )
        return r && r.length
      } catch (_) {
        return false
      }
    }

    function criar(nomeCol, dados, campoChave) {
      if (existe(nomeCol, campoChave, dados[campoChave])) return 'existe'
      const col = app.findCollectionByNameOrId(nomeCol)
      const rec = new Record(col)
      for (const k in dados) rec.set(k, dados[k])
      app.save(rec)
      return 'criado'
    }

    // ------------------------------------------------------------------
    // pen_initiative — 8
    // ------------------------------------------------------------------
    const inis = [
      [
        'Recuperar 400 clientes inativos no atacado',
        'extrafruti',
        'Comercial Atacado',
        '2026-09-30',
        62,
        'em_andamento',
        8,
      ],
      [
        'Programa de redução de quebra por loja',
        'extrafruti',
        'Operações',
        '2026-12-31',
        48,
        'em_andamento',
        12,
      ],
      [
        'Trilha de líder de turno',
        'extrafruti',
        'Gestão de Pessoas',
        '2026-10-31',
        35,
        'atrasado',
        15,
      ],
      [
        'Reforma de 6 lojas âncora',
        'casafruti',
        'Diretoria Casafruti',
        '2026-11-30',
        50,
        'em_andamento',
        6,
      ],
      [
        'NPS: jornada de atendimento na loja',
        'casafruti',
        'Comercial Casafruti',
        '2026-12-31',
        70,
        'em_andamento',
        8,
      ],
      [
        'Contratos de retornáveis com 3 operadores logísticos',
        'foldbox',
        'Diretoria FoldBox',
        '2026-10-31',
        33,
        'em_andamento',
        10,
      ],
      [
        'Automação da apuração fiscal',
        'extrafruti',
        'Tecnologia e Controladoria',
        '2026-11-30',
        52,
        'em_andamento',
        5,
      ],
      [
        'Régua de despesas operacionais',
        'extrafruti',
        'Controladoria',
        '2026-08-31',
        100,
        'concluido',
        18,
      ],
    ]
    for (const i of inis) {
      const st = criar(
        'pen_initiative',
        {
          workspace_id: WS,
          company_id: i[1],
          cycle_id: CICLO,
          titulo: i[0],
          owner_id: i[2],
          prazo: i[3],
          progresso: i[4],
          status: i[5],
          weight: i[6],
          baseline: 0,
          target: 100,
          polarity: 'up',
          descricao: 'Iniciativa do Ciclo 2026',
        },
        'titulo',
      )
      console.log('[pen3b] iniciativa "' + i[0].slice(0, 34) + '": ' + st)
    }

    // ------------------------------------------------------------------
    // pen_cause — 7, ligadas aos 3 desvios
    // ------------------------------------------------------------------
    const causas = [
      [
        'Jornada de 6x1 sem escala previsível no CD e nas lojas',
        'extrafruti',
        'metodo',
        true,
        'Gestão de Pessoas',
        'des-01',
      ],
      [
        'Líder de turno sem formação para conduzir equipe',
        'extrafruti',
        'mao_de_obra',
        true,
        'Gestão de Pessoas',
        'des-01',
      ],
      [
        'Salário de entrada abaixo do mercado na função de repositor',
        'extrafruti',
        'medida',
        false,
        'Gestão de Pessoas',
        'des-01',
      ],
      [
        'Câmara dos pasteurizados sem controle de temperatura automatizado',
        'extrafruti',
        'maquina',
        true,
        'Operações',
        'des-02',
      ],
      [
        'Inventário parcial em ondas — EI e EF de produtos diferentes',
        'extrafruti',
        'medida',
        true,
        'Controladoria',
        'des-02',
      ],
      [
        'Ciclo de venda consultivo longo sem funil de prospecção ativo',
        'foldbox',
        'metodo',
        true,
        'Diretoria FoldBox',
        'des-03',
      ],
      [
        'Portfólio sem versão digital publicada',
        'foldbox',
        'meio',
        false,
        'Diretoria FoldBox',
        'des-03',
      ],
    ]
    for (const c of causas) {
      const st = criar(
        'pen_cause',
        {
          workspace_id: WS,
          company_id: c[1],
          cycle_id: CICLO,
          descricao: c[0],
          categoria: c[2],
          causa_raiz: c[3],
          owner_id: c[4],
          desvio_id: c[5],
          status: c[3] ? 'validada' : 'a_validar',
        },
        'descricao',
      )
      console.log('[pen3b] causa "' + c[0].slice(0, 32) + '": ' + st)
    }

    // ------------------------------------------------------------------
    // pen_risk — 6 (RAID)
    // ------------------------------------------------------------------
    const raides = [
      [
        'Turnover acima de 6% inviabiliza a meta de 3%',
        'extrafruti',
        'risco',
        'alto',
        'alto',
        'Trilha de líder de turno e revisão de escala no CD.',
        'Gestão de Pessoas',
      ],
      [
        'Quebra fora de controle compromete o EBITDA de 9,1%',
        'extrafruti',
        'risco',
        'alto',
        'critico',
        'Inventário confiável e controle de temperatura.',
        'Operações',
      ],
      [
        'Reforma das 6 lojas pode ultrapassar o orçamento de capital',
        'casafruti',
        'risco',
        'medio',
        'alto',
        'Faseamento por loja com aprovação por etapa.',
        'Diretoria Casafruti',
      ],
      [
        'Premissa: conversão de 1 em 3 operadores logísticos',
        'foldbox',
        'premissa',
        'medio',
        'alto',
        'Piloto de 60 dias com métrica de retorno.',
        'Diretoria FoldBox',
      ],
      [
        'Dependência: integração Sankhya para apuração fiscal',
        'extrafruti',
        'dependencia',
        'alto',
        'medio',
        'Homologação e plano B manual documentado.',
        'Tecnologia e Controladoria',
      ],
      [
        'Issue: NPS sem coleta consistente há 2 meses',
        'casafruti',
        'issue',
        'alto',
        'medio',
        'Reativar coleta no PDV com meta mínima.',
        'Comercial Casafruti',
      ],
    ]
    for (const r of raides) {
      const st = criar(
        'pen_risk',
        {
          workspace_id: WS,
          company_id: r[1],
          cycle_id: CICLO,
          titulo: r[0],
          tipo: r[2],
          probabilidade: r[3],
          impacto: r[4],
          mitigacao: r[5],
          owner_id: r[6],
          status: 'aberto',
          descricao: 'Item RAID do Ciclo 2026',
        },
        'titulo',
      )
      console.log('[pen3b] RAID "' + r[0].slice(0, 32) + '": ' + st)
    }

    // conferência final
    for (const c of [
      'pen_company',
      'pen_cycle',
      'pen_objective',
      'pen_kpi',
      'pen_initiative',
      'pen_cause',
      'pen_risk',
    ]) {
      try {
        const n = app.findRecordsByFilter(c, "id != ''", '', 500, 0)
        console.log('[pen3b] ' + c + ' = ' + n.length + ' registro(s)')
      } catch (_) {}
    }
    console.log('[pen3b] CONCLUÍDO')
  },
  (app) => {
    console.log('[pen3b] rollback: registros mantidos')
  },
)
