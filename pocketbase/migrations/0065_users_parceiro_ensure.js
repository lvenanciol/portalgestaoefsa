/// <reference path="../pb_data/types.d.ts" />
// 0065 — Garante o campo users.parceiro_id (tarefa CAC, 11/11/2026).
// A 0063 já deveria tê-lo criado; esta migração é idempotente e serve de rede
// de segurança: se por qualquer motivo a 0063 não tiver rodado (ou o campo
// tiver sido removido num restore), o vínculo usuário ↔ Parceiro/Contato
// continua funcionando em vez de ser descartado silenciosamente pelo hook.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    let existe = true
    try {
      col.fields.getByName('parceiro_id')
    } catch (e) {
      existe = false
    }
    if (!existe) {
      col.fields.add(new TextField({ name: 'parceiro_id' }))
      app.save(col)
    }
  },
  (app) => {
    // sem rollback: o campo é compartilhado com a 0063
  },
)
