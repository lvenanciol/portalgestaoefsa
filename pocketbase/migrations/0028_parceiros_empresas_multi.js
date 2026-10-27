migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('parceiros')
    if (!col.fields.getByName('empresas')) {
      col.fields.add(new JSONField({ name: 'empresas', maxSize: 2048 }))
      app.save(col)
    }

    // Backfill: preenche o campo empresas a partir do campo empresa legado se vazio
    const records = app.findRecordsByFilter('parceiros', '', '', 0, 0)
    for (const rec of records) {
      const empresasStr = rec.getString('empresas')
      if (!empresasStr || empresasStr === 'null' || empresasStr === '[]') {
        const emp = rec.getString('empresa')
        if (emp) {
          rec.set('empresas', JSON.stringify([emp]))
          app.save(rec)
        }
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('parceiros')
      const f = col.fields.getByName('empresas')
      if (f) {
        col.fields.remove(f)
        app.save(col)
      }
    } catch (_) {}
  },
)
