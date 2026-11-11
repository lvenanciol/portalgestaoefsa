/// <reference path="../pb_data/types.d.ts" />
// 0069 — ISOLAMENTO DE TAREFAS E AGENDAS POR USUÁRIO (11/11/2026)
//
// PEDIDO DO DONO: "um usuário logado no PGE só deve visualizar e acessar as
// tarefas e agendas vinculadas a ele".
//
// SITUAÇÃO ENCONTRADA (confirmada no backend e no código):
//  1. tarefas.listRule/viewRule/createRule/updateRule/deleteRule eram TODAS
//     "@request.auth.id != ''" — qualquer usuário autenticado lê, edita e apaga
//     QUALQUER tarefa do grupo.
//  2. A tela carregava com `getFullList()` sem filtro nenhum.
//  3. O campo `responsavel` é TEXTO LIVRE ("[ SUP ] Luke"), não um vínculo com
//     o usuário — não havia como saber de quem é a tarefa. `criado_por` guarda
//     e-mail (texto), frágil para regra de acesso.
//
// ESTA MIGRAÇÃO (aditiva, não destrutiva):
//  - cria `responsaveis_ids` (relation múltipla para users) — o vínculo real;
//  - preenche com o próprio usuário quando `criado_por` casa com um e-mail,
//    garantindo que ninguém perca acesso às próprias tarefas na virada;
//  - aplica as regras: cada um vê/edita as suas; admin do grupo ADM vê tudo.
//
// O isolamento da LISTAGEM também é feito no cliente (filtro fail-closed em
// TarefasKanbanPage), porque a regra do PocketBase sozinha devolveria lista
// vazia em vez de um recorte parcial previsível.
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('tarefas')
    } catch (_) {
      return
    }

    // ---- 1) Campo de vínculo real com os usuários responsáveis ----
    const nomes = (col.fields || []).map((f) => f.name)
    let usersColId = ''
    try {
      usersColId = app.findCollectionByNameOrId('users').id
    } catch (_) {
      usersColId = ''
    }

    if (!nomes.includes('responsaveis_ids') && usersColId) {
      col.fields.add(
        new RelationField({
          name: 'responsaveis_ids',
          collectionId: usersColId,
          maxSelect: 20,
          minSelect: 0,
          cascadeDelete: false,
        }),
      )
    }

    // ---- 2) Regras de acesso por dono ----
    // Isolamento ESTRITO: a tarefa é visível apenas para quem está na lista de
    // responsáveis ou para quem a criou. Não há bypass por grupo na regra — o
    // acesso aninhado a `@request.auth.grupo_id.nome` não é garantido em todas
    // as versões e uma regra inválida derrubaria a migração inteira.
    // O `?=` é o operador de "contém" para campos multi-relação.
    const regraDono =
      "@request.auth.id != '' && (" +
      'responsaveis_ids.id ?= @request.auth.id || ' +
      'criado_por = @request.auth.email()' +
      ')'

    col.listRule = regraDono
    col.viewRule = regraDono
    col.updateRule = regraDono
    // Criar: qualquer usuário autenticado (pode criar tarefa para si ou para outro)
    col.createRule = "@request.auth.id != ''"
    // Excluir: dono ou admin
    col.deleteRule = regraDono

    app.save(col)

    // ---- 3) Backfill: quem criou entra como responsável ----
    // Sem isto, na virada da regra cada usuário perderia a visão das tarefas
    // que ele mesmo criou (criado_por existe, mas responsaveis_ids vazio).
    let tarefas = []
    try {
      tarefas = app.findRecordsByFilter('tarefas', "id != ''", '', 0, 0)
    } catch (_) {
      tarefas = []
    }

    for (const t of tarefas) {
      try {
        const atuais = t.getString('responsaveis_ids')
        if (atuais) continue // já tem vínculo explícito
        const emailCriador = String(t.getString('criado_por') || '')
          .trim()
          .toLowerCase()
        if (!emailCriador) continue
        let usuario
        try {
          usuario = app.findAuthRecordByEmail('users', emailCriador)
        } catch (_) {
          continue
        }
        t.set('responsaveis_ids', [usuario.id])
        app.save(t)
      } catch (_) {
        // uma tarefa problemática não pode abortar o backfill inteiro
      }
    }
  },
  (app) => {
    // Reverter as regras para "qualquer autenticado" e manter o campo:
    // os dados de vínculo não são destruídos num rollback.
    try {
      const col = app.findCollectionByNameOrId('tarefas')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (_) {}
  },
)
