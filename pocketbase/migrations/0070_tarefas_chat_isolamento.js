/// <reference path="../pb_data/types.d.ts" />
// 0070 — FECHA O VAZAMENTO DE TAREFAS (isolamento do chat + visão do Admin)
//
// BURACOS ENCONTRADOS (11/11/2026):
//  1. `tarefas_chat` tinha TODAS as regras em "@request.auth.id != ''": qualquer
//     usuário autenticado lia/editava/apagava o chat (com anexos) de QUALQUER
//     tarefa — incluindo tarefas que a regra de `tarefas` já esconde. O
//     isolamento da tarefa vazava por aqui.
//  2. A 0069 deixou `tarefas` estritamente por dono, sem bypass de grupo. Só
//     que a TELA trata o grupo Admin como "vê todas" — então o admin pedia
//     getFullList e recebia só as próprias tarefas (divergência tela × banco).
//
// CORREÇÃO:
//  - campo de relação real `tarefa` no chat (`tarefa_id` é texto, não serve
//    para regra de acesso) + backfill a partir de `tarefa_id`;
//  - regras do chat delegam para a tarefa pai (mesmo critério do dono);
//  - `tarefas` ganha o bypass do grupo Admin, alinhado à tela.
//
// Critério do dono: responsável na lista OU criador. Admin vê tudo.
migrate(
  (app) => {
    // ---- 1) Regras de `tarefas` com bypass do Admin ----
    const regraTarefa =
      '@request.auth.id != "" && (' +
      'responsaveis_ids.id ?= @request.auth.id || ' +
      'criado_por = @request.auth.email || ' +
      '@request.auth.grupo_id.nome = "Admin"' +
      ')'
    try {
      const t = app.findCollectionByNameOrId('tarefas')
      t.listRule = regraTarefa
      t.viewRule = regraTarefa
      t.updateRule = regraTarefa
      t.deleteRule = regraTarefa
      app.save(t)
    } catch (_) {}

    // ---- 2) Chat: campo de relação para a tarefa pai ----
    let col
    try {
      col = app.findCollectionByNameOrId('tarefas_chat')
    } catch (_) {
      return
    }
    let tarefasColId = ''
    try {
      tarefasColId = app.findCollectionByNameOrId('tarefas').id
    } catch (_) {
      return
    }

    const nomes = (col.fields || []).map((f) => f.name)
    if (!nomes.includes('tarefa')) {
      col.fields.add(
        new RelationField({
          name: 'tarefa',
          collectionId: tarefasColId,
          maxSelect: 1,
          minSelect: 0,
          cascadeDelete: true,
        }),
      )
    }

    // Regra única: o chat pertence à tarefa; só alcança quem alcança a tarefa.
    const regraChat =
      '@request.auth.id != "" && tarefa != "" && (' +
      'tarefa.responsaveis_ids.id ?= @request.auth.id || ' +
      'tarefa.criado_por = @request.auth.email || ' +
      '@request.auth.grupo_id.nome = "Admin"' +
      ')'
    col.listRule = regraChat
    col.viewRule = regraChat
    col.createRule = regraChat
    col.updateRule = regraChat
    col.deleteRule = regraChat
    app.save(col)

    // ---- 3) Backfill: liga cada mensagem existente à sua tarefa ----
    let msgs = []
    try {
      msgs = app.findRecordsByFilter('tarefas_chat', 'id != ""', '', 0, 0)
    } catch (_) {
      msgs = []
    }
    for (const m of msgs) {
      try {
        if (m.getString('tarefa')) continue
        const tid = String(m.getString('tarefa_id') || '').trim()
        if (!tid) continue
        const t = app.findRecordById('tarefas', tid)
        m.set('tarefa', t.id)
        app.save(m)
      } catch (_) {
        // mensagem órfã (tarefa apagada) — não derruba o backfill
      }
    }
  },
  (app) => {
    // Rollback: volta `tarefas` e o chat para "qualquer autenticado".
    // O campo `tarefa` e os vínculos são preservados (dado, não regra).
    try {
      const regra = '@request.auth.id != ""'
      const t = app.findCollectionByNameOrId('tarefas')
      t.listRule = regra
      t.viewRule = regra
      t.updateRule = regra
      t.deleteRule = regra
      app.save(t)
    } catch (_) {}
    try {
      const c = app.findCollectionByNameOrId('tarefas_chat')
      const regra = '@request.auth.id != ""'
      c.listRule = regra
      c.viewRule = regra
      c.createRule = regra
      c.updateRule = regra
      c.deleteRule = regra
      app.save(c)
    } catch (_) {}
  },
)
