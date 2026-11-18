/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FASE 1.1 — CONTRATO DE DADOS DO MÓDULO /pen (18/11/2026)
//
// Cria as 8 coleções do Plano Estratégico com:
//   · campos mínimos por tabela (workspace_id, company_id, cycle_id, owner_id,
//     baseline, target, polarity, weight, status, timestamps)
//   · pen_audit com user_id, tabela, registro_id, campo, valor_anterior,
//     valor_novo, justificativa
//   · RLS ATIVA em todas, com política obrigatória por workspace_id
//
// DECISÃO DE SEGURANÇA (TAREFA SEG): toda regra exige `workspace_id` igual ao
// do usuário autenticado. Nenhuma coleção fica com listRule = "" (aberta) nem
// com `@request.auth.id != ''` sozinho — essa forma não isola workspace e foi
// causa de vazamento em auditoria anterior. O workspace do usuário vem do
// campo `workspace_id` em `users`; sem esse campo, o usuário não lê nada.
//
// Sem UI nesta etapa — só estrutura e regra.
// ============================================================================

migrate(
  (app) => {
    // ------------------------------------------------------------------
    // helper: cria a coleção com os campos comuns e as regras por workspace
    // ------------------------------------------------------------------
    function criar(nome, camposExtras, indiceExtra) {
      let col = null
      try {
        col = app.findCollectionByNameOrId(nome)
        console.log('[pen] ' + nome + ' já existe — apenas conferindo regras')
      } catch (_) {
        col = null
      }

      if (!col) {
        col = new Collection({
          name: nome,
          type: 'base',
          // ---- RLS: política obrigatória por workspace_id ----
          listRule: '@request.auth.id != "" && workspace_id = @request.auth.workspace_id',
          viewRule: '@request.auth.id != "" && workspace_id = @request.auth.workspace_id',
          createRule: '@request.auth.id != "" && workspace_id = @request.auth.workspace_id',
          updateRule: '@request.auth.id != "" && workspace_id = @request.auth.workspace_id',
          deleteRule: '@request.auth.id != "" && workspace_id = @request.auth.workspace_id',
          fields: [
            // chaves de escopo (texto: aceitam o mesmo id usado no mock e na API)
            { name: 'workspace_id', type: 'text', required: true, max: 64 },
            { name: 'company_id', type: 'text', required: false, max: 64 },
            { name: 'cycle_id', type: 'text', required: false, max: 64 },
            // campos de negócio comuns
            { name: 'baseline', type: 'number', required: false },
            { name: 'target', type: 'number', required: false },
            { name: 'polarity', type: 'text', required: false, max: 20 },
            { name: 'weight', type: 'number', required: false },
            { name: 'status', type: 'text', required: false, max: 40 },
            // datas automáticas
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
            ...camposExtras,
          ],
        })
        app.save(col)
        console.log('[pen] criada: ' + nome)
        return
      }

      // já existia: garante as regras (idempotente)
      col.listRule = '@request.auth.id != "" && workspace_id = @request.auth.workspace_id'
      col.viewRule = '@request.auth.id != "" && workspace_id = @request.auth.workspace_id'
      col.createRule = '@request.auth.id != "" && workspace_id = @request.auth.workspace_id'
      col.updateRule = '@request.auth.id != "" && workspace_id = @request.auth.workspace_id'
      col.deleteRule = '@request.auth.id != "" && workspace_id = @request.auth.workspace_id'
      app.save(col)
      console.log('[pen] regras garantidas: ' + nome)
    }

    // ------------------------------------------------------------------
    // pen_company — empresas do workspace
    // ------------------------------------------------------------------
    criar('pen_company', [
      { name: 'nome', type: 'text', required: true, max: 120 },
      { name: 'sigla', type: 'text', required: false, max: 20 },
      { name: 'receita', type: 'number', required: false },
      { name: 'ebitda_pct', type: 'number', required: false },
      { name: 'headcount', type: 'number', required: false },
    ])

    // ------------------------------------------------------------------
    // pen_cycle — ciclos de planejamento
    // ------------------------------------------------------------------
    criar('pen_cycle', [
      { name: 'nome', type: 'text', required: true, max: 80 },
      { name: 'inicio', type: 'text', required: false, max: 10 },
      { name: 'fim', type: 'text', required: false, max: 10 },
    ])

    // ------------------------------------------------------------------
    // pen_objective — objetivos estratégicos
    // ------------------------------------------------------------------
    criar('pen_objective', [
      { name: 'titulo', type: 'text', required: true, max: 200 },
      { name: 'descricao', type: 'text', required: false, max: 2000 },
      { name: 'perspectiva', type: 'text', required: false, max: 40 },
      { name: 'owner_id', type: 'text', required: false, max: 120 },
    ])

    // ------------------------------------------------------------------
    // pen_kpi — indicadores
    // ------------------------------------------------------------------
    criar('pen_kpi', [
      { name: 'nome', type: 'text', required: true, max: 160 },
      { name: 'unidade', type: 'text', required: false, max: 24 },
      { name: 'frequencia', type: 'text', required: false, max: 24 },
      { name: 'owner_id', type: 'text', required: false, max: 120 },
      { name: 'objetivo_id', type: 'text', required: false, max: 64 },
    ])

    // ------------------------------------------------------------------
    // pen_initiative — iniciativas
    // ------------------------------------------------------------------
    criar('pen_initiative', [
      { name: 'titulo', type: 'text', required: true, max: 200 },
      { name: 'descricao', type: 'text', required: false, max: 2000 },
      { name: 'owner_id', type: 'text', required: false, max: 120 },
      { name: 'objetivo_id', type: 'text', required: false, max: 64 },
      { name: 'prazo', type: 'text', required: false, max: 10 },
      { name: 'progresso', type: 'number', required: false },
    ])

    // ------------------------------------------------------------------
    // pen_cause — causas (Ishikawa)
    // ------------------------------------------------------------------
    criar('pen_cause', [
      { name: 'descricao', type: 'text', required: true, max: 2000 },
      { name: 'categoria', type: 'text', required: false, max: 40 },
      { name: 'causa_raiz', type: 'bool', required: false },
      { name: 'owner_id', type: 'text', required: false, max: 120 },
      { name: 'desvio_id', type: 'text', required: false, max: 64 },
    ])

    // ------------------------------------------------------------------
    // pen_risk — RAID (riscos, premissas, issues, dependências)
    // ------------------------------------------------------------------
    criar('pen_risk', [
      { name: 'titulo', type: 'text', required: true, max: 200 },
      { name: 'tipo', type: 'text', required: false, max: 24 },
      { name: 'descricao', type: 'text', required: false, max: 2000 },
      { name: 'probabilidade', type: 'text', required: false, max: 20 },
      { name: 'impacto', type: 'text', required: false, max: 20 },
      { name: 'mitigacao', type: 'text', required: false, max: 2000 },
      { name: 'owner_id', type: 'text', required: false, max: 120 },
    ])

    // ------------------------------------------------------------------
    // pen_audit — trilha de auditoria (campos exigidos pela diretiva)
    // ------------------------------------------------------------------
    criar('pen_audit', [
      { name: 'user_id', type: 'text', required: true, max: 64 },
      { name: 'tabela', type: 'text', required: true, max: 60 },
      { name: 'registro_id', type: 'text', required: true, max: 64 },
      { name: 'campo', type: 'text', required: false, max: 60 },
      { name: 'valor_anterior', type: 'text', required: false, max: 4000 },
      { name: 'valor_novo', type: 'text', required: false, max: 4000 },
      { name: 'justificativa', type: 'text', required: false, max: 2000 },
    ])

    // ------------------------------------------------------------------
    // campo de workspace no usuário: base da política por workspace
    // ------------------------------------------------------------------
    try {
      const users = app.findCollectionByNameOrId('users')
      const nomes = []
      for (let i = 0; i < users.fields.length; i++) {
        nomes.push(String(users.fields[i].name || ''))
      }
      if (nomes.indexOf('workspace_id') < 0) {
        users.fields.add({ name: 'workspace_id', type: 'text', required: false, max: 64 })
        app.save(users)
        console.log('[pen] users.workspace_id criado')
      } else {
        console.log('[pen] users.workspace_id já existia')
      }
    } catch (e) {
      console.log('[pen] users: ' + String(e).slice(0, 140))
    }

    // ------------------------------------------------------------------
    // conferência: lista as coleções e imprime a regra vigente
    // ------------------------------------------------------------------
    const alvos = [
      'pen_company',
      'pen_cycle',
      'pen_objective',
      'pen_kpi',
      'pen_initiative',
      'pen_cause',
      'pen_risk',
      'pen_audit',
    ]
    for (const a of alvos) {
      try {
        const c = app.findCollectionByNameOrId(a)
        let nCampos = 0
        for (let i = 0; i < c.fields.length; i++) nCampos++
        console.log(
          '[pen] ' + a + ' | campos=' + nCampos + ' | listRule=' + String(c.listRule || 'ABERTA!'),
        )
      } catch (e) {
        console.log('[pen] FALHOU: ' + a + ' — ' + String(e).slice(0, 120))
      }
    }

    console.log('[pen] CONCLUÍDO — 8 coleções com RLS por workspace_id')
  },
  (app) => {
    const alvos = [
      'pen_audit',
      'pen_risk',
      'pen_cause',
      'pen_initiative',
      'pen_kpi',
      'pen_objective',
      'pen_cycle',
      'pen_company',
    ]
    for (const a of alvos) {
      try {
        const c = app.findCollectionByNameOrId(a)
        app.delete(c)
        console.log('[pen] removida: ' + a)
      } catch (_) {}
    }
  },
)
