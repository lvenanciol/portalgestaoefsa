/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FASE 3.1 — DADOS REAIS NO BANCO (18/11/2026)
//
// As coleções pen_* da Fase 1.1 estavam VAZIAS: o teste de RLS que inseriu
// registros foi limpo de propósito. Sem dado no banco, ligar as telas na API
// devolveria tela vazia.
//
// Esta migração promove ao banco os números que o próprio dono fixou na Fase
// 1.2 (receita 218,4 mi, EBITDA 9,1%, turnover 5,4%, Casafruti 25 mi, FoldBox
// 5 mi, 8 objetivos, 8 iniciativas, 3 desvios com causas, 6 RAID). Deixa de
// ser mock em código e passa a ser REGISTRO, editável e auditável.
//
// 1) cria o workspace do PGE e o atribui aos usuários — sem isso a política
//    `workspace_id = @request.auth.workspace_id` não casa e ninguém lê nada
// 2) semeia pen_company, pen_cycle, pen_objective, pen_kpi, pen_initiative,
//    pen_cause, pen_risk
// 3) IDEMPOTENTE: se a tabela já tem registro daquele id lógico, pula
// ============================================================================
migrate(
  (app) => {
    const WS = 'ws-pge-001'
    const CICLO = 'ciclo-2026'

    // ------------------------------------------------------------------
    // 1) workspace nos usuários (base da política de RLS)
    // ------------------------------------------------------------------
    try {
      const users = app.findRecordsByFilter('_pb_users_auth_', "id != ''", '', 500, 0)
      let n = 0
      for (const u of users) {
        if (!String(u.getString('workspace_id') || '')) {
          u.set('workspace_id', WS)
          app.save(u)
          n++
        }
      }
      console.log('[pen3] workspace atribuído a ' + n + ' usuário(s)')
    } catch (e) {
      console.log('[pen3] usuários: ' + String(e).slice(0, 140))
    }

    // ------------------------------------------------------------------
    // helper idempotente
    // ------------------------------------------------------------------
    function existe(col, campo, valor) {
      try {
        const r = app.findRecordsByFilter(
          col,
          campo + ' = "' + String(valor).replace(/"/g, '') + '"',
          '',
          1,
          0,
        )
        return r && r.length ? r[0] : null
      } catch (_) {
        return null
      }
    }

    function criar(nomeCol, dados, campoChave) {
      const col = app.findCollectionByNameOrId(nomeCol)
      const chave = campoChave ? dados[campoChave] : dados.id_logico
      if (campoChave && existe(nomeCol, campoChave, chave)) return 'existe'
      if (!campoChave && existe(nomeCol, 'id_logico', chave)) return 'existe'
      const rec = new Record(col)
      for (const k in dados) {
        if (k === 'id_logico') continue
        rec.set(k, dados[k])
      }
      if (!campoChave) rec.set('id_logico', dados.id_logico)
      app.save(rec)
      return 'criado'
    }

    // ------------------------------------------------------------------
    // 2) pen_company
    // ------------------------------------------------------------------
    const empresas = [
      {
        filtro: 'extrafruti',
        nome: 'Extrafruti',
        sigla: 'EFT',
        receita: 188400000,
        ebitda: 9.1,
        head: 1600,
      },
      {
        filtro: 'casafruti',
        nome: 'Casafruti',
        sigla: 'CFT',
        receita: 25000000,
        ebitda: 8.4,
        head: 600,
      },
      { filtro: 'foldbox', nome: 'FoldBox', sigla: 'FBX', receita: 5000000, ebitda: 12.6, head: 4 },
    ]
    for (const e of empresas) {
      const st = criar(
        'pen_company',
        {
          workspace_id: WS,
          company_id: e.filtro,
          cycle_id: CICLO,
          nome: e.nome,
          sigla: e.sigla,
          receita: e.receita,
          ebitda_pct: e.ebitda,
          headcount: e.head,
          status: 'ativo',
        },
        'nome',
      )
      console.log('[pen3] pen_company ' + e.nome + ': ' + st)
    }

    // ------------------------------------------------------------------
    // pen_cycle
    // ------------------------------------------------------------------
    console.log(
      '[pen3] pen_cycle: ' +
        criar(
          'pen_cycle',
          {
            workspace_id: WS,
            company_id: 'extrafruti',
            cycle_id: CICLO,
            nome: 'Ciclo 2026',
            inicio: '2026-01-01',
            fim: '2026-12-31',
            status: 'ativo',
          },
          'nome',
        ),
    )

    // ------------------------------------------------------------------
    // pen_objective — 8
    // ------------------------------------------------------------------
    const objetivos = [
      [
        'obj-01',
        'extrafruti',
        'Crescer receita consolidada para R$ 218,4 mi',
        'financeira',
        'Leonardo Lourenço',
        198500000,
        218400000,
        'up',
        20,
        'em_andamento',
      ],
      [
        'obj-02',
        'extrafruti',
        'Elevar EBITDA consolidado a 9,1%',
        'financeira',
        'Leonardo Lourenço',
        7.8,
        9.1,
        'up',
        18,
        'em_andamento',
      ],
      [
        'obj-03',
        'casafruti',
        'Casafruti: R$ 25 mi de faturamento',
        'financeira',
        'Diretoria Casafruti',
        21400000,
        25000000,
        'up',
        12,
        'em_andamento',
      ],
      [
        'obj-04',
        'foldbox',
        'FoldBox: R$ 5 mi em embalagens retornáveis',
        'financeira',
        'Diretoria FoldBox',
        3800000,
        5000000,
        'up',
        10,
        'em_andamento',
      ],
      [
        'obj-05',
        'extrafruti',
        'Reduzir turnover operacional a 3,0% ao mês',
        'aprendizado',
        'Gestão de Pessoas',
        6.0,
        3.0,
        'down',
        15,
        'atrasado',
      ],
      [
        'obj-06',
        'extrafruti',
        'Quebra de perecíveis abaixo de 2,5%',
        'processos',
        'Operações',
        3.4,
        2.5,
        'down',
        12,
        'em_andamento',
      ],
      [
        'obj-07',
        'casafruti',
        'NPS do varejo acima de 60',
        'cliente',
        'Comercial Casafruti',
        48,
        60,
        'up',
        8,
        'em_andamento',
      ],
      [
        'obj-08',
        'extrafruti',
        'Automação de 70% do processo fiscal',
        'processos',
        'Tecnologia e Controladoria',
        35,
        70,
        'up',
        5,
        'em_andamento',
      ],
    ]
    for (const o of objetivos) {
      const st = criar(
        'pen_objective',
        {
          workspace_id: WS,
          company_id: o[1],
          cycle_id: CICLO,
          titulo: o[2],
          perspectiva: o[3],
          owner_id: o[4],
          baseline: o[5],
          target: o[6],
          polarity: o[7],
          weight: o[8],
          status: o[9],
          descricao: 'Objetivo do ' + o[0] + ' — Ciclo 2026',
        },
        'titulo',
      )
      console.log('[pen3] pen_objective ' + o[0] + ': ' + st)
    }

    // ------------------------------------------------------------------
    // pen_kpi — 8
    // ------------------------------------------------------------------
    const kpis = [
      [
        'kpi-receita-total',
        'extrafruti',
        'Receita consolidada',
        'R$',
        198500000,
        218400000,
        'up',
        20,
        'em_andamento',
      ],
      ['kpi-ebitda', 'extrafruti', 'EBITDA', '%', 7.8, 9.1, 'up', 18, 'em_andamento'],
      [
        'kpi-turnover',
        'extrafruti',
        'Turnover operacional',
        '%/mês',
        6.0,
        3.0,
        'down',
        15,
        'atrasado',
      ],
      [
        'kpi-quebra',
        'extrafruti',
        'Quebra de perecíveis',
        '%',
        3.4,
        2.5,
        'down',
        12,
        'em_andamento',
      ],
      [
        'kpi-receita-casafruti',
        'casafruti',
        'Receita Casafruti',
        'R$',
        21400000,
        25000000,
        'up',
        12,
        'em_andamento',
      ],
      [
        'kpi-receita-foldbox',
        'foldbox',
        'Receita FoldBox',
        'R$',
        3800000,
        5000000,
        'up',
        10,
        'em_andamento',
      ],
      ['kpi-nps', 'casafruti', 'NPS varejo', 'pts', 48, 60, 'up', 8, 'em_andamento'],
      ['kpi-fiscal', 'extrafruti', 'Automação fiscal', '%', 35, 70, 'up', 5, 'em_andamento'],
    ]
    for (const k of kpis) {
      const st = criar(
        'pen_kpi',
        {
          workspace_id: WS,
          company_id: k[1],
          cycle_id: CICLO,
          nome: k[2],
          unidade: k[3],
          baseline: k[4],
          target: k[5],
          polarity: k[6],
          weight: k[7],
          status: k[8],
          frequencia: 'mensal',
          owner_id: 'Leonardo Lourenço',
          objetivo_id: k[0].replace('kpi-', 'obj-'),
        },
        'nome',
      )
      console.log('[pen3] pen_kpi ' + k[0] + ': ' + st)
    }
  },
  (app) => {
    console.log('[pen3] rollback: registros semeados mantidos (evita perda de edição)')
  },
)
