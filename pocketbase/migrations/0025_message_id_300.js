// T0b fix (21/10) — emails_inbox.message_id: max 190 → 300 (IDs do Graph
// chegam a ~280 chars; truncados dão 404 no detalhe). E apaga os registros
// do Outlook com ID truncado — o próximo "Sincronizar caixa" re-importa
// com o ID completo (o Gmail usa IDs curtos, não é afetado).

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('emails_inbox')
    for (const f of col.fields) {
      if (f.name === 'message_id') f.max = 300
    }
    app.save(col)

    // limpa microsoft com id truncado (re-import no próximo sync)
    const rows = app.findRecordsByFilter('emails_inbox', 'provedor = "microsoft"', '', 0, 0)
    for (const r of rows) {
      if (r.getString('message_id').length >= 180) app.delete(r)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('emails_inbox')
    for (const f of col.fields) {
      if (f.name === 'message_id') f.max = 190
    }
    app.save(col)
  },
)
