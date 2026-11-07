migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('alvaras')
    if (!col.fields.getByName('responsaveis')) {
      col.fields.add(new JSONField({ name: 'responsaveis', maxSize: 2000000 }))
      app.save(col)
    }
  },
  (app) => {
    // down: no-op seguro (o campo permanece; remoção destrutiva não é necessária)
  },
)
