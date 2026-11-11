/// <reference path="../pb_data/types.d.ts" />
// 0063 — Vínculo de usuário do PGE com Parceiro/Contato cadastrado.
// Tarefa CAC (11/11/2026): ao criar/editar um usuário é possível buscar e
// vincular um parceiro de "Parceiros & Contatos". Campo opcional para não
// quebrar usuários já existentes.
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('users')
    } catch (e) {
      return // coleção users ainda não existe nesta ordem de migração
    }

    const garantir = (nome, criador) => {
      try {
        col.fields.getByName(nome)
      } catch (e) {
        col.fields.add(criador())
      }
    }

    garantir('parceiro_id', () => new TextField({ name: 'parceiro_id' }))
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('users')
      col.fields.removeByName('parceiro_id')
      app.save(col)
    } catch (e) {
      // nada a desfazer
    }
  },
)
