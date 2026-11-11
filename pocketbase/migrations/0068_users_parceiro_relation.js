/// <reference path="../pb_data/types.d.ts" />
// 0068 — Vínculo usuário → parceiro de verdade (11/11/2026)
//
// PROBLEMA: "o parceiro vinculado no cadastro do usuário não está persistindo".
//
// CAUSA-RAIZ: o campo `parceiro_id` NUNCA foi criado na coleção `users`.
// A migração 0063_users_parceiro usava:
//
//     try { col.fields.getByName(nome) } catch (e) { col.fields.add(...) }
//
// `fields.getByName()` NÃO lança exceção quando o campo não existe — devolve
// nulo. O try/catch nunca disparava, o `add` nunca rodava e `app.save(col)` era
// salvo sem alteração. Resultado: migração "applied", campo inexistente.
//
// Com o campo ausente, `rec.set('parceiro_id', ...)` lançava dentro dos hooks
// de criar/editar, e um `catch (_) {}` defensivo ENGOLIA o erro: o usuário era
// salvo sem o vínculo, sem nenhuma mensagem.
//
// Esta migração cria o campo conferindo pelos NOMES já existentes (mesmo padrão
// da 0067, que funcionou). Escolha de tipo: RELATION para `parceiros`, e não
// texto — valida o id, permite `expand` e evita id órfão.
migrate(
  (app) => {
    let users
    try {
      users = app.findCollectionByNameOrId('users')
    } catch (_) {
      return
    }

    const nomes = (users.fields || []).map((f) => f.name)
    if (nomes.includes('parceiro_id')) return // já existe

    let parceiros
    try {
      parceiros = app.findCollectionByNameOrId('parceiros')
    } catch (_) {
      return // sem a coleção de parceiros não há como criar a relação
    }

    users.fields.add(
      new RelationField({
        name: 'parceiro_id',
        collectionId: parceiros.id,
        maxSelect: 1,
        minSelect: 0,
        cascadeDelete: false,
      }),
    )
    app.save(users)
  },
  (app) => {
    // Sem rollback destrutivo: o campo guarda vínculo de negócio.
  },
)
