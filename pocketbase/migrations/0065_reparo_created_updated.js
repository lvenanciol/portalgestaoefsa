/// <reference path="../pb_data/types.d.ts" />
// 0065 — REPARO das coleções `convencoes` e `seguros` (11/11/2026)
//
// CAUSA-RAIZ dos itens "os registros não aparecem na grade" (Convenções e Seguros):
// as coleções foram criadas pelas migrações 0060 e 0062 SEM os campos de sistema
// `created` e `updated`. Consequências medidas no backend do preview:
//
//   GET /api/collections/convencoes/records?sort=-created  -> 400
//   GET /api/collections/seguros/records?sort=-created     -> 400
//   GET .../records (sem sort)                             -> 200, porém totalItems 0
//
// Ou seja: o SELECT que a tela usa (`getFullList({ sort: '-created' })`) falha,
// o catch do carregamento devolve [], e a grade fica permanentemente vazia —
// inclusive para registros que existam. O create também não persiste porque o
// PocketBase não consegue carimbar created/updated no insert.
// Coleções equivalentes (alvaras, contratos, atas, audiencias) têm os dois campos
// e funcionam: é exatamente essa a diferença.
//
// Este migração adiciona os campos ausentes de forma IDEMPOTENTE — não mexe em
// dados, não recria coleção e não perde registro.
migrate(
  (app) => {
    const nomes = ['convencoes', 'seguros']

    for (const nome of nomes) {
      let collection
      try {
        collection = app.findCollectionByNameOrId(nome)
      } catch (_) {
        // Coleção inexistente neste ambiente: nada a reparar.
        continue
      }

      const existentes = (collection.fields || []).map((f) => f.name)
      let alterou = false

      // `created`: carimbo automático na criação, imutável.
      if (!existentes.includes('created')) {
        collection.fields.add(
          new AutodateField({
            name: 'created',
            onCreate: true,
            onUpdate: false,
          }),
        )
        alterou = true
      }

      // `updated`: carimbo automático na criação e em cada alteração.
      if (!existentes.includes('updated')) {
        collection.fields.add(
          new AutodateField({
            name: 'updated',
            onCreate: true,
            onUpdate: true,
          }),
        )
        alterou = true
      }

      if (alterou) {
        app.save(collection)
      }
    }
  },
  (app) => {
    // Sem rollback destrutivo: remover os campos de sistema apagaria os carimbos
    // de todos os registros existentes. O down é intencionalmente vazio.
  },
)
