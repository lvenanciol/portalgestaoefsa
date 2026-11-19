/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FILA DE E-MAIL — ADICIONA created / updated (19/11/2026)
//
// LIÇÃO JÁ REGISTRADA E REPETIDA AQUI: `new Collection({ fields: [...] })`
// NÃO cria os campos de sistema `created` e `updated`. Sem eles:
//   · a API devolve 400 em `?sort=-created`;
//   · `findRecordsByFilter(..., 'created', ...)` no cron lança
//     `invalid sort field "created"` e a fila NUNCA drena.
//
// Sintoma medido no log:
//   "[emails_fila] nada a fazer: GoError: invalid sort field \"created\""
//
// Correção: adicionar os dois AutodateField explicitamente.
// ============================================================================

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('emails_fila')
    if (!col.fields.getByName('created')) {
      col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
    }
    if (!col.fields.getByName('updated')) {
      col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('emails_fila')
    try {
      if (col.fields.getByName('created')) col.fields.removeByName('created')
      if (col.fields.getByName('updated')) col.fields.removeByName('updated')
      app.save(col)
    } catch (_) {}
  },
)
