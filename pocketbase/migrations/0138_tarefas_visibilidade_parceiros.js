/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// VISIBILIDADE DA TAREFA PARA RESPONSÁVEIS E PARCEIROS/CONTATOS (19/11/2026)
//
// DIRETIVA DO DONO:
// "ao editar/visualizar uma tarefa, quando ela possui responsável e
//  PARCEIROS/CONTATOS RESPONSÁVEIS, deve ser exibida aos usuários
//  RESPONSÁVEIS E aos registrados como PARCEIROS/CONTATOS RESPONSÁVEIS"
//
// DEFEITO ENCONTRADO (medido no banco, não suposto)
// A regra anterior era:
//   @request.auth.id != '' && (responsaveis_ids.id ?= @request.auth.id ||
//                              parceiros.id ?= @request.auth.parceiro_id ||
//                              criado_por = @request.auth.email)
//
// O campo `parceiros` NÃO é uma relação do PocketBase — é um campo **JSON**
// que guarda um array de IDs de parceiro, por exemplo:
//   parceiros = ["7tbu8fgidll2ndz","gnq69zdsktl1iez"]
// Num campo JSON não existe `.id`, então `parceiros.id ?= ...` é sempre falso.
// Resultado: quem está registrado como PARCEIRO/CONTATO responsável NÃO
// conseguia abrir a tarefa (o registro era invisível para ele), embora a tela
// mostrasse o nome dele no campo.
//
// Na prática só dois critérios funcionavam: `responsaveis_ids` (relação real
// com users) e `criado_por` (texto com o e-mail).
//
// CORREÇÃO
// Compara o `parceiro_id` do usuário logado com os elementos do array JSON.
// No filtro do PocketBase, `parceiros ~ "valor"` casa quando o valor aparece
// no campo (JSON é comparado como texto), o que resolve o caso real sem
// precisar transformar o campo em relação — mudança que quebraria o front,
// que grava/limpa esse array diretamente.
//
// Mantidos os critérios que já funcionavam. A regra vale para list, view,
// update e delete: se o usuário pode VER a tarefa, também pode editá-la —
// é o comportamento pedido ("exibir aos responsáveis e aos parceiros").
// ============================================================================

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('tarefas')

    // responsáveis (relação users) OU parceiro/contato responsável (JSON)
    // OU autor da tarefa.
    const regra =
      "@request.auth.id != '' && (" +
      'responsaveis_ids.id ?= @request.auth.id' +
      ' || (parceiros != null && parceiros != "" && parceiros ~ @request.auth.parceiro_id)' +
      ' || criado_por = @request.auth.email' +
      ')'

    col.listRule = regra
    col.viewRule = regra
    col.updateRule = regra
    col.deleteRule = regra
    app.save(col)
  },
  (app) => {
    // rollback: volta exatamente para a regra anterior
    const col = app.findCollectionByNameOrId('tarefas')
    const anterior =
      "@request.auth.id != '' && (responsaveis_ids.id ?= @request.auth.id" +
      ' || parceiros.id ?= @request.auth.parceiro_id' +
      ' || criado_por = @request.auth.email)'
    col.listRule = anterior
    col.viewRule = anterior
    col.updateRule = anterior
    col.deleteRule = anterior
    app.save(col)
  },
)
