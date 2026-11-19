/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// CHAT DA TAREFA — MÚLTIPLOS ANEXOS (19/11/2026)
//
// DIRETIVA DO DONO: "Permitir na caixa anexos anexar mais de 1 arquivo, sem
// substituir os já existentes."
//
// DEFEITO: o campo `anexo` da coleção `tarefas_chat` tinha **maxSelect = 1**.
// Como o PocketBase, num campo de arquivo com maxSelect=1, SUBSTITUI o valor
// anterior quando um novo é enviado, anexar um segundo arquivo apagava o
// primeiro — exatamente o comportamento relatado.
//
// CORREÇÃO: maxSelect = 10 (mantendo o limite de 10 MB por arquivo e a lista
// de mimeTypes já aceita). O front agora manda o mesmo campo `anexo` repetido
// no FormData, e a mensagem carrega todos.
//
// Campos de arquivo do PocketBase se editam pelo Field existente (não se cria
// um novo): uso `col.fields.getByName('anexo')` e ajusto o atributo.
// ============================================================================

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('tarefas_chat')
    const f = col.fields.getByName('anexo')
    if (f) {
      f.maxSelect = 10
      app.save(col)
    }
  },
  (app) => {
    // rollback: volta a permitir apenas um arquivo
    const col = app.findCollectionByNameOrId('tarefas_chat')
    const f = col.fields.getByName('anexo')
    if (f) {
      f.maxSelect = 1
      app.save(col)
    }
  },
)
